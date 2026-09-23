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
- Onboarding uses one idea per screen, a stable action area and a separate brighter Warp preset. Its UI is demonstrative except for the final explicit autostart choice.
- Ripple direction is outward for Play/Like and inward for Pause/Unlike; both fade fully within 420 ms. Button geometry and authoritative player state remain independent.

## Spacing and interaction polish

- Keep section panels in auxiliary views. Appearance groups monitor, accent and
  delay controls on one panel; its live preview and catalog keep their own layout.
  Taskbar uses a feature switch panel, the preview/catalog, and a size panel,
  separated by 20px. Do not nest an extra padded panel around that entire editor.
- The model recommendation sits next to the title and may wrap with it. Size is
  a non-shrinking top-right value; selection and memory state belong below the
  capability line. `SearchField` owns a single surface, icon, focus and clear action.
- Presets: orange `#F76100`, ochre `#b98916`, blue `#548dec`, teal `#28a39d`,
  green `#56a36b`, violet `#9d7ae5`, rose `#d8648d`. Existing custom/stored colors
  are preserved. Preset marks meet 3:1 against white and graphite `#303030`;
  primary button ink chooses black or white for at least 4.5:1 contrast.
- `--drop-zone-ready` / `--drop-zone-active` control the shared accent treatment.
  Only compatible drop targets light up. Both editors use `LayoutDragGhost` and
  viewport geometry, including the actual SVG and the original grab point.

## Brand mark and introductory copy

Use `AppLogo` with the canonical SVG and a square, transparent image box. The
portrait is clipped inside the SVG's central circle. Do not apply rounded corners
to the outer image: the four orange tips are part of the mark. Check 16–256px in
Atoms/AppLogo and the About/onboarding screens in both themes.

Introductory copy names an action and result: control music, customize the island,
speak instead of typing. Explain a recognition download before using the technical
word “model”. The release-only dark/light wipe does not add a new app control.
