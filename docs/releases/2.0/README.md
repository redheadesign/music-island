# Music Island 2.0 visuals

Five product scenes rendered from production React components with local, fictional media and usage fixtures. No account information is included.

- [Island layout](01-island.png)
- [Taskbar player](02-taskbar.png)
- [Better Voice](03-voice.png)
- [Assistant limits](04-usage.png)
- [Settings themes](05-settings.png)

The portrait PNGs are 1080 × 1350 and use Russian copy for Telegram. The [post text](../telegram-2.0.md) is prepared separately. The English 1440 × 900 WebP images in [docs/media/v2](../../media/v2/) are used in the repository README.

## Reproduce

Run `npm run storybook` and open `Screens/Release2`. Choose a feature and set `format` to `readme` (English) or `telegram` (Russian). Click **Export PNG**, then **Download PNG**. The export controls are outside the image. Each card contains one headline, one short caption, and the product UI.

The Storybook-only exporter snapshots the Paper shader's current frame, resolves SVG styles and renders the scene without browser screenshot compression. Review the result before replacing release media, particularly video frames, charts and glass surfaces. Reduced motion and fixed sample quotas make the scenes reproducible.
