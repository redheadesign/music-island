//! Small local lifecycle log, independent of the host's optional log backend.
//! Callers must never pass dictated text, clipboard content or provider replies.
use std::{fs::OpenOptions, io::Write, sync::Mutex};

static WRITER: Mutex<()> = Mutex::new(());
const MAX_BYTES: u64 = 1_048_576;

pub(crate) fn event(message: &str) {
    let Ok(_guard) = WRITER.lock() else { return };
    let Some(root) = crate::portable::data_dir() else { return };
    let dir = root.join("logs");
    if std::fs::create_dir_all(&dir).is_err() { return }
    let path = dir.join("lifecycle.log");
    let full = std::fs::metadata(&path).is_ok_and(|meta| meta.len() >= MAX_BYTES);
    if let Ok(mut file) = OpenOptions::new().create(true).write(true)
        .append(!full).truncate(full).open(path) {
        let line: String = message.chars().take(1024)
            .map(|c| if c.is_control() { ' ' } else { c }).collect();
        let _ = writeln!(file, "{} {}", chrono::Utc::now().to_rfc3339(), line);
    }
}
