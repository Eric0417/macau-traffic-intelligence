# Transit model references

Revision: 2026-11-10. All assets are schematic map markers. No photograph is used as a runtime texture.

## Reference images

| Asset | Reference | Applied details | Evidence boundary |
| --- | --- | --- | --- |
| TCM bus | [TCM bus information](https://www.tcm.com.mo/busInfo/index), [official photograph](https://www.tcm.com.mo/attachment/public/home-banner/202509/bc76a749c106426ca67d61d3fb7f3326_20250926092524.jpg) | Orange lower body, white roof/body band, dark glazing, left-side passenger doors, wheels, mirrors, lights and grille | A two-axle livery marker. No verified plate or DSAT busType to vehicle-model mapping. Dimensions are modelling choices. |
| Transmac bus | [Official bus introduction](https://www.transmac.com.mo/en/about-us/bus-facilities/), [official photograph](https://transmac-website-oss.oss-cn-hongkong.aliyuncs.com/wp-content/uploads/2024/02/MG_7858.png) | Yellow body, blue lower trim, three left-side doors, dark glazing and destination display | The official page lists 11.36 m three-door HE81–HE200 variants. The marker borrows their form; it does not identify the live vehicle as one of those variants. |
| Bus-stop sign | User-supplied image, preserved at `references/bus-stop-user.png` | Red/white post and header, two stacked cylindrical timetable cabinets, red rims and pitched cabinet lids | This reference supersedes the initial terminal-board direction. Cabinet lines and BUS heading are generic. No fictional route number, station name or timetable is printed on the model. |
| Bus-stop auxiliary reference | [DSAT current bus status page](https://www.dsat.gov.mo/bus/site/current_status.aspx), [DSAT terminal-board photograph](https://www.dsat.gov.mo/bus/site/images/img_20210603_08.jpg) | Red/white sign family | This rectangular terminal board is not the selected cylindrical sign form. |
| LRT car | [MLM official website](https://www.mlm.com.mo/), [DSOP train-design material](https://www.dsop.gov.mo/sub/lrt/uploadfile/223.pdf), existing schematic Ocean Cruiser livery | Rounded pale-blue/white body, dark blue cab, orange belt, sliding doors, roof equipment and flexible inner coupler | One schematic carriage instantiated twice. Each carriage follows its own track pose. This is not a live-position feed. |
| LRT platform | [Hengqin cooperation-zone government station photographs](https://www.hengqin-cooperation.gov.mo/zh_HK/shq/news/detail?id=7173) | Curved canopy, structural columns, platform edge and screen-door vocabulary | A generic elevated platform marker. It is not a measured model of every Macau LRT station. No station footprint or construction dimensions are claimed. |

Operator photographs were inspected for form and colour. Their copyright remains with their publishers. The user reference is retained as modelling evidence; it is not shipped in `public/` or loaded by the app.

## Deliverables and rebuild

`transit-models-v2.blend` contains the five meshes and a preview setup. The earlier `bus-models.blend` is preserved. Blender 5.2.2 LTS generated the current assets with this command from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build-transit-models.py
```

The script writes `public/models/*.glb`, five `*-v2-preview.png` files and `transit-models-v2.json`. Each export joins the model into one mesh with material primitives. There are no textures, animations or external buffer dependencies. Blender coordinates use forward +X and Z up; glTF exports Y up.

| GLB | Triangles | Material primitives | Bytes |
| --- | ---: | ---: | ---: |
| bus-tcm | 10,552 | 9 | 274,528 |
| bus-transmac | 11,608 | 9 | 314,668 |
| bus-stop | 3,380 | 4 | 101,292 |
| lrt-platform | 4,732 | 6 | 110,008 |
| lrt-car | 7,192 | 8 | 162,116 |
| Total | 37,464 | 36 | 962,612 |

The five polished assets total 962,612 bytes. Rounded-edge segments, smooth normals, denser cabinet/tyre circles, ventilation grilles, wheel bolts and higher-resolution lettering replace the earlier coarse shapes. Operator paint is more saturated and the sign uses a brighter red. Two transparent Blender renders provide the home-screen 3D button artwork without another WebGL canvas.

## Runtime placement

The map uses normalized official bus-stop coordinates and the existing LRT network station coordinates. Sign bearing is generic; LRT platform bearing follows the nearby line tangent. The dimensions, station structure and placement offset have not been surveyed.

2D remains the default, with a direct 3D control on the map. Three.js loads only when 3D is enabled; required GLBs load from zoom 14 (LRT carriages from zoom 12).

The final user correction requires fixed world-space proportions. All five model kinds use the same constant 4x schematic display scale. Zoom changes only camera projection; there is no pixel-size compensation or high-zoom size cap. Carriage spacing uses the same fixed scale, so the station/train/bus size relationship stays constant. These are enlarged schematic markers, not surveyed building footprints. Base GLB dimensions remain in `transit-models-v2.json`.

Nearby landmark models are culled by screen spacing, with the selected station first; underlying point markers remain. At most 40 visible items render. Diffuse lighting and soft contact shadows separate the models from the map. Reduced motion and hidden mobile maps stop continuous animation. Each carriage samples its own position and heading along the route, with the rear outer cab facing back. The station has two side platforms and a central guideway.

The native iOS app uses map pins for bus positions. The meshes above are for the web map.
