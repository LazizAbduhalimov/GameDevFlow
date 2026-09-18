import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import {
  applySmartSeparationLayout,
  CHARACTER_PARTS_SIZE,
  downloadFileName,
  IMAGE_CARD_SIZE,
  layoutGroupedColumns,
  layoutPropViewStack,
  nextPropViewPosition,
  PROP_VIEW_GAP,
  PROP_VIEW_PARENT_GAP,
  PROP_VIEW_SIZE,
  SMART_SEPARATION_SIZE,
  unpackSmartSeparationCards,
} from '../../src/graph-layout';
import type { SmartSeparationItem, SmartSeparationNodeData } from '../../src/types';

function item(id: string, name: string, groupId: string): SmartSeparationItem {
  return {
    id, sourceIndex: 0, sourceUrl: '/data/assets/sheet', sourceAssetId: 'sheet', name, role: 'icon',
    description: name, bounds: { x: 0, y: 0, width: 10, height: 10 }, enabled: true, groupId,
    outputUrl: `/data/generated/${id}`, outputAssetId: id, generationMethod: 'imagegen', generationStatus: 'completed',
  };
}

function parentNode(groups: Array<{ id: string; name: string }>, items: SmartSeparationItem[]): Node {
  return {
    id: 'smart-1',
    type: 'smartSeparation',
    position: { x: 100, y: 200 },
    data: {
      title: 'Smart Separation',
      status: 'review',
      userHint: '',
      sources: [],
      items,
      groups: groups.map((group) => ({ id: group.id, name: group.name, slug: group.id, status: 'idle' })),
      settings: { tolerance: 12, cropPadding: 4, packingMode: 'relative', atlasSize: 1024, cellSize: 256, atlasPadding: 8, pixelArt: false },
      activeSourceIndex: 0,
      expanded: true,
    } satisfies SmartSeparationNodeData,
  };
}

describe('grouped card layout', () => {
  it('places each group in its own column with even vertical spacing', () => {
    const layout = layoutGroupedColumns({
      origin: { x: 100, y: 200 },
      groups: [{ id: 'frames' }, { id: 'ranks' }],
      cards: [
        { id: 'a', groupId: 'frames' },
        { id: 'b', groupId: 'frames' },
        { id: 'c', groupId: 'ranks' },
      ],
    });
    expect(layout.map((entry) => ({ id: entry.id, column: entry.column, row: entry.row }))).toEqual([
      { id: 'a', column: 0, row: 0 },
      { id: 'b', column: 0, row: 1 },
      { id: 'c', column: 1, row: 0 },
    ]);
    expect(layout[0].position).toEqual({ x: 100 + SMART_SEPARATION_SIZE.width + 88, y: 200 });
    expect(layout[1].position.y - layout[0].position.y).toBe(IMAGE_CARD_SIZE.height + 32);
    expect(layout[2].position.x - layout[0].position.x).toBe(IMAGE_CARD_SIZE.width + 36);
  });

  it('stacks cards by measured height instead of a fixed slot', () => {
    const layout = layoutGroupedColumns({
      origin: { x: 100, y: 200 },
      groups: [{ id: 'frames' }],
      cards: [
        { id: 'a', groupId: 'frames', height: 420 },
        { id: 'b', groupId: 'frames', height: 180 },
      ],
    });
    expect(layout[0].position.y).toBe(200);
    expect(layout[1].position.y - layout[0].position.y).toBe(420 + 32);
  });

  it('wraps a long group into extra columns instead of one tall stack', () => {
    const layout = layoutGroupedColumns({
      origin: { x: 0, y: 0 },
      groups: [{ id: 'icons' }],
      maxRows: 2,
      cards: [
        { id: '1', groupId: 'icons' },
        { id: '2', groupId: 'icons' },
        { id: '3', groupId: 'icons' },
      ],
    });
    expect(layout.map((entry) => [entry.id, entry.column, entry.row])).toEqual([
      ['1', 0, 0],
      ['2', 0, 1],
      ['3', 1, 0],
    ]);
  });
});

