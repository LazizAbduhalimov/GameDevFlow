import type { Edge, Node } from '@xyflow/react';
import { characterPartHandle } from './character-parts';
import { CHARACTER_VIEW_KEYS } from './character-views';
import type { CharacterViewsNodeData, MaterialMapsNodeData, MultiGenerateNodeData, ReferenceSetNodeData, SmartSeparationNodeData } from './types';

export const AGENT_NODE_TYPES = ['generator', 'characterFront', 'characterViews', 'characterParts', 'multiGenerate', 'smartSeparation', 'spriteAtlas', 'relativeAtlas', 'seamlessTexture', 'materialMaps'] as const;
export type AgentNodeType = typeof AGENT_NODE_TYPES[number];

const BUSY_STATUSES = new Set(['queued', 'running', 'analyzing', 'extracting', 'building', 'preparing']);
const MATERIAL_KEYS = ['baseColor', 'normal', 'height', 'roughness', 'metallic', 'ambientOcclusion', 'orm'] as const;
const DEFAULT_SIZE = { width: 320, height: 360 };

/** Prompt-like field the agent types into, per node type. */
export const PROMPT_FIELDS: Record<string, string> = {
  generator: 'prompt',
  characterFront: 'prompt',
  multiGenerate: 'prompt',
  seamlessTexture: 'prompt',
  characterViews: 'basePrompt',
  smartSeparation: 'userHint',
  characterParts: 'notes',
};

/** Data keys an agent may set directly; outputs and history stay owned by the app. */
export const AGENT_DATA_KEYS = new Set(['title', 'prompt', 'basePrompt', 'userHint', 'notes', 'characterDescription', 'provider', 'pose', 'subjectKind', 'generationMode', 'selectedVariantKey', 'expanded', 'isConfigOpen']);

/** Character part as stored on the board; extraction fields only exist once a part has been extracted. */
type BoardPart = { id: string; name: string; enabled: boolean; region?: unknown; correction?: string; extraction?: { status?: string; outputUrl?: string } };

function boardParts(data: unknown): BoardPart[] {
  const parts = (data as { parts?: unknown })?.parts;
  return Array.isArray(parts) ? parts as BoardPart[] : [];
}

function partAccepted(part: BoardPart) {
  return Boolean(part.extraction?.status === 'accepted' && part.extraction.outputUrl && !part.correction?.trim());
}

export type AgentNodeOutput = { handle: string | null; label: string; ready: boolean; url?: string; urls?: string[] };

export type AgentNodeSummary = {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  status: string;
  busy: boolean;
  errors: string[];
  prompt?: string;
  items?: Record<string, string>;
  inputs: Array<{ edge_id: string; source: string; source_handle: string | null }>;
  outputs: AgentNodeOutput[];
  feeds: Array<{ edge_id: string; target: string; source_handle: string | null }>;
  data?: Record<string, unknown>;
};

export function nodeSize(node: Node) {
  return {
    width: Math.round(node.measured?.width || node.width || DEFAULT_SIZE.width),
    height: Math.round(node.measured?.height || node.height || DEFAULT_SIZE.height),
  };
}

export function nodeIsBusy(data: unknown, depth = 0): boolean {
  if (!data || typeof data !== 'object' || depth > 4) return false;
  if (Array.isArray(data)) return data.some((item) => nodeIsBusy(item, depth + 1));
  for (const [key, value] of Object.entries(data)) {
    if (key === 'revisions') continue;
    if (key === 'status' && typeof value === 'string' && BUSY_STATUSES.has(value)) return true;
    if (value && typeof value === 'object' && nodeIsBusy(value, depth + 1)) return true;
  }
  return false;
}

export function collectErrors(data: unknown, found: string[] = [], depth = 0): string[] {
  if (!data || typeof data !== 'object' || depth > 4 || found.length >= 6) return found;
  for (const [key, value] of Object.entries(data)) {
    if (key === 'revisions') continue;
    if ((key === 'error' || key === 'generationError') && typeof value === 'string' && value.trim() && !found.includes(value)) found.push(value.slice(0, 400));
    else if (value && typeof value === 'object') collectErrors(value, found, depth + 1);
  }
  return found;
}

