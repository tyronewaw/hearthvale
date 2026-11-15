import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import './ui/styles.css';
import { Vector3 } from 'three';
import { BMAX, BN, BTH, ROLE_NAME, STRUCTS, type StructKind, type ToolId } from './sim/defs';
import { SAVE_KEY, deserialize, serialize } from './sim/save';
import { Sim } from './sim/sim';
import { fields, validSite, workersAt } from './sim/village';
import { DAY, TICK, idx, wd, wrap } from './sim/world';
import { bendDrop } from './render/bend';
import { CameraRig } from './render/camera-rig';
import { detectQuality } from './render/quality';
import { GameRenderer } from './render/renderer';
import { standY, surfaceY } from './render/scale';
import { Controls } from './input/controls';
import type { GroundHit } from './input/picking';
import { Ui } from './ui/hud';

/** Debug and test hook used by scripts/smoke.mjs. */
export interface HvDebug {
  ready: boolean;
  sim(): Sim;
  rig: CameraRig;
  renderer: GameRenderer;
  setTool(id: ToolId): void;
  use(id: ToolId, vx: number, vz: number): boolean;
  /** Advance the simulation by this many in-game seconds immediately. */
  ff(seconds: number): void;
  info(): { calls: number; triangles: number; fps: number; tier: string };
  /** Jump the clock to a time of day (0..1) on the current day, for screenshots. */
  timeOfDay(t: number): void;
  save(): void;
}
declare global {
  interface Window {
    __hv: HvDebug;
  }
}

const params = new URLSearchParams(location.search);
const newSeed = () => (Date.now() ^ (Math.random() * 0xffffff)) & 0xffffff;
const sandbox = params.has('sandbox');

/** Continue the saved world, unless the URL asks for a specific seed or a fresh start. */
function boot(): { sim: Sim; loaded: boolean } {
  if (!params.has('seed') && !params.has('fresh')) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const S = raw ? deserialize(raw) : null;
      if (S) return { sim: new Sim(S), loaded: true };
    } catch {
      /* private mode etc.: just start fresh */
    }
  }
  return { sim: Sim.newWorld(params.has('seed') ? Number(params.get('seed')) : newSeed()), loaded: false };
}
const booted = boot();
let sim = booted.sim;
sim.sandbox = sandbox;

function save(): void {
  if (params.has('nosave')) return;
  try {
    localStorage.setItem(SAVE_KEY, serialize(sim.S));
  } catch {
    /* storage full or blocked */
  }
}
addEventListener('pagehide', save);
addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});

const canvas = document.getElementById('cv') as HTMLCanvasElement;
const rig = new CameraRig(sim.S.start[0] + 0.5, sim.S.start[1] + 0.5, innerWidth / innerHeight);
const R = new GameRenderer(canvas, sim.S, rig, detectQuality());

let tool: ToolId = 'hand';
let bsel: StructKind = 'farm';
let paused = false;
let speed = 1;
let acc = 0;

const ui = new Ui({
  pickTool,
  pickStruct: (k) => {
    bsel = k;
    redrawBar();
  },
  togglePause,
  cycleSpeed: () => (speed = speed === 1 ? 2 : speed === 2 ? 4 : 1),
  newWorld: () => {
    sim = Sim.newWorld(newSeed());
    sim.sandbox = sandbox;
    R.setState(sim.S);
    rig.fx = sim.S.start[0] + 0.5;
    rig.fz = sim.S.start[1] + 0.5;
    rig.apply();
    redrawBar();
    save();
  },
});

const ndc = (cx: number, cy: number) => {
  const r = canvas.getBoundingClientRect();
  return { x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1, w: r.width, h: r.height };
};
const pv = new Vector3();
/** Nearest tree or rock to a screen point (picked by where they're drawn, not the ground behind). */
function pickFlora(cx: number, cy: number, hit: GroundHit | null): { k: 'tree' | 'rock'; x: number; y: number } | null {
  if (!hit) return null;
  const p = ndc(cx, cy), S = sim.S, { fx, fz } = rig;
  let best: { k: 'tree' | 'rock'; x: number; y: number } | null = null, bd = 26;
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const x = wrap(hit.tx + dx), y = wrap(hit.tz + dy), t = idx(x, y);
      const k = S.tree[t] ? 'tree' : S.rock[t] ? 'rock' : null;
      if (!k) continue;
      const wx = fx + wd(fx, x + 0.5), wz = fz + wd(fz, y + 0.5);
      pv.set(wx, surfaceY(S, x + 0.5, y + 0.5) + (k === 'tree' ? 0.65 : 0.15) - bendDrop(wx, wz), wz).project(rig.camera);
      const d = Math.hypot(((pv.x - p.x) * p.w) / 2, ((pv.y - p.y) * p.h) / 2);
      if (d < bd) {
        bd = d;
        best = { k, x, y };
      }
    }
  return best;
}

const controls = new Controls(canvas, rig, {
  state: () => sim.S,
  tool: () => tool,
  setTool: pickTool,
  act: (id, hit) => {
    const ok = id === 'build' ? sim.build(bsel, hit.tx, hit.tz) : sim.useTool(id, hit.vx, hit.vz);
    if (ok) controls.updateHover();
  },
  tryGrab: (cx, cy) => {
    const p = ndc(cx, cy);
    const v = R.villagers.pick(rig.camera, p.x, p.y, p.w, p.h, 20);
    if (v) return sim.grab(v.id);
    const f = pickFlora(cx, cy, controls.hover);
    if (f) return f.k === 'tree' ? sim.grabTree(f.x, f.y) : sim.grabRock(f.x, f.y);
    return false;
  },
  drop: (hit) => {
    if (!sim.S.held) return;
    if (hit) sim.drop(wrap(hit.x), wrap(hit.z), false);
    else sim.drop(rig.fx, rig.fz, false);
  },
  togglePause,
  toggleHelp: () => ui.toggleHelp(),
});

