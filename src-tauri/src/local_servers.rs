use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap},
    io,
    mem::{offset_of, size_of},
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    path::Path,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use windows::{
    core::{Owned, PWSTR},
    Win32::{
        Foundation::{
            ERROR_INSUFFICIENT_BUFFER, ERROR_NOT_SUPPORTED, FILETIME, HANDLE, WAIT_OBJECT_0,
            WAIT_TIMEOUT,
        },
        NetworkManagement::IpHelper::{
            GetExtendedTcpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCP6TABLE_OWNER_PID,
            MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_LISTENER,
        },
        Networking::WinSock::{ADDRESS_FAMILY, AF_INET, AF_INET6},
        Security::{
            GetLengthSid, GetTokenInformation, TokenUser, SECURITY_MAX_SID_SIZE, TOKEN_QUERY,
            TOKEN_USER,
        },
        System::Threading::{
            GetCurrentProcess, GetProcessTimes, OpenProcess, OpenProcessToken,
            QueryFullProcessImageNameW, TerminateProcess, WaitForSingleObject,
            PROCESS_ACCESS_RIGHTS, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
            PROCESS_SYNCHRONIZE, PROCESS_TERMINATE,
        },
    },
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalServer {
    id: String,
    pid: u32,
    process_name: String,
    host: String,
    port: u16,
    can_stop: bool,
}

#[tauri::command]
pub(crate) async fn list_local_servers(app: AppHandle) -> Result<Vec<LocalServer>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !enabled(&app)? {
            return Ok(Vec::new());
        }
        discover().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn open_local_server(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !enabled(&app)? {
            return Err("Local server widget is disabled".into());
        }
        let (_, address) = active_listener(&id, PROCESS_QUERY_LIMITED_INFORMATION)?;
        app.opener()
            .open_url(format!("http://{address}"), None::<&str>)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn stop_local_server(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !enabled(&app)? {
            return Err("Local server widget is disabled".into());
        }
        let access = PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE;
        let (process, _) = active_listener(&id, access)?;
        unsafe { TerminateProcess(*process, 1) }.map_err(|error| error.to_string())?;
        if unsafe { WaitForSingleObject(*process, 2_000) } != WAIT_OBJECT_0 {
            return Err("Local server process did not exit".into());
        }
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn enabled(app: &AppHandle) -> Result<bool, String> {
    let config = app
        .state::<crate::config::ConfigState>()
        .load()
        .map_err(|error| error.to_string())?;
    Ok(config
        .plugins
        .settings
        .get("ui")
        .and_then(|ui| ui.get("localServersEnabled"))
        .and_then(serde_json::Value::as_bool)
        == Some(true))
}

fn discover() -> io::Result<Vec<LocalServer>> {
    let current_user = process_user_sid(unsafe { GetCurrentProcess() })?;
    let mut processes = HashMap::new();
    let mut servers = Vec::new();
    for ((port, pid), ip) in listeners()? {
        if let Some((process, can_stop)) = processes.entry(pid).or_insert_with(|| {
            let (_handle, process) =
                dev_process(pid, PROCESS_QUERY_LIMITED_INFORMATION, &current_user)?;
            let can_stop = unsafe {
                OpenProcess(PROCESS_TERMINATE, false, pid).map(|handle| Owned::new(handle))
            }
            .is_ok();
            Some((process, can_stop))
        }) {
            let host = match ip {
                IpAddr::V4(ip) => ip.to_string(),
                IpAddr::V6(ip) => format!("[{ip}]"),
            };
            servers.push(LocalServer {
                id: format!("{pid}:{port}:{}", process.started_at),
                pid,
                process_name: process.name.clone(),
                host,
                port,
                can_stop: *can_stop,
            });
        }
    }
    Ok(servers)
}

fn active_listener(
    id: &str,
    access: PROCESS_ACCESS_RIGHTS,
) -> Result<(Owned<HANDLE>, SocketAddr), String> {
    let stale = || "Local server is no longer available".to_string();
    let (pid, remainder) = id.split_once(':').ok_or_else(stale)?;
    let (port, started_at) = remainder.split_once(':').ok_or_else(stale)?;
    let pid = pid.parse::<u32>().map_err(|_| stale())?;
    let port = port.parse::<u16>().map_err(|_| stale())?;
    let started_at = started_at.parse::<u64>().map_err(|_| stale())?;
    let current_user =
        process_user_sid(unsafe { GetCurrentProcess() }).map_err(|error| error.to_string())?;
    // Keep this handle through the action so PID reuse cannot redirect termination.
    let (process, identity) = dev_process(pid, access, &current_user).ok_or_else(stale)?;
    if identity.started_at != started_at {
        return Err(stale());
    }
    let ip = listeners()
        .map_err(|error| error.to_string())?
        .get(&(port, pid))
        .copied()
        .ok_or_else(stale)?;
    Ok((process, SocketAddr::new(ip, port)))
}

struct ProcessIdentity {
    name: String,
    started_at: u64,
}

fn dev_process(
    pid: u32,
    access: PROCESS_ACCESS_RIGHTS,
    current_user: &[u8],
) -> Option<(Owned<HANDLE>, ProcessIdentity)> {
    if pid == std::process::id() {
        return None;
    }
    let process =
        unsafe { Owned::new(OpenProcess(access | PROCESS_SYNCHRONIZE, false, pid).ok()?) };
    let name = process_name(*process)?;
    if !is_dev_runtime(&name) || process_user_sid(*process).ok()?.as_slice() != current_user {
        return None;
    }
    let (mut creation, mut exit, mut kernel, mut user) = (
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
    );
    unsafe { GetProcessTimes(*process, &mut creation, &mut exit, &mut kernel, &mut user).ok()? };
    if unsafe { WaitForSingleObject(*process, 0) } != WAIT_TIMEOUT {
        return None;
    }
    Some((
        process,
        ProcessIdentity {
            name,
            started_at: file_time(creation),
        },
    ))
}

fn process_name(process: HANDLE) -> Option<String> {
    let mut path = [0u16; 32_768];
    let mut len = path.len() as u32;
    unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut len,
        )
        .ok()?;
    }
    let path = String::from_utf16(path.get(..len as usize)?).ok()?;
    Path::new(&path).file_name()?.to_str().map(str::to_owned)
}

fn is_dev_runtime(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "node.exe"
            | "bun.exe"
            | "deno.exe"
            | "python.exe"
            | "python3.exe"
            | "pythonw.exe"
            | "ruby.exe"
            | "php.exe"
            | "uvicorn.exe"
            | "gunicorn.exe"
            | "java.exe"
            | "javaw.exe"
            | "dotnet.exe"
    )
}

