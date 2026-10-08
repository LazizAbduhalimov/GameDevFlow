# Consept Local

Consept is a local node-based image lab for game concept workflows. It uses the signed-in Codex/ImageGen or Cursor Agent CLI session on this computer, stores projects and images on disk, and binds only to `127.0.0.1`.

No OpenAI API key is required for the Codex provider. Gemini is represented in the provider layer, but remains disabled until Google exposes an official local/consumer-quota image-generation path suitable for this app.

Select **Cursor CLI** in the image-provider menu above the canvas to use it for
nodes set to the global provider, or select Cursor on an individual generator or
Character Views node. Cursor is detected from its Windows installation or from
`cursor-agent` on PATH on macOS/Linux. Sign in once with `agent login`, then click
**Refresh connection** in Consept. No separate image API key is configured.
Each generation runs in a temporary workspace containing copies of the selected
references. Only an image produced by Cursor's native image tool is accepted;
text-only responses and tool failures are reported as failed jobs. Generated
assets keep the provider and source-reference metadata in the project gallery.
Image generation must be available for your Cursor account/model.

Optional settings: `CONSEPT_CURSOR_COMMAND` (path to a directly executable CLI),
`CONSEPT_CURSOR_MODEL` (defaults to `auto`). Windows uses Cursor's bundled Node
runtime directly, without passing user prompts through a shell.

## Run

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:8080`.

## Shared LAN server

After `npm run build`, `npm start` serves the frontend and API on the same port.
`CONSEPT_HOST` defaults to `127.0.0.1`; set the server's LAN address to allow
other devices on the same network to connect. Direct `/project/<id>` links work.
This is a shared workspace for trusted LAN users; all users share the same
projects, assets, queue, and server-side Codex account. Do not forward this port
to the public Internet. Unity and Tripo desktop actions still require their
desktop environments and do not connect to a visitor's computer.

Deployment on Shokhjahon's server:

- Checkout: `/home/shokhjahon/consept`, repository `LazizAbduhalimov/GameDevFlow`,
  branch `cursor/smart-separation-layout-downloads` (HTTPS clone).
- Node.js 22 runtime: `~/.local/share/consept-node`; the system Node is unchanged.
- Runtime settings: `~/.config/consept/server.env` with
  `CONSEPT_HOST=192.168.12.231`, `CONSEPT_PORT=8083`,
  `CODEX_CLI_PATH=/home/shokhjahon/.local/share/consept-codex/node_modules/.bin/codex`,
  and `CONSEPT_CODEX_WORKERS=4`.
- Consept uses its own Codex CLI 0.160.1 installation under
  `~/.local/share/consept-codex`; the system CLI is unchanged.
- Service: `deploy/user/consept.service`, installed into `~/.config/systemd/user/`.
- Open `http://192.168.12.231:8083` from the same LAN.
- The existing server Codex login is used; login credentials are never copied
  from the development computer or committed to Git.
- `data/` stays on the server and is preserved across Git updates. The initial
  server workspace is separate from this computer's existing projects.

Update over SSH after pushing changes to the deployment branch:

```bash
cd /home/shokhjahon/consept
bash deploy/update.sh
```

The script refuses a dirty checkout, pulls with `--ff-only`, installs locked
dependencies, runs tests, builds, restarts the service, and checks `/api/health`.
User lingering must be enabled for autostart without an SSH session (already
enabled on this server). Inspect with `systemctl --user status consept.service`
or `journalctl --user -u consept.service`.

Deployment verification on 2026-10-08: frontend, uploads, autosave, direct project
links, and four Codex workers work over LAN HTTP. Native image generation has
not succeeded with the server account. In the smoke test Codex attempted a Canva
connector, which rejected the call because it required approval. A signed-in
Codex account alone does not verify native ImageGen availability. The image
worker now reports provider failures and refuses to substitute third-party apps;
generation needs a supported account/client setup before it can be used here.

## MVP workflow

1. Upload or drag a PNG, JPG, or WEBP image onto the canvas.
2. Branch from its output into an ImageGen node, or drop a connection on empty canvas and choose the node to create.
3. Enter an instruction, optionally apply a prompt preset, and run it.
4. Branch from generated results to keep iterating without losing earlier variants.
5. Open Gallery to inspect, compare, select, bundle, reuse, or move local assets to Trash.
6. Export selected images as a ZIP, or assemble them into a local sprite sheet with a JSON frame manifest.

The **Character views** node accepts one source and owns four independent Front/Left/Back/Right outputs plus a distinct orange **All views** output. All views becomes usable when the complete set is ready and sends the four images together as references to a downstream ImageGen node. Portrait previews use contain sizing, so the entire generated frame remains visible.

Each output image gets its own worker: a dedicated Codex app-server process or
Cursor CLI process. All requested images start independently, including batches
with more than four outputs and Smart Separation regeneration. The app applies
no fixed worker or batch concurrency cap to image jobs. Each Codex image worker
is closed after success or failure. If the provider reports a concurrency or
rate limit, Character Views and Multi Generate retry failed items one at a time.

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
- Persistent generation queue with one dedicated worker per output image, cancellation, and retry controls.
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

`CONSEPT_CODEX_WORKERS` (or `FRAMEFORGE_CODEX_WORKERS`) controls only the shared
Codex pool used for analysis and prompt enhancement, defaulting to four. Image
generation uses dedicated processes and is independent of that pool. Provider
capabilities report `workerMode: "per-image"` and `maxConcurrency: null`; the
health endpoint exposes the active Codex image workers and their job IDs.

## Deliberate MVP limits

- No fake mask/inpainting control: it should appear only when the selected provider exposes a real mask capability.
- Gemini Nano Banana is not enabled through scraped browser tokens or undocumented quota workarounds.
- Batch-wide queue cancellation and reusable saved export recipes remain follow-up features.
