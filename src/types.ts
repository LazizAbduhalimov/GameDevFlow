import type { Edge, Node, Viewport } from '@xyflow/react';

export type ProviderId = 'codex' | 'gemini';
export type NodeStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type ViewKey = 'front' | 'left' | 'back' | 'right';
export type CharacterPartKey = 'hat' | 'top' | 'pants' | 'shoes' | 'body';
export type MaterialMapKey = 'baseColor' | 'normal' | 'height' | 'roughness' | 'metallic' | 'ambientOcclusion' | 'orm';
export type GenerationMode = 'reliable' | 'fast' | 'turbo';

export type ProviderStatus = {
  id: ProviderId;
  label: string;
  available: boolean;
  connected?: boolean;
  reason?: string;
  capabilities?: Record<string, unknown> | string[];
};

export type AssetRecord = {
  id: string;
  name: string;
  url: string;
  kind: 'source' | 'generated' | 'mask';
  size: number;
  createdAt: string;
  deletedAt?: string | null;
  restoredAt?: string | null;
  thumbnailUrl?: string;
  metadata?: {
    prompt?: string;
    provider?: ProviderId;
    sourceUrl?: string;
    sourceAssetIds?: string[];
    parentAssetIds?: string[];
    jobId?: string;
    view?: ViewKey;
    batchId?: string;
    slotKey?: string;
    assetRole?: 'sprite-atlas' | 'relative-atlas' | 'character-part' | 'seamless-texture' | 'material-map' | 'derived';
    manifest?: Record<string, unknown>;
    [key: string]: unknown;
  };
};

export type ImageNodeData = {
  [key: string]: unknown;
  title: string;
  imageUrl: string;
  fileName: string;
  assetId?: string;
  hasInput?: boolean;
  onBranch?: (nodeId: string, sourceHandle?: string) => void;
  onOpenTripo?: (url: string) => void;
  tripoBusy?: boolean;
  onOpen?: (url: string, title: string, sourceUrl?: string) => void;
};

export type GeneratorNodeData = {
  [key: string]: unknown;
  title: string;
  prompt: string;
  outputUrl?: string;
  sourceUrl?: string;
  sourceUrls?: string[];
  provider?: ProviderId | 'global';
  resolvedProvider?: ProviderId;
  jobId?: string;
  status: NodeStatus;
  progress?: string;
  error?: string;
  enhancingPrompt?: boolean;
  enhancePromptAvailable?: boolean;
  enhancePromptError?: string;
  onEnhancePrompt?: (nodeId: string) => void;
  onPromptChange?: (nodeId: string, prompt: string) => void;
  onProviderChange?: (nodeId: string, provider: ProviderId | 'global') => void;
  onApplyPreset?: (nodeId: string, presetId: string) => void;
  onRun?: (nodeId: string) => void;
  onCancel?: (nodeId: string) => void;
  onBranch?: (nodeId: string, sourceHandle?: string) => void;
  onDownload?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onOpenTripo?: (url: string) => void;
  tripoBusy?: boolean;
  onOpen?: (url: string, title: string, sourceUrl?: string) => void;
};

export type CharacterViewOutput = {
  key: ViewKey;
  title: string;
  prompt: string;
  status: NodeStatus;
  outputUrl?: string;
  sourceUrl?: string;
  jobId?: string;
  progress?: string;
  error?: string;
};

export type CharacterViewsNodeData = {
  [key: string]: unknown;
  title: string;
  basePrompt: string;
  provider?: ProviderId | 'global';
  generationMode?: GenerationMode;
  views: Record<ViewKey, CharacterViewOutput>;
  enhancingPrompt?: boolean;
  enhancePromptAvailable?: boolean;
  enhancePromptError?: string;
  onEnhancePrompt?: (nodeId: string) => void;
  onBasePromptChange?: (nodeId: string, prompt: string) => void;
  onProviderChange?: (nodeId: string, provider: ProviderId | 'global') => void;
  onModeChange?: (nodeId: string, mode: GenerationMode) => void;
  onRunAll?: (nodeId: string, onlyMissing?: boolean) => void;
  onRunView?: (nodeId: string, view: ViewKey) => void;
  onCancelView?: (nodeId: string, view: ViewKey) => void;
  onBranch?: (nodeId: string, sourceHandle?: string) => void;
  onDownloadView?: (nodeId: string, view: ViewKey) => void;
  onDeleteView?: (nodeId: string, view: ViewKey) => void;
  onOpenTripo?: (url: string) => void;
  tripoBusyUrl?: string;
  onOpenTripoMultiview?: (nodeId: string) => void;
  tripoMultiviewBusy?: boolean;
  onExportViews?: (nodeId: string) => void;
  onBuildSpriteSheet?: (nodeId: string) => void;
  onOpen?: (url: string, title: string, sourceUrl?: string) => void;
};

export type VariantOutput = {
  key: string;
  title: string;
  index: number;
  status: NodeStatus;
  outputUrl?: string;
  sourceUrl?: string;
  assetId?: string;
  jobId?: string;
  progress?: string;
  error?: string;
};

