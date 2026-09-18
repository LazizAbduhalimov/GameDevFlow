import { describe, expect, it } from 'vitest';
import {
  GENERATION_HISTORY_CAP,
  appendRevision,
  assetIdFromOutputUrl,
  formatRevisionTime,
  hasRevisionHistory,
  hydrateGraphGenerationHistory,
  hydrateVariantHistory,
  migrateCurrentToHistory,
  removeRevision,
  restoreRevision,
  stepRevisionId,
} from '../../src/generation-history';
import type { GeneratorNodeData, MultiGenerateNodeData, VariantOutput } from '../../src/types';
import type { HistoryState } from '../../src/generation-history';

function revision(id: string, assetId = id) {
  return { outputUrl: `/data/generated/${assetId}`, assetId, id, createdAt: `2026-01-01T00:00:0${id}.000Z` };
}

describe('generation history', () => {
  it('appends a new revision and selects it as the current output', () => {
    const first = appendRevision({}, { ...revision('1'), prompt: 'first look' });
    const second = appendRevision(first, { ...revision('2'), prompt: 'second look' });
    expect(second.revisions).toHaveLength(2);
    expect(second.outputUrl).toBe('/data/generated/2');
    expect(second.outputAssetId).toBe('2');
    expect(second.activeRevisionId).toBe(second.revisions[1].id);
    expect(second.revisions[0].prompt).toBe('first look');
  });

  it('restores an older revision without duplicating it', () => {
    const first = appendRevision({}, revision('1'));
    const second = appendRevision(first, revision('2'));
    const restored = restoreRevision(second, first.revisions[0].id);
    expect(restored.outputUrl).toBe('/data/generated/1');
    expect(restored.revisions).toHaveLength(2);
    expect(appendRevision(restored, revision('2')).revisions).toHaveLength(2);
  });

  it('caps each slot at 24 revisions and drops the oldest pointer', () => {
    let slot: HistoryState = { revisions: [] };
    for (let index = 1; index <= GENERATION_HISTORY_CAP + 6; index += 1) {
      slot = appendRevision(slot, { outputUrl: `/data/generated/${index}`, assetId: String(index) });
    }
    expect(slot.revisions).toHaveLength(24);
    expect(slot.revisions[0].assetId).toBe('7');
    expect(slot.outputAssetId).toBe('30');
  });

  it('migrates a legacy current output into a synthetic revision', () => {
    const migrated = migrateCurrentToHistory({
      outputUrl: '/data/generated/legacy-id',
      jobId: 'job-1',
      prompt: 'old prompt',
    });
    expect(migrated.revisions).toHaveLength(1);
    expect(migrated.outputAssetId).toBe('legacy-id');
    expect(migrated.revisions[0].prompt).toBe('old prompt');
    expect(migrated.revisions[0].jobId).toBe('job-1');
  });

  it('falls back to the previous revision when the active one is removed', () => {
    const two = appendRevision(appendRevision({}, revision('1')), revision('2'));
    const removed = removeRevision(two, two.activeRevisionId!);
    expect(removed.revisions).toHaveLength(1);
    expect(removed.outputUrl).toBe('/data/generated/1');
    expect(removeRevision(removed, removed.activeRevisionId!).outputUrl).toBeUndefined();
  });

  it('keeps Multi Generate variant slots independent', () => {
    const variantA = hydrateVariantHistory({
      key: 'variant-1',
      title: 'Variant 1',
      index: 0,
      status: 'completed',
      outputUrl: '/data/generated/a',
      assetId: 'a',
    });
    const variantB: VariantOutput = {
      key: 'variant-2',
      title: 'Variant 2',
      index: 1,
      status: 'completed',
      outputUrl: '/data/generated/b',
      assetId: 'b',
    };
    const nextA = {
      ...variantA,
      ...appendRevision(variantA, { outputUrl: '/data/generated/a2', assetId: 'a2', prompt: 'new A' }),
    };
    expect(nextA.revisions).toHaveLength(2);
    expect(variantB.revisions).toBeUndefined();
    expect(nextA.outputUrl).toBe('/data/generated/a2');
    expect(variantB.outputUrl).toBe('/data/generated/b');
  });

  it('hydrates project nodes without mixing generator and variant history', () => {
    const nodes = hydrateGraphGenerationHistory([
      { type: 'generator', data: { title: 'Generate image', prompt: 'hero', status: 'completed', outputUrl: '/data/generated/g1' } as GeneratorNodeData },
      {
        type: 'multiGenerate',
        data: {
          title: 'Multi Generate',
          prompt: 'vary',
          variantCount: 2,
          variants: [
            { key: 'variant-1', title: 'Variant 1', index: 0, status: 'completed', outputUrl: '/data/generated/v1' },
            { key: 'variant-2', title: 'Variant 2', index: 1, status: 'idle' },
          ],
        } satisfies MultiGenerateNodeData,
      },
    ]);
    expect((nodes[0].data as GeneratorNodeData).revisions).toHaveLength(1);
    expect((nodes[1].data as MultiGenerateNodeData).variants[0].revisions).toHaveLength(1);
    expect((nodes[1].data as MultiGenerateNodeData).variants[1].revisions).toBeUndefined();
  });

  it('steps through revisions and reports when history is worth showing', () => {
    const two = appendRevision(appendRevision({}, revision('1')), revision('2'));
    expect(hasRevisionHistory(two)).toBe(true);
    expect(hasRevisionHistory({ outputUrl: '/data/generated/1' })).toBe(false);
    expect(stepRevisionId(two, -1)).toBe(two.revisions[0].id);
    expect(stepRevisionId({ ...two, activeRevisionId: two.revisions[0].id }, 1)).toBe(two.revisions[1].id);
    expect(assetIdFromOutputUrl('/data/generated/abc-123')).toBe('abc-123');
    expect(formatRevisionTime(new Date(Date.now() - 90_000).toISOString(), Date.now())).toBe('2m ago');
  });
});
