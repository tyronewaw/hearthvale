"""Tree canopies and trunks for the near view, made in Blender: puffy leafy crowns of a few
lumpy, rounded clumps, layered pines with ragged drooping skirts, and round bushes. The game
colours each canopy per season and per tree, multiplying these vertex colours, which are
light on top and shaded underneath. Far trees keep the simple code-built shapes.

usage: python scripts/blender/trees.py [--preview shots/blender-trees.png]
Writes src/assets/models/trees.json: canopy0..2 (leafy, pine, bush) and trunk0..2.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402,F401  (loads Blender, which provides mathutils and bmesh)

import bmesh  # noqa: E402
from hvblend import export, lathe, lumpy, part, preview, reset, triangles  # noqa: E402

BARK = "#7a4b2a"


def shade(lo: float, hi: float):
    """White on top, greyer underneath: leaves in their own shade."""
    def f(c, n):
        t = max(0.0, min(1.0, (c.z - lo) / (hi - lo)))
        v = 0.66 + 0.34 * t
        g = round(v * 255)
        return f"#{g:02x}{g:02x}{g:02x}"
    return f


def ico(r: float, sub: int = 1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    return bm


def leafy():
    out, f = [], shade(0.4, 1.15)
    for i, (x, y, z, r) in enumerate([(0, 0.02, 0.8, 0.37), (0.21, -0.1, 0.64, 0.26), (-0.2, -0.06, 0.66, 0.27)]):
        out.append(part(lumpy(ico(r, 1), r * 0.12, 4.5, i * 3.1), f, loc=(x, y, z), scale=(1, 1, 0.9), name="clump"))
    return out


def pine():
    out, f = [], shade(0.25, 1.3)
    for i, (r, h, z) in enumerate([(0.42, 0.5, 0.2), (0.33, 0.44, 0.53), (0.22, 0.38, 0.84)]):
        # a skirt of needles: flared and ragged at the rim, drooping a little
        prof = [(0, z + h), (r * 0.5, z + h * 0.5), (r, z + 0.03), (r * 0.82, z), (r * 0.3, z + 0.06), (0, z + 0.06)]
        bm = lathe(prof, 9)
        for v in bm.verts:
            if abs(v.co.z - z) < 0.035 and math.hypot(v.co.x, v.co.y) > r * 0.7:
                a = math.atan2(v.co.y, v.co.x)
                v.co.z -= 0.035 * (1 + math.sin(a * 9 + i))
        out.append(part(bm, f, smooth=False, name="tier"))
    return out


def bush():
    f = shade(0.05, 0.55)
    return [part(lumpy(ico(0.26, 1), 0.03, 5, 7.0), f, loc=(0, 0, 0.3), scale=(1.15, 1.15, 0.82), name="bush"),
            part(lumpy(ico(0.17, 1), 0.02, 6, 2.0), f, loc=(0.2, 0.06, 0.2), scale=(1.1, 1.1, 0.85), name="bush2")]


def trunk(h: float, r0=0.08, r1=0.05):
    # a tapering trunk with a flared foot (a fork at the top of leafy trees)
    prof = [(r0 * 1.35, -0.02), (r0, 0.05), (r1, h), (0, h)]
    return [part(lathe(prof, 5), BARK, name="trunk")]


def main() -> None:
    reset()
    # (pines stay the code-built cones in the game: these tiers are only for comparison)
    models = {"canopy0": triangles(leafy()), "canopy2": triangles(bush()), "pine": triangles(pine()),
              "trunk0": triangles(trunk(0.62)), "trunk1": triangles(trunk(0.3)), "trunk2": triangles(trunk(0.12, 0.05, 0.04))}
    export({k: m for k, m in models.items() if k != "pine"}, "src/assets/models/trees.json")
    if "--preview" in sys.argv:
        leaf, pinec, bushc = "#4f9450", "#2f6e4f", "#5a9e52"
        items = []
        for i, (kind, col, x) in enumerate([("0", leaf, -1.1), ("1", pinec, 0), ("2", bushc, 1.0), ("0", "#cf7a35", 2.0)]):
            c = models["canopy" + kind] if kind != "1" else models["pine"]
            items.append((dict(c, t=[1] * len(c["t"])), (x, 0, 0), col))
            items.append((models["trunk" + kind], (x, 0, 0), None))
        preview(items, sys.argv[sys.argv.index("--preview") + 1], cam=(0.45, -4.2, 1.6), look=(0.45, 0, 0.55), lens=45, size=(1200, 700))


if __name__ == "__main__":
    main()
