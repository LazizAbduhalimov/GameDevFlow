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

const IMAGE_EXTENSION = /^\.(png|jpe?g|webp|gif|bmp)$/i;

export function imageExtension(value, fallback = '.png') {
  const raw = String(value || '').toLowerCase();
  const fromValue = raw.startsWith('.') ? raw : path.extname(raw);
  if (IMAGE_EXTENSION.test(fromValue)) return fromValue;
  const fallbackExt = String(fallback || '.png').toLowerCase();
  const fromFallback = fallbackExt.startsWith('.') ? fallbackExt : `.${fallbackExt}`;
  return IMAGE_EXTENSION.test(fromFallback) ? fromFallback : '.png';
}

export function safeDownloadName(value, extension = '.png') {
  const ext = imageExtension(extension, '.png');
  const cleaned = String(value || 'frameforge-image').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 180) || 'frameforge-image';
  const currentExt = path.extname(cleaned);
  const base = IMAGE_EXTENSION.test(currentExt) ? cleaned.slice(0, -currentExt.length) : cleaned.replace(/\.+$/, '');
  return `${base || 'frameforge-image'}${ext}`;
}
