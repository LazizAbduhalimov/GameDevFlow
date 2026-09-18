import type { GenerationRevision, GeneratorNodeData, MultiGenerateNodeData, VariantOutput } from './types';

export const GENERATION_HISTORY_CAP = 24;

export type HistorySlot = {
  revisions?: GenerationRevision[];
  activeRevisionId?: string;
  outputUrl?: string;
  outputAssetId?: string;
  jobId?: string;
  prompt?: string;
};

export type HistoryState = {
  revisions: GenerationRevision[];
  activeRevisionId?: string;
  outputUrl?: string;
  outputAssetId?: string;
};

export function assetIdFromOutputUrl(url?: string): string {
  if (!url) return '';
  try {
    const pathname = url.startsWith('/') ? url.split('?')[0] : new URL(url, 'http://consept.local').pathname;
    const parts = pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || '');
  } catch {
    return '';
  }
}

export function createGenerationRevision(input: {
  id?: string;
  assetId?: string;
  outputUrl: string;
  createdAt?: string;
  jobId?: string;
  prompt?: string;
}): GenerationRevision {
  const prompt = input.prompt?.trim();
  return {
    id: input.id || crypto.randomUUID(),
    assetId: input.assetId || assetIdFromOutputUrl(input.outputUrl),
    outputUrl: input.outputUrl,
    createdAt: input.createdAt || new Date().toISOString(),
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(prompt ? { prompt } : {}),
  };
}

export function migrateCurrentToHistory(slot: HistorySlot): HistoryState {
  const revisions = [...(slot.revisions || [])].filter((revision) => revision?.outputUrl);
  const currentUrl = slot.outputUrl;
  if (currentUrl && !revisions.some((revision) => revision.outputUrl === currentUrl || (slot.outputAssetId && revision.assetId === slot.outputAssetId))) {
    revisions.push(createGenerationRevision({
      outputUrl: currentUrl,
      assetId: slot.outputAssetId,
      jobId: slot.jobId,
      prompt: slot.prompt,
    }));
  }
  const active = revisions.find((revision) => revision.id === slot.activeRevisionId)
    || revisions.find((revision) => revision.outputUrl === currentUrl)
    || revisions.find((revision) => slot.outputAssetId && revision.assetId === slot.outputAssetId)
    || revisions[revisions.length - 1];
  return applyActive(revisions, active);
}

export function appendRevision(slot: HistorySlot, incoming: {
  id?: string;
  assetId?: string;
  outputUrl?: string;
  createdAt?: string;
  jobId?: string;
  prompt?: string;
}, cap = GENERATION_HISTORY_CAP): HistoryState {
  const base = migrateCurrentToHistory(slot);
  if (!incoming.outputUrl) return base;
  const existing = base.revisions.find((revision) => (
    (incoming.assetId && revision.assetId === incoming.assetId)
    || (incoming.jobId && revision.jobId === incoming.jobId)
    || revision.outputUrl === incoming.outputUrl
  ));
  if (existing) return applyActive(base.revisions, existing);
  const revision = createGenerationRevision({
    id: incoming.id,
    assetId: incoming.assetId,
    outputUrl: incoming.outputUrl,
    createdAt: incoming.createdAt,
    jobId: incoming.jobId,
    prompt: incoming.prompt,
  });
  const revisions = [...base.revisions, revision].slice(-Math.max(1, cap));
  return applyActive(revisions, revision);
}

export function restoreRevision(slot: HistorySlot, revisionId: string): HistoryState {
  const base = migrateCurrentToHistory(slot);
  const revision = base.revisions.find((item) => item.id === revisionId);
  return revision ? applyActive(base.revisions, revision) : base;
}

export function removeRevision(slot: HistorySlot, revisionId: string): HistoryState {
  const base = migrateCurrentToHistory(slot);
  const index = base.revisions.findIndex((revision) => revision.id === revisionId);
  if (index < 0) return base;
  const revisions = base.revisions.filter((revision) => revision.id !== revisionId);
  if (base.activeRevisionId && base.activeRevisionId !== revisionId) {
    const active = revisions.find((revision) => revision.id === base.activeRevisionId);
    if (active) return applyActive(revisions, active);
  }
  return applyActive(revisions, revisions[Math.max(0, index - 1)] || revisions[0]);
}

export function removeActiveRevision(slot: HistorySlot): HistoryState {
  const base = migrateCurrentToHistory(slot);
  if (!base.activeRevisionId) return { revisions: [], activeRevisionId: undefined, outputUrl: undefined, outputAssetId: undefined };
  return removeRevision(base, base.activeRevisionId);
}