function redrawBar(): void {
  ui.drawBar(tool, bsel, sandbox ? 1e9 : sim.S.best);
}
function pickTool(id: ToolId): void {
  tool = id;
  redrawBar();
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
if (!params.has('nohelp') && !booted.loaded) ui.toggleHelp(true);

/** Tooltip for whatever is under the pointer (the prototype's hover()). */
function tooltip(): string | null {
  const ptr = controls.pointer, hit = controls.hover, S = sim.S;
  if (!ptr || controls.dragging || controls.carrying) return null;
  if (tool === 'hand') {
    const p = ndc(ptr.x, ptr.y), v = R.villagers.pick(rig.camera, p.x, p.y, p.w, p.h, 16);
    if (v) {
      const what = v.role === 'settler' ? (v.type === 'resident' ? 'Villager at home' : 'Wanderer') : ROLE_NAME[v.role][0]!.toUpperCase() + ROLE_NAME[v.role].slice(1);
      return `<b>${what}</b><br>Grab to carry. Drop on a building to give a job.`;
    }
    const f = pickFlora(ptr.x, ptr.y, hit);
    if (f?.k === 'tree') return '<b>Tree</b><br>Grab it. Drop on the Hearth or a Lumber camp for wood, or replant it';
    if (f?.k === 'rock') return '<b>Rock</b><br>Grab it and put it somewhere new';
  }
  if (!hit) return null;
  const b = sim.bmap[idx(hit.tx, hit.tz)];
  if (b?.kind === 'home') {
    const f = fields(sim, b.x, b.y);
    return `<b>${BN[b.lv]}</b> · ${Math.floor(b.pop)} of ${BMAX[b.lv]} villagers<br>Open fields ${f} of 25` +
      (b.lv < 5 ? `<br>${BTH[b.lv + 1]} fields to become a ${BN[b.lv + 1]!.toLowerCase()}` : '') +
      (b.tb > 1 ? `<br>Trees nearby: growth +${Math.round((b.tb - 1) * 100)}%` : '');
  }
  if (b?.kind === 'struct') {
    const D = STRUCTS[b.k], n = workersAt(S, b);
    return `<b>${D.name}</b>${b.prog < 1 ? ` · building ${Math.round(b.prog * 100)}%` : ''}<br>${n} of ${D.cap} ${D.role}s` +
      (b.k === 'hearth' ? `<br>Store: ${Math.floor(S.food)} food, ${Math.floor(S.wood)} wood` : '') +
      (b.fert > 0 ? '<br>Fertilised: double harvest' : '');
  }
  return null;
}

let last = performance.now(), fps = 60, statsT = 0, tipT = 0, saveT = 20;
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
    R.onEvent(e);
    if (e.k === 'toast') ui.toast(e.msg);
    else if (e.k === 'ui') redrawBar();
  }

  controls.frame(rdt, now);
  rig.update(rdt, standY(sim.S, rig.fx, rig.fz));
  canvas.className = tool === 'hand' ? (controls.dragging || controls.carrying ? 'grabbing' : 'grab') : 'aim';
  const hover = controls.dragging ? null : controls.hover;
  const ghost = tool === 'build' && hover
    ? { kind: bsel, tile: [hover.tx, hover.tz] as [number, number], ok: validSite(sim, bsel, hover.tx, hover.tz) && (sandbox || sim.S.wood >= STRUCTS[bsel].wood) }
    : null;
  R.render(now / 1000, {
    dt: rdt, alpha: paused ? 1 : Math.min(1, acc / TICK), hover, tool, crops: sim.crops, ghost,
    hand: hover ? { x: wrap(hover.x), z: wrap(hover.z) } : null,
  });
  ui.hud(sim.S, rdt);
  if ((tipT -= rdt) <= 0) {
    tipT = 0.12;
    const ptr = controls.pointer;
    ui.tip(tooltip(), ptr?.x ?? 0, ptr?.y ?? 0);
  }
  if ((saveT -= rdt) <= 0) {
    saveT = 20;
    save();
  }
  if (showStats && (statsT -= rdt) <= 0) {
    statsT = 0.5;
    const r = R.gl.info.render;
    ui.stats(`${fps.toFixed(0)} fps · ${r.calls} calls · ${(r.triangles / 1000).toFixed(1)}k tris · ${R.q.tier}`);
  }
  requestAnimationFrame(frame);
}

window.__hv = {
  ready: false,
  sim: () => sim,
  rig,
  renderer: R,
  setTool: pickTool,
  use: (id, vx, vz) => sim.useTool(id, vx, vz),
  ff: (seconds) => {
    for (let i = 0; i < seconds / TICK; i++) sim.tick();
  },
  info: () => ({ calls: R.gl.info.render.calls, triangles: R.gl.info.render.triangles, fps, tier: R.q.tier }),
  timeOfDay: (t) => {
    const S = sim.S;
    S.t = Math.floor(S.t / DAY) * DAY + t * DAY;
  },
  save,
};

requestAnimationFrame((t) => {
  last = t;
  frame(t);
  ui.loaded();
  window.__hv.ready = true;
});
