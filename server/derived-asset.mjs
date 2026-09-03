const MAX_METADATA_BYTES = 128 * 1024;
const MAX_PARENT_ASSETS = 64;

export function parseDerivedAssetMetadata(fields = {}) {
  const metadata = {
    parentAssetIds: parseParentAssetIds(fields.parentAssetIds),
    assetRole: parseAssetRole(fields.assetRole),
  };
  const atlas = parseJsonField(fields.atlas, 'atlas');
  const manifest = parseJsonField(fields.manifest, 'manifest');
  if (atlas !== undefined) metadata.atlas = atlas;
  if (manifest !== undefined) metadata.manifest = manifest;
  return metadata;
}

function parseParentAssetIds(value) {
  const parsed = parseJsonField(value, 'parentAssetIds', []);
  if (!Array.isArray(parsed)) throw metadataError('parentAssetIds must be a JSON array.');
  if (parsed.length > MAX_PARENT_ASSETS) throw metadataError(`parentAssetIds may contain at most ${MAX_PARENT_ASSETS} items.`);
  const ids = parsed.map((id) => typeof id === 'string' ? id.trim().slice(0, 128) : '').filter(Boolean);
  if (ids.length !== parsed.length) throw metadataError('parentAssetIds must contain only non-empty strings.');
  return [...new Set(ids)];
}

function parseAssetRole(value) {
  if (value === undefined || value === null || value === '') return 'derived';
  if (typeof value !== 'string') throw metadataError('assetRole must be a string.');
  const role = value.trim().slice(0, 64);
  if (!role) throw metadataError('assetRole must not be empty.');
  return role;
}

function parseJsonField(value, name, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') throw metadataError(`${name} must be JSON text.`);
  if (Buffer.byteLength(value, 'utf8') > MAX_METADATA_BYTES) throw metadataError(`${name} is too large.`);
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object') throw metadataError(`${name} must be a JSON object or array.`);
    return parsed;
  } catch (error) {
    if (error?.code === 'DERIVED_METADATA_INVALID') throw error;
    throw metadataError(`${name} must be valid JSON.`);
  }
}

function metadataError(message) {
  const error = new Error(message);
  error.code = 'DERIVED_METADATA_INVALID';
  return error;
}
