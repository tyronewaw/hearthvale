/** A sample of where the hand was (world units) and when (ms). */
export interface TrailPoint {
  t: number;
  x: number;
  y: number;
  z: number;
}

export const THROW = {
  /** Look back this far for the hand's speed (ms). */
  window: 140,
  /** Slower than this (units/s) and letting go is a gentle drop, not a throw. */
  minSpeed: 2.5,
  /** Fastest throw (units/s). */
  maxSpeed: 16,
  /** Throws arc upward: base lift plus a share of the speed. */
  lift: 2.5,
  liftPerSpeed: 0.3,
  /** If the hand stopped this long before letting go (ms), it's a drop. */
  stillFor: 120,
} as const;

/**
 * Velocity to launch with when the hand lets go, from its recent trail. Returns the
 * velocity and whether it counts as a throw (fast enough), as in the prototype's release().
 */
export function throwVelocity(trail: readonly TrailPoint[], now: number): { vx: number; vy: number; vz: number; thrown: boolean } {
  const still = { vx: 0, vy: 0, vz: 0, thrown: false };
  if (trail.length < 2) return still;
  const last = trail[trail.length - 1]!;
  if (now - last.t > THROW.stillFor) return still;
  // Velocity over the window ending at the last sample.
  const inWin = trail.find((p) => p !== last && last.t - p.t <= THROW.window);
  const old = inWin ?? trail[trail.length - 2]!;
  const dt = Math.max(0.016, (last.t - old.t) / 1000);
  let vx = (last.x - old.x) / dt, vz = (last.z - old.z) / dt;
  // A slow frame just before letting go hides how fast the hand was going: then also look
  // at the last pair before the hitch and keep whichever was faster.
  if (!inWin && trail.length >= 3) {
    const a = trail[trail.length - 3]!, b = trail[trail.length - 2]!, dt2 = Math.max(0.016, (b.t - a.t) / 1000);
    const wx = (b.x - a.x) / dt2, wz = (b.z - a.z) / dt2;
    if (Math.hypot(wx, wz) > Math.hypot(vx, vz)) {
      vx = wx;
      vz = wz;
    }
  }
  const sp = Math.hypot(vx, vz);
  if (sp < THROW.minSpeed) return still;
  if (sp > THROW.maxSpeed) {
    vx *= THROW.maxSpeed / sp;
    vz *= THROW.maxSpeed / sp;
  }
  const s = Math.min(sp, THROW.maxSpeed);
  return { vx, vy: THROW.lift + s * THROW.liftPerSpeed, vz, thrown: true };
}

/**
 * Keep only the recent part of a trail (in place), but always the last three samples, so a
 * single slow frame just before letting go doesn't turn a throw into a drop.
 */
export function trimTrail(trail: TrailPoint[], now: number, keepMs = 300): void {
  while (trail.length > 3 && (trail.length > 12 || now - trail[0]!.t > keepMs)) trail.shift();
}
