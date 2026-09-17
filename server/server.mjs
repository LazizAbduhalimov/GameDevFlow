import express from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexWorkerPool } from './codex-worker-pool.mjs';
import { codexSpawnEnv, resolveCodexCommand } from './codex-command.mjs';
import { AssetStore } from './asset-store.mjs';
import { resolveExportAssets, streamAssetArchive } from './archive-export.mjs';
import { batchRequestErrorMessage, MAX_REFERENCE_IMAGES, normalizeBatchRequest } from './batch-normalization.mjs';
import { parseDerivedAssetMetadata } from './derived-asset.mjs';
import { detectRasterImage } from './image-validation.mjs';
import { JobQueue } from './job-queue.mjs';
import { JobStore } from './job-store.mjs';
import { safeDownloadName, slugify } from './path-safety.mjs';
import { ProjectStore } from './project-store.mjs';
import { fallbackGroup, groupingSchema, MAX_SMART_SEPARATION_ITEMS, normalizeDetectedItems, normalizeGroups, uiSheetDetectionSchema } from './smart-separation.mjs';
import { TripoBrowserBridge } from './tripo-browser-bridge.mjs';

const app = express();
const port = Number(process.env.FRAMEFORGE_PORT || 4317);
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(serverDir, '..');
const dataDir = path.join(rootDir, 'data');
const assetsDir = path.join(dataDir, 'assets');
const generatedDir = path.join(dataDir, 'generated');
const metadataDir = path.join(dataDir, 'metadata');
const trashDir = path.join(dataDir, 'trash');
const jobsDir = path.join(dataDir, 'jobs');
const projectsDir = path.join(dataDir, 'projects');
const modelsDir = path.join(dataDir, 'models');
const codexCommand = resolveCodexCommand();
const codexWorkerCount = Math.max(1, Math.min(4, Number(process.env.FRAMEFORGE_CODEX_WORKERS || 4)));
const codexWorkerPool = new CodexWorkerPool({
  size: codexWorkerCount,
  onDiagnostic: (message, index) => { if (message) console.log(`[codex worker ${index + 1}] ${message}`); },
});
const assetStore = new AssetStore({ dataDir, assetsDir, generatedDir, metadataDir, trashDir });
const jobStore = new JobStore(jobsDir);
const projectStore = new ProjectStore(projectsDir);
const tripoEventClients = new Set();
const smartSeparationRuns = new Map();
const tripoBrowserBridge = new TripoBrowserBridge({
  profileDir: path.join(dataDir, 'tripo-browser-profile'),
  modelsDir,
  onEvent: publishTripoEvent,
});

function setSmartSeparationProgress(requestId, patch) {
  const previous = smartSeparationRuns.get(requestId) || {};
  smartSeparationRuns.set(requestId, { ...previous, ...patch, requestId, updatedAt: new Date().toISOString() });
}

function finishSmartSeparationProgress(requestId, stage, message) {
  setSmartSeparationProgress(requestId, { stage, message });
  const cleanup = setTimeout(() => smartSeparationRuns.delete(requestId), 10 * 60 * 1000);
  cleanup.unref?.();
}

await Promise.all([mkdir(assetsDir, { recursive: true }), mkdir(generatedDir, { recursive: true }), mkdir(modelsDir, { recursive: true }), assetStore.initialize(), jobStore.initialize()]);
const jobQueue = new JobQueue({ store: jobStore, worker: executeImageJob, concurrency: codexWorkerCount });
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'frameforge-local', queue: jobQueue.snapshot(), workers: codexWorkerPool.snapshot() }));

app.get('/api/providers', async (_request, response) => {
  response.json([
    await getCodexProviderStatus(),
    { id: 'gemini', label: 'Gemini / Nano Banana', available: false, reason: 'Gemini CLI OAuth is not a supported image-provider integration. Configure an official Gemini API or Vertex AI provider before enabling it.', capabilities: { imageGeneration: false, imageEditing: false, cancellation: 'none', maxConcurrency: 0 } },
  ]);
});

app.get('/api/codex/status', async (_request, response) => {
  const status = await getCodexProviderStatus();
  response.json({ installed: status.installed, connected: status.connected, label: status.statusLabel });
});

