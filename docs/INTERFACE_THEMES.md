# Island appearance

Music Island has one graphite settings window. Appearance opens on the live island and its draggable controls. Below the catalog, choose Classic or Glass, then a color palette or a custom accent. The monitor and opening delay are available in the same panel. Glass adds a switch for the playback wave.

The island material and palette apply to the native top-edge island, its attached controls and its previews. Settings, Better Voice, Dictation, onboarding chrome, dialogs and the taskbar player use the regular dark components, container padding and typography. Dictation's own recorder appearance is an independent setting. Existing profiles keep their chosen island material, palette and layout. The former settings color-scheme preference is removed on migration.

## Preview background

Both island themes use the ASCII fox scene in the editor and other preview backgrounds. The shared renderer draws up to 24 frames per second while visible. Reduced motion uses a still frame. The scene is independent of the optional music wave.

## Playback wave

Glass draws two soft wave fronts in artwork colors. Their brightness is independent of the audio level. With Direct Yandex Music connected and process-audio consent enabled, bass attacks gently change the speed and vertical shape. The speed multiplier is capped at 1.14. The response uses separate attack and release smoothing, corrected for elapsed time. [Butterchurn AudioLevels](https://github.com/jberg/butterchurn/blob/fbac2f6bab62fd9c6a50ebbeb29359c5eb05903e/src/audio/audioLevels.js#L75-L109) · [Third-party notice](../THIRD_PARTY_NOTICES.md)

The player filters stale audio events when tracks change. A lost audio heartbeat triggers a retry while the island stays open. Pause fades the wave and stops capture. System reduced transparency and reduced motion are respected. The falling particles and artwork-colored seek bar are independent of the bass envelope.

## Extending the materials

Add a stable ID to `INTERFACE_THEMES` in `src/shared/lib/interfaceTheme.ts`, a Russian and English label, a base material and any token overrides in `roles`. The Appearance radio group reads the registry and the CSS build emits those roles at the island's theme scope. Declare `playbackWave` for materials that support it.

The Foundations / InterfaceTheme story applies a third, workshop-only material to the production player inside a regular settings window. Screens / Settings checks keyboard selection, persistence, layout order and the surrounding window's computed typography, colors and spacing.
