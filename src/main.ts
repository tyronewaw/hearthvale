import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import './ui/styles.css';
import { Sim, type ToolId } from './sim/sim';
import { TICK } from './sim/world';
import { CameraRig } from './render/camera-rig';
import { GameRenderer } from './render/renderer';
import { standY } from './render/scale';
import { Controls } from './input/controls';
import { Ui } from './ui/hud';

/** Debug and test hook used by scripts/smoke.mjs. */
export interface HvDebug {
  ready: boolean;
  sim(): Sim;
  rig: CameraRig;
  setTool(id: ToolId): void;
  use(id: ToolId, vx: number, vz: number): boolean;
  /** Advance the simulation by this many in-game seconds immediately. */
  ff(seconds: number): void;
  info(): { calls: number; triangles: number; fps: number };
}
declare global {
  interface Window {
    __hv: HvDebug;
  }
}

const params = new URLSearchParams(location.search);
const newSeed = () => (Date.now() ^ (Math.random() * 0xffffff)) & 0xffffff;
let sim = Sim.newWorld(params.has('seed') ? Number(params.get('seed')) : newSeed());
const sandbox = params.has('sandbox');
sim.sandbox = sandbox;

const canvas = document.getElementById('cv') as HTMLCanvasElement;
const rig = new CameraRig(sim.S.start[0] + 0.5, sim.S.start[1] + 0.5, innerWidth / innerHeight);
const R = new GameRenderer(canvas, sim.S, rig);

let tool: ToolId = 'raise';
let paused = false;
let speed = 1;
let acc = 0;

const ui = new Ui({
  pickTool,
  togglePause,
  cycleSpeed: () => (speed = speed === 1 ? 2 : speed === 2 ? 4 : 1),
  newWorld: () => {
    sim = Sim.newWorld(newSeed());
    sim.sandbox = sandbox;
    R.setState(sim.S);
    rig.fx = sim.S.start[0] + 0.5;
    rig.fz = sim.S.start[1] + 0.5;
    rig.apply();
  },
});

const controls = new Controls(canvas, rig, {
  state: () => sim.S,
  tool: () => tool,
  setTool: pickTool,
  act: (id, vx, vz) => {
    if (sim.useTool(id, vx, vz)) controls.updateHover();
  },
  togglePause,
  toggleHelp: () => ui.toggleHelp(),
});

function pickTool(id: ToolId): void {
  tool = id;
  ui.drawBar(tool);
}

function togglePause(): boolean {
  paused = !paused;
  ui.setPaused(paused);
  return paused;
}

function resize(): void {
  R.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
pickTool(tool);
if (!params.has('nohelp')) ui.toggleHelp(true);

let last = performance.now(), fps = 60, statsT = 0;
const showStats = params.has('stats');

function frame(now: number): void {
  const rdt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(rdt, 1e-3) - fps) * 0.05;

  // Fixed 10 Hz simulation; speed-ups run more ticks, capped so a slow frame can't spiral.
  if (!paused) {
    acc += rdt * speed;
    let n = 0;
    while (acc >= TICK && n < 8) {
      sim.tick();
      acc -= TICK;
      n++;
    }
    if (n === 8) acc = 0;
  }
  for (const e of sim.drain()) {
    if (e.k === 'terrain') R.terrainChanged(e.tiles);
    else if (e.k === 'toast') ui.toast(e.msg);
  }

  controls.frame(rdt, now);
  rig.update(rdt, standY(sim.S, rig.fx, rig.fz));
  canvas.className = tool === 'hand' ? (controls.dragging ? 'grabbing' : 'grab') : 'aim';
  R.render(now / 1000, controls.dragging ? null : controls.hover, tool);
  ui.hud(sim.S, rdt);
  if (showStats && (statsT -= rdt) <= 0) {
    statsT = 0.5;
    const r = R.gl.info.render;
    ui.stats(`${fps.toFixed(0)} fps · ${r.calls} calls · ${(r.triangles / 1000).toFixed(1)}k tris`);
  }
  requestAnimationFrame(frame);
}

window.__hv = {
  ready: false,
  sim: () => sim,
  rig,
  setTool: pickTool,
  use: (id, vx, vz) => sim.useTool(id, vx, vz),
  ff: (seconds) => {
    for (let i = 0; i < seconds / TICK; i++) sim.tick();
  },
  info: () => ({ calls: R.gl.info.render.calls, triangles: R.gl.info.render.triangles, fps }),
};

requestAnimationFrame((t) => {
  last = t;
  frame(t);
  ui.loaded();
  window.__hv.ready = true;
});
