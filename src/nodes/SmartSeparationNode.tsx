import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, ArrowUpRight, Check, ChevronDown, ChevronUp, Download, Eye, EyeOff, ImagePlus, Layers3, LoaderCircle, Plus, ScanSearch, Scissors, Search, Settings2, Sparkles } from 'lucide-react';
import type { SmartSeparationBounds, SmartSeparationItem, SmartSeparationNodeData, SmartSeparationProgress } from '../types';

type BoxGesture = { itemId: string; mode: 'move' | 'resize'; startX: number; startY: number; bounds: SmartSeparationBounds };
type DrawGesture = { startX: number; startY: number; currentX: number; currentY: number };

export default function SmartSeparationNode({ id, data, selected }: NodeProps) {
  const nodeData = data as SmartSeparationNodeData;
  const previewRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [draw, setDraw] = useState<DrawGesture | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const busy = ['analyzing', 'extracting', 'building'].includes(nodeData.status);
  const activeSource = nodeData.sources.find((source) => source.sourceIndex === nodeData.activeSourceIndex);
  const previewUrl = activeSource?.sourceUrl || nodeData.inputUrls?.[nodeData.activeSourceIndex] || nodeData.inputUrls?.[0];
  const reviewReady = nodeData.status !== 'analyzing' && (nodeData.status === 'review' || nodeData.items.length > 0);
  const visibleItems = useMemo(() => nodeData.items.filter((item) => (
    item.sourceIndex === nodeData.activeSourceIndex
    && (!nodeData.activeGroupId || item.groupId === nodeData.activeGroupId)
    && (!search || `${item.name} ${item.role}`.toLowerCase().includes(search.toLowerCase()))
  )), [nodeData.items, nodeData.activeSourceIndex, nodeData.activeGroupId, search]);
  const selectedCount = nodeData.items.filter((item) => item.enabled).length;
  const regenerateCount = nodeData.items.filter((item) => item.enabled && (item.generationMethod !== 'imagegen' || !item.rawOutputUrl)).length;
  const regeneratedCount = nodeData.items.filter((item) => item.enabled && item.generationMethod === 'imagegen' && Boolean(item.outputUrl)).length;
  const populatedGroups = nodeData.groups.filter((group) => nodeData.items.some((item) => item.enabled && item.groupId === group.id));
  const readyGroups = populatedGroups.filter((group) => group.status === 'ready').length;
  const analysisProgress = nodeData.analysisProgress;
  const analysisPercent = analysisProgress?.stage === 'grouping' ? 92
    : analysisProgress?.stage === 'completed' ? 100
      : analysisProgress?.totalSources ? Math.round(8 + analysisProgress.completedSources / analysisProgress.totalSources * 76) : 4;

  useEffect(() => {
    if (nodeData.status !== 'analyzing') {
      setElapsedSeconds(0);
      return undefined;
    }
    const started = Date.parse(analysisProgress?.startedAt || '') || Date.now();
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [nodeData.status, analysisProgress?.startedAt]);

  const startBoxGesture = (event: ReactPointerEvent, item: SmartSeparationItem, mode: 'move' | 'resize') => {
    event.preventDefault();
    event.stopPropagation();
    const gesture: BoxGesture = { itemId: item.id, mode, startX: event.clientX, startY: event.clientY, bounds: { ...item.bounds } };
    const move = (pointer: PointerEvent) => {
      const rect = previewRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = (pointer.clientX - gesture.startX) / rect.width * 1000;
      const dy = (pointer.clientY - gesture.startY) / rect.height * 1000;
      if (gesture.mode === 'move') {
        nodeData.onPatchItem?.(id, item.id, { bounds: { ...gesture.bounds, x: clamp(Math.round(gesture.bounds.x + dx), 0, 1000 - gesture.bounds.width), y: clamp(Math.round(gesture.bounds.y + dy), 0, 1000 - gesture.bounds.height) } });
      } else {
        nodeData.onPatchItem?.(id, item.id, { bounds: { ...gesture.bounds, width: clamp(Math.round(gesture.bounds.width + dx), 10, 1000 - gesture.bounds.x), height: clamp(Math.round(gesture.bounds.height + dy), 10, 1000 - gesture.bounds.y) } });
      }
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  const startDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!reviewReady || event.button !== 0 || (event.target as HTMLElement).closest('.smart-box')) return;
    const point = normalizedPoint(event.clientX, event.clientY, previewRef.current);
    if (!point) return;
    event.preventDefault();
    const gesture = { startX: point.x, startY: point.y, currentX: point.x, currentY: point.y };
    setDraw(gesture);
    const move = (pointer: PointerEvent) => {
      const next = normalizedPoint(pointer.clientX, pointer.clientY, previewRef.current);
      if (next) setDraw({ ...gesture, currentX: next.x, currentY: next.y });
    };
    const stop = (pointer: PointerEvent) => {
      const next = normalizedPoint(pointer.clientX, pointer.clientY, previewRef.current) || { x: gesture.currentX, y: gesture.currentY };
      const bounds = gestureBounds({ ...gesture, currentX: next.x, currentY: next.y });
      if (bounds.width >= 12 && bounds.height >= 12) nodeData.onAddItem?.(id, nodeData.activeSourceIndex, bounds);
      setDraw(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  return (
    <div className={`customuse-node-wrapper ${selected ? 'is-selected' : ''}`}>
      <div className="node-floating-label">
        <Sparkles size={12} />
        <span>{nodeData.title || 'Smart separation'}</span>
        {nodeData.items.length > 0 && <span className="floating-status-pill">{nodeData.items.length} parts</span>}
      </div>
      <article className={`studio-node smart-separation-node status-${nodeData.status} ${nodeData.expanded ? 'is-expanded' : 'is-collapsed'} ${selected ? 'is-selected' : ''}`}>
        <Handle type="target" position={Position.Left} className="flow-handle input-handle smart-input-handle" aria-label="UI sheet or reference set input" />
        <div className="node-cap smart-cap">
          <span className="node-kind"><Sparkles size={13} /> Smart separation</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {nodeData.items.length > 0 && (
              <button
                type="button"
                className="unpack-cards-btn nodrag"
                title="Unpack elements into individual asset cards on canvas"
                onClick={() => nodeData.onUnpackToCanvas?.(id)}
              >
                <ArrowUpRight size={11} /> Unpack cards
              </button>
            )}
            <span className={`smart-status status-${nodeData.status}`}>{statusLabel(nodeData.status)}</span>
            <button type="button" className="smart-collapse nodrag" aria-label={nodeData.expanded ? 'Collapse Smart Separation' : 'Expand Smart Separation'} onClick={() => nodeData.onExpandedChange?.(id, !nodeData.expanded)}>{nodeData.expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
          </div>
        </div>

    {!nodeData.expanded ? <div className="smart-collapsed-summary">
      <span><ScanSearch size={14} /> {nodeData.items.length || 0} elements</span>
      <span><Layers3 size={14} /> {nodeData.groups.length || 0} groups</span>
      <strong>{readyGroups}/{populatedGroups.length} atlases</strong>
    </div> : <>
      <div className="smart-workbench">
        <section className="smart-visual-column">
          <div className="smart-source-strip nodrag">
            {(nodeData.sources.length ? nodeData.sources : (nodeData.inputUrls || []).map((url, index) => ({ sourceIndex: index, sourceUrl: url, sourceAssetId: '', name: `Source ${index + 1}` }))).map((source) => <button type="button" key={`${source.sourceIndex}-${source.sourceUrl}`} className={source.sourceIndex === nodeData.activeSourceIndex ? 'active' : ''} onClick={() => nodeData.onSourceChange?.(id, source.sourceIndex)}><img src={source.sourceUrl} alt="" /><span>{source.sourceIndex + 1}</span></button>)}
          </div>
          <div ref={previewRef} className={`smart-preview nodrag ${reviewReady ? 'drawing-ready' : ''}`} onPointerDown={startDraw}>
            {previewUrl ? <img src={previewUrl} alt="Smart separation source" draggable={false} /> : <div className="smart-preview-empty"><ImagePlus size={26} /><span>Connect an image or Reference Set</span></div>}
            {reviewReady && nodeData.items.filter((item) => item.sourceIndex === nodeData.activeSourceIndex).map((item, index) => <button
              type="button"
              key={item.id}
              className={`smart-box ${item.enabled ? '' : 'is-disabled'} ${nodeData.activeGroupId && item.groupId !== nodeData.activeGroupId ? 'is-dimmed' : ''}`}
              style={{ left: `${item.bounds.x / 10}%`, top: `${item.bounds.y / 10}%`, width: `${item.bounds.width / 10}%`, height: `${item.bounds.height / 10}%` }}
              title={`${item.name}: drag to move`}
              onPointerDown={(event) => startBoxGesture(event, item, 'move')}
            ><span>{index + 1}</span><i onPointerDown={(event) => startBoxGesture(event, item, 'resize')} /></button>)}
            {draw && <span className="smart-draw-box" style={boxStyle(gestureBounds(draw))} />}
          </div>
          {reviewReady && <p className="smart-preview-help"><Scissors size={11} /> Drag boxes to move, use the corner to resize, or draw a new element.</p>}
        </section>

        <section className="smart-review-column">
          {!reviewReady ? <div className="smart-analyze-panel">
            <ScanSearch size={24} />
            <strong>Detect elements before regeneration</strong>
            <p>Codex will propose target regions and semantic groups. ImageGen recreates approved elements only after your review.</p>
            {nodeData.status === 'analyzing' ? <div className="smart-analysis-progress" role="status" aria-live="polite">
              <div className="smart-progress-meta"><span>{analysisStageLabel(analysisProgress?.stage)}</span><strong>{formatElapsed(elapsedSeconds)}</strong></div>
              <div className="smart-progress-track"><i style={{ transform: `scaleX(${analysisPercent / 100})` }} /></div>
              <div className="smart-progress-steps">
                <span className={analysisProgress?.stage === 'detecting' || analysisProgress?.stage === 'queued' ? 'active' : 'done'}><ScanSearch size={11} /> Detect <b>{analysisProgress?.completedSources || 0}/{analysisProgress?.totalSources || nodeData.inputUrls?.length || 0}</b></span>
                <span className={analysisProgress?.stage === 'grouping' ? 'active' : analysisProgress?.stage === 'completed' ? 'done' : ''}><Layers3 size={11} /> Group</span>
              </div>
              <p>{analysisProgress?.message || 'Waiting for the local Codex worker…'}</p>
              {elapsedSeconds >= 90 && !(analysisProgress?.completedSources) && <small>Codex is still working on the first batch. A stalled source will time out automatically.</small>}
            </div> : <label className="nodrag"><span>Guidance</span><textarea value={nodeData.userHint} placeholder="Optional: focus on buttons, exclude labels…" onChange={(event) => nodeData.onHintChange?.(id, event.target.value)} /></label>}
            <button type="button" className="node-action primary nodrag" disabled={busy || !(nodeData.inputUrls?.length)} onClick={() => nodeData.onAnalyze?.(id)}>{nodeData.status === 'analyzing' ? <LoaderCircle className="spin" size={13} /> : <Sparkles size={13} />} {nodeData.status === 'analyzing' ? `Working · ${formatElapsed(elapsedSeconds)}` : 'Analyze & group'}</button>
          </div> : <>
            <div className="smart-review-heading"><div><strong>{nodeData.groups.length} groups detected</strong><span>{selectedCount} of {nodeData.items.length} selected</span></div><button type="button" className="nodrag" disabled={busy} onClick={() => nodeData.onAnalyze?.(id)}><ScanSearch size={12} /> Re-analyze</button></div>
            <div className="smart-group-tabs nodrag">
              <button type="button" className={!nodeData.activeGroupId ? 'active' : ''} onClick={() => nodeData.onGroupChange?.(id, undefined)}>All <small>{nodeData.items.length}</small></button>
              {nodeData.groups.map((group) => <button type="button" key={group.id} className={group.id === nodeData.activeGroupId ? 'active' : ''} onClick={() => nodeData.onGroupChange?.(id, group.id)}>{group.name}<small>{nodeData.items.filter((item) => item.groupId === group.id && item.enabled).length}</small></button>)}
              <button type="button" title="Add group" onClick={() => nodeData.onAddGroup?.(id)}><Plus size={11} /></button>
            </div>
            <label className="smart-search nodrag"><Search size={12} /><input value={search} placeholder="Find detected element" onChange={(event) => setSearch(event.target.value)} /></label>
            <div className="smart-item-list nodrag nowheel">
              {visibleItems.map((item) => <div className={`smart-item-row ${item.enabled ? '' : 'is-disabled'}`} key={item.id}>
                <button type="button" title={item.enabled ? 'Exclude element' : 'Include element'} onClick={() => nodeData.onPatchItem?.(id, item.id, { enabled: !item.enabled })}>{item.enabled ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                <input aria-label="Element name" value={item.name} onChange={(event) => nodeData.onPatchItem?.(id, item.id, { name: event.target.value })} />
                <select aria-label="Element group" value={item.groupId || ''} onChange={(event) => nodeData.onPatchItem?.(id, item.id, { groupId: event.target.value })}>{nodeData.groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select>
                <span className={`smart-item-state status-${item.generationStatus || 'idle'}`} title={item.generationError || item.generationProgress || 'Will be regenerated with ImageGen'}>
                  {item.generationStatus === 'queued' || item.generationStatus === 'running' ? <LoaderCircle className="spin" size={12} /> : item.generationStatus === 'failed' ? <AlertTriangle size={12} /> : item.generationMethod === 'imagegen' && item.outputUrl ? <Check size={12} /> : <Sparkles size={11} />}
                </span>
              </div>)}
              {!visibleItems.length && <div className="smart-list-empty">No elements match this view.</div>}
            </div>
          </>}
        </section>
      </div>

      {reviewReady && <details className="smart-settings nodrag">
        <summary><Settings2 size={12} /> Regeneration &amp; atlas settings</summary>
        <div>
          <label>Alpha cleanup <input type="range" min="0" max="45" value={nodeData.settings.tolerance} onChange={(event) => patchSettings(nodeData, id, { tolerance: Number(event.target.value) })} /><small>{nodeData.settings.tolerance}%</small></label>
          <label>Transparent margin <input type="number" min="0" max="20" value={nodeData.settings.cropPadding} onChange={(event) => patchSettings(nodeData, id, { cropPadding: Number(event.target.value) })} /><small>%</small></label>
          <label>Layout <select value={nodeData.settings.packingMode} onChange={(event) => patchSettings(nodeData, id, { packingMode: event.target.value as 'relative' | 'grid' })}><option value="relative">Relative</option><option value="grid">Uniform grid</option></select></label>
          {nodeData.settings.packingMode === 'relative' ? <label>Atlas size <select value={nodeData.settings.atlasSize} onChange={(event) => patchSettings(nodeData, id, { atlasSize: Number(event.target.value) as 512 | 1024 | 2048 })}><option value={512}>512</option><option value={1024}>1024</option><option value={2048}>2048</option></select></label> : <label>Cell size <select value={nodeData.settings.cellSize} onChange={(event) => patchSettings(nodeData, id, { cellSize: Number(event.target.value) as 64 | 128 | 256 | 512 })}><option value={64}>64</option><option value={128}>128</option><option value={256}>256</option><option value={512}>512</option></select></label>}
          <label className="smart-check"><input type="checkbox" checked={nodeData.settings.pixelArt} onChange={(event) => patchSettings(nodeData, id, { pixelArt: event.target.checked })} /> Pixel art</label>
        </div>
      </details>}

      {(nodeData.warnings || []).map((warning) => <p className="smart-warning" key={warning}><AlertTriangle size={11} /> {warning}</p>)}
      {nodeData.error && <p className="smart-error"><AlertTriangle size={11} /> {nodeData.error}</p>}
      {reviewReady && <div className="smart-build-bar nodrag">
        <div>
          <strong>{regeneratedCount}/{selectedCount} transparent sprites ready</strong>
          <span>{regenerateCount ? `${regenerateCount} ImageGen call${regenerateCount === 1 ? '' : 's'} · source pixels are never packed directly` : 'All sprites are regenerated · atlas rebuild only'}</span>
        </div>
        <button type="button" className="node-action primary" disabled={busy || !selectedCount} onClick={() => nodeData.onBuildAll?.(id)}>{busy ? <LoaderCircle className="spin" size={13} /> : <Sparkles size={13} />} Regenerate &amp; build {populatedGroups.length}</button>
      </div>}
    </>}

    {nodeData.groups.length > 0 && <div className="smart-output-rail nodrag">
      {nodeData.groups.map((group) => {
        const count = nodeData.items.filter((item) => item.groupId === group.id && item.enabled).length;
        const readyCount = nodeData.items.filter((item) => item.groupId === group.id && item.enabled && item.generationMethod === 'imagegen' && item.outputUrl).length;
        return <div className={`smart-group-output status-${group.status}`} key={group.id}>
          <span>{group.status === 'building' ? <LoaderCircle className="spin" size={11} /> : group.status === 'ready' ? <Check size={11} /> : <Layers3 size={11} />}</span>
          <input aria-label="Group name" value={group.name} onChange={(event) => nodeData.onPatchGroup?.(id, group.id, { name: event.target.value })} />
          <small>{count}</small>
          {group.outputUrl && <><button type="button" title="Download atlas PNG" onClick={() => nodeData.onDownloadGroupPng?.(id, group.id)}><Download size={10} /></button><button type="button" title="Download atlas JSON" onClick={() => nodeData.onDownloadGroupJson?.(id, group.id)}><Download size={10} /><b>JSON</b></button></>}
          <Handle type="source" id={`group:${group.id}`} position={Position.Right} className={`flow-handle smart-group-handle ${count > 0 && readyCount === count ? 'ready' : ''}`} aria-label={`${group.name} sprite collection output`} />
        </div>;
      })}
      {readyGroups === populatedGroups.length && readyGroups > 0 && <div className="smart-all-output"><span>All atlases</span><small>{readyGroups}</small><Handle type="source" id="all-atlases" position={Position.Right} className="flow-handle smart-all-handle" aria-label="All generated atlases output" /></div>}
    </div>}
  </article>
  </div>
  );
}

function patchSettings(data: SmartSeparationNodeData, nodeId: string, patch: Partial<SmartSeparationNodeData['settings']>) {
  (data.onSettingsChange as ((id: string, patch: Partial<SmartSeparationNodeData['settings']>) => void) | undefined)?.(nodeId, patch);
}

function normalizedPoint(clientX: number, clientY: number, element: HTMLElement | null) {
  const rect = element?.getBoundingClientRect();
  if (!rect) return null;
  return { x: clamp(Math.round((clientX - rect.left) / rect.width * 1000), 0, 1000), y: clamp(Math.round((clientY - rect.top) / rect.height * 1000), 0, 1000) };
}

function gestureBounds(draw: DrawGesture): SmartSeparationBounds {
  return { x: Math.min(draw.startX, draw.currentX), y: Math.min(draw.startY, draw.currentY), width: Math.abs(draw.currentX - draw.startX), height: Math.abs(draw.currentY - draw.startY) };
}

function boxStyle(bounds: SmartSeparationBounds) {
  return { left: `${bounds.x / 10}%`, top: `${bounds.y / 10}%`, width: `${bounds.width / 10}%`, height: `${bounds.height / 10}%` };
}

function statusLabel(status: SmartSeparationNodeData['status']) {
  return ({ idle: 'Ready', analyzing: 'Analyzing', review: 'Review', extracting: 'Regenerating', building: 'Building', completed: 'Complete', partial: 'Partial', failed: 'Error' } as const)[status];
}

function analysisStageLabel(stage: SmartSeparationProgress['stage'] | undefined) {
  return stage === 'grouping' ? 'Building semantic groups' : stage === 'completed' ? 'Finishing review' : stage === 'failed' ? 'Analysis stopped' : 'Scanning source images';
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
