use super::meter::{BassMeter, FRAME_BYTES, SAMPLE_RATE};
use std::{
    ffi::OsString,
    mem::ManuallyDrop,
    os::windows::ffi::OsStringExt,
    path::Path,
    sync::{mpsc, Arc},
    time::{Duration, Instant},
};
use windows::{
    core::{implement, IUnknown, Interface, Owned, Ref, HRESULT, PWSTR},
    Win32::{
        Foundation::{HANDLE, WAIT_TIMEOUT},
        Media::Audio::{
            ActivateAudioInterfaceAsync, IActivateAudioInterfaceAsyncOperation,
            IActivateAudioInterfaceCompletionHandler,
            IActivateAudioInterfaceCompletionHandler_Impl, IAudioCaptureClient, IAudioClient,
            AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY, AUDCLNT_BUFFERFLAGS_SILENT,
            AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
            AUDCLNT_STREAMFLAGS_LOOPBACK, AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
            AUDIOCLIENT_ACTIVATION_PARAMS, AUDIOCLIENT_ACTIVATION_PARAMS_0,
            AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK, AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS,
            PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
            VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, WAVEFORMATEX,
        },
        System::{
            Com::{
                CoInitializeEx, CoUninitialize,
                StructuredStorage::{
                    PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0,
                },
                BLOB, COINIT_MULTITHREADED,
            },
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, WaitForSingleObject, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
            },
            Variant::VT_BLOB,
        },
    },
};

const SAMPLE_INTERVAL: Duration = Duration::from_millis(50);
const ACTIVATION_TIMEOUT: Duration = Duration::from_secs(3);

#[implement(IActivateAudioInterfaceCompletionHandler)]
struct ActivationComplete {
    signal: mpsc::SyncSender<()>,
    // Windows owns a callback reference until completion, including when the worker cancels.
    _data: Arc<ActivationData>,
}

impl IActivateAudioInterfaceCompletionHandler_Impl for ActivationComplete_Impl {
    fn ActivateCompleted(
        &self,
        _: Ref<IActivateAudioInterfaceAsyncOperation>,
    ) -> windows::core::Result<()> {
        let _ = self.signal.try_send(());
        Ok(())
    }
}

pub(crate) struct TargetProcess {
    pid: u32,
    handle: Owned<HANDLE>,
}

// Querying, waiting on, and closing this process handle are thread-safe kernel operations.
unsafe impl Send for TargetProcess {}
unsafe impl Sync for TargetProcess {}

impl TargetProcess {
    pub(crate) fn open(pid: u32, verify_image: impl Fn(&Path) -> bool) -> anyhow::Result<Self> {
        let handle = unsafe {
            Owned::new(OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                false,
                pid,
            )?)
        };
        let mut image = [0_u16; 32_768];
        let mut len = image.len() as u32;
        unsafe {
            QueryFullProcessImageNameW(
                *handle,
                PROCESS_NAME_WIN32,
                PWSTR(image.as_mut_ptr()),
                &mut len,
            )?
        };
        let path = OsString::from_wide(&image[..len as usize]);
        let target = Self { pid, handle };
        anyhow::ensure!(
            target.running() && verify_image(Path::new(&path)),
            "playback process changed"
        );
        Ok(target)
    }

    fn running(&self) -> bool {
        unsafe { WaitForSingleObject(*self.handle, 0) == WAIT_TIMEOUT }
    }
}

struct ActivationData {
    // The process handle prevents PID recycling until after activation/capture.
    _target: Arc<TargetProcess>,
    params: AUDIOCLIENT_ACTIVATION_PARAMS,
    property: ManuallyDrop<PROPVARIANT>,
}

// The BLOB points to an owned, immutable allocation and the process HANDLE can be closed on
// any thread. Neither pointer is mutated by Rust after publishing the activation to COM.
unsafe impl Send for ActivationData {}
unsafe impl Sync for ActivationData {}

struct ComApartment;

impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

