import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanAgent } from './agent-bridge.mjs';

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'consept-board', title: 'Consept live board', version: '0.1.0' };
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const WAIT_POLL_MS = 1_500;

export const NODE_TYPES = {
  generator: 'Generate image: one ImageGen result from a prompt plus an optional connected image input (one connection; collection outputs carry many images).',
  characterFront: 'Character Front: one full-body front image (A-pose or T-pose) from a description and/or a connected reference. data.pose: "a-pose" | "t-pose".',
  characterViews: 'Character Views: from one connected front image generates front/left/back/right. Output handles: front, left, back, right, all. data.subjectKind: "character" | "prop".',
  characterParts: 'Character Parts: analyzes a connected character image into separable props/parts. run_node starts the analysis.',
  multiGenerate: 'Multi Generate: 2-6 distinct variants of one prompt. data.variantCount: 2..6. Output handles: variant-1.., all.',
  smartSeparation: 'Smart Separation: splits a connected UI sheet into isolated sprites and atlases. data.userHint: optional guidance. run_node starts detection.',
  spriteAtlas: 'Sprite Atlas: packs a connected collection (handle "all") into a grid atlas PNG + JSON. run_node builds it.',
  relativeAtlas: 'Relative Atlas: packs a connected collection preserving relative sizes. run_node builds it.',
  seamlessTexture: 'Seamless Texture: tileable surface texture from a prompt and an optional connected reference.',
  materialMaps: 'PBR Material Maps: normal/height/roughness/metallic/AO/ORM from a connected base-color image. Output handles: baseColor, normal, height, roughness, metallic, ambientOcclusion, orm, all.',
};

const INSTRUCTIONS = `Consept is a node-based game-art board. Every tool acts on the user's LIVE board in their browser: a named cursor moves, clicks, types and drags exactly where you work, so the user watches you build.

Workflow:
1. list_boards (or get_board) to see the open project, nodes, outputs and connections.
2. Build a pipeline: add_image for references, create_node for steps (connect_from wires the new node to an existing output), set_prompt to write prompts.
3. run_node to start generation; generation takes 30-180 s per image. wait_for_node blocks until the node finishes and returns its outputs.
4. view_image lets you look at any output URL before deciding the next step.
Use say to tell the user what you are doing in one short line. Positions are canvas coordinates; omit them and the board picks a free spot next to the related node. Node ids are returned by every creating tool.`;

const point = { type: 'number' };
const projectArg = { project_id: { type: 'string', description: 'Project id. Optional: defaults to the board currently open in the browser.' } };

