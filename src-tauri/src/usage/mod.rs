mod claude;
mod codex;
mod model;

use std::{sync::Arc, time::Duration};

use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::config::AppConfig;

#[cfg(test)]
use model::UsageWindow;
use model::{unix_now, ProbeData, ProbeError};
pub use model::{UsageConnectionState, UsageProvider, UsageProviderSnapshot, UsageSnapshot};

const POLL_INTERVAL: Duration = Duration::from_secs(5 * 60);

struct ProviderRuntime {
    enabled: bool,
    generation: u64,
    backoff_until: i64,
    refreshing: bool,
    poll_task: Option<tauri::async_runtime::JoinHandle<()>>,
    snapshot: UsageProviderSnapshot,
}

struct UsageInner {
    providers: [ProviderRuntime; 2],
}

pub struct UsageState {
    inner: Arc<Mutex<UsageInner>>,
}

impl Default for UsageState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(UsageInner {
                providers: [
                    ProviderRuntime {
                        enabled: false,
                        generation: 0,
                        backoff_until: 0,
                        refreshing: false,
                        poll_task: None,
                        snapshot: UsageProviderSnapshot::disabled(UsageProvider::Codex),
                    },
                    ProviderRuntime {
                        enabled: false,
                        generation: 0,
                        backoff_until: 0,
                        refreshing: false,
                        poll_task: None,
                        snapshot: UsageProviderSnapshot::disabled(UsageProvider::Claude),
                    },
                ],
            })),
        }
    }
}

#[tauri::command]
pub fn usage_get_snapshot(state: State<'_, UsageState>) -> UsageSnapshot {
    snapshot(&state.inner)
}

#[tauri::command]
pub async fn usage_connect(
    app: AppHandle,
    state: State<'_, UsageState>,
    provider: UsageProvider,
) -> Result<UsageSnapshot, String> {
    if let Some(generation) = begin_connect(&state.inner, provider, false) {
        emit_snapshot(&app, &state.inner);
        spawn_provider_task(app, state.inner.clone(), provider, generation);
    }
    Ok(snapshot(&state.inner))
}

#[tauri::command]
pub fn usage_disconnect(
    app: AppHandle,
    state: State<'_, UsageState>,
    provider: UsageProvider,
) -> UsageSnapshot {
    disable_provider(&state.inner, provider);
    emit_snapshot(&app, &state.inner);
    snapshot(&state.inner)
}

#[tauri::command]
pub async fn usage_refresh(
    app: AppHandle,
    state: State<'_, UsageState>,
    provider: UsageProvider,
) -> Result<UsageSnapshot, String> {
    refresh_provider(&app, &state.inner, provider, None, true).await;
    Ok(snapshot(&state.inner))
}

pub fn sync_config(app: &AppHandle, state: &UsageState, config: &AppConfig) {
    let usage = config
        .plugins
        .settings
        .get("usage")
        .and_then(|value| value.as_object());
    let desired = [
        (
            UsageProvider::Codex,
            usage
                .and_then(|value| value.get("codexEnabled"))
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
        ),
        (
            UsageProvider::Claude,
            usage
                .and_then(|value| value.get("claudeEnabled"))
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
        ),
    ];
    for (provider, enabled) in desired {
        if enabled {
            if let Some(generation) = begin_connect(&state.inner, provider, false) {
                let provider_app = app.clone();
                let provider_inner = state.inner.clone();
                spawn_provider_task(provider_app, provider_inner, provider, generation);
            }
        } else {
            // Always advance the generation. This cancels a connect task that was
            // reserved by an earlier config save but has not started probing yet.
            disable_provider(&state.inner, provider);
        }
    }
    emit_snapshot(app, &state.inner);
}

