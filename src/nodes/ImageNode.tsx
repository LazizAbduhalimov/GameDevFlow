import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, Download, Expand, Image as ImageIcon, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import type { ImageNodeData } from '../types';

export default function ImageNode({ id, data, selected }: NodeProps) {
  const nodeData = data as ImageNodeData;

  return (
    <div className={`customuse-node-wrapper ${selected ? 'is-selected' : ''}`}>
      {/* Floating micro-label above card (Customuse style) */}
      <div className="node-floating-label">
        <ImageIcon size={12} />
        <span>{nodeData.title || nodeData.fileName || 'Source image'}</span>
      </div>

      {nodeData.hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="flow-handle input-handle"
          aria-label="Derived image input"
        />
      )}

      {/* Clean asset squircle card */}
      <article className={`clean-asset-card mode-ready ${selected ? 'is-selected' : ''}`}>
        <div
          className="asset-image-wrap nodrag"
          onClick={() => nodeData.onOpen?.(nodeData.imageUrl, nodeData.title)}
          title={`Inspect ${nodeData.title || 'image'}`}
        >
          <img src={nodeData.imageUrl} alt={nodeData.title || 'Asset'} draggable={false} />
        </div>

        {/* Hover action overlay */}
        <div className="card-hover-actions nodrag">
          <button
            className="card-btn-regenerate"
            onClick={() => nodeData.onBranch?.(id)}
            title="Branch from this asset"
          >
            <Plus size={12} />
            <span>Branch</span>
          </button>

          <div className="card-btn-group">
            <button
              title="Inspect image"
              onClick={() => nodeData.onOpen?.(nodeData.imageUrl, nodeData.title)}
              aria-label="Inspect image"
            >
              <Expand size={12} />
            </button>
            <button
              title="Tripo 3D"
              disabled={nodeData.tripoBusy}
              onClick={() => nodeData.onOpenTripo?.(nodeData.imageUrl)}
              aria-label="Tripo 3D"
            >
              {nodeData.tripoBusy ? <LoaderCircle className="spin" size={12} /> : <Box size={12} />}
            </button>
            {nodeData.onDownload && (
              <button
                title="Save PNG"
                onClick={() => nodeData.onDownload?.(id)}
                aria-label="Save PNG"
              >
                <Download size={12} />
              </button>
            )}
            {nodeData.onDelete && (
              <button
                className="danger"
                title="Delete node"
                onClick={() => nodeData.onDelete?.(id)}
                aria-label="Delete node"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </article>

      <Handle type="source" position={Position.Right} className="flow-handle output-handle" />
    </div>
  );
}
