export type ThemePresetId = 'blue' | 'orange' | 'mono' | 'lime';
export type ThemeColorKey = 'accent' | 'background' | 'surface';

export interface ThemePreferences {
  preset: ThemePresetId;
  accent: string;
  background: string;
  surface: string;
}

export interface ThemePreset extends ThemePreferences {
  name: string;
}

export const THEME_STORAGE_KEY = 'frameforge-appearance';
export const THEME_PRESETS: readonly ThemePreset[] = [
  { preset: 'blue', name: 'Soft blue', accent: '#A6D9F5', background: '#111111', surface: '#1B1B1D' },
  { preset: 'orange', name: 'Orange', accent: '#FF6B18', background: '#111111', surface: '#1B1B1D' },
  { preset: 'mono', name: 'Mono', accent: '#E7E7EA', background: '#111111', surface: '#1B1B1D' },
  { preset: 'lime', name: 'Lime', accent: '#D8FF65', background: '#111111', surface: '#1B1B1D' },
];

export function presetPreferences(preset: ThemePresetId = 'blue'): ThemePreferences {
  const value = THEME_PRESETS.find((item) => item.preset === preset) ?? THEME_PRESETS[0];
  return { preset: value.preset, accent: value.accent, background: value.background, surface: value.surface };
}

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex)) return `#${[...hex].map((digit) => digit.repeat(2)).join('').toUpperCase()}`;
  return /^[\da-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null;
}

export function parseThemePreferences(serialized: string | null): ThemePreferences {
  try {
    const parsed: unknown = serialized ? JSON.parse(serialized) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return presetPreferences();
    const candidate = parsed as Record<string, unknown>;
    const preset = THEME_PRESETS.find((item) => item.preset === candidate.preset)?.preset ?? 'blue';
    const defaults = presetPreferences(preset);
    return {
      preset,
      accent: normalizeHex(candidate.accent) ?? defaults.accent,
      background: normalizeHex(candidate.background) ?? defaults.background,
      surface: normalizeHex(candidate.surface) ?? defaults.surface,
    };
  } catch {
    return presetPreferences();
  }
}

export function readThemePreferences(): ThemePreferences {
  try {
    return parseThemePreferences(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return presetPreferences();
  }
}

export function saveThemePreferences(preferences: ThemePreferences): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // The current session remains usable when browser storage is unavailable.
  }
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(hex: string): number {
  const [red, green, blue] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function contrastRatio(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function mix(first: string, second: string, amount: number): string {
  const a = channels(first);
  const b = channels(second);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function foregroundFor(background: string): string {
  return contrastRatio('#FFFFFF', background) >= contrastRatio('#000000', background) ? '#FFFFFF' : '#000000';
}

function readableColor(preferred: string, backgrounds: string[], foreground: string, minimum = 4.5): string {
  if (backgrounds.every((background) => contrastRatio(preferred, background) >= minimum)) return preferred;
  for (let step = 1; step <= 100; step += 1) {
    const candidate = mix(preferred, foreground, step / 100);
    if (backgrounds.every((background) => contrastRatio(candidate, background) >= minimum)) return candidate;
  }
  return foreground;
}

export interface ThemePalette {
  tokens: Record<string, string>;
  canvasDot: string;
  canvasEdge: string;
  canvasMask: string;
}

export function createThemePalette(preferences: ThemePreferences): ThemePalette {
  const { accent, background, surface } = preferences;
  const text = foregroundFor(surface);
  const canvasText = foregroundFor(background);
  const dark = text === '#FFFFFF';
  const surfaceShade = (toward: string, amount: number) => {
    const shade = mix(surface, toward, amount);
    return contrastRatio(text, shade) >= 4.5 ? shade : surface;
  };
  const surfaceHover = surfaceShade(text, 0.06);
  const surfaceInset = surfaceShade(dark ? '#000000' : '#FFFFFF', 0.2);
  const surfaces = [surface, surfaceHover, surfaceInset];
  const muted = readableColor(mix(surface, text, 0.55), surfaces, text);
  const ink = readableColor(accent, surfaces, text);
  const accentSoft = mix(surface, accent, 0.12);
  const canvasDot = mix(background, canvasText, 0.14);
  const canvasEdge = readableColor(accent, [background], canvasText, 3);
  const canvasMask = `${background}D9`;
  const tokens: Record<string, string> = {
    '--background': background,
    '--surface': surface,
    '--surface-hover': surfaceHover,
    '--surface-inset': surfaceInset,
    '--text': text,
    '--muted': muted,
    '--border': mix(surface, text, 0.12),
    '--border-strong': mix(surface, text, 0.28),
    '--canvas-text': canvasText,
    '--canvas-muted': readableColor(mix(background, canvasText, 0.55), [background], canvasText),
    '--canvas-border': mix(background, canvasText, 0.15),
    '--canvas-dot': canvasDot,
    '--canvas-edge': canvasEdge,
    '--canvas-mask': canvasMask,
    '--canvas-accent': readableColor(accent, [background], canvasText),
    '--accent': accent,
    '--accent-text': foregroundFor(accent),
    '--accent-ink': ink,
    '--accent-soft': accentSoft,
    '--accent-soft-text': readableColor(ink, [accentSoft], foregroundFor(accentSoft)),
    '--focus': readableColor(accent, surfaces, text, 3),
    '--danger': readableColor('#F5807C', surfaces, text),
    '--success': readableColor('#83CEAB', surfaces, text),
    '--warning': readableColor('#E9BE72', surfaces, text),
    '--color-scheme': dark ? 'dark' : 'light',
    '--ink': 'var(--text)',
    '--panel': 'var(--surface)',
    '--panel-2': 'var(--surface-hover)',
    '--line': 'var(--border)',
    '--acid': 'var(--accent)',
    '--acid-soft': 'var(--accent-soft)',
    '--coral': 'var(--danger)',
  };
  return { tokens, canvasDot, canvasEdge, canvasMask };
}

export function applyTheme(preferences: ThemePreferences, root: HTMLElement = document.documentElement): ThemePalette {
  const palette = createThemePalette(preferences);
  Object.entries(palette.tokens).forEach(([name, value]) => root.style.setProperty(name, value));
  root.style.colorScheme = palette.tokens['--color-scheme'];
  root.dataset.theme = preferences.preset;
  root.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute('content', preferences.background);
  return palette;
}