export const TOOLS = [
  {
    name: 'list_boards',
    description: 'List browser tabs that have a Consept board open, plus all saved projects. Call this first.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_project',
    description: 'Create a new empty project (board) and open it in the browser so you can build on a clean canvas.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, open: { type: 'boolean', description: 'Open it on the live board. Default true.' } }, required: ['name'], additionalProperties: false },
  },
  {
    name: 'open_project',
    description: 'Switch the live board in the browser to another saved project.',
    inputSchema: { type: 'object', properties: { project_id: { type: 'string' } }, required: ['project_id'], additionalProperties: false },
  },
  {
    name: 'get_board',
    description: 'Read the live board: every node with its type, title, position, status, prompt, input connections and output handles/URLs.',
    inputSchema: { type: 'object', properties: { ...projectArg }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_node',
    description: 'Read one node in detail, including its full data, status, errors and outputs.',
    inputSchema: { type: 'object', properties: { node_id: { type: 'string' }, ...projectArg }, required: ['node_id'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_node',
    description: `Create a node on the live board (the cursor places it visibly). Types:\n${Object.entries(NODE_TYPES).map(([type, text]) => `- ${type}: ${text}`).join('\n')}`,
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: Object.keys(NODE_TYPES) },
        title: { type: 'string' },
        prompt: { type: 'string', description: 'Prompt typed into the node (generator, characterFront, multiGenerate, seamlessTexture; base prompt for characterViews; hint for smartSeparation; notes for characterParts).' },
        connect_from: {
          type: 'object',
          description: 'Wire an existing node output into the new node input.',
          properties: { node_id: { type: 'string' }, handle: { type: 'string', description: 'Output handle id, e.g. "all", "front", "variant-2". Omit for the default output.' } },
          required: ['node_id'],
          additionalProperties: false,
        },
        x: point,
        y: point,
        data: { type: 'object', description: 'Extra node settings, e.g. {"pose":"t-pose"}, {"variantCount":4}, {"provider":"codex"}, {"settings":{...}}.' },
        ...projectArg,
      },
      required: ['type'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_image',
    description: 'Put an image on the board as an image node. Give exactly one of: path (local file on the agent machine; stdio transport only), url (http/https download, or an existing /data/... Consept URL), or base64 (raw image bytes).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        url: { type: 'string' },
        base64: { type: 'string' },
        file_name: { type: 'string' },
        title: { type: 'string' },
        x: point,
        y: point,
        ...projectArg,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_reference_set',
    description: 'Pack the outputs of 2+ nodes into one Reference Set node, whose "all" output carries every image to the next node.',
    inputSchema: { type: 'object', properties: { node_ids: { type: 'array', items: { type: 'string' }, minItems: 2 }, title: { type: 'string' }, ...projectArg }, required: ['node_ids'], additionalProperties: false },
  },
  {
    name: 'set_prompt',
    description: 'Type a new prompt into a node (replaces the current prompt) with a live typing animation.',
    inputSchema: { type: 'object', properties: { node_id: { type: 'string' }, prompt: { type: 'string' }, ...projectArg }, required: ['node_id', 'prompt'], additionalProperties: false },
  },
  {
    name: 'update_node',
    description: 'Rename, move (animated drag) or change settings of a node. data is merged into the node data (settings objects are merged too).',
    inputSchema: { type: 'object', properties: { node_id: { type: 'string' }, title: { type: 'string' }, x: point, y: point, data: { type: 'object' }, ...projectArg }, required: ['node_id'], additionalProperties: false },
  },
  {
    name: 'connect_nodes',
    description: 'Drag a connection from a source node output to a target node input. A target keeps one input, so an existing input connection is replaced.',
    inputSchema: { type: 'object', properties: { source_id: { type: 'string' }, target_id: { type: 'string' }, source_handle: { type: 'string' }, ...projectArg }, required: ['source_id', 'target_id'], additionalProperties: false },
  },
  {
    name: 'disconnect_nodes',
    description: 'Remove a connection by edge_id, or every connection between source_id and target_id.',
    inputSchema: { type: 'object', properties: { edge_id: { type: 'string' }, source_id: { type: 'string' }, target_id: { type: 'string' }, ...projectArg }, additionalProperties: false },
  },
  {
    name: 'delete_node',
    description: 'Delete a node and its connections. Generated images stay in the Gallery and the user can undo with Ctrl+Z.',
    inputSchema: { type: 'object', properties: { node_id: { type: 'string' }, ...projectArg }, required: ['node_id'], additionalProperties: false },
  },
  {
    name: 'run_node',
    description: 'Press Run on a node: starts generation/analysis/building. Returns once started; use wait_for_node (or wait: true) for the result.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: { type: 'string' },
        wait: { type: 'boolean', description: 'Block until the node finishes. Default false.' },
        timeout_seconds: { type: 'number', description: 'Wait limit, default 300, max 900.' },
        ...projectArg,
      },
      required: ['node_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'cancel_node',
    description: 'Cancel queued or running work on a node.',
    inputSchema: { type: 'object', properties: { node_id: { type: 'string' }, ...projectArg }, required: ['node_id'], additionalProperties: false },
  },
  {
    name: 'wait_for_node',
    description: 'Block until a node is no longer queued/running, then return its status, errors and outputs.',
    inputSchema: { type: 'object', properties: { node_id: { type: 'string' }, timeout_seconds: { type: 'number' }, ...projectArg }, required: ['node_id'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'view_image',
    description: 'Return an image from the board (an output URL such as /data/generated/...) so you can look at it.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'focus',
    description: 'Pan/zoom the user\'s view to nodes (or to the whole board when node_ids is omitted).',
    inputSchema: { type: 'object', properties: { node_ids: { type: 'array', items: { type: 'string' } }, ...projectArg }, additionalProperties: false },
  },
  {
    name: 'say',
    description: 'Show a short speech bubble next to your cursor so the user knows what you are doing.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', maxLength: 240 }, ...projectArg }, required: ['text'], additionalProperties: false },
  },
];

/**
 * Minimal MCP (JSON-RPC 2.0) server shared by the stdio entry point and the HTTP /mcp endpoint.
 * backend: { command(op, args, opts), boards(), projects(), uploadImage({buffer, name, projectId}), readImage(url), readLocalFile?(path) }
 */
export function createMcpSession({ backend, agent: initialAgent, allowLocalFiles = false }) {
  let agent = initialAgent ? cleanAgent(initialAgent) : null;
  let protocolVersion = MCP_PROTOCOL_VERSIONS[0];

  async function handle(message) {
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return rpcError(null, -32600, 'Invalid Request');
    const { id, method, params } = message;
    const isNotification = id === undefined || id === null;
    try {
      if (method === 'initialize') {
        const requested = params?.protocolVersion;
        protocolVersion = MCP_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSIONS[0];
        if (!agent) agent = cleanAgent({ name: prettyClientName(params?.clientInfo?.name), id: `mcp-${String(params?.clientInfo?.name || 'agent')}-${Math.random().toString(36).slice(2, 8)}` });
        return rpcResult(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
      }
      if (isNotification) return null;
      if (method === 'ping') return rpcResult(id, {});
      if (method === 'tools/list') return rpcResult(id, { tools: TOOLS });
      if (method === 'tools/call') {
        const tool = TOOLS.find((item) => item.name === params?.name);
        if (!tool) return rpcError(id, -32602, `Unknown tool: ${params?.name}`);
        try {
          const output = await callTool(tool.name, params?.arguments || {});
          return rpcResult(id, output);
        } catch (error) {
          return rpcResult(id, { content: [{ type: 'text', text: `${error?.code ? `[${error.code}] ` : ''}${error instanceof Error ? error.message : String(error)}` }], isError: true });
        }
      }
      if (method === 'resources/list') return rpcResult(id, { resources: [] });
      if (method === 'prompts/list') return rpcResult(id, { prompts: [] });
      return rpcError(id, -32601, `Method not found: ${method}`);
    } catch (error) {
      return isNotification ? null : rpcError(id, -32603, error instanceof Error ? error.message : String(error));
    }
  }

  async function command(op, args, options = {}) {
    const { project_id: projectId, ...rest } = args || {};
    return backend.command(op, rest, { projectId: projectId || undefined, agent: agent || cleanAgent(null), timeoutMs: options.timeoutMs });
  }

  async function callTool(name, args) {
    switch (name) {
      case 'create_project': {
        if (!backend.createProject) throw toolError('Creating projects is not available here.');
        const project = await backend.createProject(String(args.name || 'Agent board').slice(0, 100));
        const opened = args.open === false ? null : await command('open_project', { project_id: project.id }, { timeoutMs: 30_000 });
        return json({ projectId: project.id, name: project.name, opened: Boolean(opened) });
      }
      case 'list_boards': {
        const [boards, projects] = await Promise.all([backend.boards(), backend.projects()]);
        return json({ boards, projects, note: boards.length ? 'Commands go to the most recently active board unless project_id is given.' : 'No board is open. Ask the user to open Consept in a browser.' });
      }
      case 'open_project': return json(await command('open_project', args, { timeoutMs: 30_000 }));
      case 'get_board': return json(await command('get_board', args));
      case 'get_node': return json(await command('get_node', args));
      case 'create_node': {
        if (!NODE_TYPES[args.type]) throw toolError(`type must be one of: ${Object.keys(NODE_TYPES).join(', ')}`);
        return json(await command('create_node', args));
      }
      case 'add_image': return json(await addImage(args));
      case 'create_reference_set': return json(await command('create_reference_set', args));
      case 'set_prompt': return json(await command('set_prompt', args));
      case 'update_node': return json(await command('update_node', args));
      case 'connect_nodes': return json(await command('connect_nodes', args));
      case 'disconnect_nodes': return json(await command('disconnect_nodes', args));
      case 'delete_node': return json(await command('delete_node', args));
      case 'cancel_node': return json(await command('cancel_node', args));
      case 'focus': return json(await command('focus', args));
      case 'say': return json(await command('say', { project_id: args.project_id, text: String(args.text || '').slice(0, 240) }));
      case 'run_node': {
        const { wait, timeout_seconds: timeoutSeconds, ...rest } = args;
        const started = await command('run_node', rest, { timeoutMs: 120_000 });
        if (!wait) return json(started);
        return json(await waitForNode(rest, timeoutSeconds));
      }
      case 'wait_for_node': {
        const { timeout_seconds: timeoutSeconds, ...rest } = args;
        return json(await waitForNode(rest, timeoutSeconds));
      }
      case 'view_image': {
        const image = await backend.readImage(String(args.url || ''));
        return { content: [{ type: 'image', data: image.buffer.toString('base64'), mimeType: image.mimeType }, { type: 'text', text: args.url }] };
      }
      default: throw toolError(`Unknown tool: ${name}`);
    }
  }

  async function addImage(args) {
    const sources = ['path', 'url', 'base64'].filter((key) => typeof args[key] === 'string' && args[key].trim());
    if (sources.length !== 1) throw toolError('Give exactly one of path, url or base64.');
    const { project_id: projectId, title, x, y } = args;
    if (args.url && /^\/data\/(assets|generated)\/[A-Za-z0-9-]+$/.test(args.url.trim())) {
      return command('add_image', { project_id: projectId, url: args.url.trim(), title, x, y });
    }
    let buffer;
    let name = typeof args.file_name === 'string' && args.file_name.trim() ? args.file_name.trim() : 'agent-image.png';
    if (args.path) {
      if (!allowLocalFiles || !backend.readLocalFile) throw toolError('Local paths are only available through the stdio MCP server. Use url or base64.');
      buffer = await backend.readLocalFile(args.path);
      if (!args.file_name) name = path.basename(args.path);
    } else if (args.base64) {
      buffer = Buffer.from(args.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    } else {
      const url = new URL(args.url.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw toolError('url must be http(s).');
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw toolError(`Download failed with status ${response.status}.`);
      buffer = Buffer.from(await response.arrayBuffer());
      if (!args.file_name) name = path.basename(url.pathname) || name;
    }
    if (!buffer?.length) throw toolError('The image is empty.');
    if (buffer.length > MAX_IMAGE_BYTES) throw toolError('Images must be 20 MB or smaller.');
    // Upload into the project the board will actually place the node in (generation rejects foreign assets).
    const board = await command('board_info', { project_id: projectId });
    const asset = await backend.uploadImage({ buffer, name, projectId: board?.projectId || projectId || 'default' });
    return command('add_image', { project_id: board?.projectId || projectId, url: asset.url, assetId: asset.id, fileName: asset.name, title, x, y });
  }

  async function waitForNode(args, timeoutSeconds) {
    const limit = Math.max(5, Math.min(900, Number(timeoutSeconds) || 300)) * 1000;
    const deadline = Date.now() + limit;
    let node = await command('get_node', args);
    while (node?.busy && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
      node = await command('get_node', args);
    }
    return { ...node, timedOut: Boolean(node?.busy) };
  }

  return { handle, get agent() { return agent; } };
}

export async function readLocalImageFile(filePath) {
  const resolved = path.resolve(String(filePath));
  const buffer = await readFile(resolved);
  if (buffer.length > MAX_IMAGE_BYTES) throw toolError('Images must be 20 MB or smaller.');
  return buffer;
}

export function imageMimeType(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  return 'image/png';
}

function prettyClientName(name) {
  const value = String(name || '').toLowerCase();
  if (value.includes('claude')) return 'Claude';
  if (value.includes('cursor')) return 'Cursor';
  if (value.includes('codex')) return 'Codex';
  return String(name || 'Agent').slice(0, 40);
}

function json(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value ?? null, null, 2) }] };
}

function toolError(message) {
  const error = new Error(message);
  error.code = 'INVALID_ARGUMENTS';
  return error;
}

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }
