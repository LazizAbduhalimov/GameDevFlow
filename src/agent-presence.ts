export type FlowPoint = { x: number; y: number };
export type AgentIdentity = { id: string; name: string; color: string };

export type AgentCursorState = AgentIdentity & {
  position: FlowPoint;
  visible: boolean;
  pressed: boolean;
  bubble?: string;
  activity?: string;
  dragFrom?: FlowPoint | null;
  updatedAt: number;
};

export type NodeEffectKind = 'spawn' | 'focus' | 'remove' | 'working';
export type NodeEffect = { kind: NodeEffectKind; color: string };

export type AgentPresenceSnapshot = {
  cursors: AgentCursorState[];
  effects: Record<string, NodeEffect>;
  follow: boolean;
};

type Listener = () => void;

const cursors = new Map<string, AgentCursorState>();
const effects = new Map<string, NodeEffect>();
const listeners = new Set<Listener>();
const animations = new Map<string, number>();
let follow = readFollow();
let snapshot: AgentPresenceSnapshot = build();

function build(): AgentPresenceSnapshot {
  return { cursors: [...cursors.values()], effects: Object.fromEntries(effects), follow };
}

function emit() {
  snapshot = build();
  for (const listener of [...listeners]) listener();
}

function readFollow() {
  try { return localStorage.getItem('consept-agent-follow') !== 'false'; } catch { return true; }
}

export const agentPresence = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot: () => snapshot,
  cursor: (id: string) => cursors.get(id),

  ensure(agent: AgentIdentity, start: FlowPoint) {
    const current = cursors.get(agent.id);
    const color = current?.color || distinctColor(agent.id, agent.color);
    cursors.set(agent.id, current
      ? { ...current, name: agent.name, visible: true, updatedAt: Date.now() }
      : { ...agent, color, position: start, visible: true, pressed: false, updatedAt: Date.now() });
    emit();
    return cursors.get(agent.id)!;
  },

  patch(id: string, patch: Partial<AgentCursorState>) {
    const current = cursors.get(id);
    if (!current) return;
    cursors.set(id, { ...current, ...patch, updatedAt: Date.now() });
    emit();
  },

  remove(id: string) {
    if (!cursors.delete(id)) return;
    const frame = animations.get(id);
    if (frame) cancelAnimationFrame(frame);
    emit();
  },

  setEffect(nodeId: string, effect: NodeEffect | null) {
    if (effect) effects.set(nodeId, effect);
    else if (!effects.delete(nodeId)) return;
    emit();
  },

  clearEffects(kind?: NodeEffectKind) {
    let changed = false;
    for (const [nodeId, effect] of effects) {
      if (!kind || effect.kind === kind) { effects.delete(nodeId); changed = true; }
    }
    if (changed) emit();
  },

  setFollow(value: boolean) {
    follow = value;
    try { localStorage.setItem('consept-agent-follow', String(value)); } catch { /* Browser storage is optional. */ }
    emit();
  },

  /** Glides the cursor to a canvas point. Resolves immediately when motion is unavailable (hidden tab, reduced motion). */
  move(id: string, to: FlowPoint, durationMs: number, onFrame?: (point: FlowPoint) => void): Promise<void> {
    const cursor = cursors.get(id);
    if (!cursor) return Promise.resolve();
    const previous = animations.get(id);
    if (previous) cancelAnimationFrame(previous);
    const from = cursor.position;
    if (!motionAllowed() || durationMs <= 0) {
      agentPresence.patch(id, { position: to });
      onFrame?.(to);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const started = performance.now();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        animations.delete(id);
        agentPresence.patch(id, { position: to });
        onFrame?.(to);
        resolve();
      };
      const watchdog = window.setTimeout(finish, durationMs + 250);
      const step = (now: number) => {
        if (done) return;
        const t = Math.min(1, (now - started) / durationMs);
        if (t >= 1) { window.clearTimeout(watchdog); finish(); return; }
        const point = interpolate(from, to, easeInOutCubic(t));
        agentPresence.patch(id, { position: point });
        onFrame?.(point);
        animations.set(id, requestAnimationFrame(step));
      };
      animations.set(id, requestAnimationFrame(step));
    });
  },
};

const CURSOR_COLORS = ['#8b5cf6', '#f97316', '#10b981', '#ec4899', '#3b82f6', '#eab308'];

/** Keeps simultaneous agents visually distinct: a requested color already worn by another visible cursor is swapped. */
function distinctColor(id: string, requested: string) {
  const taken = new Set([...cursors.values()].filter((cursor) => cursor.id !== id && cursor.visible).map((cursor) => cursor.color.toLowerCase()));
  if (!taken.has(requested.toLowerCase())) return requested;
  return CURSOR_COLORS.find((color) => !taken.has(color)) || requested;
}

export function motionAllowed() {
  if (typeof document !== 'undefined' && document.hidden) return false;
  try { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function interpolate(from: FlowPoint, to: FlowPoint, t: number): FlowPoint {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** Screen-space glide time: short hops are quick, long trips stay under a second. */
export function glideDuration(from: FlowPoint, to: FlowPoint, zoom: number) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y) * Math.max(0.1, zoom);
  return Math.round(Math.max(220, Math.min(900, 180 + distance * 0.55)));
}
