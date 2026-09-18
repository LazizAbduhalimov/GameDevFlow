import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectRasterImage, hasPngTransparency } from '../../server/image-validation.mjs';
import { AssetStore } from '../../server/asset-store.mjs';
import { resolveExportAssets } from '../../server/archive-export.mjs';
import { normalizeBatchRequest } from '../../server/batch-normalization.mjs';
import { CodexWorkerPool } from '../../server/codex-worker-pool.mjs';
import { parseDerivedAssetMetadata } from '../../server/derived-asset.mjs';
import { JobQueue } from '../../server/job-queue.mjs';
import { JobStore } from '../../server/job-store.mjs';
import { resolveWithin, safeDownloadName, slugify } from '../../server/path-safety.mjs';
import { ProjectStore } from '../../server/project-store.mjs';

test('raster signatures are accepted and text/SVG is rejected', () => {
  assert.deepEqual(detectRasterImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])), { extension: '.png', mediaType: 'image/png' });
  assert.deepEqual(detectRasterImage(Buffer.from('RIFFxxxxWEBPvp8 ', 'ascii')), { extension: '.webp', mediaType: 'image/webp' });
  assert.equal(detectRasterImage(Buffer.from('<svg onload="alert(1)">')), null);
});

test('native PNG transparency gate rejects opaque RGB and accepts alpha PNGs', () => {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8]);
  const opaque = Buffer.concat([header, Buffer.from([2, 0, 0, 0, 0, 0, 0, 0])]);
  const alpha = Buffer.concat([header, Buffer.from([6, 0, 0, 0, 0, 0, 0, 0])]);
  assert.equal(hasPngTransparency(opaque), false);
  assert.equal(hasPngTransparency(alpha), true);
});

test('batch normalization preserves Character Views and supports six variant slots', () => {
  const legacy = normalizeBatchRequest({ sourceUrl: '/data/assets/source', concurrency: 4, views: [{ key: 'front', prompt: 'Front' }, { key: 'back', prompt: 'Back' }] });
  assert.equal(legacy.batchKind, 'character-views');
  assert.equal(legacy.concurrency, 4);
  assert.deepEqual(legacy.sourceUrls, ['/data/assets/source']);
  const propViews = normalizeBatchRequest({
    sourceUrls: ['/data/assets/front', '/data/assets/left', '/data/assets/back', '/data/assets/right'],
    concurrency: 2,
    views: [{ key: 'front', prompt: 'Prop front' }, { key: 'right', prompt: 'Prop right' }],
  });
  assert.equal(propViews.batchKind, 'character-views');
  assert.deepEqual(propViews.sourceUrls, ['/data/assets/front', '/data/assets/left', '/data/assets/back', '/data/assets/right']);
  assert.deepEqual(legacy.slots.map(({ slotKey, slotIndex, viewKey }) => ({ slotKey, slotIndex, viewKey })), [
    { slotKey: 'front', slotIndex: 0, viewKey: 'front' },
    { slotKey: 'back', slotIndex: 1, viewKey: 'back' },
  ]);
  const variants = normalizeBatchRequest({ sourceUrl: '/data/assets/source', kind: 'variants', slots: Array.from({ length: 6 }, (_, index) => ({ prompt: `Variant ${index + 1}` })) });
  assert.equal(variants.batchKind, 'variants');
  assert.deepEqual(variants.slots.map((slot) => slot.slotKey), ['variants-1', 'variants-2', 'variants-3', 'variants-4', 'variants-5', 'variants-6']);
  assert.ok(variants.slots.every((slot, index) => slot.slotIndex === index && slot.viewKey === null));
  const parts = normalizeBatchRequest({ sourceUrls: ['/data/assets/front', '/data/assets/left', '/data/assets/back', '/data/assets/right'], kind: 'character-parts', slots: [
    { key: 'hat', prompt: 'Isolate the hat' },
    { key: 'body', prompt: 'Create the body base' },
  ] });
  assert.equal(parts.batchKind, 'character-parts');
  assert.deepEqual(parts.sourceUrls, ['/data/assets/front', '/data/assets/left', '/data/assets/back', '/data/assets/right']);
  assert.deepEqual(parts.slots.map((slot) => slot.slotKey), ['hat', 'body']);
  assert.equal(parts.concurrency, 1);
  const references = Array.from({ length: 6 }, (_, index) => `/data/assets/reference-${index + 1}`);
  const referenceBatch = normalizeBatchRequest({ sourceUrls: references, kind: 'variants', slots: [{ key: 'one', prompt: 'Use every reference' }] });
  assert.deepEqual(referenceBatch.sourceUrls, references);
  assert.throws(() => normalizeBatchRequest({ sourceUrls: Array.from({ length: 17 }, (_, index) => `/data/assets/reference-${index + 1}`), kind: 'variants', slots: [{ key: 'one', prompt: 'Too many references' }] }), { code: 'BATCH_REFERENCE_COUNT' });
  assert.throws(() => normalizeBatchRequest({ sourceUrl: '/data/assets/source', concurrency: 5, views: [{ key: 'front', prompt: 'Front' }] }), { code: 'BATCH_CONCURRENCY' });
});

