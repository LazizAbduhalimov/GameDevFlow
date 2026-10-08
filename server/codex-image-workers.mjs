import { CodexAppServer } from './codex-app-server.mjs';

// Each image owns a process, independent of the shared analysis pool.
export class CodexImageWorkers {
  constructor({ createWorker = () => new CodexAppServer(), onDiagnostic = () => {} } = {}) {
    this.createWorker = createWorker;
    this.onDiagnostic = onDiagnostic;
    this.workers = new Map();
  }

  async run(jobId, task) {
    if (this.workers.has(jobId)) throw new Error('This image already has an active worker.');
    const worker = this.createWorker(jobId);
    worker.on?.('diagnostic', (message) => this.onDiagnostic(message, jobId));
    this.workers.set(jobId, worker);
    try {
      return await task(worker);
    } finally {
      try { worker.stop?.(); }
      finally { this.workers.delete(jobId); }
    }
  }

  snapshot() { return { mode: 'per-image', active: this.workers.size, jobIds: [...this.workers.keys()] }; }

  stop() { for (const worker of this.workers.values()) worker.stop?.(); }
}