describe('smart separation unpack layout', () => {
  it('creates missing cards, routes edges from group handles, and keeps even columns', () => {
    const groups = [{ id: 'frames', name: 'Frames' }, { id: 'ranks', name: 'Ranks' }];
    const items = [item('item-a', 'Blue frame', 'frames'), item('item-b', 'Gold rank', 'ranks')];
    const parent = parentNode(groups, items);
    const result = unpackSmartSeparationCards(parent, [parent], []);
    expect(result.added).toBe(2);
    expect(result.arranged).toBe(2);
    const cards = result.nodes.filter((node) => node.type === 'image');
    expect(cards).toHaveLength(2);
    expect(cards[0].position.x).toBeLessThan(cards[1].position.x);
    expect(result.edges.map((edge) => edge.sourceHandle)).toEqual(['group:frames', 'group:ranks']);
    expect(result.edges.every((edge) => edge.type === 'default')).toBe(true);
  });

  it('rearranges already unpacked cards instead of duplicating them', () => {
    const groups = [{ id: 'frames', name: 'Frames' }];
    const items = [item('item-a', 'Blue frame', 'frames'), item('item-b', 'Red frame', 'frames')];
    const parent = parentNode(groups, items);
    const existing: Node = {
      id: 'image-existing',
      type: 'image',
      position: { x: 9000, y: 40 },
      data: { title: 'Blue frame', imageUrl: '/data/generated/item-a', fileName: 'blue-frame.png', sourceItemId: 'item-a' },
    };
    const edges: Edge[] = [{ id: 'edge-smart-1-item-a-image-existing', source: 'smart-1', target: 'image-existing' }];
    const result = unpackSmartSeparationCards(parent, [parent, existing], edges);
    expect(result.added).toBe(1);
    expect(result.nodes.filter((node) => node.type === 'image')).toHaveLength(2);
    const first = result.nodes.find((node) => node.id === 'image-existing');
    expect(first?.position).toEqual({ x: 100 + SMART_SEPARATION_SIZE.width + 88, y: 200 });
  });

  it('rewires existing single-column cards onto group handles', () => {
    const groups = [{ id: 'frames', name: 'Frames' }, { id: 'ranks', name: 'Ranks' }];
    const items = [item('item-a', 'Blue frame', 'frames'), item('item-b', 'Gold rank', 'ranks')];
    const parent = parentNode(groups, items);
    const cards: Node[] = [
      { id: 'image-a', type: 'image', position: { x: 800, y: 0 }, data: { title: 'Blue frame', imageUrl: '/data/generated/item-a', fileName: 'blue-frame.png' } },
      { id: 'image-b', type: 'image', position: { x: 800, y: 270 }, data: { title: 'Gold rank', imageUrl: '/data/generated/item-b', fileName: 'gold-rank.png' } },
    ];
    const edges: Edge[] = [
      { id: 'edge-smart-1-item-a-image-a', source: 'smart-1', target: 'image-a' },
      { id: 'edge-smart-1-item-b-image-b', source: 'smart-1', target: 'image-b' },
    ];
    const result = applySmartSeparationLayout(parent, [parent, ...cards], edges);
    expect(result.edges.map((edge) => ({ target: edge.target, handle: edge.sourceHandle }))).toEqual([
      { target: 'image-a', handle: 'group:frames' },
      { target: 'image-b', handle: 'group:ranks' },
    ]);
    expect(result.nodes.find((node) => node.id === 'image-a')?.position.x).toBeLessThan(result.nodes.find((node) => node.id === 'image-b')?.position.x || 0);
  });

  it('stacks already unpacked cards using each node measured height', () => {
    const groups = [{ id: 'frames', name: 'Frames' }];
    const items = [item('item-a', 'Blue frame', 'frames'), item('item-b', 'Red frame', 'frames')];
    const parent = parentNode(groups, items);
    const cards: Node[] = [
      {
        id: 'image-a',
        type: 'image',
        position: { x: 800, y: 0 },
        measured: { width: 304, height: 400 },
        data: { title: 'Blue frame', imageUrl: '/data/generated/item-a', fileName: 'blue-frame.png' },
      },
      {
        id: 'image-b',
        type: 'image',
        position: { x: 800, y: 270 },
        measured: { width: 304, height: 180 },
        data: { title: 'Red frame', imageUrl: '/data/generated/item-b', fileName: 'red-frame.png' },
      },
    ];
    const edges: Edge[] = [
      { id: 'edge-smart-1-item-a-image-a', source: 'smart-1', target: 'image-a' },
      { id: 'edge-smart-1-item-b-image-b', source: 'smart-1', target: 'image-b' },
    ];
    const result = applySmartSeparationLayout(parent, [parent, ...cards], edges);
    const first = result.nodes.find((node) => node.id === 'image-a');
    const second = result.nodes.find((node) => node.id === 'image-b');
    expect(first?.position.y).toBe(200);
    expect((second?.position.y || 0) - (first?.position.y || 0)).toBe(400 + 32);
  });
});

describe('prop view layout', () => {
  it('stacks spawned views to the right of Character Parts', () => {
    const layout = layoutPropViewStack({ x: 100, y: 80 }, 2);
    expect(layout[0]).toEqual({ x: 100 + CHARACTER_PARTS_SIZE.width + PROP_VIEW_PARENT_GAP, y: 80 });
    expect(layout[1].y - layout[0].y).toBe(PROP_VIEW_SIZE.height + PROP_VIEW_GAP);
  });

  it('continues below existing spawned views instead of overlapping', () => {
    const next = nextPropViewPosition({ position: { x: 40, y: 20 } }, [{ position: { x: 500, y: 200 } }]);
    expect(next).toEqual({ x: 500, y: 200 + PROP_VIEW_SIZE.height + PROP_VIEW_GAP });
  });
});

describe('download file names', () => {
  it('adds a png extension when the stored asset name has none', () => {
    expect(downloadFileName('smart-crown-doodle-3528a54b')).toBe('smart-crown-doodle-3528a54b.png');
    expect(downloadFileName('hero-front.png')).toBe('hero-front.png');
    expect(downloadFileName('atlas.webp', 'file.webp')).toBe('atlas.webp');
  });
});