app.post('/api/codex/connect', (_request, response) => {
  let settled = false;
  let timeout;
  const finish = (status, body) => {
    if (settled || response.headersSent) return;
    settled = true;
    clearTimeout(timeout);
    response.status(status).json(body);
  };
  try {
    const child = spawn(codexCommand, ['login'], { cwd: rootDir, detached: true, shell: false, stdio: 'ignore', windowsHide: true, env: codexSpawnEnv() });
    timeout = setTimeout(() => finish(500, { message: 'Could not open the Codex sign-in flow.' }), 8_000);
    child.once('error', (error) => {
      console.error('Could not open Codex sign-in:', error);
      finish(500, { message: error.code === 'ENOENT' ? 'Codex CLI was not found. Open the ChatGPT desktop app once, then retry Connect ChatGPT.' : 'Could not open the Codex sign-in flow.' });
    });
    child.once('spawn', () => {
      child.unref();
      finish(202, { ok: true, message: 'The Codex sign-in flow was opened.' });
    });
  } catch { finish(500, { message: 'Could not open the Codex sign-in flow.' }); }
});

app.post('/api/prompts/enhance', async (request, response) => {
  const prompt = typeof request.body?.prompt === 'string' ? request.body.prompt.trim().slice(0, 8_000) : '';
  const allowedContexts = new Set(['image-generation', 'multi-variation', 'character-consistency']);
  const context = allowedContexts.has(request.body?.context) ? request.body.context : 'image-generation';
  if (!prompt) return response.status(400).json({ message: 'Write a draft prompt before enhancing it.' });
  try {
    const enhancedPrompt = await codexWorkerPool.run((worker) => worker.enhancePrompt({ cwd: rootDir, prompt, context }));
    response.json({ prompt: enhancedPrompt });
  } catch (error) {
    console.error('Prompt enhancement failed:', error);
    response.status(502).json({ message: error instanceof Error ? error.message : 'Codex could not enhance the prompt.' });
  }
});

app.get('/api/smart-separation/progress/:requestId', (request, response) => {
  const progress = smartSeparationRuns.get(request.params.requestId);
  if (!progress) return response.status(404).json({ message: 'Smart Separation progress is not available.' });
  response.json(progress);
});

app.post('/api/smart-separation/analyze', async (request, response) => {
  const requestedId = typeof request.body?.requestId === 'string' ? request.body.requestId : '';
  const requestId = /^[a-zA-Z0-9-]{1,100}$/.test(requestedId) ? requestedId : randomUUID();
  const projectId = typeof request.body?.projectId === 'string' ? request.body.projectId : 'default';
  const sourceUrls = Array.isArray(request.body?.sourceUrls)
    ? [...new Set(request.body.sourceUrls.filter((url) => typeof url === 'string' && url))]
    : [];
  const userHint = typeof request.body?.userHint === 'string' ? request.body.userHint.trim().slice(0, 4_000) : '';
  if (!sourceUrls.length || sourceUrls.length > MAX_REFERENCE_IMAGES) {
    return response.status(400).json({ message: `Smart Separation requires 1 to ${MAX_REFERENCE_IMAGES} local source images.` });
  }

  setSmartSeparationProgress(requestId, {
    requestId,
    stage: 'queued',
    completedSources: 0,
    totalSources: sourceUrls.length,
    message: sourceUrls.length === 1 ? 'Preparing source image…' : `Preparing ${sourceUrls.length} source images…`,
    startedAt: new Date().toISOString(),
  });

  try {
    await projectStore.get(projectId);
    const sources = [];
    for (let sourceIndex = 0; sourceIndex < sourceUrls.length; sourceIndex += 1) {
      const sourceUrl = sourceUrls[sourceIndex];
      const resolved = await assetStore.resolveDataUrl(sourceUrl);
      const projectIds = resolved?.asset?.projectIds || [resolved?.asset?.projectId].filter(Boolean);
      if (!resolved?.asset || !resolved.path || !existsSync(resolved.path) || !projectIds.includes(projectId)) {
        finishSmartSeparationProgress(requestId, 'failed', 'A source image is unavailable in the active project.');
        return response.status(400).json({ message: 'Every Smart Separation source must belong to the active local project.' });
      }
      sources.push({ sourceIndex, sourceUrl, sourceAssetId: resolved.asset.id, path: resolved.path, name: resolved.asset.name });
    }

    setSmartSeparationProgress(requestId, { stage: 'detecting', message: `Detecting elements in 0 of ${sources.length} sources…` });
    let completedSources = 0;
    const detections = await Promise.all(sources.map((source) => codexWorkerPool.run((worker) => worker.analyzeUiSheet({
      cwd: rootDir,
      imagePath: source.path,
      sourceIndex: source.sourceIndex,
      userHint,
      outputSchema: uiSheetDetectionSchema,
    })).then((payload) => {
      completedSources += 1;
      setSmartSeparationProgress(requestId, {
        stage: 'detecting',
        completedSources,
        message: `Detected elements in ${completedSources} of ${sources.length} sources.`,
      });
      return payload;
    })));
    const items = [];
    detections.forEach((payload, sourceIndex) => {
      items.push(...normalizeDetectedItems(payload, { ...sources[sourceIndex], itemOffset: items.length }));
    });
    if (!items.length) {
      finishSmartSeparationProgress(requestId, 'failed', 'No reusable elements were detected.');
      return response.status(422).json({ message: 'No reusable UI elements were detected. Add guidance or choose a clearer source image.' });
    }
    if (items.length > MAX_SMART_SEPARATION_ITEMS) items.length = MAX_SMART_SEPARATION_ITEMS;

    let groups;
    const warnings = [];
    setSmartSeparationProgress(requestId, { stage: 'grouping', completedSources: sources.length, message: `Organizing ${items.length} detected elements into semantic groups…` });
    try {
      const grouped = await codexWorkerPool.run((worker) => worker.groupUiItems({ cwd: rootDir, items, userHint, outputSchema: groupingSchema(items.map((item) => item.id)) }));
      groups = normalizeGroups(grouped, items);
    } catch (error) {
      console.warn('Smart Separation grouping fell back to Unsorted:', error instanceof Error ? error.message : error);
      groups = fallbackGroup(items);
      warnings.push('Automatic grouping was unavailable. All detected elements were placed in Unsorted for manual review.');
    }

    finishSmartSeparationProgress(requestId, 'completed', `${items.length} elements organized into ${groups.length} groups.`);
    response.json({
      analysisId: requestId,
      sources: sources.map(({ sourceIndex, sourceUrl, sourceAssetId, name }) => ({ sourceIndex, sourceUrl, sourceAssetId, name })),
      items,
      groups,
      warnings,
    });
  } catch (error) {
    console.error('Smart Separation analysis failed:', error);
    const message = error instanceof Error ? error.message : 'Smart Separation analysis failed.';
    finishSmartSeparationProgress(requestId, 'failed', message);
    response.status(/timed out/i.test(message) ? 504 : 502).json({ message });
  }
});

