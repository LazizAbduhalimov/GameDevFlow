import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { readJson, writeJsonAtomic } from './json-store.mjs';

const DEFAULT_PROJECT_ID = 'default';
const PROJECT_ID = /^(default|[a-f0-9-]{36})$/;

export class ProjectStore {
  constructor(projectsDir) {
    this.projectsDir = projectsDir;
    this.trashDir = path.join(projectsDir, '.trash');
    this.writeChain = Promise.resolve();
  }

  filePath(projectId = DEFAULT_PROJECT_ID) {
    return path.join(this.projectsDir, validateProjectId(projectId), 'project.json');
  }

  async list() {
    await mkdir(this.projectsDir, { recursive: true });
    const projects = [];
    for (const entry of await readdir(this.projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || !PROJECT_ID.test(entry.name)) continue;
      const project = await readJson(this.filePath(entry.name), null);
      if (project?.id === entry.name) projects.push(projectSummary(project));
    }
    if (!projects.some((project) => project.id === DEFAULT_PROJECT_ID)) {
      const project = await this.getDefault();
      projects.push(projectSummary(project));
    }
    return projects.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  }

  async get(projectId = DEFAULT_PROJECT_ID) {
    const id = validateProjectId(projectId);
    const saved = await readJson(this.filePath(id), null);
    if (saved) return saved;
    if (id === DEFAULT_PROJECT_ID) return this.#ensureDefault();
    const error = new Error('Project not found.');
    error.code = 'PROJECT_NOT_FOUND';
    throw error;
  }

  async getDefault() { return this.get(DEFAULT_PROJECT_ID); }

  async create(input = {}) {
    return this.#enqueue(async () => {
      const id = randomUUID();
      const project = createProject(id, cleanName(input?.name, 'Untitled project'));
      await writeJsonAtomic(this.filePath(id), project);
      return project;
    });
  }

  async save(projectId, input) {
    const id = validateProjectId(projectId);
    return this.#enqueue(async () => {
      const current = await this.#readForWrite(id);
      const expectedRevision = Number(input?.revision);
      if (!Number.isInteger(expectedRevision) || expectedRevision !== current.revision) {
        const error = new Error('Project revision conflict. Reload the project before saving.');
        error.code = 'REVISION_CONFLICT';
        error.current = current;
        throw error;
      }
      const project = {
        schemaVersion: 1,
        id,
        name: cleanName(input?.name, current.name),
        revision: current.revision + 1,
        nodes: Array.isArray(input?.nodes) ? input.nodes : [],
        edges: Array.isArray(input?.edges) ? input.edges : [],
        viewport: validViewport(input?.viewport) ? input.viewport : current.viewport,
        createdAt: current.createdAt || current.updatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await writeJsonAtomic(this.filePath(id), project);
      return project;
    });
  }

  async saveDefault(input) { return this.save(DEFAULT_PROJECT_ID, input); }

  async duplicate(projectId, name) {
    const id = validateProjectId(projectId);
    return this.#enqueue(async () => {
      const source = await this.#readForWrite(id);
      const copy = createProject(randomUUID(), cleanName(name, `${source.name} copy`));
      copy.nodes = JSON.parse(JSON.stringify(source.nodes || []));
      copy.edges = JSON.parse(JSON.stringify(source.edges || []));
      copy.viewport = validViewport(source.viewport) ? { ...source.viewport } : copy.viewport;
      await writeJsonAtomic(this.filePath(copy.id), copy);
      return copy;
    });
  }

  async delete(projectId) {
    const id = validateProjectId(projectId);
    if (id === DEFAULT_PROJECT_ID) {
      const error = new Error('The original project is protected and cannot be deleted.');
      error.code = 'CANNOT_DELETE_DEFAULT_PROJECT';
      throw error;
    }
    return this.#enqueue(async () => {
      const project = await this.#readForWrite(id);
      await mkdir(this.trashDir, { recursive: true });
      await rename(path.dirname(this.filePath(id)), path.join(this.trashDir, `${id}-${Date.now()}`));
      return projectSummary(project);
    });
  }

  async #ensureDefault() {
    return this.#enqueue(async () => {
      const saved = await readJson(this.filePath(), null);
      if (saved) return saved;
      const project = createProject(DEFAULT_PROJECT_ID, 'Untitled pipeline');
      await writeJsonAtomic(this.filePath(), project);
      return project;
    });
  }

  async #readForWrite(id) {
    const saved = await readJson(this.filePath(id), null);
    if (saved) return saved;
    if (id === DEFAULT_PROJECT_ID) {
      const project = createProject(DEFAULT_PROJECT_ID, 'Untitled pipeline');
      await writeJsonAtomic(this.filePath(), project);
      return project;
    }
    const error = new Error('Project not found.');
    error.code = 'PROJECT_NOT_FOUND';
    throw error;
  }

  #enqueue(work) {
    const next = this.writeChain.then(work, work);
    this.writeChain = next.catch(() => {});
    return next;
  }
}

function createProject(id, name) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id,
    name,
    revision: 0,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

function projectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    revision: project.revision,
    nodeCount: Array.isArray(project.nodes) ? project.nodes.length : 0,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt || project.updatedAt,
  };
}

function validateProjectId(value) {
  const id = String(value || '');
  if (!PROJECT_ID.test(id)) {
    const error = new Error('Invalid project id.');
    error.code = 'INVALID_PROJECT_ID';
    throw error;
  }
  return id;
}

function cleanName(value, fallback) {
  const name = typeof value === 'string' ? value.trim().slice(0, 100) : '';
  return name || fallback;
}

function validViewport(value) {
  return value && ['x', 'y', 'zoom'].every((key) => Number.isFinite(value[key]));
}
