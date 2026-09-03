import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ArrowUpRight, Box, Expand, Image as ImageIcon, LoaderCircle, Plus } from 'lucide-react';
import type { ImageNodeData } from '../types';

export default function ImageNode({ id, data, selected }: NodeProps) {
  const nodeData = data as ImageNodeData;
  return (
    <article className={`studio-node image-node ${selected ? 'is-selected' : ''}`}>
      {nodeData.hasInput && <Handle type="target" position={Position.Left} className="flow-handle input-handle" aria-label="Derived image input" />}
      <div className="node-cap">
        <span className="node-kind"><ImageIcon size={13} /> Source</span>
        <span className="node-code">IMG</span>
      </div>
      <button className="node-image-frame node-image-button nodrag" onClick={() => nodeData.onOpen?.(nodeData.imageUrl, nodeData.title)} aria-label={`Inspect ${nodeData.title}`}>
        <img src={nodeData.imageUrl} alt={nodeData.title} draggable={false} />
        <span className="image-index">01</span>
        <span className="inspect-chip"><Expand size={11} /> Inspect</span>
      </button>
      <div className="node-body">
        <h3>{nodeData.title}</h3>
        <p title={nodeData.fileName}>{nodeData.fileName}</p>
        <div className="image-node-actions nodrag">
          <button className="node-action" onClick={() => nodeData.onBranch?.(id)}><Plus size={14} /> Branch generation <ArrowUpRight size={13} /></button>
          <button className="node-action tripo-action" disabled={nodeData.tripoBusy} onClick={() => nodeData.onOpenTripo?.(nodeData.imageUrl)} title="Open Tripo Studio with this image attached">
            {nodeData.tripoBusy ? <LoaderCircle className="spin" size={13} /> : <Box size={13} />} {nodeData.tripoBusy ? 'Opening…' : 'Tripo 3D'}
          </button>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="flow-handle output-handle" />
    </article>
  );
}
