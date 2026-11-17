// Screenshots for reviewing the look of the world: a grown village at noon, close up, wide,
// at dusk and in autumn, from the dev server (no build). Saves shots/vibe-*.png.
// Usage: npm run vibeshots [-- --scale 2] [--q 'tm=agx&ex=1.2'] [--tag -agx]
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const scale = Number(arg('--scale')) || 1, extra = arg('--q') ?? '', tag = arg('--tag') ?? '';

mkdirSync('shots', { recursive: true });
const server = await createServer({ server: { port: 4181, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: scale });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:4181/?seed=42&nohelp&sandbox&nopet&fresh&nosave${extra ? '&' + extra : ''}`);
  await page.waitForFunction(() => window.__hv?.sim, null, { timeout: 60000 });
  const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  // the same village the smoke test grows: three days, a farm, a lumber camp and a shrine
  await page.evaluate(() => {
    const hv = window.__hv, sim = hv.sim(), S = sim.S, [sx, sy] = S.start;
    sim.sandbox = true;
    S.t = 150 * 0.3;
    hv.ff(150 * 3);
    for (const [k, dx, dy] of [['farm', 5, 0], ['lumber', -5, 2], ['shrine', 0, 6]]) {
      outer: for (let r = 0; r < 12; r++) for (let a = 0; a < 16; a++) {
        if (sim.build(k, sx + dx + Math.round(Math.cos((a / 16) * Math.PI * 2) * r), sy + dy + Math.round(Math.sin((a / 16) * Math.PI * 2) * r))) break outer;
      }
    }
    hv.ff(40);
  });
  const view = (zoom, yaw, tod, day = 0) => page.evaluate(({ zoom, yaw, tod, day }) => {
    const hv = window.__hv, S = hv.sim().S, [sx, sy] = S.start, r = hv.rig;
    r.fx = sx + 0.5; r.fz = sy + 0.5; r.zoom = zoom; r.yaw = yaw; r.apply();
    S.t = (day || Math.floor(S.t / 150)) * 150 + tod * 150;
  }, { zoom, yaw, tod, day });
  for (const [name, zoom, yaw, tod, day] of [
    ['vibe-village', 0.22, 0.7, 0.45, 0], ['vibe-close', 0.08, 1.1, 0.42, 0], ['vibe-wide', 0.6, 0.7, 0.4, 0],
    ['vibe-dusk', 0.3, 2.2, 0.745, 0], ['vibe-autumn', 0.35, 0.3, 0.45, 7],
  ]) {
    await view(zoom, yaw, tod, day);
    await frames(6);
    await page.screenshot({ path: `shots/${name}${tag}.png` });
    console.log('·', name);
  }
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
