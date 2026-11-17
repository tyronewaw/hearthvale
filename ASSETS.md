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
- **Sheep and hen: real animals** (phase 17, the owner's pick). Each clip was cut from a public-domain field recording on
  Wikimedia Commons, by `scripts/voicegen/animals.py`. Some clips were also re-pitched, muffled or joined. The originals came
  from pdsounds.org; the full list with links is in `voices/animal-sources.json`.

  | Recording | Recordist | Licence | Used for |
  |---|---|---|---|
  | [Sheep bleating](https://commons.wikimedia.org/wiki/File:Sheep_bleating.ogg) | earthcalling | Public domain | sheep |
  | [Corner of a sheep field in summer](https://commons.wikimedia.org/wiki/File:Corner_of_a_sheep_field_in_summer.ogg) | earthcalling | Public domain | sheep |
  | [Herd of goats bleating](https://commons.wikimedia.org/wiki/File:Herd_of_goats_bleating.ogg) | stephan | Public domain | sheep |
  | [Hens leaving coop](https://commons.wikimedia.org/wiki/File:Hens_leaving_coop.ogg) | alys | Public domain | hen |
  | [Small rooster crowing](https://commons.wikimedia.org/wiki/File:Small_rooster_crowing.ogg) | alys | Public domain | hen (cheer) |

  The cutter checks each call with an AudioSet sound classifier (MIT/ast-finetuned-audioset-10-10-0.4593, BSD-3-Clause). The
  classifier is only used for checking and is not shipped.
- **Monkey: a cartoon voice** (the owner's pick: real sheep and hen, cartoon monkey). It was made the same way as the villager
  voices: VoxCPM2 (Apache-2.0), by Claude in the cloud, at the project owner's request. It is *designed* from a text
  description and its own noises, not a recorded animal or person. Its reference is in `voices/refs/`.
- **Real monkeys, if wanted later:** openly licensed wild recordings exist on [iNaturalist](https://www.inaturalist.org)
  (capuchins, spider monkeys, gibbons; CC0 or CC BY 4.0 per sound). `animals.py` can cut them, but CC-BY ones need their
  recordists credited here.

## Code dependencies
three (MIT), @dimforge/rapier3d-compat (Apache-2.0), vite (MIT), vite-plugin-pwa and Workbox (MIT), vitest (MIT), typescript (Apache-2.0).
