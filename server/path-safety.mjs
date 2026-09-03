import path from 'node:path';

const ASSET_ID = /^[a-z0-9][a-z0-9-]{0,80}$/i;

export function isSafeAssetId(value) {
  return typeof value === 'string' && ASSET_ID.test(value);
}

export function resolveWithin(rootDir, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.includes('\0')) return null;
  const resolved = path.resolve(rootDir, relativePath);
  const prefix = `${path.resolve(rootDir)}${path.sep}`;
  return resolved.startsWith(prefix) ? resolved : null;
}

export function parseAssetUrl(url) {
  if (typeof url !== 'string') return null;
  const match = /^\/data\/(assets|generated)\/([A-Za-z0-9-]+)$/.exec(url);
  if (!match || !isSafeAssetId(match[2])) return null;
  return { kind: match[1] === 'assets' ? 'source' : 'generated', id: match[2] };
}

export function slugify(value, fallback = 'image') {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}
