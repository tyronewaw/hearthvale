"""Helpers for building Hearthvale's models in Blender (as the `bpy` Python module) and
exporting them for the game.

A model is a list of parts. Each part is a Blender object with a colour (a hex string, or a
function of the face centre for stripes and patterns), an optional `tint` flag (painted and
dyed parts that take the tribe's colour in the game) and smooth or flat shading. `export()`
turns a set of named models into one JSON file of plain triangle arrays in the game's axes
(y up, +z forward): positions, normals, linear vertex colours and tint. The game loads it
with `src/render/blendmodels.ts`. `preview()` rebuilds those exact arrays as meshes and
renders them with Cycles, so the picture shows what the game gets.

Blender axes: z is up and the front of a model faces -y. The game's are y up, front +z.
"""
import json
import math
import os
from typing import Callable

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

Colour = str | Callable[[Vector, Vector], str]


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def lin(hex_: str) -> tuple[float, float, float]:
    """sRGB hex to linear, as three.js does for vertex colours."""
    h = hex_.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out[0], out[1], out[2]


_colours: dict[str, Colour] = {}


def part(bm: bmesh.types.BMesh, colour: Colour, *, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), tint=False, smooth=True,
         subsurf=0, name="part") -> bpy.types.Object:
    """Make an object from a bmesh, placed, with an optional subdivision-surface modifier."""
    for f in bm.faces:
        f.smooth = smooth
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    if subsurf:
        m = ob.modifiers.new("subsurf", "SUBSURF")
        m.levels = m.render_levels = subsurf
    ob["tint"] = bool(tint)
    ob["smooth"] = bool(smooth)
    _colours[ob.name] = colour
    return ob


# ---- primitives (bmesh, centred on the origin unless noted) ----

def cube(sx=1.0, sy=1.0, sz=1.0) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    return bm


def sphere(r=1.0, seg=12, rings=8) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return bm


