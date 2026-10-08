import { randomUUID } from './random-id';
import type { Edge, Node, Viewport } from '@xyflow/react';
import { serializeEdges, serializeNodes } from './graph';
import examples from './workflow-examples.json';
import lunarExamples from './lunar-examples.json';
import glowbudExample from './glowbud-example.json';

export type WorkflowTemplateId = 'glowbud' | 'lunar-cache' | 'lunar-ui' | 'image' | '3d' | 'characters' | 'ui-kits' | 'materials';
export type WorkflowTemplate = {
  id: WorkflowTemplateId;
  title: string;
  projectName: string;
  description: string;
  input: string;
  output: string;
  featured?: boolean;
  coverUrl?: string;
  nodes: Array<Node<Record<string, unknown>>>;
  edges: Edge[];
  viewport: Viewport;
};
export type WorkflowTemplateInstance = {
  templateId: WorkflowTemplateId;
  name: string;
  nodes: Array<Node<Record<string, unknown>>>;
  edges: Edge[];
  viewport: Viewport;
};

const catalog: Array<Omit<WorkflowTemplate, 'nodes' | 'edges' | 'viewport'>> = [
  { id: 'glowbud', title: 'Glowbud · Creature laboratory', projectName: 'Glowbud · Creature laboratory', description: 'Non-humanoid creature: silhouette variants → body and accessory → four views, expressions, growth and a real GLB.', input: 'Meshtint design reference and an original four-legged seed creature', output: 'Two transparent atlases, four expressions, growth stages and a static 3D model', featured: true, coverUrl: '/workflow-examples/glowbud-presentation.png' },
  { id: 'lunar-cache', title: 'Lunar Relay · Prop laboratory', projectName: 'Lunar Relay · Prop laboratory', description: 'Three design variants → two states → sprite atlas. A parallel ceramic PBR branch and a final presentation.', input: 'Original moon station art, three functional designs and authored prompts', output: 'State atlas, seven material maps and a finished presentation', featured: true, coverUrl: '/workflow-examples/lunar-cache-board.png' },
  { id: 'lunar-ui', title: 'Lunar Relay · Interface kit', projectName: 'Lunar Relay · Interface kit', description: 'Parallel loot and panel workflows → two exportable atlases → a finished inventory screen.', input: 'Original scene, cache states, four loot icons and four interface elements', output: 'Loot atlas, relative UI atlas and a finished screen mockup', featured: true, coverUrl: '/workflow-examples/lunar-mockup.png' },
  { id: 'image', title: 'Image', projectName: 'Example · Modular tunnel', description: 'References → variations → targeted edits → finished game module.', input: 'Three image references and the original prompts', output: 'A finished modular tunnel with every intermediate image' },
  { id: '3d', title: '3D', projectName: 'Example · Character to 3D', description: 'Character → views → isolated body → a finished GLB model.', input: 'A character image and four turnaround views', output: 'A real 3D model you can rotate, inspect and download' },
  { id: 'characters', title: 'Characters', projectName: 'Example · Character breakdown', description: 'Source → turnaround → selected parts → isolated body views.', input: 'A character image, identity prompts and props analysis', output: 'Four completed body views, with the Front extracted' },
  { id: 'ui-kits', title: 'UI kits', projectName: 'Example · UI rank atlas', description: 'UI sheet → four isolated rank sprites → packed PNG and JSON.', input: 'A UI sheet with reviewed bounds and a selected group', output: 'A finished transparent sprite atlas and its manifest' },
  { id: 'materials', title: 'Materials', projectName: 'Example · Seamless PBR material', description: 'Surface reference → seamless texture → seven finished PBR maps.', input: 'A surface reference, the original prompt and build settings', output: 'Base color, Normal, Height, Roughness, Metallic, AO and ORM' },
];

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = catalog.map((entry) => ({
  ...entry,
  ...(({ ...examples, ...lunarExamples, ...glowbudExample }[entry.id]) as { nodes: Array<Node<Record<string, unknown>>>; edges: Edge[]; viewport: Viewport }),
}));

export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((template) => template.id === id);
}
export function filterWorkflowTemplates(query: string, templates: WorkflowTemplate[] = WORKFLOW_TEMPLATES): WorkflowTemplate[] {
  const term = query.trim().toLowerCase();
  if (!term) return templates;
  return templates.filter((template) => (
    `${template.title} ${template.projectName} ${template.description} ${template.input} ${template.output}`
      .toLowerCase().includes(term)
  ));
}
export function instantiateTemplate(id: string): WorkflowTemplateInstance {
  const template = getWorkflowTemplate(id);
  if (!template) throw new Error(`Unknown workflow template: ${id}`);
  const idMap = new Map(template.nodes.map((source) => [source.id, `${source.type || 'node'}-${randomUUID()}`]));
  const nodes = template.nodes.map((source) => ({
    ...structuredClone(source), id: idMap.get(source.id)!,
    data: remapNodeReferences(source.data, idMap) as Record<string, unknown>,
  }));
  const edges = template.edges.map((source) => ({
    ...structuredClone(source), id: `edge-${randomUUID()}`,
    source: idMap.get(source.source)!, target: idMap.get(source.target)!,
  }));
  return { templateId: template.id, name: template.projectName, nodes: serializeNodes(nodes), edges: serializeEdges(edges), viewport: { ...template.viewport } };
}
function remapNodeReferences(value: unknown, ids: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((child) => remapNodeReferences(child, ids));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    ['nodeId', 'sourceNodeId', 'spawnedNodeId'].includes(key) && typeof child === 'string'
      ? ids.get(child) : remapNodeReferences(child, ids),
  ]));
  return value;
}
