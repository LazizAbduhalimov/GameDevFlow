# Worked workflow templates

The catalog contains finished examples rather than empty starting graphs. Each stage has a Russian lesson annotation explaining the decision and an exercise. The normal nodes remain editable and runnable.

`src/workflow-examples.json` stores the five local-workflow examples; `src/lunar-examples.json` stores two newly authored LUNAR RELAY workflows; `src/glowbud-example.json` stores an original procedural creature workflow. They include prompts, settings, intermediate outputs and manifests, with each example's provenance explained. `public/workflow-examples/` stores their raster images and GLB independently of local project data. There are no live job IDs or provider tasks in the examples.

| Template | Path | Provenance |
| --- | --- | --- |
| Glowbud · Creature laboratory | Meshtint design reference → three original creature directions → body/accessory → four natural views; expression atlas and growth branches; real static GLB | Original non-humanoid quadruped modeled and rendered procedurally. Sixteen working stages with explicit provenance. See [Glowbud](glowbud-example.md). |
| Lunar Relay · Prop laboratory | Original moon station → three cache variants → selected Rescue → two states → state atlas; parallel ceramic material → seven maps; three-reference presentation | New art generated specifically for this example. Fourteen working stages, branching and joining, completed deterministic exports. See [authored examples](lunar-relay-examples.md). |
| Lunar Relay · Interface kit | Original world → cache states; loot sheet → four sprites → grid atlas; UI sheet → four elements → relative atlas; four-reference inventory screen | New scene, object, sheets and final screen; eight reviewed sheet crops and two validated export atlases. Fourteen working stages. |
| Image | Three references → shape variations → selected arch → remove ground/open passage → geometry variations → final module | Completed local modular-tunnel workflow; a curated subset of its variations is retained. |
| Characters | Source character → four views → reviewed parts → isolated body views → extracted Front | Completed local character workflow. Only Body is selected; disabled clothing entries explain the selection. |
| 3D | Source character → four views → selected Body → body views → GLB | The corresponding saved Tripo body model, imported as a finished local GLB. No active watcher is retained. |
| UI kits | UI sheet → four competitive rank sprites → atlas → atlas image | Source bounds and generated sprites come from a local UI workflow. Those generated PNGs were cleaned with `cropAndCleanSprite`, then packed with `buildSpriteAtlas` for this example. The atlas validation accepts all four images. |
| Materials | Surface reference → seamless texture → seven PBR maps → Normal | Reference, prompt and completed seamless output come from a local workflow. The derived maps were built with the application's `buildMaterialMaps` for this example; roughness/AO are estimates and metallic is an authored zero value. |

Opening a template creates a new project, copies each unique bundled image/model into that project's asset store, rewrites nested URLs and asset IDs, and saves the graph. Node IDs, edges and internal prop/model node references are remapped. Downloads, rebuilding atlases/maps and subsequent generation use the regular project APIs. Editing or trashing a copy's asset cannot change the packaged example or another copy.

When updating an example, retain its real input/output relationships, package every referenced file, clear transient jobs/errors, and provide a lesson for each stage. Verify the complete graph and model/image rendering after opening a new copy and reloading it. Existing projects made from older empty templates are preserved; use the catalog to open a new completed example.
