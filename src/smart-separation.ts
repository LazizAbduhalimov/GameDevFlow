import { buildRelativeAtlas, buildSpriteAtlas, type AtlasBuildResult } from './atlas';
import type { SmartSeparationBounds, SmartSeparationItem, SmartSeparationSettings } from './types';

export type SmartSpriteBuild = {
  blob: Blob;
  previewUrl: string;
  manifest: Record<string, unknown>;
};

const ALPHA_THRESHOLD = 8;
const MIN_TRANSPARENT_INSET = 2;
const MIN_ATLAS_TRANSPARENT_RATIO = 0.025;
const FULL_IMAGE_BOUNDS: SmartSeparationBounds = { x: 0, y: 0, width: 1000, height: 1000 };

export function smartSeparationRegenerationPrompt(item: SmartSeparationItem, sourceName = 'the attached source sheet') {
  const left = (item.bounds.x / 10).toFixed(1);
  const top = (item.bounds.y / 10).toFixed(1);
  const right = ((item.bounds.x + item.bounds.width) / 10).toFixed(1);
  const bottom = ((item.bounds.y + item.bounds.height) / 10).toFixed(1);
  return [
    'Recreate exactly ONE standalone production-ready 2D UI asset from the attached source sheet.',
    `Target asset: ${item.name}.`,
    `Role: ${item.role || 'UI element'}.`,
    item.description ? `Visual description: ${item.description}.` : '',
    `The target is in ${sourceName}, approximately inside left ${left}%, top ${top}%, right ${right}%, bottom ${bottom}%. Use these coordinates only to identify the intended element.`,
    'Redraw the complete target as a clean isolated asset. Do not paste or preserve a rectangular crop of the source sheet.',
    'Preserve its silhouette, composition, palette, line work, texture, typography and all intentional decorations. Copy every visible word and symbol exactly; do not rewrite, translate or invent text.',
    'Remove every neighboring panel, overlapping object, page background, guide, label and fragment that is not part of this target.',
    'Output exactly one tightly framed PNG with real alpha transparency around the complete asset. No background, scene, canvas color, checkerboard, contact sheet, mockup, shadow from neighboring objects or extra option.',
  ].filter(Boolean).join('\n');
}

export async function cropAndCleanSprite(
  sourceUrl: string,
  bounds: SmartSeparationBounds,
  settings: Pick<SmartSeparationSettings, 'tolerance' | 'cropPadding' | 'pixelArt'>,
): Promise<SmartSpriteBuild> {
  const image = await loadImage(sourceUrl);
  const source = normalizedToPixels(bounds, image.naturalWidth, image.naturalHeight, settings.cropPadding);
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas pixel processing is unavailable.');
  context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
  const pixels = context.getImageData(0, 0, source.width, source.height);
  const cleanup = removeEdgeConnectedBackground(pixels.data, source.width, source.height, settings.tolerance, settings.pixelArt);
  context.putImageData(pixels, 0, 0);
  const trimmed = trimAlphaBounds(pixels.data, source.width, source.height);
  if (!trimmed) throw new Error('Background cleanup removed every visible pixel. Lower the tolerance or adjust the frame.');

  const requestedInset = Math.round(Math.min(trimmed.width, trimmed.height) * Math.max(0, Math.min(20, settings.cropPadding)) / 100);
  const transparentInset = Math.max(requestedInset, atlasSafeTransparentInset(trimmed.width, trimmed.height));
  const output = document.createElement('canvas');
  output.width = trimmed.width + transparentInset * 2;
  output.height = trimmed.height + transparentInset * 2;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('Canvas rendering is unavailable.');
  outputContext.imageSmoothingEnabled = !settings.pixelArt;
  outputContext.drawImage(canvas, trimmed.x, trimmed.y, trimmed.width, trimmed.height, transparentInset, transparentInset, trimmed.width, trimmed.height);
  const blob = await canvasBlob(output);
  return {
    blob,
    previewUrl: output.toDataURL('image/png'),
    manifest: {
      schemaVersion: 1,
      transparent: true,
      sourceUrl,
      normalizedBounds: bounds,
      sourcePixelBounds: source,
      trimmedBounds: trimmed,
      transparentInset,
      contentBounds: { x: transparentInset, y: transparentInset, width: trimmed.width, height: trimmed.height },
      outputSize: { width: output.width, height: output.height },
      cleanup: { method: 'edge-connected-palette', tolerance: settings.tolerance, pixelArt: settings.pixelArt, removedPixels: cleanup.removedPixels, backgroundColors: cleanup.backgroundPalette.length },
    },
  };
}

export function normalizeGeneratedSmartSprite(
  generatedUrl: string,
  settings: Pick<SmartSeparationSettings, 'tolerance' | 'cropPadding' | 'pixelArt'>,
) {
  return cropAndCleanSprite(generatedUrl, FULL_IMAGE_BOUNDS, settings);
}

function atlasSafeTransparentInset(width: number, height: number) {
  let inset = MIN_TRANSPARENT_INSET;
  const contentArea = width * height;
  while (1 - contentArea / ((width + inset * 2) * (height + inset * 2)) < MIN_ATLAS_TRANSPARENT_RATIO) inset += 1;
  return inset;
}