test('derived asset metadata retains atlas provenance and rejects invalid parent fields', () => {
  const metadata = parseDerivedAssetMetadata({ parentAssetIds: '["source-1", "source-1", "source-2"]', assetRole: 'sprite-atlas', atlas: '{"columns":4,"rows":2}', manifest: '{"frames":["idle","walk"]}' });
  assert.deepEqual(metadata, { parentAssetIds: ['source-1', 'source-2'], assetRole: 'sprite-atlas', atlas: { columns: 4, rows: 2 }, manifest: { frames: ['idle', 'walk'] } });
  assert.throws(() => parseDerivedAssetMetadata({ parentAssetIds: '{"not":"an array"}' }), { code: 'DERIVED_METADATA_INVALID' });
});

test('path safety keeps asset paths inside their collection root', () => {
  const root = path.join(os.tmpdir(), 'consept-root');
  assert.equal(resolveWithin(root, 'asset.png'), path.join(root, 'asset.png'));
  assert.equal(resolveWithin(root, '../outside.png'), null);
  assert.equal(resolveWithin(root, '..\\outside.png'), null);
  assert.equal(slugify(' Front view: Character #1 '), 'front-view-character-1');
  assert.equal(safeDownloadName('smart-crown-doodle-3528a54b', '.png'), 'smart-crown-doodle-3528a54b.png');
  assert.equal(safeDownloadName('hero-front.png', '.png'), 'hero-front.png');
  assert.equal(safeDownloadName('atlas', '.webp'), 'atlas.webp');
});

test('project store writes atomically and rejects a stale revision', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-project-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new ProjectStore(path.join(root, 'projects'));
  const initial = await store.getDefault();
  assert.equal(initial.revision, 0);
  const saved = await store.saveDefault({ revision: 0, name: 'Test project', nodes: [{ id: 'n1' }], edges: [], viewport: { x: 1, y: 2, zoom: 1 } });
  assert.equal(saved.revision, 1);
  await assert.rejects(store.saveDefault({ revision: 0, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }), { code: 'REVISION_CONFLICT' });
});

test('project store preserves default while creating, listing, duplicating, and recoverably deleting projects', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-projects-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new ProjectStore(path.join(root, 'projects'));
  const original = await store.getDefault();
  const created = await store.create({ name: 'Character Pack' });
  const saved = await store.save(created.id, { revision: 0, name: created.name, nodes: [{ id: 'hero' }], edges: [], viewport: { x: 20, y: 30, zoom: 0.8 } });
  const duplicate = await store.duplicate(saved.id, 'Character Pack Copy');
  assert.equal(saved.id, created.id);
  assert.equal(saved.revision, 1);
  assert.equal(duplicate.nodes.length, 1);
  const fromGraph = await store.create({
    name: 'Seamless material',
    nodes: [{ id: 'seamless-texture', type: 'seamlessTexture', position: { x: 80, y: 160 }, data: { title: 'Seamless Texture', status: 'idle' } }],
    edges: [{ id: 'edge-1', source: 'seamless-texture', target: 'material-maps' }],
    viewport: { x: 12, y: 24, zoom: 0.86 },
  });
  assert.equal(fromGraph.revision, 0);
  assert.equal(fromGraph.nodes.length, 1);
  assert.equal(fromGraph.edges.length, 1);
  assert.equal(fromGraph.viewport.zoom, 0.86);
  const listed = await store.list();
  assert.deepEqual(listed.map((project) => project.id).sort(), [original.id, created.id, duplicate.id, fromGraph.id].sort());
  assert.equal(listed.find((project) => project.id === fromGraph.id)?.nodeCount, 1);
  assert.equal(listed.every((project) => project.id === 'default' || /^[a-f0-9-]{36}$/.test(project.id)), true);
  await store.delete(created.id);
  await assert.rejects(store.get(created.id), { code: 'PROJECT_NOT_FOUND' });
  await assert.rejects(store.delete('default'), { code: 'CANNOT_DELETE_DEFAULT_PROJECT' });
  assert.equal((await store.getDefault()).id, 'default');
});

