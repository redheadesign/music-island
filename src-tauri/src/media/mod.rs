pub mod health;

use health::{SmtcHealth, SmtcHealthSnapshot};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        OnceLock, RwLock,
    },
    time::Instant,
};
use tauri::{AppHandle, Emitter};
use tokio::time::{sleep, timeout, Duration};

const ACTIVE_POLL_MS: u64 = 1_000;
const DIRECT_POLL_MS: u64 = 900;
const IDLE_POLL_MS: u64 = 2_000;
const DEGRADED_POLL_MS: u64 = 5_000;
const UNAVAILABLE_POLL_MS: u64 = 15_000;
const PASSIVE_SMTC_POLL_MS: u64 = 30_000;
const FULL_METADATA_EVERY: u32 = 4;
const PROBE_TIMEOUT: Duration = Duration::from_secs(4);
const DIRECT_STALE_MAX_FAILURES: u32 = 3;
const DIRECT_STALE_MAX_AGE: Duration = Duration::from_secs(10);

static SMTC_IN_FLIGHT: AtomicBool = AtomicBool::new(false);
static MEDIA_POLLS: AtomicU64 = AtomicU64::new(0);
static MEDIA_COMMANDS: AtomicU64 = AtomicU64::new(0);
static MEDIA_UPDATES: AtomicU64 = AtomicU64::new(0);
static TIMELINE_UPDATES: AtomicU64 = AtomicU64::new(0);
static SMTC_PROBES: AtomicU64 = AtomicU64::new(0);
static SMTC_PASSIVE_PROBES: AtomicU64 = AtomicU64::new(0);
static SMTC_BUSY_SKIPS: AtomicU64 = AtomicU64::new(0);
static PROVIDER_GENERATION: AtomicU64 = AtomicU64::new(0);

struct SmtcFlightGuard;

impl Drop for SmtcFlightGuard {
    fn drop(&mut self) {
        SMTC_IN_FLIGHT.store(false, Ordering::Release);
    }
}

fn try_smtc_flight() -> Option<SmtcFlightGuard> {
    if SMTC_IN_FLIGHT
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
    {
        Some(SmtcFlightGuard)
    } else {
        SMTC_BUSY_SKIPS.fetch_add(1, Ordering::Relaxed);
        None
    }
}

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
    pub track_id: Option<String>,
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
    pub active_wave_id: Option<String>,
    pub active_wave_title: Option<String>,
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

impl PartialEq for MediaProvider {
    fn eq(&self, other: &Self) -> bool {
        matches!(
            (self, other),
            (Self::Smtc, Self::Smtc) | (Self::YandexDirect, Self::YandexDirect)
        )
    }
}

impl Eq for MediaProvider {}

fn active_provider_lock() -> &'static RwLock<MediaProvider> {
    static ACTIVE: OnceLock<RwLock<MediaProvider>> = OnceLock::new();
    ACTIVE.get_or_init(|| RwLock::new(MediaProvider::Smtc))
}

pub fn set_active_provider(provider: MediaProvider) {
    let mut active = active_provider_lock()
        .write()
        .expect("active provider lock poisoned");
    if *active != provider {
        *active = provider;
        PROVIDER_GENERATION.fetch_add(1, Ordering::AcqRel);
    }
}

pub fn switch_active_provider(app: &AppHandle, provider: MediaProvider) {
    let previous = active_provider();
    set_active_provider(provider);
    if previous != provider {
        let _ = app.emit("media:update", MediaSnapshot::no_session_for(provider));
        MEDIA_UPDATES.fetch_add(1, Ordering::Relaxed);
    }
}