def cone(r1=1.0, r2=0.0, h=1.0, seg=12, cap=True) -> bmesh.types.BMesh:
    """A cone or tapered cylinder standing on z = 0, apex at z = h."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    return bm


def lathe(profile: list[tuple[float, float]], seg=12) -> bmesh.types.BMesh:
    """Turn a profile of (radius, z) points round the z axis, like a pot on a wheel. Points
    with radius 0 close the ends."""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in profile]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=seg, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def ring(r=1.0, h=0.1, seg=12, thick=0.05) -> bmesh.types.BMesh:
    """A band round z: a short tube with an inner and an outer wall, standing on z = 0."""
    bm = cone(r, r, h, seg, cap=False)
    inner = cone(r - thick, r - thick, h, seg, cap=False)
    me = bpy.data.meshes.new("tmp")
    inner.to_mesh(me)
    inner.free()
    for f in me.polygons:
        f.flip()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return bm


def lumpy(bm: bmesh.types.BMesh, amount: float, freq: float, seed: float = 0.0) -> bmesh.types.BMesh:
    """Push vertices in and out along their normals by smooth noise: hand-made, uneven surfaces."""
    bm.normal_update()
    for v in bm.verts:
        n = noise.noise(v.co * freq + Vector((seed, seed * 1.7, seed * 2.3)))
        v.co += v.normal * n * amount
    return bm


def taper(bm: bmesh.types.BMesh, fn: Callable[[float], float], z0: float, z1: float) -> bmesh.types.BMesh:
    """Scale x and y by fn(t) where t runs 0..1 from z0 to z1."""
    for v in bm.verts:
        t = min(1.0, max(0.0, (v.co.z - z0) / (z1 - z0 or 1)))
        s = fn(t)
        v.co.x *= s
        v.co.y *= s
    return bm


# ---- export ----

def _to_game(v: Vector) -> list[float]:
    return [v.x, v.z, -v.y]


def triangles(objs: list[bpy.types.Object], origin=(0, 0, 0)) -> dict[str, list[float]]:
    """Plain triangle arrays (game axes) of these objects with their modifiers applied."""
    dg = bpy.context.evaluated_depsgraph_get()
    P, Nn, C, T = [], [], [], []
    o = Vector(origin)
    for ob in objs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        mw = ev.matrix_world
        nm = mw.to_3x3().inverted().transposed()
        smooth = bool(ob.get("smooth", True))
        corner = me.corner_normals if smooth else None
        col = _colours.get(ob.name, "#ff00ff")
        tint = 1.0 if ob.get("tint") else 0.0
        for tri in me.loop_triangles:
            pts = [mw @ me.vertices[i].co for i in tri.vertices]
            fc = (pts[0] + pts[1] + pts[2]) / 3
            fn = (nm @ tri.normal).normalized()
            rgb = lin(col(fc, fn) if callable(col) else col)
            for k in range(3):
                P += _to_game(pts[k] - o)
                n = (nm @ corner[tri.loops[k]].vector).normalized() if corner is not None else fn
                Nn += _to_game(n)
                C += rgb
                T.append(tint)
        ev.to_mesh_clear()
    return {"p": P, "n": Nn, "c": C, "t": T}


def export(models: dict[str, dict[str, list[float]]], path: str) -> None:
    """Write named models (from `triangles`) as compact JSON."""
    def r(a: list[float], d: int) -> list[float]:
        return [round(x, d) for x in a]
    out = {k: {"p": r(m["p"], 4), "n": r(m["n"], 3), "c": r(m["c"], 3), "t": [int(x) for x in m["t"]]} for k, m in models.items()}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    tris = {k: len(m["p"]) // 9 for k, m in models.items()}
    print(f"{path}: {os.path.getsize(path) // 1024} KB, triangles {tris}")


# ---- preview ----

def preview(models: list[tuple[dict[str, list[float]], tuple[float, float, float], str | None]], path: str, *,
            size=(1200, 800), cam=(0.0, -3.0, 1.6), look=(0.0, 0.0, 0.4), lens=50, samples=48) -> None:
    """Render exported models with Cycles: each entry is (arrays, offset in game axes, tint hex or None)."""
    reset()
    sc = bpy.context.scene
    mat = bpy.data.materials.new("vc")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    for arrays, off, tint in models:
        P, Nn, C, T = arrays["p"], arrays["n"], arrays["c"], arrays["t"]
        nv = len(P) // 3
        verts = [(P[i * 3] + off[0], -(P[i * 3 + 2] + off[2]), P[i * 3 + 1] + off[1]) for i in range(nv)]
        faces = [(i, i + 1, i + 2) for i in range(0, nv, 3)]
        me = bpy.data.meshes.new("m")
        me.from_pydata(verts, [], faces)
        me.update()
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        tc = lin(tint) if tint else None
        for li in range(nv):
            c = C[li * 3:li * 3 + 3]
            if tc and T[li]:
                c = [c[0] * tc[0], c[1] * tc[1], c[2] * tc[2]]
            ca.data[li].color = (c[0], c[1], c[2], 1.0)
        for poly in me.polygons:
            poly.use_smooth = True
        me.normals_split_custom_set([(Nn[i * 3], -Nn[i * 3 + 2], Nn[i * 3 + 1]) for i in range(nv)])
        ob = bpy.data.objects.new("m", me)
        sc.collection.objects.link(ob)
        ob.data.materials.append(mat)
    # ground
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    g = bpy.context.active_object
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    gm.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (*lin("#7fa65a"), 1)
    g.data.materials.append(gm)
    # light: a warm sun and a blue-ish sky
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.color = lin("#ffe8c6")
    sun.angle = math.radians(6)
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    sc.collection.objects.link(so)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes.get("Background").inputs["Color"].default_value = (*lin("#a9c8ec"), 1)
    world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.9
    sc.world = world
    camd = bpy.data.cameras.new("cam")
    camd.lens = lens
    co = bpy.data.objects.new("cam", camd)
    co.location = cam
    d = Vector(look) - Vector(cam)
    co.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(co)
    sc.camera = co
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    print("rendered", path)
