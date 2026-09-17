import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight, Box, Check, ChevronRight, Grid2X2, Image, Images, Layers3,
  Scan, Search, Shapes, Sparkles, SquareDashed, Repeat2, Upload, UserRound, WandSparkles, X,
  type LucideIcon,
} from 'lucide-react';
import '../catalog.css';

export type NodeCatalogAction = 'upload' | 'references' | 'generator' | 'multi' | 'turnaround' | 'parts'
  | 'smartSeparation' | 'atlas' | 'relativeAtlas' | 'seamless' | 'materialMaps';

export type NodeCatalogProps = {
  anchor: { x: number; y: number };
  connected: boolean;
  canGroupReferences: boolean;
  referenceCount: number;
  onSelect: (action: NodeCatalogAction) => void;
  onClose: () => void;
};

type Category = 'Input' | 'Image' | 'Character' | 'Atlas' | 'Material';
type CatalogItem = { id: NodeCatalogAction; category: Category; label: string; description: string; icon: LucideIcon; tone: string };

const categories: { id: Category; icon: LucideIcon }[] = [
  { id: 'Input', icon: Upload }, { id: 'Image', icon: Image }, { id: 'Character', icon: UserRound },
  { id: 'Atlas', icon: Grid2X2 }, { id: 'Material', icon: Box },
];

const items: CatalogItem[] = [
  { id: 'upload', category: 'Input', label: 'Upload image', description: 'Bring an image into your workspace.', icon: Upload, tone: 'coral' },
  { id: 'references', category: 'Input', label: 'Reference Set', description: 'Collect selected images into a single input.', icon: Images, tone: 'teal' },
  { id: 'generator', category: 'Image', label: 'Generate image', description: 'Create or transform an image with a prompt.', icon: Sparkles, tone: 'coral' },
  { id: 'multi', category: 'Image', label: 'Multi Generate', description: 'Explore several variations from one idea.', icon: Layers3, tone: 'coral' },
  { id: 'turnaround', category: 'Character', label: 'Character Views', description: 'Turn one image into front, side and back views.', icon: UserRound, tone: 'blue' },
  { id: 'parts', category: 'Character', label: 'Character Parts', description: 'Separate a character into reusable parts.', icon: Shapes, tone: 'blue' },
  { id: 'smartSeparation', category: 'Atlas', label: 'Smart Separation', description: 'Find, extract and group individual assets.', icon: Scan, tone: 'amber' },
  { id: 'atlas', category: 'Atlas', label: 'Sprite Atlas', description: 'Pack images into a grid-based sprite sheet.', icon: Grid2X2, tone: 'amber' },
  { id: 'relativeAtlas', category: 'Atlas', label: 'Relative Atlas', description: 'Pack sprites while preserving their proportions.', icon: SquareDashed, tone: 'amber' },
  { id: 'seamless', category: 'Material', label: 'Seamless Texture', description: 'Create a texture that repeats seamlessly.', icon: Repeat2, tone: 'teal' },
  { id: 'materialMaps', category: 'Material', label: 'PBR Material Maps', description: 'Build normal, roughness and other material maps.', icon: WandSparkles, tone: 'teal' },
];

