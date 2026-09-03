import type { MaterialMapKey, MaterialMapSettings, SeamlessTextureSettings } from './types';

export type SeamlessBuildResult = {
  blob: Blob;
  width: number;
  height: number;
  seamScore: number;
  manifest: Record<string, unknown>;
};

export type MaterialMapsBuildResult = {
  blobs: Record<Exclude<MaterialMapKey, 'baseColor'>, Blob>;
  width: number;
  height: number;
  manifest: Record<string, unknown>;
};

const derivedMapKeys: Array<Exclude<MaterialMapKey, 'baseColor'>> = ['normal', 'height', 'roughness', 'metallic', 'ambientOcclusion', 'orm'];

export async function buildSeamlessTexture(url: string, settings: SeamlessTextureSettings): Promise<SeamlessBuildResult> {
  const image = await loadImage(url);
  const size = settings.outputSize;
  const base = document.createElement('canvas');
  base.width = size;
  base.height = size;
  const baseContext = requiredContext(base);
  drawCover(baseContext, image, size, size);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = requiredContext(canvas);
  const half = Math.floor(size / 2);
  for (const x of [-half, size - half]) {
    for (const y of [-half, size - half]) context.drawImage(base, x, y);
  }

  const pixels = context.getImageData(0, 0, size, size);
  const radius = Math.max(2, Math.floor(size * settings.edgeBlend));
  crossfadeVerticalSeam(pixels.data, size, size, half, radius);
  crossfadeHorizontalSeam(pixels.data, size, size, half, radius);
  const seamScore = calculateSeamScore(pixels.data, size, size, half);
  lockOppositeEdges(pixels.data, size, size);
  context.putImageData(pixels, 0, 0);

  return {
    blob: await canvasToBlob(canvas),
    width: size,
    height: size,
    seamScore,
    manifest: {
      schemaVersion: 1,
      kind: 'seamless-texture',
      width: size,
      height: size,
      edgeBlend: settings.edgeBlend,
      seamScore,
      wrapMode: 'repeat',
      colorSpace: 'sRGB',
    },
  };
}

export async function buildMaterialMaps(url: string, settings: MaterialMapSettings): Promise<MaterialMapsBuildResult> {
  const image = await loadImage(url);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) throw new Error('The connected texture has no readable pixel dimensions.');

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = requiredContext(sourceCanvas);
  sourceContext.drawImage(image, 0, 0, width, height);
  const source = sourceContext.getImageData(0, 0, width, height);
  const count = width * height;
  const luminance = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    luminance[index] = source.data[offset] * 0.2126 + source.data[offset + 1] * 0.7152 + source.data[offset + 2] * 0.0722;
  }
  const blurred = blurScalar(luminance, width, height);
  const heightField = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const contrasted = clamp01(((luminance[index] / 255) - 0.5) * settings.heightContrast + 0.5);
    heightField[index] = settings.invertHeight ? 1 - contrasted : contrasted;
  }
  const blurredHeight = blurScalar(heightField, width, height);

  const canvases = Object.fromEntries(derivedMapKeys.map((key) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return [key, canvas];
  })) as Record<Exclude<MaterialMapKey, 'baseColor'>, HTMLCanvasElement>;
  const outputs = Object.fromEntries(derivedMapKeys.map((key) => [key, requiredContext(canvases[key]).createImageData(width, height)])) as Record<Exclude<MaterialMapKey, 'baseColor'>, ImageData>;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const left = heightField[y * width + wrap(x - 1, width)];
      const right = heightField[y * width + wrap(x + 1, width)];
      const up = heightField[wrap(y - 1, height) * width + x];
      const down = heightField[wrap(y + 1, height) * width + x];
      const normalX = (left - right) * settings.normalStrength;
      const normalYSign = settings.normalFormat === 'directx' ? -1 : 1;
      const normalY = (up - down) * settings.normalStrength * normalYSign;
      const normalLength = Math.hypot(normalX, normalY, 1);
      writePixel(outputs.normal.data, offset, (normalX / normalLength * 0.5 + 0.5) * 255, (normalY / normalLength * 0.5 + 0.5) * 255, (1 / normalLength * 0.5 + 0.5) * 255);

      const heightValue = heightField[index] * 255;
      writeGray(outputs.height.data, offset, heightValue);

      const detail = Math.abs(luminance[index] - blurred[index]) / 255;
      const roughness = clamp01(settings.roughnessLevel + detail * settings.detailInfluence);
      writeGray(outputs.roughness.data, offset, roughness * 255);
      writeGray(outputs.metallic.data, offset, settings.metallicLevel * 255);

      const cavity = Math.max(0, blurredHeight[index] - heightField[index]);
      const ao = 1 - clamp01(cavity * settings.aoStrength);
      writeGray(outputs.ambientOcclusion.data, offset, ao * 255);
      writePixel(outputs.orm.data, offset, ao * 255, roughness * 255, settings.metallicLevel * 255);
    }
  }

  for (const key of derivedMapKeys) requiredContext(canvases[key]).putImageData(outputs[key], 0, 0);
  const blobEntries = await Promise.all(derivedMapKeys.map(async (key) => [key, await canvasToBlob(canvases[key])] as const));
  return {
    blobs: Object.fromEntries(blobEntries) as MaterialMapsBuildResult['blobs'],
    width,
    height,
    manifest: {
      schemaVersion: 1,
      kind: 'pbr-material-map-set',
      width,
      height,
      maps: ['baseColor', ...derivedMapKeys],
      channelPacking: { orm: { red: 'ambientOcclusion', green: 'roughness', blue: 'metallic' } },
      settings,
      notes: {
        roughness: 'Estimated from luminance detail. Author review recommended.',
        metallic: 'Uniform authored value; it cannot be reliably inferred from color alone.',
        normalFormat: settings.normalFormat,
      },
    },
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The connected image could not be decoded.'));
    image.src = url;
  });
}

function requiredContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas processing is unavailable in this browser.');
  return context;
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function crossfadeVerticalSeam(data: Uint8ClampedArray, width: number, height: number, center: number, radius: number) {
  const source = new Uint8ClampedArray(data);
  const offset = Math.floor(width / 2);
  for (let y = 0; y < height; y += 1) {
    for (let step = -radius; step <= radius; step += 1) {
      const targetX = wrap(center + step, width);
      const alternateX = wrap(targetX + offset, width);
      const blend = (1 - smoothstep(Math.abs(step) / radius)) * 0.5;
      for (let channel = 0; channel < 4; channel += 1) {
        const current = source[(y * width + targetX) * 4 + channel];
        const alternate = source[(y * width + alternateX) * 4 + channel];
        data[(y * width + targetX) * 4 + channel] = Math.round(current * (1 - blend) + alternate * blend);
      }
    }
  }
}

function crossfadeHorizontalSeam(data: Uint8ClampedArray, width: number, height: number, center: number, radius: number) {
  const source = new Uint8ClampedArray(data);
  const offset = Math.floor(height / 2);
  for (let x = 0; x < width; x += 1) {
    for (let step = -radius; step <= radius; step += 1) {
      const targetY = wrap(center + step, height);
      const alternateY = wrap(targetY + offset, height);
      const blend = (1 - smoothstep(Math.abs(step) / radius)) * 0.5;
      for (let channel = 0; channel < 4; channel += 1) {
        const current = source[(targetY * width + x) * 4 + channel];
        const alternate = source[(alternateY * width + x) * 4 + channel];
        data[(targetY * width + x) * 4 + channel] = Math.round(current * (1 - blend) + alternate * blend);
      }
    }
  }
}

function lockOppositeEdges(data: Uint8ClampedArray, width: number, height: number) {
  for (let y = 0; y < height; y += 1) averagePixels(data, y * width, y * width + width - 1);
  for (let x = 0; x < width; x += 1) averagePixels(data, x, (height - 1) * width + x);
}

function averagePixels(data: Uint8ClampedArray, firstPixel: number, secondPixel: number) {
  for (let channel = 0; channel < 4; channel += 1) {
    const average = Math.round((data[firstPixel * 4 + channel] + data[secondPixel * 4 + channel]) / 2);
    data[firstPixel * 4 + channel] = average;
    data[secondPixel * 4 + channel] = average;
  }
}

function calculateSeamScore(data: Uint8ClampedArray, width: number, height: number, center: number) {
  let difference = 0;
  let samples = 0;
  for (const seamX of [0, center]) {
    const left = wrap(seamX - 1, width);
    const right = wrap(seamX, width);
    for (let y = 0; y < height; y += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        difference += Math.abs(data[(y * width + left) * 4 + channel] - data[(y * width + right) * 4 + channel]);
        samples += 1;
      }
    }
  }
  for (const seamY of [0, center]) {
    const top = wrap(seamY - 1, height);
    const bottom = wrap(seamY, height);
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        difference += Math.abs(data[(top * width + x) * 4 + channel] - data[(bottom * width + x) * 4 + channel]);
        samples += 1;
      }
    }
  }
  const meanDifference = difference / Math.max(1, samples);
  return Math.max(0, Math.round((1 - Math.min(1, meanDifference / 64)) * 100));
}

function blurScalar(source: Float32Array, width: number, height: number) {
  const result = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let weight = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const sampleWeight = ox === 0 && oy === 0 ? 4 : ox === 0 || oy === 0 ? 2 : 1;
          total += source[wrap(y + oy, height) * width + wrap(x + ox, width)] * sampleWeight;
          weight += sampleWeight;
        }
      }
      result[y * width + x] = total / weight;
    }
  }
  return result;
}

function writePixel(target: Uint8ClampedArray, offset: number, red: number, green: number, blue: number) {
  target[offset] = Math.round(red);
  target[offset + 1] = Math.round(green);
  target[offset + 2] = Math.round(blue);
  target[offset + 3] = 255;
}

function writeGray(target: Uint8ClampedArray, offset: number, value: number) {
  writePixel(target, offset, value, value, value);
}

function wrap(value: number, size: number) {
  return (value + size) % size;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG encoding failed.')), 'image/png'));
}
