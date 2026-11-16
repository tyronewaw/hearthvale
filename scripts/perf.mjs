// Performance probe: renderer.info (draw calls, triangles) and frame time at a few zooms,
// for a grown village. Usage: node scripts/perf.mjs [--no-build]
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
if (!process.argv.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });
const server = await preview({ preview: { port: 4191, strictPort: true }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { const t0 = performance.now(); let i = 0; const f = () => (++i >= n ? r(performance.now() - t0) : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
try {
  for (const q of ['high', 'medium']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:4191/?seed=42&nohelp&nopet&nosave&sandbox&q=${q}`);
    await page.waitForFunction(() => window.__hv?.ready);
    await page.evaluate(() => { const hv = window.__hv; hv.ff(150 * 6); hv.sim().S.t = Math.floor(hv.sim().S.t / 150) * 150 + 0.45 * 150; });
    for (const zoom of [0.2, 0.45, 1]) {
      await page.evaluate((z) => { const r = window.__hv.rig, [sx, sy] = window.__hv.sim().S.start; r.fx = sx; r.fz = sy; r.zoom = z; r.apply(); }, zoom);
      await frames(page, 5);
      const ms = (await frames(page, 20)) / 20;
      const info = await page.evaluate(() => window.__hv.info());
      console.log(`q=${q} zoom=${zoom}: ${info.calls} calls, ${(info.triangles / 1000).toFixed(0)}k tris, ${ms.toFixed(1)} ms/frame (software GL)`);
    }
    const pop = await page.evaluate(() => window.__hv.sim().S.popNow);
    console.log(`  village: ${pop} villagers`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
