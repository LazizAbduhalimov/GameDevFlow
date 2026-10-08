import { saveDerivedAsset, uploadImage, uploadModel } from './api';
import type { WorkflowTemplateInstance } from './workflow-templates';

type CopiedAsset = { url: string; id?: string; downloadUrl?: string; fileName?: string };
export type TemplateAssetCopier = (url: string, projectId: string, generated: boolean) => Promise<CopiedAsset>;
const isBundledAsset = (value: unknown): value is string => typeof value === 'string' && /^\/workflow-examples\/[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp|glb)$/.test(value);

/** Copies bytes into the new project's normal asset store, keeping the catalog and
 * other projects independent while retaining generation and export support. */
export async function copyTemplateAssets(instance: WorkflowTemplateInstance, projectId: string, copy: TemplateAssetCopier = copyBundledAsset): Promise<WorkflowTemplateInstance> {
  const urls = new Set<string>();
  const generatedUrls = new Set<string>();
  function collect(value: unknown) {
    if (isBundledAsset(value)) urls.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['outputUrl', 'rawOutputUrl']) if (isBundledAsset(record[key])) generatedUrls.add(record[key]);
      if (record.hasInput && isBundledAsset(record.imageUrl)) generatedUrls.add(record.imageUrl);
      Object.values(record).forEach(collect);
    }
  }
  collect(instance.nodes);
  const copied = new Map<string, CopiedAsset>();
  for (const url of urls) copied.set(url, await copy(url, projectId, generatedUrls.has(url)));
  function replace(value: unknown): unknown {
    if (typeof value === 'string') return copied.get(value)?.url || value;
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const next: Record<string, unknown> = Object.fromEntries(Object.entries(record).map(([key, child]) => [key, replace(child)]));
      const assetFor = (key: string) => typeof record[key] === 'string' ? copied.get(record[key]) : undefined;
      if (assetFor('imageUrl')?.id) next.assetId = assetFor('imageUrl')!.id;
      if (assetFor('sourceUrl')?.id) next.sourceAssetId = assetFor('sourceUrl')!.id;
      if (assetFor('outputUrl')?.id) {
        next.outputAssetId = assetFor('outputUrl')!.id;
        next.assetId = assetFor('outputUrl')!.id;
      }
      if (assetFor('rawOutputUrl')?.id) {
        next.rawOutputAssetId = assetFor('rawOutputUrl')!.id;
        next.rawAssetId = assetFor('rawOutputUrl')!.id;
      }
      if (assetFor('modelUrl')) {
        next.downloadUrl = assetFor('modelUrl')!.downloadUrl;
        next.fileName = assetFor('modelUrl')!.fileName;
      }
      return next;
    }
    return value;
  }
  return { ...instance, nodes: replace(instance.nodes) as WorkflowTemplateInstance['nodes'] };
}

async function copyBundledAsset(url: string, projectId: string, generated: boolean): Promise<CopiedAsset> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load example asset: ${url}`);
  const blob = await response.blob();
  const name = url.split('/').pop()!;
  const file = new File([blob], name, { type: blob.type });
  if (name.endsWith('.glb')) {
    const model = await uploadModel(file, projectId);
    return { url: model.modelUrl, downloadUrl: model.downloadUrl, fileName: model.fileName };
  }
  const asset = generated ? await saveDerivedAsset(blob, { name, projectId }) : await uploadImage(file, projectId);
  return { url: asset.url, id: asset.id };
}
