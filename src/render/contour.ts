/**
 * Marching squares on the planet's wrapped N×N vertex grid: the F = 0 contour of a field
 * as line segments [x1, y1, x2, y2, ...] in grid units. Each segment's ends lie in one cell
 * (so they are never split across the seam); callers wrap them for drawing. No three.js here.
 */
export function contour(F: Float32Array, n: number): number[] {
  const out: number[] = [];
  const at = (x: number, y: number) => F[(y % n) * n + (x % n)]!;
  const px = [0, 0, 0, 0], py = [0, 0, 0, 0];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const f0 = at(x, y), f1 = at(x + 1, y), f2 = at(x + 1, y + 1), f3 = at(x, y + 1);
      const code = (f0 >= 0 ? 1 : 0) | (f1 >= 0 ? 2 : 0) | (f2 >= 0 ? 4 : 0) | (f3 >= 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;
      // where the contour crosses each cell edge (0: top, 1: right, 2: bottom, 3: left)
      px[0] = x + f0 / (f0 - f1); py[0] = y;
      px[1] = x + 1; py[1] = y + f1 / (f1 - f2);
      px[2] = x + 1 - f2 / (f2 - f3); py[2] = y + 1;
      px[3] = x; py[3] = y + 1 - f3 / (f3 - f0);
      const seg = (a: number, b: number) => out.push(px[a]!, py[a]!, px[b]!, py[b]!);
      switch (code) {
        case 1: case 14: seg(3, 0); break;
        case 2: case 13: seg(0, 1); break;
        case 3: case 12: seg(3, 1); break;
        case 4: case 11: seg(1, 2); break;
        case 6: case 9: seg(0, 2); break;
        case 7: case 8: seg(3, 2); break;
        case 5: seg(3, 0); seg(1, 2); break; // two inside corners apart: two little arcs
        case 10: seg(0, 1); seg(2, 3); break;
      }
    }
  return out;
}
