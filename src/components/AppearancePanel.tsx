import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { THEME_PRESETS, normalizeHex, type ThemeColorKey } from '../theme';
import type { ThemeControls } from '../useTheme';
import '../appearance.css';

export interface AppearancePanelProps extends Pick<ThemeControls, 'preferences' | 'setPreset' | 'setColor' | 'reset'> {
  open: boolean;
  onClose: () => void;
}

interface ColorFieldProps {
  label: string;
  description: string;
  value: string;
  field: ThemeColorKey;
  onChange: AppearancePanelProps['setColor'];
}

function ColorField({ label, description, value, field, onChange }: ColorFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  return (
    <div className="appearance-color-field">
      <label htmlFor={id}><strong>{label}</strong><span>{description}</span></label>
      <div className="appearance-color-control">
        <input
          className="appearance-color-picker"
          type="color"
          value={value}
          aria-label={`Choose ${label.toLowerCase()} color`}
          onChange={(event) => onChange(field, event.target.value)}
        />
        <input
          id={id}
          type="text"
          className="appearance-hex"
          value={draft}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            setInvalid(false);
            // Keep short HEX as a draft so typing a six-digit color never moves the caret.
            if (/^#?[\da-f]{6}$/i.test(next)) onChange(field, next);
          }}
          onBlur={() => {
            const next = normalizeHex(draft);
            if (next) {
              setDraft(next);
              onChange(field, next);
            } else setInvalid(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </div>
      {invalid && <p id={`${id}-error`} className="appearance-color-error">Use a HEX color such as #A6D9F5.</p>}
    </div>
  );
}

export function AppearancePanel({ open, onClose, preferences, setPreset, setColor, reset }: AppearancePanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])];
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="appearance-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="appearance-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="appearance-header">
          <h2 id={titleId}>Appearance</h2>
          <button ref={closeRef} type="button" className="appearance-close" onClick={onClose} aria-label="Close appearance settings"><X size={18} /></button>
        </header>
        <div className="appearance-body">
          <fieldset className="appearance-presets">
            <legend>Theme</legend>
            <div className="appearance-preset-grid">
              {THEME_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.preset}
                  className={`appearance-preset${preferences.preset === preset.preset ? ' is-selected' : ''}`}
                  style={{ '--preview-accent': preset.accent } as CSSProperties}
                  aria-pressed={preferences.preset === preset.preset}
                  onClick={() => setPreset(preset.preset)}
                >
                  <span className="appearance-preset-preview" aria-hidden="true"><span className="appearance-preview-node"><i /><i /><i /></span><span className="appearance-preview-toolbar"><i /><i /><i /></span></span>
                  <span className="appearance-preset-label">{preset.name}{preferences.preset === preset.preset && <Check size={14} />}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <section className="appearance-colors" aria-label="Custom colors">
            <h3>Custom colors</h3>
            <p>Choose your canvas and panel colors. Text adjusts automatically.</p>
            <ColorField label="Accent" description="Actions and selection" field="accent" value={preferences.accent} onChange={setColor} />
            <ColorField label="Canvas" description="Main background" field="background" value={preferences.background} onChange={setColor} />
            <ColorField label="Panels" description="Cards and toolbars" field="surface" value={preferences.surface} onChange={setColor} />
          </section>
        </div>
        <footer className="appearance-footer">
          <button type="button" className="appearance-reset" onClick={reset}><RotateCcw size={15} /> Reset theme</button>
          <span>Saved on this device</span>
        </footer>
      </section>
    </div>
  );
}
