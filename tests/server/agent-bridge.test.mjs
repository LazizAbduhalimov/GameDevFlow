import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentBridge, cleanAgent } from '../../server/agent-bridge.mjs';
import { createMcpSession, TOOLS } from '../../server/agent-mcp.mjs';

function fakeResponse() {
  const events = [];
  return {
    events,
    write(chunk) {
      const match = /^event: (\w+)\ndata: (.*)\n\n$/s.exec(chunk);
      if (match) events.push({ event: match[1], data: JSON.parse(match[2]) });
    },
    commands() { return events.filter((item) => item.event === 'command').map((item) => item.data); },
  };
}

const PROJECT = '11111111-2222-3333-4444-555555555555';

test('agent bridge routes a command to the board showing the project and resolves its result', async () => {
  const bridge = new AgentBridge({ heartbeatMs: 60_000 });
  const home = fakeResponse();
  const board = fakeResponse();
  bridge.attachClient({ clientId: 'client-home-0001', response: home, state: { projectId: 'default', screen: 'home' } });
  bridge.attachClient({ clientId: 'client-board-001', response: board, state: { projectId: PROJECT, screen: 'workspace' } });
  const pending = bridge.command({ op: 'get_board', projectId: PROJECT, agent: { name: 'Claude' } });
  const [command] = board.commands();
  assert.equal(command.op, 'get_board');
  assert.equal(command.agent.name, 'Claude');
  assert.equal(home.commands().length, 0);
  assert.equal(bridge.complete(command.id, 'client-home-0001', { ok: true, result: 1 }), false, 'another client cannot answer');
  assert.equal(bridge.complete(command.id, 'client-board-001', { ok: true, result: { nodes: [] } }), true);
  assert.deepEqual(await pending, { nodes: [] });
  bridge.stop();
});

test('agent bridge reports a missing board, board errors, timeouts and disconnects', async () => {
  const bridge = new AgentBridge({ heartbeatMs: 60_000 });
  await assert.rejects(bridge.command({ op: 'get_board' }), { code: 'BOARD_NOT_OPEN' });
  await assert.rejects(bridge.command({ op: 'Bad Op!' }), { code: 'INVALID_AGENT_COMMAND' });
  const board = fakeResponse();
  bridge.attachClient({ clientId: 'client-board-002', response: board, state: { projectId: 'default', screen: 'workspace' } });

  const failing = bridge.command({ op: 'run_node' });
  bridge.complete(board.commands()[0].id, 'client-board-002', { ok: false, code: 'NODE_NOT_FOUND', error: 'missing' });
  await assert.rejects(failing, { code: 'NODE_NOT_FOUND', message: 'missing' });

  await assert.rejects(bridge.command({ op: 'get_board', timeoutMs: 1_000 }), { code: 'BOARD_TIMEOUT' });

  const orphan = bridge.command({ op: 'get_board' });
  bridge.detachClient('client-board-002', board);
  await assert.rejects(orphan, { code: 'BOARD_DISCONNECTED' });
  assert.equal(bridge.boards().length, 0);
});

test('agent identity is sanitized with a stable color', () => {
  const agent = cleanAgent({ name: '  Claude Code  ', color: 'red;}' });
  assert.equal(agent.name, 'Claude Code');
  assert.match(agent.color, /^#[0-9a-f]{6}$/);
  assert.equal(cleanAgent({ name: 'Claude Code' }).color, agent.color);
  assert.deepEqual(cleanAgent(null).name, 'Agent');
});

function fakeBackend(overrides = {}) {
  const calls = [];
  return {
    calls,
    command: async (op, args, options) => { calls.push({ op, args, options }); return overrides[op] ? overrides[op](args, calls) : { ok: true }; },
    boards: async () => [{ clientId: 'c', projectId: 'default' }],
    projects: async () => [{ id: 'default', name: 'Untitled' }],
    uploadImage: async ({ name }) => ({ id: 'asset-1', url: '/data/assets/asset-1', name }),
    readImage: async () => ({ buffer: Buffer.from([0x89, 0x50]), mimeType: 'image/png' }),
  };
}

test('MCP session initializes, lists tools and forwards calls with the client identity', async () => {
  const backend = fakeBackend();
  const session = createMcpSession({ backend });
  const init = await session.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', clientInfo: { name: 'claude-code' } } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.ok(init.result.instructions.includes('LIVE board'));
  assert.equal(await session.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const list = await session.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(list.result.tools.length, TOOLS.length);

  const call = await session.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_node', arguments: { type: 'generator', prompt: 'a fox', project_id: 'default' } } });
  assert.equal(call.result.isError, undefined);
  assert.equal(backend.calls[0].op, 'create_node');
  assert.equal(backend.calls[0].options.projectId, 'default');
  assert.equal(backend.calls[0].args.project_id, undefined);
  assert.equal(backend.calls[0].options.agent.name, 'Claude');

  const bad = await session.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'create_node', arguments: { type: 'nope' } } });
  assert.equal(bad.result.isError, true);
  const unknown = await session.handle({ jsonrpc: '2.0', id: 5, method: 'nope' });
  assert.equal(unknown.error.code, -32601);
});

test('MCP add_image uploads bytes before placing them, and blocks local paths over HTTP', async () => {
  const backend = fakeBackend();
  const session = createMcpSession({ backend, allowLocalFiles: false });
  const blocked = await session.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_image', arguments: { path: 'C:/secret.png' } } });
  assert.equal(blocked.result.isError, true);
  const placed = await session.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'add_image', arguments: { base64: Buffer.from('png').toString('base64'), file_name: 'ref.png' } } });
  assert.equal(placed.result.isError, undefined);
  assert.deepEqual(backend.calls.at(-1).args, { url: '/data/assets/asset-1', assetId: 'asset-1', fileName: 'ref.png', title: undefined, x: undefined, y: undefined });
});

test('MCP wait_for_node polls until the node is idle', async () => {
  let reads = 0;
  const backend = fakeBackend({ get_node: () => ({ id: 'n', busy: ++reads < 2, status: reads < 2 ? 'running' : 'completed' }) });
  const session = createMcpSession({ backend });
  const reply = await session.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'wait_for_node', arguments: { node_id: 'n', timeout_seconds: 10 } } });
  const result = JSON.parse(reply.result.content[0].text);
  assert.equal(result.status, 'completed');
  assert.equal(result.timedOut, false);
  assert.equal(reads, 2);
});
