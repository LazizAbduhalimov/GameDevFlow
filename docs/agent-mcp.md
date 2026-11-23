# Live agent board (MCP)

An AI agent can build and run pipelines on the Consept board **while you watch**.
Every action goes to the board open in your browser: a named cursor (Figma-style)
glides to the spot, clicks, types prompts letter by letter, drags connections and
moves nodes. Nodes the agent creates pop in with its color, and nodes it runs glow
until generation finishes. A bar at the top of the canvas shows each agent and what it
is doing; **Follow** keeps the agent's work in view (turn it off to look elsewhere).

Agent edits go through the same React state as your own, so you can keep working
next to the agent, and **Ctrl+Z** undoes agent changes like any other edit. Autosave
works as usual.

## Connect an agent

Start Consept (`npm run dev`) and open a board in the browser
(`http://127.0.0.1:8080`). The agent needs an open tab; without one, tools answer
`BOARD_NOT_OPEN`.

### Claude Code (stdio)

This repository ships `.mcp.json`, so Claude Code started in this folder offers the
`consept` server automatically. From another folder:

```powershell
claude mcp add consept -- node "D:\Github\Others\Easy Consept\server\mcp-stdio.mjs"
```

The stdio server can read local image files (`add_image` with `path`).

### Any MCP client over HTTP

The Consept server itself exposes Streamable HTTP MCP at `/mcp`:

```powershell
claude mcp add --transport http consept http://127.0.0.1:4317/mcp
```

Over HTTP, `add_image` accepts `url` or `base64`, not local paths (the server never
reads arbitrary files from its disk). Requests from foreign browser origins are refused.

### Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `CONSEPT_URL` | `http://127.0.0.1:4317` | Consept server for the stdio MCP |
| `CONSEPT_AGENT_NAME` | MCP client name (`Claude`, `Cursor`, `Codex`, …) | Cursor label |
| `CONSEPT_AGENT_COLOR` | derived from the name | Cursor color `#rrggbb` |

Agents working at the same time get distinct cursor colors.

## Tools

| Tool | What the user sees |
| --- | --- |
| `list_boards` | – (open tabs and saved projects) |
| `create_project`, `open_project` | the board switches to that project |
| `get_board`, `get_node`, `wait_for_node` | – (read-only; status, errors, outputs) |
| `create_node` | cursor places the node, optionally wired from `connect_from`, prompt typed in |
| `add_image` | image node appears where the cursor clicks |
| `create_reference_set` | cursor collects nodes into a Reference Set |
| `set_prompt` | prompt typed live into the node |
| `update_node` | rename / settings; with `x`,`y` the node is dragged |
| `connect_nodes`, `disconnect_nodes` | a connection is dragged from output to input |
| `delete_node` | node fades out (undo with Ctrl+Z) |
| `run_node`, `cancel_node` | cursor presses Run; node glows until done |
| `view_image` | – (returns an output image to the agent) |
| `focus` | view pans/zooms to nodes |
| `say` | speech bubble next to the agent cursor |

Node types for `create_node`: `generator`, `characterFront`, `characterViews`,
`characterParts`, `multiGenerate`, `smartSeparation`, `spriteAtlas`, `relativeAtlas`,
`seamlessTexture`, `materialMaps`. `get_node` lists each node's output handles
(`front`, `all`, `variant-2`, …) to use in `connect_from` / `connect_nodes`.

Example agent run: `create_project` → `add_image` (reference) → `create_node`
(`characterFront`, `connect_from` the image, prompt) → `run_node` with `wait: true`
→ `view_image` on the output → `create_node` (`characterViews`) → `run_node`.

## Plain HTTP API

Non-MCP agents can call the bridge directly:

```http
POST /api/agent/command
{ "op": "create_node", "args": { "type": "generator", "prompt": "…" }, "projectId": "default",
  "agent": { "name": "My bot", "color": "#f97316" } }
```

`op` is a tool name with the same arguments (minus `project_id`, which becomes
`projectId`), except `add_image`, which expects an already uploaded `/data/...` URL
(`POST /api/assets` first). `GET /api/agent/boards` lists open boards.

## How it works

```
agent ──MCP──► mcp-stdio.mjs ──HTTP──► server /api/agent/command ─┐
agent ──HTTP MCP──► server /mcp ──────────────────────────────────┤
                                                                   ▼
                                     AgentBridge ──SSE /api/agent/stream──► browser board
                                          ▲                                   │ executes with cursor
                                          └──── POST /api/agent/results/:id ◄─┘
```

- `server/agent-bridge.mjs` – routes commands to the most relevant open tab
  (same project, visible, recently focused), with timeouts and disconnect handling.
- `server/agent-mcp.mjs` – MCP tool definitions and JSON-RPC handling, shared by both
  transports. `server/mcp-stdio.mjs` – stdio entry point.
- `src/agent-commands.ts` – browser executor: cursor choreography and board edits
  through the app's own functions (`addGenerator`, `runGenerator`, …).
- `src/agent-presence.ts`, `src/components/AgentCursorLayer.tsx` – cursor store,
  animation and rendering. In a hidden tab or with reduced motion, actions apply
  instantly without animation.
