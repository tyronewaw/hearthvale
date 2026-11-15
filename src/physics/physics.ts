import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import { CHUNK, CHUNKS, N, chunkOfTile, idx, wd, wrap, type Held, type State } from '../sim/world';
import { SEA_FLOOR, WATER_Y, yOf } from '../render/scale';
import { GRAVITY } from './ballistic';

type Rapier = typeof RAPIER_NS;

/** Something in the air, owned by physics until it settles. */
export interface Flyer {
  obj: Held;
  body: RigidBody;
  thrown: boolean;
  /** Seconds in the air, and seconds spent nearly still. */
  t: number;
  still: number;
  wet: boolean;
}

export interface Landing {
  obj: Held;
  /** Torus coordinates where it came to rest. */
  x: number;
  z: number;
  thrown: boolean;
}

export interface FlyerPose {
  obj: Held;
  x: number;
  y: number;
  z: number;
  q: { x: number; y: number; z: number; w: number };
}

const STEP = 1 / 60;
/** Capsule centre above a villager's feet. */
export const VILL_CENTRE = 0.25;

/**
 * Rapier physics for things the god hand throws. Rapier knows nothing about the torus, so
 * the terrain is 64 heightfield colliders (one per render chunk), each placed at its nearest
 * image to an anchor point. The anchor only moves when nothing is flying, and only the
 * colliders whose image changed are shifted. Terrain edits rebuild just the touched chunks.
 */
export class Physics {
  private world: World;
  private chunks: (Collider | null)[] = new Array(CHUNKS * CHUNKS).fill(null);
  private dirty = new Set<number>();
  private ax = N / 2;
  private az = N / 2;
  private acc = 0;
  flyers: Flyer[] = [];
  /** Splashes since the last step (torus x/z), for the renderer. */
  splashes: { x: number; z: number }[] = [];
  /** The pet: a kinematic ball that thrown things bounce off (it can be nudged, never picked up). */
  private petBody: RigidBody | null = null;
  private petR = 0;

  /** Load Rapier's WASM (lazily, after the first frame) and build the world. */
  static async load(S: State): Promise<Physics> {
    const mod = await import('@dimforge/rapier3d-compat');
    const R = (mod as unknown as { default: Rapier }).default ?? (mod as unknown as Rapier);
    await R.init();
    return new Physics(R, S);
  }

  constructor(private R: Rapier, private S: State) {
    this.world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = STEP;
    for (let c = 0; c < this.chunks.length; c++) this.buildChunk(c);
  }

  setState(S: State): void {
    this.S = S;
    for (const f of this.flyers) this.world.removeRigidBody(f.body);
    this.flyers = [];
    for (let c = 0; c < this.chunks.length; c++) this.buildChunk(c);
  }

  terrainChanged(tiles: Iterable<number>): void {
    for (const t of tiles) this.dirty.add(chunkOfTile(t));
  }

  /** Heights for one chunk: 17×17 samples, column-major with rows along z (Rapier's layout). */
  chunkHeights(c: number): Float32Array {
    const cx = (c % CHUNKS) * CHUNK, cz = ((c / CHUNKS) | 0) * CHUNK, n = CHUNK + 1;
    const h = new Float32Array(n * n);
    for (let ix = 0; ix < n; ix++) for (let iz = 0; iz < n; iz++) h[iz + ix * n] = yOf(this.S.h[idx(cx + ix, cz + iz)]!);
    return h;
  }

  /** Where chunk c's centre sits in the physics frame (its nearest image to the anchor). */
  chunkPos(c: number): { x: number; z: number } {
    const cx = (c % CHUNKS) * CHUNK + CHUNK / 2, cz = ((c / CHUNKS) | 0) * CHUNK + CHUNK / 2;
    return { x: this.ax + wd(this.ax, cx), z: this.az + wd(this.az, cz) };
  }

  private buildChunk(c: number): void {
    const old = this.chunks[c];
    if (old) this.world.removeCollider(old, false);
    const p = this.chunkPos(c);
    const desc = this.R.ColliderDesc.heightfield(CHUNK, CHUNK, this.chunkHeights(c), { x: CHUNK, y: 1, z: CHUNK })
      .setTranslation(p.x, 0, p.z).setFriction(0.9).setRestitution(0.2);
    this.chunks[c] = this.world.createCollider(desc);
  }

  /** Move the frame to the camera focus while nothing is flying (keeps the action near 0). */
  private reanchor(fx: number, fz: number): void {
    if (this.flyers.length || (Math.abs(wd(this.ax, fx)) < CHUNK && Math.abs(wd(this.az, fz)) < CHUNK)) return;
    this.ax = fx;
    this.az = fz;
    for (let c = 0; c < this.chunks.length; c++) {
      const col = this.chunks[c], p = this.chunkPos(c);
      if (col) col.setTranslation({ x: p.x, y: 0, z: p.z });
    }
  }