app.get('/api/projects', async (_request, response, next) => {
  try { response.json(await projectStore.list()); } catch (error) { next(error); }
});
app.post('/api/projects', async (request, response, next) => {
  try { response.status(201).json(await projectStore.create({ name: request.body?.name })); } catch (error) { next(error); }
});
app.get('/api/projects/:projectId', async (request, response, next) => {
  try { response.json(await projectStore.get(request.params.projectId)); }
  catch (error) {
    if (error?.code === 'INVALID_PROJECT_ID') return response.status(400).json({ message: error.message });
    if (error?.code === 'PROJECT_NOT_FOUND') return response.status(404).json({ message: error.message });
    next(error);
  }
});
app.put('/api/projects/:projectId', async (request, response, next) => {
  try { response.json(await projectStore.save(request.params.projectId, request.body)); }
  catch (error) {
    if (error?.code === 'REVISION_CONFLICT') return response.status(409).json({ message: error.message, project: error.current });
    if (error?.code === 'INVALID_PROJECT_ID') return response.status(400).json({ message: error.message });
    if (error?.code === 'PROJECT_NOT_FOUND') return response.status(404).json({ message: error.message });
    next(error);
  }
});
app.post('/api/projects/:projectId/duplicate', async (request, response, next) => {
  try { response.status(201).json(await projectStore.duplicate(request.params.projectId, request.body?.name)); }
  catch (error) {
    if (error?.code === 'INVALID_PROJECT_ID') return response.status(400).json({ message: error.message });
    if (error?.code === 'PROJECT_NOT_FOUND') return response.status(404).json({ message: error.message });
    next(error);
  }
});
app.delete('/api/projects/:projectId', async (request, response, next) => {
  try { response.json(await projectStore.delete(request.params.projectId)); }
  catch (error) {
    if (error?.code === 'CANNOT_DELETE_DEFAULT_PROJECT' || error?.code === 'INVALID_PROJECT_ID') return response.status(400).json({ message: error.message });
    if (error?.code === 'PROJECT_NOT_FOUND') return response.status(404).json({ message: error.message });
    next(error);
  }
});
app.get('/api/projects/:projectId/export/manifest', async (request, response, next) => {
  try {
    const project = await projectStore.get(request.params.projectId);
    response.setHeader('Content-Disposition', `attachment; filename="frameforge-${slugify(project.name, 'project')}-manifest.json"`);
    response.json({
      exportedAt: new Date().toISOString(),
      project,
      assets: assetStore.list({ projectId: request.params.projectId, includeTrashed: true }),
      jobs: jobStore.list(request.params.projectId),
    });
  } catch (error) {
    if (error?.code === 'PROJECT_NOT_FOUND') return response.status(404).json({ message: error.message });
    next(error);
  }
});

