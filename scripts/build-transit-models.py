"""Rebuild the schematic transit assets with Blender 5.2.

Run: /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build-transit-models.py
References and evidence boundaries: docs/models/REFERENCES.md.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/models"
DOC = ROOT / "docs/models"
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"

def material(name, color, metallic=0, roughness=.4):
    values = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    values = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*values, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*values, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat

white = material("warm white", "#f8f6ef", .1)
black = material("rubber and trim", "#172129", .05, .6)
glass = material("blue black glazing", "#142f45", .3, .18)
silver = material("aluminium", "#b7c3c9", .7, .28)
orange = material("TCM orange", "#f66a19", .08)
yellow = material("Transmac yellow", "#ffd126", .08)
blue = material("Transmac blue", "#246fc2", .1)
red = material("stop red", "#d1322a", .15)
amber = material("display amber", "#ffb432", 0, .35)
lamp = material("lamps", "#e9f4ed", .05, .2)
platform_mat = material("platform stone", "#aeb9bf", .05, .6)
platform_glass = material("screen door glazing", "#779ba8", .25, .25)

parts = []

def cube(name, pos, size, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("rounded edges", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    parts.append(obj)
    return obj

def cylinder(name, pos, radius, depth, mat, rotation=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    parts.append(obj)
    return obj

def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    parts.append(obj)
    return obj

def text(name, value, pos, size, mat, rotation):
    bpy.ops.object.text_add(location=pos, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = value
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = .001
    obj.data.resolution_u = 4
    obj.data.materials.append(mat)
    bpy.ops.object.convert(target="MESH")
    parts.append(bpy.context.object)

def bus(kind):
    tcm = kind == "tcm"
    body = orange if tcm else yellow
    length = 11.7 if tcm else 11.36
    half = length / 2
    lower = cube("lower body with wheel arches", (0, 0, .82), (length, 2.46, 1.05), body, .13)
    for x in (3.45, -3.6):
        cut = cylinder("arch cutter", (x, 0, .52), .58, 3.1, black, (math.pi / 2, 0, 0), 48)
        bpy.context.view_layer.objects.active = lower
        mod = lower.modifiers.new("wheel arch", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.object = cut
        bpy.ops.object.modifier_apply(modifier=mod.name)
        parts.remove(cut)
        bpy.data.objects.remove(cut, do_unlink=True)
    cube("continuous glazing band", (0, 0, 2.1), (length-.12, 2.43, 1.75), glass, .15)
    cube("roof", (0, 0, 3.04), (length, 2.47, .22), white if tcm else yellow, .1)
    cube("roof equipment", (-1, 0, 3.24), (3.3, 1.65, .32), white, .12)
    for y in (-.5, -.3, -.1, .1, .3, .5):
        cube("roof ventilation grille", (-1, y, 3.409), (2.9, .045, .018), glass, .008)
    for y in (-1.225, 1.225):
        cube("white sill" if tcm else "blue skirt", (0, y, 1.34 if tcm else .4), (length-.18, .035, .12 if tcm else .18), white if tcm else blue)
        cube("roof accent", (0, y, 2.94), (length-.25, .04, .045), orange if tcm else blue)
        for x in (-4.7, -3.1, -1.6, 0, 1.6, 3.1, 4.6):
            cube("window mullion", (x, y, 2.08), (.065, .055, 1.5), black)
    # Macau drives on the left: passenger doors are on the vehicle's left.
    for x in (half-1.0, -.3, -half+1.1):
        cube("passenger door frame", (x, 1.25, 1.43), (1.05, .07, 2.1), black, .035)
        for side in (-1, 1):
            cube("door glass", (x+side*.245, 1.292, 1.72), (.44, .025, 1.35), glass, .015)
        cube("door seam", (x, 1.31, 1.48), (.035, .02, 1.85), silver)
        cube("yellow step edge", (x, 1.31, .5), (.9, .03, .035), yellow)
    for x in (3.45, -3.6):
        for y in (-1.25, 1.25):
            cylinder("tyre", (x, y, .53), .5, .25, black, (math.pi/2, 0, 0), 48)
            cylinder("wheel rim", (x, y*1.11, .53), .31, .025, silver, (math.pi/2, 0, 0), 48)
            cylinder("hub", (x, y*1.13, .53), .13, .035, black, (math.pi/2, 0, 0), 32)
            for bolt in range(6):
                angle = bolt * math.tau / 6
                cylinder("wheel rim bolt", (x+.22*math.cos(angle), math.copysign(1.416, y), .53+.22*math.sin(angle)), .023, .015, black, (math.pi/2, 0, 0), 12)
    cube("windscreen surround", (half-.02, 0, 2.05), (.12, 2.27, 1.73), black, .08)
    cube("windscreen", (half+.05, 0, 2.06), (.035, 2.08, 1.48), glass, .035)
    cube("front lower panel", (half+.025, 0, .98), (.09, 2.26, .6), white if tcm else yellow, .07)
    cube("front grille", (half+.09, 0, .92), (.08, 1.12, .3), black, .08)
    cube("front bumper", (half+.07, 0, .41), (.14, 2.25, .2), body, .05)
    cube("destination screen", (half+.08, 0, 2.8), (.045, 1.75, .28), black, .02)
    text("operator display", "TCM" if tcm else "TRANSMAC", (half+.11, 0, 2.8), .19, amber, (math.pi/2, 0, math.pi/2))
    cube("registration plate blank", (half+.1, 0, .52), (.035, .55, .18), black, .01)
    for y in (-.9, .9):
        cube("headlamp housing", (half+.09, y, .76), (.06, .48, .2), black, .035)
        if tcm:
            cube("TCM LED headlamp", (half+.13, y, .78), (.02, .35, .05), lamp, .01)
        else:
            for offset in (-.12, .04, .18):
                cylinder("Transmac round headlamp", (half+.13, y+offset, .77), .055, .025, lamp, (0, math.pi/2, 0), 24)
        cube("rear lamp", (-half-.025, y, .98), (.025, .16, .45), red, .03)
        cube("mirror arm", (half-.3, y*1.55, 2.6), (.06, .6, .06), black)
        cube("mirror", (half-.3, y*1.85, 2.42), (.15, .16, .38), black, .04)
    for x in (-4.9, -4.65, -4.4, -4.15):
        cube("engine vent", (x, -1.25, .9), (.055, .025, .42), black)
    text("operator side", "TCM" if tcm else "TRANSMAC", (1.8, 1.31, 1.35), .17, red if tcm else blue, (math.pi/2, 0, math.pi))

def bus_stop():
    cube("pole foot", (0, 0, .08), (.44, .44, .16), red, .04)
    cylinder("red post", (0, 0, 1.82), .075, 3.5, red)
    for z in (.48, 1.0):
        cylinder("white post stripe", (0, 0, z), .077, .25, white)
    # The user's reference has two stacked cylindrical timetable cabinets.
    for z in (1.45, 2.38):
        cylinder("timetable cabinet", (0, 0, z), .32, .66, white, vertices=48)
        for cap in (z-.37, z+.37):
            cylinder("red cabinet rim", (0, 0, cap), .37, .09, red, vertices=48)
        bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=.38, radius2=.1, depth=.16, location=(0, 0, z+.48))
        cap = bpy.context.object
        cap.name = "pitched red cabinet lid"
        cap.data.materials.append(red)
        parts.append(cap)
        for y in (-.27, .27):
            cube("cabinet red mullion", (.17, y, z), (.045, .045, .66), red)
        for line in range(7):
            angle = .55 if line % 2 else .7
            angles = [-angle + 2*angle*i/8 for i in range(9)]
            level = z+.22-line*.073
            vertices = [(.324*math.cos(a), .324*math.sin(a), level+dz) for dz in (-.005, .005) for a in angles]
            mesh("schematic timetable line", vertices, [(i, i+1, i+10, i+9) for i in range(8)], red if line == 0 else glass)
    cube("stop name red frame", (0, 0, 3.46), (.16, 1.16, .65), red, .055)
    cube("white stop name panel", (.088, 0, 3.48), (.025, 1.02, .51), white, .025)
    cube("red identifier block", (.11, .33, 3.48), (.018, .28, .49), red)
    text("bus stop heading", "BUS", (.132, -.11, 3.54), .17, red, (math.pi/2, 0, math.pi/2))
    cube("blank bilingual name line", (.126, -.08, 3.36), (.015, .48, .015), silver)

def lrt_platform():
    for y in (-2.8, 2.8):
        cube("side platform with central guideway", (0, y, .5), (23, 2.2, 1), platform_mat, .12)
    for y in (-1.72, 1.72):
        cube("tactile edge", (0, y, 1.015), (22.3, .2, .035), yellow)
        for x in (-9, -6, -3, 0, 3, 6, 9):
            cube("screen door glass", (x, y, 1.9), (2.65, .08, 1.65), platform_glass, .015)
            cube("screen door upright", (x+1.38, y, 1.9), (.08, .14, 1.8), silver)
        cube("screen door top rail", (0, y, 2.8), (22.3, .17, .12), silver)
    for x in (-8, 0, 8):
        for y in (-3.45, 3.45):
            cube("canopy column", (x, y, 3.05), (.18, .18, 4.1), silver)
        cube("canopy crossbeam", (x, 0, 5.03), (.18, 8.4, .2), silver)
    ys = [-4.6+i*(9.2/32) for i in range(33)]
    vertices = [(x, y, 5.05+1.0*math.cos(y/4.6*math.pi/2)) for x in (-12.3, 12.3) for y in ys]
    faces = [(i, i+1, i+34, i+33) for i in range(32)]
    roof = mesh("curved silver canopy", vertices, faces, white)
    mod = roof.modifiers.new("roof thickness", "SOLIDIFY")
    mod.thickness = .12
    bpy.context.view_layer.objects.active = roof
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for y in (-4.6, 4.6):
        cube("blue canopy fascia", (0, y, 5.05), (24.6, .14, .18), blue, .025)
    cube("station name board", (0, 0, 4.1), (3.8, .16, .65), blue, .04)
    text("LRT marker", "LRT", (0, -.095, 4.1), .45, white, (math.pi/2, 0, 0))
    for x in (-5, 5):
        cube("platform bench", (x, 3.1, 1.55), (2.5, .65, .2), silver, .06)

def lrt_car():
    pale = material("Ocean Cruiser pale blue", "#c9e3eb", .25)
    deep = material("Ocean Cruiser blue nose", "#174968", .2)
    cube("rounded car shell", (0, 0, 1.65), (9.9, 2.8, 2.8), pale, .42)
    cube("white roof", (0, 0, 3.06), (9.4, 2.66, .24), white, .18)
    cube("roof equipment", (-.6, 0, 3.26), (3.8, 1.5, .22), silver, .12)
    for y in (-.45, -.225, 0, .225, .45):
        cube("LRT roof vent", (-.6, y, 3.379), (3.2, .05, .018), deep, .008)
    cube("blue curved cab", (4.6, 0, 1.8), (.76, 2.72, 2.55), deep, .3)
    cube("cab windscreen", (4.99, 0, 2.23), (.025, 2.1, 1.18), glass, .01)
    cube("cab lamp band", (5.01, 0, 1.05), (.03, 1.86, .13), lamp, .02)
    for side in (-1, 1):
        y = side * 1.414
        cube("orange belt", (-.1, y, 1.18), (8.8, .035, .18), orange, .03)
        for x in (-3.55, -.5, 2.5):
            cube("rounded side window", (x, y, 2.14), (1.58, .045, 1.05), glass, .12)
        for x in (-2, 1):
            cube("sliding door frame", (x, y, 1.58), (1.05, .055, 2.15), silver, .045)
            cube("door window", (x, y+side*.035, 2.1), (.84, .025, .97), glass, .05)
            cube("door seam", (x, y+side*.05, 1.55), (.025, .025, 2), deep)
    for x in (-3, 3):
        cube("bogie", (x, 0, .36), (1.4, 2.1, .5), black, .12)
        for side in (-1, 1):
            cylinder("rubber tyre", (x, side*1.12, .35), .33, .2, black, (math.pi/2,0,0))
    cube("flexible inter-car coupler", (-5.05, 0, 1.3), (.5, 1.4, 1.45), black, .08)
    for x in (-5.23, -5.12, -5.01, -4.9):
        cube("coupler rib", (x, 0, 1.3), (.035, 1.46, 1.5), silver, .02)

models = {}
for name, builder in (("bus-tcm", lambda: bus("tcm")), ("bus-transmac", lambda: bus("transmac")), ("bus-stop", bus_stop), ("lrt-platform", lrt_platform), ("lrt-car", lrt_car)):
    parts.clear()
    builder()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
    models[name] = obj
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name+".glb")), export_format="GLB", use_selection=True, export_texcoords=False, export_animations=False, export_cameras=False, export_lights=False)

scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1000
scene.render.resolution_y = 750
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world.color = (.6, .6, .6)
scene.view_settings.view_transform = "Standard"
floor = cube("preview floor", (0, 0, -.12), (70, 70, .12), material("preview floor", "#e7edf0", 0, .8))
for pos, energy, size in (((8, 4, 13), 2200, 8), ((-8, -6, 7), 1500, 7)):
    bpy.ops.object.light_add(type="AREA", location=pos)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat("-Z", "Y").to_euler()
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.type = "ORTHO"
scene.camera = camera

report = {}
for name, obj in models.items():
    for other in models.values():
        other.hide_render = other != obj
    camera.location = (15, 12, 9) if name in ("bus-tcm", "bus-transmac", "lrt-car") else (6, 7, 4.8) if name == "bus-stop" else (26, 23, 18)
    target = Vector((0, 0, 1.9 if name == "bus-stop" else 1.4 if name.startswith("bus-") else 2))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = 15 if name in ("bus-tcm", "bus-transmac", "lrt-car") else 5.8 if name == "bus-stop" else 32
    scene.render.filepath = str(DOC / (name+"-v2-preview.png"))
    bpy.ops.render.render(write_still=True)
    if name in ("bus-tcm", "lrt-car"):
        floor.hide_render = True
        scene.render.film_transparent = True
        scene.render.resolution_x = 400
        scene.render.resolution_y = 300
        scene.render.filepath = str(OUT / (name+"-widget.png"))
        bpy.ops.render.render(write_still=True)
        scene.render.resolution_x = 1000
        scene.render.resolution_y = 750
        scene.render.film_transparent = False
        floor.hide_render = False
    obj.data.calc_loop_triangles()
    report[name] = {"triangles": len(obj.data.loop_triangles), "materials": len(obj.data.materials), "dimensionsMeters": list(obj.dimensions), "glbBytes": (OUT / (name+".glb")).stat().st_size}
for (name, obj), offset in zip(models.items(), ((0,-6,0), (0,0,0), (8,0,0), (0,14,0), (0,-12,0))):
    obj.hide_render = False
    obj.location += Vector(offset)
camera.location = (30, -30, 30)
camera.rotation_euler = (Vector((0, 5, 0))-camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.ortho_scale = 50
bpy.ops.wm.save_as_mainfile(filepath=str(DOC / "transit-models-v2.blend"))
(DOC / "transit-models-v2.json").write_text(json.dumps(report, indent=2)+"\n")
print("MODEL_REPORT", json.dumps(report))
