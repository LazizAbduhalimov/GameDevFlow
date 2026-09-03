import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJsonAtomic } from './json-store.mjs';

export class JobStore {
  constructor(jobsDir) {
    this.jobsDir = jobsDir;
    this.jobs = new Map();
    this.writeChain = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.jobsDir, { recursive: true });
    for (const file of await readdir(this.jobsDir)) {
      if (!file.endsWith('.json')) continue;
      const job = await readJson(path.join(this.jobsDir, file), null);
      if (!job?.id) continue;
      if (job.status === 'running' || job.status === 'queued') {
        job.status = 'interrupted';
        job.progress = 'Interrupted by a Frameforge restart. Retry when ready.';
        job.updatedAt = new Date().toISOString();
        await writeJsonAtomic(path.join(this.jobsDir, file), job);
      }
      this.jobs.set(job.id, job);
    }
  }

  list() { return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  get(id) { return this.jobs.get(id) || null; }

  async create(job) {
    return this.#enqueue(async () => {
      this.jobs.set(job.id, job);
      await this.#write(job);
      return job;
    });
  }

  async update(id, patch) {
    return this.#enqueue(async () => {
      const job = this.get(id);
      if (!job) return null;
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      await this.#write(job);
      return job;
    });
  }

  async retry(id) {
    return this.#enqueue(async () => {
      const job = this.get(id);
      if (!job) return null;
      if (!['failed', 'cancelled', 'interrupted'].includes(job.status)) {
        const error = new Error('Only failed, cancelled, or interrupted jobs can be retried.');
        error.code = 'JOB_NOT_RETRYABLE';
        throw error;
      }
      Object.assign(job, { status: 'queued', progress: 'Waiting for Codex', error: null, outputUrl: null, outputAssetId: null, cancellationRequested: false, attempt: (job.attempt || 0) + 1, updatedAt: new Date().toISOString() });
      await this.#write(job);
      return job;
    });
  }

  async #write(job) { await writeJsonAtomic(path.join(this.jobsDir, `${job.id}.json`), job); }
  #enqueue(work) {
    const next = this.writeChain.then(work, work);
    this.writeChain = next.catch(() => {});
    return next;
  }
}
