import { Vector2, type Vector3 } from 'three';
import type { ToolId } from '../sim/defs';
import { wd, wrap, type State } from '../sim/world';
import type { CameraRig } from '../render/camera-rig';
import { pickGround, type GroundHit } from './picking';

export interface ControlsHost {
  state(): State;
  tool(): ToolId;
  setTool(id: ToolId): void;
  /** Apply the tool at the pointed ground (terrain tools use the vertex, building the tile). */
  act(id: ToolId, hit: GroundHit): void;
  /** Try to pick something up with the hand at a screen point. True if something was grabbed. */
  tryGrab(clientX: number, clientY: number): boolean;
  /** Let go of what the hand holds at this ground point. */
  drop(hit: GroundHit | null): void;
  /** Is the pet under this screen point? */
  overPet(clientX: number, clientY: number): boolean;
  /** Stroke (true) or scold (false) the pet. */
  petTouch(good: boolean): void;
  /** A plain left click on the ground; return true to consume it (e.g. Send mode). */
  click(hit: GroundHit): boolean;
  togglePause(): void;
  toggleHelp(): void;
}

interface Drag {
  x: number;
  y: number;
  btn: number;
  pt: string;
  moved: boolean;
  t0: number;
  last: number;
  rep: boolean;
  /** Wrapped world point held under the pointer while panning. */
  grab: { x: number; z: number } | null;
  mode: 'pan' | 'orbit' | 'carry' | 'pet' | null;
}

interface Pinch {
  d0: number;
  a0: number;
  zoom0: number;
  yaw0: number;
  grab: { x: number; z: number } | null;
}

const KEY_TOOLS: Record<string, ToolId> = { '1': 'hand', '2': 'raise', '3': 'lower', '4': 'build', '5': 'totem' };
const HOLD_DELAY = 380;
const HOLD_EVERY = 140;

/**
 * Pointer, wheel, touch and keyboard input. Dragging empty land pans the camera as if the
 * world were grabbed: the point under the pointer stays under it.
 */
export class Controls {
  hover: GroundHit | null = null;
  /** Last pointer position in client pixels (null when the pointer has left). */
  pointer: { x: number; y: number } | null = null;
  private ptrs = new Map<number, { x: number; y: number }>();
  private drag: Drag | null = null;
  private pinch: Pinch | null = null;
  private keys = new Set<string>();
  private ndc = new Vector2();

