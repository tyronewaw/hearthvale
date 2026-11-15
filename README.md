# Hearthvale

A cosy 3D god game for the browser. Shape a little wrap-around planet, guide your tribe with a god hand, and raise a creature that learns from how you treat it. It runs on desktop and phone.

**Play:** https://tyronewaw.github.io/hearthvale/ (deployed from `main`)  
**Original 2D prototype:** https://tyronewaw.github.io/hearthvale/legacy/

## Status
It is being rebuilt in phases, and each phase ends playable.

1. ✅ Curved wrap-around terrain and land editing
2. ✅ Water, sky, day/night, seasons, shadows, trees
3. ✅ Huts, villagers, growth and economy
4. ✅ The god hand with physics grab and throw
5. The god pet: needs, habits, teaching, tricks
6. Blessings, quests, full UI, sound, saves
7. Mobile polish and performance
8. Installable PWA

## Controls (so far)
- **Hand** (`1`): grab villagers, trees and rocks. Let go gently to drop, or flick and let go to throw: they arc, bounce, splash and get up a little dizzy. Drop villagers on a building to give them that job, and trees on the Hearth for wood. Drag empty land to look around.
- **Raise / Lower** (`2` / `3`): click to lift land, right-click to sink it, and hold to repeat. Homes grow with the flat land around them.
- **Build** (`4`): Hearth, Farm, Lumber camp, Fishing hut, Shrine (they cost wood).
- **Totem** (`5`): wanderers head there to look for land.
- Wheel to zoom, `Q`/`E` or right-drag to turn, `WASD` to pan, `Space` to pause. The world saves itself in your browser.

## Develop
```bash
npm install
npm run dev      # http://localhost:5173  (try ?sandbox&stats, ?q=low|medium|high)
npm run check    # typecheck + unit tests
npm run smoke    # build + headless browser play-through + screenshots in shots/
npm run balance  # 30-day scripted play-through, growth table in shots/balance.txt
```

See `CLAUDE.md` for the architecture and `ASSETS.md` for licences.
