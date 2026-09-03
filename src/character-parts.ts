import type { CharacterPartGeometry, CharacterPartKey, CharacterPartsNodeData } from './types';

export const characterPartKeys: CharacterPartKey[] = ['hat', 'top', 'pants', 'shoes', 'body'];

export const characterPartSpecs: Record<CharacterPartKey, { title: string; description: string; instruction: string }> = {
  hat: {
    title: 'Hat',
    description: 'Headwear and attached hat details',
    instruction: 'Isolate only the complete hat or headwear, including its band and decorations. Exclude hair, head, face and every other object.',
  },
  top: {
    title: 'Top',
    description: 'Shirt, jacket or upper garment',
    instruction: 'Isolate only the upper-body garment: shirt, jacket, coat, sleeves and garment trims. Exclude exposed hands, head, trousers and accessories.',
  },
  pants: {
    title: 'Pants',
    description: 'Trousers or lower garment',
    instruction: 'Isolate only the trousers or lower-body garment, including cuffs, belt loops and garment details. Exclude shoes and body.',
  },
  shoes: {
    title: 'Shoes',
    description: 'Both shoes as one aligned layer',
    instruction: 'Isolate only both shoes, boots or other footwear. Keep both feet in their original locations and exclude legs, trousers and ground shadow.',
  },
  body: {
    title: 'Body',
    description: 'Character base without wearable items',
    instruction: 'Create the character body base without hat, shirt, trousers, shoes or wearable accessories. Preserve the exact head, face, hands, pose and proportions. Reconstruct only the simple covered body shapes needed underneath clothing; keep it non-explicit and suitable for a stylized game character.',
  },
};

export function characterPartPrompt(data: CharacterPartsNodeData, key: CharacterPartKey, referenceCount: number): string {
  const spec = characterPartSpecs[key];
  return [
    `Create one production-ready 2D cutout layer for: ${spec.title}.`,
    spec.instruction,
    'The FIRST attached image defines the exact output canvas, camera, scale and pixel placement. Additional images are identity and boundary references only.',
    'Output exactly one PNG layer with the same aspect ratio and composition as the first image. Keep the isolated part at its original location; never crop, recenter, enlarge, rotate or move it.',
    'Every pixel outside this layer must be fully transparent alpha 0. No backdrop, floor, cast shadow, outline, labels, guides, contact sheet or checkerboard pattern.',
    'Preserve the original visual style, colors, materials and visible details. Do not include any pixels belonging to other layers.',
    referenceCount > 1 ? `Use all ${referenceCount} references to understand the same character, but produce the layer aligned to the first/front reference.` : '',
    data.notes.trim() ? `Project-specific separation notes: ${data.notes.trim()}` : '',
  ].filter(Boolean).join('\n');
}

export async function normalizeCharacterPartLayer(layerUrl: string, referenceUrl: string): Promise<{ blob: Blob; geometry: CharacterPartGeometry }> {
  const [layer, reference] = await Promise.all([loadImage(layerUrl), loadImage(referenceUrl)]);
  const canvas = document.createElement('canvas');
  canvas.width = reference.naturalWidth;
  canvas.height = reference.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) throw new Error('Could not prepare the source coordinate canvas.');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(layer, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const transparentBefore = transparentRatio(imageData.data);
  const backgroundRemoved = transparentBefore < 0.01 ? removeEdgeBackground(imageData) : false;
  context.putImageData(imageData, 0, 0);
  const bounds = alphaBounds(imageData);
  if (!bounds) throw new Error('The generated layer did not contain a visible part. Retry this part.');
  const geometry: CharacterPartGeometry = {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    anchorX: 0,
    anchorY: 0,
    bounds,
    normalizedBounds: {
      x: bounds.x / canvas.width,
      y: bounds.y / canvas.height,
      width: bounds.width / canvas.width,
      height: bounds.height / canvas.height,
    },
    backgroundRemoved,
    hasTransparency: transparentRatio(imageData.data) > 0.01,
  };
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not save the normalized transparent layer.');
  return { blob, geometry };
}

export function characterPartsManifest(data: CharacterPartsNodeData) {
  const primary = characterPartKeys.map((key) => data.parts[key].geometry).find((geometry) => Boolean(geometry));
  return {
    schemaVersion: 1,
    kind: 'frameforge-character-parts',
    coordinateSpace: 'source-pixel-top-left',
    canvas: primary ? { width: primary.canvasWidth, height: primary.canvasHeight } : null,
    primaryReference: data.inputUrls?.[0] || null,
    referenceCount: data.inputUrls?.length || 0,
    layers: characterPartKeys.map((key) => {
      const part = data.parts[key];
      return { key, title: part.title, url: part.outputUrl || null, assetId: part.assetId || null, anchor: { x: 0, y: 0 }, bounds: part.geometry?.bounds || null, normalizedBounds: part.geometry?.normalizedBounds || null };
    }),
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A layer image could not be read from the local library.'));
    image.src = url;
  });
}

function transparentRatio(data: Uint8ClampedArray) {
  let transparent = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] < 245) transparent += 1;
  return transparent / (data.length / 4);
}

function removeEdgeBackground(imageData: ImageData) {
  const { data, width, height } = imageData;
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const corners = [0, width - 1, (height - 1) * width, total - 1].map((pixel) => [data[pixel * 4], data[pixel * 4 + 1], data[pixel * 4 + 2]]);
  const matchesBackground = (pixel: number) => {
    const offset = pixel * 4;
    if (data[offset + 3] < 20) return true;
    return corners.some(([red, green, blue]) => Math.abs(data[offset] - red) + Math.abs(data[offset + 1] - green) + Math.abs(data[offset + 2] - blue) <= 72);
  };
  const push = (pixel: number) => {
    if (pixel < 0 || pixel >= total || visited[pixel] || !matchesBackground(pixel)) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x += 1) { push(x); push((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y += 1) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    if (x > 0) push(pixel - 1);
    if (x < width - 1) push(pixel + 1);
    if (pixel >= width) push(pixel - width);
    if (pixel < total - width) push(pixel + width);
  }
  if (!tail || tail / total > 0.98) return false;
  for (let pixel = 0; pixel < total; pixel += 1) if (visited[pixel]) data[pixel * 4 + 3] = 0;
  return true;
}

function alphaBounds(imageData: ImageData) {
  const { data, width, height } = imageData;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * 4 + 3] <= 16) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