export type MultiGenerateNodeData = {
  [key: string]: unknown;
  title: string;
  prompt: string;
  variantCount: number;
  provider?: ProviderId | 'global';
  generationMode?: GenerationMode;
  batchId?: string;
  error?: string;
  enhancingPrompt?: boolean;
  enhancePromptAvailable?: boolean;
  enhancePromptError?: string;
  onEnhancePrompt?: (nodeId: string) => void;
  variants: VariantOutput[];
  onPromptChange?: (nodeId: string, prompt: string) => void;
  onCountChange?: (nodeId: string, count: number) => void;
  onProviderChange?: (nodeId: string, provider: ProviderId | 'global') => void;
  onModeChange?: (nodeId: string, mode: GenerationMode) => void;
  onRunAll?: (nodeId: string, onlyMissing?: boolean) => void;
  onRunVariant?: (nodeId: string, key: string) => void;
  onCancelVariant?: (nodeId: string, key: string) => void;
  onExtractVariant?: (nodeId: string, key: string) => void;
  onDownloadVariant?: (nodeId: string, key: string) => void;
  onDeleteVariant?: (nodeId: string, key: string) => void;
  onOpenTripo?: (url: string) => void;
  tripoBusyUrl?: string;
  onOpen?: (url: string, title: string, sourceUrl?: string) => void;
};

export type CharacterPartGeometry = {
  canvasWidth: number;
  canvasHeight: number;
  anchorX: 0;
  anchorY: 0;
  bounds: { x: number; y: number; width: number; height: number };
  normalizedBounds: { x: number; y: number; width: number; height: number };
  backgroundRemoved: boolean;
  hasTransparency: boolean;
};

export type CharacterPartOutput = {
  key: CharacterPartKey;
  title: string;
  description: string;
  status: NodeStatus;
  outputUrl?: string;
  sourceUrl?: string;
  assetId?: string;
  jobId?: string;
  progress?: string;
  error?: string;
  normalized?: boolean;
  geometry?: CharacterPartGeometry;
};

export type CharacterPartsNodeData = {
  [key: string]: unknown;
  title: string;
  notes: string;
  provider?: ProviderId | 'global';
  generationMode?: GenerationMode;
  batchId?: string;
  inputUrls?: string[];
  error?: string;
  parts: Record<CharacterPartKey, CharacterPartOutput>;
  onNotesChange?: (nodeId: string, notes: string) => void;
  onProviderChange?: (nodeId: string, provider: ProviderId | 'global') => void;
  onModeChange?: (nodeId: string, mode: GenerationMode) => void;
  onRunAll?: (nodeId: string, onlyMissing?: boolean) => void;
  onRunPart?: (nodeId: string, key: CharacterPartKey) => void;
  onCancelPart?: (nodeId: string, key: CharacterPartKey) => void;
  onExtractPart?: (nodeId: string, key: CharacterPartKey) => void;
  onDownloadPart?: (nodeId: string, key: CharacterPartKey) => void;
  onDeletePart?: (nodeId: string, key: CharacterPartKey) => void;
  onExportParts?: (nodeId: string) => void;
  onDownloadManifest?: (nodeId: string) => void;
  onOpen?: (url: string, title: string, sourceUrl?: string) => void;
};

export type SpriteAtlasSettings = {
  cellSize: 64 | 128 | 256 | 512;
  gutter: number;
  outerMargin: number;
  columns: 'auto' | number;
  safeArea: number;
  pixelArt: boolean;
  powerOfTwo: boolean;
};

export type SpriteAtlasNodeData = {
  [key: string]: unknown;
  title: string;
  settings: SpriteAtlasSettings;
  inputUrls?: string[];
  previewUrl?: string;
  outputUrl?: string;
  outputAssetId?: string;
  manifest?: Record<string, unknown>;
  validation?: { valid: number; total: number; issues: string[] };
  status: 'idle' | 'building' | 'completed' | 'failed';
  error?: string;
  onSettingsChange?: (nodeId: string, patch: Partial<SpriteAtlasSettings>) => void;
  onBuild?: (nodeId: string) => void;
  onOpen?: (url: string, title: string) => void;
  onOpenTripo?: (url: string) => void;
  tripoBusy?: boolean;
  onDownloadPng?: (nodeId: string) => void;
  onDownloadJson?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
};

export type RelativeAtlasSettings = {
  canvasSize: 512 | 1024 | 2048;
  padding: number;
  outerMargin: number;
  pixelArt: boolean;
};

export type RelativeAtlasNodeData = {
  [key: string]: unknown;
  title: string;
  settings: RelativeAtlasSettings;
  inputUrls?: string[];
  previewUrl?: string;
  outputUrl?: string;
  outputAssetId?: string;
  manifest?: Record<string, unknown>;
  validation?: { valid: number; total: number; issues: string[] };
  status: 'idle' | 'building' | 'completed' | 'failed';
  error?: string;
  onSettingsChange?: (nodeId: string, patch: Partial<RelativeAtlasSettings>) => void;
  onBuild?: (nodeId: string) => void;
  onOpen?: (url: string, title: string) => void;
  onOpenTripo?: (url: string) => void;
  tripoBusy?: boolean;
  onDownloadPng?: (nodeId: string) => void;
  onDownloadJson?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
};

