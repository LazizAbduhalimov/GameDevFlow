import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Box, Check, Component, Download, Expand, Grid3X3, ImagePlus, LoaderCircle, SlidersHorizontal, Trash2 } from 'lucide-react';
import { InspectablePreview } from '../components/InspectablePreview';
import type { SpriteAtlasNodeData } from '../types';

export default function SpriteAtlasNode({ id, data, selected }: NodeProps) {
  const nodeData = data as SpriteAtlasNodeData;
  const settings = nodeData.settings;
  const busy = nodeData.status === 'building';
  const previewUrl = nodeData.previewUrl || nodeData.outputUrl;
  const validation = nodeData.validation;
  const issueList = validation?.issues || [];
  const inputCount = nodeData.inputUrls?.length || 0;
  const change = (patch: Partial<typeof settings>) => nodeData.onSettingsChange?.(id, patch);

  return (
    <article className={`studio-node sprite-atlas-node status-${nodeData.status} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle input-handle" aria-label="Collection or image input" />
      <div className="node-cap">
        <span className="node-kind"><Grid3X3 size={13} /> Sprite atlas</span>
        <span className="node-code">ATLAS</span>
      </div>

      <div className="atlas-input-label"><ImagePlus size={11} /><span>Input</span><small>{inputCount ? `${inputCount} image${inputCount === 1 ? '' : 's'}` : 'Connect collection or image'}</small></div>
      <div className="atlas-preview">
        {previewUrl ? (
          <InspectablePreview
            className="atlas-preview-button"
            ariaLabel="Open atlas preview"
            title="Drag to move, click to inspect"
            onInspect={() => nodeData.onOpen?.(previewUrl, `${nodeData.title} preview`)}
          >
            <img src={previewUrl} alt="Sprite atlas preview" draggable={false} />
            <Expand size={14} />
          </InspectablePreview>
        ) : <div className="atlas-preview-empty" aria-hidden="true"><Grid3X3 size={28} /><span>Atlas preview</span></div>}
        {busy && <span className="atlas-building"><LoaderCircle className="spin" size={13} /> Building atlas…</span>}
      </div>

      <fieldset className="atlas-settings nodrag" disabled={busy}>
        <legend><SlidersHorizontal size={11} /> Atlas settings</legend>
        <label>Cell <select aria-label="Cell size in pixels" value={settings.cellSize} onChange={(event) => change({ cellSize: Number(event.target.value) as typeof settings.cellSize })}><option value={64}>64</option><option value={128}>128</option><option value={256}>256</option><option value={512}>512</option></select><small>px</small></label>
        <label>Gutter <input aria-label="Gutter in pixels" type="number" min="0" value={settings.gutter} onChange={(event) => change({ gutter: Number(event.target.value) })} /><small>px</small></label>
        <label>Columns <input aria-label="Atlas columns" type="number" min="1" placeholder="Auto" value={settings.columns === 'auto' ? '' : settings.columns} onChange={(event) => change({ columns: event.target.value ? Number(event.target.value) : 'auto' })} /></label>
        <label>Safe area <select aria-label="Safe area occupancy" value={settings.safeArea} onChange={(event) => change({ safeArea: Number(event.target.value) })}><option value={0.7}>70</option><option value={0.8}>80</option><option value={0.9}>90</option></select><small>%</small></label>
        <label className="atlas-toggle"><input aria-label="Use pixel art sampling" type="checkbox" checked={settings.pixelArt} onChange={(event) => change({ pixelArt: event.target.checked })} /><span>Pixel art</span></label>
        <label className="atlas-toggle"><input aria-label="Force power of two dimensions" type="checkbox" checked={settings.powerOfTwo} onChange={(event) => change({ powerOfTwo: event.target.checked })} /><span>Power of two</span></label>
      </fieldset>

      <div className="atlas-validation" aria-live="polite">
        {issueList.length ? issueList.map((item, index) => <p key={`${item}-${index}`} className="error"><AlertTriangle size={10} /> {item}</p>) : <p className="ok"><Check size={10} /> {validation ? `${validation.valid} / ${validation.total} images valid` : 'Ready to build'}</p>}
        {nodeData.error && <p className="error"><AlertTriangle size={10} /> {nodeData.error}</p>}
      </div>

      <div className="atlas-actions nodrag">
        <button type="button" className="node-action primary" disabled={busy || !inputCount} onClick={() => nodeData.onBuild?.(id)}>{busy ? <LoaderCircle className="spin" size={12} /> : <Grid3X3 size={12} />} Build &amp; save</button>
      </div>

      {nodeData.outputUrl && <div className="atlas-output nodrag">
        <span><Check size={11} /> Atlas PNG</span>
        <div>
          <button type="button" title="Download atlas PNG" aria-label="Download atlas PNG" onClick={() => nodeData.onDownloadPng?.(id)}><Download size={11} /></button>
          <button type="button" title="Download atlas JSON" aria-label="Download atlas JSON" disabled={!nodeData.manifest} onClick={() => nodeData.onDownloadJson?.(id)}><Download size={11} /><small>JSON</small></button>
          <button type="button" title="Open atlas" aria-label="Open atlas" onClick={() => nodeData.onOpen?.(nodeData.outputUrl!, `${nodeData.title} atlas`)}><Expand size={11} /></button>
          <button type="button" title="Open atlas PNG in Tripo Studio" aria-label="Send atlas PNG to Tripo Studio" disabled={nodeData.tripoBusy} onClick={() => nodeData.onOpenTripo?.(nodeData.outputUrl!)}>{nodeData.tripoBusy ? <LoaderCircle className="spin" size={11} /> : <Box size={11} />}</button>
          <button type="button" title="Send atlas PNG to Unity" aria-label="Send atlas PNG to Unity" disabled={nodeData.unityBusy} onClick={() => nodeData.onSendToUnity?.(nodeData.outputUrl!)}>{nodeData.unityBusy ? <LoaderCircle className="spin" size={11} /> : <Component size={11} />}</button>
          <button type="button" className="danger" title="Move atlas to trash" aria-label="Move atlas to trash" onClick={() => nodeData.onDelete?.(id)}><Trash2 size={11} /></button>
        </div>
        <Handle type="source" position={Position.Right} aria-label="Atlas PNG output" title="Atlas PNG output" className="flow-handle output-handle atlas-output-handle" />
      </div>}
    </article>
  );
}
