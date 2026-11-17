"""The god pets, made in Blender: a sheep, a monkey and a hen, each different at each growth
stage (0 baby, 1 young, 2 grand), as in src/render/pets.ts, which still poses and scales them.
Every piece keeps the pivot of the code-built one it replaces: the body stands on the ground
at the origin, the head is centred on its pivot, legs hang down from the hip and the tail
grows from its root.

  sheep:   a fluffy lamb, a woolly sheep, a curly-horned ram with a red collar and a bell
  monkey:  a big-eyed baby, a monkey, a grand old monkey with a crest, a white beard and a curled tail
  chicken: a round chick, a hen with a little comb, a rooster with a tall comb, ruff and tail fan

usage: python scripts/blender/pets.py [--preview shots/blender-pets.png]
Writes src/assets/models/pets.json: "<kind><stage>_<body|head|leg|tail>".
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402,F401  (loads Blender, which provides mathutils and bmesh)

import bmesh  # noqa: E402
from hvblend import cone, cube, export, lathe, lumpy, part, preview, reset, sphere, triangles, tube  # noqa: E402


def G(x, y, z):
    """Game coordinates (y up, front +z) to Blender's (z up, front -y)."""
    return (x, -z, y)


def ico(r, sub=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    return bm


def eyes(at, gap, r, white="#ffffff", pupil="#1a1210", out=None):
    """A pair of round eyes looking forward, at game position `at` (centre between them)."""
    out = [] if out is None else out
    for s in (-1, 1):
        x, y, z = at
        out.append(part(sphere(r, 8, 5), white, loc=G(x + s * gap, y, z), scale=(1, 0.6, 1), name="eye"))
        out.append(part(sphere(r * 0.55, 6, 4), pupil, loc=G(x + s * gap, y - r * 0.05, z + r * 0.5), scale=(1, 0.5, 1.15), name="pupil"))
    return out


def wool(c, n, a="#f6f2ea", b="#ddd5c6"):
    """Fleece: light, shading to a creamier tone underneath."""
    return b if n.z < -0.35 else a


# ---------------- sheep ----------------

def sheep(stage):
    W = "#fbf3e4" if stage == 0 else "#f6f2ea"
    W2 = "#eadfcb" if stage == 0 else "#ddd5c6"
    K, K2 = "#4a3a34", ("#e0a49a" if stage == 0 else "#6a5048")
    fluff = lambda c, n: wool(c, n, W, W2)
    body = [part(lumpy(ico(0.3), 0.035, 12, stage), fluff, loc=G(0, 0.44, 0), scale=(0.98, 1.22, 0.8), name="wool")]
    puffs = [(0.12, 0.6, 0.05), (-0.12, 0.6, -0.05)] if stage == 0 else [(0.18, 0.55, 0.15), (-0.18, 0.55, 0.12), (0.15, 0.5, -0.2), (-0.16, 0.52, -0.18), (0, 0.66, 0)]
    if stage == 2:
        puffs += [(0.22, 0.42, 0), (-0.22, 0.42, 0), (0, 0.62, 0.22), (0, 0.6, -0.26), (0.1, 0.7, -0.1), (-0.1, 0.7, 0.1)]
    for i, p in enumerate(puffs):
        body.append(part(lumpy(ico(0.16 if stage == 2 else 0.14, 2), 0.018, 14, i), fluff, loc=G(*p), name="puff"))
    if stage == 2:
        collar = lathe([(0.1, -0.02), (0.125, 0), (0.1, 0.02)], 14)
        body.append(part(collar, "#c94a3a", loc=G(0, 0.5, 0.33), rot=(math.pi / 2 - 0.5, 0, 0), name="collar"))
        body.append(part(lathe([(0, 0.0), (0.05, 0.005), (0.04, 0.05), (0.015, 0.07), (0, 0.075)], 8), "#f2b632", loc=G(0, 0.36, 0.38), name="bell"))
    # head: a dark, rounded face with ears, big eyes and a woolly topknot
    head = [part(cube(0.21, 0.25, 0.21), K, subsurf=1, scale=1.18, name="face")]
    for s in (-1, 1):
        head.append(part(sphere(0.05, 8, 5), K2, loc=G(s * 0.14, 0.04, -0.02), rot=(0, s * 0.5, 0), scale=(1.2, 0.8, 0.45), name="ear"))
    eyes((0, 0.035, 0.115), 0.06, 0.03, out=head)
    head.append(part(sphere(0.022, 6, 4), "#2a1e1a", loc=G(0, -0.05, 0.14), scale=(1.6, 0.6, 0.8), name="nose"))
    head.append(part(lumpy(ico(0.075 if stage == 0 else 0.1, 1), 0.012, 16, 3), fluff, loc=G(0, 0.12, -0.03), name="topknot"))
    if stage == 2:
        for s in (-1, 1):  # a ram's curled horns
            pts = [(s * 0.1 + s * 0.065 * (1 - math.cos(a)), 0.03 - 0.065 * math.sin(a), 0.07 - 0.03 * a) for a in [i * 0.62 for i in range(8)]]
            head.append(tube(pts, 0.028, lambda c, n: "#d9c79c" if int(c.z * 60) % 2 else "#b9a57a", taper=0.45, name="horn"))
    ln = 0.32 if stage == 0 else 0.28
    leg = [part(lathe([(0, 0.01), (0.046, 0.0), (0.042, -ln * 0.6), (0.044, -ln + 0.05), (0.047, -ln + 0.01), (0, -ln)], 7),
                lambda c, n: "#2a201c" if c.z < -ln + 0.05 else K, name="leg")]
    tail = [part(lumpy(ico(0.085, 1), 0.012, 16, 5), fluff, scale=(1, 1.2, 1), name="tail")]
    return body, head, leg, tail


# ---------------- monkey ----------------

def monkey(stage):
    B = "#a06a3e" if stage == 0 else "#7a4c2a" if stage == 2 else "#8b5a33"
    T, Gr = "#e6c095", "#efe4d2"
    body = [part(lathe([(0, 0.2), (0.12, 0.19), (0.2, 0.08), (0.21, -0.06), (0.17, -0.18), (0, -0.21)], 12), B, loc=G(0, 0.43, 0), scale=(1, 0.85, 1.1), name="body"),
            part(sphere(0.13, 10, 7), Gr if stage == 2 else T, loc=G(0, 0.4, 0.135), scale=(0.95, 0.5, 1.15), name="belly")]
    for s in (-1, 1):  # long arms hanging forward, with hands
        body.append(tube([G(s * 0.18, 0.52, 0.03), G(s * 0.24, 0.4, 0.07), G(s * 0.24, 0.26, 0.1)], 0.038, B, taper=0.8, name="arm"))
        body.append(part(sphere(0.045, 8, 5), T, loc=G(s * 0.24, 0.23, 0.1), scale=(1, 1, 1.1), name="hand"))
    head = [part(sphere(0.17, 12, 8), B, name="head"),
            part(sphere(0.125, 10, 7), T, loc=G(0, -0.03, 0.09), scale=(1.05, 0.7, 0.85), name="face"),
            part(sphere(0.07, 8, 5), T, loc=G(0, -0.07, 0.15), scale=(1.15, 0.8, 0.75), name="muzzle")]
    ear = 0.05 if stage == 0 else 0.065
    for s in (-1, 1):
        head.append(part(sphere(ear, 8, 5), T, loc=G(s * 0.17, 0.02, 0), scale=(0.45, 1, 1), name="ear"))
    eyes((0, 0.03, 0.13), 0.05, 0.034 if stage == 0 else 0.028, out=head)
    head.append(part(sphere(0.02, 6, 4), "#5a3424", loc=G(0, -0.085, 0.205), scale=(1.8, 0.5, 0.5), name="mouth"))
    if stage == 2:
        for x, a in ((0, 0), (0.045, -0.35), (-0.045, 0.35)):  # a crest of fur
            head.append(part(cone(0.03, 0, 0.1, 6), "#5a3820", loc=G(x, 0.15, 0), rot=(-0.3, a, 0), name="crest"))
        head.append(part(lumpy(ico(0.075, 1), 0.01, 18, 2), Gr, loc=G(0, -0.13, 0.11), scale=(1, 0.65, 0.8), name="beard"))
        for s in (-1, 1):
            head.append(part(sphere(0.026, 6, 4), Gr, loc=G(s * 0.055, 0.09, 0.14), scale=(1.5, 0.6, 0.6), name="brow"))
    leg = [part(lathe([(0, 0.01), (0.045, 0), (0.04, -0.12), (0.036, -0.19), (0, -0.2)], 7), B, name="leg"),
           part(sphere(0.045, 8, 5), "#7a4a28", loc=G(0, -0.2, 0.03), scale=(1, 0.5, 1.4), name="foot")]
    if stage == 0:
        tpts = [(0, 0, 0), (0, 0.1, 0.06), (0, 0.16, 0.1), (0, 0.17, 0.2)]
    elif stage == 1:
        tpts = [(0, 0, 0), (0, 0.1, 0.1), (0, 0.16, 0.25), (0, 0.12, 0.38), (0, 0.06, 0.42)]
    else:
        tpts = [(0, 0, 0), (0, 0.1, 0.12), (0, 0.15, 0.3), (0, 0.1, 0.48), (0, 0.0, 0.56), (0, -0.04, 0.48), (0, 0.02, 0.42)]
    tail = [tube(tpts, 0.032, B, taper=0.6, name="tail")]
    return body, head, leg, tail


# ---------------- chicken ----------------

def chicken(stage):
    chick = stage == 0
    W, W2, R, Y = ("#ffe27a" if chick else "#fff6e6"), ("#f5c95a" if chick else "#e3cfa8"), "#e0533f", "#f2a23a"
    feather = lambda c, n: W2 if n.z < -0.4 else W
    sc = (0.92, 0.95, 0.92) if chick else (0.86, 1.08, 0.86)
    body = [part(ico(0.25), feather, loc=G(0, 0.36, 0), scale=sc, name="body")]
    for s in (-1, 1):  # folded wings
        body.append(part(sphere(0.12, 10, 6), W2, loc=G(s * 0.19, 0.38, -0.03), rot=(0.25, 0, 0), scale=(0.38, 1.25, 0.8), name="wing"))
    if stage == 1:
        for i, a in enumerate((-0.35, 0, 0.35)):
            body.append(tube([G(a * 0.1, 0.45, -0.18), G(a * 0.2, 0.56, -0.27), G(a * 0.26, 0.6, -0.29)], 0.03, W, taper=0.35, name="tailfeather"))
    if stage == 2:
        ruff = lathe([(0.1, -0.05), (0.15, 0.0), (0.12, 0.05)], 14)
        body.append(part(ruff, lambda c, n: "#e8a13a" if int(math.atan2(c.y, c.x) * 4) % 2 else "#d48a2a", loc=G(0, 0.52, 0.12), rot=(math.pi / 2 - 0.5, 0, 0), name="ruff"))
        TAIL = ["#2f6f5e", "#3b4f8f", "#1f3d35", "#c0542b", "#2f6f5e"]
        for i in range(5):
            a = (i - 2) * 0.3
            body.append(tube([G(a * 0.05, 0.46, -0.22), G(a * 0.16, 0.66, -0.32), G(a * 0.26, 0.7, -0.44), G(a * 0.32, 0.58, -0.5)], 0.024, TAIL[i], taper=0.3, name="sickle"))
    head = [part(sphere(0.12, 10, 7), W, name="head")]
    comb = [] if chick else [(0.05, 0.05), (0, 0.06), (-0.05, 0.05)] if stage == 1 else [(0.08, 0.08), (0.03, 0.11), (-0.02, 0.12), (-0.07, 0.1), (-0.11, 0.07)]
    for z, h in comb:
        head.append(part(sphere(0.03, 6, 4), R, loc=G(0, 0.1 + h * 0.55, z), scale=(0.55, 0.9, h / 0.06), name="comb"))
    head.append(part(cone(0.035, 0, 0.09, 6), Y, loc=G(0, -0.01, 0.1), rot=(-math.pi / 2, 0, 0), name="beak"))
    if not chick:
        head.append(part(sphere(0.025, 6, 4), R, loc=G(0, -0.06 if stage == 1 else -0.08, 0.105), scale=(0.6, 0.6, 1.5 if stage == 2 else 1.0), name="wattle"))
    eyes((0, 0.035, 0.07), 0.075, 0.026 if chick else 0.022, out=head)
    leg = [part(lathe([(0, 0.0), (0.02, -0.005), (0.018, -0.15), (0, -0.16)], 5), Y, name="leg")]
    for a in (-0.5, 0, 0.5):  # three toes forward
        leg.append(part(cube(0.016, 0.07, 0.012), Y, loc=(math.sin(a) * 0.03, -math.cos(a) * 0.03, -0.158), rot=(0, 0, a), name="toe"))
    return body, head, leg, []


KINDS = {"sheep": sheep, "monkey": monkey, "chicken": chicken}


def main() -> None:
    reset()
    models = {}
    for kind, fn in KINDS.items():
        for stage in range(3):
            body, head, leg, tail = fn(stage)
            for name, objs in (("body", body), ("head", head), ("leg", leg), ("tail", tail)):
                if objs:
                    models[f"{kind}{stage}_{name}"] = triangles(objs)
                for ob in objs:
                    bpy.data.objects.remove(ob)
    export(models, "src/assets/models/pets.json")
    if "--preview" in sys.argv:
        # the same layout as pets.ts: head at headAt (× headScale), legs at legY, tail at tailAt
        LAY = {
            "sheep": lambda s: ((0, 0.56, 0.4), 1.3 if s == 0 else 1, [(0.14, 0.2), (-0.14, 0.2), (0.14, -0.2), (-0.14, -0.2)], 0.31 if s == 0 else 0.28, (0, 0.5, -0.38)),
            "monkey": lambda s: ((0, 0.78, 0.04), 1.3 if s == 0 else 1, [(0.1, 0), (-0.1, 0)], 0.22, (0, 0.3, -0.18)),
            "chicken": lambda s: ((0, 0.58, 0.15) if s == 0 else (0, 0.64, 0.17), 1.35 if s == 0 else 1.1 if s == 2 else 1, [(0.07, 0), (-0.07, 0)], 0.17, None),
        }
        SCALE = [0.6, 1.15, 1.75]
        items = []
        for row, kind in enumerate(KINDS):
            for stage in range(3):
                headAt, hs, legs, legY, tailAt = LAY[kind](stage)
                k, sc = f"{kind}{stage}", SCALE[stage]
                ox, oz = (stage - 1) * 1.6, (row - 1) * 1.7

                def put(m, at, s=1.0):
                    P = m["p"]
                    p2 = []
                    for i in range(0, len(P), 3):
                        p2 += [(P[i] * s + at[0]) * sc + ox, (P[i + 1] * s + at[1]) * sc, (P[i + 2] * s + at[2]) * sc + oz]
                    items.append((dict(m, p=p2), (0, 0, 0), None))
                put(models[k + "_body"], (0, 0, 0))
                put(models[k + "_head"], headAt, hs)
                for x, z in legs:
                    put(models[k + "_leg"], (x, legY, z))
                if k + "_tail" in models:
                    put(models[k + "_tail"], tailAt)
        preview(items, sys.argv[sys.argv.index("--preview") + 1], cam=(3.2, -6.5, 4.2), look=(0, 0.2, 0.6), lens=38, size=(1400, 1000), samples=48)


if __name__ == "__main__":
    main()
