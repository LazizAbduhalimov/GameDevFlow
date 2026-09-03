import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnConnectEnd,
  type OnConnectStart,
} from '@xyflow/react';
import {
  Box,
  Check,
  ChevronDown,
  CircleDot,
  CloudOff,
  Command,
  Download,
  FolderOpen,
  GalleryHorizontalEnd,
  Grid2X2,
  HardDrive,
  ImagePlus,
  Import,
  Layers3,
  Link2,
  ListTodo,
  LoaderCircle,
  Menu,
  Plus,
  Redo2,
  Save,
  RefreshCw,
  Scissors,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  WandSparkles,
  Images,
  Table2,
  X,
} from 'lucide-react';
import {
  ApiError,
  cancelJob,
  connectCodex,
  deleteGeneratedImage,
  enhanceImagePrompt,
  exportAssetArchive,
  generatedImageDownloadUrl,
  getAssets,
  getCodexStatus,
  getGenerationJob,
  getJobs,
  getProject,
  getProviders,
  openCharacterViewsInTripo,
  openImageInTripo,
  purgeAsset,
  recoverTripoModel,
  retryJob,
  restoreAsset,
  saveDerivedAsset,
  saveLocalBlob,
  saveProject,
  startGeneration,
  startGenerationBatch,
  startSlotBatch,
  subscribeToTripoEvents,
  trashAsset,
  uploadImage,
} from './api';
import { GalleryPanel, JobsDrawer, PreviewModal, type PreviewState } from './components/WorkspacePanels';
import { characterPartKeys, characterPartPrompt, characterPartSpecs, characterPartsManifest, normalizeCharacterPartLayer } from './character-parts';
import { SpriteSheetBuilder } from './components/SpriteSheetBuilder';
import { exportProject, importProject, projectPayload, useGraphHistory } from './graph';
import CharacterViewsNode from './nodes/CharacterViewsNode';
import CharacterPartsNode from './nodes/CharacterPartsNode';
import GeneratorNode from './nodes/GeneratorNode';
import ImageNode from './nodes/ImageNode';
import MultiGenerateNode from './nodes/MultiGenerateNode';
import Model3DNode from './nodes/Model3DNode';
import SpriteAtlasNode from './nodes/SpriteAtlasNode';
import RelativeAtlasNode from './nodes/RelativeAtlasNode';
import { buildRelativeAtlas, buildSpriteAtlas } from './atlas';
import MaterialMapsNode from './nodes/MaterialMapsNode';
import SeamlessTextureNode from './nodes/SeamlessTextureNode';
import { buildMaterialMaps, buildSeamlessTexture } from './material-maps';
import type {
  AssetRecord,
  CharacterPartKey,
  CharacterPartsNodeData,
  CharacterViewsNodeData,
  CodexStatus,
  FrameforgeProject,
  GenerationMode,
  GenerationJob,
  GeneratorNodeData,
  ImageNodeData,
  Model3DNodeData,
  MaterialMapKey,
  MaterialMapsNodeData,
  MultiGenerateNodeData,
  ProjectSaveState,
  ProviderId,
  ProviderStatus,
  StudioNode,
  SpriteAtlasNodeData,
  SpriteAtlasSettings,
  RelativeAtlasNodeData,
  RelativeAtlasSettings,
  SeamlessTextureNodeData,
  SeamlessTextureSettings,
  TripoModelEvent,
  ViewKey,
} from './types';

const nodeTypes = { image: ImageNode, generator: GeneratorNode, characterViews: CharacterViewsNode, characterParts: CharacterPartsNode, multiGenerate: MultiGenerateNode, spriteAtlas: SpriteAtlasNode, relativeAtlas: RelativeAtlasNode, seamlessTexture: SeamlessTextureNode, materialMaps: MaterialMapsNode, model3d: Model3DNode };
const edgeDefaults = {
  type: 'smoothstep',
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed, color: '#d8ff65', width: 16, height: 16 },
  style: { stroke: '#d8ff65', strokeWidth: 1.4 },
};
const allViewsEdgeDefaults = {
  ...edgeDefaults,
  markerEnd: { type: MarkerType.ArrowClosed, color: '#ffb45f', width: 16, height: 16 },
  style: { stroke: '#ffb45f', strokeWidth: 1.7 },
};
const viewKeys: ViewKey[] = ['front', 'left', 'back', 'right'];
const materialMapKeys: MaterialMapKey[] = ['baseColor', 'normal', 'height', 'roughness', 'metallic', 'ambientOcclusion', 'orm'];
const materialMapTitles: Record<MaterialMapKey, string> = { baseColor: 'Base color', normal: 'Normal', height: 'Height', roughness: 'Roughness', metallic: 'Metallic', ambientOcclusion: 'Ambient occlusion', orm: 'Packed ORM' };
const viewPrompts: Record<ViewKey, { title: string; prompt: string }> = {
  front: { title: 'Front', prompt: 'Create a clean full-body front orthographic view. Neutral pose, centered, plain background.' },
  left: { title: 'Left', prompt: 'Create a clean full-body left orthographic side view. Neutral pose, centered, plain background.' },
  back: { title: 'Back', prompt: 'Create a clean full-body back orthographic view. Neutral pose, centered, plain background.' },
  right: { title: 'Right', prompt: 'Create a clean full-body right orthographic side view. Neutral pose, centered, plain background.' },
};
const presets: Record<string, string> = {
  identity: 'Preserve the exact character identity, outfit, proportions, materials, palette, silhouette and accessories.',
  transparent: 'Isolate the subject on a transparent background. Keep clean anti-aliased edges and no cast shadow.',
  concept: 'Render as production-ready game concept art with clear forms, readable materials and neutral studio lighting.',
  icon: 'Create a centered inventory icon, isolated object, three-quarter view, readable silhouette, transparent background.',
  variation: 'Create one controlled variation. Preserve identity and silhouette while changing only secondary details.',
};

type ConnectionMenu = {
  sourceId?: string;
  sourceHandle?: string | null;
  screen: { x: number; y: number };
  flow: { x: number; y: number };
};

export default function App() {
  return <ReactFlowProvider><Studio /></ReactFlowProvider>;
}

