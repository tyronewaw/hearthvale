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
  await desk.goto(`${BASE}/?seed=42&nohelp&sandbox`);
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
    const hv = window.__hv, d = hv.renderer.villagers.drawn.find((x) => (x.v.type === 'settler' || x.v.type === 'worker') && x.v.dizzy <= 0) ?? hv.renderer.villagers.drawn[0];
    if (!d) return null;
    const p = d.p.clone().project(hv.rig.camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, id: d.v.id, vx: d.v.x, vz: d.v.y, stat: { ...hv.sim().S.stat } };
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
  target = await grabVillager();
  if (!target) errors.push('hand: could not grab a villager to throw');
  else {
    await desk.evaluate(() => window.__hv.throwHeld(-10, -6));
    await desk.mouse.up();
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
      console.log('thrown villager flew', moved.toFixed(1), 'tiles');
      if (moved < 3) errors.push(`hand: throw too short (${moved})`);
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
  await phone.goto(`${BASE}/?seed=42&nohelp`);
  await phone.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
  await phone.waitForTimeout(600);
  await phone.screenshot({ path: 'shots/phone.png' });
  await phone.goto(`${BASE}/?seed=42`);
  await phone.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
  await phone.waitForTimeout(600);
  await phone.screenshot({ path: 'shots/phone-help.png' });
  await phoneCtx.close();

  // ---------- other quality tiers (single shadow map paths) ----------
  for (const tier of ['high', 'medium', 'low']) {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    watch(pg, `q=${tier}`);
    await pg.goto(`${BASE}/?seed=42&nohelp&q=${tier}`);
    await pg.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
    await pg.waitForTimeout(600);
    await shot(pg, `quality-${tier}`, () => { window.__hv.sim().S.t = 0.42 * 150; });
    console.log(`q=${tier} renderer.info`, await pg.evaluate(() => window.__hv.info()));
    await pg.close();
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
