import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { AGENT_DATA_KEYS, AGENT_NODE_TYPES, PROMPT_FIELDS, findFreePosition, nodeIsBusy, nodeSize, positionAfter, summarizeNode, type AgentNodeType } from './agent-board';
import { agentPresence, glideDuration, motionAllowed, type AgentIdentity, type FlowPoint } from './agent-presence';
import { randomUUID } from './random-id';

export type AgentCommand = { id: string; op: string; args: Record<string, unknown>; projectId: string | null; agent: AgentIdentity };

export type AgentBoardContext = {
  reactFlow: ReactFlowInstance;
  canvas: () => HTMLElement | null;
  projectId: () => string;
  projectName: () => string;
  isWorkspace: () => boolean;
  openProject: (projectId: string) => Promise<void>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  createNode: (type: AgentNodeType, position: FlowPoint, sourceId?: string, sourceHandle?: string | null) => string;
  addImageNode: (image: { url: string; assetId?: string; fileName?: string }, position: FlowPoint, title?: string) => string;
  createReferenceSet: (nodeIds: string[], title?: string) => Promise<string | undefined>;
  connect: (sourceId: string, targetId: string, sourceHandle?: string | null) => void;
  applyNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  runNode: (nodeId: string) => unknown;
  cancelNode: (nodeId: string) => unknown;
};

/** Number of agent commands executing right now; UI auto-framing pauses while it is above zero. */
export const agentActivity = { active: 0 };

