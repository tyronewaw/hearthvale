// Renders every building (six home levels, the work buildings, a building site at three
// stages, and Red tribe homes) into one sheet, shots/buildings.png, for reviewing building art.
// Usage: npm run buildshots  (add -- --no-build to skip the build)
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 4182;
if (!process.argv.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });
mkdirSync('shots', { recursive: true });
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${PORT}/?seed=42&nohelp&nopet&nosave&sandbox`);
await page.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
await page.keyboard.press('Space'); // pause: the sheet shows buildings exactly as set
await page.mouse.move(2, 690);

const ITEMS = [
  ...[0, 1, 2, 3, 4, 5].map((lv) => ({ label: ['Tepee', 'Hut', 'Round hut', 'Big hut', 'Longhouse', 'Great lodge'][lv], home: { lv, tribe: 0, bel: 0 } })),
  ...['hearth', 'farm', 'lumber', 'fish', 'shrine', 'pen'].map((k) => ({ label: k[0].toUpperCase() + k.slice(1), struct: { k, prog: 1, tribe: 0, sz: 2 } })),
  ...[0.1, 0.4, 0.75].map((p) => ({ label: `Site ${Math.round(p * 100)}%`, struct: { k: 'farm', prog: p, tribe: 0, sz: 2 } })),
  { label: 'Red round hut', home: { lv: 2, tribe: 1, bel: 0 } },
  { label: 'Red, half won', home: { lv: 3, tribe: 1, bel: 50 } },
  { label: 'Red shrine', struct: { k: 'shrine', prog: 1, tribe: 1, sz: 2 } },
];
const tiles = [];
let id = 900000;
for (const it of ITEMS) {
  await page.evaluate(([it, id]) => {
    const hv = window.__hv, S = hv.sim().S, [x, y] = S.start;
    S.t = Math.floor(S.t / 150) * 150 + 0.42 * 150;
    S.homes = it.home ? [{ kind: 'home', id, x, y, pop: 2, tb: 1, ...it.home }] : [];
    S.structs = it.struct ? [{ kind: 'struct', id, x, y, fert: 0, ...it.struct }] : [];
    S.vills = [];
    const c = it.struct?.sz === 2 ? 1 : 0.5, r = hv.rig; r.fx = x + c; r.fz = y + c - 0.3; r.zoom = it.home?.lv === 5 ? 0.15 : it.home?.lv >= 4 || it.struct ? 0.11 : 0.06; r.yaw = 0.6; r.apply();
  }, [it, id++]);
  await page.waitForTimeout(1700); // let a new home finish rising
  tiles.push({ label: it.label, png: (await page.screenshot({ clip: { x: 300, y: 190, width: 300, height: 300 } })).toString('base64') });
}
const sheet = await page.evaluate(async (tiles) => {
  const c = document.createElement('canvas'), s = 300, cols = 6;
  c.width = s * cols;
  c.height = s * Math.ceil(tiles.length / cols);
  const x = c.getContext('2d');
  for (let i = 0; i < tiles.length; i++) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + tiles[i].png;
    await img.decode();
    x.drawImage(img, (i % cols) * s, Math.floor(i / cols) * s);
    x.font = '600 20px "Pixelify Sans", sans-serif';
    x.fillStyle = '#3a2418';
    x.fillText(tiles[i].label, (i % cols) * s + 10, Math.floor(i / cols) * s + 26);
  }
  return c.toDataURL('image/png').split(',')[1];
}, tiles);
writeFileSync('shots/buildings.png', Buffer.from(sheet, 'base64'));
await browser.close();
await server.close();
if (errors.length) {
  console.error('errors:', errors);
  process.exit(1);
}
console.log('buildings.png written');