fn begin_connect(
    inner: &Arc<Mutex<UsageInner>>,
    provider: UsageProvider,
    force: bool,
) -> Option<u64> {
    let generation = {
        let mut locked = inner.lock();
        let runtime = &mut locked.providers[provider.index()];
        if runtime.refreshing {
            return None;
        }
        if runtime.enabled && !force {
            return None;
        }
        if let Some(task) = runtime.poll_task.take() {
            task.abort();
        }
        runtime.enabled = true;
        runtime.generation = runtime.generation.wrapping_add(1);
        runtime.backoff_until = 0;
        runtime.refreshing = false;
        runtime.snapshot.state = UsageConnectionState::Connecting;
        runtime.snapshot.message_code = None;
        runtime.generation
    };
    Some(generation)
}

fn disable_provider(inner: &Arc<Mutex<UsageInner>>, provider: UsageProvider) {
    let mut locked = inner.lock();
    let runtime = &mut locked.providers[provider.index()];
    runtime.enabled = false;
    runtime.generation = runtime.generation.wrapping_add(1);
    runtime.backoff_until = 0;
    runtime.refreshing = false;
    if let Some(task) = runtime.poll_task.take() {
        task.abort();
    }
    runtime.snapshot = UsageProviderSnapshot::disabled(provider);
}

fn spawn_provider_task(
    app: AppHandle,
    inner: Arc<Mutex<UsageInner>>,
    provider: UsageProvider,
    generation: u64,
) {
    let task_inner = inner.clone();
    let task = tauri::async_runtime::spawn(async move {
        refresh_provider(&app, &task_inner, provider, Some(generation), false).await;
        loop {
            let Some(delay) = ({
                let locked = task_inner.lock();
                let runtime = &locked.providers[provider.index()];
                (runtime.enabled && runtime.generation == generation)
                    .then(|| next_poll_delay(runtime, unix_now()))
            }) else {
                break;
            };
            tokio::time::sleep(delay).await;
            refresh_provider(&app, &task_inner, provider, Some(generation), false).await;
        }
    });
    let mut locked = inner.lock();
    let runtime = &mut locked.providers[provider.index()];
    if runtime.enabled && runtime.generation == generation {
        if let Some(previous) = runtime.poll_task.replace(task) {
            previous.abort();
        }
    } else {
        task.abort();
    }
}

async fn refresh_provider(
    app: &AppHandle,
    inner: &Arc<Mutex<UsageInner>>,
    provider: UsageProvider,
    expected_generation: Option<u64>,
    bypass_backoff: bool,
) {
    let Some(generation) = claim_refresh(inner, provider, expected_generation, bypass_backoff)
    else {
        return;
    };
    let result = match provider {
        UsageProvider::Codex => tauri::async_runtime::spawn_blocking(codex::probe)
            .await
            .unwrap_or(Err(ProbeError::Protocol)),
        UsageProvider::Claude => claude::probe().await,
    };
    let transition_to_connected = result.is_ok() && {
        let locked = inner.lock();
        let runtime = &locked.providers[provider.index()];
        runtime.enabled
            && runtime.generation == generation
            && !matches!(runtime.snapshot.state, UsageConnectionState::Connected)
    };
    let connected_window_count = result.as_ref().ok().map(|data| data.windows.len());
    let failure_code = result.as_ref().err().map(|error| error.message_code());
    let now = unix_now();
    if apply_probe_result(inner, provider, generation, result, now) {
        let (key, name) = match provider {
            UsageProvider::Codex => ("usage-codex-probe", "codex"),
            UsageProvider::Claude => ("usage-claude-probe", "claude"),
        };
        if let Some(error) = failure_code {
            crate::logging::append_event_rate_limited(
                key,
                &format!("usage provider={name} probe failed: {error:?}"),
                Duration::from_secs(60),
            );
        } else if transition_to_connected {
            crate::logging::append_event(&format!(
                "usage provider={name} state=connected windows={}",
                connected_window_count.unwrap_or(0),
            ));
        }
        emit_snapshot(app, inner);
    }
}

