import { existsSync } from 'node:fs';

export const MAX_PROJECT_STYLE_IMAGES = 12;
export const MAX_PROJECT_STYLE_TEXT = 12_000;

export function normalizeProjectStyleLibrary(value) {
  const text = typeof value?.text === 'string' ? value.text.slice(0, MAX_PROJECT_STYLE_TEXT) : '';
  const images = [];
  const seenIds = new Set();
  const seenUrls = new Set();
  const candidates = Array.isArray(value?.images) ? value.images : value?.assetId ? [value] : [];
  for (const candidate of candidates) {
    const assetId = typeof candidate?.assetId === 'string' ? candidate.assetId.trim().slice(0, 80) : '';
    const url = typeof candidate?.url === 'string' ? candidate.url.trim().slice(0, 240) : '';
    if (!assetId || !/^\/data\/(assets|generated)\/[A-Za-z0-9-]+$/.test(url)) continue;
    if (seenIds.has(assetId) || seenUrls.has(url)) continue;
    seenIds.add(assetId);
    seenUrls.add(url);
    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 180) : '';
    images.push({ assetId, url, name: name || 'Style reference' });
  }
  if (images.length > MAX_PROJECT_STYLE_IMAGES) {
    throw styleError('PROJECT_STYLE_REFERENCE_LIMIT', `A project style library can contain up to ${MAX_PROJECT_STYLE_IMAGES} images.`);
  }
  return { text, images };
}

export function assetBelongsToProject(asset, projectId) {
  return Boolean(asset && (asset.projectId === projectId || (Array.isArray(asset.projectIds) && asset.projectIds.includes(projectId))));
}

export function resolveProjectStyle(project, assetStore, projectId = project?.id || 'default') {
  const library = normalizeProjectStyleLibrary(project?.styleLibrary);
  const sources = library.images.map((reference) => {
    const asset = assetStore.get(reference.assetId);
    const filePath = asset && assetStore.filePath(asset);
    if (!asset || asset.deletedAt || !assetBelongsToProject(asset, projectId) || assetStore.urlFor(asset) !== reference.url || !filePath || !existsSync(filePath)) {
      throw styleError('PROJECT_STYLE_REFERENCE_UNAVAILABLE', `Project style image “${reference.name}” is unavailable in this project. Replace or remove it from the style library.`);
    }
    return { assetId: asset.id, url: assetStore.urlFor(asset), path: filePath, name: reference.name };
  });
  return { text: library.text.trim(), sources };
}

// Keep primary sources in their original positions. Style references are appended
// only when they are not already attached, and their exact positions are explicit.
export function withProjectStyle(sources, style, maxReferences = 16) {
  const merged = [];
  for (const source of [...sources, ...(style?.sources || [])]) {
    if (!merged.some((candidate) => sameSource(candidate, source))) merged.push(source);
  }
  if (merged.length > maxReferences) {
    throw styleError('PROJECT_STYLE_REFERENCE_LIMIT', `The selected inputs and project style library exceed the ${maxReferences}-image limit. Remove input images or style references.`);
  }
  const styleIndexes = (style?.sources || []).map((source) => merged.findIndex((candidate) => sameSource(candidate, source)) + 1);
  const instructions = [
    style?.text || styleIndexes.length ? 'Project style library (applies automatically to every task in this project):' : '',
    style?.text ? `Style direction: ${style.text}` : '',
    styleIndexes.length ? `Attached image positions ${styleIndexes.join(', ')} are project style references. Use their visual language, palette, materials, shapes, typography and finish as style guidance. They are not additional subjects, source sheets, character views, items to detect, or content to copy unless the user explicitly requests that content.` : '',
    style?.text || styleIndexes.length ? 'Apply this style while respecting the requested subject, task, exact text, layout and output requirements.' : '',
  ].filter(Boolean).join('\n');
  return { sources: merged, instructions };
}

export function projectStyleModelContext(style, primarySources = [], maxReferences = 16) {
  const applied = withProjectStyle(primarySources, style, maxReferences);
  const primaryPaths = new Set(primarySources.map((source) => source.path));
  return {
    instructions: applied.instructions,
    imagePaths: applied.sources.filter((source) => !primaryPaths.has(source.path)).map((source) => source.path),
  };
}

function sameSource(left, right) {
  return Boolean((left.assetId && left.assetId === right.assetId) || (left.url && left.url === right.url) || (left.path && left.path === right.path));
}

function styleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
