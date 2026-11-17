# Assets and licences

Every third-party asset shipped with the game is listed here. Only add CC0 assets, or ones whose licence allows redistribution, after reading the licence.

| Asset | Source | Licence | Used for |
|---|---|---|---|
| Pixelify Sans (font) | [@fontsource/pixelify-sans](https://www.npmjs.com/package/@fontsource/pixelify-sans); © 2021 The Pixelify Sans Project Authors ([github.com/eifetx/Pixelify-Sans](https://github.com/eifetx/Pixelify-Sans)) | SIL Open Font License 1.1 (`node_modules/@fontsource/pixelify-sans/LICENSE`) | All UI text. Self-hosted so the game works offline. |

## Made for this game (no third-party licence)
- All 3D models are original, made for this game: built in code (terrain, water, buildings, far trees) or made in
  Blender by Claude from scripts in `scripts/blender/` (huts, villagers up close, the god hand, near trees, pets), exported to
  `src/assets/models/*.json`. Blender (GPL) is only the tool: its licence does not cover what it makes.
- Toolbar icons: pixel sprites from the original prototype (`src/ui/icons.ts`).
- Pet portraits: the prototype's pixel pets (`src/ui/petcard.ts`).
- App icons (`public/icons/*.png`): a pixel-art hut drawn in code by `scripts/icons.mjs`.
- Sound effects and music: synthesised at runtime with WebAudio (`src/audio/audio.ts`).

## Villager voices (`src/assets/voices/*.ogg`)
- **Lines:** written for this game in a made-up language (`src/audio/voice-lines.json`; recording sheet in `voices/VOICE_SHEET.md`).
- **Model and licence:** VoxCPM2 ([openbmb/VoxCPM2](https://huggingface.co/openbmb/VoxCPM2), revision `7936080b`, Apache-2.0 on its model card), run through the `voxcpm` 2.0.3 package (Apache-2.0).
- **How they were made:** by Claude, in a cloud session, at the project owner's request (`scripts/voicegen/`).
  - **Voices:** each of the five voices was *designed* from its text description in the table, so no real person's voice is used. The designed reference clips are kept in `voices/refs/` (FLAC), so new lines can be made in the same voices.
  - **Lines:** every line was spoken in its voice from that reference, with its delivery note as a style instruction. The best of three takes was kept, judged by an automatic check (OpenAI Whisper base, MIT, used only for checking and not shipped).
- **Your own takes:** the owner can replace any line with a take made in [VoiceStudio](https://github.com/debpalash/VoiceStudio) with the same VoxCPM2 engine. The app is AGPL-3.0, which covers the app, not its outputs.
- **Excluded:** VoiceStudio's default OmniVoice engine (non-commercial weights) and Llama-OuteTTS (non-commercial). Chatterbox is excluded too, as its licence was unclear.
- **Caveat:** before any commercial release, re-check the VoxCPM2 model card at the revision above.
- **Processing:** `npm run voices` trims, levels and converts the clips.

## Pet sounds (`src/assets/voices/{sheep,monkey,chicken}_*.ogg`)
- Made the same way as the villager voices: VoxCPM2 (Apache-2.0), by Claude in the cloud, at the project owner's request.
- Each pet is a cartoon voice *designed* from a text description and its own noises, not an animal or a person recorded anywhere. Its reference is in `voices/refs/`.

## Code dependencies
three (MIT), @dimforge/rapier3d-compat (Apache-2.0), vite (MIT), vite-plugin-pwa and Workbox (MIT), vitest (MIT), typescript (Apache-2.0).