pub fn active_provider() -> MediaProvider {
    *active_provider_lock()
        .read()
        .expect("active provider lock poisoned")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetrics {
    pub active_provider: MediaProvider,
    pub polls: u64,
    pub commands: u64,
    pub media_updates: u64,
    pub timeline_updates: u64,
    pub smtc_probes: u64,
    pub smtc_passive_probes: u64,
    pub smtc_busy_skips: u64,
    pub smtc_in_flight: bool,
}

pub fn metrics() -> MediaMetrics {
    MediaMetrics {
        active_provider: active_provider(),
        polls: MEDIA_POLLS.load(Ordering::Relaxed),
        commands: MEDIA_COMMANDS.load(Ordering::Relaxed),
        media_updates: MEDIA_UPDATES.load(Ordering::Relaxed),
        timeline_updates: TIMELINE_UPDATES.load(Ordering::Relaxed),
        smtc_probes: SMTC_PROBES.load(Ordering::Relaxed),
        smtc_passive_probes: SMTC_PASSIVE_PROBES.load(Ordering::Relaxed),
        smtc_busy_skips: SMTC_BUSY_SKIPS.load(Ordering::Relaxed),
        smtc_in_flight: SMTC_IN_FLIGHT.load(Ordering::Acquire),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSessionInfo {
    pub source_app_id: String,
    pub playback_status: PlaybackStatus,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TimelineUpdate {
    position_ms: Option<i64>,
    duration_ms: Option<i64>,
    playback_status: PlaybackStatus,
    updated_at: String,
    provider: MediaProvider,
}

impl From<&MediaSnapshot> for TimelineUpdate {
    fn from(snapshot: &MediaSnapshot) -> Self {
        Self {
            position_ms: snapshot.position_ms,
            duration_ms: snapshot.duration_ms,
            playback_status: snapshot.playback_status.clone(),
            updated_at: snapshot.updated_at.clone(),
            provider: snapshot.provider,
        }
    }
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
        Self::no_session_for(MediaProvider::Smtc)
    }

    pub fn no_session_for(provider: MediaProvider) -> Self {
        Self {
            has_session: false,
            source_app_id: None,
            track_id: None,
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
            active_wave_id: None,
            active_wave_title: None,
            thumbnail_data_url: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
            provider,
            smtc_health: health::current().status,
        }
    }
}

pub fn start_watcher(app: AppHandle) {
    start_passive_smtc_watcher(app.clone());
    tauri::async_runtime::spawn(async move {
        let mut previous_key = String::new();
        let mut last_good: Option<MediaSnapshot> = None;
        let mut last_good_at: Option<Instant> = None;
        let mut direct_failure_streak: u32 = 0;
        let mut miss_streak: u32 = 0;
        let mut poll_index: u32 = 0;
        let mut last_health = health::current();
        let mut last_provider = active_provider();
        let mut last_direct_status = None;

        loop {
            MEDIA_POLLS.fetch_add(1, Ordering::Relaxed);
            let provider = active_provider();
            if provider != last_provider {
                previous_key.clear();
                last_good = None;
                last_good_at = None;
                direct_failure_streak = 0;
                miss_streak = 0;
                last_provider = provider;
            }

            if provider == MediaProvider::YandexDirect {
                let generation = PROVIDER_GENERATION.load(Ordering::Acquire);
                match timeout(PROBE_TIMEOUT, crate::yandex::snapshot()).await {
                    Ok(Ok(mut snapshot)) => {
                        if generation != PROVIDER_GENERATION.load(Ordering::Acquire) {
                            continue;
                        }
                        crate::yandex::record_probe_success();
                        preserve_same_track_metadata(last_good.as_ref(), &mut snapshot);
                        let key = snapshot_key(&snapshot);
                        if key != previous_key {
                            let _ = app.emit("media:update", snapshot.clone());
                            MEDIA_UPDATES.fetch_add(1, Ordering::Relaxed);
                            previous_key = key;
                        } else {
                            let _ = app.emit("timeline:update", TimelineUpdate::from(&snapshot));
                            TIMELINE_UPDATES.fetch_add(1, Ordering::Relaxed);
                        }
                        last_good = Some(snapshot);
                        last_good_at = Some(Instant::now());
                        direct_failure_streak = 0;
                        emit_direct_status_if_changed(&app, &mut last_direct_status);
                        sleep(Duration::from_millis(DIRECT_POLL_MS)).await;
                    }
                    Ok(Err(error)) => {
                        if generation != PROVIDER_GENERATION.load(Ordering::Acquire) {
                            continue;
                        }
                        crate::yandex::record_probe_failure(&error.to_string());
                        direct_failure_streak = direct_failure_streak.saturating_add(1);
                        crate::logging::append_event_rate_limited(
                            "direct-probe",
                            &format!("direct Yandex probe failed; retaining direct state: {error}"),
                            Duration::from_secs(15),
                        );
                        emit_direct_status_if_changed(&app, &mut last_direct_status);
                        if !retain_direct_stale(
                            last_good_at,
                            direct_failure_streak,
                            &crate::yandex::status().state,
                        ) {
                            last_good = None;
                            last_good_at = None;
                            let snapshot =
                                MediaSnapshot::no_session_for(MediaProvider::YandexDirect);
                            let key = snapshot_key(&snapshot);
                            if key != previous_key {
                                let _ = app.emit("media:update", snapshot);
                                MEDIA_UPDATES.fetch_add(1, Ordering::Relaxed);
                                previous_key = key;
                            }
                        }
                        sleep(Duration::from_millis(DEGRADED_POLL_MS.min(2_000))).await;
                    }
                    Err(_) => {
                        if generation != PROVIDER_GENERATION.load(Ordering::Acquire) {
                            continue;
                        }
                        crate::yandex::record_probe_failure("CDP probe timed out");
                        direct_failure_streak = direct_failure_streak.saturating_add(1);
                        crate::logging::append_event_rate_limited(
                            "direct-timeout",
                            "direct Yandex probe timed out; retaining direct state",
                            Duration::from_secs(15),
                        );
                        emit_direct_status_if_changed(&app, &mut last_direct_status);
                        if !retain_direct_stale(
                            last_good_at,
                            direct_failure_streak,
                            &crate::yandex::status().state,
                        ) {
                            last_good = None;
                            last_good_at = None;
                            let snapshot =
                                MediaSnapshot::no_session_for(MediaProvider::YandexDirect);
                            let key = snapshot_key(&snapshot);
                            if key != previous_key {
                                let _ = app.emit("media:update", snapshot);
                                MEDIA_UPDATES.fetch_add(1, Ordering::Relaxed);
                                previous_key = key;
                            }
                        }
                        sleep(Duration::from_millis(2_000)).await;
                    }
                }
                continue;
            }

            let generation = PROVIDER_GENERATION.load(Ordering::Acquire);
            let include_metadata =
                last_good.is_none() || poll_index.is_multiple_of(FULL_METADATA_EVERY);
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
            let probe = if let Some(guard) = try_smtc_flight() {
                SMTC_PROBES.fetch_add(1, Ordering::Relaxed);
                Some(
                    timeout(
                        PROBE_TIMEOUT,
                        tauri::async_runtime::spawn_blocking(move || {
                            let _guard = guard;
                            platform::poll_snapshot(
                                previous_for_poll.as_ref(),
                                preferred_source.as_deref(),
                                include_metadata,
                            )
                        }),
                    )
                    .await,
                )
            } else {
                None
            };

            let (raw, next_health) = match probe {
                None => {
                    sleep(Duration::from_millis(250)).await;
                    continue;
                }
                Some(Ok(Ok(Ok(result)))) => {
                    let health = health::record_success(
                        started.elapsed().as_millis() as u64,
                        result.session_count,
                    );
                    (result.snapshot, health)
                }
                Some(Ok(Ok(Err(error)))) => {
                    let message = format!("{error:#}");
                    crate::logging::append_event_rate_limited(
                        "smtc-probe",
                        &format!("SMTC probe failed: {message}"),
                        Duration::from_secs(15),
                    );
                    (
                        MediaSnapshot::no_session(),
                        health::record_failure(started.elapsed().as_millis() as u64, message),
                    )
                }
                Some(Ok(Err(error))) => {
                    let message = format!("SMTC worker failed: {error}");
                    crate::logging::append_event_rate_limited(
                        "smtc-worker",
                        &message,
                        Duration::from_secs(15),
                    );
                    (
                        MediaSnapshot::no_session(),
                        health::record_failure(started.elapsed().as_millis() as u64, message),
                    )
                }
                Some(Err(_)) => {
                    let message =
                        format!("SMTC probe timed out after {}ms", PROBE_TIMEOUT.as_millis());
                    crate::logging::append_event_rate_limited(
                        "smtc-timeout",
                        &message,
                        Duration::from_secs(15),
                    );
                    (
                        MediaSnapshot::no_session(),
                        health::record_failure(started.elapsed().as_millis() as u64, message),
                    )
                }
            };
            if generation != PROVIDER_GENERATION.load(Ordering::Acquire) {
                continue;
            }

            if next_health.status != last_health.status
                || next_health.consecutive_failures != last_health.consecutive_failures
            {
                let _ = app.emit("smtc:health", next_health.clone());
                last_health = next_health.clone();
            }

            let mut raw = raw;
            raw.smtc_health = next_health.status;
            preserve_same_track_metadata(last_good.as_ref(), &mut raw);
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
                MEDIA_UPDATES.fetch_add(1, Ordering::Relaxed);
                previous_key = key;
            } else if snapshot.has_session {
                let _ = app.emit("timeline:update", TimelineUpdate::from(&snapshot));
                TIMELINE_UPDATES.fetch_add(1, Ordering::Relaxed);
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

fn emit_direct_status_if_changed(
    app: &AppHandle,
    previous: &mut Option<crate::yandex::DirectYandexStatus>,
) {
    let next = crate::yandex::status();
    if previous.as_ref() != Some(&next) {
        let _ = app.emit("direct:status", next.clone());
        *previous = Some(next);
    }
}

fn start_passive_smtc_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            sleep(Duration::from_millis(PASSIVE_SMTC_POLL_MS)).await;
            if active_provider() != MediaProvider::YandexDirect {
                continue;
            }
            let Some(guard) = try_smtc_flight() else {
                continue;
            };
            SMTC_PASSIVE_PROBES.fetch_add(1, Ordering::Relaxed);
            let started = Instant::now();
            let probe = timeout(
                PROBE_TIMEOUT,
                tauri::async_runtime::spawn_blocking(move || {
                    let _guard = guard;
                    platform::poll_snapshot(None, None, false)
                }),
            )
            .await;
            let health = match probe {
                Ok(Ok(Ok(result))) => health::record_success(
                    started.elapsed().as_millis() as u64,
                    result.session_count,
                ),
                Ok(Ok(Err(error))) => health::record_failure(
                    started.elapsed().as_millis() as u64,
                    format!("{error:#}"),
                ),
                Ok(Err(error)) => health::record_failure(
                    started.elapsed().as_millis() as u64,
                    format!("SMTC passive worker failed: {error}"),
                ),
                Err(_) => health::record_failure(
                    started.elapsed().as_millis() as u64,
                    format!(
                        "SMTC passive probe timed out after {}ms",
                        PROBE_TIMEOUT.as_millis()
                    ),
                ),
            };
            let _ = app.emit("smtc:health", health);
        }
    });
}

pub async fn current_snapshot() -> anyhow::Result<MediaSnapshot> {
    MEDIA_POLLS.fetch_add(1, Ordering::Relaxed);
    if active_provider() == MediaProvider::YandexDirect {
        return match timeout(PROBE_TIMEOUT, crate::yandex::snapshot()).await {
            Ok(Ok(snapshot)) => {
                crate::yandex::record_probe_success();
                Ok(snapshot)
            }
            Ok(Err(error)) => {
                crate::yandex::record_probe_failure(&error.to_string());
                Ok(MediaSnapshot::no_session_for(MediaProvider::YandexDirect))
            }
            Err(_) => {
                crate::yandex::record_probe_failure("CDP snapshot timed out");
                Ok(MediaSnapshot::no_session_for(MediaProvider::YandexDirect))
            }
        };
    }
    let Some(guard) = try_smtc_flight() else {
        return Ok(MediaSnapshot::no_session());
    };
    SMTC_PROBES.fetch_add(1, Ordering::Relaxed);
    let started = Instant::now();
    let result = timeout(
        PROBE_TIMEOUT,
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = guard;
            platform::poll_snapshot(None, None, true)
        }),
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
    MEDIA_COMMANDS.fetch_add(1, Ordering::Relaxed);
    if active_provider() == MediaProvider::YandexDirect {
        return crate::yandex::send_command(command).await;
    }
    let Some(_guard) = try_smtc_flight() else {
        anyhow::bail!("SMTC is busy with an existing request");
    };
    SMTC_PROBES.fetch_add(1, Ordering::Relaxed);
    platform::send_command(command).await
}

pub fn current_health() -> SmtcHealthSnapshot {
    health::current()
}

pub async fn list_sessions() -> anyhow::Result<Vec<MediaSessionInfo>> {
    if active_provider() != MediaProvider::Smtc {
        return Ok(Vec::new());
    }
    let Some(guard) = try_smtc_flight() else {
        anyhow::bail!("SMTC session request is already in flight");
    };
    SMTC_PROBES.fetch_add(1, Ordering::Relaxed);
    timeout(
        PROBE_TIMEOUT,
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = guard;
            platform::list_sessions()
        }),
    )
    .await
    .map_err(|_| anyhow::anyhow!("SMTC session list timed out"))?
    .map_err(|error| anyhow::anyhow!("SMTC session list worker failed: {error}"))?
}

