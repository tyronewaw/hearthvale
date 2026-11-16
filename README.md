# Hearthvale

A cosy 3D god game for the browser. Shape a little wrap-around planet, guide your tribe with a god hand, and raise a creature that learns from how you treat it. It runs on desktop and phone.

**Play:** https://tyronewaw.github.io/hearthvale/ (deployed from `main`)  
**Original 2D prototype:** https://tyronewaw.github.io/hearthvale/legacy/

## Status
It is being rebuilt in phases, and each phase ends playable.

1. ✅ Curved wrap-around terrain and land editing
2. ✅ Water, sky, day/night, seasons, shadows, trees
3. Huts, villagers, growth and economy
4. The god hand with physics grab and throw
5. The god pet: needs, habits, teaching, tricks
6. Blessings, quests, full UI, sound, saves
7. Mobile polish and performance
8. Installable PWA

## Controls (so far)
- **Raise / Lower** (`2` / `3`): click to lift land, right-click to sink it, and hold to repeat.
- **Hand** (`1`): drag the land to look around.
- Wheel to zoom, `Q`/`E` or right-drag to turn, `WASD` to pan, `Space` to pause.
- Touch: drag to look, pinch to zoom, twist with two fingers to turn.

## Develop
```bash
npm install
npm run dev      # http://localhost:5173  (try ?sandbox&stats, ?q=low|medium|high)
npm run check    # typecheck + unit tests
npm run smoke    # build + headless browser play-through + screenshots in shots/
```

See `CLAUDE.md` for the architecture and `ASSETS.md` for licences.
