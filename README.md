# Consept Local

Consept is a local node-based image lab for game concept workflows. It uses the signed-in Codex/ImageGen session on this computer, stores projects and images on disk, and binds only to `127.0.0.1`.

No OpenAI API key is required for the Codex provider. Gemini is represented in the provider layer, but remains disabled until Google exposes an official local/consumer-quota image-generation path suitable for this app.

## Run

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:8080`.

## MVP workflow

1. Upload or drag a PNG, JPG, or WEBP image onto the canvas.
2. Branch from its output into an ImageGen node, or drop a connection on empty canvas and choose the node to create.
3. Enter an instruction, optionally apply a prompt preset, and run it.
4. Branch from generated results to keep iterating without losing earlier variants.
5. Open Gallery to inspect, compare, select, bundle, reuse, or move local assets to Trash.
6. Export selected images as a ZIP, or assemble them into a local sprite sheet with a JSON frame manifest.

The **Character views** node accepts one source and owns four independent Front/Left/Back/Right outputs plus a distinct orange **All views** output. All views becomes usable when the complete set is ready and sends the four images together as references to a downstream ImageGen node. Portrait previews use contain sizing, so the entire generated frame remains visible.

Character Views and Multi Generate always use **Turbo 4×**: up to four independent jobs run through four isolated local Codex app-server workers. A batch with more than four jobs continues as workers become free. If Codex explicitly reports a concurrency or rate limit, failed jobs automatically retry one at a time.

## Asset workbench

Select any active Gallery assets to reveal the workbench. The selection can be exported as a ZIP containing the original images and `manifest.json`, or opened in the sprite-sheet builder. The builder runs entirely in the browser and supports:

- Custom output names, 1–8 columns, and 64–512 px cells.
- Contain/cover fitting, configurable padding, and transparent/dark/light backgrounds.
- Crisp pixel-art sampling.
- Ordered frame preview.
- PNG output plus a JSON manifest with frame coordinates and source metadata.
- A separate ZIP of the source frames.

The **Trash** Gallery tab previews deleted assets without exposing the data directory. Assets can be restored to their original collection or permanently deleted after confirmation.

## Unity send

Image and model nodes have a Unity action next to Tripo. It copies the file into the current Unity project's `Assets/<Consept project name>/` folder, then brings the Editor to the front.

- Images go into `Images/Source`, `Images/Generated`, `Images/Views/<title>`, `Images/Atlases`, or `Images/Materials/<title>`.
- Models go into `Models/` and are instantiated on the currently open scene.
- The HUD Unity chip picks the running Editor, a Hub recent, or the last used project.

If the Unity project has no glTF importer, Consept adds `com.unity.cloud.gltfast` once so Tripo GLBs can import.

## Included quality-of-life features

- Durable project autosave with revision-conflict protection and browser fallback.
- Explicit save plus import/export of `.consept.json` project files.
- Undo/redo, duplicate, fit-selection, and run-prompt keyboard shortcuts.
- Persistent four-worker generation queue with automatic Turbo 4× execution, cancellation, and retry controls.
- Queue-to-node status reconciliation, including recovery after temporary backend polling failures.
- Gallery search, source/generated/trash filters, and multi-selection.
- Full-screen inspector with 1x/2x/4x zoom.
- A/B comparison with an interactive split slider.
- Prompt presets for identity, transparency, concept art, icons, and controlled variants.
- Automatic safe filenames and indexed local metadata.
- Soft-delete, restore, and confirmed permanent deletion.
- ZIP bundles with collision-safe filenames and an asset manifest.
- Local sprite-sheet composition with PNG and JSON output.
- Connection-drop and right-click node creation menus.
- Responsive mobile layout and reduced-motion support.
- Provider capability/status UI that does not claim unsupported Gemini access.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+S` | Save project |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |
| `Ctrl+D` | Duplicate selected node |
| `F` | Fit selected node |
| `Ctrl+Enter` | Run the selected generator |
| `Esc` | Close menus, drawers, or image inspector |

## Local data

| Path | Contents |
| --- | --- |
| `data/assets/` | Uploaded source images |
| `data/generated/` | Generated results |
| `data/metadata/assets.json` | Asset index, hashes, prompts, and metadata |
| `data/projects/default/project.json` | Current graph project and revision |
| `data/models/` | Captured Tripo GLB files |
| `data/settings/unity.json` | Last Unity project target |
| `data/jobs/` | Durable generation jobs |
| `data/trash/` | Soft-deleted assets |

Runtime data is ignored by Git. Binary files are served through controlled asset routes; the server does not expose the entire data directory.

## Codex connection

The header reports `codex login status`. When disconnected, the connection button starts the official Codex sign-in flow. Image jobs run through the local Codex app-server so results can be received, indexed, and saved directly.

## Verification

```powershell
npm run check
npm run build
npm run test:server
```

The server test suite covers project revision conflicts, asset indexing and multi-parent lineage, trash/restore/purge, safe ZIP selection and deduplication, worker leasing, queue lifecycle/recovery, and rejection of invalid image content.

Set `CONSEPT_CODEX_WORKERS=1` before `npm run dev` to force a single backend worker globally. The default is four, capped at four for the local app. `FRAMEFORGE_CODEX_WORKERS` is still accepted.

## Deliberate MVP limits

- No fake mask/inpainting control: it should appear only when the selected provider exposes a real mask capability.
- Gemini Nano Banana is not enabled through scraped browser tokens or undocumented quota workarounds.
- Batch-wide queue cancellation and reusable saved export recipes remain follow-up features.
