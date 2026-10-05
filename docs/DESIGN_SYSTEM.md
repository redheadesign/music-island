# Auxiliary interface foundations

The graphite reference applies to Settings, onboarding and new auxiliary views.
It does not redefine the island, its satellites, the Win32 taskbar player or real
island components inside previews. The approved fox composition and Paper Warp stay.

## Token ownership

`src/shared/styles/tokens.css` is the source of truth. Use semantic tokens, not
new per-feature palettes. `.auxiliary-ui`, the settings root, onboarding and
auxiliary dialogs establish their material; `data-color-scheme="light"` overrides
it. `.island-root` restores the island material even inside a light preview.
Accent and locale remain user preferences.

| Role | Token | Dark | Light |
| --- | --- | --- | --- |
| Window canvas | `--surface-canvas` | `#1E1E1E` | `#F3F3F5` |
| Main panel | `--surface-panel` | `#272727` | `#FFFFFF` |
| Nested surface / active navigation | `--surface-raised` | `#303030` | `#E9E9ED` |
| Control | `--control-surface` | `#343434` | `rgba(24,24,27,.07)` |
| Control hover | `--control-surface-hover` | `#444444` | `rgba(24,24,27,.12)` |
| Primary text | `--fg-primary` | `#F5F5F5` | `#1D1D1F` |
| Secondary text | `--fg-secondary` | `#B7B7B7` | `#5E5E66` |

Tone, spacing and typography establish hierarchy. Do not add decorative strokes
or inset highlights to every section. Keyboard focus uses `--focus-ring` and
`--focus-offset`, and must remain visible in both themes.

Shared spacing uses the `--space-*` scale; radii use `--radius-*`. Caption, label,
body, title and display text use 12/13/14/20/28 CSS pixels and the corresponding
`--leading-*` tokens. Standard controls are 40px high; compact actions are 32px.
Navigation targets are at least 44px. Native WebView scaling handles Windows DPI.

## Reusable controls

`shared/ui/SettingsControls.tsx` owns Button (primary/secondary/ghost/danger),
Toggle, Switch, FeatureToggle, SettingRow, SettingsSection, Input, SearchField, Textarea and
SettingsNavigation. Music Island, Better Voice and Dictation use the same
navigation component and state styling. A prominent feature switch pairs its
state with a short explanation; subordinate options use ordinary Switch rows.

`shared/ui/Select.tsx` owns the shared select, including keyboard handling,
focus restoration and a themed portal. The Better Voice `DarkSelect` export is
only a compatibility alias. Do not implement another dropdown for a new feature.
`SettingsIcons.ts` exports individual Phosphor icons: regular for idle navigation,
filled for selected items and prominent feature actions. The island keeps its
accepted icon set, with the requested filled settings gear.

Specialized media, segmented and fox controls retain their interaction contracts.
Reuse their production implementations instead of making settings-only copies.

## Settings shell

`SettingsWindow` is used by the application and Storybook. `settings.css` owns the
settings layout; `App.css` must not define another settings scroll container.
The native titlebar, scope selector and left navigation remain fixed. Only
`[data-settings-scroll]` on the right scrolls. Every flex ancestor has a bounded
height and `min-height: 0`; content clips at the window boundary, with bottom
padding inside the scroller. A layout effect resets scrolling before paint when
the page key changes; selecting the current page preserves its position.
Changing scope resets its destination to Appearance, Microphone and effects, or
General. Re-selecting the active scope does not reset the current page or scroll.

Data and diagnostics remain shared Music Island pages. The developer-mode switch
lives in About; enabling it exposes a separate developer page. About uses the real
app SVG and an onboarding action with pending/error feedback.

## Motion

- Page changes: one short 180ms entrance with 4px travel, no staggered text queue.
- Play/Pause: continuous SVG geometry morph over 300ms; commands dispatch immediately.
- Play and Like feedback: `IslandFeedback` owns a 420ms wave across the island
  background, clipped to the island. Pointer origin follows the click; keyboard
  activation uses the button center. Play has no local ripple or scale bounce.
