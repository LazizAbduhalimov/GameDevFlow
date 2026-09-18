import type { Edge, Node, Viewport } from '@xyflow/react';
import { serializeEdges, serializeNodes } from './graph';
import { CHARACTER_IDENTITY_PROMPT, CHARACTER_VIEW_KEYS, CHARACTER_VIEW_SPECS } from './character-views';
import { createCharacterPartsData } from './character-parts';
import type {
  CharacterPartsNodeData,
  CharacterViewsNodeData,
  GeneratorNodeData,
  MaterialMapKey,
  MaterialMapsNodeData,
  MultiGenerateNodeData,
  SeamlessTextureNodeData,
  SmartSeparationNodeData,
  SpriteAtlasNodeData,
} from './types';

export type WorkflowTemplateId = 'image' | '3d' | 'characters' | 'ui-kits' | 'materials';

export type WorkflowTemplate = {
  id: WorkflowTemplateId;
  title: string;
  projectName: string;
  description: string;
  input: string;
  output: string;
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

const EDGE = {
  type: 'default' as const,
  animated: true,
  style: { stroke: '#a6d9f5', strokeWidth: 1.8 },
};

const ALL_VIEWS_EDGE = {
  ...EDGE,
  style: { stroke: '#a6d9f5', strokeWidth: 2 },
};

const NODE_ID_PREFIX: Record<string, string> = {
  generator: 'generator',
  characterViews: 'character-views',
  characterParts: 'character-parts',
  multiGenerate: 'multi-generate',
  smartSeparation: 'smart-separation',
  spriteAtlas: 'sprite-atlas',
  seamlessTexture: 'seamless-texture',
  materialMaps: 'material-maps',
};

const MATERIAL_MAP_KEYS: MaterialMapKey[] = ['baseColor', 'normal', 'height', 'roughness', 'metallic', 'ambientOcclusion', 'orm'];
const MATERIAL_MAP_TITLES: Record<MaterialMapKey, string> = {
  baseColor: 'Base color',
  normal: 'Normal',
  height: 'Height',
  roughness: 'Roughness',
  metallic: 'Metallic',
  ambientOcclusion: 'Ambient occlusion',
  orm: 'Packed ORM',
};

function node(
  id: string,
  type: string,
  position: { x: number; y: number },
  data: Record<string, unknown>,
): Node<Record<string, unknown>> {
  return { id, type, position, data };
}

function edge(id: string, source: string, target: string, options: Partial<Edge> = {}): Edge {
  return { id, source, target, ...EDGE, ...options };
}

function generatorData(): GeneratorNodeData {
  return { title: 'Generate image', prompt: '', provider: 'global', status: 'idle' };
}

function multiGenerateData(): MultiGenerateNodeData {
  return {
    title: 'Multi Generate',
    prompt: 'Create a polished game-ready variation of this image. Preserve the core subject while exploring a distinct visual solution.',
    variantCount: 3,
    selectedVariantKey: 'variant-1',
    provider: 'global',
    generationMode: 'turbo',
    variants: Array.from({ length: 3 }, (_, index) => ({
      key: `variant-${index + 1}`,
      title: `Variant ${index + 1}`,
      index,
      status: 'idle',
    })),
  };
}

function characterViewsData(): CharacterViewsNodeData {
  return {
    title: 'Character views',
    provider: 'global',
    generationMode: 'turbo',
    pose: 'a-pose',
    basePrompt: CHARACTER_IDENTITY_PROMPT,
    views: Object.fromEntries(CHARACTER_VIEW_KEYS.map((key) => [key, {
      key,
      title: CHARACTER_VIEW_SPECS[key].title,
      prompt: CHARACTER_VIEW_SPECS[key].prompt,
      status: 'idle',
    }])) as CharacterViewsNodeData['views'],
  };
}

function characterPartsData(): CharacterPartsNodeData {
  return createCharacterPartsData();
}

function smartSeparationData(): SmartSeparationNodeData {
  return {
    title: 'Smart Separation',
    status: 'idle',
    userHint: '',
    sources: [],
    items: [],
    groups: [],
    activeSourceIndex: 0,
    expanded: true,
    settings: { packingMode: 'relative', tolerance: 15, cropPadding: 3, pixelArt: false, cellSize: 256, atlasSize: 1024, atlasPadding: 8 },
  };
}

function spriteAtlasData(): SpriteAtlasNodeData {
  return {
    title: 'Sprite Atlas',
    status: 'idle',
    settings: { cellSize: 256, gutter: 8, outerMargin: 8, columns: 'auto', safeArea: 0.8, pixelArt: false, powerOfTwo: false },
  };
}

function seamlessTextureData(): SeamlessTextureNodeData {
  return {
    title: 'Seamless Texture',
    prompt: 'Create a clean game-ready surface material based on this reference. Preserve the material character and scale while removing directional lighting and unique landmarks.',
    provider: 'global',
    status: 'idle',
    settings: { outputSize: 1024, edgeBlend: 0.08 },
  };
}

function materialMapsData(): MaterialMapsNodeData {
  return {
    title: 'PBR Material Maps',
    status: 'idle',
    maps: Object.fromEntries(MATERIAL_MAP_KEYS.map((key) => [key, {
      key,
      title: MATERIAL_MAP_TITLES[key],
    }])) as MaterialMapsNodeData['maps'],
    settings: {
      normalStrength: 2.5,
      normalFormat: 'opengl',
      heightContrast: 1.2,
      invertHeight: false,
      roughnessLevel: 0.65,
      metallicLevel: 0,
      detailInfluence: 0.35,
      aoStrength: 3,
    },
  };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'image',
    title: 'Image',
    projectName: 'Image variations',
    description: 'Prompt in, generated image variations out.',
    input: 'A prompt, or a connected source image',
    output: 'Several image variations',
    viewport: { x: 40, y: 80, zoom: 0.92 },
    nodes: [
      node('generator', 'generator', { x: 80, y: 180 }, generatorData()),
      node('multi-generate', 'multiGenerate', { x: 470, y: 212 }, multiGenerateData()),
    ],
    edges: [edge('edge-generator-multi', 'generator', 'multi-generate')],
  },
  {
    id: '3d',
    title: '3D',
    projectName: 'Image to 3D',
    description: 'Character or object in, orthographic views for 3D out.',
    input: 'A connected character or object image',
    output: 'Front, side and back views ready for Tripo',
    viewport: { x: 20, y: 40, zoom: 1 },
    nodes: [node('character-views', 'characterViews', { x: 180, y: 140 }, characterViewsData())],
    edges: [],
  },
  {
    id: 'characters',
    title: 'Characters',
    projectName: 'Character pipeline',
    description: 'Character image in, turnaround views and selectable props out.',
    input: 'A connected character image',
    output: 'Turnaround views and extracted 4-view props',
    viewport: { x: 10, y: 20, zoom: 0.82 },
    nodes: [
      node('character-views', 'characterViews', { x: 80, y: 120 }, characterViewsData()),
      node('character-parts', 'characterParts', { x: 470, y: 140 }, characterPartsData()),
    ],
    edges: [edge('edge-views-parts', 'character-views', 'character-parts', { sourceHandle: 'all', ...ALL_VIEWS_EDGE })],
  },
  {
    id: 'ui-kits',
    title: 'UI kits',
    projectName: 'UI kit',
    description: 'UI sheet in, packed sprite atlas out.',
    input: 'A connected UI sheet or screenshot',
    output: 'Separated elements packed into a sprite atlas',
    viewport: { x: -40, y: -10, zoom: 0.72 },
    nodes: [
      node('smart-separation', 'smartSeparation', { x: 40, y: 80 }, smartSeparationData()),
      node('sprite-atlas', 'spriteAtlas', { x: 780, y: 200 }, spriteAtlasData()),
    ],
    edges: [edge('edge-smart-atlas', 'smart-separation', 'sprite-atlas')],
  },
  {
    id: 'materials',
    title: 'Materials',
    projectName: 'Seamless material',
    description: 'Surface reference in, tileable PBR maps out.',
    input: 'A connected material or surface image',
    output: 'Seamless texture and PBR maps',
    viewport: { x: 20, y: 40, zoom: 0.86 },
    nodes: [
      node('seamless-texture', 'seamlessTexture', { x: 80, y: 160 }, seamlessTextureData()),
      node('material-maps', 'materialMaps', { x: 490, y: 110 }, materialMapsData()),
    ],
    edges: [edge('edge-seamless-maps', 'seamless-texture', 'material-maps', { sourceHandle: 'baseColor' })],
  },
];