// Legacy backward-compatibility routes for the default project
app.get('/api/project', async (_request, response, next) => { try { response.json(await projectStore.getDefault()); } catch (error) { next(error); } });
app.put('/api/project', async (request, response, next) => {
  try { response.json(await projectStore.saveDefault(request.body)); }
  catch (error) {
    if (error?.code === 'REVISION_CONFLICT') return response.status(409).json({ message: error.message, project: error.current });
    next(error);
  }
});

app.get('/api/assets', (request, response) => response.json(assetStore.list({
  projectId: request.query.projectId ? String(request.query.projectId) : undefined,
  allProjects: request.query.allProjects === 'true',
  includeTrashed: request.query.includeTrashed === 'true',
  onlyTrashed: request.query.onlyTrashed === 'true',
})));
app.post('/api/assets', upload.single('image'), async (request, response, next) => {
  try {
    if (!request.file?.buffer) return response.status(400).json({ message: 'Choose a raster image file.' });
    const image = detectRasterImage(request.file.buffer);
    if (!image) return response.status(415).json({ message: 'Only PNG, JPEG, WEBP, GIF, and BMP raster files are accepted. SVG is not supported.' });
    const projectId = typeof request.body?.projectId === 'string' ? request.body.projectId : 'default';
    await projectStore.get(projectId);
    response.status(201).json(await assetStore.createUpload({ buffer: request.file.buffer, name: request.file.originalname, image, projectId }));
  } catch (error) { next(error); }
});
app.post('/api/assets/derived', upload.single('image'), async (request, response, next) => {
  try {
    if (!request.file?.buffer) return response.status(400).json({ message: 'Choose a raster image file.' });
    if (!detectRasterImage(request.file.buffer)) return response.status(415).json({ message: 'Only PNG, JPEG, WEBP, GIF, and BMP raster files are accepted. SVG is not supported.' });
    const metadata = parseDerivedAssetMetadata(request.body);
    const projectId = typeof request.body?.projectId === 'string' ? request.body.projectId : 'default';
    await projectStore.get(projectId);
    const invalidParents = metadata.parentAssetIds.filter((id) => {
      const parent = assetStore.get(id, { includeTrashed: true });
      return !parent || !assetBelongsToProject(parent, projectId);
    });
    if (invalidParents.length) return response.status(400).json({ message: 'Every parentAssetId must identify an asset from the active project.' });
    const name = typeof request.body?.name === 'string' ? request.body.name.trim().slice(0, 180) : request.file.originalname;
    response.status(201).json(await assetStore.createDerived({ buffer: request.file.buffer, name, metadata, projectId }));
  } catch (error) {
    if (error?.code === 'DERIVED_METADATA_INVALID') return response.status(400).json({ message: error.message });
    next(error);
  }
});
app.post('/api/integrations/tripo/open', async (request, response) => {
  const url = typeof request.body?.url === 'string' ? request.body.url : '';
  const sourceNodeId = typeof request.body?.sourceNodeId === 'string' ? request.body.sourceNodeId : '';
  const resolved = await assetStore.resolveDataUrl(url).catch(() => null);
  if (!resolved?.path || !existsSync(resolved.path)) return response.status(400).json({ message: 'Choose an image from the active local Frameforge library.' });
  try {
    response.json(await tripoBrowserBridge.openWithImage(resolved.path, { sourceNodeId }));
  } catch (error) {
    console.error('Tripo bridge failed:', error);
    response.status(502).json({ code: error?.code || 'TRIPO_BRIDGE_FAILED', message: error instanceof Error ? error.message : 'Could not open Tripo Studio.' });
  }
});
app.post('/api/integrations/tripo/open-multiview', async (request, response) => {
  const requestedViews = request.body?.views;
  const sourceNodeId = typeof request.body?.sourceNodeId === 'string' ? request.body.sourceNodeId : '';
  if (!requestedViews || typeof requestedViews !== 'object') {
    return response.status(400).json({ message: 'Generate all four Character Views before opening Tripo Multiview.' });
  }
  const viewPaths = {};
  for (const key of ['front', 'left', 'back', 'right']) {
    const url = typeof requestedViews[key] === 'string' ? requestedViews[key] : '';
    const resolved = await assetStore.resolveDataUrl(url).catch(() => null);
    if (!resolved?.path || !existsSync(resolved.path)) {
      return response.status(400).json({ message: `The ${key} view must come from the active local Frameforge library.` });
    }
    viewPaths[key] = resolved.path;
  }
  try {
    response.json(await tripoBrowserBridge.openWithMultiview(viewPaths, { sourceNodeId }));
  } catch (error) {
    console.error('Tripo Multiview bridge failed:', error);
    response.status(502).json({ code: error?.code || 'TRIPO_MULTIVIEW_BRIDGE_FAILED', message: error instanceof Error ? error.message : 'Could not open Tripo Multiview.' });
  }
});
app.get('/api/integrations/tripo/events', (request, response) => {
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();
  response.write(`event: status\ndata: ${JSON.stringify({ type: 'status', ...tripoBrowserBridge.snapshot() })}\n\n`);
  tripoEventClients.add(response);
  const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 15_000);
  request.on('close', () => {
    clearInterval(heartbeat);
    tripoEventClients.delete(response);
  });
});
app.get('/api/integrations/tripo/status', (_request, response) => response.json(tripoBrowserBridge.snapshot()));
app.post('/api/integrations/tripo/recover', async (request, response) => {
  try {
    response.json(await tripoBrowserBridge.recoverCurrentModel({
      sourceNodeId: typeof request.body?.sourceNodeId === 'string' ? request.body.sourceNodeId : '',
      watcherId: typeof request.body?.watcherId === 'string' ? request.body.watcherId : '',
    }));
  } catch (error) {
    response.status(409).json({ code: error?.code || 'TRIPO_RECOVERY_FAILED', message: error instanceof Error ? error.message : 'Could not recover the current Tripo result.' });
  }
});
app.get('/api/integrations/tripo/models/:modelKey/download', (request, response) => {
  const modelPath = resolveLocalModelPath(modelsDir, request.params.modelKey);
  if (!modelPath || !existsSync(modelPath)) return response.status(404).json({ message: 'Tripo model not found.' });
  response.download(modelPath, request.params.modelKey);
});
app.post('/api/assets/trash', async (request, response, next) => {
  try { response.json({ ok: true, asset: await assetStore.trashByUrl(typeof request.body?.url === 'string' ? request.body.url : '') }); }
  catch (error) {
    if (error?.code === 'ASSET_NOT_FOUND') return response.status(404).json({ message: error.message });
    next(error);
  }
});
app.post('/api/assets/:assetId/restore', async (request, response, next) => {
  try { response.json({ ok: true, asset: await assetStore.restore(request.params.assetId) }); }
  catch (error) {
    if (error?.code === 'ASSET_NOT_FOUND' || error?.code === 'ASSET_FILE_MISSING') return response.status(404).json({ message: error.message });
    if (error?.code === 'ASSET_CONFLICT') return response.status(409).json({ message: error.message });
    next(error);
  }
});
app.delete('/api/assets/:assetId/permanent', async (request, response, next) => {
  try { response.json({ ok: true, asset: await assetStore.purge(request.params.assetId) }); }
  catch (error) {
    if (error?.code === 'ASSET_NOT_FOUND') return response.status(404).json({ message: error.message });
    next(error);
  }
});
app.get('/api/assets/:assetId/preview', async (request, response, next) => {
  try {
    const asset = assetStore.get(request.params.assetId, { includeTrashed: true });
    const assetPath = asset ? assetStore.storedPath(asset) : null;
    if (!assetPath || !existsSync(assetPath)) return response.status(404).end();
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', asset.deletedAt ? 'no-store' : 'private, max-age=31536000, immutable');
    response.type(asset.mediaType).sendFile(assetPath);
  } catch (error) { next(error); }
});
app.get('/api/assets/:assetId/download', async (request, response, next) => {
  try {
    const asset = assetStore.get(request.params.assetId);
    if (!asset || !existsSync(assetStore.filePath(asset))) return response.status(404).json({ message: 'Asset not found.' });
    response.download(assetStore.filePath(asset), safeDownloadName(asset.name, path.extname(asset.storageName)));
  } catch (error) { next(error); }
});

