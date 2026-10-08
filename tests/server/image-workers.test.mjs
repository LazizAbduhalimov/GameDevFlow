import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexImageWorkers } from '../../server/codex-image-workers.mjs';
import { JobQueue } from '../../server/job-queue.mjs';

test('eight images start eight distinct workers despite old batch caps', async () => {
  const jobs = new Map(Array.from({ length: 8 }, (_, index) => [String(index), {
    id: String(index), status: 'queued', batchId: 'old-batch', batchConcurrency: 1,
  }]));
  const store = { get: (id) => jobs.get(id), update: async (id, patch) => Object.assign(jobs.get(id), patch) };
  const created = []; const stopped = [];
  const imageWorkers = new CodexImageWorkers({ createWorker: (id) => {
    const worker = { id, stop: () => stopped.push(id) }; created.push(worker); return worker;
  } });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new JobQueue({ store, concurrency: Infinity, worker: (job) => imageWorkers.run(job.id, async () => {
    await gate;
    await store.update(job.id, { status: 'completed' });
  }) });
  for (const id of jobs.keys()) queue.enqueue(id);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queue.snapshot().workerMode, 'per-image');
  assert.equal(queue.snapshot().concurrency, null);
  assert.equal(queue.running.size, 8);
  assert.equal(imageWorkers.snapshot().active, 8);
  assert.equal(new Set(created).size, 8);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(imageWorkers.snapshot().active, 0);
  assert.equal(queue.running.size, 0);
  assert.equal(stopped.length, 8);
});

test('a failing image closes only its own worker', async () => {
  const stopped = [];
  const imageWorkers = new CodexImageWorkers({ createWorker: (id) => ({ stop: () => stopped.push(id) }) });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const good = imageWorkers.run('good', async () => { await gate; return 'ready'; });
  await assert.rejects(imageWorkers.run('bad', async () => { throw new Error('Image failed'); }), /Image failed/);
  assert.deepEqual(stopped, ['bad']);
  assert.deepEqual(imageWorkers.snapshot().jobIds, ['good']);
  release();
  assert.equal(await good, 'ready');
  assert.equal(imageWorkers.snapshot().active, 0);
});

test('worker shutdown reaches every active image process', async () => {
  const stopped = new Set();
  const imageWorkers = new CodexImageWorkers({ createWorker: (id) => ({ stop: () => stopped.add(id) }) });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const jobs = Array.from({ length: 6 }, (_, index) => imageWorkers.run(String(index), () => gate));
  imageWorkers.stop();
  assert.equal(stopped.size, 6);
  release();
  await Promise.all(jobs);
  assert.equal(imageWorkers.snapshot().active, 0);
});
