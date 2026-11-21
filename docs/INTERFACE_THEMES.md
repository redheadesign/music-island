# Island appearance

Music Island has one graphite settings window. Appearance opens on the live island and its draggable controls. Below the catalog, choose Classic or Glass, then a color palette or a custom accent. The monitor and opening delay are available in the same panel. Glass adds a switch for the playback wave.

The island material also applies to the floating dictation capsule. Both previews use the production surfaces. Classic, Waves and Fox in Dictation choose the recorder artwork independently, so switching the island material keeps the selected artwork and recording session. Settings pages, onboarding, dialogs and the taskbar player use the regular graphite controls and spacing. Existing profiles keep their chosen island material, palette and layout. The former settings color-scheme preference is removed on migration.

## Glass

The floating controls use one frosted surface behind the content. Artwork, text and buttons are drawn above it. This follows Apple's regular material for controls over unpredictable backgrounds. Smaller controls use local highlights and fills to keep labels, keyboard focus and playback state legible. [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) · [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

Glisse supplies the optical edge in WebView2 and in the browser previews. The dependency is bundled with the app. [Glisse source](https://github.com/0kzh/glisse/tree/4922c852a6866ee9991d2f8c715bb1cfbe7aa2b9) · [Third-party notices](../THIRD_PARTY_NOTICES.md)

On Windows 11, the transparent island and recorder windows report their visible surface geometry to Windows Composition. Its host backdrop brush samples and blurs the desktop inside those silhouettes. The WebView receives an availability flag. The browser preview uses its own page backdrop. With Windows transparency effects disabled, high contrast enabled, or on a Windows version without host backdrop support, the native windows use a solid reading surface. [Windows host backdrop brush](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute)

## Preview background

Both island themes use the ASCII fox scene in the editor and other preview backgrounds. The shared renderer draws up to 24 frames per second while visible. Reduced motion uses a still frame. The scene is independent of the optional music wave.

## Playback wave

Glass draws two soft wave fronts in artwork colors. Their brightness is independent of the audio level. With Direct Yandex Music connected and process-audio consent enabled, bass attacks gently change the speed and vertical shape. The speed multiplier is capped at 1.14. The response uses separate attack and release smoothing, corrected for elapsed time. [Butterchurn AudioLevels](https://github.com/jberg/butterchurn/blob/fbac2f6bab62fd9c6a50ebbeb29359c5eb05903e/src/audio/audioLevels.js#L75-L109) · [Third-party notice](../THIRD_PARTY_NOTICES.md)

The player filters stale audio events when tracks change. A lost audio heartbeat triggers a retry while the island stays open. Pause fades the wave and stops capture. System reduced transparency and reduced motion are respected. The falling particles and artwork-colored seek bar are independent of the bass envelope.

## Extending the materials

Add a stable ID to `INTERFACE_THEMES` in `src/shared/lib/interfaceTheme.ts`, a Russian and English label, a base material and any token overrides in `roles`. The Appearance radio group reads the registry and the CSS build emits those roles at the island's theme scope. Declare `playbackWave` for materials that support it.

The Foundations / InterfaceTheme story applies a third, workshop-only material to the production player inside a regular settings window. Screens / Settings checks keyboard selection, persistence, layout order and the surrounding window's computed typography, colors and spacing.
