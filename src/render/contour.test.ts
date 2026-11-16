import { describe, expect, it } from 'vitest';
import { contour } from './contour';

describe('contour (marching squares)', () => {
  it('traces a circle as a closed ring of segments on the circle', () => {
    const n = 32, F = new Float32Array(n * n), cx = 15.3, cy = 16.1, r = 6;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) F[y * n + x] = r - Math.hypot(x - cx, y - cy);
    const s = contour(F, n);
    expect(s.length / 4).toBeGreaterThan(20);
    for (let i = 0; i < s.length; i += 2) expect(Math.abs(Math.hypot(s[i]! - cx, s[i + 1]! - cy) - r)).toBeLessThan(0.25);
    // closed: every end point is shared by exactly two segments
    const key = (i: number) => `${s[i]!.toFixed(4)},${s[i + 1]!.toFixed(4)}`, count = new Map<string, number>();
    for (let i = 0; i < s.length; i += 2) count.set(key(i), (count.get(key(i)) ?? 0) + 1);
    for (const c of count.values()) expect(c).toBe(2);
  });

  it('draws nothing when everything is inside or outside', () => {
    expect(contour(new Float32Array(16).fill(1), 4)).toEqual([]);
    expect(contour(new Float32Array(16).fill(-1), 4)).toEqual([]);
  });

  it('wraps across the seam', () => {
    const n = 16, F = new Float32Array(n * n).fill(-1);
    F[5 * n + 0] = 1; // one vertex inside on the seam column
    const s = contour(F, n);
    expect(s.length / 4).toBe(4); // a little diamond, two halves on each side of the seam
    expect(s.some((v, i) => i % 2 === 0 && v > n - 1)).toBe(true);
  });
});
