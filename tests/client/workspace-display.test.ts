import { describe, expect, it } from 'vitest';
import { MarkerType, type Edge } from '@xyflow/react';
import { generationJobTitle, sortGenerationJobs, themeEdges } from '../../src/workspace-display';
import type { GenerationJob } from '../../src/types';

describe('themed graph presentation', () => {
  it('restyles saved links without changing connections or serialized source data', () => {
    const edges: Edge[] = [{ id: 'link', source: 'views', target: 'atlas', sourceHandle: 'all', targetHandle: 'input', animated: true, style: { stroke: '#d8ff65', strokeWidth: 1.7, strokeDasharray: '5 4' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#d8ff65', width: 16 } }];
    const original = JSON.stringify(edges);
    const themed = themeEdges(edges, '#29719b');
    expect(JSON.stringify(edges)).toBe(original);
    expect(themed[0]).toMatchObject({ id: 'link', source: 'views', target: 'atlas', sourceHandle: 'all', targetHandle: 'input', animated: true, type: 'default', style: { stroke: '#29719b', strokeWidth: 1.7, strokeDasharray: '5 4' }, markerEnd: undefined });
    expect(themed[0]).not.toBe(edges[0]);
  });

  it('keeps explicit edge geometry such as smoothstep', () => {
    const edges: Edge[] = [{ id: 'link', source: 'smart', target: 'card', type: 'smoothstep' }];
    expect(themeEdges(edges, '#29719b')[0].type).toBe('smoothstep');
  });
});

function job(patch: Partial<GenerationJob> & Pick<GenerationJob, 'id' | 'status'>): GenerationJob {
  return { projectId: 'ui', progress: 'Ready', provider: 'codex', ...patch };
}

describe('generation queue presentation', () => {
  it('names smart-separation jobs from the target asset, not Ready', () => {
    expect(generationJobTitle({
      status: 'completed',
      progress: 'Ready',
      outputName: 'smart-crown-doodle-3528a54b',
      prompt: 'Recreate exactly ONE asset.\nTarget asset: Crown doodle.\nRole: icon.',
    })).toBe('Crown doodle');
  });

  it('humanizes output names when the prompt has no target line', () => {
    expect(generationJobTitle({ status: 'queued', progress: 'Waiting for local queue', outputName: 'hero-front.png' })).toBe('Hero front');
  });

  it('keeps active jobs above finished ones and preserves queue order', () => {
    const ordered = sortGenerationJobs([
      job({ id: 'done', status: 'completed', createdAt: '2026-09-16T19:40:00.000Z', updatedAt: '2026-09-16T19:41:00.000Z' }),
      job({ id: 'wait-2', status: 'queued', createdAt: '2026-09-16T19:34:20.000Z', progress: 'Waiting for local queue' }),
      job({ id: 'run', status: 'running', createdAt: '2026-09-16T19:34:10.000Z', progress: 'Worker 1 · ImageGen is rendering' }),
      job({ id: 'wait-1', status: 'queued', createdAt: '2026-09-16T19:34:13.000Z', progress: 'Waiting for local queue' }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['run', 'wait-1', 'wait-2', 'done']);
  });
});