  /** Throw (or drop) an object from torus position (x, y, z) with a velocity. */
  launch(obj: Held, x: number, y: number, z: number, vx: number, vy: number, vz: number, thrown: boolean, spin = 0): void {
    const R = this.R;
    const px = this.ax + wd(this.ax, x), pz = this.az + wd(this.az, z);
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(px, y, pz).setLinvel(vx, vy, vz).setCcdEnabled(true)
        .setAngularDamping(0.6).setLinearDamping(0.05),
    );
    if (obj.k === 'v') {
      this.world.createCollider(R.ColliderDesc.capsule(0.14, 0.11).setDensity(1).setFriction(0.8).setRestitution(0.35), body);
      if (thrown) body.setAngvel({ x: vz * 0.6 * spin, y: spin * 2, z: -vx * 0.6 * spin }, true);
    } else if (obj.k === 'tree') {
      this.world.createCollider(R.ColliderDesc.cylinder(0.25, 0.07).setTranslation(0, 0.25, 0).setDensity(2), body);
      this.world.createCollider(R.ColliderDesc.ball(0.36).setTranslation(0, 0.78, 0).setDensity(0.4).setFriction(0.9), body);
    } else {
      const s = 0.18 + obj.rock * 0.06;
      this.world.createCollider(R.ColliderDesc.ball(s).setDensity(2.5).setFriction(0.7).setRestitution(0.25), body);
    }
    this.flyers.push({ obj, body, thrown, t: 0, still: 0, wet: false });
  }

  /** Keep the pet's collider where the pet is (torus x/z, world y of its middle), or remove it. */
  setPet(p: { x: number; y: number; z: number; r: number } | null): void {
    if (!p) {
      if (this.petBody) this.world.removeRigidBody(this.petBody);
      this.petBody = null;
      return;
    }
    if (!this.petBody || Math.abs(p.r - this.petR) > 0.05) {
      if (this.petBody) this.world.removeRigidBody(this.petBody);
      this.petBody = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased());
      this.world.createCollider(this.R.ColliderDesc.ball(p.r).setRestitution(0.5), this.petBody);
      this.petR = p.r;
    }
    this.petBody.setNextKinematicTranslation({ x: this.ax + wd(this.ax, p.x), y: p.y, z: this.az + wd(this.az, p.z) });
  }

  /** Advance by dt seconds. Returns what has come to rest (for Sim.landed). */
  step(dt: number, fx: number, fz: number): Landing[] {
    for (const c of this.dirty) this.buildChunk(c);
    this.dirty.clear();
    this.reanchor(fx, fz);
    const out: Landing[] = [];
    if (!this.flyers.length) {
      this.acc = 0;
      return out;
    }
    this.acc = Math.min(this.acc + dt, STEP * 6);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      for (const f of this.flyers) {
        const p = f.body.translation(), b = f.body;
        b.resetForces(true);
        const wet = p.y < WATER_Y;
        if (wet && !f.wet) {
          f.wet = true;
          b.setLinearDamping(3.5);
          b.setAngularDamping(3);
          this.splashes.push({ x: wrap(p.x), z: wrap(p.z) });
        }
        if (wet) {
          // Buoyancy: things bob back up to the surface.
          const depth = Math.min(1, (WATER_Y - p.y) / 0.25);
          b.addForce({ x: 0, y: b.mass() * GRAVITY * (0.6 + depth * 1.4), z: 0 }, true);
        }
      }
      this.world.step();
      for (const f of this.flyers) {
        f.t += STEP;
        const v = f.body.linvel(), w = f.body.angvel();
        const slow = Math.hypot(v.x, v.y, v.z) < 0.3 && Math.hypot(w.x, w.y, w.z) < 1.5;
        f.still = slow ? f.still + STEP : 0;
      }
    }
    this.flyers = this.flyers.filter((f) => {
      const p = f.body.translation();
      const done = f.still > 0.3 || f.t > 8 || p.y < SEA_FLOOR - 3;
      if (!done) return true;
      out.push({ obj: f.obj, x: wrap(p.x), z: wrap(p.z), thrown: f.thrown });
      this.world.removeRigidBody(f.body);
      return false;
    });
    return out;
  }

  /** Where everything in the air is (torus x/z), for drawing. */
  poses(): FlyerPose[] {
    return this.flyers.map((f) => {
      const p = f.body.translation(), q = f.body.rotation();
      return { obj: f.obj, x: wrap(p.x), y: p.y, z: wrap(p.z), q: { x: q.x, y: q.y, z: q.z, w: q.w } };
    });
  }

  /** Cast a ray straight down at torus (x, z): the collider surface height, for tests. */
  surfaceAt(x: number, z: number): number | null {
    const px = this.ax + wd(this.ax, x), pz = this.az + wd(this.az, z);
    for (const c of this.dirty) this.buildChunk(c);
    this.dirty.clear();
    this.world.step();
    const hit = this.world.castRay(new this.R.Ray({ x: px, y: 50, z: pz }, { x: 0, y: -1, z: 0 }), 100, true);
    return hit ? 50 - hit.timeOfImpact : null;
  }
}