fn claim_refresh(
    inner: &Arc<Mutex<UsageInner>>,
    provider: UsageProvider,
    expected_generation: Option<u64>,
    bypass_backoff: bool,
) -> Option<u64> {
    let mut locked = inner.lock();
    let runtime = &mut locked.providers[provider.index()];
    let generation_matches =
        expected_generation.map_or(true, |expected| expected == runtime.generation);
    if !runtime.enabled
        || !generation_matches
        || runtime.refreshing
        || (!bypass_backoff && runtime.backoff_until > unix_now())
    {
        return None;
    }
    runtime.refreshing = true;
    Some(runtime.generation)
}

fn next_poll_delay(runtime: &ProviderRuntime, now: i64) -> Duration {
    if runtime.backoff_until > now {
        Duration::from_secs((runtime.backoff_until - now) as u64)
    } else {
        POLL_INTERVAL
    }
}

fn apply_probe_result(
    inner: &Arc<Mutex<UsageInner>>,
    provider: UsageProvider,
    generation: u64,
    result: Result<ProbeData, ProbeError>,
    now: i64,
) -> bool {
    let mut locked = inner.lock();
    let runtime = &mut locked.providers[provider.index()];
    if !runtime.enabled || runtime.generation != generation {
        return false;
    }
    runtime.refreshing = false;
    match result {
        Ok(data) => apply_success(runtime, data, now),
        Err(error) => apply_error(runtime, error, now),
    }
    true
}

fn apply_success(runtime: &mut ProviderRuntime, data: ProbeData, now: i64) {
    runtime.backoff_until = 0;
    runtime.snapshot.state = UsageConnectionState::Connected;
    runtime.snapshot.windows = data.windows;
    runtime.snapshot.plan = data.plan;
    runtime.snapshot.fetched_at = Some(now);
    runtime.snapshot.stale_since = None;
    runtime.snapshot.message_code = None;
}

fn apply_error(runtime: &mut ProviderRuntime, error: ProbeError, now: i64) {
    runtime.backoff_until = now
        + if matches!(error, ProbeError::RateLimited) {
            5 * 60
        } else {
            60
        };
    if error.clears_previous() {
        runtime.snapshot.windows.clear();
        runtime.snapshot.plan = None;
        runtime.snapshot.fetched_at = None;
        runtime.snapshot.stale_since = None;
    }
    runtime.snapshot.state = match error {
        ProbeError::NotInstalled => UsageConnectionState::Unavailable,
        ProbeError::NeedsAuth => UsageConnectionState::NeedsAuth,
        _ if !runtime.snapshot.windows.is_empty() => UsageConnectionState::Stale,
        _ => UsageConnectionState::Error,
    };
    if matches!(runtime.snapshot.state, UsageConnectionState::Stale) {
        runtime.snapshot.stale_since.get_or_insert(now);
    }
    runtime.snapshot.message_code = Some(error.message_code());
}

fn snapshot(inner: &Arc<Mutex<UsageInner>>) -> UsageSnapshot {
    let locked = inner.lock();
    UsageSnapshot {
        codex: locked.providers[UsageProvider::Codex.index()]
            .snapshot
            .clone(),
        claude: locked.providers[UsageProvider::Claude.index()]
            .snapshot
            .clone(),
    }
}

