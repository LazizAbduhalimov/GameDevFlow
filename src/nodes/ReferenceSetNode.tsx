import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ArrowUpRight, Images, Layers3, Plus } from 'lucide-react';
import { InspectablePreview } from '../components/InspectablePreview';
import type { ReferenceSetNodeData } from '../types';

export default function ReferenceSetNode({ id, data, selected }: NodeProps) {
  const nodeData = data as ReferenceSetNodeData;
  const items = nodeData.items || [];
  const visibleItems = items.slice(0, 6);

  return (
    <article className={`studio-node reference-set-node ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle input-handle reference-input-handle" aria-label="Grouped reference inputs" />
      <div className="node-cap">
        <span className="node-kind"><Images size={13} /> Reference set</span>
        <span className="node-code">{items.length} REF</span>
      </div>

      <div className={`reference-set-grid count-${Math.min(visibleItems.length, 6)}`}>
        {visibleItems.map((item, index) => (
          <InspectablePreview
            className="reference-set-item"
            key={item.id}
            ariaLabel={`Inspect reference ${index + 1}: ${item.title}`}
            title="Drag to move, click to inspect"
            onInspect={() => nodeData.onOpen?.(item.imageUrl, item.title)}
          >
            <img src={item.imageUrl} alt={item.title} draggable={false} />
            <span>{String(index + 1).padStart(2, '0')}</span>
            {index === 5 && items.length > 6 && <strong>+{items.length - 6}</strong>}
          </InspectablePreview>
        ))}
      </div>

      <div className="node-body">
        <div className="node-title-row"><h3>{nodeData.title}</h3><span className="reference-count">{items.length} images</span></div>
        <p>One output carries every reference image.</p>
        <button type="button" className="node-action primary nodrag" onClick={() => nodeData.onBranch?.(id, 'all')}><Plus size={13} /> Branch with all <ArrowUpRight size={12} /></button>
      </div>

      <div className="reference-all-output nodrag">
        <span><Layers3 size={12} /> All references</span>
        <small>{items.length} attached</small>
        <Handle type="source" id="all" position={Position.Right} className="flow-handle output-handle reference-all-handle" aria-label="All reference images output" />
      </div>
    </article>
  );
}
