import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Archive, Box, Download, Expand, Grid2X2, Layers3, LoaderCircle, Play, Plus, RefreshCw, ShieldCheck, Square, Table2, Trash2, Zap } from 'lucide-react';
import type { CharacterViewsNodeData, ViewKey } from '../types';
import { PromptEnhanceButton } from '../components/PromptEnhanceButton';

const viewOrder: ViewKey[] = ['front', 'left', 'back', 'right'];

export default function CharacterViewsNode({ id, data, selected }: NodeProps) {
  const nodeData = data as CharacterViewsNodeData;
  const outputs = viewOrder.map((key) => nodeData.views[key]);
  const ready = outputs.filter((view) => view.outputUrl).length;
  const busy = outputs.some((view) => view.status === 'queued' || view.status === 'running');
  const generationMode = nodeData.generationMode || 'fast';

  return (
    <article className={`studio-node turnaround-node ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle input-handle" />
      <div className="node-cap">
        <span className="node-kind"><Grid2X2 size={13} /> Character views</span>
        <select
          className="node-provider-select nodrag"
          aria-label="Image provider"
          value={nodeData.provider || 'global'}
          onChange={(event) => nodeData.onProviderChange?.(id, event.target.value as 'global' | 'codex' | 'gemini')}
        >
          <option value="global">Auto · Codex</option>
          <option value="codex">Codex</option>
          <option value="gemini" disabled>Gemini · unavailable</option>
        </select>
      </div>

      <div className="turnaround-mode-row nodrag" aria-label="Character view generation mode">
        <span>Execution</span>
        <div>
          <button className={generationMode === 'reliable' ? 'active' : ''} disabled={busy} onClick={() => nodeData.onModeChange?.(id, 'reliable')} title="Generate one view at a time"><ShieldCheck size={10} /> Reliable <small>1×</small></button>
          <button className={generationMode === 'fast' ? 'active' : ''} disabled={busy} onClick={() => nodeData.onModeChange?.(id, 'fast')} title="Generate two views in parallel"><Zap size={10} /> Fast <small>2×</small></button>
          <button className={generationMode === 'turbo' ? 'active' : ''} disabled={busy} onClick={() => nodeData.onModeChange?.(id, 'turbo')} title="Generate all four views independently in parallel"><Zap size={10} /> Turbo <small>4×</small></button>
        </div>
      </div>

      <div className="turnaround-grid">
        {outputs.map((view) => {
          const viewBusy = view.status === 'queued' || view.status === 'running';
          return (
            <div className={`view-slot status-${view.status}`} key={view.key}>
              <div className="view-slot-label"><span>{view.title}</span><small>{view.status}</small></div>
              {view.outputUrl ? (
                <button className="view-preview nodrag" onClick={() => nodeData.onOpen?.(view.outputUrl!, `${nodeData.title} · ${view.title}`, view.sourceUrl)}>
                  <img src={view.outputUrl} alt={`${view.title} result`} draggable={false} />
                  <Expand size={14} />
                </button>
              ) : (
                <div className="view-empty">{viewBusy ? <LoaderCircle className="spin" size={18} /> : <Grid2X2 size={17} />}</div>
              )}
              <div className="view-actions nodrag">
                <button title={viewBusy ? 'Stop after current' : view.outputUrl ? 'Regenerate view' : 'Generate view'} onClick={() => viewBusy ? nodeData.onCancelView?.(id, view.key) : nodeData.onRunView?.(id, view.key)}>
                  {viewBusy ? <Square size={11} /> : view.outputUrl ? <RefreshCw size={11} /> : <Play size={11} />}
                </button>
                {view.outputUrl && <>
                  <button title="Download PNG" onClick={() => nodeData.onDownloadView?.(id, view.key)}><Download size={11} /></button>
                  <button title="Branch from view" onClick={() => nodeData.onBranch?.(id, view.key)}><Plus size={11} /></button>
                  <button title="Open this view in Tripo Studio" aria-label={`Send ${view.title} view to Tripo Studio`} disabled={nodeData.tripoBusyUrl === view.outputUrl} onClick={() => nodeData.onOpenTripo?.(view.outputUrl!)}>{nodeData.tripoBusyUrl === view.outputUrl ? <LoaderCircle className="spin" size={11} /> : <Box size={11} />}</button>
                  <button className="danger" title="Move result to trash" onClick={() => nodeData.onDeleteView?.(id, view.key)}><Trash2 size={11} /></button>
                </>}
              </div>
              {view.error && <span className="view-error" title={view.error}>!</span>}
            </div>
          );
        })}
        {outputs.map((view, index) => (
          <Handle
            key={`output-${view.key}`}
            type="source"
            id={view.key}
            position={Position.Right}
            aria-label={`${view.title} output`}
            title={`${view.title} output`}
            className={`flow-handle output-handle view-handle ${view.outputUrl ? 'ready' : ''}`}
            style={{ top: `${12.5 + index * 25}%` }}
          />
        ))}
      </div>

      <div className={`all-views-output nodrag ${ready === 4 ? 'ready' : ''}`}>
        <span><Layers3 size={12} /> All views</span>
        <small>{ready === 4 ? '4 images ready' : `${ready} / 4 ready`}</small>
        <Handle
          type="source"
          id="all"
          position={Position.Right}
          aria-label="All views output"
          title={ready === 4 ? 'Pass all four images' : 'Generate all four views to enable this output'}
          className="flow-handle output-handle all-views-handle"
        />
      </div>

      <div className="node-body turnaround-controls">
        <div className="node-title-row"><h3>{nodeData.title}</h3><span className="turnaround-count">{ready} / 4 ready</span></div>
        <div className="prompt-label nodrag">
          <div className="prompt-label-head"><span>Shared consistency prompt</span><PromptEnhanceButton busy={nodeData.enhancingPrompt} available={nodeData.enhancePromptAvailable} disabled={!nodeData.basePrompt.trim()} onClick={() => nodeData.onEnhancePrompt?.(id)} /></div>
          <textarea aria-label="Shared character consistency prompt" value={nodeData.basePrompt} onChange={(event) => nodeData.onBasePromptChange?.(id, event.target.value)} rows={3} />
          {nodeData.enhancePromptError && <span className="prompt-enhance-error" role="alert">{nodeData.enhancePromptError}</span>}
        </div>
        <div className="node-button-row nodrag">
          <button className="node-action primary" disabled={busy} onClick={() => nodeData.onRunAll?.(id, false)}><Play size={12} fill="currentColor" /> Run all</button>
          <button className="node-action" disabled={busy || ready === 4} onClick={() => nodeData.onRunAll?.(id, true)}>Run missing</button>
        </div>
        <div className="node-export-row nodrag">
          <button disabled={!ready} onClick={() => nodeData.onExportViews?.(id)}><Archive size={11} /> {ready ? `Export ${ready} view${ready === 1 ? '' : 's'}` : 'Export views'}</button>
          <button disabled={!ready} onClick={() => nodeData.onBuildSpriteSheet?.(id)}><Table2 size={11} /> Sprite sheet</button>
        </div>
        <button
          className="tripo-multiview-button nodrag"
          disabled={ready !== 4 || busy || nodeData.tripoMultiviewBusy}
          onClick={() => nodeData.onOpenTripoMultiview?.(id)}
          title={ready === 4 ? 'Open Tripo in Multi View mode with all four images attached' : 'Generate all four views first'}
        >
          {nodeData.tripoMultiviewBusy ? <LoaderCircle className="spin" size={12} /> : <Box size={12} />}
          {nodeData.tripoMultiviewBusy ? 'Opening Tripo Multiview…' : 'Open in Tripo Multiview'}
        </button>
      </div>
    </article>
  );
}
