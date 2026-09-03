import { ZipArchive } from 'archiver';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { slugify } from './path-safety.mjs';

const MAX_ARCHIVE_ASSETS = 64;

export async function resolveExportAssets(assetStore, payload = {}) {
  const ids = Array.isArray(payload.assetIds) ? payload.assetIds : [];
  const urls = Array.isArray(payload.urls) ? payload.urls : [];
  const assets = new Map();

  for (const id of ids) {
    const asset = assetStore.get(String(id));
    if (asset && existsSync(assetStore.filePath(asset))) assets.set(asset.id, asset);
  }
  for (const url of urls) {
    const resolved = await assetStore.resolveDataUrl(String(url));
    if (resolved?.asset && existsSync(resolved.path)) assets.set(resolved.asset.id, resolved.asset);
  }

  if (!assets.size) {
    const error = new Error('Select at least one available asset to export.');
    error.code = 'EXPORT_EMPTY';
    throw error;
  }
  if (assets.size > MAX_ARCHIVE_ASSETS) {
    const error = new Error(`An export can contain at most ${MAX_ARCHIVE_ASSETS} assets.`);
    error.code = 'EXPORT_TOO_LARGE';
    throw error;
  }
  return [...assets.values()];
}

export async function streamAssetArchive({ response, assetStore, assets, name = 'frameforge-assets', descriptor = undefined }) {
  const archiveName = `${slugify(name, 'frameforge-assets')}.zip`;
  response.status(200);
  response.setHeader('Content-Type', 'application/zip');
  response.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);
  response.setHeader('Cache-Control', 'no-store');

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('warning', (error) => { if (error.code !== 'ENOENT') response.destroy(error); });
  archive.on('error', (error) => response.destroy(error));
  archive.pipe(response);

  const usedNames = new Set();
  const manifestAssets = assets.map((asset, index) => {
    const filename = uniqueArchiveFilename(asset, index, usedNames);
    archive.file(assetStore.filePath(asset), { name: `images/${filename}` });
    return {
      id: asset.id,
      name: asset.name,
      filename: `images/${filename}`,
      kind: asset.kind,
      mediaType: asset.mediaType,
      size: asset.size,
      sha256: asset.sha256,
      createdAt: asset.createdAt,
      metadata: asset.metadata,
    };
  });

  archive.append(JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), assets: manifestAssets }, null, 2), { name: 'manifest.json' });
  if (descriptor && typeof descriptor === 'object' && !Array.isArray(descriptor)) {
    archive.append(JSON.stringify(descriptor, null, 2), { name: 'material.json' });
  }
  await archive.finalize();
}

function uniqueArchiveFilename(asset, index, usedNames) {
  const extension = path.extname(asset.storageName).toLowerCase();
  const base = slugify(path.parse(asset.name || asset.storageName).name, `asset-${index + 1}`);
  let candidate = `${base}${extension}`;
  let suffix = 2;
  while (usedNames.has(candidate)) candidate = `${base}-${suffix++}${extension}`;
  usedNames.add(candidate);
  return candidate;
}

export { MAX_ARCHIVE_ASSETS };