class AgentError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Viewport promises from React Flow wait for an animation frame, which never fires in a background tab; never block a command on them. */
function settle(viewport: Promise<unknown>, ms: number) {
  return Promise.race([viewport.catch(() => undefined), wait(ms)]);
}
const frames = (count = 2) => new Promise<void>((resolve) => {
  if (document.hidden) { window.setTimeout(resolve, 30); return; }
  let left = count;
  const tick = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const pause = (ms: number) => motionAllowed() ? wait(ms) : Promise.resolve();

const bubbleTimers = new Map<string, number>();

/** Drives one agent cursor on the board: glide, click, drag, type, speak. */
class CursorDriver {
  constructor(private agent: AgentIdentity, private ctx: AgentBoardContext) {}

  get id() { return this.agent.id; }

  ensure() {
    agentPresence.ensure(this.agent, this.visibleRect().topRight);
  }

  visibleRect() {
    const { x, y, zoom } = this.ctx.reactFlow.getViewport();
    const bounds = this.ctx.canvas()?.getBoundingClientRect();
    const width = (bounds?.width || window.innerWidth) / zoom;
    const height = (bounds?.height || window.innerHeight) / zoom;
    const left = -x / zoom;
    const top = -y / zoom;
    return { left, top, width, height, zoom, topRight: { x: left + width * 0.82, y: top + height * 0.18 } };
  }

  /** Pans the user's view only when follow mode is on and the target is outside the comfortable area. */
  async reveal(point: FlowPoint, size = { width: 0, height: 0 }) {
    if (!agentPresence.getSnapshot().follow) return;
    const view = this.visibleRect();
    const marginX = view.width * 0.1;
    const marginY = view.height * 0.12;
    const inside = point.x >= view.left + marginX && point.x + size.width <= view.left + view.width - marginX
      && point.y >= view.top + marginY && point.y + Math.min(size.height, view.height * 0.6) <= view.top + view.height - marginY;
    if (inside) return;
    const zoom = Math.max(view.zoom, 0.5);
    const duration = motionAllowed() ? 420 : 0;
    await settle(this.ctx.reactFlow.setCenter(point.x + size.width / 2, point.y + Math.min(size.height, 420) / 2, { zoom, duration }), duration + 60);
    await wait(duration + 20);
  }

  async goTo(point: FlowPoint, activity?: string) {
    this.ensure();
    if (activity) agentPresence.patch(this.id, { activity });
    await this.reveal(point);
    const from = agentPresence.cursor(this.id)?.position || point;
    await agentPresence.move(this.id, point, glideDuration(from, point, this.ctx.reactFlow.getViewport().zoom));
  }

  async click() {
    agentPresence.patch(this.id, { pressed: true });
    await pause(150);
    agentPresence.patch(this.id, { pressed: false });
  }

  async drag(from: FlowPoint, to: FlowPoint, onMove?: (point: FlowPoint) => void) {
    await this.goTo(from);
    agentPresence.patch(this.id, { pressed: true, dragFrom: from });
    await pause(120);
    const zoom = this.ctx.reactFlow.getViewport().zoom;
    await agentPresence.move(this.id, to, Math.max(420, glideDuration(from, to, zoom)), onMove);
    await pause(90);
    agentPresence.patch(this.id, { pressed: false, dragFrom: null });
  }

  say(text: string, holdMs = 6_000) {
    this.ensure();
    agentPresence.patch(this.id, { bubble: text });
    window.clearTimeout(bubbleTimers.get(this.id));
    bubbleTimers.set(this.id, window.setTimeout(() => {
      if (agentPresence.cursor(this.id)?.bubble === text) agentPresence.patch(this.id, { bubble: undefined });
    }, holdMs));
  }

  /** Canvas point of a DOM element inside a node (first matching selector), falling back to the node header. */
  nodePoint(nodeId: string, selectors: string[] = [], anchor: 'center' | 'text' = 'center'): FlowPoint {
    const root = this.ctx.canvas()?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
    for (const selector of selectors) {
      const element = root?.querySelector<HTMLElement>(selector);
      const rect = element?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const screen = anchor === 'text'
          ? { x: rect.left + Math.min(28, rect.width / 2), y: rect.top + Math.min(18, rect.height / 2) }
          : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        return this.ctx.reactFlow.screenToFlowPosition(screen);
      }
    }
    const node = this.ctx.reactFlow.getNode(nodeId);
    if (!node) return agentPresence.cursor(this.id)?.position || this.visibleRect().topRight;
    return { x: node.position.x + Math.min(120, nodeSize(node).width / 2), y: node.position.y + 28 };
  }
}

function requireNode(ctx: AgentBoardContext, nodeId: unknown): Node {
  const node = typeof nodeId === 'string' ? ctx.reactFlow.getNode(nodeId) : undefined;
  if (!node) throw new AgentError('NODE_NOT_FOUND', `Node ${String(nodeId)} is not on the board. Call get_board for current ids.`);
  return node;
}

function point(args: Record<string, unknown>): FlowPoint | undefined {
  return Number.isFinite(args.x) && Number.isFinite(args.y) ? { x: Number(args.x), y: Number(args.y) } : undefined;
}

function freeSpotInView(ctx: AgentBoardContext, driver: CursorDriver) {
  const view = driver.visibleRect();
  return findFreePosition(ctx.reactFlow.getNodes(), { x: view.left + view.width * 0.42, y: view.top + view.height * 0.22 });
}

async function typeText(ctx: AgentBoardContext, driver: CursorDriver, nodeId: string, field: string, text: string) {
  await driver.goTo(driver.nodePoint(nodeId, ['textarea', 'input[type="text"]'], 'text'), 'Typing');
  await driver.click();
  const write = (value: string) => ctx.setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, [field]: value } } : node));
  if (!motionAllowed() || !text) { write(text); return; }
  const total = Math.min(2_400, 280 + text.length * 16);
  const ticks = Math.max(1, Math.round(total / 32));
  const perTick = Math.max(1, Math.ceil(text.length / ticks));
  for (let index = perTick; index < text.length; index += perTick) {
    write(text.slice(0, index));
    await wait(32);
  }
  write(text);
}

const effectTimers = new Map<string, number>();
function flash(nodeId: string, kind: 'spawn' | 'focus', color: string, ms: number) {
  agentPresence.setEffect(nodeId, { kind, color });
  window.clearTimeout(effectTimers.get(nodeId));
  effectTimers.set(nodeId, window.setTimeout(() => {
    if (agentPresence.getSnapshot().effects[nodeId]?.kind === kind) agentPresence.setEffect(nodeId, null);
  }, ms));
}

