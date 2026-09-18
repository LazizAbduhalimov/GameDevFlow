import type { MultiGenerateNodeData, VariantOutput } from './types';

export const MULTI_CURRENT_HANDLE = 'current';
export const MULTI_ALL_HANDLE = 'all';

export function clampVariantCount(count?: number) {
  return Math.max(2, Math.min(6, Math.floor(count || 3)));
}

export function visibleVariants(data: Pick<MultiGenerateNodeData, 'variants' | 'variantCount'>): VariantOutput[] {
  return data.variants.slice(0, clampVariantCount(data.variantCount));
}

export function resolveSelectedVariant(data: Pick<MultiGenerateNodeData, 'variants' | 'variantCount' | 'selectedVariantKey'>): VariantOutput | undefined {
  const variants = visibleVariants(data);
  return variants.find((variant) => variant.key === data.selectedVariantKey) || variants[0];
}

export function resolveSelectedVariantKey(data: Pick<MultiGenerateNodeData, 'variants' | 'variantCount' | 'selectedVariantKey'>): string {
  return resolveSelectedVariant(data)?.key || 'variant-1';
}

export function stepSelectedVariantKey(
  data: Pick<MultiGenerateNodeData, 'variants' | 'variantCount' | 'selectedVariantKey'>,
  delta: number,
): string {
  const variants = visibleVariants(data);
  if (!variants.length) return resolveSelectedVariantKey(data);
  const currentKey = resolveSelectedVariantKey(data);
  const index = Math.max(0, variants.findIndex((variant) => variant.key === currentKey));
  const next = (index + delta + variants.length) % variants.length;
  return variants[next]?.key || currentKey;
}

export function sourceUrlsForMultiGenerate(
  data: Pick<MultiGenerateNodeData, 'variants' | 'variantCount' | 'selectedVariantKey'>,
  sourceHandle?: string | null,
): string[] {
  const variants = visibleVariants(data);
  if (sourceHandle === MULTI_ALL_HANDLE) {
    const urls = variants.map((variant) => variant.outputUrl).filter((url): url is string => Boolean(url));
    return urls.length === variants.length ? urls : [];
  }
  if (sourceHandle && sourceHandle !== MULTI_CURRENT_HANDLE) {
    const variant = data.variants.find((item) => item.key === sourceHandle);
    return variant?.outputUrl ? [variant.outputUrl] : [];
  }
  const selected = resolveSelectedVariant(data);
  return selected?.outputUrl ? [selected.outputUrl] : [];
}
