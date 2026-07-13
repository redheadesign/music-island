pub mod health;

use health::{SmtcHealth, SmtcHealthSnapshot};
use serde::{Deserialize, Serialize};
use std::{
    sync::{OnceLock, RwLock},
    time::Instant,
};
use tauri::{AppHandle, Emitter};
use tokio::time::{sleep, timeout, Duration};

const ACTIVE_POLL_MS: u64 = 500;
const IDLE_POLL_MS: u64 = 2_000;
const DEGRADED_POLL_MS: u64 = 5_000;
const UNAVAILABLE_POLL_MS: u64 = 15_000;
const FULL_METADATA_EVERY: u32 = 4;
const PROBE_TIMEOUT: Duration = Duration::from_secs(4);

fn preferred_source_lock() -> &'static RwLock<Option<String>> {
    static PREFERRED: OnceLock<RwLock<Option<String>>> = OnceLock::new();
    PREFERRED.get_or_init(|| RwLock::new(None))
}

pub fn set_preferred_source(source: Option<String>) {
    *preferred_source_lock()
        .write()
        .expect("preferred source lock poisoned") = source;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSnapshot {
    pub has_session: bool,
    pub source_app_id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album_title: Option<String>,
    pub playback_status: PlaybackStatus,
    pub position_ms: Option<i64>,
    pub duration_ms: Option<i64>,
    pub can_seek: bool,
    pub can_go_next: bool,
    pub can_go_previous: bool,
    pub can_play: bool,
    pub can_pause: bool,
    pub can_like: bool,
    pub can_dislike: bool,
    pub is_liked: bool,
    pub is_disliked: bool,
    pub thumbnail_data_url: Option<String>,
    pub updated_at: String,
    pub provider: MediaProvider,
    pub smtc_health: SmtcHealth,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MediaProvider {
    Smtc,
    YandexDirect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSessionInfo {
    pub source_app_id: String,
    pub playback_status: PlaybackStatus,
    pub is_current: bool,
}

struct PollResult {
    snapshot: MediaSnapshot,
    session_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PlaybackStatus {
    NoSession,
    Closed,
    Opened,
    Changing,
    Stopped,
    Playing,
    Paused,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MediaCommand {
    Play,
    Pause,
    PlayPause,
    Next,
    Previous,
    Stop,
    Like,
    Dislike,
    Seek {
        #[serde(rename = "positionMs")]
        position_ms: i64,
    },
}

impl MediaSnapshot {
    pub fn no_session() -> Self {
        Self {
            has_session: false,
            source_app_id: None,
            title: None,
            artist: None,
            album_title: None,
            playback_status: PlaybackStatus::NoSession,
            position_ms: None,
            duration_ms: None,
            can_seek: false,
            can_go_next: false,
            can_go_previous: false,
            can_play: false,
            can_pause: false,
            can_like: false,
            can_dislike: false,
            is_liked: false,
            is_disliked: false,
            thumbnail_data_url: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
            provider: MediaProvider::Smtc,
            smtc_health: health::current().status,
        }
    }
}

pub fn start_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut previous_key = String::new();
        let mut last_good: Option<MediaSnapshot> = None;
        let mut miss_streak: u32 = 0;
        let mut poll_index: u32 = 0;
        let mut last_health = health::current();

        loop {
            if crate::yandex::is_connected() {
                match timeout(PROBE_TIMEOUT, crate::yandex::snapshot()).await {
                    Ok(Ok(snapshot)) => {
                        let key = snapshot_key(&snapshot);
                        if key != previous_key {
                            let _ = app.emit("media:update", snapshot.clone());
                            previous_key = key;
                        } else {
                            let _ = app.emit("timeline:update", snapshot.clone());
                        }
                        last_good = Some(snapshot);
                        sleep(Duration::from_millis(ACTIVE_POLL_MS)).await;
                        continue;
                    }
                    Ok(Err(error)) => crate::logging::append_event(&format!(
                        "direct Yandex probe failed, falling back to SMTC: {error}"
                    )),
                    Err(_) => crate::logging::append_event(
                        "direct Yandex probe timed out, falling back to SMTC",
                    ),
                }
            }

            let include_metadata = last_good.is_none() || poll_index % FULL_METADATA_EVERY == 0;
            poll_index = poll_index.wrapping_add(1);
            let started = Instant::now();
            let previous_for_poll = last_good.clone();
            let preferred_source = preferred_source_lock()
                .read()
                .expect("preferred source lock poisoned")
                .clone()
                .or_else(|| {
                    last_good
                        .as_ref()
                        .and_then(|snapshot| snapshot.source_app_id.clone())
                });
            let probe = timeout(
                PROBE_TIMEOUT,
                tauri::async_runtime::spawn_blocking(move || {
                    platform::poll_snapshot(
                        previous_for_poll.as_ref(),
                        preferred_source.as_deref(),
                        include_metadata,
                    )
                }),
            )
            .await;

            let (raw, next_health) = match probe {
                Ok(Ok(Ok(result))) => {
                    let health = health::record_success(
                        started.elapsed().as_millis() as u64,
                        result.session_count,
                    );
                    (result.snapshot, health)
                }
                Ok(Ok(Err(error))) => {
                    let message = format!("{error:#}");
                    crate::logging::append_event(&format!("SMTC probe failed: {message}"));
                    (
                        MediaSnapshot::no_session(),
                        health::record_failure(started.elapsed().as_millis() as u64, message),
                    )
                }
                Ok(Err(error)) => {
                    let message = format!("SMTC worker failed: {error}");
                    crate::logging::append_event(&message);
                    (
                        MediaSnapshot::no_session(),
                        health::record_failure(started.elapsed().as_millis() as u64, message),
                    )
                }
                Err(_) => {
                    let message =
                        format!("SMTC probe timed out after {}ms", PROBE_TIMEOUT.as_millis());
                    crate::logging::append_event(&message);
                    (
                        MediaSnapshot::no_session(),
                        health::record_failure(started.elapsed().as_millis() as u64, message),
                    )
                }
            };

            if next_health.status != last_health.status
                || next_health.consecutive_failures != last_health.consecutive_failures
            {
                let _ = app.emit("smtc:health", next_health.clone());
                last_health = next_health.clone();
            }

            let mut raw = raw;
            raw.smtc_health = next_health.status;
            let snapshot = if raw.has_session {
                last_good = Some(raw.clone());
                miss_streak = 0;
                raw
            } else if let Some(last) = last_good.clone() {
                miss_streak += 1;
                if miss_streak <= 5 && next_health.status != SmtcHealth::Unavailable {
                    let mut held = last;
                    held.playback_status = PlaybackStatus::Changing;
                    held.updated_at = chrono::Utc::now().to_rfc3339();
                    held.smtc_health = next_health.status;
                    held
                } else {
                    last_good = None;
                    miss_streak = 0;
                    raw
                }
            } else {
                raw
            };
            let key = snapshot_key(&snapshot);

            if key != previous_key {
                let _ = app.emit("media:update", snapshot.clone());
                previous_key = key;
            } else if snapshot.has_session {
                let _ = app.emit("timeline:update", snapshot.clone());
            }

            let delay_ms = match next_health.status {
                SmtcHealth::Unavailable => UNAVAILABLE_POLL_MS,
                SmtcHealth::Degraded => DEGRADED_POLL_MS,
                SmtcHealth::Healthy if snapshot.has_session => ACTIVE_POLL_MS,
                SmtcHealth::Healthy => IDLE_POLL_MS,
            };
            sleep(Duration::from_millis(delay_ms)).await;
        }
    });
}

pub async fn current_snapshot() -> anyhow::Result<MediaSnapshot> {
    if crate::yandex::is_connected() {
        if let Ok(snapshot) = timeout(PROBE_TIMEOUT, crate::yandex::snapshot()).await {
            if let Ok(snapshot) = snapshot {
                return Ok(snapshot);
            }
        }
    }
    let started = Instant::now();
    let result = timeout(
        PROBE_TIMEOUT,
        tauri::async_runtime::spawn_blocking(|| platform::poll_snapshot(None, None, true)),
    )
    .await
    .map_err(|_| anyhow::anyhow!("SMTC snapshot timed out"))?
    .map_err(|error| anyhow::anyhow!("SMTC snapshot worker failed: {error}"))??;
    let health = health::record_success(started.elapsed().as_millis() as u64, result.session_count);
    let mut snapshot = result.snapshot;
    snapshot.smtc_health = health.status;
    Ok(snapshot)
}

pub async fn send_command(command: MediaCommand) -> anyhow::Result<()> {
    if crate::yandex::is_connected() {
        return crate::yandex::send_command(command).await;
    }
    platform::send_command(command).await
}

pub fn current_health() -> SmtcHealthSnapshot {
    health::current()
}

pub async fn list_sessions() -> anyhow::Result<Vec<MediaSessionInfo>> {
    timeout(
        PROBE_TIMEOUT,
        tauri::async_runtime::spawn_blocking(platform::list_sessions),
    )
    .await
    .map_err(|_| anyhow::anyhow!("SMTC session list timed out"))?
    .map_err(|error| anyhow::anyhow!("SMTC session list worker failed: {error}"))?
}

fn snapshot_key(snapshot: &MediaSnapshot) -> String {
    format!(
        "{}|{:?}|{}|{}|{}",
        snapshot.source_app_id.as_deref().unwrap_or_default(),
        snapshot.playback_status,
        snapshot.title.as_deref().unwrap_or_default(),
        snapshot.artist.as_deref().unwrap_or_default(),
        snapshot.duration_ms.unwrap_or_default()
    )
}

#[cfg(windows)]
mod platform {
    use super::{
        MediaCommand, MediaProvider, MediaSessionInfo, MediaSnapshot, PlaybackStatus, PollResult,
    };
    use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
    use tokio::sync::Mutex as AsyncMutex;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as SessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as NativePlaybackStatus,
    };

    pub fn poll_snapshot(
        previous: Option<&MediaSnapshot>,
        preferred_source: Option<&str>,
        include_metadata: bool,
    ) -> anyhow::Result<PollResult> {
        let manager = pollster::block_on(SessionManager::RequestAsync()?)?;
        let sessions = manager.GetSessions()?;
        let session_count = sessions.Size()?;
        let mut available = Vec::with_capacity(session_count as usize);
        for index in 0..session_count {
            available.push(sessions.GetAt(index)?);
        }
        let current_id = manager
            .GetCurrentSession()
            .ok()
            .and_then(|session| session.SourceAppUserModelId().ok())
            .map(|value| value.to_string_lossy());

        let session = choose_session(&available, preferred_source, current_id.as_deref())?;
        let Some(session) = session else {
            return Ok(PollResult {
                snapshot: MediaSnapshot::no_session(),
                session_count,
            });
        };

        let snapshot = read_session(session, previous, include_metadata)?;
        Ok(PollResult {
            snapshot,
            session_count,
        })
    }

    pub fn list_sessions() -> anyhow::Result<Vec<MediaSessionInfo>> {
        let manager = pollster::block_on(SessionManager::RequestAsync()?)?;
        let current_id = manager
            .GetCurrentSession()
            .ok()
            .and_then(|session| session.SourceAppUserModelId().ok())
            .map(|value| value.to_string_lossy());
        let sessions = manager.GetSessions()?;
        let mut result = Vec::with_capacity(sessions.Size()? as usize);
        for index in 0..sessions.Size()? {
            let session = sessions.GetAt(index)?;
            let source_app_id = session.SourceAppUserModelId()?.to_string_lossy();
            let playback_status = session
                .GetPlaybackInfo()
                .and_then(|info| info.PlaybackStatus())
                .map(map_playback_status)
                .unwrap_or(PlaybackStatus::Unknown);
            result.push(MediaSessionInfo {
                is_current: current_id.as_deref() == Some(source_app_id.as_str()),
                source_app_id,
                playback_status,
            });
        }
        Ok(result)
    }

    static SEEK_GENERATION: AtomicU64 = AtomicU64::new(0);
    static LATEST_SEEK_MS: AtomicI64 = AtomicI64::new(0);
    static SEEK_MUTEX: AsyncMutex<()> = AsyncMutex::const_new(());

    pub async fn send_command(command: MediaCommand) -> anyhow::Result<()> {
        if let MediaCommand::Seek { position_ms } = command {
            LATEST_SEEK_MS.store(position_ms, Ordering::SeqCst);
            let generation = SEEK_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
            run_seek(generation).await?;
            return Ok(());
        }

        let session = match current_session().await? {
            Some(session) => session,
            None => return Ok(()),
        };

        match command {
            MediaCommand::Play => {
                session.TryPlayAsync()?.await?;
            }
            MediaCommand::Pause => {
                session.TryPauseAsync()?.await?;
            }
            MediaCommand::PlayPause => {
                session.TryTogglePlayPauseAsync()?.await?;
            }
            MediaCommand::Next => {
                session.TrySkipNextAsync()?.await?;
            }
            MediaCommand::Previous => {
                session.TrySkipPreviousAsync()?.await?;
            }
            MediaCommand::Stop => {
                session.TryStopAsync()?.await?;
            }
            MediaCommand::Like | MediaCommand::Dislike => {
                anyhow::bail!("like controls are unavailable through Windows SMTC");
            }
            MediaCommand::Seek { .. } => unreachable!(),
        }

        Ok(())
    }

    async fn current_session() -> anyhow::Result<Option<Session>> {
        let manager = SessionManager::RequestAsync()?.await?;
        Ok(manager.GetCurrentSession().ok())
    }

    async fn run_seek(generation: u64) -> anyhow::Result<()> {
        let _guard = SEEK_MUTEX.lock().await;

        if SEEK_GENERATION.load(Ordering::SeqCst) != generation {
            return Ok(());
        }

        let position_ms = LATEST_SEEK_MS.load(Ordering::SeqCst);

        let session = match current_session().await? {
            Some(session) => session,
            None => return Ok(()),
        };

        if SEEK_GENERATION.load(Ordering::SeqCst) != generation {
            return Ok(());
        }

        let timeline = session.GetTimelineProperties()?;
        let start_ms = timespan_to_ms(timeline.StartTime()?);
        let seek_ticks = (start_ms + position_ms).saturating_mul(10_000);

        session.TryChangePlaybackPositionAsync(seek_ticks)?.await?;
        Ok(())
    }

    fn read_session(
        session: Session,
        previous: Option<&MediaSnapshot>,
        include_metadata: bool,
    ) -> anyhow::Result<MediaSnapshot> {
        let source_app_id = optional_string(session.SourceAppUserModelId()?.to_string_lossy());
        let playback = session.GetPlaybackInfo()?;
        let controls = playback.Controls()?;
        let timeline = session.GetTimelineProperties()?;
        let start_ms = timespan_to_ms(timeline.StartTime()?);
        let position_ms = (timespan_to_ms(timeline.Position()?) - start_ms).max(0);
        let duration_ms = (timespan_to_ms(timeline.EndTime()?) - start_ms).max(0);
        let updated_at = datetime_to_rfc3339(timeline.LastUpdatedTime()?);

        let can_reuse_metadata = previous.and_then(|snapshot| snapshot.source_app_id.as_deref())
            == source_app_id.as_deref();
        let (title, artist, album_title, thumbnail_data_url) =
            if !include_metadata && can_reuse_metadata {
                let previous = previous.expect("metadata reuse requires previous snapshot");
                (
                    previous.title.clone(),
                    previous.artist.clone(),
                    previous.album_title.clone(),
                    previous.thumbnail_data_url.clone(),
                )
            } else {
                let properties = pollster::block_on(session.TryGetMediaPropertiesAsync()?)?;
                let title = optional_string(properties.Title()?.to_string_lossy());
                let artist = optional_string(properties.Artist()?.to_string_lossy());
                let album_title = optional_string(properties.AlbumTitle()?.to_string_lossy());
                let track_unchanged = previous.is_some_and(|snapshot| {
                    snapshot.source_app_id == source_app_id
                        && snapshot.title == title
                        && snapshot.artist == artist
                        && snapshot.duration_ms == Some(duration_ms)
                });
                let thumbnail = if track_unchanged {
                    previous.and_then(|snapshot| snapshot.thumbnail_data_url.clone())
                } else {
                    read_thumbnail_data_url(&properties)
                };
                (title, artist, album_title, thumbnail)
            };

        Ok(MediaSnapshot {
            has_session: true,
            source_app_id,
            title,
            artist,
            album_title,
            playback_status: map_playback_status(playback.PlaybackStatus()?),
            position_ms: Some(position_ms),
            duration_ms: Some(duration_ms),
            can_seek: controls.IsPlaybackPositionEnabled()?,
            can_go_next: controls.IsNextEnabled()?,
            can_go_previous: controls.IsPreviousEnabled()?,
            can_play: controls.IsPlayEnabled()?,
            can_pause: controls.IsPauseEnabled()?,
            can_like: false,
            can_dislike: false,
            is_liked: false,
            is_disliked: false,
            thumbnail_data_url,
            updated_at,
            provider: MediaProvider::Smtc,
            smtc_health: super::health::current().status,
        })
    }

    fn choose_session(
        sessions: &[Session],
        preferred_source: Option<&str>,
        current_source: Option<&str>,
    ) -> anyhow::Result<Option<Session>> {
        let mut current = None;
        let mut first_playing = None;
        let mut first = None;

        for session in sessions {
            let source = session.SourceAppUserModelId()?.to_string_lossy();
            if first.is_none() {
                first = Some(session.clone());
            }
            let is_playing = session
                .GetPlaybackInfo()
                .and_then(|info| info.PlaybackStatus())
                .map(|status| status == NativePlaybackStatus::Playing)
                .unwrap_or(false);
            if preferred_source == Some(source.as_str()) && is_playing {
                return Ok(Some(session.clone()));
            }
            if current_source == Some(source.as_str()) {
                current = Some(session.clone());
            }
            if is_playing && first_playing.is_none() {
                first_playing = Some(session.clone());
            }
        }

        Ok(first_playing.or(current).or(first))
    }

    fn datetime_to_rfc3339(value: windows::Foundation::DateTime) -> String {
        const WINDOWS_EPOCH_OFFSET_100NS: i64 = 116_444_736_000_000_000;
        let unix_ms = (value.UniversalTime - WINDOWS_EPOCH_OFFSET_100NS) / 10_000;
        chrono::DateTime::from_timestamp_millis(unix_ms)
            .map(|value| value.to_rfc3339())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339())
    }

    fn optional_string(value: String) -> Option<String> {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }

    fn timespan_to_ms(value: windows::Foundation::TimeSpan) -> i64 {
        value.Duration / 10_000
    }

    fn read_thumbnail_data_url(
        properties: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
    ) -> Option<String> {
        use base64::Engine;
        use windows::Storage::Streams::{Buffer, DataReader, InputStreamOptions};

        let thumbnail = properties.Thumbnail().ok()?;
        let stream = pollster::block_on(thumbnail.OpenReadAsync().ok()?).ok()?;
        let size = stream.Size().ok()?.min(5_000_000) as u32;
        if size == 0 {
            return None;
        }

        let buffer = Buffer::Create(size).ok()?;
        let read_operation = stream
            .ReadAsync(&buffer, size, InputStreamOptions::ReadAhead)
            .ok()?;
        let read_buffer = pollster::block_on(read_operation).ok()?;
        let length = read_buffer.Length().ok()?;
        if length == 0 {
            return None;
        }

        let reader = DataReader::FromBuffer(&read_buffer).ok()?;
        let mut bytes = vec![0; length as usize];
        reader.ReadBytes(&mut bytes).ok()?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        Some(format!("data:image/jpeg;base64,{encoded}"))
    }

    fn map_playback_status(status: NativePlaybackStatus) -> PlaybackStatus {
        match status {
            NativePlaybackStatus::Closed => PlaybackStatus::Closed,
            NativePlaybackStatus::Opened => PlaybackStatus::Opened,
            NativePlaybackStatus::Changing => PlaybackStatus::Changing,
            NativePlaybackStatus::Stopped => PlaybackStatus::Stopped,
            NativePlaybackStatus::Playing => PlaybackStatus::Playing,
            NativePlaybackStatus::Paused => PlaybackStatus::Paused,
            _ => PlaybackStatus::Unknown,
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::{MediaCommand, MediaSessionInfo, MediaSnapshot, PollResult};

    pub fn poll_snapshot(
        _previous: Option<&MediaSnapshot>,
        _preferred_source: Option<&str>,
        _include_metadata: bool,
    ) -> anyhow::Result<PollResult> {
        Ok(PollResult {
            snapshot: MediaSnapshot::no_session(),
            session_count: 0,
        })
    }

    pub fn list_sessions() -> anyhow::Result<Vec<MediaSessionInfo>> {
        Ok(Vec::new())
    }

    pub async fn send_command(_command: MediaCommand) -> anyhow::Result<()> {
        Ok(())
    }
}
