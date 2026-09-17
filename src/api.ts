import type { AssetRecord, CodexStatus, FrameforgeProject, GenerationJob, ProjectSummary, ProviderId, ProviderStatus, SmartSeparationGroup, SmartSeparationItem, SmartSeparationProgress, SmartSeparationSource, TripoModelEvent } from './types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function getCodexStatus(): Promise<CodexStatus> {
  return request('/api/codex/status');
}

export async function connectCodex(): Promise<{ ok: boolean; message: string }> {
  return request('/api/codex/connect', { method: 'POST' });
}

export async function openImageInTripo(url: string, sourceNodeId: string, signal?: AbortSignal): Promise<{ ok: boolean; browser: string; url: string; fileName: string; watcherId: string }> {
  return request('/api/integrations/tripo/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, sourceNodeId }),
    signal,
  });
}

export async function openCharacterViewsInTripo(
  views: Record<'front' | 'left' | 'back' | 'right', string>,
  sourceNodeId: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; browser: string; url: string; fileNames: Record<string, string>; watcherId: string }> {
  return request('/api/integrations/tripo/open-multiview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ views, sourceNodeId }),
    signal,
  });
}

export function subscribeToTripoEvents(onEvent: (event: TripoModelEvent) => void, onConnectionError?: () => void): () => void {
  const source = new EventSource('/api/integrations/tripo/events');
  source.onmessage = (message) => {
    try { onEvent(JSON.parse(message.data) as TripoModelEvent); }
    catch { /* Ignore malformed bridge diagnostics and keep the stream alive. */ }
  };
  source.onerror = () => onConnectionError?.();
  return () => source.close();
}

export async function recoverTripoModel(sourceNodeId: string | null | undefined, watcherId: string, signal?: AbortSignal): Promise<{ ok: boolean; watcherId: string; taskId?: string; recovered: boolean; event?: TripoModelEvent | null }> {
  return request('/api/integrations/tripo/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceNodeId, watcherId }),
    signal,
  });
}

export async function enhanceImagePrompt(
  prompt: string,
  context: 'image-generation' | 'multi-variation' | 'character-consistency',
  signal?: AbortSignal,
): Promise<{ prompt: string }> {
  return request('/api/prompts/enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, context }),
    signal,
  });
}

export async function analyzeSmartSeparation(
  sourceUrls: string[],
  options: { projectId: string; userHint?: string; onProgress?: (progress: SmartSeparationProgress) => void },
): Promise<{ analysisId: string; sources: SmartSeparationSource[]; items: SmartSeparationItem[]; groups: SmartSeparationGroup[]; warnings: string[] }> {
  const requestId = crypto.randomUUID();
  let stopped = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    try {
      const progress = await request<SmartSeparationProgress>(`/api/smart-separation/progress/${requestId}`);
      if (!stopped) options.onProgress?.(progress);
    } catch { /* The POST may not have registered its progress record yet. */ }
    if (!stopped) pollTimer = setTimeout(() => void poll(), 700);
  };
  const analysisRequest = request<{
    analysisId: string;
    sources: SmartSeparationSource[];
    items: SmartSeparationItem[];
    groups: SmartSeparationGroup[];
    warnings: string[];
  }>('/api/smart-separation/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, sourceUrls, projectId: options.projectId, userHint: options.userHint || '' }),
  });
  pollTimer = setTimeout(() => void poll(), 250);
  try {
    return await analysisRequest;
  } finally {
    stopped = true;
    if (pollTimer) clearTimeout(pollTimer);
  }
}

export async function getProviders(): Promise<ProviderStatus[]> {
  const payload = await request<ProviderStatus[] | { providers: ProviderStatus[] }>('/api/providers');
  return Array.isArray(payload) ? payload : payload.providers;
}

export async function uploadImage(file: File, projectId: string): Promise<AssetRecord> {
  const body = new FormData();
  body.append('image', file);
  body.append('projectId', projectId);
  return request('/api/assets', { method: 'POST', body });
}

export async function saveDerivedAsset(
  blob: Blob,
  options: { name: string; projectId: string; parentAssetIds?: string[]; assetRole?: string; manifest?: Record<string, unknown> },
): Promise<AssetRecord> {
  const body = new FormData();
  body.append('image', blob, options.name);
  body.append('name', options.name);
  body.append('projectId', options.projectId);
  body.append('parentAssetIds', JSON.stringify(options.parentAssetIds || []));
  body.append('assetRole', options.assetRole || 'derived');
  if (options.manifest) {
    body.append('manifest', JSON.stringify(options.manifest));
    body.append('atlas', JSON.stringify(options.manifest.grid || {}));
  }
  return request('/api/assets/derived', { method: 'POST', body });
}

