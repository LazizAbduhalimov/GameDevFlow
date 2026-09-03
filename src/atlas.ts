import type { RelativeAtlasSettings, SpriteAtlasSettings } from './types';

type LoadedAtlasFrame = {
  url: string;
  image: HTMLImageElement;
  bounds: { x: number; y: number; width: number; height: number };
};

export type AtlasBuildResult = {
  blob?: Blob;
  previewUrl?: string;
  manifest?: Record<string, unknown>;
  validation: { valid: number; total: number; issues: string[] };
};

const ALPHA_THRESHOLD = 8;

export async function buildSpriteAtlas(urls: string[], settings: SpriteAtlasSettings): Promise<AtlasBuildResult> {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  if (!uniqueUrls.length) throw new Error('Connect an image collection before building the atlas.');

  const inspected = await Promise.all(uniqueUrls.map((url, index) => inspectFrame(url, index)));
  const issues = inspected.flatMap((entry) => entry.issue ? [entry.issue] : []);
  const frames = inspected.flatMap((entry) => entry.frame ? [entry.frame] : []);
  const validation = { valid: frames.length, total: uniqueUrls.length, issues };
  if (issues.length || frames.length !== uniqueUrls.length) return { validation };

  const columns = settings.columns === 'auto'
    ? Math.max(1, Math.ceil(Math.sqrt(frames.length)))
    : Math.max(1, Math.min(Math.floor(settings.columns), frames.length));
  const rows = Math.ceil(frames.length / columns);
  const gridWidth = settings.outerMargin * 2 + columns * settings.cellSize + Math.max(0, columns - 1) * settings.gutter;
  const gridHeight = settings.outerMargin * 2 + rows * settings.cellSize + Math.max(0, rows - 1) * settings.gutter;
  const width = settings.powerOfTwo ? nextPowerOfTwo(gridWidth) : gridWidth;
  const height = settings.powerOfTwo ? nextPowerOfTwo(gridHeight) : gridHeight;
  if (width > 4096 || height > 4096) throw new Error(`Atlas would be ${width} × ${height}. Reduce cell size or split the collection.`);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: false });
  if (!context) throw new Error('Canvas rendering is unavailable.');
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = !settings.pixelArt;
  context.imageSmoothingQuality = settings.pixelArt ? 'low' : 'high';

  const gridOffsetX = Math.floor((width - gridWidth) / 2) + settings.outerMargin;
  const gridOffsetY = Math.floor((height - gridHeight) / 2) + settings.outerMargin;
  const safeRatio = Math.max(0.5, Math.min(0.95, settings.safeArea));
  const contentSize = Math.floor(settings.cellSize * safeRatio);

  const manifestFrames = frames.map((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gridOffsetX + column * (settings.cellSize + settings.gutter);
    const y = gridOffsetY + row * (settings.cellSize + settings.gutter);
    const scale = Math.min(contentSize / frame.bounds.width, contentSize / frame.bounds.height);
    const drawWidth = Math.max(1, Math.round(frame.bounds.width * scale));
    const drawHeight = Math.max(1, Math.round(frame.bounds.height * scale));
    const drawX = x + Math.floor((settings.cellSize - drawWidth) / 2);
    const drawY = y + Math.floor((settings.cellSize - drawHeight) / 2);

    context.drawImage(
      frame.image,
      frame.bounds.x,
      frame.bounds.y,
      frame.bounds.width,
      frame.bounds.height,
      drawX,
      drawY,
      drawWidth,
      drawHeight,
    );

    return {
      id: `sprite-${index + 1}`,
      source: frame.url,
      frame: { x, y, width: settings.cellSize, height: settings.cellSize },
      spriteSourceSize: { x: drawX - x, y: drawY - y, width: drawWidth, height: drawHeight },
      sourceSize: { width: frame.image.naturalWidth, height: frame.image.naturalHeight },
      pivot: { x: 0.5, y: 0.5 },
      grid: { column, row },
    };
  });

  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    image: 'sprite-atlas.png',
    transparent: true,
    width,
    height,
    grid: {
      columns,
      rows,
      cellSize: settings.cellSize,
      gutter: settings.gutter,
      outerMargin: settings.outerMargin,
      safeArea: safeRatio,
      powerOfTwo: settings.powerOfTwo,
      pixelArt: settings.pixelArt,
    },
    frames: manifestFrames,
  };

  const blob = await canvasBlob(canvas);
  return { blob, previewUrl: canvas.toDataURL('image/png'), manifest, validation };
}

/** Packs trimmed transparent objects with a single shared scale. Unlike a cell atlas,
 * a large object stays larger than a small one in the exported texture. */
