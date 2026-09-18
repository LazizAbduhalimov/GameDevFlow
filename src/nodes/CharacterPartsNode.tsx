import { useEffect, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Check, ImagePlus, LoaderCircle, Play, Plus, ScanSearch, Scissors, Sparkles, Trash2 } from 'lucide-react';
import { characterPartHandle, MAX_CHARACTER_PARTS, selectedCharacterParts } from '../character-parts';
import type { CharacterPartCandidate, CharacterPartsNodeData } from '../types';

export default function CharacterPartsNode({ id, data, selected }: NodeProps) {
  const nodeData = data as CharacterPartsNodeData;
  const parts = nodeData.parts || [];
  const selectedParts = selectedCharacterParts(parts);
  const busy = nodeData.status === 'analyzing';
  const reviewReady = parts.length > 0 && nodeData.status !== 'analyzing';
  const inputCount = nodeData.inputUrls?.length || 0;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    if (nodeData.status !== 'analyzing') {
      setElapsedSeconds(0);
      return undefined;
    }
    const started = Date.parse(nodeData.analysisProgress?.startedAt || '') || Date.now();
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [nodeData.status, nodeData.analysisProgress?.startedAt]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, parts.length, updateNodeInternals]);
  const elapsed = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`;

  return (
    <div className={`customuse-node-wrapper ${selected ? 'is-selected' : ''}`}>
      <div className="node-floating-label">
        <Scissors size={12} />
        <span>{nodeData.title || 'Character parts'}</span>
        {parts.length > 0 && <span className="floating-status-pill">{selectedParts.length}/{parts.length}</span>}
      </div>
      <article className={`studio-node character-parts-node status-${nodeData.status} ${selected ? 'is-selected' : ''}`}>
        <Handle type="target" position={Position.Left} className="flow-handle input-handle parts-input-handle" aria-label="One image or All Views input" />

        <div className="node-cap parts-cap">
          <span className="node-kind"><Scissors size={13} /> Props extraction</span>
          <select className="node-provider-select nodrag" aria-label="Image provider" value={nodeData.provider || 'global'} onChange={(event) => nodeData.onProviderChange?.(id, event.target.value as 'global' | 'codex' | 'gemini')}>
            <option value="global">Auto · Codex</option>
            <option value="codex">Codex</option>
            <option value="gemini" disabled>Gemini · unavailable</option>
          </select>
        </div>

        <div className="parts-source-strip nodrag">
          <span><ImagePlus size={11} /> Source</span>
          <small>{inputCount === 4 ? 'Front + 3 identity refs' : inputCount === 1 ? 'Single image' : 'Connect image or All Views'}</small>
        </div>

        {!reviewReady ? (
          <div className="parts-analyze-panel nodrag">
            <ScanSearch size={22} />
            <strong>Detect extractable props</strong>
            <p>Codex inspects the character and proposes parts you can turn into 4-view props. Review the list before generating.</p>
            {busy ? (
              <div className="parts-analysis-progress" role="status" aria-live="polite">
                <div className="smart-progress-meta"><span>{nodeData.analysisProgress?.message || 'Inspecting character…'}</span><strong>{elapsed}</strong></div>
                <div className="smart-progress-track"><i style={{ transform: 'scaleX(.55)' }} /></div>
              </div>
            ) : (
              <label className="prompt-label"><span>Guidance</span><textarea value={nodeData.notes} onChange={(event) => nodeData.onNotesChange?.(id, event.target.value)} rows={2} placeholder="Optional: extract armor pieces, ignore pouches…" /></label>
            )}
            {nodeData.error && <p className="node-error">{nodeData.error}</p>}
            <button type="button" className="node-action primary parts-primary" disabled={busy || !inputCount} onClick={() => nodeData.onAnalyze?.(id)}>
              {busy ? <LoaderCircle className="spin" size={12} /> : <Sparkles size={12} />}
              {busy ? `Working · ${elapsed}` : 'Analyze props'}
            </button>
          </div>
        ) : (
          <>
            <section className="parts-character-copy nodrag">
              <span>Character</span>
              <textarea value={nodeData.characterDescription} onChange={(event) => nodeData.onDescriptionChange?.(id, event.target.value)} rows={3} placeholder="Short character description from analysis" />
            </section>
            <div className="parts-review-heading nodrag">
              <div>
                <strong>{selectedParts.length} of {parts.length} selected</strong>
                <span>{parts.length} proposed props</span>
              </div>
              <button type="button" disabled={busy} onClick={() => nodeData.onSelectAll?.(id, selectedParts.length !== parts.length)}>
                {selectedParts.length === parts.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="parts-item-list nodrag nowheel">
              {parts.map((part) => (
                <PartRow key={part.id} id={id} part={part} data={nodeData} />
              ))}
            </div>
            <button
              type="button"
              className="parts-add-row nodrag"
              disabled={busy || parts.length >= MAX_CHARACTER_PARTS}
              onClick={() => nodeData.onAddPart?.(id)}
            >
              <Plus size={12} /> Add a part from the image
            </button>
            <label className="prompt-label parts-notes nodrag"><span>Guidance</span><textarea value={nodeData.notes} onChange={(event) => nodeData.onNotesChange?.(id, event.target.value)} rows={2} placeholder="Optional notes for analyze and generate" /></label>
            {nodeData.error && <p className="node-error">{nodeData.error}</p>}
            <div className="parts-build-bar nodrag">
              <button type="button" className="node-action" disabled={busy || !inputCount} onClick={() => nodeData.onAnalyze?.(id)}>
                <ScanSearch size={12} /> Re-analyze
              </button>
              <button type="button" className="node-action primary parts-primary" disabled={busy || !inputCount || !selectedParts.length} onClick={() => nodeData.onGenerateSelected?.(id)}>
                <Play size={12} fill="currentColor" /> Generate {selectedParts.length} selected prop{selectedParts.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}

        <Handle type="source" id="all" position={Position.Right} aria-label="Pass source identity images" title="Pass the connected character identity images" className={`flow-handle output-handle all-parts-handle ${inputCount ? 'ready' : ''}`} />
      </article>
    </div>
  );
}

function PartRow({ id, part, data }: { id: string; part: CharacterPartCandidate; data: CharacterPartsNodeData }) {
  return (
    <div className={`parts-item-row ${part.enabled ? 'is-enabled' : ''}`}>
      <button type="button" className={`parts-toggle ${part.enabled ? 'is-on' : ''}`} title={part.enabled ? 'Exclude this prop' : 'Include this prop'} onClick={() => data.onTogglePart?.(id, part.id)} aria-pressed={part.enabled}>
        <span />
      </button>
      <input aria-label="Prop name" value={part.name} onChange={(event) => data.onPatchPart?.(id, part.id, { name: event.target.value })} />
      {part.enabled ? <Check size={13} className="parts-selected-mark" /> : <span className="parts-selected-spacer" />}
      <button type="button" className="danger" title="Remove this prop" onClick={() => data.onRemovePart?.(id, part.id)}><Trash2 size={12} /></button>
      <Handle type="source" id={characterPartHandle(part.id)} position={Position.Right} aria-label={`${part.name} identity output`} className={`flow-handle output-handle part-handle ${part.enabled ? 'ready' : ''}`} />
    </div>
  );
}