app.post('/api/exports/archive', async (request, response, next) => {
  try {
    const assets = await resolveExportAssets(assetStore, request.body);
    await streamAssetArchive({ response, assetStore, assets, name: request.body?.name, descriptor: request.body?.manifest });
  } catch (error) {
    if (error?.code === 'EXPORT_EMPTY' || error?.code === 'EXPORT_TOO_LARGE') return response.status(400).json({ message: error.message });
    next(error);
  }
});

// Existing frontend compatibility: downloading by its output URL still works.
app.get('/api/files/download', async (request, response, next) => {
  try {
    const resolved = await assetStore.resolveDataUrl(String(request.query.url || ''));
    if (!resolved?.path || !existsSync(resolved.path)) return response.status(404).json({ message: 'Generated image not found.' });
    response.download(resolved.path, safeDownloadName(resolved.asset?.name || path.parse(resolved.path).name, path.extname(resolved.asset?.storageName || resolved.path)));
  } catch (error) { next(error); }
});

// Only local binary outputs are public. Metadata, jobs, projects, and trash are never statically mounted.
app.get('/data/models/:modelKey', (request, response) => {
  const modelPath = resolveLocalModelPath(modelsDir, request.params.modelKey);
  if (!modelPath || !existsSync(modelPath)) return response.status(404).end();
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  response.type('model/gltf-binary').sendFile(modelPath);
});
app.get('/data/:collection/:assetKey', async (request, response, next) => {
  try {
    if (!['assets', 'generated'].includes(request.params.collection)) return response.status(404).end();
    const url = `/data/${request.params.collection}/${encodeURIComponent(request.params.assetKey)}`;
    const resolved = await assetStore.resolveDataUrl(url);
    if (!resolved?.path || !existsSync(resolved.path)) return response.status(404).end();
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    response.sendFile(resolved.path);
  } catch (error) { next(error); }
});

