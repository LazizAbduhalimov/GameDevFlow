import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  ArrowUpRight,
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Component,
  Download,
  Expand,
  Grid2X2,
  ImagePlus,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import { InspectablePreview } from '../components/InspectablePreview';
import { GenerationHistoryButton, GenerationHistoryPopover } from '../components/GenerationHistoryPopover';
import { PromptEnhanceButton } from '../components/PromptEnhanceButton';
import type { MultiGenerateNodeData } from '../types';
import {
  MULTI_ALL_HANDLE,
  MULTI_CURRENT_HANDLE,
  clampVariantCount,
  resolveSelectedVariant,
  stepSelectedVariantKey,
  visibleVariants,
} from '../multi-generate';

export default function MultiGenerateNode({ id, data, selected }: NodeProps) {
  const nodeData = data as MultiGenerateNodeData;
  const count = clampVariantCount(nodeData.variantCount);
  const variants = visibleVariants(nodeData);
  const current = resolveSelectedVariant(nodeData);
  const currentIndex = Math.max(0, variants.findIndex((variant) => variant.key === current?.key));
  const ready = variants.filter((variant) => Boolean(variant.outputUrl)).length;
  const anyBusy = variants.some((variant) => variant.status === 'queued' || variant.status === 'running');
  const currentBusy = current?.status === 'queued' || current?.status === 'running';
  const error = typeof nodeData.error === 'string' ? nodeData.error : current?.error;
  const isEditing = nodeData.isConfigOpen ?? ready === 0;
  const label = current?.title || `Variant ${currentIndex + 1}`;
  const [historyAnchor, setHistoryAnchor] = useState<{ x: number; y: number } | null>(null);
  const revisions = current?.revisions || [];

  function selectKey(key: string) {
    nodeData.onSelectVariant?.(id, key);
  }

  function selectOffset(delta: number) {
    selectKey(stepSelectedVariantKey(nodeData, delta));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectOffset(-1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectOffset(1);
    }
  }

  function openHistory(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setHistoryAnchor({ x: rect.left, y: rect.bottom + 8 });
  }

  function openInspect() {
    if (!current?.outputUrl) return;
    nodeData.onOpen?.(current.outputUrl, `${nodeData.title} · ${label}`, current.sourceUrl, {
      revisions: current.revisions,
      activeRevisionId: current.activeRevisionId,
    });
  }

  return (
    <div className={`customuse-node-wrapper multi-compact-node ${selected ? 'is-selected' : ''}`} tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="node-floating-label">
        <Grid2X2 size={12} />
        <span>{nodeData.title || 'Multi Generate'}</span>
        <span className="floating-status-pill">{ready}/{count}</span>
        {anyBusy && <span className="floating-status-pill">Generating…</span>}
      </div>

      <article className={`multi-compact-card ${selected ? 'is-selected' : ''}`}>
        <div className="multi-stage">
          <Handle type="target" position={Position.Left} className="flow-handle input-handle" aria-label="Source image input" />
          <InspectablePreview
            className={`multi-current-frame ${current?.outputUrl ? 'has-image' : ''} ${currentBusy ? 'is-busy' : ''}`}
            title={current?.outputUrl ? 'Drag to move, click to inspect' : undefined}
            ariaLabel={current?.outputUrl ? `Inspect ${label}` : undefined}
            onInspect={current?.outputUrl ? openInspect : undefined}
          >
            {current?.outputUrl ? (
              <img src={current.outputUrl} alt={`${label} generated image`} draggable={false} />
            ) : (
              <div className="multi-empty">
                {currentBusy ? <LoaderCircle className="spin" size={22} /> : <ImagePlus size={18} />}
                <span>{currentBusy ? (current?.progress || 'Generating…') : label}</span>
              </div>
            )}
            {currentBusy && current?.outputUrl && (
              <div className="multi-busy-overlay">
                <LoaderCircle className="spin" size={18} />
                <span>{current.progress || 'Generating…'}</span>
              </div>
            )}
            {current?.error && !currentBusy && <span className="multi-error" title={current.error} aria-label={`${label} error`}>!</span>}
          </InspectablePreview>

          {current?.outputUrl && (
            <div className="card-hover-actions nodrag">
              <button
                type="button"
                className="card-btn-regenerate"
                title="Create a connected Image node from this variant"
                aria-label={`Use ${label} as a connected Image node`}
                onClick={() => nodeData.onExtractVariant?.(id, current.key)}
              >
                <ArrowUpRight size={12} />
                <span>Use image</span>
              </button>
              <div className="card-btn-group">
                <GenerationHistoryButton count={revisions.length} disabled={currentBusy} onClick={openHistory} />
                <button type="button" title="Inspect image" aria-label={`Inspect ${label}`} onClick={openInspect}>
                  <Expand size={12} />
                </button>
                <button type="button" title="Download PNG" aria-label={`Download ${label} PNG`} onClick={() => nodeData.onDownloadVariant?.(id, current.key)}>
                  <Download size={12} />
                </button>
                <button type="button" title="Open in Tripo Studio" aria-label={`Send ${label} to Tripo Studio`} disabled={nodeData.tripoBusyUrl === current.outputUrl} onClick={() => nodeData.onOpenTripo?.(current.outputUrl!)}>
                  {nodeData.tripoBusyUrl === current.outputUrl ? <LoaderCircle className="spin" size={12} /> : <Box size={12} />}
                </button>
                <button type="button" title="Send to Unity" aria-label={`Send ${label} to Unity`} disabled={nodeData.unityBusyUrl === current.outputUrl} onClick={() => nodeData.onSendToUnity?.(current.outputUrl!)}>
                  {nodeData.unityBusyUrl === current.outputUrl ? <LoaderCircle className="spin" size={12} /> : <Component size={12} />}
                </button>
                <button type="button" className="danger" title="Move to trash" aria-label={`Move ${label} to trash`} onClick={() => nodeData.onDeleteVariant?.(id, current.key)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          )}

          <Handle
            type="source"
            id={MULTI_CURRENT_HANDLE}
            position={Position.Right}
            className={`flow-handle output-handle ${current?.outputUrl ? 'ready' : ''}`}
            aria-label="Current variant output"
            title={current?.outputUrl ? `Output: ${label}` : 'Generate this variant to enable the output'}
          />
          {variants.map((variant) => (
            <Handle key={variant.key} type="source" id={variant.key} position={Position.Right} className="multi-variant-programmatic-handle" aria-hidden="true" />
          ))}
          <Handle type="source" id={MULTI_ALL_HANDLE} position={Position.Right} className="multi-variant-programmatic-handle" aria-hidden="true" />
        </div>

        <div className="multi-carousel nodrag">
          <button type="button" aria-label="Previous variant" onClick={() => selectOffset(-1)}>
            <ChevronLeft size={16} />
          </button>
          <div className="multi-carousel-status" aria-live="polite">
            <strong>{currentIndex + 1} / {count}</strong>
            <small>{currentBusy ? (current?.progress || current?.status) : current?.outputUrl ? 'Ready' : current?.status === 'failed' ? 'Failed' : 'Empty'}</small>
          </div>
          <button type="button" aria-label="Next variant" onClick={() => selectOffset(1)}>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="multi-compact-actions nodrag">
          <button
            type="button"
            className="multi-regenerate-btn"
            disabled={!current || (!currentBusy && !nodeData.prompt.trim())}
            onClick={() => {
              if (!current) return;
              if (currentBusy) nodeData.onCancelVariant?.(id, current.key);
              else nodeData.onRunVariant?.(id, current.key);
            }}
          >
            {currentBusy ? <Square size={11} fill="currentColor" /> : current?.outputUrl ? <RotateCcw size={12} /> : <Play size={12} fill="currentColor" />}
            <span>{currentBusy ? 'Cancel' : current?.outputUrl ? 'Regenerate' : 'Generate'}</span>
          </button>
        </div>

        <button
          type="button"
          className={`multi-params-toggle nodrag ${isEditing ? 'is-open' : ''}`}
          aria-expanded={isEditing}
          onClick={() => nodeData.onToggleConfig?.(id, !isEditing)}
        >
          <span>Parameters</span>
          <ChevronDown size={14} />
        </button>

        {isEditing && (
          <div className="multi-params nodrag">
            <div className="multi-settings-row">
              <label>
                <span>Variants</span>
                <select aria-label="Variant count" value={count} disabled={anyBusy} onChange={(event) => nodeData.onCountChange?.(id, Number(event.target.value))}>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                  <option value={6}>6</option>
                </select>
              </label>
            </div>

            <div className="clean-config-prompt-wrap">
              <textarea
                className="clean-config-textarea nowheel"
                aria-label="Shared variation prompt"
                value={nodeData.prompt}
                onChange={(event) => nodeData.onPromptChange?.(id, event.target.value)}
                rows={3}
                placeholder="Keep the subject, explore outfit, palette, and material variations…"
              />
              <div className="clean-textarea-actions">
                <PromptEnhanceButton busy={nodeData.enhancingPrompt} available={nodeData.enhancePromptAvailable} disabled={!nodeData.prompt.trim()} onClick={() => nodeData.onEnhancePrompt?.(id)} />
              </div>
            </div>
            {nodeData.enhancePromptError && <span className="prompt-enhance-error" role="alert">{nodeData.enhancePromptError}</span>}
            {error && <p className="node-error">{error}</p>}

            <div className="multi-run-row">
              <button type="button" className="clean-btn-primary" disabled={anyBusy || !nodeData.prompt.trim()} onClick={() => nodeData.onRunAll?.(id, false)}>
                <Play size={12} fill="currentColor" />
                <span>Run all</span>
              </button>
              <button type="button" className="clean-btn-secondary" disabled={anyBusy || ready === count || !nodeData.prompt.trim()} onClick={() => nodeData.onRunAll?.(id, true)}>
                Run missing
              </button>
            </div>
          </div>
        )}
      </article>
      <GenerationHistoryPopover
        open={Boolean(historyAnchor) && revisions.length > 1}
        anchor={historyAnchor || { x: 0, y: 0 }}
        revisions={revisions}
        activeRevisionId={current?.activeRevisionId}
        onRestore={(revisionId) => current && nodeData.onRestoreVariantRevision?.(id, current.key, revisionId)}
        onInspect={openInspect}
        onApplyPrompt={nodeData.onApplyRevisionPrompt ? (prompt) => nodeData.onApplyRevisionPrompt?.(id, prompt) : undefined}
        onClose={() => setHistoryAnchor(null)}
      />
    </div>
  );
}