export async function getAssets(options: { projectId?: string; includeTrashed?: boolean; onlyTrashed?: boolean } = {}): Promise<AssetRecord[]> {
  const query = new URLSearchParams();
  if (options.projectId) query.set('projectId', options.projectId);
  if (options.includeTrashed) query.set('includeTrashed', 'true');
  if (options.onlyTrashed) query.set('onlyTrashed', 'true');
  const payload = await request<AssetRecord[] | { assets: AssetRecord[] }>(`/api/assets${query.size ? `?${query}` : ''}`);
  return Array.isArray(payload) ? payload : payload.assets;
}

export async function trashAsset(url: string): Promise<{ ok: boolean }> {
  return request('/api/assets/trash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

export async function restoreAsset(assetId: string): Promise<{ ok: boolean; asset: AssetRecord }> {
  return request(`/api/assets/${encodeURIComponent(assetId)}/restore`, { method: 'POST' });
}

export async function purgeAsset(assetId: string): Promise<{ ok: boolean; asset: { id: string; name: string } }> {
  return request(`/api/assets/${encodeURIComponent(assetId)}/permanent`, { method: 'DELETE' });
}

export async function exportAssetArchive(options: { assetIds?: string[]; urls?: string[]; name?: string; manifest?: Record<string, unknown> }): Promise<void> {
  try {
    const response = await fetch('/api/exports/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new ApiError(payload.message || `Archive export failed with status ${response.status}`, response.status);
    }
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || 'frameforge-assets.zip';
    saveLocalBlob(await response.blob(), filename);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Local Frameforge backend is unavailable.', 0, 'NETWORK_ERROR');
  }
}

export function saveLocalBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function getProjects(): Promise<ProjectSummary[]> {
  return request('/api/projects');
}

export async function createProject(name: string): Promise<FrameforgeProject> {
  return request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function duplicateProject(projectId: string, name?: string): Promise<FrameforgeProject> {
  return request(`/api/projects/${encodeURIComponent(projectId)}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function deleteProject(projectId: string): Promise<ProjectSummary> {
  return request(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
}

export async function getProject(projectId = 'default'): Promise<FrameforgeProject> {
  return request(`/api/projects/${encodeURIComponent(projectId)}`);
}

export async function saveProject(projectId: string, project: Omit<FrameforgeProject, 'updatedAt' | 'createdAt'>): Promise<FrameforgeProject> {
  return request(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
}

export async function startGeneration(
  source: string | string[],
  prompt: string,
  options: { provider?: ProviderId; outputName?: string; view?: string; projectId?: string } = {},
): Promise<{ jobId: string }> {
  const sourceUrls = Array.isArray(source) ? source : [source];
  return request('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl: sourceUrls[0], sourceUrls, prompt, ...options }),
  });
}

export async function startGenerationBatch(
  sourceUrl: string,
  views: Array<{ key: string; prompt: string; outputName: string }>,
  options: { provider?: ProviderId; concurrency?: 1 | 2 | 3 | 4; projectId?: string } = {},
): Promise<{ batchId: string; jobs: Array<{ id: string; viewKey: string; status: string }> }> {
  return request('/api/batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl, views, ...options }),
  });
}

export async function startSlotBatch(
  sourceUrls: string[],
  slots: Array<{ key: string; prompt: string; outputName: string }>,
  options: { provider?: ProviderId; kind?: string; concurrency?: 1 | 2 | 3 | 4; projectId?: string } = {},
): Promise<{ batchId: string; jobs: Array<{ id: string; slotKey: string; slotIndex: number; status: string }> }> {
  return request('/api/batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl: sourceUrls[0], sourceUrls, slots, kind: options.kind || 'variants', provider: options.provider, concurrency: options.concurrency, projectId: options.projectId }),
  });
}

export async function getGenerationJob(jobId: string): Promise<GenerationJob> {
  return request(`/api/jobs/${jobId}`);
}

export async function getJobs(projectId?: string): Promise<GenerationJob[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const payload = await request<GenerationJob[] | { jobs: GenerationJob[] }>(`/api/jobs${query}`);
  return Array.isArray(payload) ? payload : payload.jobs;
}

export async function cancelJob(jobId: string): Promise<GenerationJob> {
  return request(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
}

export async function retryJob(jobId: string): Promise<GenerationJob> {
  return request(`/api/jobs/${jobId}/retry`, { method: 'POST' });
}

export function generatedImageDownloadUrl(url: string): string {
  return `/api/files/download?url=${encodeURIComponent(url)}`;
}

export async function deleteGeneratedImage(url: string): Promise<{ ok: boolean }> {
  return trashAsset(url);
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(payload.message || `Request failed with status ${response.status}`, response.status, payload.code);
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Local Frameforge backend is unavailable.', 0, 'NETWORK_ERROR');
  }
}
