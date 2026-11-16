// Smoke test: build, serve the production bundle, play a little in headless Chromium,
// fail on any console error, and save screenshots to shots/.
// Usage: npm run smoke            (builds first)
//        npm run smoke -- --no-build
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
if (!process.argv.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });
mkdirSync('shots', { recursive: true });

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

function watch(page, label, ignore = () => false) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignore(m.text())) errors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
}
const step = (m) => console.log('·', m);
const shot = async (page, name, fn, arg) => {
  if (fn) await page.evaluate(fn, arg);
  await frames(page, 4);
  await page.screenshot({ path: `shots/${name}.png` });
};
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

try {
  // ---------- desktop ----------
  const desk = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  watch(desk, 'desktop');
  await desk.goto(`${BASE}/?seed=42&nohelp&sandbox&nopet`);
  await desk.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
  await desk.waitForTimeout(600); // let the loading veil fade
  await desk.screenshot({ path: 'shots/desktop-start.png' });

  // Real pointer input: click raises land at the centre of the screen.
  await desk.evaluate(() => window.__hv.setTool('raise'));
  const before = await desk.evaluate(() => { const s = window.__hv.sim().S; return Array.from(s.h).reduce((a, b) => a + b, 0); });
  // (off-centre: the Hearth sits at the centre, and reshaping its tile would knock it down)
  await desk.mouse.move(960, 260);
  await frames(desk);
  for (let i = 0; i < 4; i++) { await desk.mouse.down(); await desk.mouse.up(); await frames(desk, 2); }
  await desk.mouse.click(960, 260, { button: 'right' });
  const after = await desk.evaluate(() => { const s = window.__hv.sim().S; return Array.from(s.h).reduce((a, b) => a + b, 0); });
  if (!(after > before)) errors.push(`desktop: clicking did not raise land (${before} -> ${after})`);

  // Sculpt a hill and a flat terrace with the sim API, then look at it.
  await desk.evaluate(() => {
    const hv = window.__hv, [sx, sy] = hv.sim().S.start;
    // (far enough from the Hearth that the cascade can't reach its tile)
    for (let i = 0; i < 6; i++) hv.use('raise', sx + 13, sy + 4);
    for (let i = 0; i < 4; i++) hv.use('lower', sx - 10, sy + 9);
  });
  await frames(desk, 4);
  await desk.screenshot({ path: 'shots/desktop-sculpted.png' });

  // Drag to pan: the focus must move.
  const f0 = await desk.evaluate(() => [window.__hv.rig.fx, window.__hv.rig.fz]);
  await desk.evaluate(() => window.__hv.setTool('hand'));
  await desk.mouse.move(700, 450);
  await desk.mouse.down();
  for (let i = 1; i <= 10; i++) await desk.mouse.move(700 - i * 25, 450 - i * 12);
  await desk.mouse.up();
  const f1 = await desk.evaluate(() => [window.__hv.rig.fx, window.__hv.rig.fz]);
  if (Math.hypot(f1[0] - f0[0], f1[1] - f0[1]) < 1) errors.push(`desktop: drag did not pan (${f0} -> ${f1})`);

  // Zoom out to see the curve, and turn with Q.
  await desk.mouse.move(640, 400);
  for (let i = 0; i < 12; i++) await desk.mouse.wheel(0, 240);
  await desk.keyboard.down('q');
  await desk.waitForTimeout(400);
  await desk.keyboard.up('q');
  await frames(desk, 4);
  await desk.screenshot({ path: 'shots/desktop-planet.png' });

  // Sit on the wrap seam: the world must continue across it.
  await desk.evaluate(() => { const r = window.__hv.rig; r.fx = 0.3; r.fz = 0.3; r.zoom = 0.55; r.apply(); });
  await frames(desk, 4);
  await desk.screenshot({ path: 'shots/desktop-seam.png' });

  // A few in-game days at once (4× speed equivalent), then a frame.
  await desk.evaluate(() => window.__hv.ff(150 * 3));
  await frames(desk, 3);
  const info = await desk.evaluate(() => window.__hv.info());
  console.log('desktop renderer.info', info);

  // World tour: times of day and seasons around the start site.
  await desk.evaluate(() => { const r = window.__hv.rig, [x, z] = window.__hv.sim().S.start; r.fx = x + 0.5; r.fz = z + 0.5; r.zoom = 0.4; r.yaw = 0.7; r.apply(); });
  const at = (day, tod) => { window.__hv.sim().S.t = (day + tod) * 150; };
  for (const [name, day, tod] of [['tod-morning', 0, 0.36], ['tod-noon', 0, 0.5], ['tod-dusk', 0, 0.755], ['tod-night', 0, 0.93],
    ['season-summer', 3, 0.45], ['season-autumn', 6, 0.45], ['season-winter', 9, 0.45]]) {
    await shot(desk, name, ({ day, tod }) => { window.__hv.sim().S.t = (day + tod) * 150; }, { day, tod });
  }
  void at;

  // ---------- village ----------
  await desk.evaluate(() => {
    const hv = window.__hv, sim = hv.sim(), S = sim.S, [sx, sy] = S.start;
    sim.sandbox = true;
    S.t = 150 * 0.3;
    hv.ff(150 * 3);
    // a farm and a lumber camp go up near the Hearth (still building when we look)
    for (const [k, dx, dy] of [['farm', 5, 0], ['lumber', -5, 2], ['shrine', 0, 6]]) {
      outer: for (let r = 0; r < 6; r++) for (let a = 0; a < 8; a++) {
        if (sim.build(k, sx + dx + Math.round(Math.cos(a) * r), sy + dy + Math.round(Math.sin(a) * r))) break outer;
      }
    }
    hv.ff(40);
    const r = hv.rig; r.fx = sx + 0.5; r.fz = sy + 0.5; r.zoom = 0.22; r.yaw = 0.7; r.apply();
    window.__village = { homes: S.homes.length, pop: S.popNow, vills: S.vills.length, structs: S.structs.map((s) => s.k).join(',') };
  });
  const village = await desk.evaluate(() => window.__village);
  console.log('village after 3 days', village);
  if (!village.homes) errors.push('village: no homes after 3 days');
  if (!village.structs.includes('hearth')) errors.push('village: the Hearth is gone');
  await shot(desk, 'village-noon', () => { const S = window.__hv.sim().S; S.t = Math.floor(S.t / 150) * 150 + 0.45 * 150; });
  await shot(desk, 'village-night', () => { const S = window.__hv.sim().S; S.t = Math.floor(S.t / 150) * 150 + 0.9 * 150; });
  await desk.evaluate(() => { const S = window.__hv.sim().S; S.t = Math.floor(S.t / 150) * 150 + 1.45 * 150; });
  await frames(desk, 3);

  // The hand: grab a real villager with the mouse; a slow move drops, a flick throws.
  await desk.evaluate(() => window.__hv.setTool('hand'));
  await desk.waitForFunction(() => window.__hv.physicsReady(), null, { timeout: 30000 });
  const findVillager = () => desk.evaluate(() => {
    // only villagers in the open middle of the screen, away from the HUD, quest and pet panels
    const hv = window.__hv, scr = (d) => { const p = d.p.clone().project(hv.rig.camera); return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight }; };
    const ok = (d) => { const p = scr(d); return p.x > 320 && p.x < 960 && p.y > 140 && p.y < 600; };
    const d = hv.renderer.villagers.drawn.find((x) => (x.v.type === 'settler' || x.v.type === 'worker') && x.v.dizzy <= 0 && ok(x)) ?? hv.renderer.villagers.drawn.find(ok);
    if (!d) return null;
    const p = scr(d);
    return { x: p.x, y: p.y, id: d.v.id, vx: d.v.x, vz: d.v.y, stat: { ...hv.sim().S.stat } };
  });
  /** Villagers keep walking: re-aim at the same one just before pressing, and retry. */
  const grabVillager = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const t = await findVillager();
      if (!t) return null;
      await desk.mouse.move(t.x, t.y);
      await frames(desk, 2);
      const again = await desk.evaluate((id) => {
        const hv = window.__hv, d = hv.renderer.villagers.drawn.find((x) => x.v.id === id);
        if (!d) return null;
        const p = d.p.clone().project(hv.rig.camera);
        return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
      }, t.id);
      if (!again) continue;
      await desk.mouse.move(again.x, again.y);
      await desk.mouse.down();
      if ((await desk.evaluate(() => window.__hv.sim().S.held?.k)) === 'v') return { ...t, ...again };
      await desk.mouse.up();
      await frames(desk, 3);
    }
    return null;
  };
  const waitLanded = (key, before) => desk.waitForFunction(([k, b]) => window.__hv.sim().S.stat[k] > b, [key, before], { timeout: 15000 }).then(() => true).catch(() => false);
  let target = await grabVillager();
  if (!target) errors.push('hand: could not grab a villager to drop');
  else {
    await desk.screenshot({ path: 'shots/hand-reach.png' });
    for (let i = 1; i <= 6; i++) { await desk.mouse.move(target.x + i * 10, target.y + i * 5); await frames(desk, 2); }
    await desk.waitForTimeout(300);
    await desk.screenshot({ path: 'shots/hand-carry.png' });
    await desk.mouse.up();
    if (!(await waitLanded('drops', target.stat.drops))) errors.push('hand: dropped villager never landed');
  }
  // throw: a real-mouse flick (timing-dependent in headless software WebGL, so only logged) …
  await frames(desk, 10);
  target = await grabVillager();
  if (target) {
    await frames(desk, 3);
    for (let i = 1; i <= 6; i++) { await desk.mouse.move(target.x - i * 45, target.y - i * 20); await frames(desk, 1); }
    await desk.mouse.up();
    await frames(desk, 4);
    await desk.screenshot({ path: 'shots/hand-throw.png' });
    const lt = await desk.evaluate(() => window.__hv.lastThrow());
    console.log('real flick:', lt.thrown ? `thrown at ${Math.hypot(lt.vx, lt.vz).toFixed(1)} u/s` : `read as a drop (${lt.trail.length} trail samples)`);
  }
  // … and a deterministic throw through the same physics path, which must fly and land.
  await frames(desk, 10);
  await desk.mouse.move(640, 400);
  await frames(desk, 3);
  target = await desk.evaluate(() => {
    const hv = window.__hv, S = hv.sim().S, v = S.vills.find((o) => o.type === 'settler' || o.type === 'worker') ?? S.vills[0];
    if (!v || !hv.sim().grab(v.id)) return null;
    return { id: v.id, vx: v.x, vz: v.y, stat: { ...S.stat } };
  });
  if (!target) errors.push('hand: could not pick up a villager to throw');
  else {
    await frames(desk, 3);
    // measure from where it left the hand (the hand need not be over the villager's old spot)
    const from = await desk.evaluate(() => window.__hv.throwHeld(-10, -6));
    if (from) [target.vx, target.vz] = [from.x, from.z];
    await frames(desk, 3);
    await desk.screenshot({ path: 'shots/hand-throw-flight.png' });
    if (!(await waitLanded('throws', target.stat.throws))) errors.push('hand: thrown villager never landed as a throw');
    else {
      const moved = await desk.evaluate((t) => {
        const S = window.__hv.sim().S, v = S.vills.find((o) => o.id === t.id);
        if (!v) return -1;
        const dx = ((v.x - t.vx + 192) % 128) - 64, dz = ((v.y - t.vz + 192) % 128) - 64;
        return Math.hypot(dx, dz);
      }, target);
      if (moved < 0) console.log('thrown villager landed on a home and moved in');
      else {
        console.log('thrown villager flew', moved.toFixed(1), 'tiles');
        if (moved < 3) errors.push(`hand: throw too short (${moved})`);
      }
    }
  }
  await desk.mouse.move(640, 420);
  await desk.evaluate(() => window.__hv.setTool('raise'));
  await frames(desk, 6);
  await desk.screenshot({ path: 'shots/hand-point.png' });
  await desk.close(); // software WebGL is CPU-bound: keep one page rendering at a time

  // ---------- phone ----------
  const phoneCtx = await browser.newContext({ ...devices['iPhone 13'] });
  const phone = await phoneCtx.newPage();
  watch(phone, 'phone');
  await phone.goto(`${BASE}/?seed=42&nohelp&nopet`);
  await phone.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
  await phone.waitForTimeout(600);
  await phone.screenshot({ path: 'shots/phone.png' });
  await phone.goto(`${BASE}/?seed=42`);
  await phone.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
  await phone.waitForTimeout(600);
  await phone.screenshot({ path: 'shots/phone-help.png' });
  await phoneCtx.close();

  // ---------- blessings, quests ----------
  {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    watch(pg, 'blessings');
    await pg.goto(`${BASE}/?seed=42&nohelp&sandbox&nopet`);
    await pg.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
    const cast = await pg.evaluate(() => {
      const hv = window.__hv, sim = hv.sim(), S = sim.S, [sx, sy] = S.start;
      hv.ff(150 * 2.2);
      const res = {
        bloom: sim.useTool('bloom', sx + 9, sy - 3), flat: sim.useTool('flat', sx - 8, sy - 8), rain: sim.useTool('rain', sx + 1, sy + 1),
        isle: sim.useTool('isle', sx + 14, sy + 10), fest: sim.useTool('fest', sx, sy),
      };
      hv.setTool('rain');
      const r = hv.rig; r.fx = sx + 0.5; r.fz = sy + 0.5; r.zoom = 0.3; r.yaw = 0.7; r.apply();
      S.t = Math.floor(S.t / 150) * 150 + 0.47 * 150;
      return { ...res, rains: S.rains.length, fest: S.fest };
    });
    console.log('blessings cast', cast);
    for (const k of ['bloom', 'flat', 'rain', 'isle', 'fest']) if (!cast[k]) errors.push(`blessing ${k} failed`);
    await pg.mouse.move(700, 380);
    await frames(pg, 8);
    await pg.screenshot({ path: 'shots/blessings-day.png' });
    await pg.evaluate(() => { const S = window.__hv.sim().S; S.t = Math.floor(S.t / 150) * 150 + 0.9 * 150; });
    await frames(pg, 8);
    await pg.screenshot({ path: 'shots/blessings-night.png' });
    const quest = await pg.evaluate(() => document.getElementById('qt').textContent);
    if (!quest) errors.push('quest panel is empty');
    await pg.close();
  }

  // ---------- migrating a save from the 2D prototype ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const leg = await ctx.newPage();
    watch(leg, 'legacy-save', (t) => /Failed to load resource|ERR_|net::/.test(t));
    await leg.goto(`${BASE}/legacy/`);
    await leg.waitForTimeout(1500);
    await leg.evaluate(() => dispatchEvent(new Event('pagehide'))); // the prototype saves on pagehide
    const hasV2 = await leg.evaluate(() => !!localStorage.getItem('hearthvale-v2'));
    if (!hasV2) errors.push('migration: the prototype did not save');
    const pg = await ctx.newPage();
    watch(pg, 'migrated');
    await pg.goto(`${BASE}/?nohelp&nopet&nosave`);
    await pg.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
    const m = await pg.evaluate(() => { const S = window.__hv.sim().S; return { hearth: S.structs.some((s) => s.k === 'hearth'), start: S.start, vills: S.vills.length }; });
    console.log('migrated prototype world', m);
    if (!m.hearth || m.start[0] < 32 || m.start[0] > 96) errors.push(`migration: unexpected world ${JSON.stringify(m)}`);
    await pg.waitForTimeout(1200);
    await pg.screenshot({ path: 'shots/migrated.png' });
    await ctx.close();
  }

  // ---------- the god pet ----------
  {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    watch(pg, 'pet');
    await pg.goto(`${BASE}/?seed=42&nohelp&sandbox`);
    await pg.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
    // choose a pet through the real UI
    await pg.waitForSelector('#choose.show', { timeout: 5000 });
    await pg.click('.pc[data-k="monkey"]');
    await pg.fill('#petNameIn', 'Pip');
    await pg.screenshot({ path: 'shots/pet-choose.png' });
    await pg.click('#bChoose');
    const pet = await pg.evaluate(() => window.__hv.sim().S.pet?.name);
    if (pet !== 'Pip') errors.push(`pet: choosing failed (${pet})`);
    await pg.evaluate(() => { const hv = window.__hv, P = hv.sim().S.pet; P.mode = 'stay'; P.post = [P.x, P.y]; P.act = null;
      const r = hv.rig; r.fx = P.x; r.fz = P.y; r.zoom = 0.12; r.apply(); hv.sim().S.t = 150 * 0.42; });
    await frames(pg, 6);
    // stroke it with the mouse, straight after a "dance"
    const where = () => pg.evaluate(() => { const hv = window.__hv, c = hv.renderer.pet.centre;
      const v = { x: c.x, y: c.y, z: c.z, project: null }; const p = hv.rig.camera.position.clone().set(c.x, c.y, c.z).project(hv.rig.camera);
      void v; return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight }; });
    let at = await where();
    await pg.evaluate(() => { const S = window.__hv.sim().S; S.pet.last = { id: 'dance', t: S.t }; });
    const w0 = await pg.evaluate(() => window.__hv.sim().S.pet.w.dance);
    await pg.mouse.move(at.x, at.y);
    await frames(pg, 3);
    await pg.mouse.down();
    await pg.mouse.up();
    await frames(pg, 4);
    await pg.screenshot({ path: 'shots/pet-stroke.png' });
    const after = await pg.evaluate(() => ({ w: window.__hv.sim().S.pet.w.dance, strokes: window.__hv.sim().S.stat.strokes }));
    if (!(after.w > w0 && after.strokes === 1)) errors.push(`pet: stroke did not teach (${w0} -> ${after.w}, strokes ${after.strokes})`);
    // scold it with a right-click
    at = await where();
    const love0 = await pg.evaluate(() => window.__hv.sim().S.pet.love);
    await pg.mouse.click(at.x, at.y, { button: 'right' });
    await frames(pg, 3);
    await pg.screenshot({ path: 'shots/pet-scold.png' });
    if (!(await pg.evaluate((l) => window.__hv.sim().S.pet.love < l, love0))) errors.push('pet: scold did nothing');
    // each species at a different size
    for (const [kind, xp] of [['sheep', 0], ['monkey', 60], ['chicken', 200]]) {
      await pg.evaluate(([kind, xp]) => { const hv = window.__hv, sim = hv.sim(), S = sim.S, [sx, sy] = S.start, old = { x: sx + 2.6, y: sy + 2.4 };
        sim.choosePet(kind, kind, old.x, old.y); S.pet.face = Math.PI / 2 - 0.7; S.pet.xp = xp; S.pet.stage = xp >= 160 ? 2 : xp >= 40 ? 1 : 0; S.pet.mode = 'stay'; S.pet.post = [old.x, old.y];
        if (kind === 'monkey') { S.pet.w = { help: 4, plant: 4, dance: 4, play: 1, mischief: 0.2 }; }
        if (kind === 'chicken') { S.pet.w = { help: 0.3, plant: 0.3, dance: 0.3, play: 1, mischief: 4 }; }
        S.pet.act = { id: 'wander', ph: 'do', tx: old.x, ty: old.y, t: 99, go: 0, tile: [Math.floor(old.x), Math.floor(old.y)] };
        const r = hv.rig; r.fx = old.x; r.fz = old.y; r.zoom = 0.1; r.apply(); }, [kind, xp]);
      await pg.mouse.move(80, 700);
      await frames(pg, 8);
      await pg.screenshot({ path: `shots/pet-${kind}.png` });
    }
    // the pet pen: build one by the village, then see the pet asleep in it at night and about by day
    const pen = await pg.evaluate(() => {
      const hv = window.__hv, sim = hv.sim(), S = sim.S, [sx, sy] = S.start;
      S.wood = 999;
      for (let r = 3; r < 14; r++)
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2, x = Math.round(sx + Math.cos(a) * r), y = Math.round(sy + Math.sin(a) * r);
          if (sim.build('pen', x, y)) {
            const s = S.structs.find((o) => o.k === 'pen'); s.prog = 1;
            return [s.x, s.y];
          }
        }
      return null;
    });
    if (!pen) errors.push('pet: could not build a pen');
    else {
      await pg.evaluate(([x, y]) => { const hv = window.__hv, S = hv.sim().S, P = S.pet;
        P.x = P.px = x + 0.5; P.y = P.py = y + 0.5; P.mode = 'stay'; P.post = [x + 0.5, y + 0.5]; P.need.energy = 20;
        P.act = { id: 'sleep', ph: 'do', tx: x + 0.5, ty: y + 0.5, t: 999, go: 0, tile: [x, y], pen: true };
        S.t = Math.floor(S.t / 150) * 150 + 0.92 * 150;
        const r = hv.rig; r.fx = x + 0.5; r.fz = y + 0.5; r.zoom = 0.12; r.apply(); }, pen);
      await frames(pg, 10);
      await pg.screenshot({ path: 'shots/pet-pen-night.png' });
      const e0 = await pg.evaluate(() => window.__hv.sim().S.pet.need.energy);
      await pg.evaluate(() => window.__hv.ff(30));
      const e1 = await pg.evaluate(() => window.__hv.sim().S.pet.need.energy);
      if (!(e1 > e0 + 20)) errors.push(`pet: no faster rest in the pen (${e0} -> ${e1})`);
      await pg.evaluate(([x, y]) => { const S = window.__hv.sim().S, P = S.pet; S.t = Math.floor(S.t / 150) * 150 + 0.45 * 150;
        P.x = P.px = x + 0.5; P.y = P.py = y + 1.2; P.act = { id: 'wander', ph: 'do', tx: P.x, ty: P.y, t: 99, go: 0, tile: [x, y + 1] }; }, pen);
      await frames(pg, 10);
      await pg.screenshot({ path: 'shots/pet-pen-day.png' });
    }
    await pg.close();
  }

  // ---------- the Red tribe ----------
  {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    watch(pg, 'rival');
    await pg.goto(`${BASE}/?seed=42&nohelp&nopet&sandbox&nosave`);
    await pg.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
    await pg.evaluate(() => window.__hv.ff(150 * 1.5));
    await pg.evaluate(() => localStorage.removeItem('hearthvale-border'));
    // the HUD's Red tribe row takes you to their village
    await pg.click('#hrr');
    await pg.evaluate(() => { const hv = window.__hv, S = hv.sim().S; S.t = Math.floor(S.t / 150) * 150 + 0.42 * 150; hv.rig.zoom = 0.32; hv.rig.apply(); });
    await pg.mouse.move(80, 700);
    await frames(pg, 10);
    await pg.screenshot({ path: 'shots/rival-village.png' });
    const info = await pg.evaluate(() => { const S = window.__hv.sim().S;
      return { met: !!S.hinted.metRival, homes: S.homes.filter((b) => b.tribe === 1).length, people: S.vills.filter((v) => v.tribe === 1).length }; });
    console.log('red tribe', info);
    if (!info.met) errors.push('rival: clicking the Red tribe did not take us there');
    // both borders are drawn, and B hides them
    const borders = await pg.evaluate(() => window.__hv.renderer.border.counts);
    console.log('border segments [ours, theirs]', borders);
    if (!(borders[0] > 0 && borders[1] > 0)) errors.push(`rival: borders missing (${borders})`);
    await pg.keyboard.press('b');
    await frames(pg, 3);
    if ((await pg.evaluate(() => window.__hv.renderer.border.counts)).some((n) => n > 0)) errors.push('rival: B did not hide the borders');
    await pg.keyboard.press('b');
    // a Red festival at dusk: their bunting and lanterns
    await pg.evaluate(() => { const S = window.__hv.sim().S; S.rival.fest = 30; S.t = Math.floor(S.t / 150) * 150 + 0.78 * 150; });
    await frames(pg, 12);
    await pg.screenshot({ path: 'shots/rival-festival.png' });
    await pg.evaluate(() => { const S = window.__hv.sim().S; S.rival.fest = 0; S.t = Math.floor(S.t / 150) * 150 + 0.42 * 150; });
    if (!info.homes) errors.push('rival: no Red homes');
    // win one home over: show a half-won pennant, then bless it until it joins
    const home = await pg.evaluate(() => { const S = window.__hv.sim().S, reds = S.homes.filter((b) => b.tribe === 1);
      reds.forEach((b, i) => { b.bel = i % 2 ? 50 : 88; });
      return reds[0] ? { id: reds[0].id, x: reds[0].x, y: reds[0].y } : null; });
    await frames(pg, 6);
    await pg.screenshot({ path: 'shots/rival-winning.png' });
    if (home) {
      const joined = await pg.evaluate((h) => { const hv = window.__hv, sim = hv.sim(), S = sim.S; S.best = 999;
        sim.useTool('bloom', h.x, h.y); return S.homes.find((b) => b.id === h.id)?.tribe === 0; }, home);
      if (!joined) errors.push('rival: a blessing did not win the home over');
      await frames(pg, 30);
      await pg.screenshot({ path: 'shots/rival-joined.png' });
    }
    await pg.close();
  }

  // ---------- other quality tiers (single shadow map paths) ----------
  for (const tier of ['high', 'medium', 'low']) {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    watch(pg, `q=${tier}`);
    await pg.goto(`${BASE}/?seed=42&nohelp&nopet&q=${tier}`);
    await pg.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
    await pg.waitForTimeout(600);
    await shot(pg, `quality-${tier}`, () => { window.__hv.sim().S.t = 0.42 * 150; });
    console.log(`q=${tier} renderer.info`, await pg.evaluate(() => window.__hv.info()));
    await pg.close();
  }

  // ---------- installable and offline ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = await ctx.newPage();
    watch(pg, 'pwa');
    await pg.goto(`${BASE}/?seed=42&nohelp&nopet&nosave`);
    await pg.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
    const manifest = await pg.evaluate(() => document.querySelector('link[rel=manifest]')?.getAttribute('href'));
    if (!manifest) errors.push('pwa: no manifest link');
    const sw = await pg.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 20000))]));
    if (!sw) errors.push('pwa: service worker never became ready');
    else {
      // let the precache finish, then play offline
      await pg.waitForFunction(() => caches.keys().then((k) => k.length > 0), null, { timeout: 20000 });
      await pg.waitForTimeout(1500);
      await ctx.setOffline(true);
      await pg.reload();
      const offline = await pg.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 }).then(() => true).catch(() => false);
      console.log('plays offline:', offline);
      if (!offline) errors.push('pwa: the game did not load offline');
      // the untouched prototype loads its font from Google, which fails offline (expected)
      const lp = await ctx.newPage();
      watch(lp, 'pwa-legacy', (t) => /Failed to load resource|ERR_|net::/.test(t));
      const legacyOffline = await lp.goto(`${BASE}/legacy/`).then(() => lp.evaluate(() => !!document.querySelector('#cv'))).catch(() => false);
      console.log('prototype offline:', legacyOffline);
      if (!legacyOffline) errors.push('pwa: /legacy/ did not load offline');
    }
    await ctx.close();
  }

  // ---------- legacy prototype ----------
  const leg = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // The prototype loads its font from Google; a blocked font request is not a game error.
  watch(leg, 'legacy', (t) => /Failed to load resource|ERR_|net::/.test(t));
  await leg.goto(`${BASE}/legacy/`);
  await leg.waitForTimeout(1500);
  const legOk = await leg.evaluate(() => !!document.querySelector('#cv') && document.querySelector('#cv').width > 0);
  if (!legOk) errors.push('legacy: canvas missing');
  await leg.screenshot({ path: 'shots/legacy.png' });
} finally {
  await browser.close();
  await server.close();
}

if (errors.length) {
  console.error('SMOKE FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke ok: screenshots in shots/');