function Studio() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [codex, setCodex] = useState<CodexStatus>({ installed: true, connected: false, label: 'Checking Codex…' });
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [globalProvider] = useState<ProviderId>('codex');
  const [providerOpen, setProviderOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [connectionMenu, setConnectionMenu] = useState<ConnectionMenu | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [compare, setCompare] = useState<[AssetRecord | null, AssetRecord | null]>([null, null]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [spriteAssets, setSpriteAssets] = useState<AssetRecord[]>([]);
  const [spriteOpen, setSpriteOpen] = useState(false);
  const [projectReady, setProjectReady] = useState(false);
  const [projectName, setProjectName] = useState('Untitled pipeline');
  const [saveState, setSaveState] = useState<ProjectSaveState>('loading');
  const [promptEnhancements, setPromptEnhancements] = useState<Record<string, { busy: boolean; error?: string }>>({});
  const [tripoBusyUrl, setTripoBusyUrl] = useState<string | null>(null);
  const [tripoMultiviewBusyNodeId, setTripoMultiviewBusyNodeId] = useState<string | null>(null);
  const revisionRef = useRef(0);
  const lastSavedHashRef = useRef('');
  const saveSequenceRef = useRef(Promise.resolve());
  const uploadRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const connectionSourceRef = useRef<{ nodeId: string | null; handleId?: string | null }>({ nodeId: null });
  const enhanceControllersRef = useRef(new Map<string, AbortController>());
  const seamlessFinalizersRef = useRef(new Set<string>());
  const tripoControllerRef = useRef<AbortController | null>(null);
  const seenTripoEventsRef = useRef(new Set<string>());
  const attemptedTripoRecoveryRef = useRef(new Set<string>());
  const tripoRecoveryBusyRef = useRef(new Set<string>());
  const reactFlow = useReactFlow();

  const applyGraph = useCallback((snapshot: { nodes: Node[]; edges: Edge[] }) => {
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setNodes, setEdges]);
  const history = useGraphHistory(nodes, edges, projectReady, applyGraph);

  const showToast = useCallback((message: string) => setToast(message), []);
  const openPreview = useCallback((url: string, title: string, sourceUrl?: string) => setPreview({ primary: { url, title, sourceUrl } }), []);

  const handleTripoEvent = useCallback((event: TripoModelEvent) => {
    if (!event.watcherId || !event.id || seenTripoEventsRef.current.has(event.id)) return;
    seenTripoEventsRef.current.add(event.id);
    if (seenTripoEventsRef.current.size > 300) seenTripoEventsRef.current.clear();
    if (!['generation-started', 'generation-progress', 'generation-failed', 'model-ready', 'watcher-disconnected'].includes(event.type)) {
      if (event.type === 'capture-warning' && event.message) showToast(event.message);
      return;
    }
    const modelNodeId = `model3d-${event.watcherId}`;
    setNodes((current) => {
      const existing = current.find((node) => node.id === modelNodeId);
      const source = event.sourceNodeId ? current.find((node) => node.id === event.sourceNodeId) : undefined;
      const previous = existing?.data as Model3DNodeData | undefined;
      const failed = event.type === 'generation-failed' || event.type === 'watcher-disconnected';
      const ready = event.type === 'model-ready';
      const status: Model3DNodeData['status'] = ready ? 'ready' : failed ? 'failed' : event.type === 'generation-started' ? 'running' : previous?.status || 'running';
      const data: Model3DNodeData = {
        title: ready ? 'Tripo 3D model' : previous?.title || 'Tripo generation',
        watcherId: event.watcherId!,
        sourceNodeId: event.sourceNodeId ?? previous?.sourceNodeId,
        taskId: event.taskId ?? previous?.taskId,
        status,
        progress: event.progress ?? previous?.progress ?? 0,
        modelUrl: event.modelUrl || previous?.modelUrl,
        downloadUrl: event.downloadUrl || previous?.downloadUrl,
        fileName: event.fileName || previous?.fileName,
        error: failed ? event.message || 'Tripo generation stopped before a model was received.' : previous?.error,
      };
      if (existing) return current.map((node) => node.id === modelNodeId ? { ...node, data } : node);
      const position = source ? { x: source.position.x + (source.type === 'characterViews' || source.type === 'characterParts' ? 610 : 430), y: source.position.y + 24 } : { x: 420, y: 240 };
      const node: StudioNode = { id: modelNodeId, type: 'model3d', position, data };
      return [...current, node];
    });
    if (event.sourceNodeId) {
      setEdges((current) => current.some((edge) => edge.target === modelNodeId)
        ? current
        : addEdge({ id: `edge-${event.sourceNodeId}-tripo-${modelNodeId}`, source: event.sourceNodeId!, target: modelNodeId, ...edgeDefaults }, current));
    }
    if (event.type === 'generation-started') showToast('Tripo generation detected · listening for the model.');
    if (event.type === 'model-ready') showToast('Tripo model imported locally and added to the canvas.');
    if ((event.type === 'generation-failed' || event.type === 'watcher-disconnected') && event.message) showToast(event.message);
  }, [setEdges, setNodes, showToast]);

  useEffect(() => {
    const closeSidebarOnNarrowViewport = () => {
      if (window.innerWidth <= 850) setSidebarOpen(false);
    };

    closeSidebarOnNarrowViewport();
    window.addEventListener('resize', closeSidebarOnNarrowViewport);
    return () => window.removeEventListener('resize', closeSidebarOnNarrowViewport);
  }, []);

  const refreshCodex = useCallback(async () => {
    try {
      const [status, providerList] = await Promise.all([getCodexStatus(), getProviders()]);
      setCodex(status);
      setProviders(providerList);
    } catch {
      setCodex({ installed: false, connected: false, label: 'Local backend is offline' });
    }
  }, []);

  const refreshAssets = useCallback(async () => {
    setAssetsLoading(true);
    try { setAssets(await getAssets({ includeTrashed: true })); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    finally { setAssetsLoading(false); }
  }, [showToast]);

  const refreshJobs = useCallback(async () => {
    try { setJobs(await getJobs()); }
    catch { /* status drawer stays on last known snapshot */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace() {
      try {
        const project = await getProject();
        if (cancelled) return;
        setNodes(project.nodes as Node[]);
        setEdges(project.edges);
        setProjectName(project.name);
        revisionRef.current = project.revision;
        lastSavedHashRef.current = projectHash(project.name, project.nodes as Node[], project.edges);
        window.setTimeout(() => reactFlow.setViewport(project.viewport, { duration: 0 }), 0);
        setSaveState('saved');
      } catch {
        const backup = localStorage.getItem('frameforge-project-backup');
        if (backup) {
          const project = JSON.parse(backup) as FrameforgeProject;
          setNodes(project.nodes as Node[]);
          setEdges(project.edges);
          setProjectName(project.name);
          lastSavedHashRef.current = projectHash(project.name, project.nodes as Node[], project.edges);
          showToast('Backend project was unavailable. Restored the browser backup.');
        }
        setSaveState('offline');
      } finally {
        if (!cancelled) setProjectReady(true);
      }
    }
    void loadWorkspace();
    void refreshCodex();
    void refreshAssets();
    void refreshJobs();
    return () => { cancelled = true; };
  }, [reactFlow, refreshAssets, refreshCodex, refreshJobs, setEdges, setNodes, showToast]);

  const persistProject = useCallback((manual = false) => {
    if (!projectReady) return;
    const payload = projectPayload(projectName, revisionRef.current, nodes, edges, reactFlow.getViewport());
    const hash = projectHash(projectName, nodes, edges);
    if (!manual && hash === lastSavedHashRef.current) return;
    localStorage.setItem('frameforge-project-backup', JSON.stringify(payload));
    setSaveState('saving');
    saveSequenceRef.current = saveSequenceRef.current.then(async () => {
      try {
        const saved = await saveProject({ ...payload, revision: revisionRef.current });
        revisionRef.current = saved.revision;
        lastSavedHashRef.current = hash;
        setSaveState('saved');
        if (manual) showToast('Project saved locally.');
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          try {
            const current = await getProject();
            revisionRef.current = current.revision;
            const saved = await saveProject({ ...payload, revision: current.revision });
            revisionRef.current = saved.revision;
            lastSavedHashRef.current = hash;
            setSaveState('saved');
            if (manual) showToast('Project saved after resolving another local tab.');
            return;
          } catch { setSaveState('conflict'); }
        } else setSaveState('offline');
        if (manual) showToast(error instanceof Error ? error.message : String(error));
      }
    });
  }, [edges, nodes, projectName, projectReady, reactFlow, showToast]);

  useEffect(() => {
    if (!projectReady) return;
    const timer = window.setTimeout(() => persistProject(false), 720);
    return () => window.clearTimeout(timer);
  }, [nodes, edges, projectName, projectReady, persistProject]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => {
    for (const controller of enhanceControllersRef.current.values()) controller.abort();
    enhanceControllersRef.current.clear();
    tripoControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!projectReady) return;
    return subscribeToTripoEvents(handleTripoEvent);
  }, [handleTripoEvent, projectReady]);

  useEffect(() => {
    if (!projectReady) return;
    const suspect = nodes.find((node) => node.type === 'model3d' && !node.data.taskId && !attemptedTripoRecoveryRef.current.has(node.id));
    if (!suspect) return;
    attemptedTripoRecoveryRef.current.add(suspect.id);
    void recoverTripoPreview(suspect.id);
  }, [nodes, projectReady]);

  useEffect(() => {
    const hasActiveJobs = jobs.some((job) => job.status === 'queued' || job.status === 'running');
    if (!jobsOpen && !hasActiveJobs) return;
    const timer = window.setInterval(() => { void refreshJobs(); }, hasActiveJobs ? 1_800 : 5_000);
    return () => window.clearInterval(timer);
  }, [jobs, jobsOpen, refreshJobs]);

  useEffect(() => {
    if (!projectReady || !jobs.length) return;
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        if (node.type === 'generator') {
          const data = node.data as GeneratorNodeData;
          const job = data.jobId ? jobsById.get(data.jobId) : undefined;
          if (!job) return node;
          const outputUrl = job.status === 'completed' && job.outputUrl ? job.outputUrl : data.outputUrl;
          const error = job.error || undefined;
          if (data.status === job.status && data.progress === job.progress && data.error === error && data.outputUrl === outputUrl) return node;
          changed = true;
          return { ...node, data: { ...data, status: job.status, progress: job.progress, error, outputUrl } };
        }
        if (node.type === 'multiGenerate') {
          const data = node.data as MultiGenerateNodeData;
          let variantsChanged = false;
          const variants = data.variants.map((variant) => {
            const job = variant.jobId ? jobsById.get(variant.jobId) : undefined;
            if (!job) return variant;
            const outputUrl = job.status === 'completed' && job.outputUrl ? job.outputUrl : variant.outputUrl;
            const assetId = job.status === 'completed' && job.outputAssetId ? job.outputAssetId : variant.assetId;
            const error = job.error || undefined;
            if (variant.status === job.status && variant.progress === job.progress && variant.error === error && variant.outputUrl === outputUrl && variant.assetId === assetId) return variant;
            variantsChanged = true;
            return { ...variant, status: job.status, progress: job.progress, error, outputUrl, assetId };
          });
          if (!variantsChanged) return node;
          changed = true;
          return { ...node, data: { ...data, variants } };
        }
        if (node.type === 'seamlessTexture') {
          const data = node.data as SeamlessTextureNodeData;
          const job = data.jobId ? jobsById.get(data.jobId) : undefined;
          if (!job) return node;
          const completed = job.status === 'completed' && Boolean(job.outputUrl);
          const status = completed && !data.outputUrl ? 'running' : job.status;
          const progress = completed && !data.outputUrl ? 'Finishing tile-safe edges…' : job.progress;
          const rawOutputUrl = completed ? job.outputUrl || data.rawOutputUrl : data.rawOutputUrl;
          const rawAssetId = completed ? job.outputAssetId || data.rawAssetId : data.rawAssetId;
          const error = job.error || undefined;
          if (data.status === status && data.progress === progress && data.error === error && data.rawOutputUrl === rawOutputUrl && data.rawAssetId === rawAssetId) return node;
          changed = true;
          return { ...node, data: { ...data, status, progress, error, rawOutputUrl, rawAssetId } };
        }
        if (node.type === 'characterParts') {
          const data = node.data as CharacterPartsNodeData;
          let partsChanged = false;
          const parts = { ...data.parts };
          for (const key of characterPartKeys) {
            const part = data.parts[key];
            const job = part.jobId ? jobsById.get(part.jobId) : undefined;
            if (!job) continue;
            const outputUrl = part.normalized ? part.outputUrl : job.status === 'completed' && job.outputUrl ? job.outputUrl : part.outputUrl;
            const assetId = part.normalized ? part.assetId : job.status === 'completed' && job.outputAssetId ? job.outputAssetId : part.assetId;
            const error = job.error || part.error || undefined;
            if (part.status === job.status && part.progress === job.progress && part.error === error && part.outputUrl === outputUrl && part.assetId === assetId) continue;
            parts[key] = { ...part, status: job.status, progress: job.progress, error, outputUrl, assetId };
            partsChanged = true;
          }
          if (!partsChanged) return node;
          changed = true;
          return { ...node, data: { ...data, parts } };
        }
        if (node.type !== 'characterViews') return node;
        const data = node.data as CharacterViewsNodeData;
        let viewsChanged = false;
        const views = { ...data.views };
        for (const key of viewKeys) {
          const view = data.views[key];
          const job = view.jobId ? jobsById.get(view.jobId) : undefined;
          if (!job) continue;
          const outputUrl = job.status === 'completed' && job.outputUrl ? job.outputUrl : view.outputUrl;
          const error = job.error || undefined;
          if (view.status === job.status && view.progress === job.progress && view.error === error && view.outputUrl === outputUrl) continue;
          views[key] = { ...view, status: job.status, progress: job.progress, error, outputUrl };
          viewsChanged = true;
        }
        if (!viewsChanged) return node;
        changed = true;
        return { ...node, data: { ...data, views } };
      });
      return changed ? next : current;
    });
  }, [jobs, projectReady, setNodes]);

  useEffect(() => {
    if (!projectReady) return;
    const pending = nodes.find((node) => {
      if (node.type !== 'seamlessTexture') return false;
      const data = node.data as SeamlessTextureNodeData;
      return Boolean(data.rawOutputUrl && !data.outputUrl && data.jobId && !data.processingSeams && !seamlessFinalizersRef.current.has(`${node.id}:${data.jobId}`));
    });
    if (pending) {
      const data = pending.data as SeamlessTextureNodeData;
      void finalizeSeamlessTexture(pending.id, data.jobId, data.rawOutputUrl, data.rawAssetId);
    }
  }, [nodes, projectReady]);

  useEffect(() => {
    if (!projectReady) return;
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const incoming = edges.filter((edge) => edge.target === node.id);
        const urls = incoming.length === 1 ? sourceUrlsFor(current.find((candidate) => candidate.id === incoming[0].source), incoming[0].sourceHandle) : [];
        if (node.type === 'characterParts') {
          const data = node.data as CharacterPartsNodeData;
          if (sameStrings(data.inputUrls || [], urls)) return node;
          changed = true;
          const parts = Object.fromEntries(characterPartKeys.map((key) => [key, { ...data.parts[key], status: 'idle', outputUrl: undefined, assetId: undefined, jobId: undefined, progress: undefined, error: undefined, normalized: false, geometry: undefined }])) as CharacterPartsNodeData['parts'];
          return { ...node, data: { ...data, inputUrls: urls, parts, error: undefined } };
        }
        if (node.type === 'spriteAtlas' || node.type === 'relativeAtlas') {
          const data = node.data as SpriteAtlasNodeData | RelativeAtlasNodeData;
          if (sameStrings(data.inputUrls || [], urls)) return node;
          changed = true;
          return { ...node, data: { ...data, inputUrls: urls, status: 'idle', previewUrl: undefined, outputUrl: undefined, outputAssetId: undefined, manifest: undefined, validation: undefined, error: undefined } };
        }
        if (node.type === 'materialMaps') {
          const data = node.data as MaterialMapsNodeData;
          const inputUrl = urls.length === 1 ? urls[0] : undefined;
          const inputError = urls.length > 1 ? 'Material Maps accepts one base-color texture, not a collection.' : undefined;
          if (data.inputUrl === inputUrl && data.error === inputError) return node;
          changed = true;
          return { ...node, data: { ...data, inputUrl, status: 'idle', maps: createMaterialMapOutputs(inputUrl), manifest: undefined, error: inputError } };
        }
        return node;
      });
      return changed ? next : current;
    });
  }, [edges, nodes, projectReady, setNodes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? history.redo() : history.undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault(); history.redo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); persistProject(true);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && !editing) {
        event.preventDefault(); duplicateSelection();
      } else if (!editing && event.key.toLowerCase() === 'f') {
        const selected = reactFlow.getNodes().filter((node) => node.selected);
        if (selected.length) void reactFlow.fitView({ nodes: selected, padding: 0.22, duration: 280 });
      } else if (event.key === 'Escape') {
        setConnectionMenu(null); setProviderOpen(false); setSpriteOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function attachCallbacks(node: StudioNode): StudioNode {
    if (node.type === 'image') {
      return { ...node, data: { ...node.data, onBranch: branchFromNode, onOpen: openPreview, onOpenTripo: (url: string) => openInTripo(url, node.id), tripoBusy: tripoBusyUrl === node.data.imageUrl } as ImageNodeData };
    }
    if (node.type === 'characterViews') {
      return {
        ...node,
        data: {
          ...node.data,
          onBasePromptChange: updateTurnaroundPrompt,
          onEnhancePrompt: enhanceNodePrompt,
          enhancingPrompt: Boolean(promptEnhancements[node.id]?.busy),
          enhancePromptError: promptEnhancements[node.id]?.error,
          enhancePromptAvailable: codex.connected,
          onProviderChange: updateProvider,
          onModeChange: updateTurnaroundMode,
          onRunAll: runTurnaroundAll,
          onRunView: runTurnaroundView,
          onCancelView: cancelTurnaroundView,
          onBranch: branchFromNode,
          onDownloadView: downloadTurnaroundView,
          onDeleteView: deleteTurnaroundView,
          onOpenTripo: (url: string) => openInTripo(url, node.id),
          tripoBusyUrl,
          onOpenTripoMultiview: openTurnaroundInTripo,
          tripoMultiviewBusy: tripoMultiviewBusyNodeId === node.id,
          onExportViews: exportTurnaroundViews,
          onBuildSpriteSheet: buildTurnaroundSpriteSheet,
          onOpen: openPreview,
        } as CharacterViewsNodeData,
      };
    }
    if (node.type === 'characterParts') {
      const input = findInput(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          inputUrls: input.sourceUrls,
          onNotesChange: updatePartsNotes,
          onProviderChange: updateProvider,
          onModeChange: updatePartsMode,
          onRunAll: runPartsAll,
          onRunPart: runPart,
          onCancelPart: cancelPart,
          onExtractPart: extractPart,
          onDownloadPart: downloadPart,
          onDeletePart: deletePart,
          onExportParts: exportParts,
          onDownloadManifest: downloadPartsManifest,
          onOpen: openPreview,
        } as CharacterPartsNodeData,
      };
    }
    if (node.type === 'multiGenerate') {
      return {
        ...node,
        data: {
          ...node.data,
          onPromptChange: updatePrompt,
          onEnhancePrompt: enhanceNodePrompt,
          enhancingPrompt: Boolean(promptEnhancements[node.id]?.busy),
          enhancePromptError: promptEnhancements[node.id]?.error,
          enhancePromptAvailable: codex.connected,
          onCountChange: updateVariantCount,
          onProviderChange: updateProvider,
          onModeChange: updateMultiMode,
          onRunAll: runMultiAll,
          onRunVariant: runMultiVariant,
          onCancelVariant: cancelMultiVariant,
          onExtractVariant: extractMultiVariant,
          onDownloadVariant: downloadMultiVariant,
          onDeleteVariant: deleteMultiVariant,
          onOpenTripo: (url: string) => openInTripo(url, node.id),
          tripoBusyUrl,
          onOpen: openPreview,
        } as MultiGenerateNodeData,
      };
    }
    if (node.type === 'spriteAtlas') {
      const connectedInput = findInput(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          inputUrls: connectedInput.sourceUrls,
          onSettingsChange: updateAtlasSettings,
          onBuild: buildAtlas,
          onOpen: (url: string, title: string) => openPreview(url, title),
          onOpenTripo: (url: string) => openInTripo(url, node.id),
          tripoBusy: tripoBusyUrl === node.data.outputUrl,
          onDownloadPng: downloadAtlasPng,
          onDownloadJson: downloadAtlasJson,
          onDelete: deleteAtlas,
        } as SpriteAtlasNodeData,
      };
    }
    if (node.type === 'relativeAtlas') {
      const connectedInput = findInput(node.id);
      return { ...node, data: { ...node.data, inputUrls: connectedInput.sourceUrls, onSettingsChange: updateRelativeAtlasSettings, onBuild: buildRelativeAtlasNode, onOpen: (url: string, title: string) => openPreview(url, title), onOpenTripo: (url: string) => openInTripo(url, node.id), tripoBusy: tripoBusyUrl === node.data.outputUrl, onDownloadPng: downloadRelativeAtlasPng, onDownloadJson: downloadRelativeAtlasJson, onDelete: deleteRelativeAtlas } as RelativeAtlasNodeData };
    }
    if (node.type === 'seamlessTexture') {
      return {
        ...node,
        data: {
          ...node.data,
          onPromptChange: updatePrompt,
          onEnhancePrompt: enhanceNodePrompt,
          enhancingPrompt: Boolean(promptEnhancements[node.id]?.busy),
          enhancePromptError: promptEnhancements[node.id]?.error,
          enhancePromptAvailable: codex.connected,
          onProviderChange: updateProvider,
          onSettingsChange: updateSeamlessSettings,
          onRun: runSeamlessTexture,
          onCancel: cancelSeamlessTexture,
          onBranch: branchFromNode,
          onOpen: openPreview,
          onDownload: downloadSeamlessTexture,
          onDelete: deleteSeamlessTexture,
        } as SeamlessTextureNodeData,
      };
    }
    if (node.type === 'materialMaps') {
      const input = findInput(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          inputUrl: input.sourceUrls.length === 1 ? input.sourceUrl : undefined,
          onSettingsChange: updateMaterialMapSettings,
          onBuild: buildMaterialMapSet,
          onOpen: (url: string, title: string) => openPreview(url, title),
          onDownloadMap: downloadMaterialMap,
          onDeleteMap: deleteMaterialMap,
          onExport: exportMaterialMapSet,
          onDownloadManifest: downloadMaterialMapManifest,
        } as MaterialMapsNodeData,
      };
    }
    if (node.type === 'model3d') {
      return { ...node, data: { ...node.data, onDownload: downloadTripoModel, onRecover: recoverTripoPreview } as Model3DNodeData };
    }
    return {
      ...node,
      data: {
        ...node.data,
        onPromptChange: updatePrompt,
        onEnhancePrompt: enhanceNodePrompt,
        enhancingPrompt: Boolean(promptEnhancements[node.id]?.busy),
        enhancePromptError: promptEnhancements[node.id]?.error,
        enhancePromptAvailable: codex.connected,
        onProviderChange: updateProvider,
        onApplyPreset: applyPreset,
        onRun: runGenerator,
        onCancel: cancelGenerator,
        onBranch: branchFromNode,
        onDownload: downloadResult,
        onDelete: deleteResult,
        onOpenTripo: (url: string) => openInTripo(url, node.id),
        tripoBusy: tripoBusyUrl === node.data.outputUrl,
        onOpen: openPreview,
      } as GeneratorNodeData,
    };
  }

  const displayedNodes = nodes.map((node) => attachCallbacks(node as StudioNode));

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    setEdges((current) => addEdge({ ...connection, ...(connection.sourceHandle === 'all' ? allViewsEdgeDefaults : edgeDefaults) }, current.filter((edge) => edge.target !== connection.target)));
  }, [setEdges]);

  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    connectionSourceRef.current = { nodeId: params.nodeId, handleId: params.handleId };
    setConnectionMenu(null);
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
    const source = connectionSourceRef.current;
    connectionSourceRef.current = { nodeId: null };
    if (!source.nodeId || connectionState.isValid) return;
    const target = event.target as Element | null;
    if (!target?.classList.contains('react-flow__pane')) return;
    const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
    openNodeMenu(pointer.clientX, pointer.clientY, source.nodeId, source.handleId);
  }, [reactFlow]);

  function openNodeMenu(clientX: number, clientY: number, sourceId?: string, sourceHandle?: string | null) {
    setConnectionMenu({
      sourceId,
      sourceHandle,
      screen: { x: Math.min(clientX, window.innerWidth - 248), y: Math.max(8, Math.min(clientY, window.innerHeight - 510)) },
      flow: reactFlow.screenToFlowPosition({ x: clientX, y: clientY }),
    });
  }

  function updatePrompt(nodeId: string, prompt: string) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, prompt } } : node));
  }

  async function enhanceNodePrompt(nodeId: string) {
    const node = reactFlow.getNode(nodeId);
    if (!node || promptEnhancements[nodeId]?.busy) return;
    if (!codex.connected) return showToast('Connect Codex before enhancing prompts.');
    const isCharacterViews = node.type === 'characterViews';
    const prompt = String(isCharacterViews ? node.data.basePrompt || '' : node.data.prompt || '').trim();
    if (!prompt) return showToast('Write a draft prompt first.');
    const context = node.type === 'multiGenerate' ? 'multi-variation' : isCharacterViews ? 'character-consistency' : 'image-generation';
    enhanceControllersRef.current.get(nodeId)?.abort();
    const controller = new AbortController();
    enhanceControllersRef.current.set(nodeId, controller);
    setPromptEnhancements((current) => ({ ...current, [nodeId]: { busy: true } }));
    try {
      const result = await enhanceImagePrompt(prompt, context, controller.signal);
      if (controller.signal.aborted) return;
      if (isCharacterViews) updateTurnaroundPrompt(nodeId, result.prompt);
      else updatePrompt(nodeId, result.prompt);
      setPromptEnhancements((current) => ({ ...current, [nodeId]: { busy: false } }));
      showToast('Prompt enhanced with local Codex.');
    } catch (enhanceError) {
      if (controller.signal.aborted) return;
      const message = enhanceError instanceof Error ? enhanceError.message : String(enhanceError);
      setPromptEnhancements((current) => ({ ...current, [nodeId]: { busy: false, error: message } }));
      showToast(message);
    } finally {
      if (enhanceControllersRef.current.get(nodeId) === controller) enhanceControllersRef.current.delete(nodeId);
    }
  }

  async function openInTripo(url: string, sourceNodeId: string) {
    if (!url || tripoBusyUrl || tripoMultiviewBusyNodeId) return;
    tripoControllerRef.current?.abort();
    const controller = new AbortController();
    tripoControllerRef.current = controller;
    setTripoBusyUrl(url);
    showToast('Opening Tripo Studio and attaching the image…');
    try {
      const result = await openImageInTripo(url, sourceNodeId, controller.signal);
      if (!controller.signal.aborted) showToast(`Image attached · Tripo listener armed · ${result.browser}`);
    } catch (tripoError) {
      if (!controller.signal.aborted) showToast(tripoError instanceof Error ? tripoError.message : String(tripoError));
    } finally {
      if (tripoControllerRef.current === controller) {
        tripoControllerRef.current = null;
        setTripoBusyUrl(null);
      }
    }
  }

  async function openTurnaroundInTripo(nodeId: string) {
    if (tripoBusyUrl || tripoMultiviewBusyNodeId) return;
    const data = reactFlow.getNode(nodeId)?.data as CharacterViewsNodeData | undefined;
    const views = data?.views;
    if (!views || viewKeys.some((key) => !views[key]?.outputUrl)) {
      showToast('Generate all four Character Views before opening Tripo Multiview.');
      return;
    }
    const urls = Object.fromEntries(viewKeys.map((key) => [key, views[key].outputUrl!])) as Record<ViewKey, string>;
    tripoControllerRef.current?.abort();
    const controller = new AbortController();
    tripoControllerRef.current = controller;
    setTripoMultiviewBusyNodeId(nodeId);
    showToast('Opening Tripo Multiview and attaching four views…');
    try {
      const result = await openCharacterViewsInTripo(urls, nodeId, controller.signal);
      if (!controller.signal.aborted) showToast(`Four views attached · Tripo listener armed · ${result.browser}`);
    } catch (tripoError) {
      if (!controller.signal.aborted) showToast(tripoError instanceof Error ? tripoError.message : String(tripoError));
    } finally {
      if (tripoControllerRef.current === controller) {
        tripoControllerRef.current = null;
        setTripoMultiviewBusyNodeId(null);
      }
    }
  }

  function updateProvider(nodeId: string, provider: ProviderId | 'global') {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, provider } } : node));
  }

  function applyPreset(nodeId: string, presetId: string) {
    const block = presets[presetId];
    if (!block) return;
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, prompt: `${String(node.data.prompt || '').trim()}${node.data.prompt ? '\n\n' : ''}${block}` } } : node));
  }

  function updateTurnaroundPrompt(nodeId: string, basePrompt: string) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, basePrompt } } : node));
  }

  function updateTurnaroundMode(nodeId: string, generationMode: GenerationMode) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, generationMode } } : node));
  }

  function updateVariantCount(nodeId: string, requestedCount: number) {
    const variantCount = Math.max(2, Math.min(6, Math.floor(requestedCount)));
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId || node.type !== 'multiGenerate') return node;
      const data = node.data as MultiGenerateNodeData;
      return { ...node, data: { ...data, variantCount, variants: createVariantSlots(variantCount, data.variants) } };
    }));
  }

  function updateMultiMode(nodeId: string, generationMode: GenerationMode) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, generationMode } } : node));
  }

  function updatePartsNotes(nodeId: string, notes: string) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, notes } } : node));
  }

  function updatePartsMode(nodeId: string, generationMode: GenerationMode) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, generationMode } } : node));
  }

  function updateAtlasSettings(nodeId: string, patch: Partial<SpriteAtlasSettings>) {
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId || node.type !== 'spriteAtlas') return node;
      const data = node.data as SpriteAtlasNodeData;
      const next = { ...data.settings, ...patch };
      next.gutter = Math.max(0, Math.min(128, Math.floor(next.gutter)));
      if (patch.gutter !== undefined && patch.outerMargin === undefined) next.outerMargin = next.gutter;
      next.outerMargin = Math.max(0, Math.min(128, Math.floor(next.outerMargin)));
      next.safeArea = Math.max(0.5, Math.min(0.95, Number(next.safeArea)));
      if (next.columns !== 'auto') next.columns = Math.max(1, Math.min(16, Math.floor(next.columns)));
      return { ...node, data: { ...data, settings: next, status: 'idle', previewUrl: undefined, outputUrl: undefined, outputAssetId: undefined, manifest: undefined, error: undefined, validation: undefined } };
    }));
  }

  function updateRelativeAtlasSettings(nodeId: string, patch: Partial<RelativeAtlasSettings>) {
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId || node.type !== 'relativeAtlas') return node;
      const data = node.data as RelativeAtlasNodeData;
      const settings = { ...data.settings, ...patch };
      settings.padding = Math.max(0, Math.min(128, Math.floor(settings.padding)));
      settings.outerMargin = Math.max(0, Math.min(128, Math.floor(settings.outerMargin)));
      return { ...node, data: { ...data, settings, status: 'idle', previewUrl: undefined, outputUrl: undefined, outputAssetId: undefined, manifest: undefined, error: undefined, validation: undefined } };
    }));
  }

  function updateSeamlessSettings(nodeId: string, patch: Partial<SeamlessTextureSettings>) {
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId || node.type !== 'seamlessTexture') return node;
      const data = node.data as SeamlessTextureNodeData;
      return { ...node, data: { ...data, settings: { ...data.settings, ...patch }, error: undefined } };
    }));
  }

  function updateMaterialMapSettings(nodeId: string, patch: Partial<MaterialMapsNodeData['settings']>) {
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId || node.type !== 'materialMaps') return node;
      const data = node.data as MaterialMapsNodeData;
      const settings = { ...data.settings, ...patch };
      settings.normalStrength = Math.max(0.5, Math.min(6, settings.normalStrength));
      settings.heightContrast = Math.max(0.5, Math.min(3, settings.heightContrast));
      settings.roughnessLevel = Math.max(0, Math.min(1, settings.roughnessLevel));
      settings.metallicLevel = Math.max(0, Math.min(1, settings.metallicLevel));
      settings.detailInfluence = Math.max(0, Math.min(1, settings.detailInfluence));
      settings.aoStrength = Math.max(0, Math.min(8, settings.aoStrength));
      return { ...node, data: { ...data, settings, status: 'idle', maps: createMaterialMapOutputs(data.inputUrl), manifest: undefined, error: undefined } };
    }));
  }

  function addGenerator(position?: { x: number; y: number }, sourceId?: string, sourceHandle?: string | null, prompt = '') {
    const id = `generator-${crypto.randomUUID()}`;
    const viewportCenter = reactFlow.screenToFlowPosition({ x: window.innerWidth * 0.55, y: window.innerHeight * 0.5 });
    const node: StudioNode = { id, type: 'generator', position: position || viewportCenter, data: { title: 'Generate image', prompt, provider: 'global', status: 'idle' } };
    setNodes((current) => [...current, node]);
    if (sourceId) setEdges((current) => addEdge({ id: `edge-${sourceId}-${sourceHandle || 'output'}-${id}`, source: sourceId, sourceHandle, target: id, ...(sourceHandle === 'all' ? allViewsEdgeDefaults : edgeDefaults) }, current));
    if (window.innerWidth <= 850) setSidebarOpen(false);
    if (!sourceId || window.innerWidth <= 850) window.setTimeout(() => reactFlow.fitView({ padding: 0.18, duration: 280 }), 30);
    return id;
  }

  function createTurnaroundData(): CharacterViewsNodeData {
    return {
      title: 'Character views',
      provider: 'global',
      generationMode: 'fast',
      basePrompt: 'Preserve this exact character identity, outfit, proportions, palette, materials and every accessory across all views.',
      views: Object.fromEntries(viewKeys.map((key) => [key, { key, title: viewPrompts[key].title, prompt: viewPrompts[key].prompt, status: 'idle' }])) as CharacterViewsNodeData['views'],
    };
  }

  function addCharacterViews(position?: { x: number; y: number }, sourceId?: string, sourceHandle?: string | null) {
    const id = `character-views-${crypto.randomUUID()}`;
    const viewportCenter = reactFlow.screenToFlowPosition({ x: window.innerWidth * 0.56, y: window.innerHeight * 0.48 });
    const node: StudioNode = { id, type: 'characterViews', position: position || viewportCenter, data: createTurnaroundData() };
    setNodes((current) => [...current, node]);
    if (sourceId) setEdges((current) => addEdge({ id: `edge-${sourceId}-${sourceHandle || 'output'}-${id}`, source: sourceId, sourceHandle, target: id, ...(sourceHandle === 'all' ? allViewsEdgeDefaults : edgeDefaults) }, current));
    if (window.innerWidth <= 850) setSidebarOpen(false);
    if (!sourceId || window.innerWidth <= 850) window.setTimeout(() => reactFlow.fitView({ padding: 0.15, duration: 300 }), 30);
    return id;
  }

  function createCharacterPartsData(): CharacterPartsNodeData {
    return {
      title: 'Character Parts',
      notes: '',
      provider: 'global',
      generationMode: 'fast',
      parts: Object.fromEntries(characterPartKeys.map((key) => [key, { key, title: characterPartSpecs[key].title, description: characterPartSpecs[key].description, status: 'idle' }])) as CharacterPartsNodeData['parts'],
    };
  }

  function addCharacterParts(position?: { x: number; y: number }, sourceId?: string, sourceHandle?: string | null) {
    const id = `character-parts-${crypto.randomUUID()}`;
    const viewportCenter = reactFlow.screenToFlowPosition({ x: window.innerWidth * 0.56, y: window.innerHeight * 0.48 });
    const node: StudioNode = { id, type: 'characterParts', position: position || viewportCenter, data: createCharacterPartsData() };
    setNodes((current) => [...current, node]);
    if (sourceId) setEdges((current) => addEdge({ id: `edge-${sourceId}-${sourceHandle || 'output'}-${id}`, source: sourceId, sourceHandle, target: id, ...(sourceHandle === 'all' ? allViewsEdgeDefaults : edgeDefaults) }, current));
    if (window.innerWidth <= 850) setSidebarOpen(false);
    if (!sourceId || window.innerWidth <= 850) window.setTimeout(() => reactFlow.fitView({ padding: 0.14, duration: 300 }), 30);
    return id;
  }

  function addMultiGenerate(position?: { x: number; y: number }, sourceId?: string, sourceHandle?: string | null) {
    const id = `multi-generate-${crypto.randomUUID()}`;
    const viewportCenter = reactFlow.screenToFlowPosition({ x: window.innerWidth * 0.56, y: window.innerHeight * 0.48 });
    const node: StudioNode = {
      id,
      type: 'multiGenerate',
      position: position || viewportCenter,
      data: {
        title: 'Multi Generate',
        prompt: 'Create a polished game-ready variation of this image. Preserve the core subject while exploring a distinct visual solution.',
        variantCount: 3,
        provider: 'global',
        generationMode: 'fast',
        variants: createVariantSlots(3),
      },
    };
    setNodes((current) => [...current, node]);
    if (sourceId) setEdges((current) => addEdge({ id: `edge-${sourceId}-${sourceHandle || 'output'}-${id}`, source: sourceId, sourceHandle, target: id, ...(sourceHandle === 'all' ? allViewsEdgeDefaults : edgeDefaults) }, current));
    if (window.innerWidth <= 850) setSidebarOpen(false);
    if (!sourceId || window.innerWidth <= 850) window.setTimeout(() => reactFlow.fitView({ padding: 0.16, duration: 300 }), 30);
    return id;
  }

  function addSpriteAtlas(position?: { x: number; y: number }, sourceId?: string, sourceHandle?: string | null) {
    const id = `sprite-atlas-${crypto.randomUUID()}`;
    const viewportCenter = reactFlow.screenToFlowPosition({ x: window.innerWidth * 0.58, y: window.innerHeight * 0.5 });
    const node: StudioNode = {
      id,
      type: 'spriteAtlas',
      position: position || viewportCenter,
      data: {
        title: 'Sprite Atlas',
        status: 'idle',
        settings: { cellSize: 256, gutter: 8, outerMargin: 8, columns: 'auto', safeArea: 0.8, pixelArt: false, powerOfTwo: false },
      },
    };
    setNodes((current) => [...current, node]);
    if (sourceId) setEdges((current) => addEdge({ id: `edge-${sourceId}-${sourceHandle || 'output'}-${id}`, source: sourceId, sourceHandle, target: id, ...(sourceHandle === 'all' ? allViewsEdgeDefaults : edgeDefaults) }, current));
    if (window.innerWidth <= 850) setSidebarOpen(false);
    if (!sourceId || window.innerWidth <= 850) window.setTimeout(() => reactFlow.fitView({ padding: 0.16, duration: 300 }), 30);
    return id;
  }

  function addRelativeAtlas(position?: { x: number; y: number }, sourceId?: string, sourceHandle?: string | null) {
    const id = `relative-atlas-${crypto.randomUUID()}`;
    const viewportCenter = reactFlow.screenToFlowPosition({ x: window.innerWidth * 0.58, y: window.innerHeight * 0.5 });
    const node: StudioNode = { id, type: 'relativeAtlas', position: position || viewportCenter, data: { title: 'Relative Atlas', status: 'idle', settings: { canvasSize: 1024, padding: 8, outerMargin: 12, pixelArt: false } } };
    setNodes((current) => [...current, node]);
    if (sourceId) setEdges((current) => addEdge({ id: `edge-${sourceId}-${sourceHandle || 'output'}-${id}`, source: sourceId, sourceHandle, target: id, ...(sourceHandle === 'all' ? allViewsEdgeDefaults : edgeDefaults) }, current));
    if (window.innerWidth <= 850) setSidebarOpen(false);
    if (!sourceId || window.innerWidth <= 850) window.setTimeout(() => reactFlow.fitView({ padding: 0.16, duration: 300 }), 30);
    return id;
  }

  function addSeamlessTexture(position?: { x: number; y: number }, sourceId?: string, sourceHandle?: string | null) {
    const id = `seamless-texture-${crypto.randomUUID()}`;
    const viewportCenter = reactFlow.screenToFlowPosition({ x: window.innerWidth * 0.56, y: window.innerHeight * 0.48 });
    const node: StudioNode = {
      id,
      type: 'seamlessTexture',
      position: position || viewportCenter,
      data: {
        title: 'Seamless Texture',
        prompt: 'Create a clean game-ready surface material based on this reference. Preserve the material character and scale while removing directional lighting and unique landmarks.',
        provider: 'global',
        status: 'idle',
        settings: { outputSize: 1024, edgeBlend: 0.08 },
      },
    };
    setNodes((current) => [...current, node]);
    if (sourceId) setEdges((current) => addEdge({ id: `edge-${sourceId}-${sourceHandle || 'output'}-${id}`, source: sourceId, sourceHandle, target: id, ...edgeDefaults }, current));
    if (window.innerWidth <= 850) setSidebarOpen(false);
    if (!sourceId || window.innerWidth <= 850) window.setTimeout(() => reactFlow.fitView({ padding: 0.16, duration: 300 }), 30);
    return id;
  }

  function addMaterialMaps(position?: { x: number; y: number }, sourceId?: string, sourceHandle?: string | null) {
    const id = `material-maps-${crypto.randomUUID()}`;
    const viewportCenter = reactFlow.screenToFlowPosition({ x: window.innerWidth * 0.58, y: window.innerHeight * 0.5 });
    const node: StudioNode = {
      id,
      type: 'materialMaps',
      position: position || viewportCenter,
      data: {
        title: 'PBR Material Maps',
        status: 'idle',
        maps: createMaterialMapOutputs(),
        settings: { normalStrength: 2.5, normalFormat: 'opengl', heightContrast: 1.2, invertHeight: false, roughnessLevel: 0.65, metallicLevel: 0, detailInfluence: 0.35, aoStrength: 3 },
      },
    };
    setNodes((current) => [...current, node]);
    if (sourceId) setEdges((current) => addEdge({ id: `edge-${sourceId}-${sourceHandle || 'output'}-${id}`, source: sourceId, sourceHandle, target: id, ...edgeDefaults }, current));
    if (window.innerWidth <= 850) setSidebarOpen(false);
    if (!sourceId || window.innerWidth <= 850) window.setTimeout(() => reactFlow.fitView({ padding: 0.14, duration: 300 }), 30);
    return id;
  }

  function branchFromNode(nodeId: string, sourceHandle?: string) {
    const source = reactFlow.getNode(nodeId);
    if (!source) return;
    addGenerator({ x: source.position.x + (source.type === 'characterViews' || source.type === 'characterParts' || source.type === 'materialMaps' ? 540 : 390), y: source.position.y + 32 }, nodeId, sourceHandle);
    window.setTimeout(() => reactFlow.fitView({ padding: 0.18, duration: 320 }), 30);
  }

  function sourceUrlsFor(node: Node | undefined, sourceHandle?: string | null): string[] {
    if (!node) return [];
    if (node.type === 'image') return [String(node.data.imageUrl || '')].filter(Boolean);
    if (node.type === 'generator') return [String(node.data.outputUrl || '')].filter(Boolean);
    if (node.type === 'characterViews' && sourceHandle === 'all') {
      const urls = viewKeys.map((key) => (node.data as CharacterViewsNodeData).views[key]?.outputUrl).filter((url): url is string => Boolean(url));
      return urls.length === 4 ? urls : [];
    }
    if (node.type === 'characterViews' && sourceHandle && viewKeys.includes(sourceHandle as ViewKey)) {
      return [String((node.data as CharacterViewsNodeData).views[sourceHandle as ViewKey]?.outputUrl || '')].filter(Boolean);
    }
    if (node.type === 'multiGenerate' && sourceHandle === 'all') {
      const data = node.data as MultiGenerateNodeData;
      const urls = data.variants.slice(0, data.variantCount).map((variant) => variant.outputUrl).filter((url): url is string => Boolean(url));
      return urls.length === data.variantCount ? urls : [];
    }
    if (node.type === 'multiGenerate' && sourceHandle) {
      const variant = (node.data as MultiGenerateNodeData).variants.find((item) => item.key === sourceHandle);
      return [String(variant?.outputUrl || '')].filter(Boolean);
    }
    if (node.type === 'characterParts' && sourceHandle === 'all') {
      const data = node.data as CharacterPartsNodeData;
      const urls = characterPartKeys.map((key) => data.parts[key]?.normalized ? data.parts[key].outputUrl : undefined).filter((url): url is string => Boolean(url));
      return urls.length === characterPartKeys.length ? urls : [];
    }
    if (node.type === 'characterParts' && sourceHandle && characterPartKeys.includes(sourceHandle as CharacterPartKey)) {
      const part = (node.data as CharacterPartsNodeData).parts[sourceHandle as CharacterPartKey];
      return [String(part?.normalized ? part.outputUrl || '' : '')].filter(Boolean);
    }
    if (node.type === 'spriteAtlas') return [String((node.data as SpriteAtlasNodeData).outputUrl || '')].filter(Boolean);
    if (node.type === 'relativeAtlas') return [String((node.data as RelativeAtlasNodeData).outputUrl || '')].filter(Boolean);
    if (node.type === 'seamlessTexture') return [String((node.data as SeamlessTextureNodeData).outputUrl || '')].filter(Boolean);
    if (node.type === 'materialMaps' && sourceHandle === 'all') {
      const maps = (node.data as MaterialMapsNodeData).maps;
      const urls = materialMapKeys.map((key) => maps[key]?.outputUrl).filter((url): url is string => Boolean(url));
      return urls.length === materialMapKeys.length ? urls : [];
    }
    if (node.type === 'materialMaps' && sourceHandle && materialMapKeys.includes(sourceHandle as MaterialMapKey)) {
      return [String((node.data as MaterialMapsNodeData).maps[sourceHandle as MaterialMapKey]?.outputUrl || '')].filter(Boolean);
    }
    return [];
  }

  function sourceUrlFor(node: Node | undefined, sourceHandle?: string | null): string {
    return sourceUrlsFor(node, sourceHandle)[0] || '';
  }

  function findInput(nodeId: string) {
    const incoming = reactFlow.getEdges().filter((edge) => edge.target === nodeId);
    if (incoming.length !== 1) return { sourceUrl: '', sourceUrls: [] as string[], error: incoming.length > 1 ? 'This node has multiple inputs. Keep one connection; collection outputs already carry every image.' : 'Connect an image output to the left input first.' };
    const edge = incoming[0];
    const sourceUrls = sourceUrlsFor(reactFlow.getNode(edge.source), edge.sourceHandle);
    return { sourceUrl: sourceUrls[0] || '', sourceUrls, error: sourceUrls.length ? '' : edge.sourceHandle === 'all' ? 'Complete every item before using this collection output.' : 'The connected output does not have an image yet.' };
  }

  function resolveProvider(value: unknown): ProviderId { return value === 'gemini' ? 'gemini' : globalProvider; }

  async function runGenerator(nodeId: string) {
    const graphNode = reactFlow.getNode(nodeId);
    if (!graphNode || graphNode.type !== 'generator') return;
    const input = findInput(nodeId);
    const prompt = String(graphNode.data.prompt || '').trim();
    const provider = resolveProvider(graphNode.data.provider);
    if (input.error) return patchGenerator(nodeId, { status: 'failed', error: input.error });
    if (!prompt) return patchGenerator(nodeId, { status: 'failed', error: 'Write a prompt before running this node.' });
    if (provider === 'gemini') return patchGenerator(nodeId, { status: 'failed', error: 'Gemini Nano Banana has no supported local OAuth image interface. Codex remains the active provider.' });
    if (!codex.connected) return patchGenerator(nodeId, { status: 'failed', error: 'Connect Codex before running ImageGen.' });
    patchGenerator(nodeId, { status: 'queued', sourceUrl: input.sourceUrl, sourceUrls: input.sourceUrls, resolvedProvider: provider, progress: input.sourceUrls.length > 1 ? `${input.sourceUrls.length} references added to local queue` : 'Added to local queue', error: undefined });
    try {
      const { jobId } = await startGeneration(input.sourceUrls, prompt, { provider, outputName: String(graphNode.data.title || 'generated') });
      patchGenerator(nodeId, { jobId });
      void pollGenerator(nodeId, jobId);
      void refreshJobs();
    } catch (error) { patchGenerator(nodeId, { status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }

  async function pollGenerator(nodeId: string, jobId: string) {
    let failures = 0;
    for (;;) {
      try {
        const job = await getGenerationJob(jobId);
        failures = 0;
        patchGenerator(nodeId, { status: job.status, progress: job.progress, error: job.error || undefined });
        if (job.status === 'completed' && job.outputUrl) {
          patchGenerator(nodeId, { status: 'completed', outputUrl: job.outputUrl, progress: 'Ready' });
          showToast('Image saved locally and added to Gallery.');
          void refreshAssets(); void refreshJobs(); return;
        }
        if (['failed', 'cancelled', 'interrupted'].includes(job.status)) { void refreshJobs(); return; }
      } catch (error) {
        failures += 1;
        if (error instanceof ApiError && error.status === 404) {
          patchGenerator(nodeId, { status: 'failed', progress: 'Job is unavailable', error: 'Generation job was not found. Run this node again.' });
          return;
        }
        patchGenerator(nodeId, { progress: failures > 1 ? 'Backend unavailable, still checking status' : 'Reconnecting to local queue' });
      }
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(4_000, 1_350 + failures * 650)));
    }
  }

  async function cancelGenerator(nodeId: string) {
    const node = reactFlow.getNode(nodeId);
    const jobId = String(node?.data.jobId || '');
    if (!jobId) return;
    try {
      const job = await cancelJob(jobId);
      setJobs((current) => current.map((item) => item.id === job.id ? job : item));
      patchGenerator(nodeId, { status: job.status, progress: job.progress });
      showToast(job.status === 'running' ? 'Current generation will finish, then the queue will stop.' : 'Queued generation cancelled.');
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  function patchGenerator(nodeId: string, patch: Partial<GeneratorNodeData>) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node));
  }

  function patchSeamless(nodeId: string, patch: Partial<SeamlessTextureNodeData>) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node));
  }

  async function runSeamlessTexture(nodeId: string) {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type !== 'seamlessTexture') return;
    const data = node.data as SeamlessTextureNodeData;
    const input = findInput(nodeId);
    const provider = resolveProvider(data.provider);
    const description = data.prompt.trim();
    if (input.error) return patchSeamless(nodeId, { status: 'failed', error: input.error });
    if (input.sourceUrls.length !== 1) return patchSeamless(nodeId, { status: 'failed', error: 'Seamless Texture requires one material reference, not a collection.' });
    if (!description) return patchSeamless(nodeId, { status: 'failed', error: 'Describe the material before running this node.' });
    if (provider === 'gemini') return patchSeamless(nodeId, { status: 'failed', error: 'Gemini image generation is unavailable without an official API provider.' });
    if (!codex.connected) return patchSeamless(nodeId, { status: 'failed', error: 'Connect Codex before generating a texture.' });
    const prompt = `${description}\n\nCreate exactly one square, perfectly tileable seamless BASE COLOR texture for a game material. Use flat neutral albedo with no directional lighting, no cast shadows, no highlights, no perspective, no objects, no borders, no text and no baked ambient occlusion. Preserve consistent texel density. Opposite left/right and top/bottom edges must wrap continuously. Fill the entire image.`;
    patchSeamless(nodeId, { status: 'queued', progress: 'Added seamless texture to local queue', sourceUrl: input.sourceUrl, jobId: undefined, rawOutputUrl: undefined, rawAssetId: undefined, outputUrl: undefined, outputAssetId: undefined, seamScore: undefined, processingSeams: false, error: undefined });
    try {
      const { jobId } = await startGeneration(input.sourceUrl, prompt, { provider, outputName: 'seamless-base-color' });
      patchSeamless(nodeId, { jobId });
      void pollSeamlessTexture(nodeId, jobId);
      void refreshJobs();
    } catch (error) {
      patchSeamless(nodeId, { status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function pollSeamlessTexture(nodeId: string, jobId: string) {
    let failures = 0;
    for (;;) {
      try {
        const job = await getGenerationJob(jobId);
        failures = 0;
        if (job.status === 'completed' && job.outputUrl) {
          patchSeamless(nodeId, { status: 'running', progress: 'Finishing tile-safe edges…', rawOutputUrl: job.outputUrl, rawAssetId: job.outputAssetId || undefined, error: undefined });
          void refreshJobs();
          return;
        }
        patchSeamless(nodeId, { status: job.status, progress: job.progress, error: job.error || undefined });
        if (['failed', 'cancelled', 'interrupted'].includes(job.status)) { void refreshJobs(); return; }
      } catch (error) {
        failures += 1;
        if (error instanceof ApiError && error.status === 404) {
          patchSeamless(nodeId, { status: 'failed', error: 'Texture generation job was not found. Run this node again.' });
          return;
        }
        patchSeamless(nodeId, { progress: failures > 1 ? 'Backend unavailable, still checking status' : 'Reconnecting to local queue' });
      }
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(4_000, 1_350 + failures * 650)));
    }
  }

  async function finalizeSeamlessTexture(nodeId: string, knownJobId?: string, knownRawUrl?: string, knownRawAssetId?: string) {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type !== 'seamlessTexture') return;
    const data = node.data as SeamlessTextureNodeData;
    const jobId = knownJobId || data.jobId;
    const rawUrl = knownRawUrl || data.rawOutputUrl;
    if (!jobId || !rawUrl) return;
    const key = `${nodeId}:${jobId}`;
    if (seamlessFinalizersRef.current.has(key)) return;
    seamlessFinalizersRef.current.add(key);
    patchSeamless(nodeId, { status: 'running', processingSeams: true, progress: 'Blending wrap edges and checking seams…', error: undefined });
    try {
      const result = await buildSeamlessTexture(rawUrl, data.settings);
      const saved = await saveDerivedAsset(result.blob, { name: `seamless-base-color-${Date.now()}.png`, parentAssetIds: [knownRawAssetId || data.rawAssetId || ''].filter(Boolean), assetRole: 'seamless-texture', manifest: result.manifest });
      patchSeamless(nodeId, { status: 'completed', processingSeams: false, progress: 'Tile-safe PNG ready', outputUrl: saved.url, outputAssetId: saved.id, seamScore: result.seamScore, error: undefined });
      await refreshAssets();
      showToast(`Seamless texture saved locally · edge match ${result.seamScore}%.`);
    } catch (error) {
      patchSeamless(nodeId, { status: 'failed', processingSeams: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function cancelSeamlessTexture(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as SeamlessTextureNodeData | undefined;
    if (!data?.jobId || data.processingSeams) return;
    try {
      const job = await cancelJob(data.jobId);
      patchSeamless(nodeId, { status: job.status, progress: job.progress });
      void refreshJobs();
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  function downloadSeamlessTexture(nodeId: string) {
    const url = (reactFlow.getNode(nodeId)?.data as SeamlessTextureNodeData | undefined)?.outputUrl;
    if (url) downloadUrl(url);
  }

  async function deleteSeamlessTexture(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as SeamlessTextureNodeData | undefined;
    if (!data?.outputUrl || !window.confirm('Move this seamless texture to Frameforge trash?')) return;
    try {
      await deleteGeneratedImage(data.outputUrl);
      patchSeamless(nodeId, { status: 'idle', outputUrl: undefined, outputAssetId: undefined, seamScore: undefined, error: undefined });
      await refreshAssets();
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  function patchView(nodeId: string, viewKey: ViewKey, patch: Partial<CharacterViewsNodeData['views'][ViewKey]>) {
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId) return node;
      const data = node.data as CharacterViewsNodeData;
      return { ...node, data: { ...data, views: { ...data.views, [viewKey]: { ...data.views[viewKey], ...patch } } } };
    }));
  }

  async function runTurnaroundView(nodeId: string, viewKey: ViewKey, waitForCompletion = false): Promise<GenerationJob | undefined> {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type !== 'characterViews') return;
    const data = node.data as CharacterViewsNodeData;
    const input = findInput(nodeId);
    const provider = resolveProvider(data.provider);
    if (input.error) { patchView(nodeId, viewKey, { status: 'failed', error: input.error }); return; }
    if (input.sourceUrls.length !== 1) { patchView(nodeId, viewKey, { status: 'failed', error: 'Character Views requires one source image. Connect an individual output instead of All.' }); return; }
    if (provider === 'gemini') { patchView(nodeId, viewKey, { status: 'failed', error: 'Gemini image generation is unavailable without an official API provider.' }); return; }
    if (!codex.connected) { patchView(nodeId, viewKey, { status: 'failed', error: 'Connect Codex before running ImageGen.' }); return; }
    const view = data.views[viewKey];
    const prompt = `${data.basePrompt.trim()}\n\n${view.prompt}`.trim();
    patchView(nodeId, viewKey, { status: 'queued', progress: 'Added to local queue', sourceUrl: input.sourceUrl, error: undefined });
    try {
      const { jobId } = await startGeneration(input.sourceUrl, prompt, { provider, outputName: `${data.title}-${viewKey}`, view: viewKey });
      patchView(nodeId, viewKey, { jobId });
      const polling = pollTurnaroundView(nodeId, viewKey, jobId);
      void refreshJobs();
      if (waitForCompletion) return await polling;
      void polling;
    } catch (error) { patchView(nodeId, viewKey, { status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }

  async function pollTurnaroundView(nodeId: string, viewKey: ViewKey, jobId: string): Promise<GenerationJob | undefined> {
    let failures = 0;
    for (;;) {
      try {
        const job = await getGenerationJob(jobId);
        failures = 0;
        patchView(nodeId, viewKey, { status: job.status, progress: job.progress, error: job.error || undefined });
        if (job.status === 'completed' && job.outputUrl) {
          patchView(nodeId, viewKey, { status: 'completed', outputUrl: job.outputUrl, progress: 'Ready' });
          void refreshAssets(); void refreshJobs(); return job;
        }
        if (['failed', 'cancelled', 'interrupted'].includes(job.status)) { void refreshJobs(); return job; }
      } catch (error) {
        failures += 1;
        if (error instanceof ApiError && error.status === 404) {
          patchView(nodeId, viewKey, { status: 'failed', progress: 'Job is unavailable', error: 'Generation job was not found. Generate this view again.' });
          return undefined;
        }
        patchView(nodeId, viewKey, { progress: failures > 1 ? 'Backend unavailable, still checking status' : 'Reconnecting to local queue' });
      }
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(4_000, 1_350 + failures * 650)));
    }
  }

  async function runTurnaroundAll(nodeId: string, onlyMissing = false) {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type !== 'characterViews') return;
    const data = node.data as CharacterViewsNodeData;
    const keys = viewKeys.filter((key) => !onlyMissing || !data.views[key].outputUrl);
    if (!keys.length) return;
    const generationMode = data.generationMode || 'fast';
    if (generationMode === 'reliable') {
      for (const key of keys) await runTurnaroundView(nodeId, key, true);
      return;
    }

    const input = findInput(nodeId);
    const provider = resolveProvider(data.provider);
    if (input.error || input.sourceUrls.length !== 1 || provider === 'gemini' || !codex.connected) {
      const error = input.error || (input.sourceUrls.length !== 1 ? 'Character Views requires one source image. Connect an individual output instead of All.' : provider === 'gemini' ? 'Gemini image generation is unavailable without an official API provider.' : 'Connect Codex before running ImageGen.');
      keys.forEach((key) => patchView(nodeId, key, { status: 'failed', error }));
      return;
    }

    const workerLabel = generationMode === 'turbo' ? 'Turbo' : 'Fast';
    const batchConcurrency = generationMode === 'turbo' ? 4 : 2;
    keys.forEach((key) => patchView(nodeId, key, { status: 'queued', progress: `Waiting for a ${workerLabel} worker`, sourceUrl: input.sourceUrl, error: undefined }));
    try {
      const batch = await startGenerationBatch(input.sourceUrl, keys.map((key) => ({
        key,
        prompt: `${data.basePrompt.trim()}\n\n${data.views[key].prompt}`.trim(),
        outputName: `${data.title}-${key}`,
      })), { provider, concurrency: batchConcurrency });
      const polling: Array<{ key: ViewKey; promise: Promise<GenerationJob | undefined> }> = [];
      for (const batchJob of batch.jobs) {
        const key = batchJob.viewKey as ViewKey;
        if (!viewKeys.includes(key)) continue;
        patchView(nodeId, key, { jobId: batchJob.id, status: 'queued', progress: `Waiting for a ${workerLabel} worker` });
        polling.push({ key, promise: pollTurnaroundView(nodeId, key, batchJob.id) });
      }
      void refreshJobs();
      const settled = await Promise.all(polling.map(async ({ key, promise }) => ({ key, job: await promise })));
      const fallbackKeys = settled.filter(({ job }) => job?.status === 'failed' && /concurr|too many|rate.?limit|resource exhausted|temporarily unavailable|\b429\b/i.test(`${job.error || ''} ${job.progress || ''}`)).map(({ key }) => key);
      if (fallbackKeys.length) {
        updateTurnaroundMode(nodeId, 'reliable');
        showToast(`${workerLabel} mode was limited by Codex. Retrying failed views one at a time.`);
        for (const key of fallbackKeys) await runTurnaroundView(nodeId, key, true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      keys.forEach((key) => patchView(nodeId, key, { status: 'failed', progress: 'Could not start batch', error: message }));
    }
  }

  async function cancelTurnaroundView(nodeId: string, viewKey: ViewKey) {
    const node = reactFlow.getNode(nodeId);
    const jobId = (node?.data as CharacterViewsNodeData | undefined)?.views?.[viewKey]?.jobId;
    if (!jobId) return;
    try { const job = await cancelJob(jobId); setJobs((current) => current.map((item) => item.id === job.id ? job : item)); patchView(nodeId, viewKey, { status: job.status, progress: job.progress }); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  function patchMulti(nodeId: string, patch: Partial<MultiGenerateNodeData>) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node));
  }

  function patchVariant(nodeId: string, key: string, patch: Partial<MultiGenerateNodeData['variants'][number]>) {
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId || node.type !== 'multiGenerate') return node;
      const data = node.data as MultiGenerateNodeData;
      return { ...node, data: { ...data, variants: data.variants.map((variant) => variant.key === key ? { ...variant, ...patch } : variant) } };
    }));
  }

  async function runMultiVariant(nodeId: string, key: string, waitForCompletion = false): Promise<GenerationJob | undefined> {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type !== 'multiGenerate') return;
    const data = node.data as MultiGenerateNodeData;
    const variant = data.variants.find((item) => item.key === key);
    if (!variant) return;
    const input = findInput(nodeId);
    const provider = resolveProvider(data.provider);
    if (input.error) { patchVariant(nodeId, key, { status: 'failed', error: input.error }); return; }
    if (!data.prompt.trim()) { patchVariant(nodeId, key, { status: 'failed', error: 'Write a shared variation prompt first.' }); return; }
    if (provider === 'gemini') { patchVariant(nodeId, key, { status: 'failed', error: 'Gemini image generation is unavailable without an official API provider.' }); return; }
    if (!codex.connected) { patchVariant(nodeId, key, { status: 'failed', error: 'Connect Codex before running ImageGen.' }); return; }

    patchVariant(nodeId, key, { status: 'queued', progress: 'Added to local queue', sourceUrl: input.sourceUrl, error: undefined });
    try {
      const { jobId } = await startGeneration(input.sourceUrls, multiVariantPrompt(data, variant.index), { provider, outputName: `${data.title}-variant-${variant.index + 1}` });
      patchVariant(nodeId, key, { jobId });
      const polling = pollMultiVariant(nodeId, key, jobId);
      void refreshJobs();
      if (waitForCompletion) return await polling;
      void polling;
    } catch (error) {
      patchVariant(nodeId, key, { status: 'failed', progress: 'Could not start generation', error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function pollMultiVariant(nodeId: string, key: string, jobId: string): Promise<GenerationJob | undefined> {
    let failures = 0;
    for (;;) {
      try {
        const job = await getGenerationJob(jobId);
        failures = 0;
        patchVariant(nodeId, key, { status: job.status, progress: job.progress, error: job.error || undefined });
        if (job.status === 'completed' && job.outputUrl) {
          patchVariant(nodeId, key, { status: 'completed', outputUrl: job.outputUrl, assetId: job.outputAssetId || undefined, progress: 'Ready' });
          void refreshAssets(); void refreshJobs(); return job;
        }
        if (['failed', 'cancelled', 'interrupted'].includes(job.status)) { void refreshJobs(); return job; }
      } catch (error) {
        failures += 1;
        if (error instanceof ApiError && error.status === 404) {
          patchVariant(nodeId, key, { status: 'failed', progress: 'Job is unavailable', error: 'Generation job was not found. Generate this variant again.' });
          return;
        }
        patchVariant(nodeId, key, { progress: failures > 1 ? 'Backend unavailable, still checking status' : 'Reconnecting to local queue' });
      }
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(4_000, 1_350 + failures * 650)));
    }
  }

  async function runMultiAll(nodeId: string, onlyMissing = false) {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type !== 'multiGenerate') return;
    const data = node.data as MultiGenerateNodeData;
    const variants = data.variants.slice(0, data.variantCount).filter((variant) => !onlyMissing || !variant.outputUrl);
    if (!variants.length) return;
    const input = findInput(nodeId);
    const provider = resolveProvider(data.provider);
    const error = input.error || (!data.prompt.trim() ? 'Write a shared variation prompt first.' : provider === 'gemini' ? 'Gemini image generation is unavailable without an official API provider.' : !codex.connected ? 'Connect Codex before running ImageGen.' : '');
    if (error) {
      patchMulti(nodeId, { error });
      variants.forEach((variant) => patchVariant(nodeId, variant.key, { status: 'failed', error }));
      return;
    }
    patchMulti(nodeId, { error: undefined });

    if ((data.generationMode || 'fast') === 'reliable') {
      for (const variant of variants) await runMultiVariant(nodeId, variant.key, true);
      return;
    }

    const multiMode = data.generationMode || 'fast';
    const multiConcurrency = multiMode === 'turbo' ? 4 : 2;
    const multiWorkerLabel = multiMode === 'turbo' ? 'Turbo' : 'Fast';
    variants.forEach((variant) => patchVariant(nodeId, variant.key, { status: 'queued', progress: `Waiting for a ${multiWorkerLabel} worker`, sourceUrl: input.sourceUrl, error: undefined }));
    try {
      const batch = await startSlotBatch(input.sourceUrls, variants.map((variant) => ({ key: variant.key, prompt: multiVariantPrompt(data, variant.index), outputName: `${data.title}-variant-${variant.index + 1}` })), { provider, kind: 'variants', concurrency: multiConcurrency });
      patchMulti(nodeId, { batchId: batch.batchId });
      const polling: Array<{ key: string; promise: Promise<GenerationJob | undefined> }> = [];
      for (const batchJob of batch.jobs) {
        const key = batchJob.slotKey;
        if (!data.variants.some((variant) => variant.key === key)) continue;
        patchVariant(nodeId, key, { jobId: batchJob.id, status: 'queued', progress: `Waiting for a ${multiWorkerLabel} worker` });
        polling.push({ key, promise: pollMultiVariant(nodeId, key, batchJob.id) });
      }
      void refreshJobs();
      const settled = await Promise.all(polling.map(async ({ key, promise }) => ({ key, job: await promise })));
      const fallback = settled.filter(({ job }) => job?.status === 'failed' && /concurr|too many|rate.?limit|resource exhausted|temporarily unavailable|\b429\b/i.test(`${job.error || ''} ${job.progress || ''}`)).map(({ key }) => key);
      if (fallback.length) {
        updateMultiMode(nodeId, 'reliable');
        showToast('Fast mode was limited by Codex. Retrying failed variants one at a time.');
        for (const key of fallback) await runMultiVariant(nodeId, key, true);
      }
    } catch (batchError) {
      const message = batchError instanceof Error ? batchError.message : String(batchError);
      variants.forEach((variant) => patchVariant(nodeId, variant.key, { status: 'failed', progress: 'Could not start batch', error: message }));
    }
  }

  async function cancelMultiVariant(nodeId: string, key: string) {
    const data = reactFlow.getNode(nodeId)?.data as MultiGenerateNodeData | undefined;
    const jobId = data?.variants.find((variant) => variant.key === key)?.jobId;
    if (!jobId) return;
    try {
      const job = await cancelJob(jobId);
      setJobs((current) => current.map((item) => item.id === job.id ? job : item));
      patchVariant(nodeId, key, { status: job.status, progress: job.progress });
      showToast(job.status === 'running' ? 'Current generation will finish, then this slot will stop.' : 'Queued variant cancelled.');
    } catch (cancelError) { showToast(cancelError instanceof Error ? cancelError.message : String(cancelError)); }
  }

  function downloadMultiVariant(nodeId: string, key: string) {
    const data = reactFlow.getNode(nodeId)?.data as MultiGenerateNodeData | undefined;
    const url = data?.variants.find((variant) => variant.key === key)?.outputUrl;
    if (url) downloadUrl(url);
  }

  async function extractMultiVariant(nodeId: string, key: string) {
    const source = reactFlow.getNode(nodeId);
    const data = source?.data as MultiGenerateNodeData | undefined;
    const variant = data?.variants.find((item) => item.key === key);
    if (!source || !variant?.outputUrl) return;
    let library = assets;
    let asset = library.find((item) => item.id === variant.assetId || item.url === variant.outputUrl);
    if (!asset) {
      try { library = await getAssets({ includeTrashed: true }); setAssets(library); asset = library.find((item) => item.id === variant.assetId || item.url === variant.outputUrl); }
      catch (extractError) { return showToast(extractError instanceof Error ? extractError.message : String(extractError)); }
    }
    if (!asset || asset.deletedAt) return showToast('This result is not available in the active Gallery.');
    const imageId = addAssetNode(
      asset,
      { x: source.position.x + 590, y: source.position.y + 80 + Math.floor(variant.index / 2) * 250 },
      { title: variant.title, hasInput: true },
    );
    setEdges((current) => addEdge({
      id: `edge-${nodeId}-${variant.key}-${imageId}`,
      source: nodeId,
      sourceHandle: variant.key,
      target: imageId,
      ...edgeDefaults,
    }, current));
    showToast(`${variant.title} is now a connected Image node.`);
  }

  async function deleteMultiVariant(nodeId: string, key: string) {
    const data = reactFlow.getNode(nodeId)?.data as MultiGenerateNodeData | undefined;
    const variant = data?.variants.find((item) => item.key === key);
    if (!variant?.outputUrl || !window.confirm(`Move ${variant.title} to Frameforge trash? Extracted nodes using this asset will also lose it.`)) return;
    try {
      await deleteGeneratedImage(variant.outputUrl);
      patchVariant(nodeId, key, { outputUrl: undefined, assetId: undefined, jobId: undefined, status: 'idle', progress: undefined, error: undefined });
      await refreshAssets();
    } catch (deleteError) { showToast(deleteError instanceof Error ? deleteError.message : String(deleteError)); }
  }

  function patchParts(nodeId: string, patch: Partial<CharacterPartsNodeData>) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node));
  }

  function patchPart(nodeId: string, key: CharacterPartKey, patch: Partial<CharacterPartsNodeData['parts'][CharacterPartKey]>) {
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId || node.type !== 'characterParts') return node;
      const data = node.data as CharacterPartsNodeData;
      return { ...node, data: { ...data, parts: { ...data.parts, [key]: { ...data.parts[key], ...patch } } } };
    }));
  }

  function partsInputError(input: ReturnType<typeof findInput>) {
    if (input.error) return input.error;
    return input.sourceUrls.length === 1 || input.sourceUrls.length === 4 ? '' : 'Character Parts accepts one image or a complete four-image All Views output.';
  }

  async function runPart(nodeId: string, key: CharacterPartKey, waitForCompletion = false): Promise<GenerationJob | undefined> {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type !== 'characterParts') return;
    const data = node.data as CharacterPartsNodeData;
    const input = findInput(nodeId);
    const provider = resolveProvider(data.provider);
    const error = partsInputError(input) || (provider === 'gemini' ? 'Gemini image generation is unavailable without an official API provider.' : !codex.connected ? 'Connect Codex before running ImageGen.' : '');
    if (error) { patchPart(nodeId, key, { status: 'failed', error }); return; }
    patchParts(nodeId, { error: undefined, inputUrls: input.sourceUrls });
    patchPart(nodeId, key, { status: 'queued', progress: 'Added to local queue', sourceUrl: input.sourceUrl, error: undefined, normalized: false, geometry: undefined });
    try {
      const { jobId } = await startGeneration(input.sourceUrls, characterPartPrompt(data, key, input.sourceUrls.length), { provider, outputName: `${data.title}-${key}` });
      patchPart(nodeId, key, { jobId });
      const polling = pollPart(nodeId, key, jobId);
      void refreshJobs();
      if (waitForCompletion) return await polling;
      void polling;
    } catch (generationError) {
      patchPart(nodeId, key, { status: 'failed', progress: 'Could not start layer generation', error: generationError instanceof Error ? generationError.message : String(generationError) });
    }
  }

  async function pollPart(nodeId: string, key: CharacterPartKey, jobId: string): Promise<GenerationJob | undefined> {
    let failures = 0;
    for (;;) {
      try {
        const job = await getGenerationJob(jobId);
        failures = 0;
        patchPart(nodeId, key, { status: job.status, progress: job.progress, error: job.error || undefined });
        if (job.status === 'completed' && job.outputUrl) {
          patchPart(nodeId, key, { status: 'running', outputUrl: job.outputUrl, assetId: job.outputAssetId || undefined, progress: 'Aligning canvas and removing background' });
          await finalizePartLayer(nodeId, key, job);
          void refreshAssets(); void refreshJobs(); return job;
        }
        if (['failed', 'cancelled', 'interrupted'].includes(job.status)) { void refreshJobs(); return job; }
      } catch (pollError) {
        failures += 1;
        if (pollError instanceof ApiError && pollError.status === 404) {
          patchPart(nodeId, key, { status: 'failed', progress: 'Job is unavailable', error: 'Generation job was not found. Generate this layer again.' });
          return;
        }
        patchPart(nodeId, key, { progress: failures > 1 ? 'Backend unavailable, still checking status' : 'Reconnecting to local queue' });
      }
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(4_000, 1_350 + failures * 650)));
    }
  }

  async function finalizePartLayer(nodeId: string, key: CharacterPartKey, job: GenerationJob) {
    const data = reactFlow.getNode(nodeId)?.data as CharacterPartsNodeData | undefined;
    const part = data?.parts[key];
    const referenceUrl = part?.sourceUrl || job.sourceUrl;
    if (!data || !job.outputUrl || !referenceUrl) throw new Error('The source canvas is no longer connected.');
    try {
      const normalized = await normalizeCharacterPartLayer(job.outputUrl, referenceUrl);
      let library = assets;
      const relevantUrls = [...(data.inputUrls || []), job.outputUrl];
      if (relevantUrls.some((url) => !library.some((asset) => asset.url === url))) {
        library = await getAssets({ includeTrashed: true });
        setAssets(library);
      }
      const parentAssetIds = relevantUrls.map((url) => library.find((asset) => asset.url === url)?.id).filter((id): id is string => Boolean(id));
      if (job.outputAssetId && !parentAssetIds.includes(job.outputAssetId)) parentAssetIds.push(job.outputAssetId);
      const manifest = {
        schemaVersion: 1,
        kind: 'frameforge-character-part',
        part: key,
        title: data.parts[key].title,
        coordinateSpace: 'source-pixel-top-left',
        canvas: { width: normalized.geometry.canvasWidth, height: normalized.geometry.canvasHeight },
        anchor: { x: 0, y: 0 },
        bounds: normalized.geometry.bounds,
        normalizedBounds: normalized.geometry.normalizedBounds,
        backgroundRemoved: normalized.geometry.backgroundRemoved,
        referenceUrls: data.inputUrls || [referenceUrl],
        generatedAssetId: job.outputAssetId || null,
      };
      const saved = await saveDerivedAsset(normalized.blob, { name: `${data.title}-${key}-aligned.png`, parentAssetIds, assetRole: 'character-part', manifest });
      patchPart(nodeId, key, { status: 'completed', progress: 'Aligned transparent PNG ready', outputUrl: saved.url, assetId: saved.id, normalized: true, geometry: normalized.geometry, error: undefined });
    } catch (normalizationError) {
      patchPart(nodeId, key, { status: 'failed', progress: 'Layer needs another pass', normalized: false, error: normalizationError instanceof Error ? normalizationError.message : String(normalizationError) });
    }
  }

  async function runPartsAll(nodeId: string, onlyMissing = false) {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type !== 'characterParts') return;
    const data = node.data as CharacterPartsNodeData;
    const keys = characterPartKeys.filter((key) => !onlyMissing || !data.parts[key].normalized);
    if (!keys.length) return;
    const input = findInput(nodeId);
    const provider = resolveProvider(data.provider);
    const error = partsInputError(input) || (provider === 'gemini' ? 'Gemini image generation is unavailable without an official API provider.' : !codex.connected ? 'Connect Codex before running ImageGen.' : '');
    if (error) {
      patchParts(nodeId, { error, inputUrls: input.sourceUrls });
      keys.forEach((key) => patchPart(nodeId, key, { status: 'failed', error }));
      return;
    }
    patchParts(nodeId, { error: undefined, inputUrls: input.sourceUrls });
    if ((data.generationMode || 'fast') === 'reliable') {
      for (const key of keys) await runPart(nodeId, key, true);
      showToast('Character layers aligned and saved locally.');
      return;
    }
    const partsMode = data.generationMode || 'fast';
    const partsConcurrency = partsMode === 'turbo' ? 4 : 2;
    const partsWorkerLabel = partsMode === 'turbo' ? 'Turbo' : 'Fast';
    keys.forEach((key) => patchPart(nodeId, key, { status: 'queued', progress: `Waiting for a ${partsWorkerLabel} worker`, sourceUrl: input.sourceUrl, error: undefined, normalized: false, geometry: undefined }));
    try {
      const batch = await startSlotBatch(input.sourceUrls, keys.map((key) => ({ key, prompt: characterPartPrompt(data, key, input.sourceUrls.length), outputName: `${data.title}-${key}` })), { provider, kind: 'character-parts', concurrency: partsConcurrency });
      patchParts(nodeId, { batchId: batch.batchId });
      const polling: Array<{ key: CharacterPartKey; promise: Promise<GenerationJob | undefined> }> = [];
      for (const batchJob of batch.jobs) {
        const key = batchJob.slotKey as CharacterPartKey;
        if (!characterPartKeys.includes(key)) continue;
        patchPart(nodeId, key, { jobId: batchJob.id, status: 'queued', progress: `Waiting for a ${partsWorkerLabel} worker` });
        polling.push({ key, promise: pollPart(nodeId, key, batchJob.id) });
      }
      void refreshJobs();
      const settled = await Promise.all(polling.map(async ({ key, promise }) => ({ key, job: await promise })));
      const fallback = settled.filter(({ job }) => job?.status === 'failed' && /concurr|too many|rate.?limit|resource exhausted|temporarily unavailable|\b429\b/i.test(`${job.error || ''} ${job.progress || ''}`)).map(({ key }) => key);
      if (fallback.length) {
        updatePartsMode(nodeId, 'reliable');
        showToast('Fast mode was limited by Codex. Retrying failed layers one at a time.');
        for (const key of fallback) await runPart(nodeId, key, true);
      } else showToast('Character layers aligned and saved locally.');
    } catch (batchError) {
      const message = batchError instanceof Error ? batchError.message : String(batchError);
      keys.forEach((key) => patchPart(nodeId, key, { status: 'failed', progress: 'Could not start batch', error: message }));
    }
  }

  async function cancelPart(nodeId: string, key: CharacterPartKey) {
    const data = reactFlow.getNode(nodeId)?.data as CharacterPartsNodeData | undefined;
    const jobId = data?.parts[key]?.jobId;
    if (!jobId) return;
    try {
      const job = await cancelJob(jobId);
      setJobs((current) => current.map((item) => item.id === job.id ? job : item));
      patchPart(nodeId, key, { status: job.status, progress: job.progress });
    } catch (cancelError) { showToast(cancelError instanceof Error ? cancelError.message : String(cancelError)); }
  }

  function downloadPart(nodeId: string, key: CharacterPartKey) {
    const url = (reactFlow.getNode(nodeId)?.data as CharacterPartsNodeData | undefined)?.parts[key]?.outputUrl;
    if (url) downloadUrl(url);
  }

  async function extractPart(nodeId: string, key: CharacterPartKey) {
    const source = reactFlow.getNode(nodeId);
    const part = (source?.data as CharacterPartsNodeData | undefined)?.parts[key];
    if (!source || !part?.outputUrl || !part.normalized) return;
    let library = assets;
    let asset = library.find((item) => item.id === part.assetId || item.url === part.outputUrl);
    if (!asset) {
      try { library = await getAssets({ includeTrashed: true }); setAssets(library); asset = library.find((item) => item.id === part.assetId || item.url === part.outputUrl); }
      catch (extractError) { return showToast(extractError instanceof Error ? extractError.message : String(extractError)); }
    }
    if (!asset || asset.deletedAt) return showToast('This layer is not available in the active Gallery.');
    const imageId = addAssetNode(asset, { x: source.position.x + 620, y: source.position.y + 45 + characterPartKeys.indexOf(key) * 118 }, { title: `${part.title} layer`, hasInput: true });
    setEdges((current) => addEdge({ id: `edge-${nodeId}-${key}-${imageId}`, source: nodeId, sourceHandle: key, target: imageId, ...edgeDefaults }, current));
    showToast(`${part.title} is now a connected aligned Image node.`);
  }

  async function deletePart(nodeId: string, key: CharacterPartKey) {
    const part = (reactFlow.getNode(nodeId)?.data as CharacterPartsNodeData | undefined)?.parts[key];
    if (!part?.outputUrl || !window.confirm(`Move the ${part.title} layer to Frameforge trash?`)) return;
    try {
      await deleteGeneratedImage(part.outputUrl);
      patchPart(nodeId, key, { outputUrl: undefined, assetId: undefined, jobId: undefined, status: 'idle', progress: undefined, error: undefined, normalized: false, geometry: undefined });
      await refreshAssets();
    } catch (deleteError) { showToast(deleteError instanceof Error ? deleteError.message : String(deleteError)); }
  }

  async function exportParts(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as CharacterPartsNodeData | undefined;
    const urls = data ? characterPartKeys.map((key) => data.parts[key].normalized ? data.parts[key].outputUrl : undefined).filter((url): url is string => Boolean(url)) : [];
    if (!urls.length) return showToast('Generate at least one aligned character layer first.');
    try {
      await exportAssetArchive({ urls, name: `${projectName}-character-parts` });
      showToast(`${urls.length} aligned layer${urls.length === 1 ? '' : 's'} exported with position metadata.`);
    } catch (exportError) { showToast(exportError instanceof Error ? exportError.message : String(exportError)); }
  }

  function downloadPartsManifest(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as CharacterPartsNodeData | undefined;
    if (!data) return;
    saveLocalBlob(new Blob([JSON.stringify(characterPartsManifest(data), null, 2)], { type: 'application/json' }), 'character-parts-positions.json');
  }

  function patchAtlas(nodeId: string, patch: Partial<SpriteAtlasNodeData>) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node));
  }

  async function buildAtlas(nodeId: string) {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type !== 'spriteAtlas') return;
    const data = node.data as SpriteAtlasNodeData;
    const input = findInput(nodeId);
    if (input.error) return patchAtlas(nodeId, { status: 'failed', error: input.error, inputUrls: [] });
    patchAtlas(nodeId, { status: 'building', inputUrls: input.sourceUrls, error: undefined, validation: undefined });
    try {
      const result = await buildSpriteAtlas(input.sourceUrls, data.settings);
      if (!result.blob || !result.previewUrl || !result.manifest || result.validation.issues.length) {
        patchAtlas(nodeId, { status: 'failed', validation: result.validation, error: 'Every source must have a real transparent background before the atlas can be saved.' });
        return;
      }
      let library = assets;
      if (input.sourceUrls.some((url) => !library.some((asset) => asset.url === url))) {
        library = await getAssets({ includeTrashed: true });
        setAssets(library);
      }
      const parentAssetIds = input.sourceUrls.map((url) => library.find((asset) => asset.url === url)?.id).filter((id): id is string => Boolean(id));
      const saved = await saveDerivedAsset(result.blob, { name: `sprite-atlas-${Date.now()}.png`, parentAssetIds, assetRole: 'sprite-atlas', manifest: result.manifest });
      patchAtlas(nodeId, { status: 'completed', previewUrl: saved.url, outputUrl: saved.url, outputAssetId: saved.id, manifest: result.manifest, validation: result.validation, error: undefined });
      await refreshAssets();
      showToast('Sprite atlas saved locally and added to Gallery.');
    } catch (atlasError) {
      patchAtlas(nodeId, { status: 'failed', error: atlasError instanceof Error ? atlasError.message : String(atlasError) });
    }
  }

  function downloadAtlasPng(nodeId: string) {
    const url = (reactFlow.getNode(nodeId)?.data as SpriteAtlasNodeData | undefined)?.outputUrl;
    if (url) downloadUrl(url);
  }

  function downloadAtlasJson(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as SpriteAtlasNodeData | undefined;
    if (!data?.manifest) return;
    saveLocalBlob(new Blob([JSON.stringify(data.manifest, null, 2)], { type: 'application/json' }), 'sprite-atlas.json');
  }

  async function deleteAtlas(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as SpriteAtlasNodeData | undefined;
    if (!data?.outputUrl || !window.confirm('Move this sprite atlas to Frameforge trash?')) return;
    try {
      await deleteGeneratedImage(data.outputUrl);
      patchAtlas(nodeId, { status: 'idle', outputUrl: undefined, outputAssetId: undefined, previewUrl: undefined, manifest: undefined, validation: undefined, error: undefined });
      await refreshAssets();
    } catch (deleteError) { showToast(deleteError instanceof Error ? deleteError.message : String(deleteError)); }
  }

  function patchRelativeAtlas(nodeId: string, patch: Partial<RelativeAtlasNodeData>) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node));
  }

  async function buildRelativeAtlasNode(nodeId: string) {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type !== 'relativeAtlas') return;
    const data = node.data as RelativeAtlasNodeData;
    const input = findInput(nodeId);
    if (input.error) return patchRelativeAtlas(nodeId, { status: 'failed', error: input.error, inputUrls: [] });
    patchRelativeAtlas(nodeId, { status: 'building', inputUrls: input.sourceUrls, error: undefined, validation: undefined });
    try {
      const result = await buildRelativeAtlas(input.sourceUrls, data.settings);
      if (!result.blob || !result.previewUrl || !result.manifest || result.validation.issues.length) {
        patchRelativeAtlas(nodeId, { status: 'failed', validation: result.validation, error: 'Every source needs a transparent background and clear padding before it can be packed.' });
        return;
      }
      let library = assets;
      if (input.sourceUrls.some((url) => !library.some((asset) => asset.url === url))) { library = await getAssets({ includeTrashed: true }); setAssets(library); }
      const parentAssetIds = input.sourceUrls.map((url) => library.find((asset) => asset.url === url)?.id).filter((assetId): assetId is string => Boolean(assetId));
      const saved = await saveDerivedAsset(result.blob, { name: `relative-atlas-${Date.now()}.png`, parentAssetIds, assetRole: 'relative-atlas', manifest: result.manifest });
      patchRelativeAtlas(nodeId, { status: 'completed', previewUrl: saved.url, outputUrl: saved.url, outputAssetId: saved.id, manifest: result.manifest, validation: result.validation, error: undefined });
      await refreshAssets();
      showToast('Relative atlas saved locally — object scale was preserved.');
    } catch (atlasError) { patchRelativeAtlas(nodeId, { status: 'failed', error: atlasError instanceof Error ? atlasError.message : String(atlasError) }); }
  }

  function downloadRelativeAtlasPng(nodeId: string) {
    const url = (reactFlow.getNode(nodeId)?.data as RelativeAtlasNodeData | undefined)?.outputUrl;
    if (url) downloadUrl(url);
  }

  function downloadRelativeAtlasJson(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as RelativeAtlasNodeData | undefined;
    if (data?.manifest) saveLocalBlob(new Blob([JSON.stringify(data.manifest, null, 2)], { type: 'application/json' }), 'relative-atlas.json');
  }

  async function deleteRelativeAtlas(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as RelativeAtlasNodeData | undefined;
    if (!data?.outputUrl || !window.confirm('Move this relative atlas to Frameforge trash?')) return;
    try { await deleteGeneratedImage(data.outputUrl); patchRelativeAtlas(nodeId, { status: 'idle', outputUrl: undefined, outputAssetId: undefined, previewUrl: undefined, manifest: undefined, validation: undefined, error: undefined }); await refreshAssets(); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  function patchMaterialMaps(nodeId: string, patch: Partial<MaterialMapsNodeData>) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node));
  }

  async function buildMaterialMapSet(nodeId: string) {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type !== 'materialMaps') return;
    const data = node.data as MaterialMapsNodeData;
    const input = findInput(nodeId);
    if (input.error) return patchMaterialMaps(nodeId, { status: 'failed', error: input.error });
    if (input.sourceUrls.length !== 1) return patchMaterialMaps(nodeId, { status: 'failed', error: 'Material Maps requires one base-color texture, not a collection.' });
    patchMaterialMaps(nodeId, { status: 'building', inputUrl: input.sourceUrl, error: undefined });
    try {
      const result = await buildMaterialMaps(input.sourceUrl, data.settings);
      let library = assets;
      if (!library.some((asset) => asset.url === input.sourceUrl)) {
        library = await getAssets({ includeTrashed: true });
        setAssets(library);
      }
      const parent = library.find((asset) => asset.url === input.sourceUrl);
      const parentAssetIds = parent ? [parent.id] : [];
      const derivedKeys = materialMapKeys.filter((key): key is Exclude<MaterialMapKey, 'baseColor'> => key !== 'baseColor');
      const savedEntries = await Promise.all(derivedKeys.map(async (key) => {
        const saved = await saveDerivedAsset(result.blobs[key], {
          name: `material-${materialMapFileName(key)}-${Date.now()}.png`,
          parentAssetIds,
          assetRole: 'material-map',
          manifest: { ...result.manifest, mapKey: key },
        });
        return [key, { key, title: materialMapTitles[key], outputUrl: saved.url, assetId: saved.id }] as const;
      }));
      const maps = {
        ...createMaterialMapOutputs(input.sourceUrl, parent?.id),
        ...Object.fromEntries(savedEntries),
      } as MaterialMapsNodeData['maps'];
      patchMaterialMaps(nodeId, { status: 'completed', inputUrl: input.sourceUrl, maps, manifest: result.manifest, error: undefined });
      await refreshAssets();
      showToast('Seven-map PBR set built, saved locally and ready to export.');
    } catch (error) {
      patchMaterialMaps(nodeId, { status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }

  function downloadMaterialMap(nodeId: string, key: MaterialMapKey) {
    const url = (reactFlow.getNode(nodeId)?.data as MaterialMapsNodeData | undefined)?.maps[key]?.outputUrl;
    if (url) downloadUrl(url);
  }

  async function deleteMaterialMap(nodeId: string, key: MaterialMapKey) {
    if (key === 'baseColor') return showToast('Base Color belongs to the connected source node.');
    const data = reactFlow.getNode(nodeId)?.data as MaterialMapsNodeData | undefined;
    const map = data?.maps[key];
    if (!data || !map?.outputUrl || !window.confirm(`Move ${map.title} to Frameforge trash?`)) return;
    try {
      await deleteGeneratedImage(map.outputUrl);
      patchMaterialMaps(nodeId, { status: 'idle', manifest: undefined, maps: { ...data.maps, [key]: { key, title: materialMapTitles[key] } } });
      await refreshAssets();
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  async function exportMaterialMapSet(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as MaterialMapsNodeData | undefined;
    const urls = data ? materialMapKeys.map((key) => data.maps[key]?.outputUrl).filter((url): url is string => Boolean(url)) : [];
    if (urls.length !== materialMapKeys.length) return showToast('Build all seven maps before exporting the material set.');
    try {
      await exportAssetArchive({ urls, name: `${projectName}-pbr-material`, manifest: data?.manifest });
      showToast('PBR material ZIP sent to Downloads.');
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  function downloadMaterialMapManifest(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as MaterialMapsNodeData | undefined;
    if (!data?.manifest) return;
    saveLocalBlob(new Blob([JSON.stringify(data.manifest, null, 2)], { type: 'application/json' }), 'pbr-material.json');
  }

  function downloadUrl(url: string) {
    const link = document.createElement('a'); link.href = generatedImageDownloadUrl(url); link.download = ''; document.body.appendChild(link); link.click(); link.remove();
  }

  function downloadTripoModel(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as Model3DNodeData | undefined;
    if (!data?.downloadUrl) return;
    const link = document.createElement('a');
    link.href = data.downloadUrl;
    link.download = data.fileName || 'tripo-model.glb';
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('GLB sent to Downloads.');
  }

  async function recoverTripoPreview(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as Model3DNodeData | undefined;
    if (!data?.watcherId || tripoRecoveryBusyRef.current.has(nodeId)) return;
    tripoRecoveryBusyRef.current.add(nodeId);
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, status: 'running', progress: 99, error: undefined } } : node));
    showToast('Checking the completed model in the open Tripo tab…');
    try {
      const result = await recoverTripoModel(data.sourceNodeId, data.watcherId);
      if (result.event) handleTripoEvent(result.event);
      else if (!result.recovered) throw new Error('The open Tripo tab does not contain a completed GLB result yet.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, status: 'failed', error: message } } : node));
      showToast(message);
    } finally {
      tripoRecoveryBusyRef.current.delete(nodeId);
    }
  }

  function downloadResult(nodeId: string) {
    const url = String(reactFlow.getNode(nodeId)?.data.outputUrl || '');
    if (url) { downloadUrl(url); showToast('PNG sent to Downloads.'); }
  }

  async function deleteResult(nodeId: string) {
    const url = String(reactFlow.getNode(nodeId)?.data.outputUrl || '');
    if (!url || !window.confirm('Move this generated PNG to Frameforge trash?')) return;
    try { await deleteGeneratedImage(url); patchGenerator(nodeId, { outputUrl: undefined, status: 'idle', progress: undefined, error: undefined }); await refreshAssets(); showToast('Result moved to data/trash.'); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  function downloadTurnaroundView(nodeId: string, viewKey: ViewKey) {
    const url = (reactFlow.getNode(nodeId)?.data as CharacterViewsNodeData | undefined)?.views?.[viewKey]?.outputUrl;
    if (url) downloadUrl(url);
  }

  async function deleteTurnaroundView(nodeId: string, viewKey: ViewKey) {
    const url = (reactFlow.getNode(nodeId)?.data as CharacterViewsNodeData | undefined)?.views?.[viewKey]?.outputUrl;
    if (!url || !window.confirm(`Move ${viewKey} view to Frameforge trash?`)) return;
    try { await deleteGeneratedImage(url); patchView(nodeId, viewKey, { outputUrl: undefined, status: 'idle', progress: undefined, error: undefined }); await refreshAssets(); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  async function handleUpload(file?: File, position?: { x: number; y: number }) {
    if (!file) return;
    try {
      const asset = await uploadImage(file);
      addAssetNode({ ...asset, kind: 'source', size: file.size, createdAt: new Date().toISOString() }, position);
      await refreshAssets(); showToast('Source image added.');
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    finally { if (uploadRef.current) uploadRef.current.value = ''; }
  }

  function addAssetNode(asset: AssetRecord, position?: { x: number; y: number }, options: { title?: string; hasInput?: boolean } = {}) {
    const id = `image-${crypto.randomUUID()}`;
    const node: StudioNode = {
      id,
      type: 'image',
      position: position || reactFlow.screenToFlowPosition({ x: window.innerWidth * 0.38, y: window.innerHeight * 0.45 }),
      data: { title: options.title || (asset.kind === 'generated' ? 'Gallery result' : 'Source image'), imageUrl: asset.url, fileName: asset.name, assetId: asset.id, hasInput: options.hasInput },
    };
    setNodes((current) => [...current, node]);
    window.setTimeout(() => reactFlow.fitView({ padding: 0.26, duration: 320 }), 30);
    if (window.innerWidth <= 850) setSidebarOpen(false);
    return id;
  }

  async function handleConnectAccount() {
    setAuthBusy(true);
    try {
      await connectCodex(); showToast('Codex sign-in opened. Complete it in the browser.');
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_500));
        const status = await getCodexStatus(); setCodex(status); if (status.connected) break;
      }
      await refreshCodex();
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    finally { setAuthBusy(false); }
  }

  function addTurnaroundTemplate() {
    const source = nodes.find((node) => node.selected && Boolean(sourceUrlFor(node)));
    if (!source) return showToast('Select an image result first, then add Character Views.');
    addCharacterViews({ x: source.position.x + 390, y: source.position.y - 80 }, source.id);
    window.setTimeout(() => reactFlow.fitView({ padding: 0.14, duration: 380 }), 40);
  }

  function addSeamlessMaterialTemplate() {
    const source = nodes.find((node) => node.selected && Boolean(sourceUrlFor(node)));
    if (!source) return showToast('Select one image or generated result first, then add the material recipe.');
    const seamlessId = addSeamlessTexture({ x: source.position.x + 390, y: source.position.y - 20 }, source.id);
    addMaterialMaps({ x: source.position.x + 800, y: source.position.y - 70 }, seamlessId, 'baseColor');
    window.setTimeout(() => reactFlow.fitView({ padding: 0.12, duration: 420 }), 50);
  }

  function createFromMenu(kind: 'generator' | 'turnaround' | 'parts' | 'multi' | 'atlas' | 'relativeAtlas' | 'seamless' | 'materialMaps') {
    if (!connectionMenu) return;
    if (kind === 'generator') addGenerator(connectionMenu.flow, connectionMenu.sourceId, connectionMenu.sourceHandle);
    else if (kind === 'turnaround') addCharacterViews(connectionMenu.flow, connectionMenu.sourceId, connectionMenu.sourceHandle);
    else if (kind === 'parts') addCharacterParts(connectionMenu.flow, connectionMenu.sourceId, connectionMenu.sourceHandle);
    else if (kind === 'multi') addMultiGenerate(connectionMenu.flow, connectionMenu.sourceId, connectionMenu.sourceHandle);
    else if (kind === 'atlas') addSpriteAtlas(connectionMenu.flow, connectionMenu.sourceId, connectionMenu.sourceHandle);
    else if (kind === 'relativeAtlas') addRelativeAtlas(connectionMenu.flow, connectionMenu.sourceId, connectionMenu.sourceHandle);
    else if (kind === 'seamless') addSeamlessTexture(connectionMenu.flow, connectionMenu.sourceId, connectionMenu.sourceHandle);
    else addMaterialMaps(connectionMenu.flow, connectionMenu.sourceId, connectionMenu.sourceHandle);
    setConnectionMenu(null);
  }

  function duplicateSelection() {
    const selected = nodes.filter((node) => node.selected);
    if (!selected.length) return;
    const copies = selected.map((node) => ({ ...structuredClone(node), id: `${node.type}-${crypto.randomUUID()}`, selected: false, position: { x: node.position.x + 36, y: node.position.y + 36 } }));
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...copies]);
    showToast(`${copies.length} node${copies.length === 1 ? '' : 's'} duplicated.`);
  }

  function clearCanvas() {
    if (!nodes.length || window.confirm('Clear all nodes and links? Local images will stay in Gallery and this can be undone with Ctrl+Z.')) { setNodes([]); setEdges([]); }
  }

  async function trashLibraryAsset(asset: AssetRecord) {
    if (!window.confirm(`Move “${asset.name}” to Frameforge trash? Canvas references may stop working.`)) return;
    try { await trashAsset(asset.url); await refreshAssets(); setCompare(([a, b]) => [a?.id === asset.id ? null : a, b?.id === asset.id ? null : b]); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  async function restoreLibraryAsset(asset: AssetRecord) {
    try {
      await restoreAsset(asset.id);
      await refreshAssets();
      showToast(`${asset.name} restored to Gallery.`);
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  async function purgeLibraryAsset(asset: AssetRecord) {
    try {
      await purgeAsset(asset.id);
      await refreshAssets();
      showToast(`${asset.name} permanently deleted.`);
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  async function exportAssetsAsZip(selectedAssets: AssetRecord[], name = `${projectName}-assets`) {
    try {
      await exportAssetArchive({ assetIds: selectedAssets.map((asset) => asset.id), name });
      showToast(`${selectedAssets.length} asset${selectedAssets.length === 1 ? '' : 's'} exported with manifest.`);
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  function openSpriteSheet(selectedAssets: AssetRecord[]) {
    if (!selectedAssets.length) return showToast('Select at least one active asset.');
    setSpriteAssets(selectedAssets);
    setSpriteOpen(true);
    setGalleryOpen(false);
    setJobsOpen(false);
  }

  async function exportTurnaroundViews(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as CharacterViewsNodeData | undefined;
    const urls = data ? viewKeys.map((key) => data.views[key].outputUrl).filter((url): url is string => Boolean(url)) : [];
    if (!urls.length) return showToast('Generate at least one character view first.');
    try {
      await exportAssetArchive({ urls, name: `${projectName}-character-views` });
      showToast(`${urls.length} character view${urls.length === 1 ? '' : 's'} exported with manifest.`);
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  async function buildTurnaroundSpriteSheet(nodeId: string) {
    const data = reactFlow.getNode(nodeId)?.data as CharacterViewsNodeData | undefined;
    const urls = data ? viewKeys.map((key) => data.views[key].outputUrl).filter((url): url is string => Boolean(url)) : [];
    if (!urls.length) return showToast('Generate at least one character view first.');
    let library = assets;
    if (urls.some((url) => !library.some((asset) => asset.url === url && !asset.deletedAt))) {
      try { library = await getAssets({ includeTrashed: true }); setAssets(library); }
      catch (error) { return showToast(error instanceof Error ? error.message : String(error)); }
    }
    const ordered = urls.map((url) => library.find((asset) => asset.url === url && !asset.deletedAt)).filter((asset): asset is AssetRecord => Boolean(asset));
    openSpriteSheet(ordered);
  }

  function openCompare() {
    if (!compare[0] || !compare[1]) return;
    setPreview({ primary: { url: compare[1].url, title: `${compare[0].name} / ${compare[1].name}` }, secondary: { url: compare[0].url, title: compare[0].name } });
  }

  async function retryQueueJob(job: GenerationJob) {
    try {
      const retried = await retryJob(job.id);
      const jobId = retried.id;
      setJobs((current) => current.map((item) => item.id === retried.id ? retried : item));
      const generator = nodes.find((node) => node.type === 'generator' && node.data.jobId === job.id);
      if (generator) { patchGenerator(generator.id, { status: 'queued', progress: 'Retry queued' }); void pollGenerator(generator.id, jobId); }
      const turnaround = nodes.find((node) => node.type === 'characterViews' && viewKeys.some((key) => (node.data as CharacterViewsNodeData).views[key].jobId === job.id));
      if (turnaround) {
        const key = viewKeys.find((viewKey) => (turnaround.data as CharacterViewsNodeData).views[viewKey].jobId === job.id)!;
        patchView(turnaround.id, key, { status: 'queued', progress: 'Retry queued' }); void pollTurnaroundView(turnaround.id, key, jobId);
      }
      const multi = nodes.find((node) => node.type === 'multiGenerate' && (node.data as MultiGenerateNodeData).variants.some((variant) => variant.jobId === job.id));
      if (multi) {
        const key = (multi.data as MultiGenerateNodeData).variants.find((variant) => variant.jobId === job.id)!.key;
        patchVariant(multi.id, key, { status: 'queued', progress: 'Retry queued' }); void pollMultiVariant(multi.id, key, jobId);
      }
      const partsNode = nodes.find((node) => node.type === 'characterParts' && characterPartKeys.some((key) => (node.data as CharacterPartsNodeData).parts[key].jobId === job.id));
      if (partsNode) {
        const key = characterPartKeys.find((partKey) => (partsNode.data as CharacterPartsNodeData).parts[partKey].jobId === job.id)!;
        patchPart(partsNode.id, key, { status: 'queued', progress: 'Retry queued', normalized: false, geometry: undefined });
        void pollPart(partsNode.id, key, jobId);
      }
      await refreshJobs();
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
  }

  async function importGraph(file?: File) {
    if (!file) return;
    try {
      const project = await importProject(file);
      setNodes(project.nodes as Node[]); setEdges(project.edges); setProjectName(project.name); reactFlow.setViewport(project.viewport);
      history.reset({ nodes: project.nodes as Node[], edges: project.edges }); showToast('Project imported. Autosave will update the local workspace.');
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    finally { if (importRef.current) importRef.current.value = ''; }
  }

  function exportCurrentProject() {
    exportProject({ ...projectPayload(projectName, revisionRef.current, nodes, edges, reactFlow.getViewport()), updatedAt: new Date().toISOString() });
    showToast('Portable project JSON exported.');
  }

  const activeJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length;
  const codexProvider = providers.find((provider) => provider.id === 'codex');
  const codexWorkers = Number((codexProvider?.capabilities as { maxConcurrency?: number } | undefined)?.maxConcurrency || 1);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <button className="ghost-icon mobile-only" aria-label="Toggle node library" onClick={() => setSidebarOpen((value) => !value)}><Menu size={18} /></button>
          <div className="brand-mark"><span /><span /><span /></div>
          <div><strong>FRAMEFORGE</strong><small>LOCAL IMAGE LAB / MVP</small></div>
        </div>
        <label className="project-crumb"><FolderOpen size={14} /><input aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} /><span className={`save-indicator ${saveState}`}>{saveState}</span></label>
        <div className="top-actions">
          <button className="top-icon-action" disabled={!history.canUndo} onClick={history.undo} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={14} /></button>
          <button className="top-icon-action" disabled={!history.canRedo} onClick={history.redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 size={14} /></button>
          <button className="top-icon-action has-count" onClick={() => { setJobsOpen((value) => !value); setGalleryOpen(false); setSpriteOpen(false); }} aria-label="Open generation queue"><ListTodo size={15} />{activeJobs > 0 && <b>{activeJobs}</b>}</button>
          <button className="top-icon-action" onClick={() => { setGalleryOpen((value) => !value); setJobsOpen(false); setSpriteOpen(false); void refreshAssets(); }} aria-label="Open gallery"><GalleryHorizontalEnd size={15} /></button>
          <div className="provider-switcher">
            <button className={`provider-chip ${codex.connected ? 'online' : ''}`} onClick={() => setProviderOpen((value) => !value)} aria-expanded={providerOpen}>
              <CircleDot size={12} /><span>Codex</span><small>{codex.connected ? 'Ready' : 'Offline'}</small><ChevronDown size={12} />
            </button>
            {providerOpen && <div className="provider-menu">
              <span className="drawer-kicker">Default image provider</span>
              <button className="active"><Sparkles size={15} /><span><strong>Codex ImageGen</strong><small>{codexProvider?.reason || `${codex.label} · ${codexWorkers} workers`}</small></span><Check size={14} /></button>
              <button disabled><CloudOff size={15} /><span><strong>Gemini Nano Banana</strong><small>No supported OAuth image interface</small></span></button>
            </div>}
          </div>
          <button className={`connect-button ${codex.connected ? 'connected' : ''}`} aria-label={codex.connected ? 'Codex connected' : 'Connect ChatGPT'} onClick={codex.connected ? refreshCodex : handleConnectAccount} disabled={authBusy}>
            {authBusy ? <LoaderCircle className="spin" size={15} /> : codex.connected ? <Check size={15} /> : <Link2 size={15} />}
            <span>{codex.connected ? 'Connected' : 'Connect ChatGPT'}</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-hidden={!sidebarOpen && window.innerWidth <= 850}>
          <div className="side-section-heading"><span>Node library</span><Command size={13} /></div>
          <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" hidden onChange={(event) => void handleUpload(event.target.files?.[0])} />
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importGraph(event.target.files?.[0])} />
          <button className="library-card source-card" onClick={() => uploadRef.current?.click()}><span className="library-icon"><Upload size={18} /></span><span><strong>Upload image</strong><small>PNG, JPG, WEBP · 20 MB</small></span><Plus size={14} /></button>
          <button className="library-card" onClick={() => addGenerator()}><span className="library-icon acid"><WandSparkles size={18} /></span><span><strong>Generate image</strong><small>Prompt + image input</small></span><Plus size={14} /></button>
          <button className="library-card" onClick={() => addMultiGenerate()}><span className="library-icon acid"><Images size={18} /></span><span><strong>Multi Generate</strong><small>1 prompt · 3 variants</small></span><Plus size={14} /></button>
          <button className="library-card" onClick={() => addCharacterViews()}><span className="library-icon acid"><Grid2X2 size={18} /></span><span><strong>Character views</strong><small>4 views · 5 outputs</small></span><Plus size={14} /></button>
          <button className="library-card atlas-card" onClick={() => addSpriteAtlas()}><span className="library-icon orange"><Table2 size={18} /></span><span><strong>Sprite Atlas</strong><small>Transparent · slicing ready</small></span><Plus size={14} /></button>
          <button className="library-card relative-atlas-card" onClick={() => addRelativeAtlas()}><span className="library-icon cyan"><Table2 size={18} /></span><span><strong>Relative Atlas</strong><small>Transparent · preserves scale</small></span><Plus size={14} /></button>
          <button className="library-card seamless-card" onClick={() => addSeamlessTexture()}><span className="library-icon teal"><RefreshCw size={18} /></span><span><strong>Seamless Texture</strong><small>AI base color · tile-safe edges</small></span><Plus size={14} /></button>
          <button className="library-card material-card" onClick={() => addMaterialMaps()}><span className="library-icon blue"><Layers3 size={18} /></span><span><strong>PBR Material Maps</strong><small>Normal · height · roughness · AO</small></span><Plus size={14} /></button>
          <div className="side-section-heading second"><span>Quick recipe</span><Layers3 size={13} /></div>
          <button className="recipe-card" onClick={addTurnaroundTemplate}><div className="recipe-visual"><span>F</span><span>L</span><span>B</span><span>R</span></div><strong>Attach 4-view set</strong><small>Select an existing image first</small></button>
          <button className="recipe-card material-recipe" onClick={addSeamlessMaterialTemplate}><div className="recipe-visual material"><span>BC</span><span>N</span><span>H</span><span>R</span></div><strong>Build seamless PBR material</strong><small>Select an image · creates 2 connected nodes</small></button>
          <div className="shortcut-list"><span><kbd>Ctrl Z</kbd> Undo</span><span><kbd>Ctrl D</kbd> Duplicate</span><span><kbd>F</kbd> Fit selection</span><span><kbd>Ctrl Enter</kbd> Run prompt</span></div>
          <div className="sidebar-spacer" />
          <div className={`connection-panel ${codex.connected ? 'online' : ''}`}>{codex.connected ? <Sparkles size={16} /> : <CloudOff size={16} />}<div><strong>{codex.connected ? 'ImageGen ready' : 'Codex offline'}</strong><small>{codex.label}</small></div></div>
        </aside>

        <section
          className="canvas-shell"
          onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
          onDrop={(event) => { if (!event.dataTransfer.files[0]) return; event.preventDefault(); void handleUpload(event.dataTransfer.files[0], reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}
        >
          {nodes.length === 0 && projectReady && <div className="empty-state"><div className="empty-orbit"><ImagePlus size={28} /><i /><i /><i /></div><p className="eyebrow">Canvas is ready</p><h1>Start with a frame.<br />Build a world from it.</h1><p>Drop in a character or concept image, then branch it into variations, character views or a slicing-ready atlas.</p><div className="empty-actions"><button className="hero-action" onClick={() => uploadRef.current?.click()}><Upload size={16} /> Upload source</button><button className="text-action" onClick={() => addMultiGenerate()}><Images size={15} /> Add Multi Generate</button></div></div>}
          {!projectReady && <div className="workspace-loading"><LoaderCircle className="spin" size={24} /><span>Restoring local project</span></div>}
          <ReactFlow
            nodes={displayedNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onPaneClick={() => setConnectionMenu(null)}
            onPaneContextMenu={(event) => { event.preventDefault(); openNodeMenu(event.clientX, event.clientY); }}
            fitView
            minZoom={0.15}
            maxZoom={2.2}
            multiSelectionKeyCode="Shift"
            selectionOnDrag
            defaultEdgeOptions={edgeDefaults}
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(229,237,218,.12)" />
            <Controls showInteractive={false} position="bottom-right" />
            <MiniMap position="bottom-left" pannable zoomable nodeColor={(node) => node.type === 'image' ? '#d8ff65' : node.type === 'model3d' ? '#a78bfa' : node.type === 'materialMaps' ? '#69aef8' : node.type === 'seamlessTexture' ? '#53d7c3' : node.type === 'characterParts' || node.type === 'relativeAtlas' ? '#58d3e0' : node.type === 'characterViews' || node.type === 'spriteAtlas' ? '#ffb45f' : node.type === 'multiGenerate' ? '#9ef0d0' : '#8fa5a0'} maskColor="rgba(9,11,9,.78)" />
            <Panel position="top-left" className="canvas-toolbar">
              <button aria-label="Add image" title="Add image" onClick={() => uploadRef.current?.click()}><ImagePlus size={15} /></button>
              <button aria-label="Add generator" title="Add generator" onClick={() => addGenerator()}><WandSparkles size={15} /></button>
              <button aria-label="Add Multi Generate" title="Add Multi Generate" onClick={() => addMultiGenerate()}><Images size={15} /></button>
              <button aria-label="Add character views" title="Add character views" onClick={() => addCharacterViews()}><Grid2X2 size={15} /></button><span />
              <button aria-label="Add Character Parts" title="Add Character Parts" onClick={() => addCharacterParts()}><Scissors size={15} /></button>
              <button aria-label="Add Sprite Atlas" title="Add Sprite Atlas" onClick={() => addSpriteAtlas()}><Table2 size={15} /></button><span />
              <button aria-label="Add Relative Atlas" title="Add Relative Atlas" onClick={() => addRelativeAtlas()}><Table2 size={15} /></button><span />
              <button aria-label="Add Seamless Texture" title="Add Seamless Texture" onClick={() => addSeamlessTexture()}><RefreshCw size={15} /></button>
              <button aria-label="Add PBR Material Maps" title="Add PBR Material Maps" onClick={() => addMaterialMaps()}><Layers3 size={15} /></button><span />
              <button aria-label="Save project" title="Save project" onClick={() => persistProject(true)}><Save size={15} /></button>
              <button aria-label="Import project" title="Import project" onClick={() => importRef.current?.click()}><Import size={15} /></button>
              <button aria-label="Export project" title="Export project" onClick={exportCurrentProject}><Download size={15} /></button><span />
              <button aria-label="Undo" title="Undo" disabled={!history.canUndo} onClick={history.undo}><Undo2 size={15} /></button>
              <button aria-label="Redo" title="Redo" disabled={!history.canRedo} onClick={history.redo}><Redo2 size={15} /></button>
              <button aria-label="Clear canvas" title="Clear canvas" onClick={clearCanvas}><X size={15} /></button>
            </Panel>
            <Panel position="top-right" className="canvas-stat"><Box size={13} /> {nodes.length} nodes · {edges.length} links · <HardDrive size={12} /> {saveState}</Panel>
          </ReactFlow>

          {connectionMenu && <div className="connection-menu" style={{ left: connectionMenu.screen.x, top: connectionMenu.screen.y }} role="menu" aria-label="Create connected node">
            <div className="connection-menu-label">{connectionMenu.sourceId ? 'Create & connect' : 'Create node'}</div>
            <button role="menuitem" onClick={() => createFromMenu('generator')}><span className="connection-menu-icon"><WandSparkles size={15} /></span><span><strong>Generate image</strong><small>One prompt, one output</small></span></button>
            <button role="menuitem" onClick={() => createFromMenu('multi')}><span className="connection-menu-icon"><Images size={15} /></span><span><strong>Multi Generate</strong><small>One prompt, three variants</small></span></button>
            <button role="menuitem" onClick={() => createFromMenu('turnaround')}><span className="connection-menu-icon"><Grid2X2 size={15} /></span><span><strong>Character views</strong><small>One input, four outputs</small></span></button>
            <button role="menuitem" onClick={() => createFromMenu('parts')}><span className="connection-menu-icon parts"><Scissors size={15} /></span><span><strong>Character Parts</strong><small>Aligned clothing &amp; body layers</small></span></button>
            <button role="menuitem" onClick={() => createFromMenu('atlas')}><span className="connection-menu-icon atlas"><Table2 size={15} /></span><span><strong>Sprite Atlas</strong><small>Pack a collection for slicing</small></span></button>
            <button role="menuitem" onClick={() => createFromMenu('relativeAtlas')}><span className="connection-menu-icon relative-atlas"><Table2 size={15} /></span><span><strong>Relative Atlas</strong><small>Pack objects at one shared scale</small></span></button>
            <button role="menuitem" onClick={() => createFromMenu('seamless')}><span className="connection-menu-icon seamless"><RefreshCw size={15} /></span><span><strong>Seamless Texture</strong><small>Generate a repeat-ready base color</small></span></button>
            <button role="menuitem" onClick={() => createFromMenu('materialMaps')}><span className="connection-menu-icon material"><Layers3 size={15} /></span><span><strong>PBR Material Maps</strong><small>Derive six matching texture maps</small></span></button>
            <div className="connection-menu-hint">ESC to cancel</div>
          </div>}
        </section>
      </div>

      <GalleryPanel open={galleryOpen} assets={assets} loading={assetsLoading} compare={compare} onClose={() => setGalleryOpen(false)} onRefresh={() => void refreshAssets()} onAdd={addAssetNode} onOpen={(asset) => openPreview(asset.url, asset.name)} onCompare={(slot, asset) => setCompare((current) => slot === 0 ? [asset, current[1]] : [current[0], asset])} onTrash={(asset) => void trashLibraryAsset(asset)} onRestore={(asset) => void restoreLibraryAsset(asset)} onPurge={(asset) => void purgeLibraryAsset(asset)} onExport={(selected) => void exportAssetsAsZip(selected)} onOpenSpriteSheet={openSpriteSheet} onOpenCompare={openCompare} />
      <JobsDrawer open={jobsOpen} jobs={jobs} onClose={() => setJobsOpen(false)} onRefresh={() => void refreshJobs()} onCancel={(job) => void cancelJob(job.id).then(refreshJobs)} onRetry={(job) => void retryQueueJob(job)} />
      <SpriteSheetBuilder open={spriteOpen} assets={spriteAssets} onClose={() => setSpriteOpen(false)} onExportSources={(selected) => void exportAssetsAsZip(selected, `${projectName}-sprite-sources`)} />
      <PreviewModal preview={preview} onClose={() => setPreview(null)} />
      {toast && <div className="toast" role="status" aria-live="polite"><Sparkles size={14} /> {toast}</div>}
    </main>
  );
}

function projectHash(name: string, nodes: Node[], edges: Edge[]) {
  return JSON.stringify({
    name,
    nodes: nodes.map((node) => ({ id: node.id, type: node.type, position: node.position, data: node.data })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle })),
  }, (_key, value) => typeof value === 'function' ? undefined : value);
}

function createVariantSlots(count: number, existing: MultiGenerateNodeData['variants'] = []): MultiGenerateNodeData['variants'] {
  return Array.from({ length: count }, (_, index) => existing[index] || {
    key: `variant-${index + 1}`,
    title: `Variant ${index + 1}`,
    index,
    status: 'idle',
  });
}

function multiVariantPrompt(data: MultiGenerateNodeData, index: number) {
  return `${data.prompt.trim()}\n\nVariation slot ${index + 1} of ${data.variantCount}: create a visibly distinct option while respecting the shared instruction. Do not add labels, borders, contact sheets, or multiple alternatives inside one image.`;
}

function createMaterialMapOutputs(baseColorUrl?: string, baseColorAssetId?: string): MaterialMapsNodeData['maps'] {
  return Object.fromEntries(materialMapKeys.map((key) => [key, {
    key,
    title: materialMapTitles[key],
    outputUrl: key === 'baseColor' ? baseColorUrl : undefined,
    assetId: key === 'baseColor' ? baseColorAssetId : undefined,
  }])) as MaterialMapsNodeData['maps'];
}

function materialMapFileName(key: MaterialMapKey) {
  return key === 'baseColor' ? 'base-color' : key === 'ambientOcclusion' ? 'ao' : key;
}

function sameStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
