import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AssetStore } from '../../server/asset-store.mjs';
import { CodexAppServer } from '../../server/codex-app-server.mjs';
import { MAX_PROJECT_STYLE_IMAGES, normalizeProjectStyleLibrary, projectStyleModelContext, resolveProjectStyle, withProjectStyle } from '../../server/project-style.mjs';

const reference = (id, name = id) => ({ assetId: id, url: `/data/assets/${id}`, name });

test('style normalization preserves editable text, removes duplicate references, and enforces the library size', () => {
  assert.deepEqual(normalizeProjectStyleLibrary(), { text: '', images: [] });
  const first = reference('first');
  const second = reference('second');
  assert.deepEqual(normalizeProjectStyleLibrary({ text: '  Тёплые цвета\n', images: [first, { ...first, name: 'Duplicate' }, { ...second, assetId: first.assetId }, second, { assetId: 'external', url: 'https://example.com/ref.png' }] }), {
    text: '  Тёплые цвета\n', images: [first, second],
  });
  assert.deepEqual(normalizeProjectStyleLibrary(first), { text: '', images: [first] });
  assert.equal(normalizeProjectStyleLibrary({ text: 'x'.repeat(12_001) }).text.length, 12_000);
  assert.throws(() => normalizeProjectStyleLibrary({ images: Array.from({ length: MAX_PROJECT_STYLE_IMAGES + 1 }, (_, index) => reference(`image-${index}`)) }), { code: 'PROJECT_STYLE_REFERENCE_LIMIT' });
});

test('automatic style applies text and every image, deduplicates attached sources, and keeps explicit source roles', () => {
  const primary = { ...reference('source'), path: '/source.png' };
  const styleOnly = { ...reference('style'), path: '/style.png' };
  const style = { text: 'Rounded clay shapes', sources: [primary, styleOnly] };
  const applied = withProjectStyle([primary], style, 2);
  assert.deepEqual(applied.sources, [primary, styleOnly]);
  assert.match(applied.instructions, /Rounded clay shapes/);
  assert.match(applied.instructions, /image positions 1, 2/);
  assert.match(applied.instructions, /not additional subjects/);
  assert.deepEqual(projectStyleModelContext(style, [primary], 2), { instructions: applied.instructions, imagePaths: ['/style.png'] });
  assert.throws(() => withProjectStyle([primary], style, 1), { code: 'PROJECT_STYLE_REFERENCE_LIMIT' });
  assert.deepEqual(withProjectStyle([primary], { text: '', sources: [] }), { sources: [primary], instructions: '' });
});

test('style references must belong to the active project, match their tracked URL, exist, and stay out of trash', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-style-resolve-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'style.png');
  await writeFile(filePath, 'image-fixture');
  let asset = { id: 'style', projectId: 'first', projectIds: ['first'], kind: 'source' };
  const store = { get: () => asset, filePath: () => filePath, urlFor: () => '/data/assets/style' };
  const project = { id: 'first', styleLibrary: { text: '  Ink\n', images: [reference('style')] } };
  const resolved = resolveProjectStyle(project, store);
  assert.equal(resolved.text, 'Ink');
  assert.equal(resolved.sources[0].path, filePath);
  assert.throws(() => resolveProjectStyle(project, store, 'other'), { code: 'PROJECT_STYLE_REFERENCE_UNAVAILABLE' });
  assert.throws(() => resolveProjectStyle({ ...project, styleLibrary: { images: [{ ...reference('style'), url: '/data/generated/style' }] } }, store), { code: 'PROJECT_STYLE_REFERENCE_UNAVAILABLE' });
  asset = { ...asset, deletedAt: '2026-10-16T00:00:00Z' };
  assert.throws(() => resolveProjectStyle(project, store), { code: 'PROJECT_STYLE_REFERENCE_UNAVAILABLE' });
  asset = { ...asset, deletedAt: undefined };
  await rm(filePath);
  assert.throws(() => resolveProjectStyle(project, store), { code: 'PROJECT_STYLE_REFERENCE_UNAVAILABLE' });
});

