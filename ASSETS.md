# Assets and licences

Every third-party asset shipped with the game is listed here. Only add CC0 assets, or ones whose licence allows redistribution, after reading the licence.

| Asset | Source | Licence | Used for |
|---|---|---|---|
| Pixelify Sans (font) | [@fontsource/pixelify-sans](https://www.npmjs.com/package/@fontsource/pixelify-sans); © 2021 The Pixelify Sans Project Authors ([github.com/eifetx/Pixelify-Sans](https://github.com/eifetx/Pixelify-Sans)) | SIL Open Font License 1.1 (`node_modules/@fontsource/pixelify-sans/LICENSE`) | All UI text. Self-hosted so the game works offline. |

## Made for this game (no third-party licence)
- All 3D models are built in code: terrain, water, trees, huts and buildings, villagers, and the god hand.
- Toolbar icons: pixel sprites from the original prototype (`src/ui/icons.ts`).
- Pet portraits: the prototype's pixel pets (`src/ui/petcard.ts`).
- App icons (`public/icons/*.png`): a pixel-art hut drawn in code by `scripts/icons.mjs`.
- Sound effects and music: synthesised at runtime with WebAudio (`src/audio/audio.ts`).

## Villager voices (`src/assets/voices/*.ogg`)
- **Lines:** written for this game in a made-up language (`src/audio/voice-lines.json`; recording sheet in `voices/VOICE_SHEET.md`).
- **Generation:** the project owner, on their own PC, in [VoiceStudio](https://github.com/debpalash/VoiceStudio). The app is AGPL-3.0, which covers the app, not its outputs.
- **Model and licence:** the VoxCPM2 model ([openbmb/VoxCPM2](https://huggingface.co/openbmb/VoxCPM2), Apache-2.0 upstream model-card label).
- **Voices:** made with *voice design* from text descriptions, so no real person's voice is cloned.
- **Excluded:** VoiceStudio's default OmniVoice engine (non-commercial weights) and Llama-OuteTTS (non-commercial). Chatterbox is excluded too, as its licence was unclear.
- **Caveat:** VoiceStudio's own inventory notes that upstream licence labels are metadata it hasn't fully reviewed. Before any commercial release, re-check the VoxCPM2 model card at the revision used.
- **Processing:** `npm run voices` trims, levels and converts the clips.

## Code dependencies
three (MIT), @dimforge/rapier3d-compat (Apache-2.0), vite (MIT), vite-plugin-pwa and Workbox (MIT), vitest (MIT), typescript (Apache-2.0).
