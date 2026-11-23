#!/usr/bin/env node
// Consept live-board MCP server over stdio.
// Register:  claude mcp add consept -- node "<repo>/server/mcp-stdio.mjs"
// Env: CONSEPT_URL (default http://127.0.0.1:4317), CONSEPT_AGENT_NAME, CONSEPT_AGENT_COLOR (#rrggbb).
import readline from 'node:readline';
import { createMcpSession, imageMimeType, readLocalImageFile } from './agent-mcp.mjs';

const baseUrl = String(process.env.CONSEPT_URL || `http://127.0.0.1:${process.env.CONSEPT_PORT || 4317}`).replace(/\/+$/, '');
const agent = process.env.CONSEPT_AGENT_NAME || process.env.CONSEPT_AGENT_COLOR
  ? { name: process.env.CONSEPT_AGENT_NAME || 'Agent', color: process.env.CONSEPT_AGENT_COLOR, id: `stdio-${process.pid}` }
  : undefined;

export function createHttpBackend(base) {
  async function request(pathname, init = {}) {
    let response;
    try { response = await fetch(`${base}${pathname}`, init); }
    catch { throw codeError('CONSEPT_OFFLINE', `Consept is not running at ${base}. Start it with "npm run dev" (or set CONSEPT_URL).`); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw codeError(payload.code || `HTTP_${response.status}`, payload.message || `Request failed with status ${response.status}.`);
    return payload;
  }
  return {
    command: (op, args, { projectId, agent: identity, timeoutMs } = {}) => request('/api/agent/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, args, projectId, agent: identity, timeoutMs }),
      signal: AbortSignal.timeout((timeoutMs || 60_000) + 5_000),
    }).then((payload) => payload.result),
    boards: () => request('/api/agent/boards').then((payload) => payload.boards),
    projects: () => request('/api/projects'),
    createProject: (name) => request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
    uploadImage: ({ buffer, name, projectId }) => {
      const body = new FormData();
      body.append('image', new Blob([buffer], { type: imageMimeType(buffer) }), name);
      body.append('projectId', projectId);
      return request('/api/assets', { method: 'POST', body });
    },
    readImage: async (url) => {
      const target = url.startsWith('/') ? `${base}${url}` : url;
      if (!/^https?:\/\//.test(target)) throw codeError('INVALID_ARGUMENTS', 'url must be a /data/... board URL or http(s).');
      const response = await fetch(target, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw codeError(`HTTP_${response.status}`, `Could not read ${url}.`);
      const buffer = Buffer.from(await response.arrayBuffer());
      return { buffer, mimeType: imageMimeType(buffer) };
    },
    readLocalFile: readLocalImageFile,
  };
}

function codeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const session = createMcpSession({ backend: createHttpBackend(baseUrl), agent, allowLocalFiles: true });
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); }
  catch { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`); return; }
  const messages = Array.isArray(message) ? message : [message];
  for (const item of messages) {
    void session.handle(item).then((reply) => { if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`); });
  }
});
input.on('close', () => process.exit(0));
process.stderr.write(`[consept-mcp] connected to ${baseUrl}\n`);
