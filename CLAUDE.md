# Hearthvale

A cosy 3D god game for the browser, on desktop and phone. It looks like Populous: The Beginning (a small curved planet, terrain you reshape live, round thatched huts, little tribespeople) and plays like Black & White 2 (a physical god hand, a creature you raise and teach). The style is stylised low-poly with soft light. Nobody dies.

- **Design reference:** `legacy/index.html` is the original 2D pixel prototype, unchanged and playable at `/legacy/`. When porting a rule, read it there first; it is the spec.
- **Plan:** an 8-phase rebuild; each phase ends playable and gets its own branch and PR. Phase 1 (curved wrap-around terrain and land editing) is done. Next: phase 2 (water, sky, day/night, seasons, shadows, trees).

## Commands
- `npm run dev` starts the Vite dev server. Useful URL flags: `?seed=42`, `?sandbox` (tools are free), `?stats` (fps, draw calls, triangles), `?nohelp`.
- `npm run check` runs `tsc --noEmit` and Vitest. It must be green before every commit.
- `npm run build` builds into `dist/`, with the legacy page at `dist/legacy/`.
- `npm run smoke` builds, serves, and plays in headless Chromium through `window.__hv`. It fails on any console error and saves screenshots to `shots/` (gitignored).

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
  sim.ts      Sim class: tick() at 10 Hz, useTool(), events queue (drain() each frame)
src/render/   three.js only, and it reads sim state
  bend.ts     planet-curve vertex shader patch (`bent(material)`) and JS `bendDrop`
  scale.ts    sim→world mapping: STEP per level, SEA_FLOOR, WATER_Y, surfaceY/standY
  camera-rig.ts orbit camera around a wrapped focus; zoom also tilts and strengthens the bend
  terrain-mesh.ts 8×8 chunks of 16×16 tiles, flat-shaded with per-triangle colour
  renderer.ts scene, lights, fog, water plane, hover marker, dirty-chunk rebuilds
src/input/    controls.ts (pointer, wheel, pinch, twist, keys, hold-to-repeat), picking.ts
src/ui/       hud.ts (HUD, toolbar, toasts, modals), icons.ts (prototype pixel icons), styles.css
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
- **Colours.** Flat tiles get a lighter "meadow" tone, which shows where homes and fields can go. Height bands follow the prototype's `pal()` thresholds.
- **WebGPU is deferred.** The bend uses `onBeforeCompile`, which WebGPURenderer doesn't support (it needs TSL).

## Conventions
- Cosy rules: nobody dies, hunger only slows growth, throws always land safely.
- Keep `src/sim` deterministic: seeded `Rng`, with no wall-clock time.
- Write tests for every ported rule in `src/sim/*.test.ts`. After changing render or input, run `npm run smoke` and look at the screenshots.
- Record every third-party asset and its licence in `ASSETS.md`. Only CC0, or licences that allow redistribution, after checking.
- Branch per phase (`phase-N-…`), draft PR, and the user reviews before merging. Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`); CI runs on branches and PRs.

## Prototype map (where to find rules in legacy/index.html)
- constants: `BMAX`/`BTH` (home sizes and field thresholds), `ROLES`, `STRUCTS`, `TOOLS`, `PETS`, `HABITS`, `QUESTS`
- homes and growth: `fields`, `levelFor`, `recheck`, `newHome`, `findSpot`, `update()`; villagers: `stepSettler`, `stepRes`, `stepWorker`
- pet: `startAct`, `finishAct`, `stepPet`, `teach` (20 s window), `watchLearn` (2 sightings → trick), stages at xp 40 and 160
- hand: `grab`, `release` (throw from the pointer trail), `land` (job assignment, joining homes, wood)
- save: localStorage `hearthvale-v2`. The 3D game will use `hearthvale-v3` and migrate v2 (phase 6).

## Ideas queued
- A pet pen building where the pet sleeps; more pet tricks; a rival tribe.
- Local AI-generated music or voices for the pet, made offline with free tools and shipped as our own assets.
- Move the `balance.ts` tunables to JSON for tuning without code.
