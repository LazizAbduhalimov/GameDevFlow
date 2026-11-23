import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { collectErrors, findFreePosition, nodeIsBusy, nodeOutputs, positionAfter, summarizeNode } from '../../src/agent-board';
import { easeInOutCubic, glideDuration } from '../../src/agent-presence';

const node = (id: string, type: string, data: Record<string, unknown>, position = { x: 0, y: 0 }): Node => ({ id, type, position, data, measured: { width: 300, height: 340 } });

describe('agent board summaries', () => {
  it('detects busy work and errors anywhere in node data', () => {
    expect(nodeIsBusy({ status: 'completed', views: { front: { status: 'running' } } })).toBe(true);
    expect(nodeIsBusy({ status: 'completed', revisions: [{ status: 'running' }] })).toBe(false);
    expect(collectErrors({ error: 'top', variants: [{ error: 'inner' }, { error: 'inner' }] })).toEqual(['top', 'inner']);
  });

  it('lists output handles with readiness for collection nodes', () => {
    const views = node('v', 'characterViews', { views: { front: { outputUrl: '/data/generated/a' }, left: {}, back: {}, right: {} } });
    const outputs = nodeOutputs(views);
    expect(outputs.find((output) => output.handle === 'front')).toMatchObject({ ready: true, url: '/data/generated/a' });
    expect(outputs.find((output) => output.handle === 'all')).toMatchObject({ ready: false });
    const multi = node('m', 'multiGenerate', { variantCount: 2, variants: [{ key: 'variant-1', title: 'V1', outputUrl: '/data/generated/b' }, { key: 'variant-2', title: 'V2', outputUrl: '/data/generated/c' }, { key: 'variant-3', title: 'V3' }] });
    expect(nodeOutputs(multi).map((output) => output.handle)).toEqual(['variant-1', 'variant-2', 'all']);
    expect(nodeOutputs(multi).at(-1)).toMatchObject({ ready: true, urls: ['/data/generated/b', '/data/generated/c'] });
  });

  it('summarizes prompts and connections', () => {
    const source = node('img', 'image', { title: 'Ref', imageUrl: '/data/assets/x' });
    const generator = node('gen', 'generator', { title: 'Generate image', prompt: 'a fox', status: 'queued', onRun: () => undefined });
    const edges: Edge[] = [{ id: 'e1', source: 'img', target: 'gen' }];
    const summary = summarizeNode(generator, edges, true);
    expect(summary).toMatchObject({ prompt: 'a fox', busy: true, inputs: [{ edge_id: 'e1', source: 'img', source_handle: null }] });
    expect(summary.data).not.toHaveProperty('onRun');
    expect(summarizeNode(source, edges).feeds).toEqual([{ edge_id: 'e1', target: 'gen', source_handle: null }]);
  });
});

describe('agent placement', () => {
  it('finds a spot that does not overlap existing nodes', () => {
    const nodes = [node('a', 'image', {}, { x: 0, y: 0 })];
    const spot = findFreePosition(nodes, { x: 10, y: 10 });
    expect(spot.x === 10 && spot.y === 10).toBe(false);
    expect(findFreePosition([], { x: 10, y: 10 })).toEqual({ x: 10, y: 10 });
    expect(positionAfter(nodes[0], nodes)).toEqual({ x: 396, y: 0 });
  });

  it('eases cursor motion and keeps glide times short', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(glideDuration({ x: 0, y: 0 }, { x: 5, y: 0 }, 1)).toBe(220);
    expect(glideDuration({ x: 0, y: 0 }, { x: 5_000, y: 0 }, 1)).toBe(900);
  });
});
