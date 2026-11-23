import { randomUUID } from 'node:crypto';

const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;
const PROJECT_ID = /^(default|[a-f0-9-]{36})$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const AGENT_COLORS = ['#8b5cf6', '#f97316', '#10b981', '#ec4899', '#3b82f6', '#eab308'];
export const DEFAULT_AGENT = Object.freeze({ id: 'agent', name: 'Agent', color: AGENT_COLORS[0] });

/**
 * Routes agent commands to a live Consept board open in a browser.
 * The browser executes every command itself (with a visible cursor), so agent edits
 * merge with the user's edits in the same React state instead of racing autosave.
 */
export class AgentBridge {
  constructor({ commandTimeoutMs = 60_000, heartbeatMs = 15_000 } = {}) {
    this.commandTimeoutMs = commandTimeoutMs;
    this.heartbeatMs = heartbeatMs;
    this.clients = new Map();
    this.pending = new Map();
  }

  attachClient({ clientId, response, state = {} }) {
    const id = CLIENT_ID.test(String(clientId || '')) ? String(clientId) : randomUUID();
    this.#dropClient(id, 'The board reconnected before the command finished.');
    const now = Date.now();
    const client = { id, response, connectedAt: now, lastActiveAt: now, ...cleanClientState(state) };
    this.clients.set(id, client);
    send(response, 'hello', { clientId: id });
    const heartbeat = setInterval(() => {
      try { response.write(': keep-alive\n\n'); } catch { this.detachClient(id, response); }
    }, this.heartbeatMs);
    heartbeat.unref?.();
    client.heartbeat = heartbeat;
    return id;
  }

  detachClient(clientId, response) {
    const client = this.clients.get(clientId);
    if (!client || (response && client.response !== response)) return;
    this.#dropClient(clientId, 'The board was closed before the command finished.');
  }

  updateClient(clientId, state = {}) {
    const client = this.clients.get(clientId);
    if (!client) return false;
    Object.assign(client, cleanClientState(state));
    if (state.active) client.lastActiveAt = Date.now();
    return true;
  }

  boards() {
    return [...this.clients.values()]
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .map((client) => ({
        clientId: client.id,
        projectId: client.projectId || null,
        projectName: client.projectName || null,
        screen: client.screen || 'home',
        visible: client.visible !== false,
        connectedAt: new Date(client.connectedAt).toISOString(),
        lastActiveAt: new Date(client.lastActiveAt).toISOString(),
      }));
  }

  pickClient(projectId) {
    const clients = [...this.clients.values()].sort((a, b) => score(b, projectId) - score(a, projectId) || b.lastActiveAt - a.lastActiveAt);
    return clients[0] || null;
  }

  command({ op, args = {}, projectId, agent, timeoutMs } = {}) {
    if (typeof op !== 'string' || !/^[a-z_]{2,40}$/.test(op)) return Promise.reject(bridgeError('INVALID_AGENT_COMMAND', 'Unknown agent command.'));
    if (projectId !== undefined && projectId !== null && !PROJECT_ID.test(String(projectId))) {
      return Promise.reject(bridgeError('INVALID_PROJECT_ID', 'Invalid project id.'));
    }
    const client = this.pickClient(projectId || undefined);
    if (!client) {
      return Promise.reject(bridgeError('BOARD_NOT_OPEN', 'No Consept board is open. Open Consept in a browser; the agent works on the live board so you can watch it.'));
    }
    const id = randomUUID();
    const payload = { id, op, args: args && typeof args === 'object' ? args : {}, projectId: projectId || null, agent: cleanAgent(agent) };
    const limit = Math.max(1_000, Math.min(15 * 60_000, Number(timeoutMs) || this.commandTimeoutMs));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(bridgeError('BOARD_TIMEOUT', `The board did not finish "${op}" within ${Math.round(limit / 1000)} s.`));
      }, limit);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer, clientId: client.id });
      try { send(client.response, 'command', payload); }
      catch {
        clearTimeout(timer);
        this.pending.delete(id);
        this.detachClient(client.id);
        reject(bridgeError('BOARD_DISCONNECTED', 'The board connection was lost.'));
      }
    });
  }

  complete(commandId, clientId, outcome = {}) {
    const entry = this.pending.get(commandId);
    if (!entry || entry.clientId !== clientId) return false;
    clearTimeout(entry.timer);
    this.pending.delete(commandId);
    if (outcome.ok === false) entry.reject(bridgeError(String(outcome.code || 'AGENT_COMMAND_FAILED').slice(0, 60), String(outcome.error || 'The board could not complete the command.').slice(0, 2_000)));
    else entry.resolve(outcome.result ?? null);
    return true;
  }

  stop() {
    for (const id of [...this.clients.keys()]) this.#dropClient(id, 'Consept is shutting down.');
  }

  #dropClient(clientId, reason) {
    const client = this.clients.get(clientId);
    if (!client) return;
    clearInterval(client.heartbeat);
    this.clients.delete(clientId);
    for (const [commandId, entry] of [...this.pending]) {
      if (entry.clientId !== clientId) continue;
      clearTimeout(entry.timer);
      this.pending.delete(commandId);
      entry.reject(bridgeError('BOARD_DISCONNECTED', reason));
    }
  }
}

export function cleanAgent(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_AGENT };
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 40) : DEFAULT_AGENT.name;
  const id = typeof value.id === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(value.id) ? value.id : `agent-${slug(name)}`;
  const color = typeof value.color === 'string' && HEX_COLOR.test(value.color) ? value.color.toLowerCase() : colorFor(id);
  return { id, name, color };
}

export function colorFor(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AGENT_COLORS[hash % AGENT_COLORS.length];
}

export function bridgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function bridgeErrorStatus(error) {
  return ({ BOARD_NOT_OPEN: 409, BOARD_DISCONNECTED: 409, BOARD_TIMEOUT: 504, INVALID_AGENT_COMMAND: 400, INVALID_PROJECT_ID: 400 })[error?.code] || 422;
}

function score(client, projectId) {
  let value = 0;
  if (projectId && client.projectId === projectId) value += 4;
  if (client.screen === 'workspace') value += 2;
  if (client.visible !== false) value += 1;
  return value;
}

function cleanClientState(state) {
  const next = {};
  if (typeof state.projectId === 'string' && PROJECT_ID.test(state.projectId)) next.projectId = state.projectId;
  if (typeof state.projectName === 'string') next.projectName = state.projectName.slice(0, 100);
  if (state.screen === 'home' || state.screen === 'workspace') next.screen = state.screen;
  if (typeof state.visible === 'boolean') next.visible = state.visible;
  return next;
}

function send(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'agent';
}
