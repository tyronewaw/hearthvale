import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { clamp, wrap } from '../sim/world';
import { bend, syncBendUniforms } from './bend';

/**
 * An orbit camera around a focus point on the ground. The focus lives on the torus and is
 * kept in [0, N); the whole scene is laid out around it each frame, so wrapping is invisible.
 * Zoom also tilts the camera and strengthens the planet curve, so zooming out reads as
 * pulling back from a little world.
 */
/** Debug: ?nobend renders the world flat. */
const NO_BEND = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nobend');

export class CameraRig {
  readonly camera: PerspectiveCamera;
  fx: number;
  fz: number;
  /** Smoothed ground height under the focus. */
  fy = 1;
  yaw = 0.7;
  /** 0 = closest, 1 = furthest. */
  zoom = 0.42;

  private ray = new Raycaster();
  private plane = new Plane(new Vector3(0, 1, 0), 0);
  private hit = new Vector3();

  constructor(fx: number, fz: number, aspect: number) {
    this.fx = fx;
    this.fz = fz;
    this.camera = new PerspectiveCamera(48, aspect, 0.3, 420);
    // Portrait phones see a narrow slice, so start further out.
    if (aspect < 1) this.zoom = 0.62;
    this.apply();
  }

  get dist(): number {
    return 7 + 68 * Math.pow(this.zoom, 1.5);
  }
  get pitch(): number {
    return 0.6 + 0.55 * this.zoom;
  }

  /** Ease the focus height toward the ground below it, then reposition. */
  update(dt: number, groundY: number): void {
    this.fy += (groundY - this.fy) * Math.min(1, dt * 5);
    this.apply();
  }

  /** Recompute the camera from fx, fz, yaw and zoom (call after any change mid-frame). */
  apply(): void {
    this.fx = wrap(this.fx);
    this.fz = wrap(this.fz);
    this.zoom = clamp(this.zoom, 0, 1);
    bend.focus.set(this.fx, this.fz);
    bend.k = NO_BEND ? 0 : 0.0032 + 0.0075 * this.zoom * this.zoom;
    syncBendUniforms();
    const d = this.dist, p = this.pitch, c = this.camera;
    c.position.set(
      this.fx + Math.sin(this.yaw) * Math.cos(p) * d,
      this.fy + Math.sin(p) * d,
      this.fz + Math.cos(this.yaw) * Math.cos(p) * d,
    );
    c.lookAt(this.fx, this.fy, this.fz);
    c.near = Math.max(0.3, d * 0.05);
    c.far = d * 2.4 + 120;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }

  /** Move the focus by a world-space offset. */
  pan(dx: number, dz: number): void {
    this.fx += dx;
    this.fz += dz;
  }

  /** Forward and right directions on the ground, for keyboard panning. */
  axes(): { fwd: [number, number]; right: [number, number] } {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return { fwd: [-s, -c], right: [c, -s] };
  }

  /** Intersect a screen ray (NDC) with the horizontal plane at the focus height. */
  planeHit(ndc: Vector2): Vector3 | null {
    this.ray.setFromCamera(ndc, this.camera);
    this.plane.constant = -this.fy;
    return this.ray.ray.intersectPlane(this.plane, this.hit) ? this.hit.clone() : null;
  }

  rayFrom(ndc: Vector2): Raycaster {
    this.ray.setFromCamera(ndc, this.camera);
    return this.ray;
  }
}
