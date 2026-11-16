import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import './ui/styles.css';
import { Vector3 } from 'three';
import { BMAX, BN, BTH, ROLE_NAME, STRUCTS, type StructKind, type ToolId } from './sim/defs';
import { BALANCE } from './sim/balance';
import { SAVE_KEY, deserialize, serialize } from './sim/save';
import { V2_KEY, migrateV2 } from './sim/migrate';
import { Audio } from './audio/audio';
import { TOOL } from './sim/defs';
import { Sim } from './sim/sim';
import { beliefRate } from './sim/rival';
import { fields, inInfluence, rivalHearth, validSite, workersAt } from './sim/village';
import { DAY, TICK, idx, tdist, wd, wrap } from './sim/world';
import { bendDrop } from './render/bend';
import { CameraRig } from './render/camera-rig';
import { detectQuality } from './render/quality';
import { GameRenderer } from './render/renderer';
import { standY, surfaceY } from './render/scale';
import { Controls } from './input/controls';
import { ballisticLanding } from './physics/ballistic';
import { Physics, VILL_CENTRE } from './physics/physics';
import { throwVelocity, trimTrail, type TrailPoint } from './physics/throw';
import type { HandPose } from './render/hand';
import type { GroundHit } from './input/picking';
import { Ui } from './ui/hud';
import { PetCard } from './ui/petcard';
import { HNAME, PET_STAGE_SCALE, petStage } from './sim/pet';
import type { Held } from './sim/world';

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
  physicsReady(): boolean;
  lastThrow(): unknown;
  /** Throw whatever the hand holds with a given ground velocity (deterministic, for tests). */
  /** Throw whatever the hand holds with this velocity; returns where it left the hand (tiles). */
  throwHeld(vx: number, vz: number): { x: number; z: number } | null;
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
function boot(): { sim: Sim; loaded: boolean; migrated?: boolean } {
  if (!params.has('seed') && !params.has('fresh')) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const S = raw ? deserialize(raw) : null;
      if (S) return { sim: new Sim(S), loaded: true };
      // No 3D save yet, but a world from the 2D prototype? Carry it over (the old save stays).
      const old = localStorage.getItem(V2_KEY);
      const M = old ? migrateV2(old) : null;
      if (M) return { sim: new Sim(M), loaded: true, migrated: true };
    } catch {
      /* private mode etc.: just start fresh */
    }
  }
  return { sim: Sim.newWorld(params.has('seed') ? Number(params.get('seed')) : newSeed()), loaded: false };
}
const booted = boot();
let sim = booted.sim;
sim.sandbox = sandbox;
// worlds saved before the Red tribe existed meet them now
if (booted.loaded) sim.ensureRival();

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
/** Rapier loads after the first frame; until then throws use a simple arc. */
let physics: Physics | null = null;
/** The hand's recent path (unwrapped world units) while carrying, for throw speed. */
const trail: TrailPoint[] = [];
let trailPrev: { x: number; z: number } | null = null, trailU = { x: 0, z: 0 };
let overGrab = false;
/** Stroke / slap animation on the hand. */
let handAnim = { k: '' as '' | 'stroke' | 'slap', t: 0 };
/** Send mode: the next click on the land sends the pet there. */
let sendMode = false;
/** Villagers the monkey flung (their landing doesn't count as the player's throw). */
const petFlung = new WeakSet<Held>();
/** Last hand grip position, for nudging the pet with a sweep of the open hand. */
let lastGrip: Vector3 | null = null;
/** The last release, for debugging throw feel (window.__hv.lastThrow()). */
let lastThrow: unknown = null, carryFrames = 0, noTarget = 0;

