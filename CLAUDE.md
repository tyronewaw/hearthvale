# Hearthvale

A cosy 3D god game for the browser, **for PC** (the user's decision: mouse and keyboard first; phones only need to keep working, with no new phone-specific work). It looks like Populous: The Beginning (a small curved planet, terrain you reshape live, round thatched huts, little tribespeople) and plays like Black & White 2 (a physical god hand, a creature you raise and teach). The style is stylised low-poly with soft light. Nobody dies.

- **Design reference:** `legacy/index.html` is the original 2D pixel prototype, unchanged and playable at `/legacy/`. When porting a rule, read it there first; it is the spec.
- **Plan:** an 8-phase rebuild; each phase ends playable and gets its own branch and PR. Done so far: phase 1 (curved wrap-around terrain and land editing), phase 2 (water, sky, day/night, seasons, shadows, trees), phase 3 (huts, villagers, growth, economy, building, saves), phase 4 (the 3D god hand with Rapier physics throws), phase 5 (the god pet) and phase 6 (blessings, quests, sound, prototype save migration). Phase 7 (performance: chunk frustum culling with the bend, tree LOD) and phase 8 (installable PWA that plays offline) are done; all eight planned phases are merged to main. The user chose these and they were built after that:
  - phase 9: pet pen and more tricks
  - phase 10: the Red tribe, won over Black & White style
  - phase 11: land borders on the ground, Red festivals and shrine
  - phase 12: pets look different at each growth stage
  - phase 13: detailed tribal buildings, tribe colours, construction stages
  - phase 14: bigger buildings (2×2 work buildings, a compound for the great lodge)
  - phase 15: villager voices (made-up language; 48 lines made with VoxCPM2 by Claude in the cloud, at the user's request)

  Mobile polish (long-press scold, double-tap build, compact layout) is dropped: the game is PC-only, and nothing should send notifications to the user's phone.

## Commands
- `npm run dev` starts the Vite dev server. Useful URL flags: `?seed=42`, `?sandbox` (tools are free), `?stats` (fps, draw calls, triangles, tier), `?nohelp`, `?q=low|medium|high` (quality tier), `?nobend` (flat world, for debugging).
- `npm run check` runs `tsc --noEmit` and Vitest. It must be green before every commit.
- `npm run build` builds into `dist/`, with the legacy page at `dist/legacy/`.
- `npm run smoke` builds, serves, and plays in headless Chromium through `window.__hv`. It fails on any console error and saves screenshots to `shots/` (gitignored).
- `node scripts/icons.mjs` regenerates `public/icons/*.png` (a pixel-art hut drawn in code) in headless Chromium.
- `npm run perf` measures draw calls, triangles and frame time on the high and medium tiers at three zooms, with a grown village (software GL, so trust the counts, not the ms).
- `npm run buildshots` renders every building (home levels, work buildings, a site at three stages, Red homes) into `shots/buildings.png`, for reviewing building art.
- `npm run petshots` renders every pet species at every growth stage into `shots/pets-growth.png` (3×3), for reviewing pet art.
- `npm run voicesheet` rewrites the villager voice sheet (`voices/`) from `src/audio/voice-lines.json`; `npm run voices -- <zip or folder>` turns recordings (the user's, or `scripts/voicegen/` output) into game clips.
- `npm run voicepreview` strings every voice clip together, sped up as in game, into `shots/voices-preview.mp3` for listening.
- `scripts/voicegen/` (Python, `pip install -r scripts/voicegen/requirements.txt`, about 7 GB with PyTorch plus the 4.7 GB model): `design.py` designs the voices, and `gen.py` makes lines, best of N takes. Usage is in each file's docstring. Use the cloud environment **hearthvale**, which allows HuggingFace (huggingface.co and us.aws.cdn.hf.co).
- `npm run balance` runs a headless scripted player for `DAYS` (default 30) and writes a day-by-day table to `shots/balance.txt`. It takes about 3 s.
- Add `?fresh` to start a new world instead of loading the save, and `?nosave` to stop autosaving.

## Stack
Vite 8, TypeScript 7 (strict), three 0.187 (WebGL2), @dimforge/rapier3d-compat 0.21 (from phase 4), Vitest 5. Pixelify Sans is self-hosted through @fontsource. There is no UI framework: the overlay is plain DOM.

## Architecture
```
src/sim/      pure game rules. No three, DOM, Math.random or imports from other src folders
              (enforced by src/sim/architecture.test.ts).
  world.ts    constants (N=128, MAXH=9, CHUNK=16, DAY=150, TICK=0.1), torus helpers, State type
  rng.ts      seeded xorshift Rng and hash2. All randomness goes through sim.rng.
  terrain.ts  tileFlat, isWater, hAt, cascade, bump, setVertices, level, rise, slopeOk
  worldgen.ts tileable archipelago generator, landmasses, start site
  defs.ts     BN/BMAX/BTH home sizes, ROLES, STRUCTS, TOOLS (ported constants)
  balance.ts  every tunable number ("proto" = the prototype's, "×N" = scaled for 128²)
  events.ts   SimEvent union (terrain, flora, season, toast, sfx, spark, ui)
  flora.ts    tree spread (treeCanGrow, spreadTrees)
  village.ts  the prototype's village rules on the torus: fields, levelFor, recheck, findSpot,
              settlers/residents/workers/builders, production, syncResidents, popCount,
              validSite/placeStruct, the hand's grab/land rules. Works on a Ctx (the Sim).
  save.ts     serialize/deserialize (localStorage hearthvale-v3; maps as base64)
  pet.ts      the god pet (prototype mkPet/startAct/finishAct/stepPet/teach/watchLearn): needs,
              habit-weighted action choice, species help/mischief, tricks, stages, leash, droppings,
              petCatch (trees dropped on it are snacks, gently dropped villagers are playmates)
  blessings.ts bloom / rain / festival effects (tools in defs.TOOLS; the pet's tricks use them too)
  quests.ts   the quest chain (prototype's 13 + pen + tricks), stable ids, remapQuest() for older saves
  migrate.ts  migrateV2(): the prototype's 64² save set into a cleared basin at the planet's centre
  rival.ts    the Red tribe: spawnRival (far shore), beliefRate/stepRival (winning homes over, the
              Red elder levelling land, their festivals and shrine, unity), festivalImpress,
              rivalMood (tooltip advice), fixTribes (pre-tribe saves)
  sim.ts      Sim class: tick() = the prototype's update(); commands useTool, build, grab,
              grabTree/Rock, drop, release/landed; events queue (drain() each frame)
src/render/   three.js only, and it reads sim state
  bend.ts     planet-curve vertex shader patch (`bent(material)`) and JS `bendDrop`
  materials.ts worldMat() = CSM hookup + bend, extendShader(), castsShadow() (bent depth material)
  quality.ts  tiers: low / medium (one shadow map) and high (CSM); auto-detected, ?q= overrides
  sky.ts      day/night: sun/moon key light, hemisphere fill, sky and fog colours, stars, shadows
  water.ts    stylised sea: shore-distance texture (BFS from land, RepeatWrapping) → shallows, foam, sparkle
  flora.ts    instanced trees (3 kinds, canopy + trunk), flowers, rocks; seasonal colours
  clouds.ts   drifting instanced clouds that cast shadows
  kit.ts      model kit: primitives + per-face colours → one merged vertex-coloured geometry; parts added
              with `tint` get a per-vertex tint mask
  models.ts   original tribal designs: huts (6 home levels, plus simpler far-LOD versions), Hearth, Farm,
              Lumber camp, Fishing hut, Shrine, Pet pen; building-site stakes and timber frame; totem
  buildings.ts instanced buildings (one draw call per model, tribe colour per instance), building sites
              in stages, new homes rising in their frame, level-up puffs, home LOD beyond 30 units,
              door glow, night light pools, hearth fire and point light, shrine crystals, crops, totem,
              build ghost, chimney smoke
  villagers.ts per-part instanced villagers (blue tribe), procedural walk/work/wave/sit/swim/held,
              blob shadows, culled to the view, screen-space pick()
  particles.ts pooled particles: lit (smoke, puffs, leaves, splashes) and glowing (sparks, hearts…)
  effects.ts  rain clouds and streaks, festival bunting and lanterns (ours, and the Red tribe's in their colours), fireflies, blessing radius cursor
  border.ts   land borders on the ground: the 0 contour of each tribe's influenceField, as instanced segments (B toggles)
  contour.ts  marching squares on the wrapped vertex grid (pure, tested)
  pets.ts     PetView: sheep / monkey / chicken built in code, a different look per stage (lamb / sheep /
              ram with horns and bell; baby / monkey / grand old monkey with crest, beard, curled tail;
              chick / hen / rooster with tall comb, ruff and tail fan), ×0.6 / ×1.15 / ×1.75 by stage,
              walk cycle, bob, squash-and-stretch, eat/sleep/dance/play poses, nature halo, thought bubble
  hand.ts     the god hand: code-built right hand, jointed fingers, blended poses
              (open, reach, point, grip, hold, stroke, slap), leans with motion, casts a shadow
  scale.ts    sim→world mapping: STEP per level, SEA_FLOOR, WATER_Y, surfaceY/standY
  camera-rig.ts orbit camera around a wrapped focus; zoom also tilts and strengthens the bend
  terrain-mesh.ts 8×8 chunks of 16×16 tiles, flat-shaded with per-triangle colour, seasonal palettes
  renderer.ts owns the scene; routes sim events to terrain, water and flora; hover marker
src/physics/  physics.ts  Rapier world: 64 chunk heightfields on the torus, thrown bodies, buoyancy, settle
  throw.ts    throwVelocity() from the hand's trail; trimTrail()
  ballistic.ts simple arc used before Rapier's WASM loads (and in tests)
src/input/    controls.ts (pointer, wheel, pinch, twist, keys, hold-to-repeat, carry), picking.ts
src/audio/    audio.ts  synthesised WebAudio sound effects and generative music (ported), Sound toggle
  voices.ts villager voice clips: per-villager pitch, distance and pan, gaps, Voices toggle
  voice-lines.json the voices, events and lines (one table for the recording sheet and the game)
src/ui/       hud.ts (HUD, quest panel, toolbar, toasts, modals, win), icons.ts (prototype pixel icons), styles.css,
              petcard.ts (pet card + choose screen; portraits are the prototype's pixel pets)
src/main.ts   bootstrap, fixed-tick loop with speed ×1/2/4, event routing, window.__hv debug hook
scripts/smoke.mjs  Playwright smoke test
legacy/       the 2D prototype (design reference; do not edit)
```

### Key decisions
- **The world is a torus.** It has N×N vertices and no border; tile (x,y) uses corners (x..x+1, y..y+1) wrapped. Always index through `idx()`. Measure distances with `wd()` / `tdist()`, never raw subtraction.
- **Rendering on a torus.** The camera focus stays in [0,N). Each frame, every chunk (and later every entity) is drawn at its nearest image to the focus: `focus + wd(focus, pos)`. Zoom limits, fog and the bend keep the view radius under N/2, so nothing is ever seen twice.
- **The bend is visual only.** `y -= k·r²` around the focus, in a shared GLSL patch on every world material: use `bent(new Material())`. The patch also bends `worldPosition`, so shadows line up. CPU code (picking, screen positions) must subtract `bendDrop(x,z)` to match. Bent meshes set `frustumCulled = false`, because unbent bounds would cull geometry that bends down into view.
- **Cascade is one-directional.** A two-way LIFO cascade is order-dependent: a stale vertex can pull a just-levelled one back down, and the 2D prototype had this latent bug. `cascade(S, q, touched, dir)` only raises (dir 1) or only lowers (dir -1). Mixed edits go through `setVertices`, which runs a raise pass and then a lower pass. A fuzz test guards this.
- **hAt / surfaceY interpolate on the render triangles**, split along (x,y)→(x+1,y+1), so things stand exactly on the drawn surface.
- **Sea level is height 0.** It renders at `SEA_FLOOR` below `WATER_Y`, so shores slope into the water as beaches. Picking hits the water surface over the sea.
- **Fixed tick.** The sim runs at 10 Hz (dt 0.1, the prototype's step, so its tuning numbers carry over). Each frame runs at most 8 ticks. Render interpolation of moving entities arrives with villagers in phase 3.
- **Sim → outside only through events** (`terrain`, `toast`, `sfx`). UI and render never mutate the sim except through its command methods (`useTool`, …).
- **Colours.** Flat tiles get a lighter "meadow" tone, which shows where homes and fields can go. Height bands follow the prototype's `pal()` thresholds, with one palette per season. Trees use the prototype's LEAF/PINE colours (rare pink blossom in spring, snow in winter).
- **Materials.** Always create world materials through `worldMat()`. CSM's `setupMaterial` replaces `onBeforeCompile`, so the order is CSM, then bend, then any `extendShader` patches. Shadow casters use `castsShadow(mesh)`, which sets the bent depth material; without it, shadows slide off away from the focus.
- **Shadows.** The high tier uses three's CSM (three cascades, fade on, `maxFar` follows zoom). Medium and low use one directional shadow map centred on the focus and snapped to its texel grid. The terrain receives shadows but doesn't cast them: casting would add 64 draw calls per shadow pass, and the facets already show relief. r187 removed `PCFSoftShadowMap`, so use `PCFShadowMap`.
- **Instanced flora layout.** Instances use their chunk's nearest image (the same rule as the terrain). They are only re-laid out when that layout changes (the focus crosses a line at 8 + 16k), the flora changes, or the season turns.
- **Hashes are unsigned.** `hash2` returns a uint32, so always shift it with `>>>`, never `>>`. A signed shift makes negative indices into palette arrays.
- **Day/night timing** follows the prototype: night before 0.2 and after 0.81 (`nightF`). The sun rises at 0.245 and sets at 0.765, and its light fades to zero at the horizon, so the swap to the moon is invisible.
- **Entity references are ids.** `Vill.job` and `Vill.home` hold ids, which keeps saves plain. The tile→building map (`bmap`) and the crop set are derived in the Sim, not saved.
- **Hunger slows growth to a 10% floor** (`BALANCE.hungerFloor`). The prototype stopped growth entirely at 0 food; the cosy rule says hunger only slows it. **The goal is 1000 villagers** (the prototype's 500 ×2 for four times the land). The balance probe reaches 500 around day 9 and 1000 around day 14.
- **Villagers render cheaply.** Each body part is one InstancedMesh, so about 20 draw calls for everyone. Only villagers within the view radius are drawn, nearest first, up to 900 (500 on low). They get blob shadows instead of shadow casting. Positions interpolate between ticks (`px`/`py` → `x`/`y`, wrap-aware).
- **Buildings** (phase 13: the user asked for buildings "like Populous: The Beginning"). These are *original* designs with that chunky, hand-built tribal feel, not copies of that game's art.
  - **Models.** Stone plinths, wattle walls with timber posts, rope-bound thatch, carved posts with painted caps, hide door curtains, pots, woodpiles and benches. The great lodge has a two-tier roof and a totem. Work buildings: a stilt granary farm, a lean-to lumber camp, a stilt fishing hut with a drying rack and canoe, and a standing-stone shrine with a carved pillar. Merged vertex-coloured models, one InstancedMesh per model, re-laid out every frame.
  - **Tribe colours in one draw call.** Parts added with `tint` (painted wall band, dyed roof band, finial and roof flag, door curtain, banners) carry a per-vertex mask. `tintable()` replaces three's `color_vertex` chunk so the instance colour only applies where the mask is 1: blue for ours, red for theirs, blending with belief.
  - **Construction in stages.** Stakes, rope and a wood pile from 0%. A timber frame from 20%. The building rising inside the frame from 55%.
  - **Homes.** A new home rises from its frame over 1.4 s of *real* time (render dt is capped per frame, so slow frames would stall it). Growing a level throws a puff of dust.
  - **Bigger buildings (phase 14).** Work buildings placed from now on cover 2×2 tiles. `Struct.sz` is 2; older saves' buildings have no `sz` and stay 1×1 (`sizeOf`), so updating never breaks a village.
    - `footprint`/`footprintAt` give the tiles, all in `bmap`. `centreX/Y` give the middle.
    - `footingOk`: every tile flat at one height. A fishing hut needs dry tiles with water in the ring just outside.
    - `validSite` also wants no trees, rocks or crops on the footprint, and no building in the ring round it.
    - Recheck uses `structOk`. Farms are ringed by 12 crop tiles.
    - `nearStruct` measures from the building's edge, so a drop anywhere on it gives the job. Influence radius +0.5.
    - Workers, builders, fishers and the pet aim at the centre. Builders only build their own tribe's sites (this fixes our builders wandering off to the Red shrine).
    - The build preview anchors the footprint so its centre is the vertex nearest the pointer (`buildAnchor` in main).
    - Rendering: a 2×2 building is drawn at its centre, ×1.55. The great lodge gets a compound (palisade of pointed stakes, carved gate with a banner, fire pit and drying rack; a plain ring when far away). A great lodge always has its 5×5 to itself, so the yard never overlaps anything.
  - **LOD.** Homes more than 30 units (horizontally) from the camera use simpler models: no plinth, posts, ropes, props or door frames, but the same tribe colours. Empty instanced meshes are hidden, since they would still cost a draw call.
- **The hand** picks villagers, trees and rocks in screen space from their drawn positions, not from the ground behind them. Held things hang from its grip point.
  - Pose by context: open when idle, reach when over something grabbable, point for the other tools, grip (lowered, fist) while you pan the world, hold while carrying.
  - It keeps a steady size on screen (scale ≈ 0.11 × camera distance), like a cursor, and the OS cursor is hidden over the world.
- **Throws.**
  - Letting go calls `release()`: the held thing moves to `S.flying`, which counts towards the population and is saved back at its pickup spot.
  - Physics launches it with `throwVelocity()` of the hand's grip trail over the last 140 ms. That's capped at 16 u/s, a throw only above 2.5 u/s, with lift 2.5 + 0.3×speed.
  - The trail always keeps its last three samples, and a slow frame just before letting go falls back to the last pre-hitch velocity, so a hitch can't turn a throw into a drop.
  - When the body settles (slow for 0.3 s, or after 8 s), physics calls `sim.landed()`, which runs the prototype's land rules.
- **Physics on the torus.**
  - Rapier isn't periodic. There are 64 heightfield colliders (CHUNK×CHUNK cells, 17×17 samples, column-major with rows along z, centred on the collider), each placed at its nearest image to an anchor.
  - The anchor follows the camera focus only while nothing is flying, and terrain events rebuild only the touched chunks.
  - Rapier loads lazily after the first frame (its WASM is about 2 MB). Until then throws use `ballisticLanding`.
- **Terrain triangles are split along B–D** ((x+1,z)→(x,z+1)) everywhere: the mesh, `hAt`, `surfaceY` and Rapier. A test checks the Rapier surface equals `surfaceY`.
- **Water physics.** Bodies below `WATER_Y` get buoyancy and heavy damping, so they bob up. The first contact makes a splash. Villagers who land in water become swimmers and paddle to shore (sim `swimPlan`).
- **The pet** follows the prototype's B&W2-style rules.
  - Strokes and scolds teach the habit acted on within `BALANCE.teachWindow` (20 s): ×(1+0.4·L) or ×(1−0.35·L), kept within 0.1..5. L is the species' learn rate (the monkey's is 1.5), ×1.3 for a baby.
  - Two sightings of a blessing within 10 tiles teach that trick.
  - It never dies: needs only drive what it wants.
  - With the Hand: click the pet to stroke, right-click to scold. It's never picked up, but sweeping the open hand through it nudges it, and it's a kinematic ball in physics, so thrown things bounce off it.
  - Leash: Free / Follow (walks to `sim.handGround`, set each frame from the hover point) / Stay / Send (pick a spot).
  - Monkey mischief flings villagers through a `launch` event that physics flies. Those landings are `quiet` and don't count as the player's throws.
  - New worlds open the choose screen after the help.
- **Blessings** keep the prototype's costs and unlocks (Bloom 15 faith at 25 villagers, Level 20 at 60, Rain 30 at 110, Rise 40 at 180, Festival 80 at 280). Casting any blessing near the pet (within 10 tiles) teaches it. Keys 6–0.
- **Quests** are the prototype's chain plus new ones. "A real village" asks for goal/5 (200) and the last quest for the goal (1000). Each gives faith, and finishing them all shows the win screen (play continues).
  - Quests have stable ids. Saves store `qv` (`QUEST_VERSION`); `remapQuest()` maps an index from an older chain to the same quest in today's chain (v2 saves and pre-phase-9 v3 saves use chain 1). New quests that land before the player's current one are skipped. When you change the chain, bump `QUEST_VERSION` and add the old id list to `CHAINS`.
- **The pet pen** (phase 9) is a unique building (12 wood, no workers; `UNIQUE` in defs, also the Hearth). It needs a pet.
  - A tired pet within 30 tiles walks to the pen to sleep (unless it's told to Stay more than 8 tiles away). Asleep in the pen it rests ×`penRest` (2) and gains love.
  - Waking in the pen fertilises finished farms within `penFertR` (6) tiles for `fertSeconds`, and clears its droppings.
  - The pen's trough also works as the store when the pet is hungry, like the Hearth. The pet card's Pen button sends it home to Stay.
- **More tricks** (phase 9): Level and Rise are learned by watching those blessings, and Build by watching you place two buildings, each within 10 tiles.
  - Level smooths a gentle slope near homes. Rise turns shallow sea by the shore into beach. Build adds `petBuild` (0.25) to a site.
  - Tricks only start where they'd do some good (`trickTarget`). Land tricks go through `safeReshape()`: if any home or building would lose its footing, the heights are restored and nothing happens.
- **The prototype's save is migrated** when there's no 3D save but `hearthvale-v2` exists. Its 64×64 island (65² vertices) is set into a cleared sea basin at offset 32 on a freshly generated planet, and the v2 save is left untouched. The smoke test does this end to end: it plays `/legacy/`, which saves on pagehide, then loads `/`.
- **PWA.** vite-plugin-pwa provides the manifest and a service worker that precaches everything: game code, Rapier's WASM (inlined in its JS chunk, so `maximumFileSizeToCacheInBytes` is 8 MB), the font and the prototype. It auto-updates. `/legacy/` is excluded from the navigation fallback, so it stays the prototype. An Install button appears when the browser fires `beforeinstallprompt`. The smoke test reloads offline and checks both pages start.
- **Sound.** Effects and music are synthesised (no files). Sound unlocks on the first pointer or key press, and the on/off setting is saved in localStorage (`hearthvale-sound`).
- **Villager voices** (phase 15, the user's choices: villagers only, a made-up language. The user planned to record in VoiceStudio, then asked Claude to make them instead).
  - **One table:** `src/audio/voice-lines.json` holds the voices (descriptions for voice design), the events and the 48 lines (quick calls). It feeds `npm run voicesheet` (writes `voices/VOICE_SHEET.md` and `voices/lines.csv` for the user) and the game.
  - **Engine:** VoxCPM2 with voice design (Apache-2.0; no real person's voice). Never OmniVoice (VoiceStudio's default; its weights are non-commercial).
  - **How the shipped clips were made** (`scripts/voicegen/`):
    - **Designing the voices.** Each voice is designed from its description over a calm English sentence; an excited made-up sentence pushed every voice to child pitch. The candidate whose pyin pitch is nearest the description's typical range is kept (men 100–160 Hz, the elder 75–125, women 170–260, the kid 260–380). The five references are in `voices/refs/*.flac`.
    - **Making the lines.** A line is `(how)text` with the voice's reference as `reference_wav_path`, so it stays the same person. Each line gets 3 takes, scored on Whisper-base similarity to the written words, voiced fraction, pitch within 1.8× of the reference, and a length of 0.4–3.4 s. Clips are written as float WAV, so loud takes don't clip.
    - **Checking without listening.** Whisper often loops ("ha ha ha…") on short laughs: that's the recogniser, not the clip.
  - **Pipeline:** `npm run voices -- <zip or folder>` matches files by name (case, spaces and dashes forgiven) and writes mono 32 kHz Ogg Vorbis to `src/assets/voices/<line>.ogg`. It trims silence, levels to −18 LUFS, caps clips at 3.5 s and fades out, then reports missing and unknown files. Zips unpack into a fresh temp folder.
  - **Triggers:** the sim emits `{k:'voice', id, x, y, who}`:
    - pickup / red_pickup, land, drop, splash, job (village.ts);
    - newhome and grow (ours);
    - festival (at our Hearth), red_fest, red_join, petplay.
    - main adds throw (on a real throw) and ambient chatter / red_chatter: every 2.5–6.5 s, a random villager within 10 tiles of the focus, only when the camera is within 30 units.
  - **Player:** `src/audio/voices.ts` bundles clips via `import.meta.glob` and decodes them after unlock.
    - **Style** (the user asked for villagers that sound "like Populous"): short, snappy calls of a word or two, played fast (`SPEED` 1.3), so a small, chirpy people yelp, cheer and murmur. These are original sounds in that spirit, never that game's audio.
    - **Variation:** one random take per line, with a per-villager rate from their id (×0.92–1.10 on top of `SPEED`) plus a little wobble.
    - **Space:** volume falls off within 26 tiles of the focus and with zoom. Stereo pan follows the camera's right vector.
    - **Limits:** a per-event gap (chatter 2.2 s, cheers 0.8 s, festivals 3 s), and at most 4 lines at once.
    - **Fallback:** a line with no clip is silent, and the synthesised effects still play.
    - **Smoke test:** `__hv.voices()` reports clips bundled, decoded and failed, and lines spoken. Smoke fails if a clip doesn't decode, the count differs from the table, or nobody spoke while villagers were handled.
  - **Settings:** the top bar's Voices button appears once clips exist, saved as `hearthvale-voices`. Workbox precaches `*.ogg` for offline play.
- **Gravity is 14 u/s²** (1 unit ≈ a villager's height × 2): snappy arcs, not floaty.
- **Culling.** `GameRenderer.cull()` tests each of the 64 chunks against the camera frustum using its *bent* bounds: the drop is lowest at the far corner and highest at the near one, plus 2.2 headroom for trees and huts. The terrain hides culled chunks, and the flora only lays out instances in visible chunks. Instanced meshes stay `frustumCulled = false` because their bounds are unbent.
- **Tree LOD.** Trees more than 28 units (horizontally) from the camera use a simple canopy with no trunk. The flora re-lays out when the visible chunk set or the camera's 4-unit LOD cell changes.
- **Budgets (`npm run perf`, 1280×800, village of about 80).** Keep high under 150 calls and 300k triangles.
  - before culling: high 458k triangles at every zoom
  - after culling (phase 7): high 137k / 173k / 211k triangles (94–124 calls) at zoom 0.2 / 0.45 / 1; medium 93k–141k triangles (66–96 calls)
  - phase 13 detailed buildings, with home LOD and the tint mask: high 193k / 229k / 247k triangles (118 / 125 / 147 calls); medium 123k–163k triangles (80–109 calls)
  - phase 14 (2×2 buildings, lodge compound): high 199k / 235k / 248k triangles (118 / 125 / 143 calls); medium 125k–164k triangles (80–107 calls)
- **WebGPU is deferred.** The bend uses `onBeforeCompile`, which WebGPURenderer doesn't support (it needs TSL).
- **The Red tribe** (phase 10, the user's design choice: "win them over"). Nobody fights.
  - Every home, struct and villager has `tribe` (0 ours, 1 Red). Red homes also have `bel` (0..100, how won over they are). `fixTribes` gives pre-tribe saves tribe 0.
  - **Where they live.** New worlds spawn them at least `rivalMinDist` (40) tiles from our start, inland, in a flattened clearing with a Hearth, four homes and wanderers. Older saves meet them on load (`ensureRival`); a planet with no room never gets them (`hinted.noRival`).
  - **How they live.** They grow without hunger (`rivalGrowth`), only settle within `rivalRange` (14) of their Hearth, never join our homes, stop at `rivalMax` (160) people, and have no jobs. Every `rivalElderEvery` seconds their elder smooths a gentle slope near their Hearth (through `petLevel`/`safeReshape`).
  - **Winning them over.**
    - Belief grows per second with our homes within 12 tiles (by level and closeness) and our Shrines, and during festivals. It fades on its own, and faster near their Hearth (`beliefRate`).
    - Blessings within their radius + 4 add 15. A festival adds 15 to every Red home that can see us. The pet dancing, playing or casting nearby adds 6, and its mischief subtracts 6.
    - At 100 a home joins us with everyone in it.
    - Red villagers can be picked up only inside our influence (`inInfluence`: our homes 3 + level tiles, buildings 5, Hearth 8). Put down inside it, they join; Red wanderers standing in it join by chance.
  - **Unity.** When no Red homes or villagers are left, `rival.united` is set and their buildings become ours. `popCount` and the goal count only our tribe, and converts count once they've joined.
  - **Look.** Red villagers wear terracotta (`TRIBE_RED`). Every home carries a pennant: ours blue, theirs red, blending to blue with belief. The HUD's "Red tribe" row shows their number and jumps the camera there, which meets the "Neighbours" quest.
  - **Quests.** "Neighbours", "A warm welcome" and "One people" (chain version 3).
  - **Borders** (phase 11). `influenceSources(S, tribe)` defines each tribe's land, and `inInfluence` and `influenceField` both read it.
    - `influenceField` is r − d per vertex. Its 0 contour, traced by marching squares in `render/contour.ts`, is exactly where `inInfluence` changes; a test checks this.
    - `render/border.ts` re-traces a tribe only when its sources change (checked twice a second) and lays out segments within 70 units of the focus. Ours is blue, theirs red.
    - `B` toggles both, saved as `hearthvale-border`.
  - **Red festivals** (phase 11). About every 300 s (±20%) they celebrate for 35 s.
    - Their homes grow ×1.5. Bunting and lanterns go up in their colours, and notes rise from their people.
    - Our blessings, festivals and pet impress them ×2 meanwhile (`rivalFestJoy`). The HUD row reads "Red festival!".
  - **Red shrine** (phase 11). At 40 people their elder builds a shrine (tribe 1, self-builds) within 6 tiles of their Hearth.
    - Red homes within 8 tiles of it lose 0.12 belief a second more.
    - Its crystal glows warm red. The pet's Build trick ignores Red sites, and Red buildings finish without a toast.
  - **Mood.** `rivalMood(S, home)` puts one line of advice in a Red home's tooltip: celebrating, pet mischief, no homes nearby, homes too small, no Shrine nearby, loyal core, or warming.
  - **Balance probe.** With 2×2 buildings: 500 people around day 9 and 1000 around day 15. The Red tribe caps at 160 by day 3, and a player who just expands wins them over around days 25–30.
    - The probe's scripted player only acts for our tribe, never digs under its own buildings, and searches outwards from the Hearth for the nearest valid site (40 random tries rarely found a free 2×2 in a crowded village).
- **Our tribe is blue (user's choice).** Villagers wear tribe-blue clothing, from the prototype's `TRIBE` blues (#3f6fc4, #3566b0, #4a7fd6, #2f5ea8). Jobs show as accents on top of the blue: farmer straw hat, forester green cap, fisher teal hat, builder orange headband and tool, priest white robe trim with a feather headdress. That way the whole tribe reads as one blue people from afar, and jobs are still clear up close. Blue also tints tribe flags and festival bunting. A future rival tribe gets a different colour.

## Conventions
- Cosy rules: nobody dies, hunger only slows growth, throws always land safely.
- Keep `src/sim` deterministic: seeded `Rng`, with no wall-clock time.
- Write tests for every ported rule in `src/sim/*.test.ts`. After changing render or input, run `npm run smoke` and look at the screenshots.
- Record every third-party asset and its licence in `ASSETS.md`. Only CC0, or licences that allow redistribution, after checking.
- Branch per phase (`phase-N-…`) and a draft PR. **The user said "just auto merge"**: once `npm run check`, `npm run smoke` and CI are green, mark the PR ready and merge it yourself (merge commit), then tell the user it's live. Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`); CI runs on branches and PRs.

## Prototype map (where to find rules in legacy/index.html)
- constants: `BMAX`/`BTH` (home sizes and field thresholds), `ROLES`, `STRUCTS`, `TOOLS`, `PETS`, `HABITS`, `QUESTS`
- homes and growth: `fields`, `levelFor`, `recheck`, `newHome`, `findSpot`, `update()`; villagers: `stepSettler`, `stepRes`, `stepWorker`
- pet: `startAct`, `finishAct`, `stepPet`, `teach` (20 s window), `watchLearn` (2 sightings → trick), stages at xp 40 and 160
- hand: `grab`, `release` (throw from the pointer trail), `land` (job assignment, joining homes, wood)
- save: localStorage `hearthvale-v2`. The 3D game will use `hearthvale-v3` and migrate v2 (phase 6).

## Ideas queued
- More audio. The user's PC has an AMD Radeon RX 7900 XTX (24 GB), so prefer tools that run on AMD (Vulkan GGUF engines, ROCm, DirectML/ONNX) over CUDA-only ones.
  - A narrator and pet voices, with the same pipeline as the villagers (`scripts/voicegen/` in the cloud works).
  - Music, from a music generator: VoiceStudio is for speech.
  - VoiceStudio's MOSS-SoundEffect is Apache-2.0 but NVIDIA-only.
- Move the `balance.ts` tunables to JSON for tuning without code.
