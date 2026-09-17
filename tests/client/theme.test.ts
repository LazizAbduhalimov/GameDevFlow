import { describe, expect, it } from 'vitest';
import { THEME_PRESETS, contrastRatio, createThemePalette, normalizeHex, parseThemePreferences, presetPreferences } from '../../src/theme';

describe('Appearance preferences', () => {
  it('normalizes supported HEX formats without admitting CSS expressions', () => {
    expect(normalizeHex(' a6d9f5 ')).toBe('#A6D9F5');
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    for (const value of ['transparent', 'var(--accent)', '#FFFF', '#FFFFFG', '', null, 123]) expect(normalizeHex(value)).toBeNull();
  });

  it('recovers from corrupt browser storage and validates each persisted field', () => {
    for (const value of [null, 'undefined', '{broken', 'false', '[]', '"blue"']) expect(parseThemePreferences(value)).toEqual(presetPreferences());
    expect(parseThemePreferences(JSON.stringify({ preset: 'orange', accent: 'bad value', background: '#fff', surface: 100 }))).toEqual({
      preset: 'orange', accent: '#FF6B18', background: '#FFFFFF', surface: '#1B1B1D',
    });
    expect(parseThemePreferences(JSON.stringify({ preset: 'unknown' })).preset).toBe('blue');
  });

  it('preserves arbitrary custom colors separately from the selected reset preset', () => {
    const preferences = { preset: 'lime' as const, accent: '#0055FF', background: '#FFFFFF', surface: '#101010' };
    expect(parseThemePreferences(JSON.stringify(preferences))).toEqual(preferences);
    expect(presetPreferences(preferences.preset)).toEqual({ preset: 'lime', accent: '#D8FF65', background: '#111111', surface: '#1B1B1D' });
  });
});

describe('Theme contrast', () => {
  it('keeps text, muted labels and semantic colors readable across dark, light and mixed surfaces', () => {
    const colors = ['#000000', '#111111', '#FFFFFF', '#FAFAFA', '#767676', '#808080', '#FF00FF', '#00FF00', '#0000FF'];
    for (const surface of colors) for (const background of colors) for (const accent of ['#000000', '#FFFFFF', '#767676', '#FF0000']) {
      const { tokens } = createThemePalette({ preset: 'blue', surface, background, accent });
      for (const foreground of ['--text', '--muted', '--accent-ink', '--danger', '--success', '--warning']) {
        for (const panel of ['--surface', '--surface-hover', '--surface-inset']) {
          expect(contrastRatio(tokens[foreground], tokens[panel]), `${foreground} on ${panel} for ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrastRatio(tokens['--canvas-text'], background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens['--canvas-muted'], background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens['--canvas-accent'], background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens['--accent-text'], accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens['--accent-soft-text'], tokens['--accent-soft'])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses every approved preset and derives canvas paint without mutating preferences', () => {
    for (const preset of THEME_PRESETS) {
      const preferences = Object.freeze(presetPreferences(preset.preset));
      const palette = createThemePalette(preferences);
      expect(palette.tokens['--accent']).toBe(preset.accent);
      expect(palette.tokens['--background']).toBe('#111111');
      expect(palette.tokens['--surface']).toBe('#1B1B1D');
      expect(palette.canvasDot).toBe(palette.tokens['--canvas-dot']);
      expect(contrastRatio(palette.canvasEdge, preferences.background)).toBeGreaterThanOrEqual(3);
      expect(palette.canvasMask).toBe('#111111D9');
    }
  });
});