const audio = new Audio();
for (const ev of ['pointerdown', 'keydown'] as const) addEventListener(ev, () => audio.unlock(), { passive: true });

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
  toggleSound: () => audio.toggle(),
  findRival: () => {
    const RH = rivalHearth(sim.S);
    if (!RH) return;
    rig.fx = RH.x + 0.5;
    rig.fz = RH.y + 0.5;
    rig.zoom = Math.min(rig.zoom, 0.45);
    rig.apply();
    sim.metRival();
  },
  helpClosed: () => {
    if (!sim.S.pet) petCard.openChoose();
  },
  newWorld: () => {
    sim = Sim.newWorld(newSeed());
    sim.sandbox = sandbox;
    R.setState(sim.S);
    physics?.setState(sim.S);
    setTimeout(() => petCard.openChoose(), 300);
    rig.fx = sim.S.start[0] + 0.5;
    rig.fz = sim.S.start[1] + 0.5;
    rig.apply();
    redrawBar();
    ui.drawQuest(sim.S);
    save();
  },
});
ui.setSound(audio.on);

const petCard = new PetCard({
  choose: (kind, name) => {
    sim.choosePet(kind, name);
    pickTool('hand');
    save();
  },
  leash: (m) => sim.setLeash(m),
  send: () => {
    sendMode = !sendMode;
    petCard.setSending(sendMode);
    if (sendMode && sim.S.pet) ui.toast(`Click the land where ${sim.S.pet.name} should go`);
  },
  feed: () => {
    sim.feed();
  },
  pen: () => {
    sim.penPet();
  },
  find: () => {
    const P = sim.S.pet;
    if (!P) return;
    rig.fx = P.x;
    rig.fz = P.y;
    rig.apply();
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
  drop: () => release(),
  overPet: (cx, cy) => overPet(cx, cy),
  petTouch: (good) => {
    if (!sim.S.pet) return;
    if (good) sim.stroke();
    else sim.scold();
    handAnim = { k: good ? 'stroke' : 'slap', t: good ? 0.8 : 0.4 };
  },
  click: (hit) => {
    if (!sendMode || !sim.S.pet) return false;
    sim.sendPet(wrap(hit.x), wrap(hit.z));
    sendMode = false;
    petCard.setSending(false);
    return true;
  },
  togglePause,
  toggleHelp: () => ui.toggleHelp(),
});

const pp = new Vector3(), pr = new Vector3();
/** Is the pet drawn under this screen point? */
function overPet(cx: number, cy: number): boolean {
  const c = R.pet.centre;
  if (!c.visible || !sim.S.pet) return false;
  const p = ndc(cx, cy);
  pp.set(c.x, c.y, c.z).project(rig.camera);
  pr.set(c.x, c.y, c.z).addScaledVector(new Vector3().setFromMatrixColumn(rig.camera.matrixWorld, 0), c.r).project(rig.camera);
  const rad = Math.hypot(((pr.x - pp.x) * p.w) / 2, ((pr.y - pp.y) * p.h) / 2) + 8;
  return pp.z < 1 && Math.hypot(((pp.x - p.x) * p.w) / 2, ((pp.y - p.y) * p.h) / 2) < rad;
}

/** Launch something the sim wants flown (the monkey's mischief). */
function launchFromSim(obj: Held, x: number, z: number, vx: number, vz: number): void {
  petFlung.add(obj);
  const y = standY(sim.S, x, z) + 0.6;
  if (physics) physics.launch(obj, x, y, z, vx, 4, vz, true, 1);
  else {
    const l = ballisticLanding(sim.S, x, y, z, vx, 4, vz, true);
    sim.landed(obj, l.x, l.z, true, true);
  }
}

/** Let go of what the hand holds: a throw if the hand was moving fast, a drop otherwise. */
function release(): void {
  const held = sim.S.held;
  if (!held) return;
  const now = performance.now(), v = throwVelocity(trail, now);
  lastThrow = { trail: trail.map((p) => ({ ...p, t: p.t - now })), ...v, carryFrames, noTarget };
  carryFrames = noTarget = 0;
  trail.length = 0;
  const g = R.hand.grip, x = wrap(g.x), z = wrap(g.z);
  const y = held.k === 'v' ? g.y - 0.52 + VILL_CENTRE : held.k === 'tree' ? g.y - 0.95 : g.y - 0.22;
  const obj = sim.release()!;
  if (physics) physics.launch(obj, x, y, z, v.vx, v.vy, v.vz, v.thrown, 1);
  else {
    const l = ballisticLanding(sim.S, x, y, z, v.vx, v.vy, v.vz, v.thrown);
    sim.landed(obj, l.x, l.z, v.thrown);
  }
  if (v.thrown) sim.emit({ k: 'sfx', id: 'throw' });
}

/** Where the hand hovers and how it's posed, from what the player is doing. */
function handState(): { target: Vector3 | null; pose: HandPose } {
  const hit = controls.hover;
  if (!hit || !controls.pointer) return { target: null, pose: 'open' };
  let h = 1.45, pose: HandPose = 'open';
  const P = sim.S.pet;
  if (handAnim.t > 0 && P) {
    // stroke along the pet's back, or a quick swat
    const c = R.pet.centre, sc = PET_STAGE_SCALE[petStage(P)]!;
    const k = handAnim.k === 'slap' ? Math.max(0, handAnim.t / 0.4) : 0;
    // the pet's centre is stored with the bend applied; undo it, since the hand is bent in its shader
    return { target: new Vector3(c.x, c.y + bendDrop(c.x, c.z) + 0.45 * sc + k * 0.5, c.z), pose: handAnim.k === 'slap' ? 'slap' : 'stroke' };
  }
  if (controls.carrying) {
    h = 1.3;
    pose = 'hold';
  } else if (controls.dragging) {
    h = 0.35;
    pose = 'grip';
  } else if (tool !== 'hand' || sendMode) {
    h = 1.0;
    pose = 'point';
  } else if (overGrab) {
    h = 0.85;
    pose = 'reach';
  }
  return { target: new Vector3(hit.x, standY(sim.S, wrap(hit.x), wrap(hit.z)) + h, hit.z), pose };
}

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
ui.drawQuest(sim.S);
if (booted.migrated) setTimeout(() => ui.toast('Your island from the 2D Hearthvale has been carried over to this world'), 800);
if (!params.has('nohelp') && !booted.loaded) ui.toggleHelp(true);
else if (!sim.S.pet && !params.has('nopet')) setTimeout(() => petCard.openChoose(), 200);

/** Tooltip for whatever is under the pointer (the prototype's hover()). */
function tooltip(): string | null {
  const ptr = controls.pointer, hit = controls.hover, S = sim.S;
  overGrab = false;
  if (!ptr || controls.dragging || controls.carrying) return null;
  if (sendMode) return `<b>Send ${S.pet?.name ?? ''}</b><br>Click the land where it should go and stay`;
  if (S.pet && overPet(ptr.x, ptr.y)) {
    overGrab = true;
    return `<b>${S.pet.name}</b> · ${HNAME[S.pet.act ? S.pet.act.id : 'wander']}<br>Click to stroke, right-click to scold`;
  }
  if (tool === 'hand') {
    const p = ndc(ptr.x, ptr.y), v = R.villagers.pick(rig.camera, p.x, p.y, p.w, p.h, 16);
    overGrab = !!v || !!pickFlora(ptr.x, ptr.y, hit);
    if (v) {
      if (v.tribe === 1)
        return `<b>Red tribe ${v.type === 'resident' ? 'villager' : 'wanderer'}</b><br>` +
          (inInfluence(S, v.x, v.y) ? 'Grab them and put them down in your land: they will join you' : 'Outside your land. Build homes nearer to win them over');
      const what = v.role === 'settler' ? (v.type === 'resident' ? 'Villager at home' : 'Wanderer') : ROLE_NAME[v.role][0]!.toUpperCase() + ROLE_NAME[v.role].slice(1);
      return `<b>${what}</b><br>Grab to carry. Drop on a building to give a job.`;
    }
    const f = pickFlora(ptr.x, ptr.y, hit);
    if (f?.k === 'tree') return '<b>Tree</b><br>Grab it. Drop on the Hearth or a Lumber camp for wood, or replant it';
    if (f?.k === 'rock') return '<b>Rock</b><br>Grab it and put it somewhere new';
  }
  if (!hit) return null;
  const b = sim.bmap[idx(hit.tx, hit.tz)];
  if (b?.kind === 'home' && b.tribe === 1) {
    const r = beliefRate(S, b);
    return `<b>Red tribe ${BN[b.lv]!.toLowerCase()}</b> · ${Math.floor(b.pop)} villagers<br>Won over: ${Math.floor(b.bel)}%` +
      `<br>${r > 0.05 ? 'Warming to you' : r > -0.05 ? 'Unsure about you' : 'Not impressed yet'}` +
      '<br>Big homes and Shrines nearby, festivals, blessings and a kind pet win them over';
  }
  if (b?.kind === 'home') {
    const f = fields(sim, b.x, b.y);
    return `<b>${BN[b.lv]}</b> · ${Math.floor(b.pop)} of ${BMAX[b.lv]} villagers<br>Open fields ${f} of 25` +
      (b.lv < 5 ? `<br>${BTH[b.lv + 1]} fields to become a ${BN[b.lv + 1]!.toLowerCase()}` : '') +
      (b.tb > 1 ? `<br>Trees nearby: growth +${Math.round((b.tb - 1) * 100)}%` : '');
  }
  if (b?.kind === 'struct' && b.tribe === 1) return `<b>The Red tribe's Hearth</b><br>${S.rival ? S.rival.joined : 0} of them have joined you so far`;
  if (b?.kind === 'struct') {
    const D = STRUCTS[b.k], n = workersAt(S, b), building = b.prog < 1 ? ` · building ${Math.round(b.prog * 100)}%` : '';
    if (b.k === 'pen')
      return `<b>${S.pet ? S.pet.name + "'s pen" : D.name}</b>${building}<br>Sleeps here and rests twice as fast` +
        `<br>Bedding fertilises farms within ${BALANCE.penFertR} tiles`;
    return `<b>${D.name}</b>${building}<br>${n} of ${D.cap} ${D.role}s` +
      (b.k === 'hearth' ? `<br>Store: ${Math.floor(S.food)} food, ${Math.floor(S.wood)} wood` : '') +
      (b.fert > 0 ? '<br>Fertilised: double harvest' : '');
  }
  return null;
}

let last = performance.now(), fps = 60, statsT = 0, tipT = 0, saveT = 20;
const showStats = params.has('stats');
let frameNo = 0;

function frame(now: number): void {
  frameNo++;
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
  // Physics: things in the air fly, then come to rest and are handed back to the sim.
  if (physics && !paused) {
    const P = sim.S.pet;
    physics.setPet(P && R.pet.centre.visible
      ? { x: P.x, y: standY(sim.S, P.x, P.y) + R.pet.centre.r * 0.8, z: P.y, r: R.pet.centre.r * 0.8 }
      : null);
    for (const l of physics.step(rdt * speed, rig.fx, rig.fz)) sim.landed(l.obj, l.x, l.z, l.thrown, petFlung.has(l.obj));
    for (const sp of physics.splashes) {
      R.splash(sp.x, sp.z);
      sim.emit({ k: 'sfx', id: 'splash' });
    }
    physics.splashes.length = 0;
  }
  for (const e of sim.drain()) {
    if (e.k === 'terrain') physics?.terrainChanged(e.tiles);
    else if (e.k === 'launch') launchFromSim(e.obj, e.x, e.z, e.vx, e.vz);
    R.onEvent(e);
    if (e.k === 'toast') ui.toast(e.msg);
    else if (e.k === 'sfx') audio.sfx(e.id);
    else if (e.k === 'ui') {
      redrawBar();
      ui.drawQuest(sim.S);
    } else if (e.k === 'win') ui.showWin(e.pop, e.day);
  }

  controls.frame(rdt, now);
  if (handAnim.t > 0) handAnim.t -= rdt;
  // The pet's Follow leash follows the hand's spot on the ground.
  sim.handGround = controls.hover ? [wrap(controls.hover.x), wrap(controls.hover.z)] : null;
  // Sweeping the open hand through the pet nudges it along (it can't be picked up).
  const P = sim.S.pet, g = R.hand.grip;
  if (P && lastGrip && !controls.carrying && !controls.dragging && R.pet.centre.visible) {
    const c = R.pet.centre, d = Math.hypot(g.x - c.x, g.z - c.z), vx = (g.x - lastGrip.x) / Math.max(rdt, 1e-3), vz = (g.z - lastGrip.z) / Math.max(rdt, 1e-3);
    if (d < c.r * 1.3 && g.y - c.y < 1.2 * c.r + 0.6 && Math.hypot(vx, vz) > 3) sim.nudgePet(vx * rdt * 0.6, vz * rdt * 0.6);
  }
  lastGrip = g.clone();
  rig.update(rdt, standY(sim.S, rig.fx, rig.fz));
  const hs = handState();
  canvas.className = hs.target ? 'nocursor' : tool === 'hand' ? 'grab' : 'aim';
  if (controls.carrying) {
    carryFrames++;
    if (!hs.target) noTarget++;
  }
  if (controls.carrying && hs.target) {
    const g = R.hand.grip, cur = { x: wrap(g.x), z: wrap(g.z) };
    if (trailPrev) {
      trailU.x += wd(trailPrev.x, cur.x);
      trailU.z += wd(trailPrev.z, cur.z);
    }
    trailPrev = cur;
    trail.push({ t: now, x: trailU.x, y: g.y, z: trailU.z });
    trimTrail(trail, now);
  } else trailPrev = null;
  const hover = controls.dragging ? null : controls.hover;
  const td = TOOL[tool], blessing = !!td && td.r > 0 && hover;
  const bless = blessing && hover
    ? { at: { vx: hover.vx, vz: hover.vz }, r: td!.r, square: tool === 'flat', ok: (sandbox || sim.S.best >= td!.need) && (sandbox || sim.S.faith >= td!.cost) }
    : null;
  const ghost = tool === 'build' && hover
    ? { kind: bsel, tile: [hover.tx, hover.tz] as [number, number], ok: validSite(sim, bsel, hover.tx, hover.tz) && (sandbox || sim.S.wood >= STRUCTS[bsel].wood) }
    : null;
  R.render(now / 1000, {
    dt: rdt, alpha: paused ? 1 : Math.min(1, acc / TICK), hover, tool, crops: sim.crops, ghost, bless,
    handTarget: hs.target, handPose: hs.pose, flyers: physics?.poses() ?? [],
  });
  ui.hud(sim.S, rdt);
  // looking at the Red village counts as meeting them
  if (!sim.S.hinted.metRival && frameNo % 30 === 0) {
    const RH = rivalHearth(sim.S);
    if (RH && tdist(RH.x, RH.y, rig.fx, rig.fz) < 18) sim.metRival();
  }
  if (!paused) audio.music(rdt, R.sky.night > 0.5, sim.S.fest > 0);
  petCard.update(sim.S, rdt);
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
  physicsReady: () => !!physics,
  lastThrow: () => lastThrow,
  throwHeld: (vx, vz) => {
    const held = sim.S.held;
    if (!held) return null;
    const g = R.hand.grip, obj = sim.release()!, sp = Math.hypot(vx, vz);
    const y = held.k === 'v' ? g.y - 0.52 + VILL_CENTRE : g.y - 0.5;
    if (physics) physics.launch(obj, wrap(g.x), y, wrap(g.z), vx, 2.5 + sp * 0.3, vz, true, 1);
    else sim.landed(obj, wrap(g.x + vx), wrap(g.z + vz), true);
    return { x: wrap(g.x), z: wrap(g.z) };
  },
};

requestAnimationFrame((t) => {
  last = t;
  frame(t);
  ui.loaded();
  window.__hv.ready = true;
  // Rapier's WASM is about 2 MB, so load it after the world is on screen.
  Physics.load(sim.S).then((p) => {
    physics = p;
  }).catch((e) => console.warn('Physics unavailable, using simple arcs', e));
});