fn file_time(time: FILETIME) -> u64 {
    (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime)
}

#[repr(C)]
struct UserTokenBuffer {
    user: TOKEN_USER,
    sid: [u8; SECURITY_MAX_SID_SIZE as usize],
}

fn process_user_sid(process: HANDLE) -> windows::core::Result<Vec<u8>> {
    let mut token = HANDLE::default();
    unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut token)? };
    let token = unsafe { Owned::new(token) };
    let mut buffer = UserTokenBuffer {
        user: TOKEN_USER::default(),
        sid: [0; SECURITY_MAX_SID_SIZE as usize],
    };
    let mut len = 0;
    // GetTokenInformation places the SID in this buffer. Copy its bytes before
    // returning so the token snapshot can outlive the buffer.
    unsafe {
        GetTokenInformation(
            *token,
            TokenUser,
            Some((&mut buffer as *mut UserTokenBuffer).cast()),
            size_of::<UserTokenBuffer>() as u32,
            &mut len,
        )?;
        let sid = buffer.user.User.Sid;
        Ok(std::slice::from_raw_parts(sid.0.cast::<u8>(), GetLengthSid(sid) as usize).to_vec())
    }
}

fn listeners() -> io::Result<BTreeMap<(u16, u32), IpAddr>> {
    let mut listeners = BTreeMap::new();
    // SAFETY: Each address family selects the matching OWNER_PID_LISTENER table.
    let ipv4 = unsafe {
        tcp_table::<MIB_TCPROW_OWNER_PID>(AF_INET, offset_of!(MIB_TCPTABLE_OWNER_PID, table))?
    };
    let ipv6 = unsafe {
        tcp_table::<MIB_TCP6ROW_OWNER_PID>(AF_INET6, offset_of!(MIB_TCP6TABLE_OWNER_PID, table))?
    };
    let ipv4 = ipv4.into_iter().map(|row| {
        (
            row.dwOwningPid,
            row.dwLocalPort,
            IpAddr::V4(Ipv4Addr::from(row.dwLocalAddr.to_ne_bytes())),
        )
    });
    let ipv6 = ipv6.into_iter().map(|row| {
        (
            row.dwOwningPid,
            row.dwLocalPort,
            IpAddr::V6(Ipv6Addr::from(row.ucLocalAddr)),
        )
    });
    for (pid, network_port, ip) in ipv4.chain(ipv6) {
        if let Some(ip) = loopback_endpoint(ip) {
            let [high, low, ..] = network_port.to_ne_bytes();
            let port = u16::from_be_bytes([high, low]);
            // Dual-stack listeners get one row, preferring IPv4 when both are present.
            let selected = listeners.entry((port, pid)).or_insert(ip);
            *selected = (*selected).min(ip);
        }
    }
    Ok(listeners)
}

