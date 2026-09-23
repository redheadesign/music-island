# Music Island identity

Use `src/shared/ui/AppLogo.tsx`, with one explicit role:

- `standard` (default): original orange silhouette with white center, `assets/app-icon.svg`. Tray, EXE, onboarding, small video footer and ordinary product placements
- `intro`: original white launch mark, `assets/app-icon-intro.svg`. Intro movement is unchanged
- `portrait`: About and large video end cards only, `assets/app-icon-portrait.svg`

Never round or clip the outside image: the four outer tips belong to the mark.
The portrait SVG alone clips the photograph to the existing center geometry.
Do not place the portrait in small controls or functional app icon assets.

The supplied original photograph is unchanged and stays outside the repository.
The agreed crop is x=700, y=100, width=2880, height=2880 in the 3888×5184 original.
`scripts/generate-portrait-logo.mjs <original.jpg>` creates a 768×768 WebP at
quality 86, then embeds it into the SVG. Current WebP is 23,728 bytes and complete
portrait SVG is 33,261 bytes, below the 200 KB cap. No face generation/retouching.

`node scripts/generate-icons.mjs` reads only the standard SVG and regenerates
the PNG and native Windows ICO. The portrait is never its input.
Storybook `Atoms/AppLogo` shows all three variants in both themes and small sizes.

Release-only art direction and reproduction: [motion production](MOTION_PRODUCTION.md).