test('asset store migrates legacy assets to default and scopes new uploads by project', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-assets-projects-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const metadataDir = path.join(root, 'metadata');
  await mkdir(metadataDir, { recursive: true });
  await writeFile(path.join(metadataDir, 'assets.json'), JSON.stringify({ schemaVersion: 1, assets: [{ id: 'legacy', name: 'legacy.png', kind: 'source', storageName: 'legacy.png', mediaType: 'image/png', size: 12, createdAt: '2026-01-01T00:00:00.000Z', metadata: {} }] }));
  const store = new AssetStore({
    dataDir: root,
    assetsDir: path.join(root, 'assets'),
    generatedDir: path.join(root, 'generated'),
    metadataDir,
    trashDir: path.join(root, 'trash'),
  });
  await store.initialize();
  assert.equal(store.get('legacy').projectId, 'default');
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const first = await store.createUpload({ buffer, name: 'first.png', image: detectRasterImage(buffer), projectId: 'project-one' });
  const second = await store.createUpload({ buffer, name: 'second.png', image: detectRasterImage(buffer), projectId: 'project-two' });
  assert.deepEqual(store.list({ projectId: 'project-one' }).map((asset) => asset.id), [first.id]);
  assert.deepEqual(store.list({ projectId: 'project-two' }).map((asset) => asset.id), [second.id]);
  assert.ok(store.list({ projectId: 'default' }).some((asset) => asset.id === 'legacy'));
});

test('asset store soft-delete can be restored and then purged permanently', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new AssetStore({
    dataDir: root,
    assetsDir: path.join(root, 'assets'),
    generatedDir: path.join(root, 'generated'),
    metadataDir: path.join(root, 'metadata'),
    trashDir: path.join(root, 'trash'),
  });
  await store.initialize();
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const asset = await store.createUpload({ buffer, name: 'source.png', image: detectRasterImage(buffer) });
  assert.match(asset.url, /^\/data\/assets\/[a-f0-9-]+$/);
  assert.equal(store.list().length, 1);
  const trashed = await store.trashByUrl(asset.url);
  assert.equal(store.list().length, 0);
  assert.equal(store.list({ includeTrashed: true }).length, 1);
  assert.ok(trashed.deletedAt);
  assert.ok(existsSync(store.storedPath(store.get(asset.id, { includeTrashed: true }))));

  const restored = await store.restore(asset.id);
  assert.equal(restored.deletedAt, null);
  assert.equal(store.list().length, 1);
  assert.ok(existsSync(store.filePath(store.get(asset.id))));

  await store.trash(asset.id);
  await store.purge(asset.id);
  assert.equal(store.list({ includeTrashed: true }).length, 0);
});

test('archive selection deduplicates ids and urls and excludes trashed assets', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-archive-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new AssetStore({
    dataDir: root,
    assetsDir: path.join(root, 'assets'),
    generatedDir: path.join(root, 'generated'),
    metadataDir: path.join(root, 'metadata'),
    trashDir: path.join(root, 'trash'),
  });
  await store.initialize();
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const asset = await store.createUpload({ buffer, name: 'hero.png', image: detectRasterImage(buffer) });
  const selected = await resolveExportAssets(store, { assetIds: [asset.id], urls: [asset.url] });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, asset.id);
  await store.trash(asset.id);
  await assert.rejects(resolveExportAssets(store, { assetIds: [asset.id] }), { code: 'EXPORT_EMPTY' });
});

test('generated assets retain every parent from an All views input', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-parents-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new AssetStore({
    dataDir: root,
    assetsDir: path.join(root, 'assets'),
    generatedDir: path.join(root, 'generated'),
    metadataDir: path.join(root, 'metadata'),
    trashDir: path.join(root, 'trash'),
  });
  await store.initialize();
  const pending = path.join(root, 'pending.png');
  await writeFile(pending, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]));
  const generated = await store.createGeneratedFromFile({ pending, temporaryPath: pending, name: 'all-result', prompt: 'Use every view', sourceAssetIds: ['front', 'left', 'back', 'right'], provider: 'codex', jobId: 'job-all', graphNodeId: 'generator-1', slotKey: 'output' });
  assert.equal(generated.name, 'all-result.png');
  assert.deepEqual(store.get(generated.id).metadata.parentAssetIds, ['front', 'left', 'back', 'right']);
  assert.equal(store.get(generated.id).metadata.graphNodeId, 'generator-1');
  assert.equal(store.get(generated.id).metadata.slotKey, 'output');
});

