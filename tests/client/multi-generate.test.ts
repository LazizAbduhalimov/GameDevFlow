import { describe, expect, it } from 'vitest';
import type { MultiGenerateNodeData, VariantOutput } from '../../src/types';
import {
  MULTI_ALL_HANDLE,
  MULTI_CURRENT_HANDLE,
  clampVariantCount,
  resolveSelectedVariant,
  sourceUrlsForMultiGenerate,
  stepSelectedVariantKey,
  visibleVariants,
} from '../../src/multi-generate';

function variant(index: number, outputUrl?: string): VariantOutput {
  return {
    key: `variant-${index + 1}`,
    title: `Variant ${index + 1}`,
    index,
    status: outputUrl ? 'completed' : 'idle',
    outputUrl,
  };
}

function data(patch: Partial<MultiGenerateNodeData> = {}): MultiGenerateNodeData {
  return {
    title: 'Multi Generate',
    prompt: 'Vary the outfit',
    variantCount: 4,
    variants: [variant(0, 'a.png'), variant(1, 'b.png'), variant(2), variant(3, 'd.png')],
    ...patch,
  };
}

describe('Multi Generate selection', () => {
  it('clamps variant counts to the supported 2-6 range', () => {
    expect(clampVariantCount(1)).toBe(2);
    expect(clampVariantCount(4)).toBe(4);
    expect(clampVariantCount(9)).toBe(6);
  });

  it('uses the first variant when the saved selection is missing', () => {
    expect(resolveSelectedVariant(data({ selectedVariantKey: 'missing' }) )?.key).toBe('variant-1');
    expect(visibleVariants(data({ variantCount: 2 })).map((item) => item.key)).toEqual(['variant-1', 'variant-2']);
  });

  it('steps through visible slots and wraps around', () => {
    const current = data({ selectedVariantKey: 'variant-4', variantCount: 4 });
    expect(stepSelectedVariantKey(current, 1)).toBe('variant-1');
    expect(stepSelectedVariantKey(current, -1)).toBe('variant-3');
  });

  it('routes the live output from the currently selected variant', () => {
    const selected = data({ selectedVariantKey: 'variant-2' });
    expect(sourceUrlsForMultiGenerate(selected, MULTI_CURRENT_HANDLE)).toEqual(['b.png']);
    expect(sourceUrlsForMultiGenerate(selected, undefined)).toEqual(['b.png']);
    expect(sourceUrlsForMultiGenerate(selected, 'variant-4')).toEqual(['d.png']);
  });

  it('keeps the collection output gated until every visible slot is ready', () => {
    expect(sourceUrlsForMultiGenerate(data(), MULTI_ALL_HANDLE)).toEqual([]);
    const ready = data({
      variants: [variant(0, 'a.png'), variant(1, 'b.png'), variant(2, 'c.png'), variant(3, 'd.png')],
    });
    expect(sourceUrlsForMultiGenerate(ready, MULTI_ALL_HANDLE)).toEqual(['a.png', 'b.png', 'c.png', 'd.png']);
  });
});