fn activate(
    target: Arc<TargetProcess>,
    active: &impl Fn() -> bool,
) -> anyhow::Result<Option<IAudioClient>> {
    let mut data = Arc::new(ActivationData {
        params: AUDIOCLIENT_ACTIVATION_PARAMS {
            ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
            Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                    TargetProcessId: target.pid,
                    ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
                },
            },
        },
        _target: target,
        property: ManuallyDrop::new(PROPVARIANT::default()),
    });
    let activation = Arc::get_mut(&mut data).expect("activation is not yet shared");
    // The BLOB borrows this stable allocation; PropVariantClear must not release it.
    activation.property = ManuallyDrop::new(PROPVARIANT {
        Anonymous: PROPVARIANT_0 {
            Anonymous: ManuallyDrop::new(PROPVARIANT_0_0 {
                vt: VT_BLOB,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: PROPVARIANT_0_0_0 {
                    blob: BLOB {
                        cbSize: std::mem::size_of_val(&activation.params) as u32,
                        pBlobData: std::ptr::from_mut(&mut activation.params).cast(),
                    },
                },
            }),
        },
    });
    let (send, received) = mpsc::sync_channel(1);
    let completion: IActivateAudioInterfaceCompletionHandler = ActivationComplete {
        signal: send,
        _data: data.clone(),
    }
    .into();
    let operation = unsafe {
        ActivateAudioInterfaceAsync(
            VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
            &IAudioClient::IID,
            Some(&*data.property),
            &completion,
        )?
    };
    let started = Instant::now();
    while active() && started.elapsed() < ACTIVATION_TIMEOUT {
        match received.recv_timeout(SAMPLE_INTERVAL) {
            Ok(()) => {
                let mut result = HRESULT::default();
                let mut client: Option<IUnknown> = None;
                unsafe { operation.GetActivateResult(&mut result, &mut client)? };
                result.ok()?;
                return client
                    .map(|client| client.cast())
                    .transpose()
                    .map_err(Into::into);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    anyhow::ensure!(!active(), "process loopback activation did not complete");
    Ok(None)
}

pub(super) fn monitor(
    target: TargetProcess,
    enabled: impl Fn() -> bool,
    emit: impl Fn(f32),
) -> anyhow::Result<()> {
    let target = Arc::new(target);
    let active = || target.running() && enabled();
    if !active() {
        return Ok(());
    }
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
    let _apartment = ComApartment;
    let Some(client) = activate(target.clone(), &active)? else {
        return Ok(());
    };
    if !active() {
        return Ok(());
    }
    let format = WAVEFORMATEX {
        wFormatTag: 3, // WAVE_FORMAT_IEEE_FLOAT
        nChannels: 2,
        nSamplesPerSec: SAMPLE_RATE,
        nAvgBytesPerSec: SAMPLE_RATE * FRAME_BYTES as u32,
        nBlockAlign: FRAME_BYTES as u16,
        wBitsPerSample: 32,
        cbSize: 0,
    };
    let flags = AUDCLNT_STREAMFLAGS_LOOPBACK
        | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
        | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
    unsafe { client.Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 0, 0, &format, None)? };
    let capture: IAudioCaptureClient = unsafe { client.GetService()? };
    if !active() {
        return Ok(());
    }
    unsafe { client.Start()? };
    let result = sample(&capture, active, emit);
    let _ = unsafe { client.Stop() };
    result
}

fn sample(
    capture: &IAudioCaptureClient,
    active: impl Fn() -> bool,
    emit: impl Fn(f32),
) -> anyhow::Result<()> {
    let mut meter = BassMeter::new();
    while active() {
        // Limit each pass so an unexpected backlog cannot starve the lifecycle check.
        for _ in 0..16 {
            let next = unsafe { capture.GetNextPacketSize()? };
            if next == 0 {
                break;
            }
            let mut data = std::ptr::null_mut();
            let (mut frames, mut flags) = (0, 0);
            unsafe { capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None)? };
            if flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY.0 as u32 != 0 {
                meter.reset_filters();
            }
            if data.is_null() || flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 {
                meter.add_silence(frames);
            } else {
                // Windows owns the interleaved PCM until ReleaseBuffer. No PCM escapes this pass.
                let bytes =
                    unsafe { std::slice::from_raw_parts(data, frames as usize * FRAME_BYTES) };
                meter.add_packet(bytes);
            }
            unsafe { capture.ReleaseBuffer(frames)? };
        }
        if active() {
            emit((meter.level() * 100.0).round() / 100.0);
        }
        std::thread::sleep(SAMPLE_INTERVAL);
    }
    Ok(())
}