test('derived raster assets use generated storage and keep their soft-delete lifecycle', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-derived-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new AssetStore({
    dataDir: root,
    assetsDir: path.join(root, 'assets'),
    generatedDir: path.join(root, 'generated'),
    metadataDir: path.join(root, 'metadata'),
    trashDir: path.join(root, 'trash'),
  });
  await store.initialize();
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const derived = await store.createDerived({ buffer, name: 'hero-atlas.png', metadata: { parentAssetIds: ['source-1'], assetRole: 'sprite-atlas', atlas: { columns: 2, rows: 1 } } });
  assert.equal(derived.kind, 'generated');
  assert.equal(store.get(derived.id).metadata.derived, true);
  assert.match(derived.url, /^\/data\/generated\//);
  await store.trash(derived.id);
  assert.equal(store.get(derived.id), null);
  assert.ok(store.get(derived.id, { includeTrashed: true }).deletedAt);
});

test('job store marks queued and running jobs interrupted after restart', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-jobs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = new JobStore(root);
  await first.initialize();
  await first.create({ id: 'job-1', status: 'queued', progress: 'Waiting', createdAt: '2026-01-01T00:00:00.000Z' });
  const recovered = new JobStore(root);
  await recovered.initialize();
  assert.equal(recovered.get('job-1').status, 'interrupted');
  assert.equal(recovered.get('job-1').projectId, 'default');
});

test('job store lists tasks only for the selected project', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-scoped-jobs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new JobStore(root);
  await store.initialize();
  await store.create({ id: 'default-job', projectId: 'default', status: 'completed', createdAt: '2026-01-01T00:00:00.000Z' });
  await store.create({ id: 'other-job', projectId: 'project-two', status: 'completed', createdAt: '2026-01-02T00:00:00.000Z' });
  assert.deepEqual(store.list('default').map((job) => job.id), ['default-job']);
  assert.deepEqual(store.list('project-two').map((job) => job.id), ['other-job']);
});

test('queue runs one job at a time and cancels queued jobs', async () => {
  const jobs = new Map([
    ['a', { id: 'a', status: 'queued' }],
    ['b', { id: 'b', status: 'queued' }],
  ]);
  const store = {
    get: (id) => jobs.get(id) || null,
    update: async (id, patch) => Object.assign(jobs.get(id), patch),
  };
  const started = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new JobQueue({ store, concurrency: 1, worker: async (job) => { started.push(job.id); await gate; } });
  queue.enqueue('a');
  queue.enqueue('b');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(started, ['a']);
  await queue.cancel('b');
  assert.equal(jobs.get('b').status, 'cancelled');
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(started, ['a']);
});

test('queue caps a batch while keeping capacity for another batch', async () => {
  const jobs = new Map([
    ['a1', { id: 'a1', status: 'queued', batchId: 'a', batchConcurrency: 2 }],
    ['a2', { id: 'a2', status: 'queued', batchId: 'a', batchConcurrency: 2 }],
    ['a3', { id: 'a3', status: 'queued', batchId: 'a', batchConcurrency: 2 }],
    ['b1', { id: 'b1', status: 'queued', batchId: 'b', batchConcurrency: 2 }],
  ]);
  const store = { get: (id) => jobs.get(id) || null, update: async (id, patch) => Object.assign(jobs.get(id), patch) };
  const started = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new JobQueue({ store, concurrency: 4, worker: async (job) => { started.push(job.id); await gate; } });
  for (const jobId of jobs.keys()) queue.enqueue(jobId);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(started.sort(), ['a1', 'a2', 'b1']);
  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(started.includes('a3'));
});

test('codex worker pool leases two isolated workers and reuses them', async () => {
  const stopped = [];
  const pool = new CodexWorkerPool({
    size: 2,
    createWorker: (index) => ({ id: index, stop: () => stopped.push(index) }),
  });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = [];
  const first = pool.run(async (worker) => { started.push(worker.id); await gate; });
  const second = pool.run(async (worker) => { started.push(worker.id); await gate; });
  const third = pool.run(async (worker) => { started.push(worker.id); });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(started.sort(), [0, 1]);
  assert.equal(pool.snapshot().busy.length, 2);
  release();
  await Promise.all([first, second, third]);
  assert.equal(started.length, 3);
  pool.stop();
  assert.deepEqual(stopped.sort(), [0, 1]);
});
