import type { Edge, Node, Viewport } from '@xyflow/react';

export type ProviderId = 'codex' | 'gemini';
export type NodeStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type ViewKey = 'front' | 'left' | 'back' | 'right';
export type CharacterSubjectKind = 'character' | 'prop';
export type MaterialMapKey = 'baseColor' | 'normal' | 'height' | 'roughness' | 'metallic' | 'ambientOcclusion' | 'orm';
export type GenerationMode = 'reliable' | 'fast' | 'turbo';
export type CharacterPose = 'a-pose' | 't-pose';

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
  projectId: string;
  projectIds?: string[];
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
    graphNodeId?: string;
    view?: ViewKey;
    batchId?: string;
    slotKey?: string;
    assetRole?: 'sprite-atlas' | 'relative-atlas' | 'character-part' | 'seamless-texture' | 'material-map' | 'smart-separation-sprite' | 'smart-separation-atlas' | 'derived';
    manifest?: Record<string, unknown>;
    [key: string]: unknown;
  };
};

export type GenerationRevision = {
  id: string;
  assetId: string;
  outputUrl: string;
  createdAt: string;
  jobId?: string;
  prompt?: string;
};

export type ImageNodeData = {
  [key: string]: unknown;
  title: string;
  imageUrl: string;
  fileName: string;
  assetId?: string;
  sourceItemId?: string;
  sourceGroupId?: string;
  hasInput?: boolean;
  onBranch?: (nodeId: string, sourceHandle?: string) => void;
  onDownload?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onOpenTripo?: (url: string) => void;
  tripoBusy?: boolean;
  onSendToUnity?: (url: string) => void;
  unityBusy?: boolean;
  onOpen?: (url: string, title: string, sourceUrl?: string) => void;
};

export type ReferenceSetItem = {
  id: string;
  title: string;
  imageUrl: string;
  assetId?: string;
};

export type ReferenceSetNodeData = {
  [key: string]: unknown;
  title: string;
  items: ReferenceSetItem[];
  onBranch?: (nodeId: string, sourceHandle?: string) => void;
  onOpen?: (url: string, title: string) => void;
};

export type SmartSeparationBounds = { x: number; y: number; width: number; height: number };

export type SmartSeparationSource = {
  sourceIndex: number;
  sourceUrl: string;
  sourceAssetId: string;
  name: string;
};

export type SmartSeparationItem = {
  id: string;
  sourceIndex: number;
  sourceUrl: string;
  sourceAssetId: string;
  name: string;
  role: string;
  description: string;
  bounds: SmartSeparationBounds;
  enabled: boolean;
  groupId?: string;
  generationMethod?: 'imagegen';
  generationStatus?: NodeStatus;
  generationProgress?: string;
  generationError?: string;
  jobId?: string;
  rawOutputUrl?: string;
  rawOutputAssetId?: string;
  transparentBackground?: boolean;
  outputUrl?: string;
  outputAssetId?: string;
};

export type SmartSeparationGroup = {
  id: string;
  name: string;
  slug: string;
  reasoning?: string;
  status: 'idle' | 'building' | 'ready' | 'error';
  previewUrl?: string;
  outputUrl?: string;
  outputAssetId?: string;
  manifest?: Record<string, unknown>;
  error?: string;
};

export type SmartSeparationSettings = {
  packingMode: 'relative' | 'grid';
  tolerance: number;
  cropPadding: number;
  pixelArt: boolean;
  cellSize: 64 | 128 | 256 | 512;
  atlasSize: 512 | 1024 | 2048;
  atlasPadding: number;
};

export type SmartSeparationProgress = {
  requestId: string;
  stage: 'queued' | 'detecting' | 'grouping' | 'completed' | 'failed';
  completedSources: number;
  totalSources: number;
  message: string;
  startedAt: string;
  updatedAt: string;
};