/** Keeps a glow on a running node until its work finishes. */
function watchWork(ctx: AgentBoardContext, nodeId: string, color: string) {
  window.clearTimeout(effectTimers.get(nodeId));
  agentPresence.setEffect(nodeId, { kind: 'working', color });
  const started = Date.now();
  const check = () => {
    const node = ctx.reactFlow.getNode(nodeId);
    if (!node || (!nodeIsBusy(node.data) && Date.now() - started > 2_500) || Date.now() - started > 20 * 60_000) {
      if (agentPresence.getSnapshot().effects[nodeId]?.kind === 'working') agentPresence.setEffect(nodeId, null);
      return;
    }
    effectTimers.set(nodeId, window.setTimeout(check, 1_000));
  };
  effectTimers.set(nodeId, window.setTimeout(check, 1_000));
}

export async function executeAgentCommand(command: AgentCommand, ctx: AgentBoardContext): Promise<unknown> {
  const { op, args, agent } = command;
  const driver = new CursorDriver(agent, ctx);
  const readOnly = op === 'get_board' || op === 'get_node' || op === 'board_info';
  if (command.projectId && command.projectId !== ctx.projectId()) await ctx.openProject(command.projectId);
  else if (!readOnly && !ctx.isWorkspace()) await ctx.openProject(ctx.projectId());
  const edges = () => ctx.reactFlow.getEdges();
  driver.ensure();
  const color = agentPresence.cursor(agent.id)?.color || agent.color;

  switch (op) {
    case 'board_info': return { projectId: ctx.projectId(), projectName: ctx.projectName(), workspace: ctx.isWorkspace() };
    case 'open_project': return { projectId: ctx.projectId(), projectName: ctx.projectName() };
    case 'get_board': {
      const viewport = ctx.reactFlow.getViewport();
      return {
        projectId: ctx.projectId(),
        projectName: ctx.projectName(),
        viewport: { x: Math.round(viewport.x), y: Math.round(viewport.y), zoom: Number(viewport.zoom.toFixed(3)) },
        visibleArea: (({ left, top, width, height }) => ({ x: Math.round(left), y: Math.round(top), width: Math.round(width), height: Math.round(height) }))(driver.visibleRect()),
        nodes: ctx.reactFlow.getNodes().map((node) => summarizeNode(node, edges())),
      };
    }
    case 'get_node': return summarizeNode(requireNode(ctx, args.node_id), edges(), true);

    case 'say': {
      driver.ensure();
      driver.say(String(args.text || '').slice(0, 240));
      return { ok: true };
    }

    case 'focus': {
      const ids = Array.isArray(args.node_ids) ? args.node_ids.map(String) : [];
      const nodes = ids.length ? ids.map((id) => requireNode(ctx, id)) : undefined;
      await settle(ctx.reactFlow.fitView({ nodes, padding: 0.2, maxZoom: 1, duration: motionAllowed() ? 450 : 0 }), 600);
      await wait(motionAllowed() ? 470 : 0);
      if (nodes?.[0]) await driver.goTo(driver.nodePoint(nodes[0].id));
      return { ok: true };
    }

    case 'create_node': {
      const type = String(args.type) as AgentNodeType;
      if (!AGENT_NODE_TYPES.includes(type)) throw new AgentError('INVALID_NODE_TYPE', `Unsupported node type ${type}.`);
      const link = args.connect_from && typeof args.connect_from === 'object' ? args.connect_from as { node_id?: string; handle?: string } : null;
      const source = link ? requireNode(ctx, link.node_id) : undefined;
      const position = point(args) || (source ? positionAfter(source, ctx.reactFlow.getNodes()) : freeSpotInView(ctx, driver));
      driver.ensure();
      await driver.reveal(position, { width: 320, height: 360 });
      if (source) await driver.goTo(driver.nodePoint(source.id, [link?.handle ? `.react-flow__handle.source[data-handleid="${CSS.escape(link.handle)}"]` : '.react-flow__handle.source']), 'Connecting a new node');
      await driver.goTo({ x: position.x + 24, y: position.y + 20 }, `Adding ${type}`);
      await driver.click();
      const id = ctx.createNode(type, position, source?.id, link?.handle ?? null);
      flash(id, 'spawn', color, 1_100);
      await frames();
      const patch: Record<string, unknown> = {};
      if (typeof args.title === 'string' && args.title.trim()) patch.title = args.title.trim().slice(0, 80);
      if (args.data && typeof args.data === 'object') Object.assign(patch, args.data);
      if (Object.keys(patch).length) { ctx.applyNodeData(id, patch); await frames(); }
      const field = PROMPT_FIELDS[type];
      if (typeof args.prompt === 'string' && field) { await frames(); await typeText(ctx, driver, id, field, args.prompt); await frames(); }
      return summarizeNode(requireNode(ctx, id), edges());
    }

    case 'add_image': {
      const url = String(args.url || '');
      if (!/^\/data\/(assets|generated)\/[A-Za-z0-9-]+$/.test(url)) throw new AgentError('INVALID_IMAGE_URL', 'add_image needs a /data/... image URL.');
      const position = point(args) || freeSpotInView(ctx, driver);
      await driver.goTo({ x: position.x + 30, y: position.y + 30 }, 'Placing an image');
      await driver.click();
      const id = ctx.addImageNode({ url, assetId: typeof args.assetId === 'string' ? args.assetId : undefined, fileName: typeof args.fileName === 'string' ? args.fileName : undefined }, position, typeof args.title === 'string' ? args.title : undefined);
      flash(id, 'spawn', color, 1_100);
      await frames();
      return summarizeNode(requireNode(ctx, id), edges());
    }

    case 'create_reference_set': {
      const ids = Array.isArray(args.node_ids) ? args.node_ids.map(String) : [];
      for (const id of ids) {
        requireNode(ctx, id);
        await driver.goTo(driver.nodePoint(id), 'Collecting references');
        await driver.click();
        flash(id, 'focus', color, 1_600);
      }
      const id = await ctx.createReferenceSet(ids, typeof args.title === 'string' ? args.title : undefined);
      if (!id) throw new AgentError('REFERENCE_SET_FAILED', 'Select at least two nodes with ready, different images (up to 16).');
      await frames();
      flash(id, 'spawn', color, 1_100);
      await driver.goTo(driver.nodePoint(id));
      return summarizeNode(requireNode(ctx, id), edges());
    }

    case 'set_prompt': {
      const node = requireNode(ctx, args.node_id);
      const field = PROMPT_FIELDS[String(node.type)];
      if (!field) throw new AgentError('NO_PROMPT', `${node.type} nodes have no prompt field.`);
      flash(node.id, 'focus', color, 2_600);
      await typeText(ctx, driver, node.id, field, String(args.prompt ?? ''));
      await frames();
      return summarizeNode(requireNode(ctx, node.id), edges());
    }

    case 'update_node': {
      const node = requireNode(ctx, args.node_id);
      flash(node.id, 'focus', color, 1_800);
      const target = point(args);
      if (target) {
        const grab = driver.nodePoint(node.id, ['.node-kind', 'header']);
        const offset = { x: grab.x - node.position.x, y: grab.y - node.position.y };
        await driver.drag(grab, { x: target.x + offset.x, y: target.y + offset.y }, (cursor) => {
          const position = { x: cursor.x - offset.x, y: cursor.y - offset.y };
          ctx.setNodes((current) => current.map((item) => item.id === node.id ? { ...item, position } : item));
        });
      } else {
        await driver.goTo(driver.nodePoint(node.id, ['.node-kind', 'header']), 'Editing');
        await driver.click();
      }
      const patch: Record<string, unknown> = {};
      if (typeof args.title === 'string' && args.title.trim()) patch.title = args.title.trim().slice(0, 80);
      if (args.data && typeof args.data === 'object') Object.assign(patch, args.data);
      const ignored = Object.keys(patch).filter((key) => !AGENT_DATA_KEYS.has(key) && key !== 'settings' && key !== 'variantCount');
      if (Object.keys(patch).length) ctx.applyNodeData(node.id, patch);
      await frames();
      return { ...summarizeNode(requireNode(ctx, node.id), edges()), ...(ignored.length ? { ignored_keys: ignored } : {}) };
    }

    case 'connect_nodes': {
      const source = requireNode(ctx, args.source_id);
      const target = requireNode(ctx, args.target_id);
      if (source.id === target.id) throw new AgentError('INVALID_CONNECTION', 'A node cannot feed itself.');
      const handle = typeof args.source_handle === 'string' && args.source_handle ? args.source_handle : null;
      const from = driver.nodePoint(source.id, [handle ? `.react-flow__handle.source[data-handleid="${CSS.escape(handle)}"]` : '.react-flow__handle.source']);
      const to = driver.nodePoint(target.id, ['.react-flow__handle.target']);
      agentPresence.patch(agent.id, { activity: 'Connecting' });
      await driver.drag(from, to);
      ctx.connect(source.id, target.id, handle);
      flash(target.id, 'focus', color, 1_400);
      await frames();
      return summarizeNode(requireNode(ctx, target.id), edges());
    }

    case 'disconnect_nodes': {
      const all = edges();
      const removed = all.filter((edge) => (typeof args.edge_id === 'string' && edge.id === args.edge_id)
        || (typeof args.source_id === 'string' && typeof args.target_id === 'string' && edge.source === args.source_id && edge.target === args.target_id));
      if (!removed.length) throw new AgentError('EDGE_NOT_FOUND', 'No matching connection.');
      const target = ctx.reactFlow.getNode(removed[0].target);
      if (target) { await driver.goTo(driver.nodePoint(target.id, ['.react-flow__handle.target']), 'Disconnecting'); await driver.click(); }
      const ids = new Set(removed.map((edge) => edge.id));
      ctx.setEdges((current) => current.filter((edge) => !ids.has(edge.id)));
      return { removed: [...ids] };
    }

    case 'delete_node': {
      const node = requireNode(ctx, args.node_id);
      await driver.goTo(driver.nodePoint(node.id, ['.node-kind', 'header']), 'Deleting');
      await driver.click();
      agentPresence.setEffect(node.id, { kind: 'remove', color: color });
      await pause(260);
      ctx.setNodes((current) => current.filter((item) => item.id !== node.id));
      ctx.setEdges((current) => current.filter((edge) => edge.source !== node.id && edge.target !== node.id));
      agentPresence.setEffect(node.id, null);
      return { deleted: node.id };
    }

    case 'run_node': {
      const node = requireNode(ctx, args.node_id);
      const button = runButton(ctx, node.id);
      await driver.goTo(button || driver.nodePoint(node.id), `Running ${String(node.data.title || node.type)}`);
      await driver.click();
      const pending = Promise.resolve(ctx.runNode(node.id)).then(() => null, (error: unknown) => error);
      const settled = await Promise.race([pending, wait(1_500).then(() => 'pending' as const)]);
      if (settled instanceof Error) throw new AgentError('RUN_FAILED', settled.message);
      await frames();
      watchWork(ctx, node.id, color);
      const summary = summarizeNode(requireNode(ctx, node.id), edges());
      const failed = !summary.busy && ['failed', 'error'].includes(summary.status);
      return { ...summary, started: !failed };
    }

    case 'cancel_node': {
      const node = requireNode(ctx, args.node_id);
      await driver.goTo(driver.nodePoint(node.id), 'Cancelling');
      await driver.click();
      await Promise.resolve(ctx.cancelNode(node.id));
      await frames();
      return summarizeNode(requireNode(ctx, node.id), edges());
    }

    default: throw new AgentError('UNKNOWN_OP', `Unknown board command ${op}.`);
  }
}

