use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum VolumeAction {
    Read,
    ToggleMute { endpoint_id: String },
    SetVolume { endpoint_id: String, volume: u8 },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VolumeSnapshot {
    endpoint_id: String,
    volume: u8,
    muted: bool,
}

#[cfg(test)]
mod tests {
    use super::{VolumeAction, VolumeSnapshot};
    use serde_json::{from_value, json, to_value};

    #[test]
    fn writes_require_the_displayed_endpoint_and_an_integer_level() {
        assert!(from_value::<VolumeAction>(json!({"kind": "toggleMute"})).is_err());
        assert!(from_value::<VolumeAction>(json!({
            "kind": "setVolume", "endpointId": "speakers", "volume": 0.5
        }))
        .is_err());
        assert!(matches!(
            from_value::<VolumeAction>(json!({
                "kind": "setVolume", "endpointId": "speakers", "volume": 73
            })),
            Ok(VolumeAction::SetVolume { endpoint_id, volume: 73 }) if endpoint_id == "speakers"
        ));
    }

    #[test]
    fn muted_snapshot_keeps_the_endpoint_level_on_the_wire() {
        let muted = VolumeSnapshot {
            endpoint_id: "speakers".into(),
            volume: 73,
            muted: true,
        };
        assert_eq!(
            to_value(muted).unwrap(),
            json!({"endpointId": "speakers", "volume": 73, "muted": true})
        );
    }
}

#[tauri::command]
pub(crate) async fn system_volume(action: VolumeAction) -> Result<VolumeSnapshot, String> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || endpoint::apply(action))
            .await
            .map_err(|error| error.to_string())?
            .map_err(|error| format!("{error:#}"))
    }
    #[cfg(not(windows))]
    {
        let _ = action;
        Err("System output volume requires Windows".into())
    }
}

#[cfg(windows)]
mod endpoint {
    use super::{VolumeAction, VolumeSnapshot};
    use anyhow::{ensure, Context, Result};
    use std::{ptr, sync::Mutex};
    use windows::Win32::{
        Foundation::RPC_E_CHANGED_MODE,
        Media::Audio::{
            eConsole, eRender, Endpoints::IAudioEndpointVolume, IMMDeviceEnumerator,
            MMDeviceEnumerator,
        },
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
            COINIT_MULTITHREADED,
        },
    };

    // A click in two windows can otherwise read the same mute state before either sets it.
    static ACCESS: Mutex<()> = Mutex::new(());

    struct Apartment(bool);

    impl Drop for Apartment {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() }
            }
        }
    }

    pub(super) fn apply(action: VolumeAction) -> Result<VolumeSnapshot> {
        let _access = ACCESS.lock().unwrap_or_else(|error| error.into_inner());
        unsafe {
            let init = CoInitializeEx(None, COINIT_MULTITHREADED);
            if init != RPC_E_CHANGED_MODE {
                init.ok()?;
            }
            let _apartment = Apartment(init.is_ok());
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .context("Default Windows output unavailable")?;
            let raw_id = device.GetId()?;
            let id = raw_id.to_string();
            CoTaskMemFree(Some(raw_id.0.cast()));
            let endpoint_id = id?;
            let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;

            // A drag started on a disconnected headset must never change its replacement.
            match action {
                VolumeAction::ToggleMute {
                    endpoint_id: expected,
                } if expected == endpoint_id => {
                    endpoint.SetMute(!endpoint.GetMute()?.as_bool(), ptr::null())?;
                }
                VolumeAction::SetVolume {
                    endpoint_id: expected,
                    volume,
                } if expected == endpoint_id => {
                    ensure!(volume <= 100, "Volume must be between 0 and 100");
                    endpoint.SetMasterVolumeLevelScalar(f32::from(volume) / 100.0, ptr::null())?;
                }
                _ => {}
            }

            Ok(VolumeSnapshot {
                endpoint_id,
                volume: (endpoint.GetMasterVolumeLevelScalar()?.clamp(0.0, 1.0) * 100.0).round()
                    as u8,
                muted: endpoint.GetMute()?.as_bool(),
            })
        }
    }
}
