import { createContext, useContext } from 'react';
import type { ProjectDesignReference, ProjectStyleLibrary } from './types';

export const PROJECT_STYLE_IMAGE_LIMIT = 12;
export const PROJECT_STYLE_TEXT_LIMIT = 12_000;
export const EMPTY_PROJECT_STYLE_LIBRARY: ProjectStyleLibrary = { text: '', images: [] };

export function normalizeProjectStyleLibrary(value: unknown): ProjectStyleLibrary {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const candidates = Array.isArray(record.images) ? record.images : typeof record.url === 'string' ? [record] : [];
  const images: ProjectDesignReference[] = [];
  const assetIds = new Set<string>();
  const urls = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const image = candidate as Record<string, unknown>;
    const assetId = typeof image.assetId === 'string' ? image.assetId.trim().slice(0, 80) : '';
    const url = typeof image.url === 'string' ? image.url.trim().slice(0, 240) : '';
    if (!assetId || !/^\/data\/(?:assets|generated)\/[A-Za-z0-9-]+$/.test(url) || assetIds.has(assetId) || urls.has(url)) continue;
    const name = typeof image.name === 'string' ? image.name.trim().slice(0, 180) : '';
    images.push({ assetId, url, name: name || 'Style reference' });
    assetIds.add(assetId);
    urls.add(url);
    if (images.length === PROJECT_STYLE_IMAGE_LIMIT) break;
  }
  return { text: typeof record.text === 'string' ? record.text.slice(0, PROJECT_STYLE_TEXT_LIMIT) : '', images };
}

export const ProjectStyleContext = createContext<{ projectId: string; styleLibrary: ProjectStyleLibrary }>({
  projectId: 'default',
  styleLibrary: EMPTY_PROJECT_STYLE_LIBRARY,
});

export function useProjectStyle() {
  return useContext(ProjectStyleContext);
}
