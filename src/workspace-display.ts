import type { Edge } from '@xyflow/react';
import type { GenerationJob, NodeStatus } from './types';

// Presentation only: persisted edges and undo history keep their original data.
export function themeEdges(edges: Edge[], color: string): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    type: edge.type || 'default',
    style: { ...edge.style, stroke: color, strokeWidth: edge.style?.strokeWidth || 1.8 },
    markerEnd: undefined,
    markerStart: undefined,
  }));
}

export function canvasDuration(milliseconds: number): number {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : milliseconds;
}

const JOB_STATUS_RANK: Record<NodeStatus, number> = {
  running: 0,
  queued: 1,
  failed: 2,
  interrupted: 3,
  cancelled: 4,
  completed: 5,
  idle: 6,
};

export function generationJobTitle(job: Pick<GenerationJob, 'outputName' | 'prompt' | 'slotKey' | 'viewKey' | 'progress' | 'status'>): string {
  const target = job.prompt?.match(/Target asset:\s*(.+)/i)?.[1]?.trim().replace(/[.]+$/, '');
  if (target) return target;
  const named = humanizeJobName(job.outputName);
  if (named) return named;
  if (job.viewKey) return humanizeJobName(job.viewKey) || job.viewKey;
  const slot = humanizeJobName(job.slotKey);
  if (slot && !/^sprite \d+$/i.test(slot) && !/^variants \d+$/i.test(slot)) return slot;
  const promptLine = job.prompt?.split('\n').map((line) => line.trim()).find((line) => line.length > 6 && line.length < 72);
  if (promptLine) return promptLine.replace(/[.]+$/, '');
  if (job.progress && job.progress !== 'Ready' && job.status !== 'completed') return job.progress;
  return named || 'Generation';
}

export function sortGenerationJobs(jobs: GenerationJob[]): GenerationJob[] {
  return [...jobs].sort((left, right) => {
    const rank = (JOB_STATUS_RANK[left.status] ?? 9) - (JOB_STATUS_RANK[right.status] ?? 9);
    if (rank) return rank;
    if (left.status === 'queued' || left.status === 'running') return timestamp(left.createdAt) - timestamp(right.createdAt);
    return timestamp(right.updatedAt || right.createdAt) - timestamp(left.updatedAt || left.createdAt);
  });
}

function humanizeJobName(value?: string | null): string {
  if (!value) return '';
  const cleaned = value.replace(/\.(png|jpe?g|webp|gif)$/i, '').replace(/^smart-/, '').replace(/-[0-9a-f]{8}$/i, '').replace(/[-_]+/g, ' ').trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : '';
}

function timestamp(value?: string): number {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}