app.post('/api/generate', async (request, response, next) => {
  try {
    const prompt = typeof request.body?.prompt === 'string' ? request.body.prompt.trim().slice(0, 8_000) : '';
    const requestedUrls = Array.isArray(request.body?.sourceUrls)
      ? [...new Set(request.body.sourceUrls.filter((url) => typeof url === 'string' && url))]
      : typeof request.body?.sourceUrl === 'string' && request.body.sourceUrl ? [request.body.sourceUrl] : [];
    const provider = typeof request.body?.provider === 'string' ? request.body.provider : 'codex';
    const outputName = typeof request.body?.outputName === 'string' ? request.body.outputName.trim().slice(0, 180) : '';
    const projectId = typeof request.body?.projectId === 'string' ? request.body.projectId : 'default';
    await projectStore.get(projectId);
    if (requestedUrls.length > MAX_REFERENCE_IMAGES) return response.status(400).json({ message: `A generation can use up to ${MAX_REFERENCE_IMAGES} reference images.` });
    if (!prompt || !requestedUrls.length) return response.status(400).json({ message: 'At least one input image and a prompt are required.' });
    if (provider !== 'codex') return response.status(409).json({ message: 'The selected image provider is unavailable locally.' });
    const sources = [];
    for (const sourceUrl of [...new Set(requestedUrls)]) {
      const source = await assetStore.resolveDataUrl(sourceUrl);
      if (!source?.path || !existsSync(source.path) || !assetBelongsToProject(source.asset, projectId)) return response.status(400).json({ message: 'Every input image must belong to the active local project.' });
      sources.push({ url: sourceUrl, assetId: source.asset?.id || null });
    }
    const job = createJob({ prompt, sourceUrls: sources.map((source) => source.url), sourceAssetIds: sources.map((source) => source.assetId).filter(Boolean), provider, outputName, projectId });
    await jobStore.create(job);
    jobQueue.enqueue(job.id);
    response.status(202).json({ jobId: job.id });
  } catch (error) { next(error); }
});

app.post('/api/batches', async (request, response, next) => {
  try {
    const batch = normalizeBatchRequest(request.body);
    const { provider } = batch;
    const projectId = typeof request.body?.projectId === 'string' ? request.body.projectId : 'default';
    await projectStore.get(projectId);
    if (!batch.sourceUrls.length || !batch.slots.length) return response.status(400).json({ message: 'At least one source image and one batch slot are required.' });
    if (provider !== 'codex') return response.status(409).json({ message: 'The selected image provider is unavailable locally.' });
    const sources = [];
    for (const sourceUrl of batch.sourceUrls) {
      const source = await assetStore.resolveDataUrl(sourceUrl);
      if (!source?.path || !existsSync(source.path) || !assetBelongsToProject(source.asset, projectId)) return response.status(400).json({ message: 'Every input image must belong to the active local project.' });
      sources.push({ url: sourceUrl, assetId: source.asset?.id || null });
    }
    const batchId = randomUUID();
    const jobs = [];
    for (const slot of batch.slots) {
      jobs.push(createJob({ ...slot, sourceUrls: sources.map((source) => source.url), sourceAssetIds: sources.map((source) => source.assetId).filter(Boolean), provider, batchId, batchConcurrency: batch.concurrency, projectId }));
    }
    for (const job of jobs) await jobStore.create(job);
    for (const job of jobs) jobQueue.enqueue(job.id);
    response.status(202).json({ batchId, kind: batch.batchKind, jobs: jobs.map((job) => ({ id: job.id, batchKind: job.batchKind, slotKey: job.slotKey, slotIndex: job.slotIndex, viewKey: job.viewKey, status: job.status })) });
  } catch (error) {
    const message = batchRequestErrorMessage(error);
    if (message) return response.status(400).json({ message });
    next(error);
  }
});

