# Hearthvale

A cosy 3D god game for the browser. Shape a little wrap-around planet, guide your tribe with a god hand, and raise a creature that learns from how you treat it. It's made for PC (mouse and keyboard) and runs in any modern desktop browser.

**Play:** https://tyronewaw.github.io/hearthvale/ (deployed from `main`)  
**Original 2D prototype:** https://tyronewaw.github.io/hearthvale/legacy/

## Status
It is being rebuilt in phases, and each phase ends playable.

1. ✅ Curved wrap-around terrain and land editing
2. ✅ Water, sky, day/night, seasons, shadows, trees
3. ✅ Huts, villagers, growth and economy
4. ✅ The god hand with physics grab and throw
5. ✅ The god pet: needs, habits, teaching, tricks
6. ✅ Blessings, quests, full UI, sound, saves (old 2D saves carry over)
7. ✅ Performance (culling with the planet curve, tree LOD)
8. ✅ Installable PWA that plays offline
9. ✅ Pet pen and new tricks (Level, Rise, Build)
10. ✅ The Red tribe: a rival people you win over, Black & White style
11. ✅ Land borders on the ground; Red festivals, a Red shrine, and tooltips that say what would win them over
12. ✅ Pets change as they grow: lamb to curly-horned ram, baby monkey to wise old monkey, chick to rooster
13. ✅ Detailed tribal buildings in your tribe's colours; building sites go up stake by stake, frame by frame
14. ✅ Bigger buildings: work buildings take 2×2 tiles, and a great lodge stands in its own palisaded compound
15. ✅ Villager voices: they chatter, cheer, squeal when thrown and celebrate in their own made-up language (5 voices, 48 lines, made with the open VoxCPM2 model)
16. ✅ Pet sounds: your sheep bleats, your monkey hoots and your hen clucks when stroked, scolded, fed, playing, sleepy or proud; babies squeak and grand old pets sound deeper
17. ✅ Real animal sounds: your sheep and hen now use real farm recordings (public domain); the monkey keeps its cartoon voice
18. ✅ A Black & White / Populous feel: smooth painted hills, warmer light and a glowing sky, and new villagers, huts, god hand, trees and pets made in Blender

## Controls (so far)
- **Hand** (`1`): grab villagers, trees and rocks. Let go gently to drop, or flick and let go to throw: they arc, bounce, splash and get up a little dizzy. Drop villagers on a building to give them that job, and trees on the Hearth for wood. Drag empty land to look around.
- **Raise / Lower** (`2` / `3`): click to lift land, right-click to sink it, and hold to repeat. Homes grow with the flat land around them.
- **Build** (`4`): Hearth, Farm, Lumber camp, Fishing hut, Shrine, Pet pen (they cost wood).
- **Totem** (`5`): wanderers head there to look for land.
- **Your pet** (sheep, monkey or chicken): click it with the Hand to stroke, right-click to scold, straight after something it did, to teach it. Drop trees on it as snacks. Leash it: Free, Follow, Stay or Send.
- **Blessings** (`6`–`0`): Bloom, Level, Rain, Rise and Festival unlock as your tribe grows and cost faith.
- **The Red tribe** lives on a far shore (click *Red tribe* in the top-left panel to look). Nobody fights. Win them over:
  - build big homes and Shrines near them, hold festivals, bless their land, and let a kind pet play nearby;
  - each of their homes' flags turns from red to blue as it warms to you;
  - pick up their wanderers inside your land, or put them down there, and they join you;
  - when they hold a festival, kindness counts double;
  - glowing lines on the ground show your land (blue) and theirs (red); press `B` to show or hide them.
- Wheel to zoom, `Q`/`E` or right-drag to turn, `WASD` to pan, `Space` to pause. The world saves itself in your browser, and a world from the 2D prototype carries over.

## Install
In Chrome or Edge, use the **Install** button in the game's top bar (or the install icon in the address bar). Hearthvale then opens in its own window and works offline. It saves in your browser, so your world is waiting next time.

## Develop
```bash
npm install
npm run dev      # http://localhost:5173  (try ?sandbox&stats, ?q=low|medium|high)
npm run check    # typecheck + unit tests
npm run smoke    # build + headless browser play-through + screenshots in shots/
npm run balance  # 30-day scripted play-through, growth table in shots/balance.txt
npm run perf     # draw calls / triangles at three zooms
```

See `CLAUDE.md` for the architecture and `ASSETS.md` for licences.
