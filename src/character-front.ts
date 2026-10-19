import type { Edge, Node } from '@xyflow/react';
import { buildCharacterViewPrompt, normalizeCharacterPose } from './character-views';
import type { CharacterFrontNodeData, CharacterViewsNodeData, ViewKey } from './types';

export function createCharacterFrontData(): CharacterFrontNodeData {
  return { title: 'Character Front', prompt: '', pose: 'a-pose', provider: 'global', status: 'idle' };
}

export function buildCharacterFrontPrompt(description: string, pose: unknown): string {
  return `${description.trim()}\n\n${buildCharacterViewPrompt({ view: 'front', pose })}\n\nGenerate exactly one image of one character, full body, facing directly forward. No turnaround sheet, additional angles, panels or duplicate figures.`;
}

// Remember the borrowed source separately so a manually regenerated Front stays in place.
export function syncCharacterFrontInputs(nodes: Node[], edges: Edge[]): Node[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.type !== 'characterViews') return node;
    const data = node.data as CharacterViewsNodeData;
    if (data.subjectKind === 'prop') return node;
    const incoming = edges.filter((edge) => edge.target === node.id);
    const source = incoming.length === 1 ? nodes.find((entry) => entry.id === incoming[0].source && entry.type === 'characterFront') : undefined;
    const sourceData = source?.data as CharacterFrontNodeData | undefined;
    const front = data.views.front;
    if (front.status === 'queued' || front.status === 'running') return node;
    if (!source || !sourceData?.outputUrl) {
      if (!data.linkedFront) return node;
      changed = true;
      const borrowed = front.outputUrl === data.linkedFront.outputUrl && !front.jobId;
      return { ...node, data: { ...data, linkedFront: undefined, views: borrowed ? { ...data.views, front: { key: front.key, title: front.title, prompt: front.prompt, status: 'idle' } } : data.views } };
    }
    const pose = normalizeCharacterPose(sourceData.outputPoses?.[sourceData.outputUrl] ?? sourceData.outputPose ?? sourceData.pose);
    if (data.linkedFront?.nodeId === source.id && data.linkedFront.outputUrl === sourceData.outputUrl && data.linkedFront.pose === pose) return node;
    changed = true;
    return { ...node, data: {
      ...data,
      pose,
      linkedFront: { nodeId: source.id, outputUrl: sourceData.outputUrl, pose },
      views: { ...data.views, front: { key: front.key, title: front.title, prompt: front.prompt, status: 'completed', outputUrl: sourceData.outputUrl, sourceUrl: sourceData.outputUrl, progress: 'From Character Front' } },
    } };
  });
  return changed ? next : nodes;
}

export function characterViewRunKeys(data: CharacterViewsNodeData, onlyMissing: boolean): ViewKey[] {
  return (['front', 'left', 'back', 'right'] as ViewKey[]).filter((key) => {
    if (data.linkedFront && key === 'front' && data.views.front.outputUrl) return false;
    return !onlyMissing || !data.views[key].outputUrl;
  });
}
