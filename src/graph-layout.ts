import type { Edge, Node } from '@xyflow/react';
import type { ImageNodeData, SmartSeparationItem, SmartSeparationNodeData } from './types';

export const IMAGE_CARD_SIZE = { width: 250, height: 278 };
export const SMART_SEPARATION_SIZE = { width: 650, height: 720 };
export const BRANCH_PARENT_GAP = 88;
export const BRANCH_COLUMN_GAP = 36;
export const BRANCH_ROW_GAP = 32;
export const BRANCH_MAX_ROWS = 6;

export type LayoutCard = {
  id: string;
  groupId?: string | null;
};

export type ColumnLayout = {
  id: string;
  position: { x: number; y: number };
  column: number;
  row: number;
  groupId?: string | null;
};

export function layoutGroupedColumns(options: {
  origin: { x: number; y: number };
  parentSize?: { width?: number; height?: number };
  groups?: Array<{ id: string }>;
  cards: LayoutCard[];
  cardSize?: { width: number; height: number };
  parentGap?: number;
  columnGap?: number;
  rowGap?: number;
  maxRows?: number;
}): ColumnLayout[] {
  const cardSize = options.cardSize || IMAGE_CARD_SIZE;
  const parentGap = options.parentGap ?? BRANCH_PARENT_GAP;
  const columnGap = options.columnGap ?? BRANCH_COLUMN_GAP;
  const rowGap = options.rowGap ?? BRANCH_ROW_GAP;
  const maxRows = Math.max(1, options.maxRows ?? BRANCH_MAX_ROWS);
  const startX = options.origin.x + (options.parentSize?.width || SMART_SEPARATION_SIZE.width) + parentGap;
  const startY = options.origin.y;
  const groupOrder = [
    ...(options.groups || []).map((group) => group.id),
    ...options.cards.map((card) => card.groupId || ''),
  ].filter((groupId, index, all) => all.indexOf(groupId) === index);

  const result: ColumnLayout[] = [];
  let column = 0;
  for (const groupId of groupOrder) {
    const cards = options.cards.filter((card) => (card.groupId || '') === groupId);
    if (!cards.length) continue;
    for (let index = 0; index < cards.length; index += 1) {
      const localColumn = Math.floor(index / maxRows);
      const row = index % maxRows;
      result.push({
        id: cards[index].id,
        groupId: cards[index].groupId || null,
        column: column + localColumn,
        row,
        position: {
          x: startX + (column + localColumn) * (cardSize.width + columnGap),
          y: startY + row * (cardSize.height + rowGap),
        },
      });
    }
    column += Math.ceil(cards.length / maxRows);
  }
  return result;
}

export function smartSeparationSourceHandle(groupId?: string | null): string | undefined {
  return groupId ? `group:${groupId}` : undefined;
}

export function findSmartSeparationCardId(
  item: Pick<SmartSeparationItem, 'id' | 'outputUrl' | 'rawOutputUrl'>,
  parentId: string,
  nodes: Node[],
  edges: Edge[],
): string | undefined {
  const byItemId = nodes.find((node) => node.type === 'image' && (node.data as ImageNodeData).sourceItemId === item.id);
  if (byItemId) return byItemId.id;
  const edge = edges.find((entry) => entry.source === parentId && (
    entry.id.includes(item.id)
    || (entry.data as { itemId?: string } | undefined)?.itemId === item.id
  ));
  if (edge && nodes.some((node) => node.id === edge.target)) return edge.target;
  const url = item.outputUrl || item.rawOutputUrl;
  if (!url) return undefined;
  return nodes.find((node) => node.type === 'image' && (node.data as ImageNodeData).imageUrl === url)?.id;
}

