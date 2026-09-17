import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  createThemePalette,
  normalizeHex,
  parseThemePreferences,
  presetPreferences,
  readThemePreferences,
  saveThemePreferences,
  type ThemeColorKey,
  type ThemePresetId,
} from './theme';

export function useTheme() {
  const [preferences, setPreferences] = useState(readThemePreferences);
  const palette = useMemo(() => createThemePalette(preferences), [preferences]);

  useLayoutEffect(() => {
    applyTheme(preferences);
    saveThemePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setPreferences(parseThemePreferences(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPreset = useCallback((preset: ThemePresetId) => setPreferences(presetPreferences(preset)), []);
  const setColor = useCallback((field: ThemeColorKey, value: string) => {
    const color = normalizeHex(value);
    if (color) setPreferences((current) => current[field] === color ? current : { ...current, [field]: color });
  }, []);
  const reset = useCallback(() => setPreferences((current) => presetPreferences(current.preset)), []);

  return { preferences, palette, setPreset, setColor, reset };
}

export type ThemeControls = ReturnType<typeof useTheme>;
