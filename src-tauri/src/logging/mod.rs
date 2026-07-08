use chrono::Utc;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
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
