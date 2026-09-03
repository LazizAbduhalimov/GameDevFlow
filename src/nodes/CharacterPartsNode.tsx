import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Archive, Check, Download, Expand, ImagePlus, Layers3, LoaderCircle, Play, Plus, RefreshCw, Scissors, ShieldCheck, Square, Trash2, Zap } from 'lucide-react';
import { characterPartKeys } from '../character-parts';
import type { CharacterPartKey, CharacterPartsNodeData } from '../types';

export default function CharacterPartsNode({ id, data, selected }: NodeProps) {
  const nodeData = data as CharacterPartsNodeData;
  const parts = characterPartKeys.map((key) => nodeData.parts[key]);
  const ready = parts.filter((part) => part.outputUrl && part.normalized).length;
  const busy = parts.some((part) => part.status === 'queued' || part.status === 'running');
  const inputCount = nodeData.inputUrls?.length || 0;
  const mode = nodeData.generationMode || 'fast';

  return (
    <article className={`studio-node character-parts-node ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle input-handle parts-input-handle" aria-label="One image or All Views input" />
      <div className="node-cap parts-cap">
        <span className="node-kind"><Scissors size={13} /> Character parts</span>
        <select className="node-provider-select nodrag" aria-label="Image provider" value={nodeData.provider || 'global'} onChange={(event) => nodeData.onProviderChange?.(id, event.target.value as 'global' | 'codex' | 'gemini')}>
          <option value="global">Auto · Codex</option>
          <option value="codex">Codex</option>
          <option value="gemini" disabled>Gemini · unavailable</option>
        </select>
      </div>

      <div className="parts-source-strip nodrag">
        <span><ImagePlus size={11} /> Source canvas</span>
        <small>{inputCount === 4 ? 'Front + 3 identity refs' : inputCount === 1 ? 'Single image' : 'Connect image or All Views'}</small>
      </div>

      <div className="parts-mode-row nodrag">
        <span>Execution</span>
        <div>
          <button className={mode === 'reliable' ? 'active' : ''} disabled={busy} onClick={() => nodeData.onModeChange?.(id, 'reliable')} title="Generate one layer at a time"><ShieldCheck size={10} /> Reliable</button>
          <button className={mode === 'fast' ? 'active' : ''} disabled={busy} onClick={() => nodeData.onModeChange?.(id, 'fast')} title="Generate two layers in parallel"><Zap size={10} /> Fast</button>
        </div>
      </div>

      <div className="parts-list">
        {parts.map((part, index) => <PartRow key={part.key} id={id} partKey={part.key} index={index} data={nodeData} />)}
      </div>

      <div className={`all-parts-output nodrag ${ready === parts.length ? 'ready' : ''}`}>
        <span><Layers3 size={12} /> All parts</span>
        <small>{ready} / {parts.length} aligned</small>
        <Handle type="source" id="all" position={Position.Right} aria-label="All character parts output" title={ready === parts.length ? 'Pass all aligned layers' : 'Generate every layer first'} className="flow-handle output-handle all-parts-handle" />
      </div>

      <div className="node-body parts-controls">
        <div className="node-title-row"><h3>{nodeData.title}</h3><span className="parts-ready-count">{ready} layers</span></div>
        <label className="prompt-label nodrag"><span>Separation notes</span><textarea value={nodeData.notes} onChange={(event) => nodeData.onNotesChange?.(id, event.target.value)} rows={2} placeholder="Optional: scarf belongs to Top, belt belongs to Pants…" /></label>
        {nodeData.error && <p className="node-error">{nodeData.error}</p>}
        <div className="node-button-row nodrag">
          <button className="node-action primary parts-primary" disabled={busy || !inputCount} onClick={() => nodeData.onRunAll?.(id, false)}><Play size={12} fill="currentColor" /> Separate all</button>
          <button className="node-action" disabled={busy || ready === parts.length || !inputCount} onClick={() => nodeData.onRunAll?.(id, true)}>Run missing</button>
        </div>
        <div className="node-export-row nodrag">
          <button disabled={!ready} onClick={() => nodeData.onExportParts?.(id)}><Archive size={11} /> Export layers</button>
          <button disabled={!ready} onClick={() => nodeData.onDownloadManifest?.(id)}><Download size={11} /> Positions JSON</button>
        </div>
      </div>
    </article>
  );
}

function PartRow({ id, partKey, index, data }: { id: string; partKey: CharacterPartKey; index: number; data: CharacterPartsNodeData }) {
  const part = data.parts[partKey];
  const busy = part.status === 'queued' || part.status === 'running';
  return (
    <section className={`part-row status-${part.status} ${part.normalized ? 'is-aligned' : ''}`}>
      <div className="part-index">{String(index + 1).padStart(2, '0')}</div>
      {part.outputUrl ? <button className="part-preview nodrag" onClick={() => data.onOpen?.(part.outputUrl!, `${data.title} · ${part.title}`, part.sourceUrl)}><img src={part.outputUrl} alt={`${part.title} transparent layer`} draggable={false} /><Expand size={11} /></button> : <div className="part-preview part-empty">{busy ? <LoaderCircle className="spin" size={15} /> : <Scissors size={14} />}</div>}
      <div className="part-copy"><strong>{part.title}</strong><span>{busy ? part.progress || part.status : part.normalized ? `${part.geometry?.bounds.width || 0}×${part.geometry?.bounds.height || 0} px bounds` : part.error || part.description}</span></div>
      <div className="part-actions nodrag">
        {part.outputUrl && <button className="part-use" title="Create connected Image node" onClick={() => data.onExtractPart?.(id, part.key)}><Plus size={10} /><span>Use</span></button>}
        <button title={busy ? 'Stop layer' : part.outputUrl ? 'Regenerate layer' : 'Generate layer'} onClick={() => busy ? data.onCancelPart?.(id, part.key) : data.onRunPart?.(id, part.key)}>{busy ? <Square size={10} /> : part.outputUrl ? <RefreshCw size={10} /> : <Play size={10} />}</button>
        {part.outputUrl && <><button title="Download transparent PNG" onClick={() => data.onDownloadPart?.(id, part.key)}><Download size={10} /></button><button className="danger" title="Move layer to trash" onClick={() => data.onDeletePart?.(id, part.key)}><Trash2 size={10} /></button></>}
      </div>
      {part.normalized && <span className="part-aligned-badge" title="Same canvas and top-left anchor as source"><Check size={9} /> aligned</span>}
      <Handle type="source" id={part.key} position={Position.Right} aria-label={`${part.title} layer output`} title={`${part.title} transparent layer`} className={`flow-handle output-handle part-handle ${part.normalized ? 'ready' : ''}`} />
    </section>
  );
}
