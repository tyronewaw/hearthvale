// Renders every pet species at every growth stage (baby, young, grand) into one 3×3 sheet,
// shots/pets-growth.png, for reviewing pet art. Usage: npm run petshots  (add -- --no-build to skip the build)
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 4181;
if (!process.argv.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });
mkdirSync('shots', { recursive: true });
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${PORT}/?seed=42&nohelp&nopet&nosave`);
await page.waitForFunction(() => window.__hv?.ready, null, { timeout: 30000 });
await page.mouse.move(2, 690);
const frames = (n) => page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const tiles = [];
for (const kind of ['sheep', 'monkey', 'chicken'])
  for (const [stage, xp] of [[0, 0], [1, 60], [2, 200]]) {
    await page.evaluate(([kind, xp, stage]) => {
      const hv = window.__hv, sim = hv.sim(), S = sim.S, [sx, sy] = S.start, x = sx + 0.5, y = sy + 3.5;
      S.t = Math.floor(S.t / 150) * 150 + 0.45 * 150;
      sim.choosePet(kind, kind, x, y);
      const P = S.pet;
      P.xp = xp; P.stage = stage; P.face = Math.PI / 2 - 1.25; P.mode = 'stay'; P.post = [x, y];
      P.need = { food: 100, energy: 100, fun: 100 };
      P.act = { id: 'wander', ph: 'do', tx: x, ty: y, t: 999, go: 0, tile: [Math.floor(x), Math.floor(y)] };
      const r = hv.rig; r.fx = x; r.fz = y - 0.3; r.zoom = [0.02, 0.06, 0.1][stage]; r.apply();
    }, [kind, xp, stage]);
    await frames(8);
    tiles.push((await page.screenshot({ clip: { x: 270, y: 170, width: 360, height: 360 } })).toString('base64'));
  }
const sheet = await page.evaluate(async (tiles) => {
  const c = document.createElement('canvas'), s = 360;
  c.width = c.height = s * 3;
  const x = c.getContext('2d');
  for (let i = 0; i < tiles.length; i++) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + tiles[i];
    await img.decode();
    x.drawImage(img, (i % 3) * s, Math.floor(i / 3) * s);
  }
  x.font = '600 22px "Pixelify Sans", sans-serif';
  x.fillStyle = '#3a2418';
  ['Baby', 'Young', 'Grand'].forEach((t, i) => x.fillText(t, i * s + 12, 28));
  return c.toDataURL('image/png').split(',')[1];
}, tiles);
writeFileSync('shots/pets-growth.png', Buffer.from(sheet, 'base64'));
await browser.close();
await server.close();
if (errors.length) {
  console.error('errors:', errors);
  process.exit(1);
}
console.log('pets-growth.png written');
