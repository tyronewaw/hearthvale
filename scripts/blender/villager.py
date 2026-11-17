"""The villagers' body parts, rounded and hand-made, for close-up views (far villagers stay
simple boxes). Each part keeps the pivot and size of the box it replaces in
src/render/villagers.ts, so the procedural walk, work and wave animations carry over: legs
and arms hang from their top, the rest are centred. The game colours each part per villager
(skin, tribe clothing, hair, job belt) by multiplying these vertex colours, so they are
white except for darker details (eyes, mouth, feet, hems).

usage: python scripts/blender/villager.py [--preview shots/blender-villagers.png]
Writes src/assets/models/villager.json.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402,F401  (loads Blender, which provides mathutils and bmesh)
from mathutils import Vector  # noqa: E402

import bmesh  # noqa: E402
from hvblend import cone, export, lathe, part, preview, reset, sphere, triangles  # noqa: E402

W = "#ffffff"


def legs():
    # a leg hanging from the hip, a little knee, and a foot pointing forward (-y in Blender)
    a = part(lathe([(0, 0.005), (0.034, 0.0), (0.033, -0.05), (0.028, -0.085), (0.024, -0.13), (0.022, -0.152), (0, -0.158)], 8), W, name="leg")
    b = part(sphere(0.034, 8, 5), "#6e4c36", loc=(0, -0.017, -0.156), scale=(0.95, 1.45, 0.55), name="foot")
    return [a, b]


def arms():
    a = part(lathe([(0, 0.012), (0.03, 0.006), (0.03, -0.04), (0.025, -0.08), (0.021, -0.13), (0, -0.14)], 8), W, name="arm")
    b = part(sphere(0.029, 8, 5), W, loc=(0, -0.004, -0.15), scale=(1, 0.9, 1.15), name="hand")
    return [a, b]


def torso():
    # a smock: round shoulders, a full chest, flaring a little to a darker hem
    hem = lambda c, n: "#c4c4c4" if c.z < -0.086 else W
    prof = [(0, 0.112), (0.042, 0.108), (0.08, 0.092), (0.1, 0.058), (0.104, 0.0), (0.104, -0.06), (0.114, -0.1), (0.108, -0.114), (0, -0.114)]
    return [part(lathe(prof, 12), hem, scale=(1, 0.8, 1), name="torso")]


def belt():
    # a sash round the waist with a pouch at the front
    bm = lathe([(0.104, 0.017), (0.111, 0.0), (0.104, -0.017)], 12)
    a = part(bm, W, scale=(1, 0.81, 1), name="belt")
    b = part(sphere(0.022, 6, 4), "#d8d8d8", loc=(0.04, -0.082, -0.006), scale=(1, 0.7, 1.15), name="pouch")
    return [a, b]


def head():
    out = [part(sphere(0.077, 10, 7), W, scale=(1, 0.96, 1.0), name="head")]
    for s in (-1, 1):
        out.append(part(sphere(0.012, 6, 4), "#1c1410", loc=(s * 0.028, -0.07, 0.008), scale=(1, 0.6, 1.2), name="eye"))
        out.append(part(sphere(0.019, 6, 4), "#eeeeee", loc=(s * 0.077, 0.004, -0.002), scale=(0.45, 1, 1.05), name="ear"))
    out.append(part(sphere(0.017, 6, 4), "#f2f2f2", loc=(0, -0.078, -0.014), scale=(1, 1, 1.15), name="nose"))
    out.append(part(sphere(0.014, 6, 3), "#5a2a1e", loc=(0, -0.071, -0.04), scale=(1.4, 0.4, 0.45), name="mouth"))
    return out


def hair():
    # a cap over the crown, lower at the back, with a top knot; the origin is the game's hair
    # pivot, 0.07 above the head's centre and 0.005 behind it
    bm = sphere(0.083, 10, 7)
    n = Vector((0, -0.45, 1)).normalized()
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0.012), plane_no=n, clear_inner=True)
    a = part(bm, W, loc=(0, -0.002, -0.068), scale=(1.06, 1.08, 1.0), name="hair")
    b = part(sphere(0.026, 6, 4), "#dddddd", loc=(0, 0.04, 0.018), scale=(1, 1, 0.9), name="knot")
    return [a, b]


PARTS = {"legs": legs, "arms": arms, "torso": torso, "belt": belt, "head": head, "hair": hair}


def main() -> None:
    reset()
    models = {k: triangles(fn()) for k, fn in PARTS.items()}
    export(models, "src/assets/models/villager.json")
    if "--preview" in sys.argv:
        out = sys.argv[sys.argv.index("--preview") + 1]
        # a few villagers side by side, coloured as the game does
        looks = [("#c98d5e", "#3f6fc4", "#2a1a12", "#6b4426"), ("#a8704a", "#4a7fd6", "#5a3420", "#c9a35a"),
                 ("#e0b088", "#3566b0", "#7a4b2a", "#4f8a3c"), ("#8a5a3a", "#c4573f", "#1e1e2a", "#3a9a9a")]
        items = []
        for i, (skin, cloth, hairc, beltc) in enumerate(looks):
            x = (i - 1.5) * 0.42
            sw = (i % 2) * 0.5
            for side in (-1, 1):
                items.append((rot_x(models["legs"], sw * side), (x + side * 0.048, 0.17, 0), skin))
                items.append((rot_x(models["arms"], -sw * side * 0.8), (x + side * 0.118, 0.36, 0), skin))
            items += [(models["torso"], (x, 0.27, 0), cloth), (models["belt"], (x, 0.185, 0), beltc),
                      (models["head"], (x, 0.45, 0), skin), (models["hair"], (x, 0.52, -0.005), hairc)]
        preview([(dict(m, t=[1] * len(m["t"])), off, c) for m, off, c in items], out,
                cam=(0.55, -2.1, 0.75), look=(0, 0, 0.3), lens=55, size=(1200, 700))


def rot_x(m, a):
    """A copy of a hanging limb swung by angle a about its pivot (game x axis)."""
    if not a:
        return m
    c, s = math.cos(a), math.sin(a)
    P, N = m["p"], m["n"]
    p2, n2 = [], []
    for i in range(0, len(P), 3):
        x, y, z = P[i:i + 3]
        p2 += [x, y * c - z * s, y * s + z * c]
        x, y, z = N[i:i + 3]
        n2 += [x, y * c - z * s, y * s + z * c]
    return dict(m, p=p2, n=n2)


if __name__ == "__main__":
    main()
