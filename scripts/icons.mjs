// Generates the app icons (public/icons/*.png) from a 32×32 pixel-art hut drawn in code,
// rendered crisply in headless Chromium. Usage: node scripts/icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
mkdirSync('public/icons', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const out = await page.evaluate(() => {
  // 32×32 art: sky, a green hill, a thatched round hut with a blue tribe flag.
  const art = (padded) => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d');
    const px = (col, a, b, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    px('#a9d8f2', 0, 0, 32, 32);
    px('#c9e8f7', 0, 0, 32, 10);
    // the hut is scaled down inside a safe zone for maskable icons
    const s = padded ? 0.78 : 1, o = padded ? 3.5 : 0;
    const P = (col, a, b, w = 1, h = 1) => px(col, Math.round(o + a * s), Math.round(o + b * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    // hill
    for (let y = 20; y < 32; y++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - ((y - 31) / 12) ** 2)) * 20);
      P(y < 23 ? '#9bd27a' : '#6aaf5a', 16 - half, y, half * 2, 1);
    }
    // wattle wall
    for (let i = 0; i < 14; i++) P(i % 3 === 0 ? '#77522f' : i < 5 ? '#b98d5c' : '#9b7147', 9 + i, 19, 1, 5);
    P('#3a2418', 14, 20, 4, 4); // door
    // thatch cone with bands
    for (let y = 6; y <= 19; y++) {
      const half = Math.round(((y - 6) / 13) * 8.5);
      for (let i = -half; i <= half; i++) {
        const band = y >= 18 ? '#a9792e' : (y % 3 === 0 ? '#d4a64a' : i < -half / 3 ? '#ecca72' : '#d4a64a');
        P(band, 16 + i, y, 1, 1);
      }
    }
    P('#6b4426', 14, 4, 1, 3);
    P('#6b4426', 17, 4, 1, 3);
    // flag
    P('#6b4426', 25, 12, 1, 10);
    P('#3f6fc4', 26, 12, 4, 3);
    P('#f2b632', 26, 15, 3, 1);
    return c;
  };
  const sizes = { 'icon-192.png': [192, false], 'icon-512.png': [512, false], 'maskable-512.png': [512, true], 'apple-touch-icon.png': [180, false], 'favicon-32.png': [32, false] };
  const res = {};
  for (const [name, [n, padded]] of Object.entries(sizes)) {
    const big = document.createElement('canvas');
    big.width = big.height = n;
    const g = big.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(art(padded), 0, 0, n, n);
    res[name] = big.toDataURL('image/png').split(',')[1];
  }
  return res;
});
for (const [name, b64] of Object.entries(out)) writeFileSync(`public/icons/${name}`, Buffer.from(b64, 'base64'));
await browser.close();
console.log('icons:', Object.keys(out).join(', '));
