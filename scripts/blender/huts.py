"""Round huts for every home level and the small huts on work buildings, made in Blender.

Each variant matches a call to hut() in src/render/models.ts (radius, wall and roof
heights, roof colours, posts, rope bands, stretch, a second roof tier, far-away LOD), so
the game swaps the code-built hut for this one by key and keeps its door glow, smoke and
fire spots. The design, all original: a stone plinth, a woven wattle wall with a painted
band, thick layered thatch with a shaggy edge and a dyed band, rope bindings, a top knot
with a painted finial and flag, and an arched door with a timber frame and a hide curtain.
Painted and dyed parts are tinted with the tribe's colour in the game.

usage: python scripts/blender/huts.py [--preview shots/blender-huts.png]
Writes src/assets/models/huts.json.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402,F401  (loads Blender, which provides mathutils and bmesh)

import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402
from hvblend import cone, cube, export, lathe, lumpy, part, preview, reset, sphere, triangles  # noqa: E402

THATCH = ["#ecca72", "#d4a64a", "#a9792e"]
THATCH2 = ["#e2b25c", "#c38d3a", "#916224"]
ROOFS = {"THATCH": THATCH, "THATCH2": THATCH2}
WATTLE = ["#b98d5c", "#9b7147", "#77522f"]
STONES = ["#9a9284", "#b3ab9c", "#8a8274", "#a39b8b"]
TIMBER, TIMBER2, ROPE, DOOR = "#7a4e2a", "#5e3b1e", "#5a3c22", "#2e1c12"
PAINT, PAINT2 = "#ffffff", "#c8c8c8"

# (r, wallH, roofH, roof, posts, ropes, sx, tier): the hut() calls in src/render/models.ts
VARIANTS = [
    (0.3, 0.26, 0.36, "THATCH", 4, 2, 1, False),
    (0.4, 0.3, 0.46, "THATCH", 6, 3, 1, False),
    (0.47, 0.34, 0.56, "THATCH", 6, 3, 1, False),
    (0.22, 0.24, 0.3, "THATCH", 4, 2, 1, False),
    (0.5, 0.38, 0.62, "THATCH2", 8, 3, 1.45, False),
    (0.24, 0.26, 0.34, "THATCH", 4, 2, 1, False),
    (0.64, 0.44, 0.7, "THATCH2", 8, 3, 1, True),
    (0.3, 0.28, 0.38, "THATCH", 4, 2, 1, False),
    (0.17, 0.18, 0.24, "THATCH", 0, 1, 1, False),
    (0.21, 0.2, 0.3, "THATCH", 0, 1, 1, False),
]


def key(r, wallH, roofH, roof, posts, ropes, sx, tier, lod) -> str:
    """The same key models.ts builds: numbers as JavaScript prints them."""
    g = lambda x: f"{x:g}"
    return "|".join([g(r), g(wallH), g(roofH), roof, g(posts), g(ropes), g(sx), "1" if tier else "0", "1" if lod else "0"])


def ang(c: Vector) -> float:
    return math.atan2(c.y, c.x)


def stretch(objs, sx):
    for ob in objs:
        ob.scale.x *= sx
        ob.location.x *= sx


def roof_profile(rr: float, top: float, roofH: float, tiers: int) -> list[tuple[float, float]]:
    """Layered thatch: each layer ends in a thick shaggy lip that overhangs the next."""
    prof = [(rr * 0.82, top + 0.005), (rr * 1.0, top - 0.035), (rr * 1.03, top - 0.005)]
    for i in range(1, tiers + 1):
        f = i / (tiers + 0.6)
        rad, z = rr * (1 - f), top + roofH * f
        prof += [(rad + 0.035 * rr, z - 0.04 * roofH), (rad + 0.012 * rr, z + 0.01 * roofH)]
    prof += [(rr * 0.12, top + roofH * 0.93), (0, top + roofH)]
    return prof


def hut(r, wallH, roofH, roof, posts, ropes, sx, tier, lod):
    pal = ROOFS[roof]
    seg = 9 if lod else max(10, round(r * 26))
    y0 = 0.06
    round_parts = []
    out = []
    seed = r * 31 + wallH * 7
    # plinth: a ring of rough stones
    if not lod:
        bm = lathe([(0, 0.07), (r * 1.03, 0.072), (r * 1.1, 0.052), (r * 1.13, 0.012), (r * 1.1, 0)], seg * 2)
        lumpy(bm, 0.012, 22, seed)
        stone = lambda c, n: STONES[(int((ang(c) + math.pi) / math.tau * seg * 2) + int(c.z * 40)) % 4]
        round_parts.append(part(bm, stone, smooth=False, name="plinth"))
    # wall: woven wattle, bulging a little, darker at the foot
    rows = 3 if lod else 6
    prof = [(r * (0.99 + 0.02 * math.sin(math.pi * i / rows)) - (0.03 * r if i == rows else 0), y0 + wallH * i / rows) for i in range(rows + 1)]
    bm = lathe(prof, seg * (1 if lod else 2))
    if not lod:
        lumpy(bm, 0.006, 30, seed + 1)

    def weave(c, n):
        # woven rows, alternating light and mid, with the odd strand swapped; dark at the foot
        a = int((ang(c) + math.pi) / math.tau * seg * 2)
        h = int((c.z - y0) / wallH * rows)
        if h == 0:
            return WATTLE[2]
        odd = (a * 7919 + h * 104729) % 9 == 0
        return WATTLE[0] if (h % 2 == 0) != odd else WATTLE[1]
    round_parts.append(part(bm, weave, name="wall"))
    # painted band round the wall, with a zigzag
    bz0, bz1 = y0 + wallH * 0.5, y0 + wallH * 0.72
    bm = lathe([(r * 1.012 + 0.004, bz0), (r * 1.016 + 0.006, (bz0 + bz1) / 2), (r * 1.012 + 0.004, bz1)], seg * 2)
    zig = lambda c, n: PAINT if (int((ang(c) + math.pi) / math.tau * seg * 4) % 2) == (1 if c.z > (bz0 + bz1) / 2 else 0) else PAINT2
    round_parts.append(part(bm, zig, tint=True, name="band"))
    # thatch: layered, shaggy at the edges
    top = y0 + wallH
    rr = r * 1.32
    tiers = 2 if lod else 3
    bm = lathe(roof_profile(rr, top, roofH, tiers), seg * (1 if lod else 2))
    if not lod:
        lumpy(bm, 0.014 * (r / 0.4) + 0.006, 18, seed + 2)

    def straw(c, n):
        # bundles of straw running down the slope; the undersides of the lips in shadow tones
        if n.z < 0.15:
            return pal[2]
        a = int((ang(c) + math.pi) / math.tau * seg * 2)
        return pal[1] if a % 3 == 0 else pal[0]
    round_parts.append(part(bm, straw, name="roof"))
    # a dyed band of thatch just above the eave
    f0, f1 = 0.12, 0.24
    ra, rb = rr * (1 - f0) + 0.03 * rr, rr * (1 - f1) + 0.03 * rr
    bm = lathe([(ra + 0.004, top + roofH * f0 - 0.01), (rb + 0.004, top + roofH * f1 - 0.01)], seg * 2)
    zz = lambda c, n: PAINT if int((ang(c) + math.pi) / math.tau * seg * 2) % 2 else PAINT2
    round_parts.append(part(bm, zz, tint=True, name="dyed"))
    # rope bindings
    if not lod:
        for i in range(1, ropes + 1):
            f = i / (ropes + 1.6) + 0.06
            z, rad = top + roofH * f, rr * (1 - f) + 0.015 * rr
            bm = lathe([(rad - 0.006, z - 0.014), (rad + 0.012, z), (rad - 0.006, z + 0.014)], seg * 2)
            round_parts.append(part(bm, ROPE, name="rope"))
    apex = top + roofH
    if tier:
        # a drum and a second, smaller layered roof above the first
        r2, h2, d = r * 0.42, roofH * 0.5, roofH * 0.5
        zb = top + roofH * 0.58
        bm = lathe([(r2, zb), (r2 * 1.02, zb + d / 2), (r2, zb + d)], seg)
        round_parts.append(part(bm, lambda c, n: WATTLE[0] if int((ang(c) + math.pi) / math.tau * seg) % 2 else TIMBER, name="drum"))
        bm = lathe(roof_profile(r2 * 1.5, zb + d, h2, 2), seg)
        if not lod:
            lumpy(bm, 0.01, 20, seed + 3)
        round_parts.append(part(bm, straw, name="roof2"))
        apex = zb + d + h2
    stretch(round_parts, sx)
    out += round_parts
    # posts round the wall, leaving the door clear
    if not lod:
        for i in range(posts):
            a = (i / posts) * math.tau + math.pi / posts + math.pi / 2
            bm = cone(0.024, 0.02, wallH + 0.05, 6)
            out.append(part(bm, TIMBER2, loc=(math.cos(a) * r * 1.01 * sx, -math.sin(a) * r * 1.01, y0 - 0.01), name="post"))
            out.append(part(sphere(0.026, 6, 4), TIMBER, loc=(math.cos(a) * r * 1.01 * sx, -math.sin(a) * r * 1.01, y0 + wallH + 0.04), name="postcap"))
    # top knot: binding, pole, painted finial and a little flag
    if not lod:
        out.append(part(lathe([(0, apex + 0.04), (0.035, apex + 0.03), (0.05, apex - 0.02), (0.04, apex - 0.05)], 8), ROPE, name="knot"))
    out.append(part(cone(0.012, 0.01, 0.3, 4), TIMBER2, loc=(0, 0, apex - 0.02), name="pole"))
    out.append(part(cone(0.05, 0, 0.12, 6), PAINT, loc=(0, 0, apex + 0.01), tint=True, smooth=False, name="finial"))
    if r >= 0.25:
        bm = cube(0.16, 0.012, 0.1)
        for v in bm.verts:  # a flag rippling in the wind
            v.co.y += math.sin((v.co.x + 0.08) * 30) * 0.012
        out.append(part(bm, PAINT, loc=(0.085, 0, apex + 0.22), tint=True, smooth=False, name="flag"))
    # door: an arched opening, a timber frame and a hide curtain (front is -y)
    dw, dh = r * 0.42, wallH * 0.8
    dy = -r * 1.0
    arch = bmesh.new()
    pts = [(-dw / 2, 0)] + [(-math.cos(math.pi * i / 6) * dw / 2, dh - dw / 2 + math.sin(math.pi * i / 6) * dw / 2) for i in range(7)] + [(dw / 2, 0)]
    vs = [arch.verts.new((x, 0, z)) for x, z in pts]
    arch.faces.new(vs)
    bmesh.ops.extrude_face_region(arch, geom=arch.faces[:])
    for v in arch.verts[len(pts):]:
        v.co.y += 0.03
    bmesh.ops.recalc_face_normals(arch, faces=arch.faces)
    out.append(part(arch, DOOR, loc=(0, dy - 0.006, y0), smooth=False, name="door"))
    if not lod:
        for s in (-1, 1):
            out.append(part(cube(0.032, 0.032, dh + 0.03), TIMBER, loc=(s * (dw / 2 + 0.016), dy - 0.012, y0 + (dh + 0.03) / 2), smooth=False, name="jamb"))
        out.append(part(cube(dw + 0.1, 0.036, 0.036), TIMBER, loc=(0, dy - 0.014, y0 + dh + 0.02), smooth=False, name="lintel"))
        bm = cube(dw * 0.52, 0.01, dh * 0.82)
        for v in bm.verts:  # the curtain hangs in folds, pulled aside
            v.co.y += math.sin((v.co.x + dw) * 60) * 0.006
        out.append(part(bm, PAINT2, loc=(-dw * 0.22, dy - 0.024, y0 + dh * 0.45), rot=(0, 0.06, 0), tint=True, smooth=False, name="curtain"))
    return out


def main() -> None:
    reset()
    models = {}
    for v in VARIANTS:
        for lod in (False, True):
            objs = hut(*v, lod)
            models[key(*v, lod)] = triangles(objs)
            for ob in objs:
                bpy.data.objects.remove(ob)
    export(models, "src/assets/models/huts.json")
    if "--preview" in sys.argv:
        out = sys.argv[sys.argv.index("--preview") + 1]
        show = [(VARIANTS[0], (-2.1, 0, 0), "#3f6fc4"), (VARIANTS[2], (-0.9, 0, 0), "#3f6fc4"), (VARIANTS[4], (0.75, 0, 0.1), "#c4573f"),
                (VARIANTS[6], (2.75, 0, -0.2), "#3f6fc4")]
        items = [(models[key(*v, False)], off, tint) for v, off, tint in show]
        items.append((models[key(*VARIANTS[2], True)], (-0.9, 0, -1.7), "#3f6fc4"))
        preview(items, out, cam=(0.35, -5.2, 2.3), look=(0.35, 0, 0.5), lens=42, size=(1400, 760), samples=64)


if __name__ == "__main__":
    main()