fn emit_snapshot(app: &AppHandle, inner: &Arc<Mutex<UsageInner>>) {
    let _ = app.emit("usage:snapshot", snapshot(inner));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_error_clears_old_quota_and_offline_marks_it_stale() {
        let mut runtime = ProviderRuntime {
            enabled: true,
            generation: 1,
            backoff_until: 0,
            refreshing: false,
            poll_task: None,
            snapshot: UsageProviderSnapshot::disabled(UsageProvider::Codex),
        };
        runtime.snapshot.windows.push(UsageWindow {
            id: "primary".into(),
            label: "5 h".into(),
            used_percent: Some(10.0),
            remaining_percent: Some(90.0),
            window_duration_minutes: Some(300),
            resets_at: None,
        });
        apply_error(&mut runtime, ProbeError::Offline, 10);
        assert!(matches!(
            runtime.snapshot.state,
            UsageConnectionState::Stale
        ));
        assert_eq!(runtime.snapshot.windows.len(), 1);
        apply_error(&mut runtime, ProbeError::NeedsAuth, 20);
        assert!(matches!(
            runtime.snapshot.state,
            UsageConnectionState::NeedsAuth
        ));
        assert!(runtime.snapshot.windows.is_empty());
    }

    #[test]
    fn queued_connect_cannot_probe_after_disable() {
        let state = UsageState::default();
        let generation = begin_connect(&state.inner, UsageProvider::Codex, false).unwrap();
        disable_provider(&state.inner, UsageProvider::Codex);
        assert_eq!(
            claim_refresh(&state.inner, UsageProvider::Codex, Some(generation), false,),
            None
        );
    }

    #[test]
    fn old_manual_reply_cannot_overwrite_a_reconnected_provider() {
        let state = UsageState::default();
        let old_generation = begin_connect(&state.inner, UsageProvider::Codex, false).unwrap();
        assert_eq!(
            claim_refresh(&state.inner, UsageProvider::Codex, None, false),
            Some(old_generation)
        );
        disable_provider(&state.inner, UsageProvider::Codex);
        let new_generation = begin_connect(&state.inner, UsageProvider::Codex, false).unwrap();
        assert_eq!(
            claim_refresh(&state.inner, UsageProvider::Codex, None, false),
            Some(new_generation)
        );
        let applied = apply_probe_result(
            &state.inner,
            UsageProvider::Codex,
            old_generation,
            Err(ProbeError::Offline),
            10,
        );
        assert!(!applied);
        let locked = state.inner.lock();
        let runtime = &locked.providers[UsageProvider::Codex.index()];
        assert_eq!(runtime.generation, new_generation);
        assert!(runtime.refreshing);
    }

    #[test]
    fn transient_error_retries_when_its_backoff_expires_instead_of_waiting_full_poll() {
        let mut runtime = ProviderRuntime {
            enabled: true,
            generation: 1,
            backoff_until: 0,
            refreshing: false,
            poll_task: None,
            snapshot: UsageProviderSnapshot::disabled(UsageProvider::Codex),
        };

        apply_error(&mut runtime, ProbeError::Offline, 100);

        assert_eq!(next_poll_delay(&runtime, 100), Duration::from_secs(60));
        assert_eq!(next_poll_delay(&runtime, 160), POLL_INTERVAL);
    }

    #[test]
    fn explicit_refresh_can_recover_during_automatic_backoff() {
        let state = UsageState::default();
        let generation = begin_connect(&state.inner, UsageProvider::Codex, false).unwrap();
        {
            let mut locked = state.inner.lock();
            let runtime = &mut locked.providers[UsageProvider::Codex.index()];
            runtime.backoff_until = unix_now() + 60;
        }

        assert_eq!(
            claim_refresh(&state.inner, UsageProvider::Codex, Some(generation), false,),
            None
        );
        assert_eq!(
            claim_refresh(&state.inner, UsageProvider::Codex, Some(generation), true,),
            Some(generation)
        );
    }

    #[test]
    fn provider_retry_deadlines_are_independent() {
        let state = UsageState::default();
        let codex_generation = begin_connect(&state.inner, UsageProvider::Codex, false).unwrap();
        let _claude_generation = begin_connect(&state.inner, UsageProvider::Claude, false).unwrap();

        assert!(apply_probe_result(
            &state.inner,
            UsageProvider::Codex,
            codex_generation,
            Err(ProbeError::Offline),
            100,
        ));

        let locked = state.inner.lock();
        assert_eq!(
            next_poll_delay(&locked.providers[UsageProvider::Codex.index()], 100),
            Duration::from_secs(60),
        );
        assert_eq!(
            next_poll_delay(&locked.providers[UsageProvider::Claude.index()], 100),
            POLL_INTERVAL,
        );
    }
}
