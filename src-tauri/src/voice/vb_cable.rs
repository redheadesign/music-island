//! Detect / install / uninstall VB-Cable (Windows virtual audio driver).
//! No VoiceMeeter. No visible curl console — download is manual via browser.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VirtualRouteStatus {
    pub cable_installed: bool,
    pub cable_input: Option<String>,
    pub cable_output: Option<String>,
    pub has_voicemeeter: bool,
    pub voicemeeter_input: Option<String>,
}

fn list_names(direction: &wasapi::Direction) -> Vec<String> {
    let _ = wasapi::initialize_mta().ok();
    let Ok(enumerator) = wasapi::DeviceEnumerator::new() else {
        return Vec::new();
    };
    let Ok(collection) = enumerator.get_device_collection(direction) else {
        return Vec::new();
    };
    let count = collection.get_nbr_devices().unwrap_or(0);
    let mut out = Vec::new();
    for i in 0..count {
        if let Ok(device) = collection.get_device_at_index(i) {
            if let Ok(name) = device.get_friendlyname() {
                out.push(name);
            }
        }
    }
    out
}

pub fn virtual_route_status() -> VirtualRouteStatus {
    let renders = list_names(&wasapi::Direction::Render);
    let captures = list_names(&wasapi::Direction::Capture);

    let cable_input = renders
        .iter()
        .find(|n| n.to_ascii_lowercase().contains("cable input"))
        .cloned();
    let cable_output = captures
        .iter()
        .find(|n| n.to_ascii_lowercase().contains("cable output"))
        .cloned();

    VirtualRouteStatus {
        cable_installed: cable_input.is_some() || cable_output.is_some(),
        cable_input,
        cable_output,
        has_voicemeeter: false,
        voicemeeter_input: None,
    }
}

fn candidate_roots(resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(dir) = resource_dir {
        roots.push(dir.join("vb-cable"));
        roots.push(dir.to_path_buf());
    }
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
    roots.push(PathBuf::from(&manifest_dir).join("resources").join("voice").join("vb-cable"));
    roots.push(PathBuf::from(&manifest_dir).join("resources").join("vb-cable"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.join("resources").join("voice").join("vb-cable"));
            roots.push(parent.join("resources").join("vb-cable"));
        }
    }
    // Cached manual download location
    roots.push(std::env::temp_dir().join("music-island-vb-cable"));
    roots
}