function runButton(ctx: AgentBoardContext, nodeId: string): FlowPoint | null {
  const root = ctx.canvas()?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
  const button = [...(root?.querySelectorAll<HTMLButtonElement>('button') || [])]
    .find((item) => /^(run|generate|build|analy[sz]e|create|detect|regenerate)/i.test((item.textContent || item.title || item.getAttribute('aria-label') || '').trim()));
  const rect = button?.getBoundingClientRect();
  return rect && rect.width > 0 ? ctx.reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : null;
}

/** Always reads the newest render's context, so long commands never call stale closures. */
function liveContext(ref: { current: AgentBoardContext | null }): AgentBoardContext {
  return new Proxy({} as AgentBoardContext, { get: (_target, key) => ref.current?.[key as keyof AgentBoardContext] });
}

function clientId() {
  try {
    const saved = sessionStorage.getItem('consept-agent-client-id');
    if (saved) return saved;
    const created = randomUUID();
    sessionStorage.setItem('consept-agent-client-id', created);
    return created;
  } catch { return randomUUID(); }
}

/**
 * Keeps one SSE connection to /api/agent/stream, executes incoming commands in order per agent,
 * and reports results back. The context ref must be refreshed every render so commands see current state.
 */
export function useAgentBridge(contextRef: { current: AgentBoardContext | null }, state: { ready: boolean; projectId: string; projectName: string; screen: string }) {
  const idRef = useRef<string>('');
  const stateRef = useRef(state);
  stateRef.current = state;
  // Stay connected through project switches (ready flips false while loading); a reconnect would drop in-flight commands.
  const startedRef = useRef(false);
  if (state.ready) startedRef.current = true;
  const enabled = startedRef.current;

  useEffect(() => {
    if (!enabled) return;
    if (!idRef.current) idRef.current = clientId();
    const queues = new Map<string, Promise<void>>();
    const hideTimers = new Map<string, number>();
    let source: EventSource | null = null;
    let retry = 0;
    let closed = false;
    let retryTimer = 0;

    const report = (commandId: string, body: Record<string, unknown>) => fetch(`/api/agent/results/${encodeURIComponent(commandId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: idRef.current, ...body }),
    }).catch(() => undefined);

    const run = (command: AgentCommand) => {
      const key = command.agent?.id || 'agent';
      window.clearTimeout(hideTimers.get(key));
      const previous = queues.get(key) || Promise.resolve();
      const next = previous.then(async () => {
        const ctx = liveContext(contextRef);
        if (!contextRef.current) { await report(command.id, { ok: false, code: 'BOARD_NOT_READY', error: 'The board is still loading.' }); return; }
        agentActivity.active += 1;
        try {
          const result = await executeAgentCommand(command, ctx);
          await report(command.id, { ok: true, result });
        } catch (error) {
          await report(command.id, { ok: false, code: error instanceof AgentError ? error.code : 'AGENT_COMMAND_FAILED', error: error instanceof Error ? error.message : String(error) });
        } finally {
          agentActivity.active = Math.max(0, agentActivity.active - 1);
          agentPresence.patch(key, { activity: undefined });
        }
      });
      queues.set(key, next);
      void next.then(() => {
        if (queues.get(key) !== next) return;
        hideTimers.set(key, window.setTimeout(() => agentPresence.patch(key, { visible: false, bubble: undefined }), 45_000));
      });
    };

    const connect = () => {
      const current = stateRef.current;
      const query = new URLSearchParams({ clientId: idRef.current, projectId: current.projectId, projectName: current.projectName, screen: current.screen, visible: String(!document.hidden) });
      source = new EventSource(`/api/agent/stream?${query}`);
      source.addEventListener('hello', () => { retry = 0; });
      source.addEventListener('command', (event) => {
        try { run(JSON.parse((event as MessageEvent).data) as AgentCommand); }
        catch { /* Ignore malformed commands; the server times them out. */ }
      });
      source.onerror = () => {
        source?.close();
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        retryTimer = window.setTimeout(connect, 500 * 2 ** retry);
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(retryTimer);
      source?.close();
      for (const timer of hideTimers.values()) window.clearTimeout(timer);
    };
  }, [contextRef, enabled]);

  useEffect(() => {
    if (!enabled || !idRef.current) return;
    const send = (active: boolean) => fetch(`/api/agent/clients/${encodeURIComponent(idRef.current)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: stateRef.current.projectId, projectName: stateRef.current.projectName, screen: stateRef.current.screen, visible: !document.hidden, active }),
    }).catch(() => undefined);
    void send(true);
    const onVisibility = () => void send(!document.hidden);
    const onFocus = () => void send(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, state.projectId, state.projectName, state.screen]);
}