export async function buildSmartGroupAtlas(
  items: SmartSeparationItem[],
  settings: SmartSeparationSettings,
): Promise<AtlasBuildResult> {
  const ready = items.filter((item) => item.enabled && item.outputUrl);
  const result = settings.packingMode === 'relative'
    ? await buildRelativeAtlas(ready.map((item) => item.outputUrl!), { canvasSize: settings.atlasSize, padding: settings.atlasPadding, outerMargin: settings.atlasPadding, pixelArt: settings.pixelArt })
    : await buildSpriteAtlas(ready.map((item) => item.outputUrl!), { cellSize: settings.cellSize, gutter: settings.atlasPadding, outerMargin: settings.atlasPadding, columns: 'auto', safeArea: 0.86, pixelArt: settings.pixelArt, powerOfTwo: false });
  if (result.manifest && Array.isArray(result.manifest.frames)) {
    result.manifest.frames = result.manifest.frames.map((frame, index) => ({
      ...(frame as Record<string, unknown>),
      id: ready[index]?.id || `sprite-${index + 1}`,
      name: ready[index]?.name || `Sprite ${index + 1}`,
      sourceAssetId: ready[index]?.outputAssetId,
      sourceBounds: ready[index]?.bounds,
      sourceIndex: ready[index]?.sourceIndex,
    }));
  }
  return result;
}

export function removeEdgeConnectedBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
  pixelArt: boolean,
) {
  const backgroundPalette = perimeterBackgroundPalette(data, width, height);
  const background = backgroundPalette[0] || { r: 0, g: 0, b: 0 };
  const threshold = Math.max(0, Math.min(100, tolerance)) / 100 * 441.7;
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (x: number, y: number) => {
    const index = y * width + x;
    if (visited[index]) return;
    const offset = index * 4;
    const alpha = data[offset + 3];
    if (alpha > ALPHA_THRESHOLD && colorDistanceToPalette(data[offset], data[offset + 1], data[offset + 2], backgroundPalette) > threshold) return;
    visited[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); if (height > 1) enqueue(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { enqueue(0, y); if (width > 1) enqueue(width - 1, y); }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }
  for (let index = 0; index < visited.length; index += 1) {
    if (visited[index]) data[index * 4 + 3] = 0;
  }
  if (!pixelArt && backgroundPalette.length) featherRemovedEdge(data, visited, width, height, threshold, backgroundPalette);
  return { removedPixels: tail, background, backgroundPalette };
}

export function trimAlphaBounds(data: Uint8ClampedArray, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return maxX < minX ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function normalizedToPixels(bounds: SmartSeparationBounds, width: number, height: number, paddingPercent: number) {
  const x = Math.floor(bounds.x / 1000 * width);
  const y = Math.floor(bounds.y / 1000 * height);
  const boxWidth = Math.max(1, Math.ceil(bounds.width / 1000 * width));
  const boxHeight = Math.max(1, Math.ceil(bounds.height / 1000 * height));
  const padding = Math.round(Math.min(boxWidth, boxHeight) * Math.max(0, Math.min(20, paddingPercent)) / 100);
  const left = Math.max(0, x - padding);
  const top = Math.max(0, y - padding);
  const right = Math.min(width, x + boxWidth + padding);
  const bottom = Math.min(height, y + boxHeight + padding);
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function perimeterBackgroundPalette(data: Uint8ClampedArray, width: number, height: number) {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  let opaqueSamples = 0;
  const sample = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] <= ALPHA_THRESHOLD) return;
    opaqueSamples += 1;
    const key = `${data[offset] >> 4}-${data[offset + 1] >> 4}-${data[offset + 2] >> 4}`;
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1; bucket.r += data[offset]; bucket.g += data[offset + 1]; bucket.b += data[offset + 2];
    buckets.set(key, bucket);
  };
  for (let x = 0; x < width; x += 1) { sample(x, 0); if (height > 1) sample(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { sample(0, y); if (width > 1) sample(width - 1, y); }
  const minimumCount = Math.max(2, Math.ceil(opaqueSamples * 0.045));
  return [...buckets.values()]
    .filter((bucket) => bucket.count >= minimumCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((bucket) => ({ r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count }));
}

function featherRemovedEdge(data: Uint8ClampedArray, removed: Uint8Array, width: number, height: number, threshold: number, backgroundPalette: Array<{ r: number; g: number; b: number }>) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (removed[index]) continue;
      const nextToBackground = (x > 0 && removed[index - 1]) || (x + 1 < width && removed[index + 1]) || (y > 0 && removed[index - width]) || (y + 1 < height && removed[index + width]);
      if (!nextToBackground) continue;
      const offset = index * 4;
      const distance = colorDistanceToPalette(data[offset], data[offset + 1], data[offset + 2], backgroundPalette);
      if (distance < threshold * 1.5) data[offset + 3] = Math.min(data[offset + 3], Math.max(48, Math.round(255 * distance / Math.max(1, threshold * 1.5))));
    }
  }
}

function colorDistance(r: number, g: number, b: number, target: { r: number; g: number; b: number }) {
  return Math.hypot(r - target.r, g - target.g, b - target.b);
}

function colorDistanceToPalette(r: number, g: number, b: number, palette: Array<{ r: number; g: number; b: number }>) {
  if (!palette.length) return Number.POSITIVE_INFINITY;
  return Math.min(...palette.map((target) => colorDistance(r, g, b, target)));
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The source image could not be loaded.'));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the transparent sprite.')), 'image/png'));
}
