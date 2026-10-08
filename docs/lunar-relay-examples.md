# LUNAR RELAY authored examples

Two original finished workflows sit first in the template catalog: Prop laboratory and Interface kit. Each has 14 functional nodes, 14 Russian learning annotations, 16 connections, parallel branches and a final join. Existing examples remain available.

## Original art

Ten PNGs were generated specifically for these examples with the builtin Imagegen tool: a moon station, three functionally distinct caches, the open rescue cache, a loot sheet, an interface sheet, a ceramic surface, a presentation board and an inventory-screen mockup. No images from existing user projects are used in either LUNAR RELAY graph. Exact original prompts are in [lunar-relay-prompts.json](lunar-relay-prompts.json); the root image and variants also retain their prompts in graph data. Generator nodes retain the prompts and references for their completed steps. The variant explorer has a shared exploration prompt for future runs; its three original prompts are separately recorded.

## Actual processing

The browser ran the application's own `cropAndCleanSprite`, `buildSpriteAtlas`, `buildRelativeAtlas`, `buildSeamlessTexture` and `buildMaterialMaps` functions. Eight sprites, three validated atlas PNGs with manifests, and seven material maps are bundled under `public/workflow-examples/lunar-*`. Build settings, reviewed bounds and manifests are stored in `lunar-build-manifests.json` and the graph nodes.

Loot uses equal grid cells; UI panels retain their relative dimensions. Wide panels were cropped by actual bounds rather than equal sheet quadrants. Smart Separation snapshots explicitly use `generationMethod: sheet-crop`, retain processing manifests, and explain their provenance. These verified transparent completed outputs survive reopening a project. The usual Regenerate & build action still generates each selected element individually through ImageGen; sheet crops are not presented as individual generation jobs.

Material maps are deterministic estimates derived from a ceramic image, not measured physical data. The finished game screen is a raster design mockup, not an implemented game interface. The two cache sprites do not imply a 3D model or an aligned animation. Lessons identify these limits and provide specific experiments.

## Copies

Opening either template copies all bundled assets into the new project's asset store, creates new node and edge IDs, and rewrites nested source URLs and manifests. Completed atlas and material inputs match their connected sources, so the app does not clear their results after reopening. The originals remain available for another copy.
