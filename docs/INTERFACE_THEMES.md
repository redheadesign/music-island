# Interface themes

Glass adapts the frosted rim, low-density particles, button sheen and ASCII scenes from [the T3 Code design work](codex://threads/01a1decb-6424-7e60-b40f-38835bc1774a). It uses the current Music Island layouts and actions. Classic remains the default, including for older or unknown configuration values. The settings color scheme, accent and dictation artwork remain separate choices.

The system follows the [Uber Base Web theme model](https://github.com/uber/baseweb/blob/main/documentation-site/pages/guides/theming.mdx): theme inputs resolve to semantic roles that production components consume. Glass follows [Apple’s materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) in keeping text areas legible and honoring reduced transparency.

Glass uses Segoe UI Variable Text and the system fallback stack for the Windows UI. The source composer uses bundled Inter. The smaller Music Island controls use a shallow 3.5 px blur and one brief edge sweep. The preview background uses the source ASCII shapes with fewer animals, at most 24 frames per second, and a separate pixel budget.

| Stage | Implementation | Independent review gate |
| --- | --- | --- |
| 1. Foundations | Stable theme registry, stored ID, semantic color, typography, density, radii and material tokens | Compare Classic against the baseline; check effective contrast and light/dark variants before styling components |
| 2. Atoms and molecules | Reuse settings buttons, navigation, input/search, picker, dialog and surface; adapt the reference highlights | Check press, focus, disabled, open, bilingual labels and narrow layout in the workshop |
| 3. Settings screens | Appearance, taskbar, source, limits, system and about; then Dictation and Better Voice | Switch in the real SettingsWindow; verify navigation, preserved selection and that themed portals work |
| 4. Island and motion | Existing island/card geometry; one shared renderer for the editor/activation surfaces, with fox or manta | Review both scenes, drag and keyboard states, overlays and reduced motion/transparency |
| 5. Performance and build | Cap rendering cost, verify idle/hidden behavior, run frontend and workshop checks and build portable Windows via Actions | Review the exact source commit and verify the downloaded EXE SHA-256; smoke the native UI at Windows DPI |

The implementation agent owns preference integration and component reuse, the motion agent owns the shared renderer, and an independent reviewer verifies each stage. The design lead owns visual direction, Storybook coverage and integration.

To add a theme, register its stable ID and translations, provide its semantic role overrides, and add a workshop state with the real components. Extend the renderer registry only if the theme has different artwork. Keep the same application structure and native window sizes; density roles are for component styling. Review the default and the new theme together before producing a build.
