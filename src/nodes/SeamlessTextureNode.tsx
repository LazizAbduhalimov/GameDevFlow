import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Check, Download, Expand, Grid3X3, LoaderCircle, Play, Plus, RefreshCw, Square, Trash2 } from 'lucide-react';
import { InspectablePreview } from '../components/InspectablePreview';
import { PromptEnhanceButton } from '../components/PromptEnhanceButton';
import type { SeamlessTextureNodeData } from '../types';

export default function SeamlessTextureNode({ id, data, selected }: NodeProps) {
  const nodeData = data as SeamlessTextureNodeData;
  const busy = nodeData.status === 'queued' || nodeData.status === 'running' || nodeData.processingSeams;
  const changeSettings = (patch: Partial<SeamlessTextureNodeData['settings']>) => nodeData.onSettingsChange?.(id, patch);

  return (
    <article className={`studio-node seamless-node status-${nodeData.status} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle input-handle seamless-input-handle" aria-label="Texture reference input" />
      <div className="node-cap seamless-cap">
        <span className="node-kind"><RefreshCw size={13} /> Seamless texture</span>
        <span className="node-code">TILE</span>
      </div>

      {nodeData.outputUrl ? (
        <div className="seamless-preview">
          <InspectablePreview
            className="seamless-preview-main"
            ariaLabel="Inspect seamless texture"
            title="Drag to move, click to inspect"
            onInspect={() => nodeData.onOpen?.(nodeData.outputUrl!, nodeData.title, nodeData.sourceUrl)}
          >
            <img src={nodeData.outputUrl} alt="Seamless texture" draggable={false} />
            <Expand size={13} />
          </InspectablePreview>
          <div className="tile-repeat-preview" style={{ backgroundImage: `url(${nodeData.outputUrl})` }} title="3 by 3 repeat preview" />
          <span className="seam-score"><Check size={10} /> Edge match {nodeData.seamScore ?? 100}%</span>
        </div>
      ) : (
        <div className="seamless-empty"><Grid3X3 size={27} /><span>{busy ? nodeData.progress || 'Generating tile…' : 'Connect a material reference'}</span></div>
      )}

      <div className="node-body seamless-body">
        <div className="node-title-row"><h3>{nodeData.title}</h3><span className={`status-dot ${nodeData.status}`} /></div>
        <div className="prompt-label nodrag">
          <div className="prompt-label-head"><span>Material description</span><PromptEnhanceButton busy={nodeData.enhancingPrompt} available={nodeData.enhancePromptAvailable} disabled={!nodeData.prompt.trim()} onClick={() => nodeData.onEnhancePrompt?.(id)} /></div>
          <textarea aria-label="Seamless material prompt" rows={3} value={nodeData.prompt} onChange={(event) => nodeData.onPromptChange?.(id, event.target.value)} onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && nodeData.prompt.trim() && !busy) nodeData.onRun?.(id);
          }} placeholder="Weathered red brick, subtle mortar, game-ready stylized material…" />
          {nodeData.enhancePromptError && <span className="prompt-enhance-error" role="alert">{nodeData.enhancePromptError}</span>}
        </div>
        <fieldset className="seamless-settings nodrag" disabled={busy}>
          <label>Resolution<select aria-label="Texture resolution" value={nodeData.settings.outputSize} onChange={(event) => changeSettings({ outputSize: Number(event.target.value) as 512 | 1024 | 2048 })}><option value={512}>512</option><option value={1024}>1024</option><option value={2048}>2048</option></select></label>
          <label>Edge blend<select aria-label="Edge blending amount" value={nodeData.settings.edgeBlend} onChange={(event) => changeSettings({ edgeBlend: Number(event.target.value) as 0.04 | 0.08 | 0.12 | 0.16 })}><option value={0.04}>4%</option><option value={0.08}>8%</option><option value={0.12}>12%</option><option value={0.16}>16%</option></select></label>
        </fieldset>
        {nodeData.error && <p className="node-error"><AlertTriangle size={12} /> {nodeData.error}</p>}
        {busy && <p className="node-progress"><LoaderCircle className="spin" size={12} /> {nodeData.progress || 'Working…'}</p>}
        <div className="node-button-row nodrag">
          <button className="node-action primary seamless-run" disabled={!busy && !nodeData.prompt.trim()} onClick={() => busy ? nodeData.onCancel?.(id) : nodeData.onRun?.(id)}>{busy ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />} {busy ? 'Stop' : nodeData.outputUrl ? 'Regenerate' : 'Generate seamless'}</button>
          {nodeData.outputUrl && <button className="icon-button" title="Branch from seamless texture" aria-label="Branch from seamless texture" onClick={() => nodeData.onBranch?.(id, 'baseColor')}><Plus size={14} /></button>}
        </div>
      </div>

      {nodeData.outputUrl && <div className="seamless-output-actions nodrag">
        <button title="Download texture" aria-label="Download seamless texture" onClick={() => nodeData.onDownload?.(id)}><Download size={11} /> PNG</button>
        <button className="danger" title="Move texture to trash" aria-label="Move seamless texture to trash" onClick={() => nodeData.onDelete?.(id)}><Trash2 size={11} /></button>
      </div>}
      <Handle type="source" id="baseColor" position={Position.Right} className={`flow-handle output-handle seamless-output-handle ${nodeData.outputUrl ? 'ready' : ''}`} aria-label="Seamless base color output" />
    </article>
  );
}
