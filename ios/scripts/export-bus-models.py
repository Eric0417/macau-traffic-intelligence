import bpy, pathlib
root=pathlib.Path(__file__).resolve().parents[2]
output=root/'ios/MacauTraffic/Resources/Models'; output.mkdir(exist_ok=True)
for company in ['tcm','transmac']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(root/f'public/models/bus-{company}.glb'))
 bpy.ops.wm.usd_export(filepath=str(output/f'bus-{company}.usdz'),export_animation=False,export_lights=False,export_cameras=False,generate_materialx_network=False,convert_orientation=True,export_global_forward_selection='NEGATIVE_Z',export_global_up_selection='Y')
 print('Exported',company)