- Like: controlled fill/reverse follows actual player state.
- Progress: accepted 360ms exit and 180ms entrance affect only the fill.
- System or user reduced motion suppresses spatial feedback. Hidden surfaces
  cancel their active waves; rapid presses do not create an unbounded animation queue.

## Review

Use production components in Storybook, including error, empty, loading, disabled,
light, RU/EN and reduced-motion states. Start with Appearance, Dictation models,
Onboarding and Atoms/SettingsControls. Compare screenshots at the same scale,
then remove unnecessary containers, rules and text. This applies the publicly
accessible direction from [Anshu Chimala's article](https://www.lennysnewsletter.com/p/how-to-turn-your-ai-into-a-world);
the subscriber-only portion was not reviewed. Mobile references inform hierarchy
and feedback, not the desktop navigation geometry.

## Release 3 refinements

- `--shadow-popover`: dark `0 8px 24px rgba(0,0,0,.22)`; light `0 6px 20px rgba(28,28,32,.12)`. Popovers never reuse the larger panel shadow. Select and ActionMenu share portal placement, theme propagation, focus, Escape and keyboard navigation.
- `StatusChip appearance="flat"` removes glass and border for auxiliary UI. Accent badges use the paired `--badge-accent-surface` / `--badge-accent-text` tokens for stable contrast in both themes. Existing glass chips are preserved.
- ModelCard owns title/size, one language/capability line, recommendation/selection statuses and the action footer. Selected models do not show a disabled Use button. Import is secondary to downloading.
- Onboarding uses one idea per screen, a stable action area and the shared Warp palette with its existing softer geometry. Its UI is demonstrative except for the final explicit autostart choice.
- Ripple direction is outward for Play/Like and inward for Pause/Unlike; both fade fully within 420 ms. Button geometry and authoritative player state remain independent.

## Spacing and interaction polish

- Keep section panels in auxiliary views. Appearance groups monitor, accent and
  delay controls on one panel; its live preview and catalog keep their own layout.
  Taskbar combines its switch and corner scaling with the gradient preview;
  the element catalog follows after 20px. Do not nest an extra padded panel
  around that entire editor.
- The model recommendation sits next to the title and may wrap with it. Size is
  a non-shrinking top-right value; selection and memory state belong below the
  capability line. `SearchField` owns a single surface, icon, focus and clear action.
- Presets: orange `#F76100`, ochre `#b98916`, blue `#548dec`, teal `#28a39d`,
  green `#56a36b`, violet `#9d7ae5`, rose `#d8648d`. Existing custom/stored colors
  are preserved. Preset marks meet 3:1 against white and graphite `#303030`;
  primary button ink chooses black or white for at least 4.5:1 contrast.
- `--drop-zone-ready` / `--drop-zone-active` control the shared accent treatment.
  `--drag-indicator` supplies the full-opacity line color in both editors,
  including the island's nested theme. Lines compensate for preview scale.
  Only compatible drop targets light up. Both editors use `LayoutDragGhost` and
  viewport geometry, including the actual SVG and the original grab point.

## Unified settings pass · October 2026

- Surface hierarchy: window canvas → panel → raised nested content → control.
  Decorative `--border-subtle`, `--border-strong`, and `--highlight-inset` tokens
  were removed. Functional slider tracks use `--control-track`; scrollbars use
  muted foreground. Keep keyboard focus, drop indicators and forced colors.
- `SettingRow` is a labelled group, not a label wrapped around several controls.
  Direct fields receive `aria-labelledby` and hint references. Compound controls
  must provide names to their own fields; action buttons keep their own labels.
- `SettingsIconButton` uses 40px or compact 32px targets, an accessible label and
  matching tooltip. Busy actions show a spinner and prevent duplicate activation;
  destructive actions use the danger variant. Use Phosphor icons.
- `Notice` owns info/success/warning/danger surfaces, icon, text and optional
  action. Errors use `role="alert"`; ordinary updates use `role="status"`.
  Text remains readable foreground; the icon and surface carry semantic color.
- Gradient preview controls use the graphite palette in both settings themes.
  The taskbar switch, dictation switch and quota style selector belong to
  the preview. Other settings follow in their own panels. Music sources each
  have their own panel without a shared outer plate.
- `PreviewScale` keeps a local draft during a gesture, commits on release,
  cancels on Escape/pointer cancellation, and supports arrows, Home/End and reset.
  `projectPreviewScale` is shared with the island editor. Existing per-widget
  bounds and stored settings are unchanged.
- `PreviewResizeHandle` reuses the island's corner grip across island, taskbar
  and quota previews. Taskbar/quota use a half-sized 11.5 px visual, retaining
  the 30 px interaction target; the island keeps its 23 px visual. Do not replace
  it with an arrow icon. `PreviewDimensions.css` shares the island's 11 px / 1.4
  regular readout typography across all three previews.
- Width/scale readouts occupy a quiet centered row immediately below the shader
  preview, on the Settings canvas. Use theme text tokens and the same 11 px
  regular typography in all three editors. No plate, text shadow or blend effect:
  the user rejected both the plate and shadow approaches. No reset icon beside
  scale. The taskbar editor's top reset restores layout and scale together.
- `StatefulWarpSurface` owns the accepted Better Voice running/resting material
  including its opaque graphite base (panel surface in dark Settings, #18191c
  in light Settings), shader opacity 1/.14 and speed 1.1625/.225. Better Voice,
  taskbar and dictation use the same component. Only the shader changes opacity;
  the base must remain opaque to avoid inheriting a warm brown stage underneath.
- Every Warp uses the `Screens/Release3/Dictation` palette from `warpPreset.ts`:
  #231c2c / #ad867e / #ebc8a6 / #c4adf0. Enabled surfaces and ordinary widget
  previews display it at full opacity; only disabled surfaces are dimmed.
  The enable speed increase is half the former .225 → 2.1 increase.
- Quota satellites appear only with the expanded island. The former
  `usageAlwaysVisible` preference is no longer exposed or read.
- Models: language/capability, recommendation, selection/memory, primary action,
  red delete icon with confirmation. No details action or redundant post-recording
  caption. The page action menu contains Handy import and custom model import.
- Installed-model badges and the delete icon share one footer row. History
  retention and count are one unplated control row, wrapping only when necessary.
  The selected-model badge uses the semantic success surface and text in both themes.
- Dictation starts with its real overlay view and a dedicated shortcuts panel.
  Advanced settings group sound, recording, insertion, compute, Windows and
  diagnostics. Number inputs commit valid bounded values; units stay outside.
- Dictation preview is always compact, with no style selector. It demonstrates
  recording → transcription → done on a loop without changing recording settings
  or accessing the microphone. Pause while hidden/inactive; reduced motion uses
  a static recording state. About's first section has no outer panel; secondary
  actions use regular settings rows with the standard section padding.
- `WarpSurfaceProvider` owns one renderer inside Settings. `WarpSurface` moves
  its stable host to the visible page, preserving canvas/GPU resources. With no
  active slot it parks paused. Outside a provider it renders independently for
  component review and frame exports. Existing visibility and reduced-motion
  controls remain in `WarpMaterial`.

This pass uses the relevant [deslop](https://github.com/mishanaer/deslop)
primitives and Sasha writing guidance within the accepted Music Island palette,
typography, shader preset and fox composition.

## Brand mark and introductory copy

Use `AppLogo` with the canonical SVG and a square, transparent image box. The
portrait is clipped inside the SVG's central circle. Do not apply rounded corners
to the outer image: the four orange tips are part of the mark. Check 16–256px in
Atoms/AppLogo and the About/onboarding screens in both themes.

Introductory copy names an action and result: control music, customize the island,
speak instead of typing. Explain a recognition download before using the technical
word “model”. The release-only dark/light wipe does not add a new app control.