fn snapshot_key(snapshot: &MediaSnapshot) -> String {
    format!(
        "{}|{}|{:?}|{}|{}|{}|{}|{}|{}|{}",
        snapshot.source_app_id.as_deref().unwrap_or_default(),
        snapshot.track_id.as_deref().unwrap_or_default(),
        snapshot.playback_status,
        snapshot.title.as_deref().unwrap_or_default(),
        snapshot.artist.as_deref().unwrap_or_default(),
        snapshot.duration_ms.unwrap_or_default(),
        snapshot.is_liked,
        snapshot.is_disliked,
        snapshot.active_wave_id.as_deref().unwrap_or_default(),
        snapshot.active_wave_title.as_deref().unwrap_or_default()
    )
}

fn retain_direct_stale(
    last_good_at: Option<Instant>,
    failure_streak: u32,
    state: &crate::yandex::DirectYandexState,
) -> bool {
    let recoverable = matches!(
        state,
        crate::yandex::DirectYandexState::Connecting
            | crate::yandex::DirectYandexState::Connected
            | crate::yandex::DirectYandexState::Degraded
    );
    recoverable
        && failure_streak <= DIRECT_STALE_MAX_FAILURES
        && last_good_at.is_some_and(|at| at.elapsed() <= DIRECT_STALE_MAX_AGE)
}