fn find_setup_exe(resource_dir: Option<&Path>) -> Option<PathBuf> {
    for root in candidate_roots(resource_dir) {
        for candidate in [
            root.join("VBCABLE_Setup_x64.exe"),
            root.join("vb-cable").join("VBCABLE_Setup_x64.exe"),
        ] {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

fn find_inf(resource_dir: Option<&Path>) -> Option<PathBuf> {
    const NAMES: &[&str] = &[
        "vbMmeCable64_win10.inf",
        "vbMmeCable64_win7.inf",
        "vbMmeCable64_vista.inf",
        "vbMmeCable64_2003.inf",
    ];
    for root in candidate_roots(resource_dir) {
        let dir = if root.ends_with("vb-cable") || root.ends_with("music-island-vb-cable") {
            root
        } else {
            root.join("vb-cable")
        };
        for name in NAMES {
            let p = dir.join(name);
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}

fn run_setup_elevated(setup: &Path) -> Result<i32, String> {
    let setup_str = setup.to_str().ok_or("Invalid setup path")?;
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    #[cfg(windows)]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args([
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-Command",
        &format!(
            "$p = Start-Process -FilePath '{}' -Verb RunAs -PassThru -Wait; if ($null -eq $p) {{ exit 1223 }}; exit $p.ExitCode",
            setup_str.replace('\'', "''")
        ),
    ]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to launch installer: {e}"))?;
    Ok(output.status.code().unwrap_or(-1))
}

fn install_via_inf(inf: &Path) -> Result<i32, String> {
    let inf_str = inf.to_str().ok_or("Invalid INF path")?;
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    #[cfg(windows)]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args([
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-Command",
        &format!(
            "$p = Start-Process -FilePath 'pnputil.exe' -ArgumentList @('/add-driver','{}','/install') -Verb RunAs -PassThru -Wait; if ($null -eq $p) {{ exit 1223 }}; exit $p.ExitCode",
            inf_str.replace('\'', "''")
        ),
    ]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to install driver: {e}"))?;
    Ok(output.status.code().unwrap_or(-1))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub ok: bool,
    pub cable_installed: bool,
    pub message: String,
    pub needs_reboot: bool,
}

fn poll_cable_installed() -> bool {
    for _ in 0..8 {
        if virtual_route_status().cable_installed {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(400));
    }
    false
}

fn finish_after_install(code: i32) -> InstallResult {
    if code == 1223 {
        return InstallResult {
            ok: false,
            cable_installed: false,
            message: "Установка отменена (UAC).".into(),
            needs_reboot: false,
        };
    }

    let installed = poll_cable_installed();
    if installed {
        InstallResult {
            ok: true,
            cable_installed: true,
            message: "Виртуальный микрофон установлен. Выбери выход CABLE Input, в Discord/Zoom — микрофон CABLE Output.".into(),
            needs_reboot: false,
        }
    } else {
        // Never claim success if endpoints are missing — installer UI ≠ devices present.
        InstallResult {
            ok: false,
            cable_installed: false,
            message: "Установщик закрылся, но CABLE Input/Output в Windows пока нет. Обычно нужен ребут. После перезагрузки открой настройки снова — если устройств нет, поставь драйвер вручную со страницы загрузки.".into(),
            needs_reboot: true,
        }
    }
}

pub fn install(resource_dir: Option<&Path>) -> Result<InstallResult, String> {
    let before = virtual_route_status();
    if before.cable_installed {
        return Ok(InstallResult {
            ok: true,
            cable_installed: true,
            message: "Виртуальный микрофон уже установлен (CABLE).".into(),
            needs_reboot: false,
        });
    }

    // 1) Local / cached official setup — no network, no console flash.
    if let Some(setup) = find_setup_exe(resource_dir) {
        let code = run_setup_elevated(&setup)?;
        return Ok(finish_after_install(code));
    }

    // 2) Bundled INF via pnputil (offline).
    if let Some(inf) = find_inf(resource_dir) {
        match install_via_inf(&inf) {
            Ok(code) => return Ok(finish_after_install(code)),
            Err(err) => log::warn!("pnputil install failed: {err}"),
        }
    }

    // 3) No silent curl download — it hung / flashed a console and often 404'd.
    Err(
        "Автоустановка недоступна (нет локального установщика). Нажми «Открыть страницу загрузки», поставь VB-Cable, перезагрузи Windows — отдельная программа потом не нужна."
            .into(),
    )
}

pub fn uninstall(resource_dir: Option<&Path>) -> Result<InstallResult, String> {
    let before = virtual_route_status();
    if !before.cable_installed {
        return Ok(InstallResult {
            ok: true,
            cable_installed: false,
            message: "Виртуальный микрофон не найден среди устройств.".into(),
            needs_reboot: false,
        });
    }

    let Some(setup) = find_setup_exe(resource_dir) else {
        return Err(
            "Чтобы удалить CABLE, нужен установщик VB-Cable. Открой страницу загрузки и в установщике выбери Remove."
                .into(),
        );
    };

    let code = run_setup_elevated(&setup)?;
    if code == 1223 {
        return Ok(InstallResult {
            ok: false,
            cable_installed: true,
            message: "Удаление отменено (UAC).".into(),
            needs_reboot: false,
        });
    }

    let still = poll_cable_installed();
    Ok(InstallResult {
        ok: true,
        cable_installed: still,
        message: if still {
            "В окне установщика выбери Remove / Uninstall, затем перезагрузи Windows.".into()
        } else {
            "Виртуальный микрофон снят. Перезагрузи Windows, чтобы дочистить драйвер.".into()
        },
        needs_reboot: true,
    })
}