app.get('/api/jobs', (request, response) => response.json(jobStore.list(request.query.projectId ? String(request.query.projectId) : null)));
app.get('/api/batches/:batchId', (request, response) => {
  const jobs = jobStore.list().filter((job) => job.batchId === request.params.batchId);
  if (!jobs.length) return response.status(404).json({ message: 'Batch not found.' });
  response.json({ id: request.params.batchId, jobs });
});
app.get('/api/jobs/:jobId', (request, response) => {
  const job = jobStore.get(request.params.jobId);
  if (!job) return response.status(404).json({ message: 'Job not found.' });
  response.json(job);
});
app.post('/api/jobs/:jobId/cancel', async (request, response, next) => {
  try {
    const job = await jobQueue.cancel(request.params.jobId);
    if (!job) return response.status(404).json({ message: 'Job not found.' });
    response.json(job);
  } catch (error) { next(error); }
});
app.post('/api/jobs/:jobId/retry', async (request, response, next) => {
  try {
    const job = await jobStore.retry(request.params.jobId);
    if (!job) return response.status(404).json({ message: 'Job not found.' });
    jobQueue.enqueue(job.id);
    response.json(job);
  } catch (error) {
    if (error?.code === 'JOB_NOT_RETRYABLE') return response.status(409).json({ message: error.message });
    next(error);
  }
});
// Existing frontend compatibility: this is now a soft delete rather than an unlink.
app.delete('/api/files', async (request, response, next) => {
  try { response.json({ ok: true, asset: await assetStore.trashByUrl(typeof request.body?.url === 'string' ? request.body.url : '') }); }
  catch (error) {
    if (error?.code === 'ASSET_NOT_FOUND') return response.status(404).json({ message: 'Generated image not found.' });
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') return response.status(413).json({ message: 'Image files must be 20 MB or smaller.' });
  if (error?.code === 'INVALID_PROJECT_ID') return response.status(400).json({ message: error.message });
  if (error?.code === 'PROJECT_NOT_FOUND') return response.status(404).json({ message: error.message });
  console.error(error);
  response.status(500).json({ message: 'Unexpected local server error.' });
});

const httpServer = app.listen(port, '127.0.0.1', () => {
  console.log(`Frameforge backend listening at http://127.0.0.1:${port}`);
  void codexWorkerPool.warm(rootDir).then((results) => {
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) console.warn(`${failed} Codex worker${failed === 1 ? '' : 's'} could not be prewarmed and will retry on demand.`);
  });
});
function shutdown() {
  codexWorkerPool.stop();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1_000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

async function executeImageJob(job) {
  const sourceUrls = Array.isArray(job.sourceUrls) && job.sourceUrls.length ? job.sourceUrls : [job.sourceUrl].filter(Boolean);
  const sources = [];
  for (const sourceUrl of sourceUrls) {
    const source = await assetStore.resolveDataUrl(sourceUrl);
    if (!source?.path || !existsSync(source.path) || !assetBelongsToProject(source.asset, job.projectId || 'default')) throw new Error('A selected source asset is no longer available in this project.');
    sources.push(source);
  }
  const temporaryPath = path.join(generatedDir, `.${job.id}.pending.png`);
  await unlink(temporaryPath).catch(() => {});
  const layerConstraint = job.batchKind === 'character-parts'
    ? 'This is a compositing-layer task. Respect the first reference canvas and requested pixel placement. Prefer real PNG alpha transparency; do not simulate transparency with white, gray, or checkerboard backgrounds.'
    : job.batchKind === 'smart-separation'
      ? 'This is a Smart Separation regeneration task. Generate exactly one standalone UI asset matching only the requested element; recreate it cleanly instead of cropping or copying surrounding sheet pixels. Render the exact visible text requested by the User instruction verbatim: do not correct, paraphrase, translate, add, or omit text. Match the requested visual style exactly. Return one complete PNG asset with real alpha transparency around it. Do not include an atlas, sprite sheet, collage, neighboring elements, surrounding scene, background, solid matte, transparency checkerboard, labels, guides, mockup, or presentation frame. The canvas must contain only this single isolated asset with transparent padding.'
    : '';
  const taskIntro = job.batchKind === 'smart-separation'
    ? 'Use the attached source sheet only as visual reference. Recreate the requested target as a new isolated asset.'
    : sources.length > 1 ? `Generate one image using all ${sources.length} attached reference images.` : 'Generate one edited image from the attached source image.';
  const preservationConstraint = job.batchKind === 'smart-separation'
    ? 'Preserve the requested target, not the source-sheet canvas. Use nearby sheet content only to understand the design language.'
    : 'Preserve the main subject identity, silhouette, material language, and palette unless the instruction explicitly changes them.';
  const workerPrompt = [taskIntro, `User instruction: ${job.prompt}`, layerConstraint, preservationConstraint, 'Return an image result, not a text-only description.'].filter(Boolean).join('\n');
  await codexWorkerPool.run(async (worker, workerIndex) => {
    await worker.generate({
      cwd: rootDir,
      sourcePaths: sources.map((source) => source.path),
      outputPath: temporaryPath,
      prompt: workerPrompt,
      onProgress: (progress) => { void jobStore.update(job.id, { progress: `Worker ${workerIndex + 1} · ${progress}` }); },
    });
  });
  const sourceAssetIds = Array.isArray(job.sourceAssetIds) && job.sourceAssetIds.length ? job.sourceAssetIds : [job.sourceAssetId].filter(Boolean);
  const asset = await assetStore.createGeneratedFromFile({ temporaryPath, name: job.outputName, prompt: job.prompt, sourceAssetIds, provider: job.provider, jobId: job.id, projectId: job.projectId || 'default' });
  await jobStore.update(job.id, { status: 'completed', progress: 'Ready', outputUrl: asset.url, outputAssetId: asset.id, error: null });
}

function createJob({ prompt, sourceUrl, sourceAssetId, sourceUrls, sourceAssetIds, provider, outputName, batchId = null, batchConcurrency = 1, batchKind = null, slotKey = null, slotIndex = null, viewKey = null, projectId = 'default' }) {
  const id = randomUUID();
  const normalizedUrls = Array.isArray(sourceUrls) && sourceUrls.length ? sourceUrls : [sourceUrl].filter(Boolean);
  const normalizedAssetIds = Array.isArray(sourceAssetIds) && sourceAssetIds.length ? sourceAssetIds : [sourceAssetId].filter(Boolean);
  return { id, batchId, batchConcurrency: Math.max(1, Math.min(4, Number(batchConcurrency) || 1)), batchKind, slotKey, slotIndex, viewKey, projectId: projectId || 'default', status: 'queued', progress: 'Waiting for local queue', prompt, sourceUrl: normalizedUrls[0] || null, sourceUrls: normalizedUrls, sourceAssetId: normalizedAssetIds[0] || null, sourceAssetIds: normalizedAssetIds, provider, outputName: outputName || `${slugify(prompt, 'generated')}.png`, outputUrl: null, outputAssetId: null, error: null, attempt: 1, cancellationRequested: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), log: [] };
}

