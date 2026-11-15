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
  const before = await desk.evaluate(() => { const s = window.__hv.sim().S; return Array.from(s.h).reduce((a, b) => a + b, 0); });
  await desk.mouse.move(640, 400);
  await frames(desk);
  for (let i = 0; i < 4; i++) { await desk.mouse.down(); await desk.mouse.up(); await frames(desk, 2); }
  await desk.mouse.click(640, 400, { button: 'right' });
  const after = await desk.evaluate(() => { const s = window.__hv.sim().S; return Array.from(s.h).reduce((a, b) => a + b, 0); });
  if (!(after > before)) errors.push(`desktop: clicking did not raise land (${before} -> ${after})`);

  // Sculpt a hill and a flat terrace with the sim API, then look at it.
  await desk.evaluate(() => {
    const hv = window.__hv, [sx, sy] = hv.sim().S.start;
    for (let i = 0; i < 6; i++) hv.use('raise', sx + 6, sy + 3);
    for (let i = 0; i < 4; i++) hv.use('lower', sx - 5, sy + 6);
    hv.sim().useTool('flat', sx + 6, sy - 6);
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
