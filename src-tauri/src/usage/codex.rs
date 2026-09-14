use std::{
    env, fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

use serde_json::{json, Value};

use super::model::{clamp_percent, window_label, ProbeData, ProbeError, UsageWindow};

const RPC_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_LINE_BYTES: usize = 256 * 1024;
const MAX_MESSAGES: usize = 96;

struct ChildGuard(Child);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

pub(crate) fn probe() -> Result<ProbeData, ProbeError> {
    let executable = find_codex_executable().ok_or(ProbeError::NotInstalled)?;
    let _source_kind = executable.kind;
    let mut command = Command::new(executable.path);
    command
        .args(["app-server", "--stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn().map_err(|_| ProbeError::NotInstalled)?;

    let mut stdin = child.stdin.take().ok_or(ProbeError::Protocol)?;
    let stdout = child.stdout.take().ok_or(ProbeError::Protocol)?;
    let _guard = ChildGuard(child);
    let (sender, receiver) = mpsc::sync_channel::<Result<Vec<u8>, ProbeError>>(8);
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let next = read_bounded_line(&mut reader);
            let done = matches!(&next, Ok(bytes) if bytes.is_empty()) || next.is_err();
            if sender.send(next).is_err() || done {
                break;
            }
        }
    });

    let deadline = Instant::now() + RPC_TIMEOUT;
    write_message(
        &mut stdin,
        &json!({
            "method": "initialize",
            "id": 1,
            "params": {
                "clientInfo": {"name": "music-island", "title": "Music Island", "version": env!("CARGO_PKG_VERSION")},
                "capabilities": {"experimentalApi": false}
            }
        }),
    )?;
    response_for(&receiver, 1, deadline)?;
    write_message(&mut stdin, &json!({"method": "initialized"}))?;
    write_message(
        &mut stdin,
        &json!({
            "method": "account/rateLimits/read",
            "id": 2,
            "params": {"excludeResetCreditDetails": true}
        }),
    )?;
    let limits = response_for(&receiver, 2, deadline)?;
    parse_rate_limits(&limits)
}

fn write_message(stdin: &mut impl Write, value: &Value) -> Result<(), ProbeError> {
    serde_json::to_writer(&mut *stdin, value).map_err(|_| ProbeError::Protocol)?;
    stdin.write_all(b"\n").map_err(|_| ProbeError::Protocol)?;
    stdin.flush().map_err(|_| ProbeError::Protocol)
}

fn response_for(
    receiver: &mpsc::Receiver<Result<Vec<u8>, ProbeError>>,
    id: i64,
    deadline: Instant,
) -> Result<Value, ProbeError> {
    for _ in 0..MAX_MESSAGES {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(ProbeError::Timeout);
        }
        let bytes = receiver
            .recv_timeout(remaining)
            .map_err(|error| match error {
                mpsc::RecvTimeoutError::Timeout => ProbeError::Timeout,
                mpsc::RecvTimeoutError::Disconnected => ProbeError::Protocol,
            })??;
        if bytes.is_empty() {
            return Err(ProbeError::Protocol);
        }
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| ProbeError::Protocol)?;
        if value.get("id").and_then(Value::as_i64) != Some(id) {
            continue;
        }
        if let Some(error) = value.get("error") {
            let auth_related =
                error
                    .get("message")
                    .and_then(Value::as_str)
                    .is_some_and(|message| {
                        let lower = message.to_ascii_lowercase();
                        lower.contains("auth")
                            || lower.contains("login")
                            || lower.contains("unauthorized")
                    });
            return Err(if auth_related {
                ProbeError::NeedsAuth
            } else {
                ProbeError::Protocol
            });
        }
        return value.get("result").cloned().ok_or(ProbeError::Protocol);
    }
    Err(ProbeError::Protocol)
}

fn read_bounded_line(reader: &mut impl BufRead) -> Result<Vec<u8>, ProbeError> {
    let mut output = Vec::new();
    loop {
        let available = reader.fill_buf().map_err(|_| ProbeError::Protocol)?;
        if available.is_empty() {
            return Ok(output);
        }
        let end = available.iter().position(|byte| *byte == b'\n');
        let take = end.map_or(available.len(), |index| index + 1);
        if output.len() + take > MAX_LINE_BYTES {
            return Err(ProbeError::Protocol);
        }
        output.extend_from_slice(&available[..take]);
        reader.consume(take);
        if end.is_some() {
            return Ok(output);
        }
    }
}

