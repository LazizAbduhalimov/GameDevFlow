import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJsonAtomic } from './json-store.mjs';
import { parseAssetUrl, resolveWithin, safeDownloadName, slugify } from './path-safety.mjs';
import { detectRasterImage } from './image-validation.mjs';

export class AssetStore {
  constructor({ dataDir, assetsDir, generatedDir, metadataDir, trashDir }) {
    this.dataDir = dataDir;
    this.assetsDir = assetsDir;
    this.generatedDir = generatedDir;
    this.metadataFile = path.join(metadataDir, 'assets.json');
    this.trashDir = trashDir;
    this.assets = new Map();
    this.writeChain = Promise.resolve();
  }

  async initialize() {
    await Promise.all([mkdir(this.assetsDir, { recursive: true }), mkdir(this.generatedDir, { recursive: true }), mkdir(this.trashDir, { recursive: true })]);
    const stored = await readJson(this.metadataFile, { schemaVersion: 1, assets: [] });
    for (const asset of Array.isArray(stored.assets) ? stored.assets : []) this.assets.set(asset.id, asset);
    let migrated = false;
    for (const asset of this.assets.values()) {
      const filePath = this.filePath(asset);
      if (!asset.sha256 && !asset.deletedAt && existsSync(filePath)) {
        asset.sha256 = hash(await readFile(filePath));
        migrated = true;
      }
      if (!asset.projectId) {
        asset.projectId = 'default';
        asset.projectIds = ['default'];
        migrated = true;
      } else if (!Array.isArray(asset.projectIds) || !asset.projectIds.length) {
        asset.projectIds = [asset.projectId];
        migrated = true;
      }
    }
    const imported = (await this.#importLegacyFiles(this.assetsDir, 'source')) + (await this.#importLegacyFiles(this.generatedDir, 'generated'));
    if (imported || migrated) await this.#persist();
  }

  list({ projectId = null, includeTrashed = false, onlyTrashed = false, allProjects = false } = {}) {
    return [...this.assets.values()]
      .filter((asset) => {
        const matchesTrash = onlyTrashed ? Boolean(asset.deletedAt) : includeTrashed || !asset.deletedAt;
        if (!matchesTrash) return false;
        if (allProjects || !projectId) return true;
        const targetId = String(projectId);
        return asset.projectId === targetId || (Array.isArray(asset.projectIds) && asset.projectIds.includes(targetId));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((asset) => publicAsset(asset));
  }

  get(id, { includeTrashed = false } = {}) {
    const asset = this.assets.get(id);
    return asset && (includeTrashed || !asset.deletedAt) ? asset : null;
  }

  urlFor(asset) {
    return `/data/${asset.kind === 'generated' ? 'generated' : 'assets'}/${asset.id}`;
  }

  filePath(asset) {
    return path.join(asset.kind === 'generated' ? this.generatedDir : this.assetsDir, asset.storageName);
  }

  trashPath(asset) {
    return asset.trashName ? path.join(this.trashDir, asset.trashName) : null;
  }

  storedPath(asset) {
    return asset.deletedAt ? this.trashPath(asset) : this.filePath(asset);
  }

  async createUpload({ buffer, name, image, projectId = 'default' }) {
    const id = randomUUID();
    const storageName = `${id}${image.extension}`;
    const cleanProjId = cleanProjectId(projectId);
    const asset = createAsset({ id, kind: 'source', storageName, name, image, size: buffer.length, sha256: hash(buffer), projectId: cleanProjId, projectIds: [cleanProjId] });
    await this.#enqueue(async () => {
      await writeFile(this.filePath(asset), buffer, { flag: 'wx' });
      this.assets.set(asset.id, asset);
      await this.#persist();
    });
    return publicAsset(asset);
  }

  async createGeneratedFromFile({ temporaryPath, name, prompt, sourceAssetId, sourceAssetIds, provider, jobId, projectId = 'default', graphNodeId, slotKey, view }) {
    const buffer = await readFile(temporaryPath);
    const image = detectRasterImage(buffer);
    if (!image) throw new Error('The provider returned an unsupported or invalid raster image.');
    const id = randomUUID();
    const displayName = safeDownloadName(name || slugify(prompt, 'generated'), image.extension);
    const storageName = `${slugify(path.parse(displayName).name, 'generated')}-${id}${image.extension}`;
    const size = buffer.length;
    const cleanProjId = cleanProjectId(projectId);
    const asset = createAsset({ id, kind: 'generated', storageName, name: displayName, image, size, metadata: {
      prompt,
      provider,
      jobId,
      parentAssetIds: Array.isArray(sourceAssetIds) ? [...new Set(sourceAssetIds.filter(Boolean))] : sourceAssetId ? [sourceAssetId] : [],
      ...(graphNodeId ? { graphNodeId } : {}),
      ...(slotKey ? { slotKey } : {}),
      ...(view ? { view } : {}),
    }, sha256: hash(buffer), projectId: cleanProjId, projectIds: [cleanProjId] });
    await this.#enqueue(async () => {
      await rename(temporaryPath, this.filePath(asset));
      this.assets.set(asset.id, asset);
      await this.#persist();
    });
    return publicAsset(asset);
  }

  async createDerived({ buffer, name, metadata, projectId = 'default' }) {
    const image = detectRasterImage(buffer);
    if (!image) {
      const error = new Error('Derived assets must be valid raster images.');
      error.code = 'INVALID_RASTER_ASSET';
      throw error;
    }
    const id = randomUUID();
    const displayName = safeDownloadName(name || 'derived-image', image.extension);
    const storageName = `${slugify(path.parse(displayName).name, 'derived')}-${id}${image.extension}`;
    const cleanProjId = cleanProjectId(projectId);
    const asset = createAsset({ id, kind: 'generated', storageName, name: displayName, image, size: buffer.length, metadata: {
      ...metadata,
      derived: true,
    }, sha256: hash(buffer), projectId: cleanProjId, projectIds: [cleanProjId] });
    await this.#enqueue(async () => {
      await writeFile(this.filePath(asset), buffer, { flag: 'wx' });
      this.assets.set(asset.id, asset);
      await this.#persist();
    });
    return publicAsset(asset);
  }

  async resolveDataUrl(url) {
    const parsed = parseAssetUrl(url);
    if (parsed) {
      const asset = this.get(parsed.id);
      if (asset && asset.kind === parsed.kind && existsSync(this.filePath(asset))) return { asset, path: this.filePath(asset) };
      return null;
    }
    return this.#resolveLegacyUrl(url);
  }

  async trashByUrl(url) {
    const resolved = await this.resolveDataUrl(url);
    if (!resolved?.asset) {
      const error = new Error('Only tracked Consept assets can be moved to trash.');
      error.code = 'ASSET_NOT_FOUND';
      throw error;
    }
    return this.trash(resolved.asset.id);
  }

  async trash(id) {
    return this.#enqueue(async () => {
      const asset = this.get(id);
      if (!asset) {
        const error = new Error('Asset not found.');
        error.code = 'ASSET_NOT_FOUND';
        throw error;
      }
      const sourcePath = this.filePath(asset);
      const trashName = `${asset.id}-${asset.storageName}`;
      if (existsSync(sourcePath)) await rename(sourcePath, path.join(this.trashDir, trashName));
      asset.deletedAt = new Date().toISOString();
      asset.trashName = trashName;
      await this.#persist();
      return publicAsset(asset);
    });
  }

  async restore(id) {
    return this.#enqueue(async () => {
      const asset = this.get(id, { includeTrashed: true });
      if (!asset?.deletedAt) {
        const error = new Error('Trashed asset not found.');
        error.code = 'ASSET_NOT_FOUND';
        throw error;
      }
      const sourcePath = this.trashPath(asset);
      const targetPath = this.filePath(asset);
      if (!sourcePath || !existsSync(sourcePath)) {
        const error = new Error('The trashed file is missing from local storage.');
        error.code = 'ASSET_FILE_MISSING';
        throw error;
      }
      if (existsSync(targetPath)) {
        const error = new Error('The original asset path is already occupied.');
        error.code = 'ASSET_CONFLICT';
        throw error;
      }
      await rename(sourcePath, targetPath);
      delete asset.deletedAt;
      delete asset.trashName;
      asset.restoredAt = new Date().toISOString();
      await this.#persist();
      return publicAsset(asset);
    });
  }

  async purge(id) {
    return this.#enqueue(async () => {
      const asset = this.get(id, { includeTrashed: true });
      if (!asset?.deletedAt) {
        const error = new Error('Only trashed assets can be permanently deleted.');
        error.code = 'ASSET_NOT_FOUND';
        throw error;
      }
      const sourcePath = this.trashPath(asset);
      if (sourcePath && existsSync(sourcePath)) await unlink(sourcePath);
      this.assets.delete(asset.id);
      await this.#persist();
      return { id: asset.id, name: asset.name };
    });
  }

  async #resolveLegacyUrl(url) {
    const match = /^\/data\/(assets|generated)\/([^/?#]+)$/.exec(String(url));
    if (!match) return null;
    const kind = match[1] === 'generated' ? 'generated' : 'source';
    const filename = decodeURIComponent(match[2]);
    const root = kind === 'generated' ? this.generatedDir : this.assetsDir;
    const candidate = resolveWithin(root, filename);
    if (!candidate || !existsSync(candidate)) return null;
    const asset = [...this.assets.values()].find((item) => !item.deletedAt && item.kind === kind && item.storageName === filename);
    return { asset: asset || null, path: candidate };
  }

  async #importLegacyFiles(directory, kind) {
    let imported = 0;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith('.') || [...this.assets.values()].some((asset) => asset.storageName === entry.name && asset.kind === kind)) continue;
      const filePath = resolveWithin(directory, entry.name);
      if (!filePath) continue;
      const buffer = await readFile(filePath);
      const image = detectRasterImage(buffer);
      if (!image) continue;
      const asset = createAsset({
        id: randomUUID(),
        kind,
        storageName: entry.name,
        name: entry.name,
        image,
        size: buffer.length,
        sha256: hash(buffer),
        metadata: { legacyImported: true },
      });
      this.assets.set(asset.id, asset);
      imported += 1;
    }
    return imported;
  }

  async #persist() {
    await writeJsonAtomic(this.metadataFile, { schemaVersion: 1, assets: [...this.assets.values()] });
  }

  #enqueue(work) {
    const next = this.writeChain.then(work, work);
    this.writeChain = next.catch(() => {});
    return next;
  }
}