fn preserve_same_track_metadata(previous: Option<&MediaSnapshot>, current: &mut MediaSnapshot) {
    let Some(previous) = previous else {
        return;
    };
    let status_only = matches!(
        current.playback_status,
        PlaybackStatus::Paused
            | PlaybackStatus::Changing
            | PlaybackStatus::Opened
            | PlaybackStatus::Stopped
    );
    let identity_matches = current.source_app_id == previous.source_app_id
        && match (&current.track_id, &previous.track_id) {
            (Some(current), Some(previous)) => current == previous,
            (None, None) => current.duration_ms == previous.duration_ms,
            _ => false,
        };
    let no_conflicting_metadata = current.title.is_none() || current.title == previous.title;
    if !status_only || !identity_matches || !no_conflicting_metadata {
        return;
    }
    if current.title.is_none() {
        current.title = previous.title.clone();
    }
    if current.artist.is_none() {
        current.artist = previous.artist.clone();
    }
    if current.album_title.is_none() {
        current.album_title = previous.album_title.clone();
    }
    if current.thumbnail_data_url.is_none() {
        current.thumbnail_data_url = previous.thumbnail_data_url.clone();
    }
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
            track_id: None,
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
            active_wave_id: None,
            active_wave_title: None,
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

#[cfg(test)]
mod routing_tests {
    use super::*;

    fn snapshot() -> MediaSnapshot {
        MediaSnapshot {
            has_session: true,
            source_app_id: Some("test.player".into()),
            track_id: Some("track-1".into()),
            title: Some("Title".into()),
            artist: Some("Artist".into()),
            album_title: Some("Album".into()),
            playback_status: PlaybackStatus::Playing,
            position_ms: Some(1_000),
            duration_ms: Some(10_000),
            can_seek: true,
            can_go_next: true,
            can_go_previous: true,
            can_play: true,
            can_pause: true,
            can_like: true,
            can_dislike: true,
            is_liked: false,
            is_disliked: false,
            active_wave_id: None,
            active_wave_title: None,
            thumbnail_data_url: Some("data:image/jpeg;base64,test".into()),
            updated_at: "now".into(),
            provider: MediaProvider::YandexDirect,
            smtc_health: SmtcHealth::Healthy,
        }
    }

    #[test]
    fn configured_provider_remains_authoritative_without_a_session() {
        set_active_provider(MediaProvider::YandexDirect);
        let snapshot = MediaSnapshot::no_session_for(active_provider());
        assert_eq!(snapshot.provider, MediaProvider::YandexDirect);
        assert!(!snapshot.has_session);
        set_active_provider(MediaProvider::Smtc);
    }

    #[test]
    fn smtc_work_is_single_flight() {
        let first = try_smtc_flight().expect("first SMTC worker");
        assert!(try_smtc_flight().is_none());
        drop(first);
        assert!(try_smtc_flight().is_some());
    }

    #[test]
    fn snapshot_key_includes_reactions_and_wave_selection() {
        let original = snapshot();
        let key = snapshot_key(&original);
        let mut changed = original.clone();
        changed.is_liked = true;
        assert_ne!(key, snapshot_key(&changed));
        changed.is_liked = false;
        changed.active_wave_id = Some("wave-1".into());
        assert_ne!(key, snapshot_key(&changed));
    }

    #[test]
    fn paused_status_only_snapshot_keeps_same_track_metadata() {
        let previous = snapshot();
        let mut current = previous.clone();
        current.playback_status = PlaybackStatus::Paused;
        current.title = None;
        current.artist = None;
        current.album_title = None;
        current.thumbnail_data_url = None;
        preserve_same_track_metadata(Some(&previous), &mut current);
        assert_eq!(current.title.as_deref(), Some("Title"));
        assert_eq!(current.artist.as_deref(), Some("Artist"));
        assert!(current.thumbnail_data_url.is_some());
    }

    #[test]
    fn metadata_is_not_reused_for_a_different_track() {
        let previous = snapshot();
        let mut current = previous.clone();
        current.track_id = Some("track-2".into());
        current.playback_status = PlaybackStatus::Paused;
        current.title = None;
        preserve_same_track_metadata(Some(&previous), &mut current);
        assert!(current.title.is_none());
    }

    #[test]
    fn direct_stale_retention_is_bounded_and_terminal_aware() {
        assert!(retain_direct_stale(
            Some(Instant::now()),
            DIRECT_STALE_MAX_FAILURES,
            &crate::yandex::DirectYandexState::Degraded
        ));
        assert!(!retain_direct_stale(
            Some(Instant::now()),
            DIRECT_STALE_MAX_FAILURES + 1,
            &crate::yandex::DirectYandexState::Degraded
        ));
        assert!(!retain_direct_stale(
            Some(Instant::now()),
            1,
            &crate::yandex::DirectYandexState::RestartRequired
        ));
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
