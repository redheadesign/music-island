use std::io::{BufWriter, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

/// 日志行计数器，避免每次都读文件检查轮转
static LOG_LINE_COUNT: AtomicU32 = AtomicU32::new(0);
/// 缓存的日志文件句柄（避免每次打开/关闭文件）
static LOG_FILE: Mutex<Option<BufWriter<std::fs::File>>> = Mutex::new(None);

/// 日志文件大小上限（5MB），超过时自动裁剪
const MAX_LOG_SIZE_BYTES: u64 = 5 * 1024 * 1024;
/// 每 N 次写入检查一次文件大小
const SIZE_CHECK_INTERVAL: u32 = 200;
/// 轮转后保留的行数
const KEEP_LINES: usize = 2000;

/// 是否为开发环境（debug 构建 = true，release 构建 = false）
pub fn is_dev() -> bool {
    cfg!(debug_assertions)
}

/// 仅开发环境打印的日志（release 构建完全跳过，零开销）
/// 用于调试过程中的详细信息，生产环境不需要
pub fn debug_log_dev(msg: &str) {
    if is_dev() {
        debug_log(msg);
    }
}

/// 写入调试日志到文件（打包后可用）
/// 热路径安全：try_lock 拿不到锁就跳过，绝不阻塞音频线程
pub fn debug_log(msg: &str) {
    let now = chrono::Local::now();
    let timestamp = now.format("%Y-%m-%d %H:%M:%S%.3f");
    let line = format!("[{}] {}\n", timestamp, msg);

    // try_lock：音频线程拿不到锁就丢弃这条日志，避免阻塞
    let mut guard = match LOG_FILE.try_lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if guard.is_none() {
        let dir = std::env::temp_dir().join("meowmic");
        let _ = std::fs::create_dir_all(&dir);

        // 清理旧版日志文件（v0.2.16 之前直接放在 %TEMP% 下）
        let old_log = std::env::temp_dir().join("meowmic-debug.log");
        let _ = std::fs::remove_file(old_log);

        let log_path = dir.join("debug.log");
        let needs_bom = !log_path.exists();
        if let Ok(f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let mut writer = BufWriter::new(f);
            // 新文件写入 UTF-8 BOM，让 Windows 正确识别编码
            if needs_bom {
                let _ = writer.write_all(&[0xEF, 0xBB, 0xBF]);
            }
            *guard = Some(writer);
        }
    }
    if let Some(ref mut writer) = *guard {
        let _ = writer.write_all(line.as_bytes());
    }

    let count = LOG_LINE_COUNT.fetch_add(1, Ordering::Relaxed) + 1;

    // 每 SIZE_CHECK_INTERVAL 次写入检查文件大小，超过上限时裁剪
    if count % SIZE_CHECK_INTERVAL == 0 {
        // 先 flush 确保文件大小准确
        if let Some(ref mut writer) = *guard {
            let _ = writer.flush();
        }
        drop(guard); // 释放锁后再做文件操作

        let log_path = std::env::temp_dir().join("meowmic").join("debug.log");
        if let Ok(meta) = std::fs::metadata(&log_path) {
            if meta.len() > MAX_LOG_SIZE_BYTES {
                trim_log_file(&log_path, KEEP_LINES * 2, KEEP_LINES);
            }
        }
    }
}

/// 重置日志文件句柄：flush + 关闭，下次 debug_log 会重新打开
/// 用于清理日志后让新日志写入新文件
#[allow(dead_code)]
pub fn reset_log_file() {
    let mut guard = LOG_FILE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(ref mut writer) = *guard {
        let _ = writer.flush();
    }
    *guard = None;
}

/// 引擎停止时调用：flush 剩余日志 + 按需轮转文件
pub fn flush_debug_log() {
    let mut guard = LOG_FILE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(ref mut writer) = *guard {
        let _ = writer.flush();
    }
    // 释放句柄后再轮转
    *guard = None;
    let log_path = std::env::temp_dir().join("meowmic").join("debug.log");
    if let Ok(meta) = std::fs::metadata(&log_path) {
        if meta.len() > MAX_LOG_SIZE_BYTES {
            trim_log_file(&log_path, KEEP_LINES * 2, KEEP_LINES);
        }
    }
}

/// 日志文件轮转：当文件超限时，只保留最后 keep_lines 行
fn trim_log_file(path: &std::path::Path, max_lines: usize, keep_lines: usize) {
    use std::io::{BufRead, BufReader, Seek, SeekFrom, Write};
    let file = match std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
    {
        Ok(f) => f,
        Err(_) => return,
    };
    let reader = BufReader::new(&file);
    let lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
    if lines.len() <= max_lines {
        return;
    }
    let keep: Vec<&str> = lines
        .iter()
        .rev()
        .take(keep_lines)
        .rev()
        .map(|s| s.as_str())
        .collect();
    let mut file = file;
    file.seek(SeekFrom::Start(0)).ok();
    file.set_len(0).ok();
    for line in keep {
        let _ = writeln!(file, "{}", line);
    }
}
