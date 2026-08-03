import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  voicePluginApi,
  type VoiceAppSettings as AppSettings,
  type VirtualRouteStatus,
} from "./pluginApi";
import { messages, type Locale } from "./voiceMessages";
import {
  CUSTOM_PRESET_ID,
  DEFAULT_SCENE,
  allPresets,
  loadCustomPresets,
  saveCustomPresets,
  type ScenePreset,
} from "./presets";
import { loadSession, saveSession } from "./session";

export type PanelView = "main" | "presetEdit" | "help";

const defaultSettings: AppSettings = {
  hotkey: "Ctrl+Shift+D",
  hotkeyEnabled: true,
  hotkeyExplode: "",
  hotkeyExplodeEnabled: false,
  hotkeyMonitor: "",
  hotkeyMonitorEnabled: false,
  hotkeyBgm: "",
  hotkeyBgmEnabled: false,
  hotkeyEq: "",
  hotkeyEqEnabled: false,
  autostart: false,
  language: "en",
};

export function useIslandVoiceApp(islandLocale: "ru" | "en") {
  const [view, setView] = useState<PanelView>("main");
  const [running, setRunning] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [strength, setStrength] = useState(55);
  const [model, setModel] = useState("rnnoise");
  const [models, setModels] = useState<string[]>(["rnnoise"]);
  const [inputs, setInputs] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [inputDevice, setInputDevice] = useState("");
  const [outputDevice, setOutputDevice] = useState("");
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [monitorPoint, setMonitorPoint] = useState(5);
  const [eqEnabled, setEqEnabled] = useState(false);
  const [eqBands, setEqBands] = useState<number[]>([...DEFAULT_SCENE.eqBands]);
  const [eqFreqs, setEqFreqs] = useState<number[]>([]);
  const [agcEnabled, setAgcEnabled] = useState(false);
  const [agcTarget, setAgcTarget] = useState(0.032);
  const [micGain, setMicGain] = useState(1);
  const [fxEnabled, setFxEnabled] = useState(false);
  const [fxEffect, setFxEffect] = useState(4);
  const [fxIntensity, setFxIntensity] = useState(50);
  const [customPresets, setCustomPresets] = useState<ScenePreset[]>([]);
  /** null = nothing selected (factory defaults). "custom" = user tweaked. */
  const [presetId, setPresetId] = useState<string | null>(null);
  const [editingPreset, setEditingPreset] = useState<ScenePreset | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cableBusy, setCableBusy] = useState(false);
  const [cableMessage, setCableMessage] = useState<string | null>(null);
  const [virtualRoute, setVirtualRoute] = useState<VirtualRouteStatus>({
    cableInstalled: false,
    cableInput: null,
    cableOutput: null,
    hasVoicemeeter: false,
    voicemeeterInput: null,
  });
  const [hydrated, setHydrated] = useState(false);
  const resumeEngineRef = useRef(false);

  const locale: Locale = islandLocale;
  const t = useMemo(() => messages[locale], [locale]);
  const presets = useMemo(() => allPresets(customPresets), [customPresets]);

  const markCustom = useCallback(() => {
    setPresetId(CUSTOM_PRESET_ID);
  }, []);

  const pushDenoise = useCallback(
    async (patch: {
      enabled?: boolean;
      strength?: number;
      micGain?: number;
      agcEnabled?: boolean;
      agcTarget?: number;
    }) => {
      if (!running && patch.enabled === undefined && patch.strength === undefined) {
        /* still allow pre-start state only in React */
      }
      if (!running) return;
      await voicePluginApi.updateDenoiseConfig({
        enabled: patch.enabled,
        strength: patch.strength !== undefined ? patch.strength / 100 : undefined,
        micGain: patch.micGain,
        agcEnabled: patch.agcEnabled,
        agcTarget: patch.agcTarget,
      });
    },
    [running],
  );

  const refreshDevices = useCallback(async () => {
    const [ins, outs, ms] = await Promise.all([
      voicePluginApi.listInputDevices(),
      voicePluginApi.listOutputDevices(),
      voicePluginApi.listDenoiseModels(),
    ]);
    setInputs(ins);
    setOutputs(outs);
    setModels(ms.length ? ms : ["rnnoise"]);
    setInputDevice((prev) => prev || pickPreferredInput(ins));
    setOutputDevice((prev) => prev || pickPreferredOutput(outs));
    if (ms.length && !ms.includes(model)) setModel(ms[0]);
  }, [model]);

  const refreshVirtualRoute = useCallback(async () => {
    try {
      setVirtualRoute(await voicePluginApi.getVirtualRouteStatus());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setCustomPresets(loadCustomPresets());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await voicePluginApi.getSettings();
        if (!cancelled) {
          setSettings(s);
          if (s.language === "zh-CN") {
            const next = { ...s, language: "ru" };
            setSettings(next);
            await voicePluginApi.saveSettings(next);
          }
        }

        const [ins, outs, ms] = await Promise.all([
          voicePluginApi.listInputDevices(),
          voicePluginApi.listOutputDevices(),
          voicePluginApi.listDenoiseModels(),
        ]);
        if (cancelled) return;
        setInputs(ins);
        setOutputs(outs);
        setModels(ms.length ? ms : ["rnnoise"]);
        try {
          setVirtualRoute(await voicePluginApi.getVirtualRouteStatus());
        } catch {
          /* ignore */
        }

        const freqs = await voicePluginApi.getEqFrequencies();
        if (!cancelled) setEqFreqs(freqs);

        // Engine may still be running after tab switch / settings reopen.
        try {
          const status = await voicePluginApi.getStatus();
          if (!cancelled) setRunning(Boolean(status.running));
        } catch {
          /* ignore */
        }

        const saved = loadSession();
        if (saved) {
          setEnabled(saved.enabled);
          setStrength(saved.strength);
          setMonitorEnabled(saved.monitorEnabled);
          setMonitorPoint(saved.monitorPoint);
          setEqEnabled(saved.eqEnabled);
          if (saved.eqBands?.length === 10) setEqBands(saved.eqBands);
          setAgcEnabled(saved.agcEnabled);
          setAgcTarget(saved.agcTarget);
          setMicGain(saved.micGain);
          setPresetId(saved.presetId);
          setFxIntensity(saved.fxIntensity);
          if (saved.model && (ms.includes(saved.model) || ms.length === 0)) {
            setModel(saved.model);
          } else if (ms.length) {
            setModel(ms[0]);
          }
          setInputDevice(
            saved.inputDevice && ins.includes(saved.inputDevice)
              ? saved.inputDevice
              : pickPreferredInput(ins),
          );
          setOutputDevice(
            saved.outputDevice && outs.includes(saved.outputDevice)
              ? saved.outputDevice
              : pickPreferredOutput(outs),
          );
          // Resume engine on next launch if it was live when the app quit.
          resumeEngineRef.current = Boolean(saved.engineRunning);
        } else {
          setInputDevice(pickPreferredInput(ins));
          setOutputDevice(pickPreferredOutput(outs));
          if (ms.length) setModel(ms[0]);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep Start/Stop in sync when settings reopen or the window regains focus.
  useEffect(() => {
    if (!hydrated) return;
    const syncRunning = async () => {
      try {
        const status = await voicePluginApi.getStatus();
        setRunning(Boolean(status.running));
      } catch {
        /* ignore */
      }
    };
    const onFocus = () => {
      void syncRunning();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [hydrated]);

  // Persist panel state between sessions
  useEffect(() => {
    if (!hydrated) return;
    const id = window.setTimeout(() => {
      saveSession({
        version: 2,
        enabled,
        strength,
        model,
        inputDevice,
        outputDevice,
        monitorEnabled,
        monitorPoint,
        eqEnabled,
        eqBands,
        agcEnabled,
        agcTarget,
        micGain,
        presetId,
        fxIntensity,
        engineRunning: running,
      });
    }, 250);
    return () => window.clearTimeout(id);
  }, [
    hydrated,
    enabled,
    strength,
    model,
    inputDevice,
    outputDevice,
    monitorEnabled,
    monitorPoint,
    eqEnabled,
    eqBands,
    agcEnabled,
    agcTarget,
    micGain,
    presetId,
    fxIntensity,
    running,
  ]);

  useEffect(() => {
    void refreshVirtualRoute();
    const id = window.setInterval(() => void refreshVirtualRoute(), 4000);
    return () => window.clearInterval(id);
  }, [refreshVirtualRoute, outputs.length]);


  /** EQ presets only — enable EQ and load bands. */
  const applyScene = useCallback(
    async (scene: ScenePreset, markId = true) => {
      if (markId) setPresetId(scene.id);
      setEqEnabled(true);
      setEqBands([...scene.eqBands]);
      if (running) {
        await voicePluginApi.updateEqConfig({ enabled: true, bands: scene.eqBands });
      }
    },
    [running],
  );

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await voicePluginApi.startDenoising(inputDevice || undefined, outputDevice || undefined, model, monitorEnabled);
      // Explicit clean chain — never leave FX on by accident
      await voicePluginApi.setExplodeMode(false, fxIntensity);
      await voicePluginApi.updateDenoiseConfig({
        enabled,
        strength: strength / 100,
        micGain,
        agcEnabled,
        agcTarget,
      });
      await voicePluginApi.updateEqConfig({ enabled: eqEnabled, bands: eqBands });
      await voicePluginApi.setMonitorMode(monitorEnabled);
      await voicePluginApi.setMonitorPoint(monitorPoint);
      if (fxEnabled) {
        await voicePluginApi.setExplodeEffect(fxEffect);
        await voicePluginApi.setExplodeMode(true, fxIntensity);
      }
      setRunning(true);
    } catch (e) {
      const msg = String(e);
      // Stale UI after reopen — engine already live.
      if (/already running/i.test(msg)) {
        setRunning(true);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [
    inputDevice,
    outputDevice,
    model,
    monitorEnabled,
    enabled,
    strength,
    micGain,
    agcEnabled,
    agcTarget,
    eqEnabled,
    eqBands,
    monitorPoint,
    fxEnabled,
    fxEffect,
    fxIntensity,
  ]);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      await voicePluginApi.setExplodeMode(false, fxIntensity);
      await voicePluginApi.stopDenoising();
      setRunning(false);
      setFxEnabled(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [fxIntensity]);

  // If Better Voice was live when the app quit, bring it back up after hydrate.
  useEffect(() => {
    if (!hydrated || !resumeEngineRef.current) return;
    resumeEngineRef.current = false;
    void start();
  }, [hydrated, start]);

  const applyStrength = useCallback(
    async (value: number) => {
      setStrength(value);
      await pushDenoise({ strength: value });
    },
    [pushDenoise],
  );

  const applyEnabled = useCallback(
    async (value: boolean) => {
      setEnabled(value);
      await pushDenoise({ enabled: value });
    },
    [pushDenoise],
  );

  const applyModel = useCallback(
    async (value: string) => {
      setModel(value);
      if (running) await voicePluginApi.switchModel(value);
    },
    [running],
  );

  const applyMonitor = useCallback(
    async (value: boolean) => {
      setMonitorEnabled(value);
      // Always monitor the final mix — no intermediate tap picker in UI.
      setMonitorPoint(5);
      if (running) {
        await voicePluginApi.setMonitorPoint(5);
        await voicePluginApi.setMonitorMode(value);
      }
    },
    [running],
  );

  const applyMonitorPoint = useCallback(
    async (value: number) => {
      setMonitorPoint(value);
      if (running) await voicePluginApi.setMonitorPoint(value);
    },
    [running],
  );

  const applyAgcEnabled = useCallback(
    async (value: boolean) => {
      setAgcEnabled(value);
      await pushDenoise({ agcEnabled: value });
    },
    [pushDenoise],
  );

  const applyAgcTarget = useCallback(
    async (value: number) => {
      setAgcTarget(value);
      await pushDenoise({ agcTarget: value });
    },
    [pushDenoise],
  );

  const applyMicGain = useCallback(
    async (value: number) => {
      setMicGain(value);
      await pushDenoise({ micGain: value });
    },
    [pushDenoise],
  );

  const applyEqBands = useCallback(
    async (bands: number[]) => {
      setEqBands(bands);
      markCustom();
      if (running) await voicePluginApi.updateEqConfig({ bands });
    },
    [running, markCustom],
  );

  const applyEqEnabled = useCallback(
    async (value: boolean) => {
      setEqEnabled(value);
      if (!value) setPresetId(null);
      if (running) await voicePluginApi.updateEqConfig({ enabled: value });
    },
    [running],
  );

  const applyFxEnabled = useCallback(
    async (value: boolean) => {
      setFxEnabled(value);
      if (running) {
        if (value) {
          await voicePluginApi.setExplodeEffect(fxEffect);
          await voicePluginApi.setExplodeMode(true, fxIntensity);
        } else {
          await voicePluginApi.setExplodeMode(false, fxIntensity);
        }
      }
    },
    [running, fxEffect, fxIntensity],
  );

  const applyFxEffect = useCallback(
    async (value: number) => {
      setFxEffect(value);
      if (running && fxEnabled) await voicePluginApi.setExplodeEffect(value);
    },
    [running, fxEnabled],
  );

  /** Latch chip: same effect again → off; other effect → switch on. */
  const toggleFx = useCallback(
    async (value: number) => {
      if (fxEnabled && fxEffect === value) {
        setFxEnabled(false);
        if (running) await voicePluginApi.setExplodeMode(false, fxIntensity);
        return;
      }
      setFxEffect(value);
      setFxEnabled(true);
      if (running) {
        await voicePluginApi.setExplodeEffect(value);
        await voicePluginApi.setExplodeMode(true, fxIntensity);
      }
    },
    [running, fxEnabled, fxEffect, fxIntensity],
  );

  const applyFxIntensity = useCallback(
    async (value: number) => {
      setFxIntensity(value);
      if (running && fxEnabled) await voicePluginApi.setExplodeMode(true, value);
    },
    [running, fxEnabled],
  );

  const openPresetEditor = useCallback(
    (base?: ScenePreset) => {
      const name = locale === "ru" ? "Мой EQ" : "My EQ";
      const draft: ScenePreset = base
        ? {
            id: base.builtin ? `custom-${Date.now()}` : base.id,
            labelEn: base.builtin ? name : base.labelEn,
            labelRu: base.builtin ? name : base.labelRu,
            builtin: false,
            eqBands: [...(base.builtin ? eqBands : base.eqBands)],
          }
        : {
            id: `custom-${Date.now()}`,
            labelEn: name,
            labelRu: name,
            builtin: false,
            eqBands: [...eqBands],
          };
      setEditingPreset(draft);
      setView("presetEdit");
    },
    [locale, eqBands],
  );

  const saveEditingPreset = useCallback(async () => {
    if (!editingPreset) return;
    const toSave = { ...editingPreset, eqBands: [...eqBands] };
    const next = customPresets.filter((p) => p.id !== toSave.id).concat(toSave);
    setCustomPresets(next);
    saveCustomPresets(next);
    await applyScene(toSave);
    setView("main");
  }, [editingPreset, customPresets, applyScene, eqBands]);

  const deleteCustomPreset = useCallback(
    (id: string) => {
      const next = customPresets.filter((p) => p.id !== id);
      setCustomPresets(next);
      saveCustomPresets(next);
      if (presetId === id) setPresetId(null);
    },
    [customPresets, presetId],
  );

  const saveAppSettings = useCallback(async (next: AppSettings) => {
    setSettings(next);
    await voicePluginApi.saveSettings(next);
  }, []);

  const openHelp = useCallback((_guide?: string) => {
    /* full guides remain in standalone Better Voice */
  }, []);

  return {
    t,
    locale,
    view,
    setView,
    openHelp,
    running,
    busy,
    error,
    enabled,
    strength,
    model,
    models,
    inputs,
    outputs,
    inputDevice,
    outputDevice,
    monitorEnabled,
    monitorPoint,
    eqEnabled,
    eqBands,
    eqFreqs,
    agcEnabled,
    agcTarget,
    micGain,
    fxEnabled,
    fxEffect,
    fxIntensity,
    presets,
    presetId,
    editingPreset,
    setEditingPreset,
    settings,
    setInputDevice,
    setOutputDevice,
    refreshDevices,
    start,
    stop,
    applyStrength,
    applyEnabled,
    applyModel,
    applyMonitor,
    applyMonitorPoint,
    applyScene,
    applyEqBands,
    applyEqEnabled,
    applyAgcEnabled,
    applyAgcTarget,
    applyMicGain,
    applyFxEnabled,
    applyFxEffect,
    toggleFx,
    applyFxIntensity,
    openPresetEditor,
    saveEditingPreset,
    deleteCustomPreset,
    saveAppSettings,
    virtualRoute,
    cableBusy,
    cableMessage,
    setCableMessage,
    installVBCable: async () => {
      setCableBusy(true);
      setCableMessage(null);
      try {
        const result = await voicePluginApi.installVBCable();
        setCableMessage(result.message);
        await refreshVirtualRoute();
        await refreshDevices();
        if (result.cableInstalled && result.ok) {
          const status = await voicePluginApi.getVirtualRouteStatus();
          if (status.cableInput) setOutputDevice(status.cableInput);
        }
        return result;
      } catch (e) {
        const msg = String(e);
        setCableMessage(msg);
        throw e;
      } finally {
        setCableBusy(false);
      }
    },
    uninstallVBCable: async () => {
      setCableBusy(true);
      setCableMessage(null);
      try {
        const result = await voicePluginApi.uninstallVBCable();
        setCableMessage(result.message);
        await refreshVirtualRoute();
        await refreshDevices();
        return result;
      } catch (e) {
        const msg = String(e);
        setCableMessage(msg);
        throw e;
      } finally {
        setCableBusy(false);
      }
    },
  };
}

export type IslandVoiceApp = ReturnType<typeof useIslandVoiceApp>;

function pickPreferredInput(devices: string[]) {
  const hit = devices.find((d) => /maono.*mic/i.test(d)) ?? devices.find((d) => /mic/i.test(d));
  return hit ?? devices[0] ?? "";
}

function pickPreferredOutput(devices: string[]) {
  // Prefer VB-Cable Input only — no VoiceMeeter app required.
  const hit = devices.find((d) => /cable input/i.test(d));
  return hit ?? devices[0] ?? "";
}