export type SeamlessTextureSettings = {
  outputSize: 512 | 1024 | 2048;
  edgeBlend: 0.04 | 0.08 | 0.12 | 0.16;
};

export type SeamlessTextureNodeData = {
  [key: string]: unknown;
  title: string;
  prompt: string;
  settings: SeamlessTextureSettings;
  provider?: ProviderId | 'global';
  status: NodeStatus;
  progress?: string;
  error?: string;
  jobId?: string;
  rawOutputUrl?: string;
  rawAssetId?: string;
  outputUrl?: string;
  outputAssetId?: string;
  sourceUrl?: string;
  seamScore?: number;
  processingSeams?: boolean;
  enhancingPrompt?: boolean;
  enhancePromptAvailable?: boolean;
  enhancePromptError?: string;
  onPromptChange?: (nodeId: string, prompt: string) => void;
  onEnhancePrompt?: (nodeId: string) => void;
  onProviderChange?: (nodeId: string, provider: ProviderId | 'global') => void;
  onSettingsChange?: (nodeId: string, patch: Partial<SeamlessTextureSettings>) => void;
  onRun?: (nodeId: string) => void;
  onCancel?: (nodeId: string) => void;
  onBranch?: (nodeId: string, sourceHandle?: string) => void;
  onOpen?: (url: string, title: string, sourceUrl?: string) => void;
  onDownload?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
};

export type MaterialMapSettings = {
  normalStrength: number;
  normalFormat: 'opengl' | 'directx';
  heightContrast: number;
  invertHeight: boolean;
  roughnessLevel: number;
  metallicLevel: number;
  detailInfluence: number;
  aoStrength: number;
};

export type MaterialMapOutput = {
  key: MaterialMapKey;
  title: string;
  outputUrl?: string;
  assetId?: string;
};

export type MaterialMapsNodeData = {
  [key: string]: unknown;
  title: string;
  inputUrl?: string;
  settings: MaterialMapSettings;
  maps: Record<MaterialMapKey, MaterialMapOutput>;
  status: 'idle' | 'building' | 'completed' | 'failed';
  error?: string;
  manifest?: Record<string, unknown>;
  onSettingsChange?: (nodeId: string, patch: Partial<MaterialMapSettings>) => void;
  onBuild?: (nodeId: string) => void;
  onOpen?: (url: string, title: string) => void;
  onDownloadMap?: (nodeId: string, key: MaterialMapKey) => void;
  onDeleteMap?: (nodeId: string, key: MaterialMapKey) => void;
  onExport?: (nodeId: string) => void;
  onDownloadManifest?: (nodeId: string) => void;
};

export type TripoModelEvent = {
  id: string;
  type: 'watching' | 'generation-started' | 'generation-progress' | 'generation-failed' | 'model-ready' | 'capture-warning' | 'watcher-disconnected' | 'status';
  watcherId?: string;
  sourceNodeId?: string | null;
  taskId?: string | null;
  status?: string;
  progress?: number | null;
  modelUrl?: string;
  downloadUrl?: string;
  fileName?: string;
  message?: string;
  createdAt?: string;
};

export type Model3DNodeData = {
  [key: string]: unknown;
  title: string;
  watcherId: string;
  sourceNodeId?: string | null;
  taskId?: string | null;
  status: 'waiting' | 'running' | 'ready' | 'failed';
  progress?: number | null;
  modelUrl?: string;
  downloadUrl?: string;
  fileName?: string;
  error?: string;
  onDownload?: (nodeId: string) => void;
  onRecover?: (nodeId: string) => void;
};

export type StudioNode =
  | Node<ImageNodeData, 'image'>
  | Node<GeneratorNodeData, 'generator'>
  | Node<CharacterViewsNodeData, 'characterViews'>
  | Node<MultiGenerateNodeData, 'multiGenerate'>
  | Node<CharacterPartsNodeData, 'characterParts'>
  | Node<SpriteAtlasNodeData, 'spriteAtlas'>
  | Node<RelativeAtlasNodeData, 'relativeAtlas'>
  | Node<SeamlessTextureNodeData, 'seamlessTexture'>
  | Node<MaterialMapsNodeData, 'materialMaps'>
  | Node<Model3DNodeData, 'model3d'>;

export type CodexStatus = {
  installed: boolean;
  connected: boolean;
  label: string;
};

export type GenerationJob = {
  id: string;
  status: NodeStatus;
  progress: string;
  provider: ProviderId;
  prompt?: string;
  sourceUrl?: string;
  sourceUrls?: string[];
  outputUrl?: string | null;
  error?: string | null;
  viewKey?: ViewKey | null;
  batchId?: string | null;
  batchKind?: string | null;
  slotKey?: string | null;
  slotIndex?: number | null;
  outputAssetId?: string | null;
  queuePosition?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type FrameforgeProject = {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  nodes: Array<Node<Record<string, unknown>>>;
  edges: Edge[];
  viewport: Viewport;
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectSaveState = 'loading' | 'saving' | 'saved' | 'offline' | 'conflict';
