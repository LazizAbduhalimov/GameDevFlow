import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJson, writeJsonAtomic } from './json-store.mjs';

const DEFAULT_PROJECT_ID = 'default';

export class ProjectStore {
  constructor(projectsDir) {
    this.projectsDir = projectsDir;
    this.writeChain = Promise.resolve();
  }

  filePath(projectId = DEFAULT_PROJECT_ID) {
    return path.join(this.projectsDir, projectId, 'project.json');
  }

  async getDefault() {
    const saved = await readJson(this.filePath(), null);
    return saved || createDefaultProject();
  }

  async saveDefault(input) {
    return this.#enqueue(async () => {
      const current = await this.getDefault();
      const expectedRevision = Number(input?.revision);
      if (!Number.isInteger(expectedRevision) || expectedRevision !== current.revision) {
        const error = new Error('Project revision conflict. Reload the project before saving.');
        error.code = 'REVISION_CONFLICT';
        error.current = current;
        throw error;
      }
      const project = {
        schemaVersion: 1,
        id: DEFAULT_PROJECT_ID,
        name: cleanName(input?.name, current.name),
        revision: current.revision + 1,
        nodes: Array.isArray(input?.nodes) ? input.nodes : [],
        edges: Array.isArray(input?.edges) ? input.edges : [],
        viewport: validViewport(input?.viewport) ? input.viewport : current.viewport,
        updatedAt: new Date().toISOString(),
      };
      await writeJsonAtomic(this.filePath(), project);
      return project;
    });
  }

  #enqueue(work) {
    const next = this.writeChain.then(work, work);
    this.writeChain = next.catch(() => {});
    return next;
  }
}

function createDefaultProject() {
  return {
    schemaVersion: 1,
    id: DEFAULT_PROJECT_ID,
    name: 'Untitled pipeline',
    revision: 0,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date().toISOString(),
  };
}

function cleanName(value, fallback) {
  const name = typeof value === 'string' ? value.trim().slice(0, 100) : '';
  return name || fallback;
}

function validViewport(value) {
  return value && ['x', 'y', 'zoom'].every((key) => Number.isFinite(value[key]));
}
