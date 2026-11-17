# Interface themes

Glass adapts the frosted rim, low-density particles, button sheen and ASCII scenes from [the T3 Code design work](codex://threads/01a1decb-6424-7e60-b40f-38835bc1774a). It uses the current Music Island layouts and actions. Classic remains the default, including for older or unknown configuration values. Glass opens with foxes unless a preview scene has already been chosen. The settings color scheme, color palette and dictation artwork are separate choices.

The system follows the [Uber Base Web theme model](https://github.com/uber/baseweb/blob/main/documentation-site/pages/guides/theming.mdx): theme inputs resolve to semantic roles that production components consume. Glass follows [Apple’s materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) in keeping text areas legible and honoring reduced transparency.

Glass uses Segoe UI Variable Text and the system fallback stack for the Windows UI. The smaller controls use a shallow 3.5 px blur and one brief edge sweep. Fox and manta previews use the source ASCII shapes with fewer animals and a 24 fps cap. A separate CSS particle layer drifts down inside the expanded island and in the focused search field. Reduced motion and reduced transparency turn off that particle layer.

The neutral dark ramp comes from the Codex screenshot: canvas `#232322`, content `#2d2d2b`, raised controls `#353533`. Keep outer settings wrappers flat and apply the bevel to interactive controls and the selected menu segment. Shared roles define pill controls, 24 px groups and 36 px bottom corners on the island. The island plate uses an achromatic fill. Preset colors go on controls and the fill of the progress strip.

Color presets use T3 Code's side-by-side light and dark previews. Each preset has a primary and a secondary color in both schemes. The existing custom accent remains available under its own option. Material, color palette and preview scene are saved separately.

| Stage | Implementation | Independent review gate |
| --- | --- | --- |
| 1. Foundations | Stable theme registry, stored ID, semantic color, typography, density, radii and material tokens | Compare Classic against the baseline; check effective contrast and light/dark variants before styling components |
| 2. Atoms and molecules | Reuse settings buttons, navigation, input/search, picker, dialog and surface; adapt the reference highlights | Check press, focus, disabled, open, bilingual labels and narrow layout in the workshop |
| 3. Settings screens | Appearance, taskbar, source, limits, system and about; then Dictation and Better Voice | Switch in the real SettingsWindow; verify navigation, preserved selection and that themed portals work |
| 4. Island and motion | Existing island/card geometry; one shared renderer for the editor/activation surfaces, with fox or manta | Review both scenes, drag and keyboard states, overlays and reduced motion/transparency |
| 5. Performance and build | Cap rendering cost, verify idle/hidden behavior, run frontend and workshop checks and build portable Windows via Actions | Review the exact source commit and verify the downloaded EXE SHA-256; smoke the native UI at Windows DPI |

The implementation agent owns preference integration and component reuse, the motion agent owns the shared renderer, and an independent reviewer verifies each stage. The design lead owns visual direction, Storybook coverage and integration.

To add a theme, register its stable ID and translations, provide its semantic role overrides, and add a workshop state with the real components. Extend the renderer registry only if the theme has different artwork. Keep the same application structure and native window sizes; density roles are for component styling. Review the default and the new theme together before producing a build.
