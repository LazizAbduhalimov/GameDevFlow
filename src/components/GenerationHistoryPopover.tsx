import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { History } from 'lucide-react';
import { formatRevisionTime } from '../generation-history';
import type { GenerationRevision } from '../types';

export function GenerationHistoryButton({
  count,
  disabled,
  onClick,
}: {
  count: number;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  if (count < 2) return null;
  return (
    <button
      type="button"
      className="card-history-btn"
      title={`Generation history (${count})`}
      aria-label={`Open generation history, ${count} versions`}
      disabled={disabled}
      onClick={onClick}
    >
      <History size={12} />
      <span className="card-history-count">{count}</span>
    </button>
  );
}

export function GenerationHistoryPopover({
  open,
  anchor,
  revisions,
  activeRevisionId,
  onRestore,
  onInspect,
  onApplyPrompt,
  onClose,
}: {
  open: boolean;
  anchor: { x: number; y: number };
  revisions: GenerationRevision[];
  activeRevisionId?: string;
  onRestore: (revisionId: string) => void;
  onInspect: () => void;
  onApplyPrompt?: (prompt: string) => void;
  onClose: () => void;
}) {
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const [focusedId, setFocusedId] = useState(activeRevisionId);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setFocusedId(activeRevisionId);
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) closeRef.current();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
    }
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, activeRevisionId]);

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      const panel = panelRef.current;
      if (!panel) return;
      const { width, height } = panel.getBoundingClientRect();
      const margin = 12;
      const left = Math.max(margin, Math.min(anchor.x, window.innerWidth - width - margin));
      const preferredTop = anchor.y + height + margin <= window.innerHeight ? anchor.y : anchor.y - height - margin;
      const top = Math.max(margin, Math.min(preferredTop, window.innerHeight - height - margin));
      setPosition((current) => current.left === left && current.top === top ? current : { left, top });
    }
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener('resize', updatePosition);
    return () => { observer.disconnect(); window.removeEventListener('resize', updatePosition); };
  }, [anchor.x, anchor.y, open, revisions.length]);

  if (!open || !revisions.length) return null;
  const focused = revisions.find((revision) => revision.id === focusedId) || revisions[revisions.length - 1];
  const countLabel = `${revisions.length} version${revisions.length === 1 ? '' : 's'}`;

  return createPortal(
    <div
      ref={panelRef}
      className="generation-history-popover nodrag nowheel"
      style={position}
      role="dialog"
      aria-label="Generation history"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="generation-history-strip" role="list">
        {revisions.map((revision, index) => {
          const active = revision.id === activeRevisionId;
          return (
            <button
              key={revision.id}
              type="button"
              role="listitem"
              className={`generation-history-thumb ${active ? 'is-active' : ''} ${revision.id === focused.id ? 'is-focused' : ''}`}
              title={`${formatRevisionTime(revision.createdAt)}${revision.prompt ? ` · ${revision.prompt}` : ''}`}
              aria-label={`Version ${index + 1}${active ? ', current' : ''}`}
              aria-current={active ? 'true' : undefined}
              onMouseEnter={() => setFocusedId(revision.id)}
              onFocus={() => setFocusedId(revision.id)}
              onClick={() => { onRestore(revision.id); onClose(); }}
            >
              <img src={revision.outputUrl} alt="" draggable={false} />
            </button>
          );
        })}
      </div>
      <footer>
        <span>
          {countLabel}
          {focused?.prompt ? ` · ${focused.prompt}` : focused ? ` · ${formatRevisionTime(focused.createdAt)}` : ''}
        </span>
        <div>
          {focused?.prompt && onApplyPrompt && (
            <button type="button" onClick={() => onApplyPrompt(focused.prompt!)}>Use this prompt</button>
          )}
          <button type="button" onClick={() => { onInspect(); onClose(); }}>Inspect</button>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
