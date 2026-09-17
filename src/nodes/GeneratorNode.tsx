import { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  ArrowUpRight,
  Box,
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
import type { GeneratorNodeData } from '../types';
import { PromptEnhanceButton } from '../components/PromptEnhanceButton';

export default function GeneratorNode({ id, data, selected }: NodeProps) {
  const nodeData = data as GeneratorNodeData;
  const busy = nodeData.status === 'queued' || nodeData.status === 'running';
  const hasOutput = Boolean(nodeData.outputUrl);
  const isEditing = nodeData.isConfigOpen ?? (!hasOutput && !busy);

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

  return (
    <div className={`customuse-node-wrapper ${selected ? 'is-selected' : ''}`}>
      {/* Floating micro-label above the card (Customuse style) */}
      <div className="node-floating-label">
        <Sparkles size={12} />
        <span>{nodeData.title || 'Generate image'}</span>
        {busy && <span className="floating-status-pill">Generating…</span>}
      </div>

      <Handle type="target" position={Position.Left} className="flow-handle input-handle" />

      {busy ? (
        /* PHASE 2: GENERATING STATE (Minimalist loader) */
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
      ) : hasOutput && !isEditing ? (
        /* PHASE 3: RESULT STATE (Pure image card with 1-click Regenerate) */
        <article className={`clean-asset-card mode-ready ${selected ? 'is-selected' : ''}`}>
          <div
            className="asset-image-wrap nodrag"
            onClick={() => nodeData.onOpen?.(nodeData.outputUrl!, nodeData.title, nodeData.sourceUrl)}
            title="Click to inspect full resolution"
          >
            <img src={nodeData.outputUrl} alt={nodeData.title} draggable={false} />
          </div>

          {/* Hover action overlay */}
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
              <button
                title="Edit parameters"
                onClick={() => nodeData.onToggleConfig?.(id, true)}
                aria-label="Edit parameters"
              >
                <SlidersHorizontal size={12} />
              </button>
              <button
                title="Inspect image"
                onClick={() => nodeData.onOpen?.(nodeData.outputUrl!, nodeData.title, nodeData.sourceUrl)}
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
                className="danger"
                title="Delete node"
                onClick={() => nodeData.onDelete?.(id)}
                aria-label="Delete node"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </article>
      ) : (
        /* PHASE 1: CONFIG STATE (Compact parameters form) */
        <article className={`clean-config-card ${selected ? 'is-selected' : ''}`}>
          <div className="clean-config-header nodrag">
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
    </div>
  );
}