export type SmartSeparationNodeData = {
  [key: string]: unknown;
  title: string;
  status: 'idle' | 'analyzing' | 'review' | 'extracting' | 'building' | 'completed' | 'partial' | 'failed';
  userHint: string;
  inputUrls?: string[];
  sources: SmartSeparationSource[];
  items: SmartSeparationItem[];
  groups: SmartSeparationGroup[];
  warnings?: string[];
  error?: string;
  analysisProgress?: SmartSeparationProgress;
  activeSourceIndex: number;
  activeGroupId?: string;
  expanded: boolean;
  settings: SmartSeparationSettings;
  onHintChange?: (nodeId: string, hint: string) => void;
  onAnalyze?: (nodeId: string) => void;
  onBuildAll?: (nodeId: string) => void;
  onPatchItem?: (nodeId: string, itemId: string, patch: Partial<SmartSeparationItem>) => void;
  onAddItem?: (nodeId: string, sourceIndex: number, bounds: SmartSeparationBounds) => void;
  onPatchGroup?: (nodeId: string, groupId: string, patch: Partial<SmartSeparationGroup>) => void;
  onAddGroup?: (nodeId: string) => void;
  onSourceChange?: (nodeId: string, sourceIndex: number) => void;
  onGroupChange?: (nodeId: string, groupId?: string) => void;
  onExpandedChange?: (nodeId: string, expanded: boolean) => void;
  onSettingsChange?: (nodeId: string, patch: Partial<SmartSeparationSettings>) => void;
  onDownloadGroupPng?: (nodeId: string, groupId: string) => void;
  onDownloadGroupJson?: (nodeId: string, groupId: string) => void;
  onUnpackToCanvas?: (nodeId: string) => void;
  onOpen?: (url: string, title: string) => void;
};

export type GeneratorNodeData = {
  [key: string]: unknown;
  title: string;
  prompt: string;
  outputUrl?: string;
  outputAssetId?: string;
  revisions?: GenerationRevision[];
  activeRevisionId?: string;
  sourceUrl?: string;
  sourceUrls?: string[];
  inputCount?: number;
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
  isConfigOpen?: boolean;
  onToggleConfig?: (nodeId: string, open?: boolean) => void;
  onRegenerate?: (nodeId: string) => void;
  onApplyPreset?: (nodeId: string, presetId: string) => void;
  onRun?: (nodeId: string) => void;
  onCancel?: (nodeId: string) => void;
  onBranch?: (nodeId: string, sourceHandle?: string) => void;
  onDownload?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onRestoreRevision?: (nodeId: string, revisionId: string) => void;
  onApplyRevisionPrompt?: (nodeId: string, prompt: string) => void;
  onOpenTripo?: (url: string) => void;
  tripoBusy?: boolean;
  onSendToUnity?: (url: string) => void;
  unityBusy?: boolean;
  onOpen?: (url: string, title: string, sourceUrl?: string, history?: { revisions?: GenerationRevision[]; activeRevisionId?: string }) => void;
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
  pose?: CharacterPose;
  subjectKind?: CharacterSubjectKind;
  provider?: ProviderId | 'global';
  generationMode?: GenerationMode;
  views: Record<ViewKey, CharacterViewOutput>;
  sourceReady?: boolean;
  inputCount?: number;
  onPoseChange?: (nodeId: string, pose: CharacterPose) => void;
  onProviderChange?: (nodeId: string, provider: ProviderId | 'global') => void;
  onModeChange?: (nodeId: string, mode: GenerationMode) => void;
  onRunAll?: (nodeId: string, onlyMissing?: boolean) => void;
  onRunView?: (nodeId: string, view: ViewKey) => void;
  onCancelView?: (nodeId: string, view: ViewKey) => void;
  onCancelAll?: (nodeId: string) => void;
  onBranch?: (nodeId: string, sourceHandle?: string) => void;
  onDownloadView?: (nodeId: string, view: ViewKey) => void;
  onDeleteView?: (nodeId: string, view: ViewKey) => void;
  onOpenTripo?: (url: string) => void;
  tripoBusyUrl?: string;
  onOpenTripoMultiview?: (nodeId: string) => void;
  tripoMultiviewBusy?: boolean;
  onSendToUnity?: (nodeId: string) => void;
  unityBusy?: boolean;
  onExportViews?: (nodeId: string) => void;
  onBuildSpriteSheet?: (nodeId: string) => void;
  onUnpackToCanvas?: (nodeId: string) => void;
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
  revisions?: GenerationRevision[];
  activeRevisionId?: string;
};