fn loopback_endpoint(ip: IpAddr) -> Option<IpAddr> {
    let ip = match ip {
        IpAddr::V4(ip) if ip.is_unspecified() => IpAddr::V4(Ipv4Addr::LOCALHOST),
        IpAddr::V6(ip) if ip.is_unspecified() => IpAddr::V6(Ipv6Addr::LOCALHOST),
        IpAddr::V6(ip) => ip.to_ipv4_mapped().map_or(IpAddr::V6(ip), IpAddr::V4),
        ip => ip,
    };
    ip.is_loopback().then_some(ip)
}

/// `R` and `offset` must match the IP Helper table layout for `family`.
unsafe fn tcp_table<R: Copy>(family: ADDRESS_FAMILY, offset: usize) -> io::Result<Vec<R>> {
    let mut size = 4096;
    for _ in 0..4 {
        let mut buffer = vec![0u32; (size as usize).div_ceil(size_of::<u32>())];
        let status = unsafe {
            GetExtendedTcpTable(
                Some(buffer.as_mut_ptr().cast()),
                &mut size,
                false,
                u32::from(family.0),
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        };
        if status == ERROR_INSUFFICIENT_BUFFER.0 {
            continue;
        }
        if status == ERROR_NOT_SUPPORTED.0 && family == AF_INET6 {
            return Ok(Vec::new());
        }
        if status != 0 {
            return Err(io::Error::from_raw_os_error(status as i32));
        }
        let count = buffer[0] as usize;
        let available = (buffer.len() * size_of::<u32>()).saturating_sub(offset);
        if count > available / size_of::<R>() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Invalid TCP listener table",
            ));
        }
        let rows = unsafe { buffer.as_ptr().cast::<u8>().add(offset).cast::<R>() };
        return Ok((0..count)
            .map(|index| unsafe { rows.add(index).read_unaligned() })
            .collect());
    }
    Err(io::Error::from_raw_os_error(
        ERROR_INSUFFICIENT_BUFFER.0 as i32,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn discovers_native_ipv4_and_ipv6_listeners() {
        let ipv4 = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let ipv6 = TcpListener::bind((Ipv6Addr::LOCALHOST, 0)).unwrap();
        let snapshot = listeners().unwrap();
        for listener in [ipv4, ipv6] {
            let address = listener.local_addr().unwrap();
            assert_eq!(
                snapshot[&(address.port(), std::process::id())],
                address.ip()
            );
        }
    }

    #[test]
    fn only_loopback_and_wildcard_bindings_are_eligible() {
        assert_eq!(
            loopback_endpoint("0.0.0.0".parse().unwrap()),
            Some(Ipv4Addr::LOCALHOST.into())
        );
        assert_eq!(
            loopback_endpoint("::".parse().unwrap()),
            Some(Ipv6Addr::LOCALHOST.into())
        );
        assert_eq!(
            loopback_endpoint("::ffff:127.0.0.2".parse().unwrap()),
            Some("127.0.0.2".parse().unwrap())
        );
        assert_eq!(loopback_endpoint("192.168.0.3".parse().unwrap()), None);
        assert!(!is_dev_runtime("node-helper.exe"));
    }
}