export function applySmartSeparationLayout(parent: Node, nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  if (parent.type !== 'smartSeparation') return { nodes, edges };
  const data = parent.data as SmartSeparationNodeData;
  const items = data.items.filter((item) => item.enabled && (item.outputUrl || item.rawOutputUrl));
  const cards = items.flatMap((item) => {
    const id = findSmartSeparationCardId(item, parent.id, nodes, edges);
    return id ? [{ id, groupId: item.groupId || null, itemId: item.id }] : [];
  });
  if (!cards.length) return { nodes, edges };

  const positions = layoutGroupedColumns({
    origin: parent.position,
    parentSize: { width: parent.measured?.width, height: parent.measured?.height },
    groups: data.groups,
    cards,
  });
  const positionById = new Map(positions.map((entry) => [entry.id, entry.position]));
  const cardIds = new Set(cards.map((card) => card.id));
  const nextNodes = nodes.map((node) => {
    const position = positionById.get(node.id);
    if (!position) return node;
    const card = cards.find((entry) => entry.id === node.id);
    const current = node.data as ImageNodeData;
    return {
      ...node,
      position,
      data: {
        ...current,
        sourceItemId: card?.itemId || current.sourceItemId,
        sourceGroupId: card?.groupId || current.sourceGroupId,
        hasInput: true,
      },
    };
  });
  const nextEdges = [
    ...edges.filter((edge) => !(edge.source === parent.id && cardIds.has(edge.target))),
    ...cards.map((card) => ({
      id: `edge-${parent.id}-${card.itemId}-${card.id}`,
      source: parent.id,
      sourceHandle: smartSeparationSourceHandle(card.groupId),
      target: card.id,
      type: 'smoothstep',
      animated: true,
      data: { itemId: card.itemId },
    } satisfies Edge)),
  ];
  return { nodes: nextNodes, edges: nextEdges };
}

export function arrangeSmartSeparationGraphs(nodes: Node[], edges: Edge[], parentIds?: string[]): { nodes: Node[]; edges: Edge[] } {
  const parents = nodes.filter((node) => {
    if (node.type !== 'smartSeparation') return false;
    if (parentIds?.length) return parentIds.includes(node.id);
    return edges.some((edge) => edge.source === node.id);
  });
  return parents.reduce((graph, parent) => applySmartSeparationLayout(parent, graph.nodes, graph.edges), { nodes, edges });
}

export function readySmartSeparationItems(data: SmartSeparationNodeData): SmartSeparationItem[] {
  return data.items.filter((item) => item.enabled && (item.outputUrl || item.rawOutputUrl));
}

export function createSmartSeparationCard(item: SmartSeparationItem, position: { x: number; y: number }): Node {
  const slug = String(item.name || 'element').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'element';
  return {
    id: `image-${crypto.randomUUID()}`,
    type: 'image',
    position,
    data: {
      title: item.name || 'Element',
      imageUrl: item.outputUrl || item.rawOutputUrl || '',
      fileName: `${slug}.png`,
      assetId: item.outputAssetId,
      hasInput: true,
      sourceItemId: item.id,
      sourceGroupId: item.groupId,
    } satisfies ImageNodeData,
  };
}

export function unpackSmartSeparationCards(parent: Node, nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[]; added: number; arranged: number } {
  if (parent.type !== 'smartSeparation') return { nodes, edges, added: 0, arranged: 0 };
  const items = readySmartSeparationItems(parent.data as SmartSeparationNodeData);
  const created: Node[] = [];
  let workingNodes = nodes;
  let workingEdges = edges;
  for (const item of items) {
    if (findSmartSeparationCardId(item, parent.id, workingNodes, workingEdges)) continue;
    const card = createSmartSeparationCard(item, { x: parent.position.x, y: parent.position.y });
    created.push(card);
    workingNodes = [...workingNodes, card];
    workingEdges = [...workingEdges, {
      id: `edge-${parent.id}-${item.id}-${card.id}`,
      source: parent.id,
      sourceHandle: smartSeparationSourceHandle(item.groupId),
      target: card.id,
      type: 'smoothstep',
      animated: true,
      data: { itemId: item.id },
    }];
  }
  const arranged = applySmartSeparationLayout(parent, workingNodes, workingEdges);
  return { ...arranged, added: created.length, arranged: items.length };
}

export function downloadFileName(name?: string | null, fallback = 'asset.png'): string {
  const cleaned = String(name || fallback).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || fallback;
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(cleaned)) return cleaned;
  const extension = /\.(png|jpe?g|webp|gif|bmp)$/i.exec(fallback)?.[0] || '.png';
  return `${cleaned.replace(/\.+$/, '')}${extension}`;
}