export type MultiGenerateNodeData = {
  [key: string]: unknown;
  title: string;
  prompt: string;
  variantCount: number;
  selectedVariantKey?: string;
  isConfigOpen?: boolean;
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
  onSelectVariant?: (nodeId: string, key: string) => void;
  onToggleConfig?: (nodeId: string, open?: boolean) => void;
  onRunAll?: (nodeId: string, onlyMissing?: boolean) => void;
  onRunVariant?: (nodeId: string, key: string) => void;
  onCancelVariant?: (nodeId: string, key: string) => void;
  onExtractVariant?: (nodeId: string, key: string) => void;
  onDownloadVariant?: (nodeId: string, key: string) => void;
  onDeleteVariant?: (nodeId: string, key: string) => void;
  onRestoreVariantRevision?: (nodeId: string, key: string, revisionId: string) => void;
  onApplyRevisionPrompt?: (nodeId: string, prompt: string) => void;
  onOpenTripo?: (url: string) => void;
  tripoBusyUrl?: string;
  onSendToUnity?: (url: string) => void;
  unityBusyUrl?: string;
  onOpen?: (url: string, title: string, sourceUrl?: string, history?: { revisions?: GenerationRevision[]; activeRevisionId?: string }) => void;
};

export type CharacterPartCandidate = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  spawnedNodeId?: string;
};

export type CharacterPartsProgress = {
  requestId: string;
  stage: 'queued' | 'inspecting' | 'completed' | 'failed';
  message: string;
  startedAt: string;
  updatedAt: string;
};

export type CharacterPartsNodeData = {
  [key: string]: unknown;
  title: string;
  notes: string;
  status: 'idle' | 'analyzing' | 'review' | 'failed';
  characterDescription: string;
  provider?: ProviderId | 'global';
  inputUrls?: string[];
  error?: string;
  analysisProgress?: CharacterPartsProgress;
  parts: CharacterPartCandidate[];
  onNotesChange?: (nodeId: string, notes: string) => void;
  onDescriptionChange?: (nodeId: string, description: string) => void;
  onProviderChange?: (nodeId: string, provider: ProviderId | 'global') => void;
  onAnalyze?: (nodeId: string) => void;
  onGenerateSelected?: (nodeId: string) => void;
  onPatchPart?: (nodeId: string, partId: string, patch: Partial<CharacterPartCandidate>) => void;
  onTogglePart?: (nodeId: string, partId: string) => void;
  onSelectAll?: (nodeId: string, enabled: boolean) => void;
  onAddPart?: (nodeId: string) => void;
  onRemovePart?: (nodeId: string, partId: string) => void;
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
  onSendToUnity?: (url: string) => void;
  unityBusy?: boolean;
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
  onSendToUnity?: (url: string) => void;
  unityBusy?: boolean;
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
  onSendToUnity?: (nodeId: string) => void;
  unityBusy?: boolean;
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
  onSendToUnity?: (nodeId: string) => void;
  unityBusy?: boolean;
};

export type StudioNode =
  | Node<ImageNodeData, 'image'>
  | Node<ReferenceSetNodeData, 'referenceSet'>
  | Node<SmartSeparationNodeData, 'smartSeparation'>
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

export type UnityAssetGroup = 'source' | 'generated' | 'views' | 'atlases' | 'materials' | 'models';

export type UnityProjectRef = {
  path: string;
  name: string;
  source?: string;
  running?: boolean;
  pid?: number;
};

export type UnityStatus = {
  ready: boolean;
  target: UnityProjectRef | null;
  running: UnityProjectRef[];
  recents: UnityProjectRef[];
};

export type UnitySendItem = {
  url?: string;
  modelKey?: string;
  group: UnityAssetGroup;
  title?: string;
  fileName?: string;
  viewKey?: ViewKey;
  mapKey?: MaterialMapKey;
};

export type UnitySendResult = {
  ok: boolean;
  projectPath: string;
  projectName: string;
  unityFolder: string;
  copied: string[];
  gltFastAdded: boolean;
  launched: boolean;
  focused: boolean;
  message: string;
};

export type GenerationJob = {
  id: string;
  projectId: string;
  status: NodeStatus;
  progress: string;
  provider: ProviderId;
  prompt?: string;
  outputName?: string | null;
  sourceUrl?: string;
  sourceUrls?: string[];
  outputUrl?: string | null;
  error?: string | null;
  graphNodeId?: string | null;
  viewKey?: ViewKey | null;
  batchId?: string | null;
  batchKind?: string | null;
  slotKey?: string | null;
  slotIndex?: number | null;
  outputAssetId?: string | null;
  transparentBackground?: boolean | null;
  queuePosition?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ConseptProject = {
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

export type ProjectSummary = Pick<ConseptProject, 'id' | 'name' | 'revision' | 'createdAt' | 'updatedAt'> & {
  nodeCount: number;
};

export type ProjectSaveState = 'loading' | 'saving' | 'saved' | 'offline' | 'conflict';
