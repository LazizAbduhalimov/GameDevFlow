# Glowbud · Creature laboratory

The user's design reference is [Low Level Monsters Growing Pack Cute Series v1.2](https://assetstore.unity.com/packages/3d/characters/creatures/low-level-monsters-growing-pack-cute-series-v1-2-391364), by Meshtint Studio. Its public marketing preview is retained as the first reference node with attribution. Observed design principles are simple chunky forms, large eyes, small feet, bright color blocks and soft 3D shading. Glowbud is a new non-humanoid quadruped seed creature with leaf sprouts, an amber belly seed and a detachable acorn pouch.

Imagegen rejected both reference-based requests and an original-design request without the reference, with `moderation_blocked` at the output stage. No successful Imagegen output is represented in this template. The work continued with original procedural 3D geometry, not a different image-generation API.

## Finished original assets

`scripts/glowbud-model.mjs` builds and renders the creature with Three.js and exports it through GLTFExporter. The pack's purchased FBX files, textures, rigs and animations were not used. Every original rendered PNG has true alpha; the four body views are orthographic renders of one geometry in a natural quadruped stance.

The example includes three silhouette directions, the selected character, the same body without its pouch, four views, four expressions, a three-stage growth presentation, a family presentation, two validated sprite atlases and a GLB. `public/workflow-examples/glowbud-build-manifests.json` records atlas settings and frames plus model metadata. The model contains 6,304 triangles and 27 meshes. It is static, with no skeleton, skinning or animations. Its `Creature_Body` and `Detachable_acorn_pouch` groups remain separate.

## Learning graph

There are 16 functional nodes, 16 Russian lesson annotations and 18 connections. Each completed stage explicitly identifies modeling/rendering provenance. Prompt-based nodes retain authored continuation prompts; clicking their generation actions invokes the application's ordinary AI flow and does not reproduce the procedural render automatically. Character Parts is a reviewed manual decomposition, not a fabricated analysis job. Character Views uses `pose: neutral` and `subjectKind: character`, so new runs preserve animal anatomy instead of asking for a humanoid A- or T-pose.

Opening the template creates an independent project and imports each referenced PNG and GLB through the existing template copier. Node IDs, source references, nested manifests and model download links are remapped. No live jobs are shipped.

To rebuild the graph metadata after editing the example: `node scripts/author-glowbud-template.mjs`. To update the procedural assets, import `/scripts/glowbud-model.mjs` in the running Vite browser, render `createGlowbud` through `createGlowbudRenderer`, export with `exportGlowbud`, and rebuild the two atlases with the application's `buildSpriteAtlas`. Then save the exported assets and manifest before rebuilding the graph.