export function stepRevisionId(slot: HistorySlot, delta: number): string | undefined {
  const base = migrateCurrentToHistory(slot);
  if (!base.revisions.length) return undefined;
  const currentIndex = Math.max(0, base.revisions.findIndex((revision) => revision.id === base.activeRevisionId));
  const next = (currentIndex + delta + base.revisions.length) % base.revisions.length;
  return base.revisions[next]?.id;
}

export function hasRevisionHistory(slot: HistorySlot): boolean {
  return (slot.revisions?.length || (slot.outputUrl ? 1 : 0)) > 1;
}

export function historyFromGenerator(data: Pick<GeneratorNodeData, 'revisions' | 'activeRevisionId' | 'outputUrl' | 'outputAssetId' | 'jobId' | 'prompt'>): HistorySlot {
  return {
    revisions: data.revisions,
    activeRevisionId: data.activeRevisionId,
    outputUrl: data.outputUrl,
    outputAssetId: data.outputAssetId,
    jobId: data.jobId,
    prompt: data.prompt,
  };
}

export function historyToGeneratorPatch(history: HistoryState): Pick<GeneratorNodeData, 'revisions' | 'activeRevisionId' | 'outputUrl' | 'outputAssetId'> {
  return {
    revisions: history.revisions,
    activeRevisionId: history.activeRevisionId,
    outputUrl: history.outputUrl,
    outputAssetId: history.outputAssetId,
  };
}

export function historyFromVariant(variant: Pick<VariantOutput, 'revisions' | 'activeRevisionId' | 'outputUrl' | 'assetId' | 'jobId'>, prompt?: string): HistorySlot {
  return {
    revisions: variant.revisions,
    activeRevisionId: variant.activeRevisionId,
    outputUrl: variant.outputUrl,
    outputAssetId: variant.assetId,
    jobId: variant.jobId,
    prompt,
  };
}

export function historyToVariantPatch(history: HistoryState): Pick<VariantOutput, 'revisions' | 'activeRevisionId' | 'outputUrl' | 'assetId'> {
  return {
    revisions: history.revisions,
    activeRevisionId: history.activeRevisionId,
    outputUrl: history.outputUrl,
    assetId: history.outputAssetId,
  };
}

export function hydrateGeneratorHistory(data: GeneratorNodeData): GeneratorNodeData {
  if (!data.outputUrl && !data.revisions?.length) return data;
  const history = migrateCurrentToHistory(historyFromGenerator(data));
  if (sameHistory(historyFromGenerator(data), history)) return data;
  return { ...data, ...historyToGeneratorPatch(history) };
}

export function hydrateVariantHistory(variant: VariantOutput, prompt?: string): VariantOutput {
  if (!variant.outputUrl && !variant.revisions?.length) return variant;
  const history = migrateCurrentToHistory(historyFromVariant(variant, prompt));
  if (sameHistory(historyFromVariant(variant, prompt), history)) return variant;
  return { ...variant, ...historyToVariantPatch(history) };
}

export function hydrateMultiGenerateHistory(data: MultiGenerateNodeData): MultiGenerateNodeData {
  let changed = false;
  const variants = data.variants.map((variant) => {
    const next = hydrateVariantHistory(variant, data.prompt);
    if (next !== variant) changed = true;
    return next;
  });
  return changed ? { ...data, variants } : data;
}

export function hydrateGraphGenerationHistory<T extends { type?: string; data: unknown }>(nodes: T[]): T[] {
  return nodes.map((node) => {
    if (node.type === 'generator') {
      const data = hydrateGeneratorHistory(node.data as GeneratorNodeData);
      return data === node.data ? node : { ...node, data };
    }
    if (node.type === 'multiGenerate') {
      const data = hydrateMultiGenerateHistory(node.data as MultiGenerateNodeData);
      return data === node.data ? node : { ...node, data };
    }
    return node;
  });
}

export function formatRevisionTime(iso?: string, now = Date.now()): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const minutes = Math.round((now - then) / 60_000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return `${Math.abs(minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${Math.abs(hours)}h ago`;
  return `${Math.abs(Math.round(hours / 24))}d ago`;
}

function applyActive(revisions: GenerationRevision[], active?: GenerationRevision): HistoryState {
  if (!active) return { revisions, activeRevisionId: undefined, outputUrl: undefined, outputAssetId: undefined };
  return {
    revisions,
    activeRevisionId: active.id,
    outputUrl: active.outputUrl,
    outputAssetId: active.assetId,
  };
}

function sameHistory(slot: HistorySlot, history: HistoryState): boolean {
  return slot.activeRevisionId === history.activeRevisionId
    && slot.outputUrl === history.outputUrl
    && (slot.outputAssetId || '') === (history.outputAssetId || '')
    && (slot.revisions?.length || 0) === history.revisions.length
    && (slot.revisions || []).every((revision, index) => revision.id === history.revisions[index]?.id && revision.outputUrl === history.revisions[index]?.outputUrl);
}
