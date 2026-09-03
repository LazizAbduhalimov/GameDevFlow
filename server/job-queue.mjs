export class JobQueue {
  constructor({ store, worker, concurrency = 1 }) {
    this.store = store;
    this.worker = worker;
    this.concurrency = concurrency;
    this.pending = [];
    this.running = new Set();
  }

  enqueue(jobId) {
    if (!this.pending.includes(jobId) && !this.running.has(jobId)) this.pending.push(jobId);
    void this.#drain();
  }

  async cancel(jobId) {
    const job = this.store.get(jobId);
    if (!job) return null;
    if (job.status === 'queued') {
      this.pending = this.pending.filter((id) => id !== jobId);
      return this.store.update(jobId, { status: 'cancelled', progress: 'Cancelled before generation started.', cancellationRequested: true });
    }
    if (job.status === 'running') {
      return this.store.update(jobId, { cancellationRequested: true, progress: 'Stop after current image requested.' });
    }
    return job;
  }

  snapshot() { return { concurrency: this.concurrency, queued: [...this.pending], running: [...this.running] }; }

  async #drain() {
    while (this.running.size < this.concurrency && this.pending.length) {
      const pendingIndex = this.pending.findIndex((jobId) => {
        const job = this.store.get(jobId);
        return !job || job.status !== 'queued' || this.#canStart(job);
      });
      if (pendingIndex < 0) return;
      const [jobId] = this.pending.splice(pendingIndex, 1);
      const job = this.store.get(jobId);
      if (!job || job.status !== 'queued') continue;
      this.running.add(jobId);
      void this.#run(jobId).finally(() => {
        this.running.delete(jobId);
        void this.#drain();
      });
    }
  }

  #canStart(job) {
    if (!job.batchId) return true;
    const batchLimit = Math.max(1, Math.min(this.concurrency, Number(job.batchConcurrency) || 1));
    let activeInBatch = 0;
    for (const runningId of this.running) {
      if (this.store.get(runningId)?.batchId === job.batchId) activeInBatch += 1;
    }
    return activeInBatch < batchLimit;
  }

  async #run(jobId) {
    const job = this.store.get(jobId);
    if (!job || job.status !== 'queued') return;
    await this.store.update(jobId, { status: 'running', progress: 'Starting local Codex app-server' });
    try {
      await this.worker(this.store.get(jobId));
    } catch (error) {
      await this.store.update(jobId, { status: 'failed', progress: 'Generation failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
}
