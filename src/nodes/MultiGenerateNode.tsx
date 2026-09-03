import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ArrowUpRight, Box, Download, Expand, Grid2X2, ImagePlus, Layers3, LoaderCircle, Play, RefreshCw, ShieldCheck, Square, Trash2, Zap } from 'lucide-react';
import type { MultiGenerateNodeData } from '../types';
import { PromptEnhanceButton } from '../components/PromptEnhanceButton';

const clampCount = (count: number | undefined) => Math.max(2, Math.min(6, count || 3));

export default function MultiGenerateNode({ id, data, selected }: NodeProps) {
  const nodeData = data as MultiGenerateNodeData;
  const count = clampCount(nodeData.variantCount);
  const variants = nodeData.variants.slice(0, count);
  const ready = variants.filter((variant) => Boolean(variant.outputUrl)).length;
  const busy = variants.some((variant) => variant.status === 'queued' || variant.status === 'running');
  const mode = nodeData.generationMode || 'fast';
  const error = typeof nodeData.error === 'string' ? nodeData.error : undefined;

  return (
    <article className={`studio-node multi-generate-node ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle input-handle" aria-label="Source image input" />
      <div className="node-cap">
        <span className="node-kind"><Grid2X2 size={13} /> Multi Generate</span>
        <span className="node-code">{count} VAR</span>
      </div>

      <div className="multi-settings-row nodrag">
        <label>
          <span>Variants</span>
          <select aria-label="Variant count" value={count} disabled={busy} onChange={(event) => nodeData.onCountChange?.(id, Number(event.target.value))}>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4 · 2×2</option>
            <option value={5}>5</option>
            <option value={6}>6 · 2×3</option>
          </select>
        </label>
        <div className="multi-mode" aria-label="Execution mode">
          <span>Execution</span>
          <div>
            <button type="button" className={mode === 'reliable' ? 'active' : ''} disabled={busy} onClick={() => nodeData.onModeChange?.(id, 'reliable')} aria-label="Reliable execution, one at a time">
              <ShieldCheck size={10} /> Reliable
            </button>
            <button type="button" className={mode === 'fast' ? 'active' : ''} disabled={busy} onClick={() => nodeData.onModeChange?.(id, 'fast')} aria-label="Fast execution, parallel">
              <Zap size={10} /> Fast
            </button>
          </div>
        </div>
      </div>

      <div className={`multi-variant-grid count-${count}`}>
        {variants.map((variant, index) => {
          const variantBusy = variant.status === 'queued' || variant.status === 'running';
          const label = variant.title || `Variant ${index + 1}`;
          return (
            <section className={`multi-variant status-${variant.status}`} key={variant.key} aria-label={label}>
              <header>
                <strong>{label}</strong>
                <small>{variantBusy ? variant.progress || variant.status : variant.status}</small>
              </header>
              {variant.outputUrl ? (
                <button type="button" className="multi-preview nodrag" onClick={() => nodeData.onOpen?.(variant.outputUrl!, `${nodeData.title} · ${label}`, variant.sourceUrl)} aria-label={`Open ${label}`}>
                  <img src={variant.outputUrl} alt={`${label} generated image`} draggable={false} />
                  <Expand size={13} />
                </button>
              ) : (
                <div className="multi-empty" aria-hidden="true">{variantBusy ? <LoaderCircle className="spin" size={17} /> : <ImagePlus size={16} />}</div>
              )}
              <div className="multi-actions nodrag">
                {variant.outputUrl && <button type="button" className="use-image" title="Create a connected Image node from this variant" aria-label={`Use ${label} as a connected Image node`} onClick={() => nodeData.onExtractVariant?.(id, variant.key)}><ArrowUpRight size={11} /><span>Use image</span></button>}
                <button type="button" title={variantBusy ? 'Stop after current' : variant.outputUrl ? 'Retry variant' : 'Generate variant'} aria-label={variantBusy ? `Stop ${label}` : variant.outputUrl ? `Retry ${label}` : `Generate ${label}`} onClick={() => variantBusy ? nodeData.onCancelVariant?.(id, variant.key) : nodeData.onRunVariant?.(id, variant.key)}>
                  {variantBusy ? <Square size={11} /> : variant.outputUrl ? <RefreshCw size={11} /> : <Play size={11} />}
                </button>
                {variant.outputUrl && <>
                  <button type="button" title="Download PNG" aria-label={`Download ${label} PNG`} onClick={() => nodeData.onDownloadVariant?.(id, variant.key)}><Download size={11} /></button>
                  <button type="button" title="Open in Tripo Studio" aria-label={`Send ${label} to Tripo Studio`} disabled={nodeData.tripoBusyUrl === variant.outputUrl} onClick={() => nodeData.onOpenTripo?.(variant.outputUrl!)}>{nodeData.tripoBusyUrl === variant.outputUrl ? <LoaderCircle className="spin" size={11} /> : <Box size={11} />}</button>
                  <button type="button" className="danger" title="Move to trash" aria-label={`Move ${label} to trash`} onClick={() => nodeData.onDeleteVariant?.(id, variant.key)}><Trash2 size={11} /></button>
                </>}
              </div>
              <Handle type="source" id={variant.key} position={Position.Right} className="multi-variant-programmatic-handle" aria-hidden="true" />
              {variant.error && <span className="multi-error" title={variant.error} aria-label={`${label} error`}>!</span>}
            </section>
          );
        })}
      </div>

      <div className={`multi-all-output nodrag ${ready === count ? 'ready' : ''}`}>
        <span><Layers3 size={12} /> All variants</span>
        <small>{ready} / {count} ready</small>
        <Handle type="source" id="all" position={Position.Right} aria-label="All variants output" title={ready === count ? 'Pass every variant' : 'Generate every variant to enable this output'} className="flow-handle output-handle multi-all-handle" />
      </div>

      <div className="node-body multi-controls">
        <div className="node-title-row"><h3>{nodeData.title}</h3><span className="turnaround-count">{ready} ready</span></div>
        <div className="prompt-label nodrag">
          <div className="prompt-label-head"><span>Shared variation prompt</span><PromptEnhanceButton busy={nodeData.enhancingPrompt} available={nodeData.enhancePromptAvailable} disabled={!nodeData.prompt.trim()} onClick={() => nodeData.onEnhancePrompt?.(id)} /></div>
          <textarea aria-label="Shared variation prompt" value={nodeData.prompt} onChange={(event) => nodeData.onPromptChange?.(id, event.target.value)} rows={3} placeholder="Keep the subject, explore composition, palette and material variations…" />
          {nodeData.enhancePromptError && <span className="prompt-enhance-error" role="alert">{nodeData.enhancePromptError}</span>}
        </div>
        {error && <p className="node-error">{error}</p>}
        <div className="node-button-row nodrag">
          <button type="button" className="node-action primary" disabled={busy || !nodeData.prompt.trim()} onClick={() => nodeData.onRunAll?.(id, false)}><Play size={12} fill="currentColor" /> Run all</button>
          <button type="button" className="node-action" disabled={busy || ready === count || !nodeData.prompt.trim()} onClick={() => nodeData.onRunAll?.(id, true)}>Run missing</button>
        </div>
      </div>
    </article>
  );
}
