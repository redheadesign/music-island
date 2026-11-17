#[cfg(windows)]
mod capture;
#[cfg(windows)]
mod meter;

#[cfg(windows)]
pub(crate) use capture::TargetProcess;

use tauri::{AppHandle, WebviewWindow};

#[derive(Clone, Default)]
pub struct PlaybackBassState {
    #[cfg(windows)]
    demand: std::sync::Arc<parking_lot::Mutex<Demand>>,
}

#[cfg(windows)]
#[derive(Default)]
struct Demand {
    request: Option<u32>,
    worker_running: bool,
}

#[tauri::command]
pub async fn set_playback_bass(
    app: AppHandle,
    window: WebviewWindow,
    enabled: bool,
    request: u32,
) -> bool {
    if window.label() != "main" {
        return false;
    }
    #[cfg(windows)]
    return native::set_demand(&app, enabled, request);
    #[cfg(not(windows))]
    {
        let _ = (app, enabled, request);
        false
    }
}

#[cfg(windows)]
mod native {
    use super::{capture, AppHandle, PlaybackBassState};
    use crate::{config::ConfigState, logging, media, window, yandex};
    use serde::Serialize;
    use std::time::Duration;
    use tauri::{Emitter, Manager};

    #[derive(Clone, Serialize)]
    struct BassSample {
        request: u32,
        bass: f32,
    }

    pub(super) fn set_demand(app: &AppHandle, enabled: bool, request: u32) -> bool {
        let state = app.state::<PlaybackBassState>();
        if !enabled {
            let mut demand = state.demand.lock();
            if demand.request == Some(request) {
                demand.request = None;
            }
            return true;
        }
        if !eligible(&app.state::<ConfigState>()) {
            return false;
        }

        let mut demand = state.demand.lock();
        demand.request = Some(request);
        if !demand.worker_running {
            let app = app.clone();
            let state = state.inner().clone();
            match std::thread::Builder::new()
                .name("island-playback-bass".into())
                .spawn(move || run(&app, &state))
            {
                Ok(_) => demand.worker_running = true,
                Err(_) => {
                    demand.request = None;
                    return false;
                }
            }
        }
        true
    }

    fn eligible(config: &ConfigState) -> bool {
        window::overlay_is_expanded()
            && media::direct_is_playing()
            && config.playback_bass_enabled()
    }

    fn run(app: &AppHandle, state: &PlaybackBassState) {
        let config = app.state::<ConfigState>();
        loop {
            let request = {
                let mut demand = state.demand.lock();
                let Some(request) = demand.request else {
                    demand.worker_running = false;
                    return;
                };
                request
            };
            if eligible(&config) {
                if let Some((target, port)) = yandex::playback_process() {
                    let active = || {
                        state.demand.lock().request == Some(request)
                            && eligible(&config)
                            && yandex::playback_port_is_connected(port)
                    };
                    if let Err(error) = capture::monitor(target, active, |bass| {
                        let _ = app.emit_to("main", "playback:bass", BassSample { request, bass });
                    }) {
                        logging::append_event_rate_limited(
                            "playback-bass-capture",
                            &format!("playback bass unavailable: {error:#}"),
                            Duration::from_secs(60),
                        );
                    }
                } else {
                    logging::append_event_rate_limited(
                        "playback-bass-process",
                        "playback bass unavailable: no verified Direct player process",
                        Duration::from_secs(60),
                    );
                }
            }
            let mut demand = state.demand.lock();
            if demand.request == Some(request) {
                demand.request = None;
            }
        }
    }
}
