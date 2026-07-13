use chrono::Utc;
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
        append_event(&format!("panic captured: {panic_info}"));
        tracing::error!("panic captured: {panic_info}");
    }));
}

pub fn append_event(message: &str) {
    if let Err(error) = write_event(message) {
        tracing::error!("failed to write local log: {error}");
    }
}

pub fn append_event_rate_limited(key: &'static str, message: &str, interval: Duration) {
    static LAST_WRITES: OnceLock<Mutex<HashMap<&'static str, Instant>>> = OnceLock::new();
    let writes = LAST_WRITES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut writes = writes.lock().expect("log rate-limit lock poisoned");
    let now = Instant::now();
    if writes
        .get(key)
        .is_some_and(|last_write| now.duration_since(*last_write) < interval)
    {
        return;
    }
    writes.insert(key, now);
    drop(writes);
    append_event(message);
}

pub fn log_file_path() -> PathBuf {
    app_data_dir().join("logs").join("app.log")
}

fn write_event(message: &str) -> anyhow::Result<()> {
    let path = log_file_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(file, "{} {}", Utc::now().to_rfc3339(), message)?;
    Ok(())
}

fn app_data_dir() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("Music Island")
}