export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((template) => template.id === id);
}

export function filterWorkflowTemplates(query: string, templates: WorkflowTemplate[] = WORKFLOW_TEMPLATES): WorkflowTemplate[] {
  const term = query.trim().toLowerCase();
  if (!term) return templates;
  return templates.filter((template) => (
    `${template.title} ${template.projectName} ${template.description} ${template.input} ${template.output}`
      .toLowerCase()
      .includes(term)
  ));
}

export function instantiateTemplate(id: string): WorkflowTemplateInstance {
  const template = getWorkflowTemplate(id);
  if (!template) throw new Error(`Unknown workflow template: ${id}`);
  const idMap = new Map<string, string>();
  const nodes = template.nodes.map((source) => {
    const prefix = NODE_ID_PREFIX[source.type || ''] || source.type || 'node';
    const nextId = `${prefix}-${crypto.randomUUID()}`;
    idMap.set(source.id, nextId);
    return { ...structuredClone(source), id: nextId };
  });
  const edges = template.edges.map((source) => ({
    ...structuredClone(source),
    id: `edge-${crypto.randomUUID()}`,
    source: idMap.get(source.source) || source.source,
    target: idMap.get(source.target) || source.target,
  }));
  return {
    templateId: template.id,
    name: template.projectName,
    nodes: serializeNodes(nodes),
    edges: serializeEdges(edges),
    viewport: { ...template.viewport },
  };
}
