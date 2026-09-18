import { useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Archive, ArrowUpRight, Box, ChevronDown, Component, Download, Grid2X2, LoaderCircle, RefreshCw, Square, Table2 } from 'lucide-react';
import { CHARACTER_POSE_SPECS, CHARACTER_VIEW_GRID, CHARACTER_VIEW_SPECS, normalizeCharacterPose, normalizeCharacterSubjectKind } from '../character-views';
import { InspectablePreview } from '../components/InspectablePreview';
import type { CharacterPose, CharacterViewsNodeData, ViewKey } from '../types';

const FALLBACK_HANDLE_TOPS: Record<ViewKey, string> = {
  front: '18%',
  back: '34%',
  left: '62%',
  right: '78%',
};

function characterViewHandleTops(slots: HTMLElement[]): Record<ViewKey, string> | null {
  if (slots.length !== 4) return null;
  const [front, back, left, right] = slots;
  const topRowTop = Math.min(front.offsetTop, back.offsetTop);
  const topRowBottom = Math.max(front.offsetTop + front.offsetHeight, back.offsetTop + back.offsetHeight);
  const bottomRowTop = Math.min(left.offsetTop, right.offsetTop);
  const bottomRowBottom = Math.max(left.offsetTop + left.offsetHeight, right.offsetTop + right.offsetHeight);
  const topBand = (topRowBottom - topRowTop) / 2;
  const bottomBand = (bottomRowBottom - bottomRowTop) / 2;
  return {
    front: `${Math.round(topRowTop + topBand / 2)}px`,
    back: `${Math.round(topRowTop + topBand + topBand / 2)}px`,
    left: `${Math.round(bottomRowTop + bottomBand / 2)}px`,
    right: `${Math.round(bottomRowTop + bottomBand + bottomBand / 2)}px`,
  };
}

function GeneratingOverlay() {
  return (
    <div className="view-generating-overlay" role="status" aria-live="polite">
      <span className="view-generating-pill">
        <LoaderCircle className="spin" size={14} aria-hidden="true" />
        Generating…
      </span>
    </div>
  );
}

