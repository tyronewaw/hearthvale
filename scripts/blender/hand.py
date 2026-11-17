"""The god hand, made in Blender: a soft, rounded palm with knuckles and a thumb mound, a
forearm with a gold band, and rounded finger segments with creases and nails. Each piece
keeps the joint and size of the box it replaces in src/render/hand.ts, which still poses
the fingers.

usage: python scripts/blender/hand.py [--preview shots/blender-hand.png]
Writes src/assets/models/hand.json: "palm", "f<finger>s<segment>" (finger 0 is the index
finger) and "t0", "t1" (thumb).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402,F401  (loads Blender, which provides mathutils and bmesh)

import bmesh  # noqa: E402
from hvblend import cube, export, lathe, part, preview, reset, sphere, triangles  # noqa: E402

SKIN, SKIN_D, NAIL, GOLD, GOLD_D = "#f0c39a", "#d39d72", "#f8dcc2", "#f2b632", "#c98a1c"
# as in hand.ts: base x, the three segment lengths, thickness
FINGERS = [(-0.15, (0.16, 0.11, 0.09), 0.085), (-0.05, (0.18, 0.12, 0.095), 0.088),
           (0.05, (0.17, 0.115, 0.09), 0.085), (0.15, (0.13, 0.09, 0.075), 0.075)]
THUMB = ((0.14, 0.11), 0.095)


def segment(length: float, w: float, tip: bool):
    """A rounded finger segment from its joint (origin) forward along +y (the game's -z),
    a little flatter than wide, with a crease at the joint and a nail on the tip."""
    r = w / 2
    end = length + (r * 0.85 if tip else r * 0.35)
    prof = [(0, -r * 0.55), (r * 0.7, -r * 0.42), (r * 0.98, -r * 0.05), (r, length * 0.5), (r * 0.94, length * 0.9)]
    prof += [(r * 0.8, end - r * 0.35), (r * 0.45, end - r * 0.06), (0, end)] if tip else [(r * 0.85, end - r * 0.15), (0, end)]
    crease = lambda c, n: SKIN_D if c.y < r * 0.12 else SKIN
    out = [part(lathe(prof, 10), crease, rot=(-math.pi / 2, 0, 0), scale=(1, 0.82, 1), name="seg")]
    if tip:
        out.append(part(sphere(r * 0.62, 8, 5), NAIL, loc=(0, length * 0.72, r * 0.62), scale=(1, 1.35, 0.3), name="nail"))
    return out


def palm():
    out = []
    # the palm: a soft pillow, a touch cupped underneath
    bm = cube(0.5, 0.48, 0.17)
    for v in bm.verts:
        if v.co.z < 0:
            v.co.z += 0.02 * (1 - (v.co.x / 0.25) ** 2)
    out.append(part(bm, lambda c, n: SKIN_D if n.z < -0.6 else SKIN, subsurf=2, name="palm"))
    # thumb mound and the knuckles along the back
    out.append(part(sphere(0.105, 10, 7), SKIN, loc=(-0.17, -0.12, -0.03), scale=(1, 1.3, 0.75), name="mound"))
    for x, _, w in FINGERS:
        out.append(part(sphere(w * 0.52, 8, 5), SKIN, loc=(x, 0.19, 0.035), scale=(1, 1, 0.75), name="knuckle"))
    # the forearm trailing back toward the viewer, with a gold band
    # (flattened at the wrist so it flows into the back of the palm)
    fa = lathe([(0, -0.06), (0.1, -0.05), (0.14, 0.02), (0.15, 0.12), (0.158, 0.3), (0.17, 0.55), (0.165, 0.62), (0, 0.64)], 14)
    at = dict(loc=(0, -0.16, 0.035), rot=(1.8216, 0, 0), scale=(1.18, 0.78, 1))
    out.append(part(fa, SKIN, name="forearm", **at))
    band = lathe([(0.152, 0.39), (0.172, 0.4), (0.178, 0.435), (0.172, 0.47), (0.152, 0.48)], 18)
    out.append(part(band, lambda c, n: GOLD_D if abs(n.x) > 0.85 else GOLD, name="band", **at))
    return out


def main() -> None:
    reset()
    models = {"palm": triangles(palm())}
    for f, (_, lens, w) in enumerate(FINGERS):
        for s, ln in enumerate(lens):
            models[f"f{f}s{s}"] = triangles(segment(ln, w, s == 2))
    for s, ln in enumerate(THUMB[0]):
        models[f"t{s}"] = triangles(segment(ln, THUMB[1], s == 1))
    export(models, "src/assets/models/hand.json")
    if "--preview" in sys.argv:
        # an open hand: fingers straight out from the palm's front edge (game z = -0.2)
        items = [(models["palm"], (0, 0.35, 0), None)]
        for f, (x, lens, w) in enumerate(FINGERS):
            z = -0.2
            for s, ln in enumerate(lens):
                items.append((models[f"f{f}s{s}"], (x, 0.36, z), None))
                z -= ln
        items.append((models["t0"], (-0.22, 0.33, 0.06), None))
        items.append((models["t1"], (-0.22, 0.33, -0.08), None))
        preview(items, sys.argv[sys.argv.index("--preview") + 1], cam=(1.3, 1.5, 1.6), look=(0, 0.15, 0.35), lens=45, size=(1100, 800))


if __name__ == "__main__":
    main()
