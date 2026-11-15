# Assets and licences

Every third-party asset shipped with the game is listed here. Only add CC0 assets, or ones whose licence allows redistribution, after reading the licence.

| Asset | Source | Licence | Used for |
|---|---|---|---|
| Pixelify Sans (font) | [@fontsource/pixelify-sans](https://www.npmjs.com/package/@fontsource/pixelify-sans); © 2021 The Pixelify Sans Project Authors ([github.com/eifetx/Pixelify-Sans](https://github.com/eifetx/Pixelify-Sans)) | SIL Open Font License 1.1 (`node_modules/@fontsource/pixelify-sans/LICENSE`) | All UI text. Self-hosted so the game works offline. |

## Made for this game (no third-party licence)
- All 3D models are built in code (terrain so far; huts, villagers, pets and the hand in later phases).
- Toolbar icons: pixel sprites from the original prototype (`src/ui/icons.ts`).

## Code dependencies
three (MIT), @dimforge/rapier3d-compat (Apache-2.0), vite (MIT), vitest (MIT), typescript (Apache-2.0).
