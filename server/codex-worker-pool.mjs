import { CodexAppServer } from './codex-app-server.mjs';

export class CodexWorkerPool {
  constructor({ size = 2, createWorker = () => new CodexAppServer(), onDiagnostic = () => {} } = {}) {
    this.size = Math.max(1, Math.min(4, Number(size) || 1));
    this.workers = Array.from({ length: this.size }, (_, index) => {
      const worker = createWorker(index);
      worker.on?.('diagnostic', (message) => onDiagnostic(message, index));
      return worker;
    });
    this.available = this.workers.map((_, index) => index);
    this.busy = new Set();
    this.waiters = [];
  }

  async run(task) {
    const index = await this.#acquire();
    this.busy.add(index);
    try {
      return await task(this.workers[index], index);
    } finally {
      this.busy.delete(index);
      this.#release(index);
    }
  }

  snapshot() {
    return { size: this.size, started: this.workers.filter((worker) => worker.running !== false).length, busy: [...this.busy].map((index) => index + 1), available: this.available.length };
  }

  async warm(cwd) {
    return Promise.allSettled(this.workers.map((worker) => worker.start?.(cwd)));
  }

  stop() {
    for (const worker of this.workers) worker.stop?.();
  }

  #acquire() {
    const index = this.available.shift();
    if (index !== undefined) return Promise.resolve(index);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  #release(index) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(index);
    else this.available.push(index);
  }
}
