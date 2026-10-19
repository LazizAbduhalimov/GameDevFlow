import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { buildCharacterFrontPrompt, characterViewRunKeys, createCharacterFrontData, syncCharacterFrontInputs } from '../../src/character-front';
import { CHARACTER_VIEW_KEYS, CHARACTER_VIEW_SPECS } from '../../src/character-views';
import { serializeNodes } from '../../src/graph';
import type { CharacterFrontNodeData, CharacterViewsNodeData } from '../../src/types';

function fixture() {
  const front: Node<CharacterFrontNodeData> = { id: 'front', type: 'characterFront', position: { x: 0, y: 0 }, data: { ...createCharacterFrontData(), pose: 't-pose', outputPose: 't-pose', outputUrl: '/front.png', status: 'completed' } };
  const views: Node<CharacterViewsNodeData> = { id: 'views', type: 'characterViews', position: { x: 400, y: 0 }, data: {
    title: 'Character views', basePrompt: '', pose: 'a-pose',
    views: Object.fromEntries(CHARACTER_VIEW_KEYS.map((key) => [key, { key, ...CHARACTER_VIEW_SPECS[key], status: 'idle' }])) as CharacterViewsNodeData['views'],
  } };
  const edges: Edge[] = [{ id: 'link', source: front.id, target: views.id }];
  return { front, views, nodes: [front, views], edges };
}

describe('Character Front to Multi View', () => {
  it('constrains generation to a single full-body frontal image in the selected pose', () => {
    const prompt = buildCharacterFrontPrompt('A green robot', 't-pose');
    expect(prompt).toContain('A green robot');
    expect(prompt).toContain('production T-pose');
    expect(prompt).toContain('front orthographic');
    expect(prompt).toContain('exactly one image of one character');
    expect(buildCharacterFrontPrompt('', undefined)).toContain('production A-pose');
  });

  it('copies the front URL and actual output pose, keeping the other slots empty', () => {
    const { nodes, edges } = fixture();
    const next = syncCharacterFrontInputs(nodes, edges);
    const data = next[1].data as CharacterViewsNodeData;
    expect(data.views.front.outputUrl).toBe('/front.png');
    expect(data.pose).toBe('t-pose');
    expect(data.views.left.outputUrl).toBeUndefined();
    expect(characterViewRunKeys(data, false)).toEqual(['left', 'back', 'right']);
    expect(syncCharacterFrontInputs(next, edges)).toBe(next);
  });

  it('preserves a manual Front regeneration until the connected source changes', () => {
    const { nodes, edges } = fixture();
    const linked = syncCharacterFrontInputs(nodes, edges);
    const data = linked[1].data as CharacterViewsNodeData;
    data.views.front = { ...data.views.front, outputUrl: '/regenerated.png', jobId: 'manual' };
    expect(syncCharacterFrontInputs(linked, edges)).toBe(linked);
    linked[0] = { ...linked[0], data: { ...linked[0].data, outputUrl: '/new-front.png' } };
    const updated = syncCharacterFrontInputs(linked, edges)[1].data as CharacterViewsNodeData;
    expect(updated.views.front.outputUrl).toBe('/new-front.png');
    expect(updated.views.front.jobId).toBeUndefined();
  });

  it('fills Front when the source finishes after the connection was created', () => {
    const { nodes, edges } = fixture();
    const url = nodes[0].data.outputUrl;
    nodes[0].data.outputUrl = undefined;
    expect(syncCharacterFrontInputs(nodes, edges)).toBe(nodes);
    nodes[0].data.outputUrl = url;
    expect((syncCharacterFrontInputs(nodes, edges)[1].data as CharacterViewsNodeData).views.front.outputUrl).toBe(url);
  });

  it('defers source updates while Front is regenerating', () => {
    const { nodes, edges } = fixture();
    const linked = syncCharacterFrontInputs(nodes, edges);
    const data = linked[1].data as CharacterViewsNodeData;
    data.views.front.status = 'running';
    linked[0].data.outputUrl = '/next.png';
    expect(syncCharacterFrontInputs(linked, edges)).toBe(linked);
    data.views.front.status = 'completed';
    expect((syncCharacterFrontInputs(linked, edges)[1].data as CharacterViewsNodeData).views.front.outputUrl).toBe('/next.png');
  });

  it('removes borrowed Front on disconnect but keeps a manual replacement', () => {
    const { nodes, edges } = fixture();
    const linked = syncCharacterFrontInputs(nodes, edges);
    const disconnected = syncCharacterFrontInputs(linked, [])[1].data as CharacterViewsNodeData;
    expect(disconnected.linkedFront).toBeUndefined();
    expect(disconnected.views.front.outputUrl).toBeUndefined();
    const data = linked[1].data as CharacterViewsNodeData;
    data.views.front.outputUrl = '/manual.png';
    data.views.front.jobId = 'manual';
    expect((syncCharacterFrontInputs(linked, [])[1].data as CharacterViewsNodeData).views.front.outputUrl).toBe('/manual.png');
  });

  it('retains imported Front and manual replacements across project serialization', () => {
    const { nodes, edges } = fixture();
    const linked = syncCharacterFrontInputs(nodes, edges);
    const data = linked[1].data as CharacterViewsNodeData;
    data.views.front.outputUrl = '/manual.png';
    const reloaded = JSON.parse(JSON.stringify(serializeNodes(linked))) as Node[];
    expect(syncCharacterFrontInputs(reloaded, edges)).toBe(reloaded);
    expect((reloaded[1].data as CharacterViewsNodeData).views.front.outputUrl).toBe('/manual.png');
  });

  it('uses the saved output pose when an earlier image version is restored', () => {
    const { nodes, edges } = fixture();
    nodes[0].data.outputPose = 't-pose';
    nodes[0].data.outputPoses = { '/front.png': 'a-pose' };
    const data = syncCharacterFrontInputs(nodes, edges)[1].data as CharacterViewsNodeData;
    expect(data.pose).toBe('a-pose');
  });

  it('keeps existing image and prop workflows unchanged', () => {
    const { nodes, edges } = fixture();
    nodes[0].type = 'image';
    expect(syncCharacterFrontInputs(nodes, edges)).toBe(nodes);
    expect(characterViewRunKeys(nodes[1].data, false)).toEqual(CHARACTER_VIEW_KEYS);
    nodes[0].type = 'characterFront';
    nodes[1].data.subjectKind = 'prop';
    expect(syncCharacterFrontInputs(nodes, edges)).toBe(nodes);
  });
});