pub(crate) fn parse_rate_limits(result: &Value) -> Result<ProbeData, ProbeError> {
    let snapshot = result
        .get("rateLimitsByLimitId")
        .and_then(|map| map.get("codex"))
        .or_else(|| result.get("rateLimits"))
        .ok_or(ProbeError::NoData)?;

    let mut windows = Vec::new();
    for (id, fallback) in [("primary", "Primary"), ("secondary", "Secondary")] {
        let Some(window) = snapshot.get(id).filter(|value| value.is_object()) else {
            continue;
        };
        let used = window
            .get("usedPercent")
            .and_then(Value::as_f64)
            .and_then(clamp_percent);
        let duration = window.get("windowDurationMins").and_then(Value::as_u64);
        if used.is_none() && duration.is_none() && window.get("resetsAt").is_none() {
            continue;
        }
        windows.push(UsageWindow {
            id: id.to_string(),
            label: window_label(duration, fallback),
            used_percent: used,
            remaining_percent: used.map(|value| 100.0 - value),
            window_duration_minutes: duration,
            resets_at: window.get("resetsAt").and_then(Value::as_i64),
        });
    }
    if windows.is_empty() {
        return Err(ProbeError::NoData);
    }
    Ok(ProbeData {
        windows,
        plan: snapshot
            .get("planType")
            .and_then(Value::as_str)
            .and_then(sanitize_plan),
    })
}

fn sanitize_plan(value: &str) -> Option<String> {
    let sanitized: String = value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ' ')
        })
        .take(32)
        .collect();
    (!sanitized.is_empty()).then_some(sanitized)
}

#[derive(Clone, Copy, Debug)]
enum CodexDiscoveryKind {
    Path,
    InstallDirectory,
}

struct DiscoveredCodex {
    path: PathBuf,
    kind: CodexDiscoveryKind,
}

fn find_codex_executable() -> Option<DiscoveredCodex> {
    let mut candidates = Vec::new();
    if let Some(local) = env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        for relative in ["OpenAI/Codex/bin/codex.exe"] {
            candidates.push((local.join(relative), CodexDiscoveryKind::InstallDirectory));
        }
        let mut search_budget = 512;
        collect_named_files(
            &local.join("OpenAI/Codex"),
            4,
            &mut search_budget,
            &mut candidates,
        );
        collect_named_files(
            &local.join("Programs/Codex"),
            4,
            &mut search_budget,
            &mut candidates,
        );
    }
    if let Some(profile) = env::var_os("USERPROFILE").map(PathBuf::from) {
        candidates.push((
            profile.join(".codex/bin/codex.exe"),
            CodexDiscoveryKind::InstallDirectory,
        ));
    }
    if let Some(path) = env::var_os("PATH") {
        candidates.extend(
            env::split_paths(&path)
                .map(|directory| (directory.join("codex.exe"), CodexDiscoveryKind::Path)),
        );
    }
    candidates.into_iter().find_map(|(candidate, kind)| {
        candidate
            .is_file()
            .then(|| fs::canonicalize(candidate).ok())
            .flatten()
            .filter(|path| path.is_absolute())
            .map(|path| DiscoveredCodex { path, kind })
    })
}

fn collect_named_files(
    root: &Path,
    depth: usize,
    budget: &mut usize,
    output: &mut Vec<(PathBuf, CodexDiscoveryKind)>,
) {
    if depth == 0 || *budget == 0 {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        if *budget == 0 {
            break;
        }
        *budget -= 1;
        let path = entry.path();
        if path.is_file()
            && path
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("codex.exe"))
            && path.components().any(|component| {
                let value = component.as_os_str();
                value.eq_ignore_ascii_case("bin") || value.eq_ignore_ascii_case("resources")
            })
        {
            output.push((path, CodexDiscoveryKind::InstallDirectory));
        } else if path.is_dir() {
            collect_named_files(&path, depth - 1, budget, output);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_named_codex_bucket_and_keeps_null_reset() {
        let parsed = parse_rate_limits(&json!({
            "rateLimits": {"primary": {"usedPercent": 99, "windowDurationMins": 5}},
            "rateLimitsByLimitId": {"codex": {
                "planType": "plus",
                "primary": {"usedPercent": 25, "windowDurationMins": 300, "resetsAt": null},
                "secondary": {"usedPercent": 140, "windowDurationMins": 10080, "resetsAt": 1234}
            }}
        }))
        .unwrap();
        assert_eq!(parsed.windows[0].remaining_percent, Some(75.0));
        assert_eq!(parsed.windows[0].resets_at, None);
        assert_eq!(parsed.windows[1].remaining_percent, Some(0.0));
    }

    #[test]
    fn rejects_missing_buckets_instead_of_inventing_zero() {
        assert!(matches!(
            parse_rate_limits(&json!({"rateLimits": {}})),
            Err(ProbeError::NoData)
        ));
    }

    #[test]
    #[ignore = "requires explicit consent and an installed, signed-in Codex"]
    fn probe_installed_codex() {
        let discovery = find_codex_executable().expect("installed Codex executable not found");
        println!("discovery={:?}", discovery.kind);
        let result = probe().expect("installed Codex app-server probe failed");
        println!("plan={:?} windows={}", result.plan, result.windows.len());
        for window in result.windows {
            println!(
                "window={} remaining={:?} reset={:?}",
                window.label, window.remaining_percent, window.resets_at
            );
        }
    }
}