export function NodeCatalog({ anchor, connected, canGroupReferences, referenceCount, onSelect, onClose }: NodeCatalogProps) {
  const [category, setCategory] = useState<Category>(connected ? 'Image' : 'Input');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const id = useId();
  closeRef.current = onClose;

  const tabs = useMemo(() => categories.filter((tab) => !connected || tab.id !== 'Input'), [connected]);
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => (!connected || item.category !== 'Input') && (term
      ? `${item.label} ${item.description} ${item.category}`.toLowerCase().includes(term)
      : item.category === category));
  }, [category, connected, query]);
  const isDisabled = (item: CatalogItem) => item.id === 'references' && !canGroupReferences;
  const selectedItem = results[activeIndex];

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchRef.current?.focus({ preventScroll: true });
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) closeRef.current();
    }
    document.addEventListener('pointerdown', dismissOutside, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    function updatePosition() {
      const panel = panelRef.current;
      if (!panel) return;
      const { width, height } = panel.getBoundingClientRect();
      const margin = 12;
      const left = Math.max(margin, Math.min(anchor.x, window.innerWidth - width - margin));
      const preferredTop = anchor.y + height + margin <= window.innerHeight ? anchor.y : anchor.y - height - margin;
      const top = Math.max(margin, Math.min(preferredTop, window.innerHeight - height - margin));
      setPosition((current) => current.left === left && current.top === top ? current : { left, top });
    }
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener('resize', updatePosition);
    return () => { observer.disconnect(); window.removeEventListener('resize', updatePosition); };
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    const firstEnabled = results.findIndex((item) => item.id !== 'references' || canGroupReferences);
    setActiveIndex(Math.max(0, firstEnabled));
  }, [results, canGroupReferences]);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>(`[data-result-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function select(item: CatalogItem) {
    if (isDisabled(item)) return;
    onSelect(item.id);
    onClose();
  }

  function navigateResults(direction: number) {
    if (!results.length) return;
    for (let step = 1; step <= results.length; step += 1) {
      const next = (activeIndex + direction * step + results.length) % results.length;
      if (!isDisabled(results[next])) {
        setActiveIndex(next);
        searchRef.current?.focus({ preventScroll: true });
        break;
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Prevent canvas shortcuts while typing, browsing tabs or choosing an operation.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      navigateResults(event.key === 'ArrowDown' ? 1 : -1);
    }
    if (event.key === 'Enter' && event.target === searchRef.current && selectedItem) {
      event.preventDefault();
      select(selectedItem);
    }
    if (event.key === 'Tab') {
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  return createPortal(
    <div className="ff-catalog" ref={panelRef} style={position} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={handleKeyDown}>
      <header className="ff-catalog-heading">
        <span><h2 id={`${id}-title`}>{connected ? 'Connect a node' : 'Add a node'}</h2>{connected && <small>Continue from this output</small>}</span>
        <button className="ff-catalog-close" type="button" onClick={onClose} aria-label="Close node catalog"><X size={16} /></button>
      </header>
      <div className="ff-catalog-search">
        <Search size={15} aria-hidden="true" />
        <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes…" aria-label="Search nodes" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-results`} aria-activedescendant={selectedItem ? `${id}-${selectedItem.id}` : undefined} />
        {query && <button type="button" aria-label="Clear node search" onClick={() => { setQuery(''); searchRef.current?.focus(); }}><X size={13} /></button>}
      </div>
      <div className="ff-catalog-tabs" role="tablist" aria-label="Node categories">
        {tabs.map(({ id: tab, icon: Icon }, index) => (
          <button type="button" role="tab" id={`${id}-tab-${tab}`} aria-selected={category === tab && !query.trim()} aria-controls={`${id}-results`} tabIndex={category === tab ? 0 : -1} className={category === tab && !query.trim() ? 'is-active' : ''} key={tab}
            onClick={() => { setCategory(tab); setQuery(''); }}
            onKeyDown={(event) => {
              if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              setCategory(tabs[next].id); setQuery('');
              document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
            }}><Icon size={14} aria-hidden="true" /><span>{tab}</span></button>
        ))}
      </div>
      <div className="ff-catalog-results" id={`${id}-results`} role="listbox" aria-label={query.trim() ? 'Search results' : `${category} nodes`}>
        {results.map((item, index) => {
          const Icon = item.icon;
          const disabled = isDisabled(item);
          return <button type="button" id={`${id}-${item.id}`} key={item.id} role="option" aria-selected={activeIndex === index} aria-disabled={disabled} disabled={disabled} tabIndex={-1} data-result-index={index} className={`ff-catalog-item ${activeIndex === index ? 'is-active' : ''}`} onPointerMove={() => { if (!disabled) setActiveIndex(index); }} onClick={() => select(item)}>
            <span className={`ff-catalog-icon tone-${item.tone}`}><Icon size={16} strokeWidth={1.8} aria-hidden="true" /></span>
            <span className="ff-catalog-item-text"><strong>{item.label}</strong><small>{disabled ? 'Select at least two image nodes on the canvas.' : item.id === 'references' ? `Group ${referenceCount} selected images into one input.` : item.description}</small></span>
            {query.trim() ? <span className="ff-catalog-category">{item.category}</span> : <ChevronRight className="ff-catalog-chevron" size={14} aria-hidden="true" />}
          </button>;
        })}
        {!results.length && <div className="ff-catalog-empty"><Search size={22} /><strong>No matching nodes</strong><span>Try an operation like “image” or “atlas”.</span><button type="button" onClick={() => setQuery('')}>Clear search</button></div>}
      </div>
      <footer className="ff-catalog-footer"><span><Check size={12} />{results.length} {results.length === 1 ? 'operation' : 'operations'}</span><span><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> add</span><ArrowUpRight size={12} aria-hidden="true" /></footer>
    </div>,
    document.body,
  );
}