  constructor(
    private el: HTMLElement,
    private rig: CameraRig,
    private host: ControlsHost,
  ) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e, false));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.drag) {
        this.pointer = null;
        this.hover = null;
      }
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.rig.zoom += Math.sign(e.deltaY) * Math.min(0.12, Math.abs(e.deltaY) * 0.0011);
      this.rig.apply();
      this.updateHover();
    }, { passive: false });
    addEventListener('keydown', (e) => this.keydown(e));
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  /** Panning or turning the camera (not carrying or stroking). */
  get dragging(): boolean {
    return !!((this.drag?.moved && this.drag.mode !== 'carry' && this.drag.mode !== 'pet') || this.pinch);
  }

  get carrying(): boolean {
    return this.drag?.mode === 'carry';
  }

  private toNdc(x: number, y: number): Vector2 {
    const r = this.el.getBoundingClientRect();
    return this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }

  private planePoint(x: number, y: number): Vector3 | null {
    return this.rig.planeHit(this.toNdc(x, y));
  }

  updateHover(): void {
    if (!this.pointer) {
      this.hover = null;
      return;
    }
    const ray = this.rig.rayFrom(this.toNdc(this.pointer.x, this.pointer.y)).ray;
    this.hover = pickGround(this.host.state(), ray);
  }

  private down(e: PointerEvent): void {
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best effort */
    }
    if (this.ptrs.size === 2) {
      this.drag = null;
      this.startPinch();
      return;
    }
    if (this.ptrs.size > 2) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    this.updateHover();
    this.drag = {
      x: e.clientX, y: e.clientY, btn: e.button, pt: e.pointerType, moved: false,
      t0: performance.now(), last: 0, rep: false, grab: null, mode: null,
    };
    if (e.button === 0 && this.host.tool() === 'hand') {
      if (this.host.overPet(e.clientX, e.clientY)) {
        // the pet can be stroked, never picked up
        this.drag.mode = 'pet';
        this.drag.moved = true;
      } else if (this.host.tryGrab(e.clientX, e.clientY)) {
        this.drag.mode = 'carry';
        this.drag.moved = true;
      }
    }
  }

  private move(e: PointerEvent): void {
    if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.ptrs.size >= 2) {
      this.updatePinch();
      return;
    }
    if (e.pointerType !== 'mouse' && !this.ptrs.has(e.pointerId)) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    const d = this.drag;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > (d.pt === 'mouse' ? 6 : 12)) {
        d.moved = true;
        if (d.btn === 0) {
          d.mode = 'pan';
          const p = this.planePoint(d.x, d.y);
          d.grab = p ? { x: wrap(p.x), z: wrap(p.z) } : null;
        } else d.mode = 'orbit';
      }
      if (d.mode === 'carry' || d.mode === 'pet') {
        /* the held thing follows the hover point */
      } else if (d.moved && d.mode === 'pan' && d.grab) this.panTo(d.grab, e.clientX, e.clientY);
      else if (d.moved && d.mode === 'orbit') {
        this.rig.yaw -= (e.movementX || 0) * 0.008;
        this.rig.zoom += (e.movementY || 0) * 0.003;
        this.rig.apply();
      }
    }
    this.updateHover();
  }

  /** Move the camera so the grabbed world point sits under the pointer again. */
  private panTo(grab: { x: number; z: number }, x: number, y: number): void {
    const p = this.planePoint(x, y);
    if (!p) return;
    this.rig.pan(wd(wrap(p.x), grab.x), wd(wrap(p.z), grab.z));
    this.rig.apply();
  }

  private up(e: PointerEvent, cancel: boolean): void {
    this.ptrs.delete(e.pointerId);
    if (this.pinch) {
      if (this.ptrs.size < 2) this.pinch = null;
      this.drag = null;
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (d?.mode === 'carry') {
      this.pointer = { x: e.clientX, y: e.clientY };
      this.updateHover();
      this.host.drop(this.hover);
      return;
    }
    if (d?.mode === 'pet') {
      if (!cancel && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 14) this.host.petTouch(true);
      return;
    }
    if (!d || cancel || d.moved || d.rep) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    this.updateHover();
    const h = this.hover;
    if (!h) return;
    const tool = this.host.tool();
    if (d.btn === 2) {
      if (this.host.overPet(e.clientX, e.clientY)) this.host.petTouch(false);
      else this.host.act('lower', h);
    } else if (d.btn === 0 && !this.host.click(h) && tool !== 'hand') this.host.act(tool, h);
    if (e.pointerType !== 'mouse') {
      // no hover on touch screens once the finger lifts
      this.pointer = null;
      this.hover = null;
    }
  }

  private pinchGeom() {
    const [a, b] = [...this.ptrs.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return {
      d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)),
      a: Math.atan2(b.y - a.y, b.x - a.x),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  private startPinch(): void {
    const g = this.pinchGeom();
    const p = this.planePoint(g.mx, g.my);
    this.pinch = { d0: g.d, a0: g.a, zoom0: this.rig.zoom, yaw0: this.rig.yaw, grab: p ? { x: wrap(p.x), z: wrap(p.z) } : null };
    this.hover = null;
  }

  private updatePinch(): void {
    const P = this.pinch!, g = this.pinchGeom();
    this.rig.zoom = P.zoom0 + Math.log(P.d0 / g.d) * 0.55;
    this.rig.yaw = P.yaw0 + (g.a - P.a0);
    this.rig.apply();
    if (P.grab) this.panTo(P.grab, g.mx, g.my);
  }

  private keydown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (t && t.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    const k = e.key.toLowerCase();
    const tool = KEY_TOOLS[k];
    if (tool) this.host.setTool(tool);
    else if (k === ' ') {
      e.preventDefault();
      this.host.togglePause();
    } else if (k === 'h') this.host.toggleHelp();
    else if (k === '+' || k === '=') this.rig.zoom -= 0.08;
    else if (k === '-') this.rig.zoom += 0.08;
    else this.keys.add(k);
  }

  /** Per-frame work: keyboard camera, hold-to-repeat terrain tools. */
  frame(rdt: number, now: number): void {
    const K = this.keys, rig = this.rig;
    let mx = 0, mz = 0;
    const { fwd, right } = rig.axes();
    if (K.has('w') || K.has('arrowup')) { mx += fwd[0]; mz += fwd[1]; }
    if (K.has('s') || K.has('arrowdown')) { mx -= fwd[0]; mz -= fwd[1]; }
    if (K.has('d') || K.has('arrowright')) { mx += right[0]; mz += right[1]; }
    if (K.has('a') || K.has('arrowleft')) { mx -= right[0]; mz -= right[1]; }
    if (mx || mz) {
      const sp = rig.dist * 0.9 * rdt;
      rig.pan(mx * sp, mz * sp);
    }
    if (K.has('q')) rig.yaw += 1.7 * rdt;
    if (K.has('e')) rig.yaw -= 1.7 * rdt;
    if (mx || mz || K.has('q') || K.has('e')) {
      rig.apply();
      this.updateHover();
    }
    const d = this.drag, tool = this.host.tool();
    if (d && !d.moved && (d.btn === 2 || (d.btn === 0 && (tool === 'raise' || tool === 'lower'))) && now - d.t0 > HOLD_DELAY && now - d.last > HOLD_EVERY && !(this.pointer && this.host.overPet(this.pointer.x, this.pointer.y))) {
      d.last = now;
      d.rep = true;
      this.updateHover();
      if (this.hover) this.host.act(d.btn === 2 ? 'lower' : tool, this.hover);
    }
  }
}