export async function buildRelativeAtlas(urls: string[], settings: RelativeAtlasSettings): Promise<AtlasBuildResult> {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  if (!uniqueUrls.length) throw new Error('Connect an image collection before building the atlas.');
  const inspected = await Promise.all(uniqueUrls.map((url, index) => inspectFrame(url, index)));
  const issues = inspected.flatMap((entry) => entry.issue ? [entry.issue] : []);
  const frames = inspected.flatMap((entry) => entry.frame ? [entry.frame] : []);
  const validation = { valid: frames.length, total: uniqueUrls.length, issues };
  if (issues.length || frames.length !== uniqueUrls.length) return { validation };

  const size = settings.canvasSize;
  const margin = Math.max(0, Math.floor(settings.outerMargin));
  const padding = Math.max(0, Math.floor(settings.padding));
  const placements = findRelativePacking(frames, size, margin, padding);
  if (!placements) throw new Error(`These objects cannot fit inside ${size} × ${size}. Choose a larger canvas or lower the padding.`);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: false });
  if (!context) throw new Error('Canvas rendering is unavailable.');
  context.imageSmoothingEnabled = !settings.pixelArt;
  context.imageSmoothingQuality = settings.pixelArt ? 'low' : 'high';

  for (const placement of placements) {
    const { frame, x, y, width, height } = placement;
    context.drawImage(frame.image, frame.bounds.x, frame.bounds.y, frame.bounds.width, frame.bounds.height, x, y, width, height);
  }

  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    image: 'relative-atlas.png',
    transparent: true,
    width: size,
    height: size,
    layout: { type: 'relative-pack', sharedScale: placements[0]?.scale || 1, padding, outerMargin: margin, pixelArt: settings.pixelArt },
    frames: placements.sort((a, b) => a.index - b.index).map((placement) => ({
      id: `sprite-${placement.index + 1}`,
      source: placement.frame.url,
      frame: { x: placement.x, y: placement.y, width: placement.width, height: placement.height },
      spriteSourceSize: { x: 0, y: 0, width: placement.width, height: placement.height },
      sourceSize: { width: placement.frame.image.naturalWidth, height: placement.frame.image.naturalHeight },
      trimmedSourceBounds: placement.frame.bounds,
      pivot: { x: 0.5, y: 0.5 },
      scale: placements[0]?.scale || 1,
    })),
  };
  const blob = await canvasBlob(canvas);
  return { blob, previewUrl: canvas.toDataURL('image/png'), manifest, validation };
}

type RelativePlacement = { frame: LoadedAtlasFrame; index: number; x: number; y: number; width: number; height: number; scale: number };

function findRelativePacking(frames: LoadedAtlasFrame[], size: number, margin: number, padding: number): RelativePlacement[] | null {
  const candidates = frames.map((frame, index) => ({ frame, index })).sort((a, b) => b.frame.bounds.height - a.frame.bounds.height);
  const fits = (scale: number) => {
    const result: RelativePlacement[] = [];
    let x = margin;
    let y = margin;
    let rowHeight = 0;
    for (const item of candidates) {
      const width = Math.max(1, Math.round(item.frame.bounds.width * scale));
      const height = Math.max(1, Math.round(item.frame.bounds.height * scale));
      if (x + width > size - margin && x > margin) { x = margin; y += rowHeight + padding; rowHeight = 0; }
      if (x + width > size - margin || y + height > size - margin) return null;
      result.push({ ...item, x, y, width, height, scale });
      x += width + padding;
      rowHeight = Math.max(rowHeight, height);
    }
    return result;
  };
  let best = fits(1);
  if (best) return best;
  let low = 0.01;
  let high = 1;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const middle = (low + high) / 2;
    const packed = fits(middle);
    if (packed) { best = packed; low = middle; } else high = middle;
  }
  return best;
}

async function inspectFrame(url: string, index: number): Promise<{ frame?: LoadedAtlasFrame; issue?: string }> {
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { issue: `Image ${index + 1}: canvas inspection is unavailable.` };
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    let transparentPixels = 0;
    let transparentBorderPixels = 0;
    let borderPixels = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const alpha = pixels[(y * canvas.width + x) * 4 + 3];
        const border = x === 0 || y === 0 || x === canvas.width - 1 || y === canvas.height - 1;
        if (border) borderPixels += 1;
        if (alpha <= ALPHA_THRESHOLD) {
          transparentPixels += 1;
          if (border) transparentBorderPixels += 1;
        }
        if (alpha <= ALPHA_THRESHOLD) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const transparentRatio = transparentPixels / Math.max(1, canvas.width * canvas.height);
    const transparentBorderRatio = transparentBorderPixels / Math.max(1, borderPixels);
    if (transparentRatio < 0.02 || transparentBorderRatio < 0.5) return { issue: `Image ${index + 1}: opaque background detected. Regenerate it with a transparent background.` };
    if (maxX < minX || maxY < minY) return { issue: `Image ${index + 1}: no visible pixels were found.` };
    if (minX === 0 || minY === 0 || maxX === canvas.width - 1 || maxY === canvas.height - 1) return { issue: `Image ${index + 1}: visible pixels touch the source edge. Regenerate it with clear transparent space around the icon.` };
    return {
      frame: {
        url,
        image,
        bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      },
    };
  } catch {
    return { issue: `Image ${index + 1}: the local asset could not be loaded.` };
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the atlas PNG.')), 'image/png');
  });
}

function nextPowerOfTwo(value: number) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}