test('copied project style assets are shared only from an owning project and survive a store reload', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-style-share-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = { dataDir: root, assetsDir: path.join(root, 'assets'), generatedDir: path.join(root, 'generated'), metadataDir: path.join(root, 'metadata'), trashDir: path.join(root, 'trash') };
  const store = new AssetStore(options);
  await store.initialize();
  const uploaded = await store.createUpload({ buffer: Buffer.from('fixture'), name: 'direction.png', image: { extension: '.png', mediaType: 'image/png' }, projectId: 'original' });
  const project = { id: 'copy', styleLibrary: { text: 'Ink', images: [{ assetId: uploaded.id, url: uploaded.url, name: uploaded.name }] } };
  assert.throws(() => resolveProjectStyle(project, store), { code: 'PROJECT_STYLE_REFERENCE_UNAVAILABLE' });
  await assert.rejects(store.shareAssetsWithProject([uploaded.id], 'unrelated', 'copy'), { code: 'PROJECT_STYLE_REFERENCE_UNAVAILABLE' });
  assert.deepEqual(store.get(uploaded.id).projectIds, ['original']);
  await store.shareAssetsWithProject([uploaded.id, uploaded.id], 'original', 'copy');
  assert.equal(resolveProjectStyle(project, store).sources.length, 1);
  const reloaded = new AssetStore(options);
  await reloaded.initialize();
  assert.equal(resolveProjectStyle(project, reloaded).sources.length, 1);
  assert.equal(store.list({ projectId: 'unrelated' }).length, 0);
  await store.trash(uploaded.id);
  await assert.rejects(store.shareAssetsWithProject([uploaded.id], 'original', 'another-copy'), { code: 'PROJECT_STYLE_REFERENCE_UNAVAILABLE' });
});

test('enhancement, UI detection, semantic grouping and character analysis attach automatic project style without provider calls', async () => {
  const projectStyle = { instructions: 'Project style library: warm watercolor', imagePaths: ['/style-one.png', '/style-two.png'] };
  const scenarios = [
    { method: 'enhancePrompt', args: { prompt: 'A button' }, response: 'An enhanced button', imagePaths: projectStyle.imagePaths },
    { method: 'analyzeUiSheet', args: { imagePath: '/sheet.png' }, response: '{}', imagePaths: ['/sheet.png', ...projectStyle.imagePaths], role: /bounds only in the first attached source image/ },
    { method: 'groupUiItems', args: { items: [] }, response: '{}', imagePaths: projectStyle.imagePaths },
    { method: 'analyzeCharacterProps', args: { imagePaths: ['/front.png', '/back.png', '/left.png', '/right.png'] }, response: '{}', imagePaths: ['/front.png', '/back.png', '/left.png', '/right.png', ...projectStyle.imagePaths], role: /only in the first 4 character source images/ },
  ];
  for (const scenario of scenarios) {
    const worker = new CodexAppServer();
    worker.start = async () => {};
    let turn;
    worker.request = async (method, params) => {
      if (method === 'thread/start') return { thread: { id: 'style-test' } };
      turn = params;
      setImmediate(() => {
        worker.emit('notification', { method: 'item/completed', params: { threadId: 'style-test', item: { type: 'agentMessage', text: scenario.response } } });
        worker.emit('notification', { method: 'turn/completed', params: { threadId: 'style-test' } });
      });
      return {};
    };
    await worker[scenario.method]({ cwd: '/fixture', ...scenario.args, projectStyle, outputSchema: {} });
    assert.match(turn.input[0].text, /warm watercolor/, scenario.method);
    if (scenario.role) assert.match(turn.input[0].text, scenario.role, scenario.method);
    assert.deepEqual(turn.input.filter((input) => input.type === 'localImage').map((input) => input.path), scenario.imagePaths, scenario.method);
  }
});
