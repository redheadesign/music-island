# Interface themes

Glass adapts the frosted rim, low-density particles, button sheen and ASCII scenes from [the T3 Code design work](codex://threads/01a1decb-6424-7e60-b40f-38835bc1774a). It uses the current Music Island layouts and actions. Fresh profiles start with Glass. Existing profiles switch to Glass once on the first start after this update. A later choice of Classic persists across restarts. Glass opens with foxes unless a preview scene has already been chosen. The settings color scheme, color palette and dictation artwork are separate choices.

The system follows the [Uber Base Web theme model](https://github.com/uber/baseweb/blob/main/documentation-site/pages/guides/theming.mdx): theme inputs resolve to semantic roles that production components consume. Glass follows [Apple’s materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) in keeping text areas legible and honoring reduced transparency.

Glass uses Segoe UI Variable Text and the system fallback stack for the Windows UI. Controls use a shallow 3.5 px blur and share an edge treatment with the player controls. On hover, one masked SVG filter bends the WebView backdrop around the rim. The icon or label stays outside the filter. Reduced motion, reduced transparency and forced colors disable pointer tracking. The light treatment follows the [Liquid Glass Button reference](https://21st.dev/@designali-in/components/liquid-glass-button).

The compact ASCII fox scene distributes four to six foxes across two lanes. Both animal scenes keep the same 24 fps cap. In the expanded player, one soft wave layer sits behind the controls, tinted by the cover and accompanied by the existing particles. The upper edge shows a stationary indicator before expansion. Hidden documents pause the waves and particles. Reduced motion leaves the wave layer static and hides particles. Reduced transparency disables both effects. The wave shape follows the [Shader Animation reference](https://21st.dev/@designali-in/components/shader-animation).

The neutral dark ramp comes from the Codex screenshot. The canvas uses `#232322`, content uses `#2d2d2b` and raised controls use `#353533`. Menu and settings group faces use 70% opacity. The scope and language tracks use 45%. Menus open from the edge nearest the trigger. The Glass player shows the track title and time above a separate bright rail. The whole control accepts seek input. Both rails use the cover colors and fall back to neutral without usable artwork. [Motion review](TRANSITIONS_MOTION_REVIEW.md)

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
