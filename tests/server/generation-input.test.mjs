import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generationInputError } from '../../server/generation-input.mjs';
import { CodexAppServer } from '../../server/codex-app-server.mjs';

test('Character Front accepts a prompt without sources while ordinary edit requests still require a source', () => {
  assert.equal(generationInputError('A robot in T-pose', 0, 'character-front'), '');
  assert.ok(generationInputError('A robot', 0));
  assert.ok(generationInputError('A robot', 0, 'unknown'));
  assert.ok(generationInputError('', 0, 'character-front'));
  assert.equal(generationInputError('Use the reference', 1), '');
});

test('Codex sends only text and saves a native image for prompt-only Character Front', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'consept-front-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, 'front.png');
  const worker = new CodexAppServer();
  worker.start = async () => {};
  let turn;
  worker.request = async (method, params) => {
    if (method === 'thread/start') return { thread: { id: 'qa' } };
    turn = params;
    setImmediate(() => worker.emit('notification', { method: 'item/completed', params: { threadId: 'qa', item: { type: 'imageGeneration', result: Buffer.from('native-image-fixture').toString('base64') } } }));
    return {};
  };
  const result = await worker.generate({ cwd: directory, sourcePaths: [], outputPath, prompt: 'A robot in T-pose', allowNoReferences: true, onProgress: (progress) => {
    if (progress.startsWith('Saving')) setImmediate(() => worker.emit('notification', { method: 'turn/completed', params: { threadId: 'qa' } }));
  } });
  assert.deepEqual(turn.input, [{ type: 'text', text: 'A robot in T-pose' }]);
  assert.equal(result.outputPath, outputPath);
  assert.equal(await readFile(outputPath, 'utf8'), 'native-image-fixture');
  await assert.rejects(worker.generate({ cwd: directory, sourcePaths: [], outputPath, prompt: 'An edit', onProgress: () => {} }), /reference image is required/);
});