function PoseIcon({ pose }: { pose: CharacterPose }) {
  const horizontal = pose === 't-pose';
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="4.1" r="2.05" fill="currentColor" />
      <path d="M10 6.8 V13.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d={horizontal ? 'M10 8.1 L2.4 8.1' : 'M10 8.1 L5.2 15.4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d={horizontal ? 'M10 8.1 L17.6 8.1' : 'M10 8.1 L14.8 15.4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M10 13.4 L6.6 18.3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10 13.4 L13.4 18.3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export default function CharacterViewsNode({ id, data, selected }: NodeProps) {
  const nodeData = data as CharacterViewsNodeData;
  const pose = normalizeCharacterPose(nodeData.pose);
  const subjectKind = normalizeCharacterSubjectKind(nodeData.subjectKind);
  const isProp = subjectKind === 'prop';
  const [moreOpen, setMoreOpen] = useState(false);
  const [handleTops, setHandleTops] = useState<Record<ViewKey, string>>(FALLBACK_HANDLE_TOPS);
  const stageRef = useRef<HTMLDivElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const outputs = CHARACTER_VIEW_GRID.map((key) => nodeData.views?.[key] ?? {
    key,
    title: CHARACTER_VIEW_SPECS[key].title,
    prompt: CHARACTER_VIEW_SPECS[key].prompt,
    status: 'idle' as const,
  });
  const ready = outputs.filter((view) => view.outputUrl).length;
  const busy = outputs.some((view) => view.status === 'queued' || view.status === 'running');
  const sourceReady = Boolean(nodeData.sourceReady);
  const viewGeometry = outputs.map((view) => `${view.key}:${view.outputUrl || ''}:${view.status}`).join('|');

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const stageEl = stage;

    function syncHandles() {
      const tops = characterViewHandleTops([...stageEl.querySelectorAll<HTMLElement>('.view-slot')]);
      if (!tops) return;
      setHandleTops((current) => {
        const changed = CHARACTER_VIEW_GRID.some((key) => current[key] !== tops[key]);
        return changed ? tops : current;
      });
      updateNodeInternals(id);
    }

    const observer = new ResizeObserver(syncHandles);
    observer.observe(stageEl);
    stageEl.querySelectorAll('.view-slot').forEach((slot) => observer.observe(slot));
    syncHandles();
    return () => observer.disconnect();
  }, [id, updateNodeInternals, viewGeometry]);

  function handlePrimary() {
    if (busy) nodeData.onCancelAll?.(id);
    else nodeData.onRunAll?.(id, false);
  }

  return (
    <div className={`customuse-node-wrapper ${selected ? 'is-selected' : ''}`}>
      <div className="node-floating-label">
        <Grid2X2 size={12} />
        <span>{nodeData.title || (isProp ? 'Prop views' : 'Character views')}</span>
        {busy ? (
          <span className="floating-status-pill">Generating…</span>
        ) : ready > 0 ? (
          <span className="floating-status-pill">{ready}/4</span>
        ) : null}
      </div>

      <article className={`studio-node turnaround-node ${selected ? 'is-selected' : ''}`}>
        <Handle type="target" position={Position.Left} className="flow-handle input-handle" />

        <div className="turnaround-head">
          <span className="node-kind"><Grid2X2 size={13} /> {isProp ? 'Prop views' : 'Character views'}</span>
        </div>

        <div className="turnaround-stage" ref={stageRef} aria-busy={busy}>
          <div className="turnaround-grid">
            {outputs.map((view) => {
              const viewBusy = view.status === 'queued' || view.status === 'running';
              const label = CHARACTER_VIEW_SPECS[view.key].title;
              return (
                <div className={`view-slot status-${view.status}`} key={view.key}>
                  <span className="view-slot-label">{label}</span>
                  {view.outputUrl ? (
                    <InspectablePreview
                      className={`view-preview ${viewBusy ? 'is-regenerating' : ''}`}
                      title={viewBusy ? undefined : 'Drag to move, click to inspect'}
                      ariaLabel={`Inspect ${label} view`}
                      disabled={viewBusy}
                      onInspect={() => nodeData.onOpen?.(view.outputUrl!, `${nodeData.title} · ${label}`, view.sourceUrl)}
                    >
                      <img src={view.outputUrl} alt={`${label} view`} draggable={false} />
                      {viewBusy ? <GeneratingOverlay /> : null}
                    </InspectablePreview>
                  ) : (
                    <div className="view-empty">{viewBusy ? <GeneratingOverlay /> : null}</div>
                  )}
                  <div className="view-hover nodrag">
                    <button
                      type="button"
                      title={viewBusy ? 'Stop this view' : view.outputUrl ? `Regenerate ${label}` : `Generate ${label}`}
                      disabled={!viewBusy && !sourceReady}
                      onClick={() => (viewBusy ? nodeData.onCancelView?.(id, view.key) : nodeData.onRunView?.(id, view.key))}
                    >
                      {viewBusy ? <Square size={11} /> : <RefreshCw size={11} />}
                    </button>
                    {view.outputUrl && (
                      <button type="button" title={`Download ${label}`} onClick={() => nodeData.onDownloadView?.(id, view.key)}>
                        <Download size={11} />
                      </button>
                    )}
                  </div>
                  {view.error && <span className="view-error" title={view.error}>!</span>}
                </div>
              );
            })}
          </div>
          {CHARACTER_VIEW_GRID.map((key) => (
            <Handle
              key={`output-${key}`}
              type="source"
              id={key}
              position={Position.Right}
              aria-label={`${CHARACTER_VIEW_SPECS[key].title} output`}
              title={`${CHARACTER_VIEW_SPECS[key].title} output`}
              className={`flow-handle output-handle view-handle ${nodeData.views[key]?.outputUrl ? 'ready' : ''}`}
              style={{ top: handleTops[key] }}
            />
          ))}
        </div>

        <div className="turnaround-run nodrag">
          <button
            type="button"
            className={`turnaround-primary ${ready && !busy ? 'is-quiet' : ''}`}
            disabled={!busy && !sourceReady}
            onClick={handlePrimary}
          >
            {busy ? <Square size={12} /> : <RefreshCw size={12} />}
            {busy ? 'Cancel' : ready ? 'Regenerate' : 'Generate'}
          </button>
          <Handle
            type="source"
            id="all"
            position={Position.Right}
            aria-label="All views output"
            title={ready === 4 ? 'Pass all four images' : 'Generate all four views to enable this output'}
            className={`flow-handle output-handle all-views-handle ${ready === 4 ? 'ready' : ''}`}
          />
        </div>

        {!sourceReady && (
          <p className="turnaround-hint">{isProp ? 'Connect a character image or All Views to generate this prop.' : 'Connect one character image to generate the other views.'}</p>
        )}

        {!isProp && (
        <div className="turnaround-params nodrag" aria-label="Character pose">
          <span>Pose</span>
          <div className="turnaround-pose-row" role="radiogroup" aria-label="Character pose">
            {(['a-pose', 't-pose'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={pose === value}
                className={pose === value ? 'active' : ''}
                disabled={busy}
                onClick={() => nodeData.onPoseChange?.(id, value)}
              >
                <PoseIcon pose={value} />
                {CHARACTER_POSE_SPECS[value].label}
              </button>
            ))}
          </div>
        </div>
        )}

        <div className={`turnaround-more ${moreOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className="turnaround-more-toggle nodrag"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            More
            <ChevronDown size={14} />
          </button>
          {moreOpen && (
            <div className="turnaround-more-body nodrag">
              <select
                className="node-provider-select"
                aria-label="Image provider"
                value={nodeData.provider || 'global'}
                onChange={(event) => nodeData.onProviderChange?.(id, event.target.value as 'global' | 'codex' | 'gemini')}
              >
                <option value="global">Auto · Codex</option>
                <option value="codex">Codex</option>
                <option value="gemini" disabled>Gemini · unavailable</option>
              </select>
              <div className="turnaround-more-actions">
                <button type="button" disabled={!ready} onClick={() => nodeData.onUnpackToCanvas?.(id)}>
                  <ArrowUpRight size={11} /> Unpack
                </button>
                <button type="button" disabled={!ready} onClick={() => nodeData.onExportViews?.(id)}>
                  <Archive size={11} /> Export
                </button>
                <button type="button" disabled={!ready} onClick={() => nodeData.onBuildSpriteSheet?.(id)}>
                  <Table2 size={11} /> Sheet
                </button>
                <button
                  type="button"
                  disabled={ready !== 4 || busy || nodeData.tripoMultiviewBusy}
                  onClick={() => nodeData.onOpenTripoMultiview?.(id)}
                >
                  {nodeData.tripoMultiviewBusy ? <LoaderCircle className="spin" size={11} /> : <Box size={11} />}
                  Tripo
                </button>
                <button
                  type="button"
                  disabled={ready !== 4 || busy || nodeData.unityBusy}
                  onClick={() => nodeData.onSendToUnity?.(id)}
                >
                  {nodeData.unityBusy ? <LoaderCircle className="spin" size={11} /> : <Component size={11} />}
                  Unity
                </button>
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
