import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useState, type MouseEvent } from 'react';
import {
  AlertTriangle,
  Box,
  Component,
  Download,
  Expand,
  Layers3,
  LoaderCircle,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { InspectablePreview } from '../components/InspectablePreview';
import { GenerationHistoryButton, GenerationHistoryPopover } from '../components/GenerationHistoryPopover';
import { PromptEnhanceButton } from '../components/PromptEnhanceButton';
import type { GeneratorNodeData } from '../types';

export default function GeneratorNode({ id, data, selected }: NodeProps) {
  const nodeData = data as GeneratorNodeData;
  const busy = nodeData.status === 'queued' || nodeData.status === 'running';
  const hasOutput = Boolean(nodeData.outputUrl);
  const isEditing = nodeData.isConfigOpen ?? (!hasOutput && !busy);
  const [historyAnchor, setHistoryAnchor] = useState<{ x: number; y: number } | null>(null);
  const revisions = nodeData.revisions || [];

  const presets = [
    { id: 'identity', label: 'Identity' },
    { id: 'transparent', label: 'Transparent' },
    { id: 'concept', label: 'Concept Art' },
    { id: 'icon', label: 'Item Icon' },
    { id: 'variation', label: 'Variation' },
  ];

  function handleRegenerate() {
    if (nodeData.onRegenerate) {
      nodeData.onRegenerate(id);
    } else {
      nodeData.onRun?.(id);
    }
  }

  function openHistory(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setHistoryAnchor({ x: rect.left, y: rect.bottom + 8 });
  }

  function openInspect() {
    if (!nodeData.outputUrl) return;
    nodeData.onOpen?.(nodeData.outputUrl, nodeData.title, nodeData.sourceUrl, {
      revisions: nodeData.revisions,
      activeRevisionId: nodeData.activeRevisionId,
    });
  }

  const resultCard = hasOutput && (
    <article className={`clean-asset-card mode-ready ${selected ? 'is-selected' : ''} ${busy ? 'is-busy' : ''}`}>
      <InspectablePreview
        className="asset-image-wrap"
        title="Drag to move, click to inspect"
        ariaLabel="Inspect generated image"
        disabled={busy}
        onInspect={busy ? undefined : openInspect}
      >
        <img src={nodeData.outputUrl} alt={nodeData.title} draggable={false} />
      </InspectablePreview>
      {busy && (
        <div className="card-busy-overlay">
          <LoaderCircle className="spin" size={22} />
          <span>{nodeData.progress || 'Generating…'}</span>
          <button className="generating-cancel-btn nodrag" onClick={() => nodeData.onCancel?.(id)} title="Stop generation">
            <Square size={10} fill="currentColor" /> Cancel
          </button>
        </div>
      )}

      {!busy && (
        <div className="card-hover-actions nodrag">
          <button
            className="card-btn-regenerate"
            onClick={handleRegenerate}
            title="Regenerate (1-click re-run)"
          >
            <RotateCcw size={12} />
            <span>Regenerate</span>
          </button>

          <div className="card-btn-group">
            <GenerationHistoryButton count={revisions.length} onClick={openHistory} />
            <button
              title="Edit parameters"
              onClick={() => nodeData.onToggleConfig?.(id, true)}
              aria-label="Edit parameters"
            >
              <SlidersHorizontal size={12} />
            </button>
            <button
              title="Inspect image"
              onClick={openInspect}
              aria-label="Inspect image"
            >
              <Expand size={12} />
            </button>
            <button
              title="Branch node"
              onClick={() => nodeData.onBranch?.(id)}
              aria-label="Branch node"
            >
              <Plus size={12} />
            </button>
            <button
              title="Save PNG"
              onClick={() => nodeData.onDownload?.(id)}
              aria-label="Save PNG"
            >
              <Download size={12} />
            </button>
            <button
              title="Tripo 3D"
              disabled={nodeData.tripoBusy}
              onClick={() => nodeData.onOpenTripo?.(nodeData.outputUrl!)}
              aria-label="Tripo 3D"
            >
              {nodeData.tripoBusy ? <LoaderCircle className="spin" size={12} /> : <Box size={12} />}
            </button>
            <button
              title="Send to Unity"
              disabled={nodeData.unityBusy}
              onClick={() => nodeData.onSendToUnity?.(nodeData.outputUrl!)}
              aria-label="Send to Unity"
            >
              {nodeData.unityBusy ? <LoaderCircle className="spin" size={12} /> : <Component size={12} />}
            </button>
            <button
              className="danger"
              title="Delete this version"
              onClick={() => nodeData.onDelete?.(id)}
              aria-label="Delete this version"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}
    </article>
  );

  return (
    <div className={`customuse-node-wrapper ${selected ? 'is-selected' : ''}`}>
      <div className="node-floating-label">
        <Sparkles size={12} />
        <span>{nodeData.title || 'Generate image'}</span>
        {busy && <span className="floating-status-pill">Generating…</span>}
      </div>

      <Handle type="target" position={Position.Left} className="flow-handle input-handle" />

      {busy && !hasOutput ? (
        <article className={`clean-asset-card mode-generating ${selected ? 'is-selected' : ''}`}>
          <div className="card-generating-state">
            <div className="generating-pulse-ring">
              <LoaderCircle className="spin" size={24} />
            </div>
            <span className="generating-label">{nodeData.progress || 'Generating asset…'}</span>
            <button
              className="generating-cancel-btn nodrag"
              onClick={() => nodeData.onCancel?.(id)}
              title="Stop generation"
            >
              <Square size={10} fill="currentColor" /> Cancel
            </button>
          </div>
        </article>
      ) : hasOutput && (busy || !isEditing) ? (
        resultCard
      ) : (
        <article className={`clean-config-card ${selected ? 'is-selected' : ''}`}>
          <div className="clean-config-header">
            <span>
              <Sparkles size={13} style={{ color: 'var(--accent)' }} />
              Instruction
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                className="node-provider-select nodrag"
                aria-label="Image provider"
                value={nodeData.provider || 'global'}
                onChange={(event) => nodeData.onProviderChange?.(id, event.target.value as 'global' | 'codex' | 'gemini')}
              >
                <option value="global">Auto · Codex</option>
                <option value="codex">Codex</option>
                <option value="gemini" disabled>Gemini · n/a</option>
              </select>
              {hasOutput && (
                <button
                  className="clean-icon-close nodrag"
                  title="Close parameters"
                  onClick={() => nodeData.onToggleConfig?.(id, false)}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {Boolean(nodeData.inputCount) && (
            <div className="generator-reference-status">
              <Layers3 size={11} />
              <span>{nodeData.inputCount} reference{nodeData.inputCount === 1 ? '' : 's'} connected</span>
            </div>
          )}

          <div className="clean-config-prompt-wrap nodrag">
            <textarea
              className="clean-config-textarea nodrag"
              aria-label="Image generation instruction"
              value={nodeData.prompt}
              onChange={(event) => nodeData.onPromptChange?.(id, event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && nodeData.prompt.trim() && !busy) {
                  nodeData.onRun?.(id);
                }
              }}
              placeholder="Describe what to generate or transform…"
              rows={3}
              autoFocus={!hasOutput}
            />
            <div className="clean-textarea-actions">
              <PromptEnhanceButton
                busy={nodeData.enhancingPrompt}
                available={nodeData.enhancePromptAvailable}
                disabled={!nodeData.prompt.trim()}
                onClick={() => nodeData.onEnhancePrompt?.(id)}
              />
            </div>
          </div>

          {nodeData.enhancePromptError && (
            <span className="prompt-enhance-error" role="alert">{nodeData.enhancePromptError}</span>
          )}

          <div className="clean-presets-row nodrag">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="clean-preset-pill"
                onClick={() => nodeData.onApplyPreset?.(id, preset.id)}
              >
                + {preset.label}
              </button>
            ))}
          </div>

          {nodeData.error && (
            <p className="node-error"><AlertTriangle size={12} /> {nodeData.error}</p>
          )}

          <div className="clean-config-footer nodrag">
            {hasOutput && (
              <button
                type="button"
                className="clean-btn-secondary"
                onClick={() => nodeData.onToggleConfig?.(id, false)}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              className="clean-btn-primary"
              disabled={!nodeData.prompt.trim()}
              onClick={() => nodeData.onRun?.(id)}
            >
              <Sparkles size={12} />
              <span>{hasOutput ? 'Update & Run' : 'Generate'}</span>
            </button>
          </div>
        </article>
      )}

      {nodeData.outputUrl && (
        <Handle type="source" position={Position.Right} className="flow-handle output-handle" />
      )}

      <GenerationHistoryPopover
        open={Boolean(historyAnchor) && revisions.length > 1}
        anchor={historyAnchor || { x: 0, y: 0 }}
        revisions={revisions}
        activeRevisionId={nodeData.activeRevisionId}
        onRestore={(revisionId) => nodeData.onRestoreRevision?.(id, revisionId)}
        onInspect={openInspect}
        onApplyPrompt={nodeData.onApplyRevisionPrompt ? (prompt) => nodeData.onApplyRevisionPrompt?.(id, prompt) : undefined}
        onClose={() => setHistoryAnchor(null)}
      />
    </div>
  );
}
