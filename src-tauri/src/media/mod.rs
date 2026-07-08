use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::time::{sleep, Duration};

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
    pub thumbnail_data_url: Option<String>,
    pub updated_at: String,
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
            thumbnail_data_url: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

pub fn start_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut previous_key = String::new();
        let mut last_good: Option<MediaSnapshot> = None;
        let mut miss_streak: u32 = 0;

        loop {
            let raw = current_snapshot()
                .await
                .unwrap_or_else(|_| MediaSnapshot::no_session());
            let snapshot = if raw.has_session {
                last_good = Some(raw.clone());
                miss_streak = 0;
                raw
            } else if let Some(last) = last_good.clone() {
                miss_streak += 1;
                if miss_streak <= 5 {
                    let mut held = last;
                    held.playback_status = PlaybackStatus::Changing;
                    held.updated_at = chrono::Utc::now().to_rfc3339();
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

            sleep(Duration::from_millis(if snapshot.has_session { 200 } else { 1500 })).await;
        }
    });
}

pub async fn current_snapshot() -> anyhow::Result<MediaSnapshot> {
    tauri::async_runtime::spawn_blocking(|| pollster::block_on(platform::current_snapshot()))
        .await
        .map_err(|error| anyhow::anyhow!("media snapshot worker failed: {error}"))?
}

pub async fn send_command(command: MediaCommand) -> anyhow::Result<()> {
    platform::send_command(command).await
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
    use super::{MediaCommand, MediaSnapshot, PlaybackStatus};
    use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
    use tokio::sync::Mutex as AsyncMutex;
    use tokio::time::{sleep, Duration};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as SessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as NativePlaybackStatus,
    };

    pub async fn current_snapshot() -> anyhow::Result<MediaSnapshot> {
        for attempt in 0..3 {
            let manager = SessionManager::RequestAsync()?.await?;
            if let Ok(session) = manager.GetCurrentSession() {
                return read_session(session).await;
            }

            if attempt < 2 {
                sleep(Duration::from_millis(60)).await;
            }
        }

        Ok(MediaSnapshot::no_session())
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

    async fn read_session(session: Session) -> anyhow::Result<MediaSnapshot> {
        let properties = session.TryGetMediaPropertiesAsync()?.await?;
        let playback = session.GetPlaybackInfo()?;
        let controls = playback.Controls()?;
        let timeline = session.GetTimelineProperties()?;
        let start_ms = timespan_to_ms(timeline.StartTime()?);
        let position_ms = (timespan_to_ms(timeline.Position()?) - start_ms).max(0);
        let duration_ms = (timespan_to_ms(timeline.EndTime()?) - start_ms).max(0);
        let updated_at = datetime_to_rfc3339(timeline.LastUpdatedTime()?);

        let thumbnail_data_url = read_thumbnail_data_url(&properties);

        Ok(MediaSnapshot {
            has_session: true,
            source_app_id: optional_string(session.SourceAppUserModelId()?.to_string_lossy()),
            title: optional_string(properties.Title()?.to_string_lossy()),
            artist: optional_string(properties.Artist()?.to_string_lossy()),
            album_title: optional_string(properties.AlbumTitle()?.to_string_lossy()),
            playback_status: map_playback_status(playback.PlaybackStatus()?),
            position_ms: Some(position_ms),
            duration_ms: Some(duration_ms),
            can_seek: controls.IsPlaybackPositionEnabled()?,
            can_go_next: controls.IsNextEnabled()?,
            can_go_previous: controls.IsPreviousEnabled()?,
            can_play: controls.IsPlayEnabled()?,
            can_pause: controls.IsPauseEnabled()?,
            thumbnail_data_url,
            updated_at,
        })
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
        let stream = pollster::block_on(async { thumbnail.OpenReadAsync().ok()?.await.ok() })?;
        let size = stream.Size().ok()?.min(5_000_000) as u32;
        if size == 0 {
            return None;
        }

        let buffer = Buffer::Create(size).ok()?;
        let read_operation = stream
            .ReadAsync(&buffer, size, InputStreamOptions::ReadAhead)
            .ok()?;
        let read_buffer = pollster::block_on(async { read_operation.await.ok() })?;
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
    use super::{MediaCommand, MediaSnapshot};

    pub async fn current_snapshot() -> anyhow::Result<MediaSnapshot> {
        Ok(MediaSnapshot::no_session())
    }

    pub async fn send_command(_command: MediaCommand) -> anyhow::Result<()> {
        Ok(())
    }
}
