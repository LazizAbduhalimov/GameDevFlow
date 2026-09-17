import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSmartGroupAtlas, cropAndCleanSprite } from '../../src/smart-separation';
import type { SmartSeparationItem, SmartSeparationSettings } from '../../src/types';

type Raster = { width: number; height: number; data: Uint8ClampedArray };

const rasters = new Map<string, Raster>();
let dataUrlSequence = 0;
const originalImageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Image');
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');

class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  data = new Uint8ClampedArray();
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(value: string) {
    queueMicrotask(() => {
      const raster = rasters.get(value);
      if (!raster) return this.onerror?.();
      this.naturalWidth = raster.width;
      this.naturalHeight = raster.height;
      this.data = raster.data;
      this.onload?.();
    });
  }

  set decoding(_value: string) { /* browser compatibility */ }
}

class FakeCanvas {
  private canvasWidth = 300;
  private canvasHeight = 150;
  data = new Uint8ClampedArray(this.canvasWidth * this.canvasHeight * 4);

  get width() { return this.canvasWidth; }
  set width(value: number) { this.canvasWidth = value; this.resize(); }
  get height() { return this.canvasHeight; }
  set height(value: number) { this.canvasHeight = value; this.resize(); }

  getContext() { return new FakeCanvasContext(this); }

  toDataURL() {
    const url = `data:image/png;mock,${++dataUrlSequence}`;
    rasters.set(url, { width: this.width, height: this.height, data: new Uint8ClampedArray(this.data) });
    return url;
  }

  toBlob(callback: (blob: Blob | null) => void) {
    callback(new Blob([this.data], { type: 'image/png' }));
  }

  private resize() { this.data = new Uint8ClampedArray(this.canvasWidth * this.canvasHeight * 4); }
}

class FakeCanvasContext {
  imageSmoothingEnabled = true;
  imageSmoothingQuality = 'low';

  constructor(private readonly canvas: FakeCanvas) {}

  drawImage(source: FakeImage | FakeCanvas, ...args: number[]) {
    const sourceWidth = source instanceof FakeCanvas ? source.width : source.naturalWidth;
    const sourceHeight = source instanceof FakeCanvas ? source.height : source.naturalHeight;
    const sourceData = source.data;
    const [sx, sy, sw, sh, dx, dy, dw, dh] = args.length === 2
      ? [0, 0, sourceWidth, sourceHeight, args[0], args[1], sourceWidth, sourceHeight]
      : args;
    for (let y = 0; y < dh; y += 1) {
      const sourceY = Math.min(sourceHeight - 1, Math.floor(sy + y / dh * sh));
      for (let x = 0; x < dw; x += 1) {
        const sourceX = Math.min(sourceWidth - 1, Math.floor(sx + x / dw * sw));
        const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
        const targetOffset = ((dy + y) * this.canvas.width + dx + x) * 4;
        this.canvas.data.set(sourceData.subarray(sourceOffset, sourceOffset + 4), targetOffset);
      }
    }
  }

  getImageData(x: number, y: number, width: number, height: number) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row += 1) {
      const start = ((y + row) * this.canvas.width + x) * 4;
      data.set(this.canvas.data.subarray(start, start + width * 4), row * width * 4);
    }
    return { data, width, height };
  }

  putImageData(image: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number) {
    for (let row = 0; row < image.height; row += 1) {
      const start = row * image.width * 4;
      const target = ((y + row) * this.canvas.width + x) * 4;
      this.canvas.data.set(image.data.subarray(start, start + image.width * 4), target);
    }
  }

  clearRect(x: number, y: number, width: number, height: number) {
    for (let row = y; row < y + height; row += 1) {
      this.canvas.data.fill(0, (row * this.canvas.width + x) * 4, (row * this.canvas.width + x + width) * 4);
    }
  }
}

function registerUiSheet(url: string) {
  const width = 20;
  const height = 20;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) data.set([245, 245, 240, 255], index * 4);
  for (let y = 6; y < 14; y += 1) {
    for (let x = 6; x < 14; x += 1) data.set([30, 45, 55, 255], (y * width + x) * 4);
  }
  rasters.set(url, { width, height, data });
}

beforeEach(() => {
  rasters.clear();
  dataUrlSequence = 0;
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (tag: string) => tag === 'canvas' ? new FakeCanvas() : null } });
});

afterEach(() => {
  if (originalImageDescriptor) Object.defineProperty(globalThis, 'Image', originalImageDescriptor);
  else Reflect.deleteProperty(globalThis, 'Image');
  if (originalDocumentDescriptor) Object.defineProperty(globalThis, 'document', originalDocumentDescriptor);
  else Reflect.deleteProperty(globalThis, 'document');
});

describe('Smart Separation crop to atlas integration', () => {
  it('keeps an atlas-safe transparent inset around a cleaned crop', async () => {
    const sourceUrl = 'fixture://ui-sheet';
    registerUiSheet(sourceUrl);
    const cropped = await cropAndCleanSprite(sourceUrl, { x: 0, y: 0, width: 1000, height: 1000 }, { tolerance: 15, cropPadding: 0, pixelArt: true });
    const manifest = cropped.manifest as { transparentInset: number; outputSize: { width: number; height: number } };
    const croppedRaster = rasters.get(cropped.previewUrl)!;

    expect(manifest.transparentInset).toBeGreaterThanOrEqual(2);
    expect(manifest.outputSize).toEqual({ width: 12, height: 12 });
    expect(croppedRaster.data[3]).toBe(0);
    expect(croppedRaster.data[((manifest.transparentInset * croppedRaster.width + manifest.transparentInset) * 4) + 3]).toBe(255);

    const item: SmartSeparationItem = {
      id: 'button', sourceIndex: 0, sourceUrl, sourceAssetId: 'source', name: 'Button', role: 'control', description: '',
      bounds: { x: 0, y: 0, width: 1000, height: 1000 }, enabled: true, outputUrl: cropped.previewUrl, outputAssetId: 'crop', groupId: 'controls',
    };
    const settings: SmartSeparationSettings = { packingMode: 'relative', tolerance: 15, cropPadding: 0, pixelArt: true, cellSize: 64, atlasSize: 512, atlasPadding: 8 };
    const atlas = await buildSmartGroupAtlas([item], settings);

    expect(atlas.validation).toEqual({ valid: 1, total: 1, issues: [] });
    expect(atlas.blob).toBeInstanceOf(Blob);
    expect((atlas.manifest?.frames as Array<{ id: string }>)[0].id).toBe('button');
  });
});
