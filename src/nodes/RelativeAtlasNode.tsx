import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Box, Check, Download, Expand, ImagePlus, LoaderCircle, Scaling, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { RelativeAtlasNodeData } from '../types';

export default function RelativeAtlasNode({ id, data, selected }: NodeProps) {
  const nodeData = data as RelativeAtlasNodeData;
  const settings = nodeData.settings;
  const busy = nodeData.status === 'building';
  const previewUrl = nodeData.previewUrl || nodeData.outputUrl;
  const issues = nodeData.validation?.issues || [];
  const inputCount = nodeData.inputUrls?.length || 0;
  const change = (patch: Partial<typeof settings>) => nodeData.onSettingsChange?.(id, patch);

  return <article className={`studio-node relative-atlas-node status-${nodeData.status} ${selected ? 'is-selected' : ''}`}>
    <Handle type="target" position={Position.Left} className="flow-handle input-handle relative-atlas-handle" aria-label="Collection or image input" />
    <div className="node-cap relative-atlas-cap"><span className="node-kind"><Scaling size={13} /> Relative atlas</span><span className="node-code">PACK</span></div>
    <div className="atlas-input-label"><ImagePlus size={11} /><span>Input</span><small>{inputCount ? `${inputCount} object${inputCount === 1 ? '' : 's'} · shared scale` : 'Connect transparent objects'}</small></div>
    <div className="atlas-preview relative-atlas-preview">
      {previewUrl ? <button type="button" className="atlas-preview-button nodrag" onClick={() => nodeData.onOpen?.(previewUrl, `${nodeData.title} preview`)}><img src={previewUrl} alt="Relative atlas preview" draggable={false} /><Expand size={14} /></button> : <div className="atlas-preview-empty"><Scaling size={28} /><span>Relative packing</span><small>Sizes stay proportional</small></div>}
      {busy && <span className="atlas-building"><LoaderCircle className="spin" size={13} /> Packing at one scale…</span>}
    </div>
    <fieldset className="atlas-settings nodrag relative-atlas-settings" disabled={busy}>
      <legend><SlidersHorizontal size={11} /> Packing settings</legend>
      <label>Canvas <select value={settings.canvasSize} onChange={(event) => change({ canvasSize: Number(event.target.value) as typeof settings.canvasSize })}><option value={512}>512</option><option value={1024}>1024</option><option value={2048}>2048</option></select><small>px</small></label>
      <label>Padding <input type="number" min="0" value={settings.padding} onChange={(event) => change({ padding: Number(event.target.value) })} /><small>px</small></label>
      <label>Margin <input type="number" min="0" value={settings.outerMargin} onChange={(event) => change({ outerMargin: Number(event.target.value) })} /><small>px</small></label>
      <label className="atlas-toggle"><input type="checkbox" checked={settings.pixelArt} onChange={(event) => change({ pixelArt: event.target.checked })} /><span>Pixel art</span></label>
    </fieldset>
    <div className="relative-atlas-note"><Scaling size={11} /> One scale for every source — object proportions are preserved.</div>
    <div className="atlas-validation" aria-live="polite">
      {issues.length ? issues.map((item, index) => <p key={`${item}-${index}`} className="error"><AlertTriangle size={10} /> {item}</p>) : <p className="ok"><Check size={10} /> {nodeData.validation ? `${nodeData.validation.valid} / ${nodeData.validation.total} objects packed` : 'Ready for transparent objects'}</p>}
      {nodeData.error && <p className="error"><AlertTriangle size={10} /> {nodeData.error}</p>}
    </div>
    <div className="atlas-actions nodrag"><button type="button" className="node-action primary relative-atlas-build" disabled={busy || !inputCount} onClick={() => nodeData.onBuild?.(id)}>{busy ? <LoaderCircle className="spin" size={12} /> : <Scaling size={12} />} Pack &amp; save</button></div>
    {nodeData.outputUrl && <div className="atlas-output relative-atlas-output nodrag"><span><Check size={11} /> Relative PNG</span><div><button type="button" title="Download PNG" onClick={() => nodeData.onDownloadPng?.(id)}><Download size={11} /></button><button type="button" title="Download JSON" disabled={!nodeData.manifest} onClick={() => nodeData.onDownloadJson?.(id)}><Download size={11} /><small>JSON</small></button><button type="button" title="Open atlas" onClick={() => nodeData.onOpen?.(nodeData.outputUrl!, `${nodeData.title} atlas`)}><Expand size={11} /></button><button type="button" title="Open in Tripo" disabled={nodeData.tripoBusy} onClick={() => nodeData.onOpenTripo?.(nodeData.outputUrl!)}>{nodeData.tripoBusy ? <LoaderCircle className="spin" size={11} /> : <Box size={11} />}</button><button type="button" className="danger" title="Move to trash" onClick={() => nodeData.onDelete?.(id)}><Trash2 size={11} /></button></div><Handle type="source" position={Position.Right} className="flow-handle output-handle relative-atlas-handle" aria-label="Relative atlas output" /></div>}
  </article>;
}
