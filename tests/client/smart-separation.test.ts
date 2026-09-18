import { describe, expect, it } from 'vitest';
import { removeEdgeConnectedBackground, smartSeparationRegenerationPrompt, trimAlphaBounds } from '../../src/smart-separation';

function pixels(width: number, height: number, color = [245, 245, 240, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) data.set(color, index * 4);
  return data;
}

function setPixel(data: Uint8ClampedArray, width: number, x: number, y: number, color: number[]) {
  data.set(color, (y * width + x) * 4);
}

describe('Smart Separation pixel cleanup', () => {
  it('removes only edge-connected background and preserves enclosed white detail', () => {
    const data = pixels(7, 7);
    for (let y = 1; y <= 5; y += 1) for (let x = 1; x <= 5; x += 1) setPixel(data, 7, x, y, [25, 30, 28, 255]);
    setPixel(data, 7, 3, 3, [245, 245, 240, 255]);
    const result = removeEdgeConnectedBackground(data, 7, 7, 15, true);
    expect(result.removedPixels).toBe(24);
    expect(data[(0 * 7 + 0) * 4 + 3]).toBe(0);
    expect(data[(3 * 7 + 3) * 4 + 3]).toBe(255);
  });

  it('keeps contrasting objects and returns their tight alpha bounds', () => {
    const data = pixels(6, 5);
    for (let y = 1; y <= 3; y += 1) for (let x = 2; x <= 4; x += 1) setPixel(data, 6, x, y, [200, 40, 35, 255]);
    removeEdgeConnectedBackground(data, 6, 5, 12, true);
    expect(trimAlphaBounds(data, 6, 5)).toEqual({ x: 2, y: 1, width: 3, height: 3 });
  });

  it('removes a two-tone checkerboard connected to the perimeter without erasing enclosed light detail', () => {
    const data = pixels(10, 8);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 10; x += 1) setPixel(data, 10, x, y, (x + y) % 2 ? [205, 205, 205, 255] : [245, 245, 245, 255]);
    for (let y = 2; y <= 5; y += 1) for (let x = 2; x <= 7; x += 1) setPixel(data, 10, x, y, [20, 22, 24, 255]);
    setPixel(data, 10, 4, 3, [245, 245, 245, 255]);
    const result = removeEdgeConnectedBackground(data, 10, 8, 12, true);
    expect(result.backgroundPalette).toHaveLength(2);
    expect(data[(0 * 10 + 0) * 4 + 3]).toBe(0);
    expect(data[(0 * 10 + 1) * 4 + 3]).toBe(0);
    expect(data[(3 * 10 + 4) * 4 + 3]).toBe(255);
    expect(trimAlphaBounds(data, 10, 8)).toEqual({ x: 2, y: 2, width: 6, height: 4 });
  });

  it('returns null when no visible pixels remain', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    expect(trimAlphaBounds(data, 4, 4)).toBeNull();
  });
});

describe('Smart Separation regeneration prompt', () => {
  it('identifies one target and explicitly forbids rectangular crops and neighboring elements', () => {
    const prompt = smartSeparationRegenerationPrompt({
      id: 'alert', sourceIndex: 0, sourceUrl: '/sheet.png', sourceAssetId: 'sheet', name: 'ALERT banner', role: 'security notice', description: 'Pink warning banner with ALERT! text', bounds: { x: 100, y: 50, width: 300, height: 150 }, enabled: true,
    }, 'comic-ui.png');
    expect(prompt).toContain('Target asset: ALERT banner');
    expect(prompt).toContain('left 10.0%, top 5.0%, right 40.0%, bottom 20.0%');
    expect(prompt).toContain('Do not paste or preserve a rectangular crop');
    expect(prompt).toContain('Copy every visible word and symbol exactly');
    expect(prompt).toContain('alpha 0');
    expect(prompt).toContain('checker pattern is a background');
  });
});
