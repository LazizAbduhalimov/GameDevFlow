import { useSyncExternalStore } from 'react';
import { useViewport } from '@xyflow/react';
import { agentPresence, type AgentCursorState } from '../agent-presence';

/** Figma-style live cursors for agents working on the board. Lives inside <ReactFlow> so it tracks pan/zoom. */
export function AgentCursorLayer() {
  const { x, y, zoom } = useViewport();
  const { cursors, effects, follow } = useSyncExternalStore(agentPresence.subscribe, agentPresence.getSnapshot, agentPresence.getSnapshot);
  const visible = cursors.filter((cursor) => cursor.visible);
  const toScreen = (point: { x: number; y: number }) => ({ left: x + point.x * zoom, top: y + point.y * zoom });
  const effectCss = Object.entries(effects).map(([nodeId, effect]) => {
    const selector = `.react-flow__node[data-id="${cssString(nodeId)}"]`;
    const color = effect.color;
    const child = `${selector}>*{--agent-color:${color};`;
    if (effect.kind === 'spawn') return `${child}animation:agent-node-spawn .7s cubic-bezier(.2,.9,.3,1.2) both;box-shadow:0 0 0 2px ${color},0 0 0 7px ${color}33!important}`;
    if (effect.kind === 'remove') return `${child}transition:opacity .24s,transform .24s;opacity:0!important;transform:scale(.92)}`;
    if (effect.kind === 'working') return `${child}box-shadow:0 0 0 2px ${color},0 0 28px ${color}55!important;outline:2px solid ${color};animation:agent-node-working 1.6s ease-in-out infinite}`;
    return `${child}box-shadow:0 0 0 2px ${color},0 0 0 6px ${color}2b!important}`;
  }).join('\n');

  return (
    <>
      {effectCss && <style>{effectCss}</style>}
      <div className="agent-cursor-layer" aria-hidden="true">
        {visible.map((cursor) => cursor.dragFrom ? <DragLine key={`drag-${cursor.id}`} cursor={cursor} from={toScreen(cursor.dragFrom)} to={toScreen(cursor.position)} /> : null)}
        {visible.map((cursor) => <AgentCursor key={cursor.id} cursor={cursor} {...toScreen(cursor.position)} />)}
      </div>
      {visible.length > 0 && (
        <div className="agent-presence-bar" role="status" aria-live="polite">
          {visible.map((cursor) => (
            <span key={cursor.id} className="agent-presence-chip" style={{ ['--agent-color' as string]: cursor.color }}>
              <i />
              <strong>{cursor.name}</strong>
              <span>{cursor.activity || cursor.bubble || 'on the board'}</span>
            </span>
          ))}
          <button type="button" className={follow ? 'is-on' : ''} aria-pressed={follow} title="Keep the agent's work in view"
            onClick={() => agentPresence.setFollow(!follow)}>Follow</button>
        </div>
      )}
    </>
  );
}

function AgentCursor({ cursor, left, top }: { cursor: AgentCursorState; left: number; top: number }) {
  return (
    <div className={`agent-cursor ${cursor.pressed ? 'is-pressed' : ''}`} style={{ transform: `translate3d(${left}px, ${top}px, 0)`, ['--agent-color' as string]: cursor.color }}>
      <svg width="22" height="24" viewBox="0 0 22 24" className="agent-cursor-arrow">
        <path d="M2.2 1.6 19.4 10.2c.9.45.8 1.77-.17 2.05l-7.07 2.06-3.35 6.73c-.45.9-1.77.78-2.04-.19L1.04 2.86C.8 1.98 1.4 1.24 2.2 1.6Z" fill="var(--agent-color)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      {cursor.pressed && <span className="agent-cursor-ripple" />}
      <div className="agent-cursor-label">
        <span>{cursor.name}</span>
        {cursor.bubble && <p>{cursor.bubble}</p>}
      </div>
    </div>
  );
}

function DragLine({ cursor, from, to }: { cursor: AgentCursorState; from: { left: number; top: number }; to: { left: number; top: number } }) {
  const dx = Math.max(40, Math.abs(to.left - from.left) * 0.5);
  const path = `M${from.left},${from.top} C${from.left + dx},${from.top} ${to.left - dx},${to.top} ${to.left},${to.top}`;
  return (
    <svg className="agent-drag-line">
      <path d={path} stroke={cursor.color} strokeWidth="2" strokeDasharray="6 5" fill="none" />
      <circle cx={from.left} cy={from.top} r="4.5" fill={cursor.color} />
    </svg>
  );
}

function cssString(value: string) {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}