export function nodeOutputs(node: Node): AgentNodeOutput[] {
  const data = node.data as Record<string, unknown>;
  const single = (url: unknown, label = 'output', handle: string | null = null): AgentNodeOutput[] => [{ handle, label, ready: Boolean(url), ...(url ? { url: String(url) } : {}) }];
  const collection = (urls: Array<string | undefined>, label: string, handle = 'all'): AgentNodeOutput => {
    const ready = urls.length > 0 && urls.every(Boolean);
    return { handle, label, ready, urls: urls.filter((url): url is string => Boolean(url)) };
  };
  switch (node.type) {
    case 'image': return single(data.imageUrl, 'image');
    case 'generator':
    case 'characterFront':
    case 'spriteAtlas':
    case 'relativeAtlas': return single(data.outputUrl);
    case 'seamlessTexture': return single(data.outputUrl, 'base color', 'baseColor');
    case 'model3d': return single(data.modelUrl, 'GLB model');
    case 'referenceSet': return [collection(((node.data as ReferenceSetNodeData).items || []).map((item) => item.imageUrl), 'all references')];
    case 'characterViews': {
      const views = (node.data as CharacterViewsNodeData).views || {};
      return [
        ...CHARACTER_VIEW_KEYS.map((key) => ({ handle: key, label: `${key} view`, ready: Boolean(views[key]?.outputUrl), ...(views[key]?.outputUrl ? { url: views[key].outputUrl } : {}) })),
        collection(CHARACTER_VIEW_KEYS.map((key) => views[key]?.outputUrl), 'all views'),
      ];
    }
    case 'multiGenerate': {
      const multi = node.data as MultiGenerateNodeData;
      const variants = (multi.variants || []).slice(0, multi.variantCount);
      return [
        ...variants.map((variant) => ({ handle: variant.key, label: variant.title, ready: Boolean(variant.outputUrl), ...(variant.outputUrl ? { url: variant.outputUrl } : {}) })),
        collection(variants.map((variant) => variant.outputUrl), 'all variants'),
      ];
    }
    case 'materialMaps': {
      const maps = (node.data as MaterialMapsNodeData).maps || {};
      return [
        ...MATERIAL_KEYS.map((key) => ({ handle: key, label: maps[key]?.title || key, ready: Boolean(maps[key]?.outputUrl), ...(maps[key]?.outputUrl ? { url: maps[key].outputUrl } : {}) })),
        collection(MATERIAL_KEYS.map((key) => maps[key]?.outputUrl), 'all maps'),
      ];
    }
    case 'smartSeparation': {
      const smart = node.data as SmartSeparationNodeData;
      const groups = (smart.groups || []).map((group) => {
        const items = (smart.items || []).filter((item) => item.groupId === group.id && item.enabled);
        return collection(items.map((item) => item.outputUrl), `${group.name} sprites`, `group:${group.id}`);
      });
      return [...groups, collection((smart.groups || []).filter((group) => (smart.items || []).some((item) => item.groupId === group.id && item.enabled)).map((group) => group.outputUrl), 'all atlases', 'all-atlases')];
    }
    case 'characterParts': {
      const parts = boardParts(node.data);
      return [
        ...parts.map((part) => ({ handle: characterPartHandle(part.id), label: part.name, ready: partAccepted(part), ...(part.extraction?.outputUrl ? { url: part.extraction.outputUrl } : {}) })),
        collection(parts.filter((part) => part.enabled).map((part) => partAccepted(part) ? part.extraction?.outputUrl : undefined), 'all accepted parts'),
      ];
    }
    default: return [];
  }
}

function itemStatuses(node: Node): Record<string, string> | undefined {
  const data = node.data as Record<string, unknown>;
  if (node.type === 'characterViews') {
    const views = (data as CharacterViewsNodeData).views || {};
    return Object.fromEntries(CHARACTER_VIEW_KEYS.map((key) => [key, String(views[key]?.status || 'idle')]));
  }
  if (node.type === 'multiGenerate') {
    const multi = data as MultiGenerateNodeData;
    return Object.fromEntries((multi.variants || []).slice(0, multi.variantCount).map((variant) => [variant.key, String(variant.status || 'idle')]));
  }
  if (node.type === 'characterParts') {
    return Object.fromEntries(boardParts(data).map((part) => [part.name, String(part.extraction?.status || (part.enabled ? 'selected' : 'skipped'))]));
  }
  return undefined;
}

export function summarizeNode(node: Node, edges: Edge[], detail = false): AgentNodeSummary {
  const data = node.data as Record<string, unknown>;
  const promptField = PROMPT_FIELDS[String(node.type)];
  const busy = nodeIsBusy(data);
  const items = itemStatuses(node);
  return {
    id: node.id,
    type: String(node.type),
    title: String(data.title || node.type),
    position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    size: nodeSize(node),
    status: typeof data.status === 'string' ? data.status : busy ? 'running' : 'idle',
    busy,
    errors: collectErrors(data),
    ...(promptField ? { prompt: String(data[promptField] || '') } : {}),
    ...(items ? { items } : {}),
    inputs: edges.filter((edge) => edge.target === node.id).map((edge) => ({ edge_id: edge.id, source: edge.source, source_handle: edge.sourceHandle ?? null })),
    outputs: nodeOutputs(node),
    feeds: edges.filter((edge) => edge.source === node.id).map((edge) => ({ edge_id: edge.id, target: edge.target, source_handle: edge.sourceHandle ?? null })),
    ...(detail ? { data: plainData(data) as Record<string, unknown> } : {}),
  };
}

/** JSON-safe copy without callbacks; long strings and lists are trimmed so results stay small. */
export function plainData(value: unknown, depth = 0): unknown {
  if (typeof value === 'function') return undefined;
  if (typeof value === 'string') return value.length > 4_000 ? `${value.slice(0, 4_000)}…` : value;
  if (!value || typeof value !== 'object') return value;
  if (depth > 6) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 60).map((item) => plainData(item, depth + 1));
  return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => typeof child !== 'function')
    .map(([key, child]) => [key, plainData(child, depth + 1)]));
}

type Rect = { x: number; y: number; width: number; height: number };

function overlaps(a: Rect, b: Rect, gap: number) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

/** Nearest spot to `preferred` that does not overlap existing nodes: walks down first, then to the next column. */
export function findFreePosition(nodes: Node[], preferred: { x: number; y: number }, size = DEFAULT_SIZE, gap = 36) {
  const rects = nodes.map((node) => ({ ...node.position, ...nodeSize(node) }));
  const stepY = size.height + gap;
  const stepX = size.width + gap * 2;
  for (let column = 0; column < 8; column += 1) {
    for (const row of [0, 1, -1, 2, -2, 3, 4]) {
      const candidate = { x: Math.round(preferred.x + column * stepX), y: Math.round(preferred.y + row * stepY) };
      if (!rects.some((rect) => overlaps({ ...candidate, ...size }, rect, gap))) return candidate;
    }
  }
  return { x: Math.round(preferred.x), y: Math.round(preferred.y) };
}

/** Where a node fed by `source` should go: to the right, aligned with its top. */
export function positionAfter(source: Node, nodes: Node[]) {
  const size = nodeSize(source);
  return findFreePosition(nodes.filter((node) => node.id !== source.id), { x: source.position.x + size.width + 96, y: source.position.y });
}