function createAsset({ id, kind, storageName, name, image, size, metadata = {}, sha256 = null, projectId = 'default', projectIds = ['default'] }) {
  const cleanId = cleanProjectId(projectId);
  return {
    id,
    name: String(name || storageName).slice(0, 180),
    kind,
    storageName,
    mediaType: image.mediaType,
    size,
    sha256,
    projectId: cleanId,
    projectIds: Array.isArray(projectIds) && projectIds.length ? projectIds.map(cleanProjectId) : [cleanId],
    createdAt: new Date().toISOString(),
    metadata,
  };
}

function publicAsset(asset) {
  const cleanId = cleanProjectId(asset.projectId);
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    url: `/data/${asset.kind === 'generated' ? 'generated' : 'assets'}/${asset.id}`,
    projectId: cleanId,
    projectIds: Array.isArray(asset.projectIds) && asset.projectIds.length ? asset.projectIds.map(cleanProjectId) : [cleanId],
    size: asset.size,
    createdAt: asset.createdAt,
    sha256: asset.sha256,
    metadata: asset.metadata,
    deletedAt: asset.deletedAt || null,
    restoredAt: asset.restoredAt || null,
    thumbnailUrl: `/api/assets/${asset.id}/preview`,
  };
}

function cleanProjectId(value) {
  if (typeof value === 'string' && /^[a-z0-9][a-z0-9-_]{0,63}$/i.test(value.trim())) {
    return value.trim();
  }
  return 'default';
}

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