function assetBelongsToProject(asset, projectId) {
  if (!asset) return false;
  return asset.projectId === projectId || (Array.isArray(asset.projectIds) && asset.projectIds.includes(projectId));
}

async function getCodexProviderStatus() {
  const result = await runCodex(['login', 'status'], 10_000);
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  const installed = result.code !== null && !result.spawnError;
  const connected = result.code === 0 && /logged in/i.test(combined);
  const statusLabel = result.code === 0 ? combined : result.spawnError || combined || 'Codex is unavailable';
  return { id: 'codex', label: 'Codex ImageGen', statusLabel, available: installed && connected, installed, connected, reason: installed && connected ? undefined : 'Sign in to Codex to enable ImageGen.', capabilities: { imageGeneration: true, imageEditing: true, cancellation: 'queued-only', maxConcurrency: codexWorkerCount } };
}

function resolveLocalModelPath(directory, modelKey) {
  const key = typeof modelKey === 'string' ? modelKey : '';
  if (!/^tripo-[a-z0-9._-]+\.glb$/i.test(key) || path.basename(key) !== key) return null;
  const resolved = path.resolve(directory, key);
  return path.dirname(resolved) === path.resolve(directory) ? resolved : null;
}
function publishTripoEvent(event) {
  console.log(`[tripo watcher] ${event.type}${event.taskId ? ` · ${event.taskId}` : ''}`);
  const payload = `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of [...tripoEventClients]) {
    try { client.write(payload); }
    catch { tripoEventClients.delete(client); }
  }
}
function runCodex(args, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = ''; let stderr = ''; let settled = false;
    const child = spawn(codexCommand, args, { cwd: rootDir, shell: false, windowsHide: true, env: codexSpawnEnv() });
    const timeout = setTimeout(() => { child.kill(); if (!settled) resolve({ code: null, stdout, stderr, spawnError: 'Codex timed out.' }); settled = true; }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timeout); if (!settled) resolve({ code: null, stdout, stderr, spawnError: error.message }); settled = true; });
    child.on('close', (code) => { clearTimeout(timeout); if (!settled) resolve({ code, stdout, stderr, spawnError: null }); settled = true; });
  });
}
