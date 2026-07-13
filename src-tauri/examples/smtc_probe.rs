//! GSMTC probe: `cargo run --example smtc_probe -q`

#[cfg(windows)]
fn main() {
    pollster::block_on(run());
}

#[cfg(not(windows))]
fn main() {
    eprintln!("Windows only");
}

#[cfg(windows)]
async fn run() {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as SessionManager;

    println!(
        "=== GSMTC RUST PROBE {} ===",
        chrono::Utc::now().to_rfc3339()
    );

    let manager = match SessionManager::RequestAsync() {
        Ok(op) => match op.await {
            Ok(m) => m,
            Err(e) => {
                println!("RequestAsync().await ERROR: {e}");
                return;
            }
        },
        Err(e) => {
            println!("RequestAsync ERROR: {e}");
            return;
        }
    };

    match manager.GetSessions() {
        Ok(list) => println!("session_count: {}", list.Size().unwrap_or(0)),
        Err(e) => println!("GetSessions ERROR: {e}"),
    }

    match manager.GetCurrentSession() {
        Ok(s) => dump_session("CURRENT", &s),
        Err(e) => println!("GetCurrentSession ERROR: {e}"),
    }

    if let Ok(list) = manager.GetSessions() {
        let size = list.Size().unwrap_or(0);
        for i in 0..size {
            if let Ok(s) = list.GetAt(i) {
                dump_session(&format!("SESSION[{i}]"), &s);
            }
        }
    }
}

#[cfg(windows)]
fn dump_session(
    label: &str,
    session: &windows::Media::Control::GlobalSystemMediaTransportControlsSession,
) {
    let app = session
        .SourceAppUserModelId()
        .map(|s| s.to_string())
        .unwrap_or_else(|_| "?".into());
    let status = session
        .GetPlaybackInfo()
        .ok()
        .and_then(|p| p.PlaybackStatus().ok())
        .map(|s| format!("{s:?}"))
        .unwrap_or_else(|| "?".into());

    let (pos_ms, dur_ms) = session
        .GetTimelineProperties()
        .ok()
        .map(|tl| {
            let start = tl.StartTime().map(|t| t.Duration / 10_000).unwrap_or(0);
            let pos = tl.Position().map(|t| t.Duration / 10_000).unwrap_or(0) - start;
            let dur = tl.EndTime().map(|t| t.Duration / 10_000).unwrap_or(0) - start;
            (pos, dur)
        })
        .unwrap_or((0, 0));

    print!("{label} app={app} status={status} pos_ms={pos_ms} dur_ms={dur_ms}");

    match session.TryGetMediaPropertiesAsync() {
        Ok(op) => match pollster::block_on(op) {
            Ok(props) => {
                let title = props.Title().map(|s| s.to_string()).unwrap_or_default();
                let artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
                print!(" title='{title}' artist='{artist}'");
                if props.Thumbnail().is_ok() {
                    print!(" thumb=present");
                } else {
                    print!(" thumb=none");
                }
            }
            Err(e) => print!(" meta_async_ERROR={e}"),
        },
        Err(e) => print!(" meta_ERROR={e}"),
    }
    println!();
}
