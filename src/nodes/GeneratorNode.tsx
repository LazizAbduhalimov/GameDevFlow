import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, ArrowUpRight, Box, Check, Download, Expand, ImagePlus, LoaderCircle, Play, Plus, Square, Trash2 } from 'lucide-react';
import type { GeneratorNodeData } from '../types';
import { PromptEnhanceButton } from '../components/PromptEnhanceButton';

export default function GeneratorNode({ id, data, selected }: NodeProps) {
  const nodeData = data as GeneratorNodeData;
  const busy = nodeData.status === 'queued' || nodeData.status === 'running';

  return (
    <article className={`studio-node generator-node status-${nodeData.status} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle input-handle" />
      <div className="node-cap">
        <span className="node-kind"><ImagePlus size={13} /> ImageGen</span>
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

      {nodeData.outputUrl ? (
        <div className="node-image-frame generated-frame">
          <img src={nodeData.outputUrl} alt="Generated result" draggable={false} />
          <span className="result-chip"><Check size={11} /> Local PNG</span>
          <div className="image-file-actions nodrag">
            <button title="Inspect full resolution" aria-label="Inspect generated PNG" onClick={() => nodeData.onOpen?.(nodeData.outputUrl!, nodeData.title, nodeData.sourceUrl)}>
              <Expand size={13} /><span>Inspect</span>
            </button>
            <button title="Save PNG to Downloads" aria-label="Save generated PNG" onClick={() => nodeData.onDownload?.(id)}>
              <Download size={13} /><span>Save</span>
            </button>
            <button title="Open Tripo Studio with this image attached" aria-label="Send generated PNG to Tripo Studio" disabled={nodeData.tripoBusy} onClick={() => nodeData.onOpenTripo?.(nodeData.outputUrl!)}>
              {nodeData.tripoBusy ? <LoaderCircle className="spin" size={13} /> : <Box size={13} />}<span>Tripo</span>
            </button>
            <button className="danger" title="Delete this local PNG" aria-label="Delete generated PNG" onClick={() => nodeData.onDelete?.(id)}>
              <Trash2 size={13} /><span>Delete</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="generator-signal" aria-hidden="true">
          <span /><span /><span /><span />
          <div>{busy ? <LoaderCircle className="spin" size={25} /> : <ImagePlus size={24} />}</div>
        </div>
      )}

      <div className="node-body">
        <div className="node-title-row">
          <h3>{nodeData.title}</h3>
          <span className={`status-dot ${nodeData.status}`} />
        </div>
        <div className="prompt-label nodrag">
          <div className="prompt-label-head"><span>Instruction</span><PromptEnhanceButton busy={nodeData.enhancingPrompt} available={nodeData.enhancePromptAvailable} disabled={!nodeData.prompt.trim()} onClick={() => nodeData.onEnhancePrompt?.(id)} /></div>
          <textarea
            aria-label="Image generation instruction"
            value={nodeData.prompt}
            onChange={(event) => nodeData.onPromptChange?.(id, event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && nodeData.prompt.trim() && !busy) nodeData.onRun?.(id);
            }}
            placeholder="Turn the character to the left, preserve every costume detail…"
            rows={4}
          />
          {nodeData.enhancePromptError && <span className="prompt-enhance-error" role="alert">{nodeData.enhancePromptError}</span>}
        </div>
        <select className="prompt-preset-select nodrag" defaultValue="" aria-label="Apply prompt preset" onChange={(event) => {
          if (event.target.value) nodeData.onApplyPreset?.(id, event.target.value);
          event.target.value = '';
        }}>
          <option value="">+ Prompt preset</option>
          <option value="identity">Preserve identity</option>
          <option value="transparent">Transparent background</option>
          <option value="concept">Game concept art</option>
          <option value="icon">Inventory icon</option>
          <option value="variation">Controlled variation</option>
        </select>
        {nodeData.error && <p className="node-error"><AlertTriangle size={12} /> {nodeData.error}</p>}
        {busy && <p className="node-progress"><LoaderCircle className="spin" size={12} /> {nodeData.progress || 'Working…'}</p>}
        <div className="node-button-row nodrag">
          <button className="node-action primary" disabled={!busy && !nodeData.prompt.trim()} onClick={() => busy ? nodeData.onCancel?.(id) : nodeData.onRun?.(id)}>
            {busy ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />} {busy ? 'Stop after current' : nodeData.outputUrl ? 'Run again' : 'Run prompt'}
          </button>
          {nodeData.outputUrl && (
            <button className="icon-button" title="Branch from this result" aria-label="Branch from this result" onClick={() => nodeData.onBranch?.(id)}>
              <Plus size={14} /><ArrowUpRight size={12} />
            </button>
          )}
        </div>
      </div>
      {nodeData.outputUrl && <Handle type="source" position={Position.Right} className="flow-handle output-handle" />}
    </article>
  );
}
