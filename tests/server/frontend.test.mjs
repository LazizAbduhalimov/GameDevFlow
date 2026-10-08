import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { serveFrontend } from '../../server/frontend.mjs';

test('production frontend supports direct project links without swallowing API or data routes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-frontend-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'index.html'), '<main>Consept</main>');
  await writeFile(path.join(root, 'assets', 'bundle.js'), 'console.log("Consept");');
  const app = express();
  app.get('/api/health', (_request, response) => response.json({ ok: true }));
  assert.equal(serveFrontend(app, root), true);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const route of ['/', '/project/default', '/project/11111111-1111-1111-1111-111111111111']) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(await response.text(), '<main>Consept</main>');
  }
  assert.deepEqual(await (await fetch(`${baseUrl}/api/health`)).json(), { ok: true });
  const bundle = await fetch(`${baseUrl}/assets/bundle.js`);
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers.get('cache-control'), /immutable/);
  for (const route of ['/api/missing', '/data/settings/unity.json', '/assets/missing.js', '/project/invalid']) {
    assert.equal((await fetch(`${baseUrl}${route}`)).status, 404);
  }
  assert.equal(serveFrontend(express(), path.join(root, 'missing')), false);
});
