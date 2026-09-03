import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore,
  Archive,
  CheckSquare2,
  Clock3,
  Download,
  Expand,
  Grid2X2,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Square,
  Square as SquareSelect,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { generatedImageDownloadUrl } from '../api';
import type { AssetRecord, GenerationJob } from '../types';

type GalleryProps = {
  open: boolean;
  assets: AssetRecord[];
  loading: boolean;
  compare: [AssetRecord | null, AssetRecord | null];
  onClose: () => void;
  onRefresh: () => void;
  onAdd: (asset: AssetRecord) => void;
  onOpen: (asset: AssetRecord) => void;
  onCompare: (slot: 0 | 1, asset: AssetRecord) => void;
  onTrash: (asset: AssetRecord) => void;
  onRestore: (asset: AssetRecord) => void;
  onPurge: (asset: AssetRecord) => void;
  onExport: (assets: AssetRecord[]) => void;
  onOpenSpriteSheet: (assets: AssetRecord[]) => void;
  onOpenCompare: () => void;
};

export function GalleryPanel({ open, assets, loading, compare, onClose, onRefresh, onAdd, onOpen, onCompare, onTrash, onRestore, onPurge, onExport, onOpenSpriteSheet, onOpenCompare }: GalleryProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | AssetRecord['kind'] | 'trash'>('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const filtered = useMemo(() => assets.filter((asset) => {
    const matchesKind = kind === 'trash' ? Boolean(asset.deletedAt) : !asset.deletedAt && (kind === 'all' || asset.kind === kind);
    const haystack = `${asset.name} ${asset.metadata?.prompt || ''}`.toLowerCase();
    return matchesKind && haystack.includes(query.toLowerCase());
  }), [assets, kind, query]);
  const selectedAssets = useMemo(() => assets.filter((asset) => selected.has(asset.id) && !asset.deletedAt), [assets, selected]);

  useEffect(() => {
    setSelected((current) => {
      const available = new Set(assets.filter((asset) => !asset.deletedAt).map((asset) => asset.id));
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [assets]);

  function toggleSelected(asset: AssetRecord) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id);
      return next;
    });
  }

  if (!open) return null;
  return (
    <aside className={`workspace-drawer gallery-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="drawer-head">
        <div><span className="drawer-kicker">Local assets</span><h2>Gallery</h2></div>
        <div className="drawer-head-actions"><button onClick={onRefresh} aria-label="Refresh gallery"><RefreshCw size={14} /></button><button onClick={onClose} aria-label="Close gallery"><X size={16} /></button></div>
      </div>
      <div className="gallery-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files and prompts" /></div>
      <div className="gallery-tabs">
        {(['all', 'generated', 'source', 'trash'] as const).map((tab) => <button className={kind === tab ? 'active' : ''} key={tab} onClick={() => setKind(tab)}>{tab}{tab === 'trash' && assets.some((asset) => asset.deletedAt) ? ` ${assets.filter((asset) => asset.deletedAt).length}` : ''}</button>)}
      </div>
      {kind !== 'trash' && selectedAssets.length > 0 && <div className="asset-workbench" role="toolbar" aria-label="Selected asset actions">
        <strong>{selectedAssets.length} selected</strong>
        <button onClick={() => onExport(selectedAssets)}><Archive size={12} /> Export ZIP</button>
        <button onClick={() => onOpenSpriteSheet(selectedAssets)}><Grid2X2 size={12} /> Sprite sheet</button>
        <button className="clear-selection" onClick={() => setSelected(new Set())} aria-label="Clear selected assets"><X size={12} /></button>
      </div>}
      {compare[0] && compare[1] && <button className="compare-ready" onClick={onOpenCompare}><Expand size={13} /> Compare A / B</button>}
      <div className="asset-grid">
        {loading && <div className="drawer-empty"><LoaderCircle className="spin" size={20} /> Loading local files</div>}
        {!loading && filtered.length === 0 && <div className="drawer-empty"><ImageIcon size={20} /> No matching assets</div>}
        {filtered.map((asset) => (
          <article className={`asset-card ${selected.has(asset.id) ? 'selected' : ''} ${asset.deletedAt ? 'trashed' : ''}`} key={asset.id}>
            <div className="asset-thumb-wrap">
              <button className="asset-thumb" onClick={() => asset.deletedAt ? undefined : onOpen(asset)}><img src={asset.thumbnailUrl || asset.url} alt={asset.name} loading="lazy" /></button>
              {!asset.deletedAt && <button className="asset-select" aria-label={`${selected.has(asset.id) ? 'Deselect' : 'Select'} ${asset.name}`} aria-pressed={selected.has(asset.id)} onClick={() => toggleSelected(asset)}>{selected.has(asset.id) ? <CheckSquare2 size={14} /> : <SquareSelect size={14} />}</button>}
            </div>
            <div className="asset-info"><strong title={asset.name}>{asset.name}</strong><small>{asset.deletedAt ? `trashed · ${formatDate(asset.deletedAt)}` : `${asset.kind} · ${formatBytes(asset.size)}`}</small></div>
            {asset.deletedAt ? <div className="asset-actions trash-actions">
              <button title="Restore asset" onClick={() => onRestore(asset)}><ArchiveRestore size={12} /> Restore</button>
              <button className="danger" title="Delete permanently" onClick={() => { if (window.confirm(`Permanently delete ${asset.name}? This cannot be undone.`)) onPurge(asset); }}><Trash2 size={12} /> Delete</button>
            </div> : <div className="asset-actions">
              <button title="Add to canvas" onClick={() => onAdd(asset)}><Plus size={12} /></button>
              <button className={compare[0]?.id === asset.id ? 'active' : ''} title="Set as compare A" onClick={() => onCompare(0, asset)}>A</button>
              <button className={compare[1]?.id === asset.id ? 'active' : ''} title="Set as compare B" onClick={() => onCompare(1, asset)}>B</button>
              <a title="Download" href={generatedImageDownloadUrl(asset.url)}><Download size={12} /></a>
              <button className="danger" title="Move to trash" onClick={() => onTrash(asset)}><Trash2 size={12} /></button>
            </div>}
          </article>
        ))}
      </div>
    </aside>
  );
}

type PreviewState = { primary: { url: string; title: string; sourceUrl?: string }; secondary?: { url: string; title: string } };

export function PreviewModal({ preview, onClose }: { preview: PreviewState | null; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [split, setSplit] = useState(50);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!preview) return;
    setZoom(1);
    setSplit(50);
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, onClose]);

  if (!preview) return null;
  const compareUrl = preview.secondary?.url || preview.primary.sourceUrl;

  return (
    <div className="preview-backdrop" role="dialog" aria-modal="true" aria-label="Image inspector" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="preview-modal">
        <header>
          <div><span className="drawer-kicker">Image inspector</span><h2>{preview.primary.title}</h2></div>
          <div className="preview-tools">
            <button onClick={() => setZoom((value) => Math.max(1, value / 2))} aria-label="Zoom out"><ZoomOut size={15} /></button>
            <span>{zoom}×</span>
            <button onClick={() => setZoom((value) => Math.min(4, value * 2))} aria-label="Zoom in"><ZoomIn size={15} /></button>
            <a href={generatedImageDownloadUrl(preview.primary.url)} title="Download image"><Download size={15} /></a>
            <button ref={closeButton} onClick={onClose} aria-label="Close image inspector"><X size={17} /></button>
          </div>
        </header>
        <div className={`preview-stage zoom-${zoom}`}>
          <div className="preview-scroll">
            <div className="preview-image-stack" style={{ transform: `scale(${zoom})` }}>
              <img src={compareUrl || preview.primary.url} alt="Comparison base" draggable={false} />
              {compareUrl && <div className="preview-overlay" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}><img src={preview.primary.url} alt={preview.primary.title} draggable={false} /></div>}
            </div>
          </div>
          {compareUrl && <div className="compare-control"><span>A</span><input type="range" min="0" max="100" value={split} onChange={(event) => setSplit(Number(event.target.value))} aria-label="Comparison split" /><span>B</span></div>}
        </div>
      </section>
    </div>
  );
}

type JobsProps = {
  open: boolean;
  jobs: GenerationJob[];
  onClose: () => void;
  onRefresh: () => void;
  onCancel: (job: GenerationJob) => void;
  onRetry: (job: GenerationJob) => void;
};

export function JobsDrawer({ open, jobs, onClose, onRefresh, onCancel, onRetry }: JobsProps) {
  const active = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length;
  if (!open) return null;
  return (
    <aside className={`workspace-drawer jobs-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="drawer-head">
        <div><span className="drawer-kicker">{active} active</span><h2>Generation queue</h2></div>
        <div className="drawer-head-actions"><button onClick={onRefresh} aria-label="Refresh jobs"><RefreshCw size={14} /></button><button onClick={onClose} aria-label="Close jobs"><X size={16} /></button></div>
      </div>
      <div className="jobs-list">
        {jobs.length === 0 && <div className="drawer-empty"><Clock3 size={20} /> Queue is empty</div>}
        {jobs.map((job) => {
          const busy = job.status === 'queued' || job.status === 'running';
          return <article className={`job-row status-${job.status}`} key={job.id}>
            <div className="job-state">{busy ? <LoaderCircle className="spin" size={15} /> : job.status === 'completed' ? <ArchiveRestore size={15} /> : <Clock3 size={15} />}</div>
            <div><strong>{job.progress || job.status}</strong><small>{job.provider} · {job.id.slice(0, 8)}{job.queuePosition ? ` · #${job.queuePosition}` : ''}</small>{job.error && <p>{job.error}</p>}</div>
            <div className="job-actions">{busy ? <button title="Stop job" onClick={() => onCancel(job)}><Square size={12} /></button> : (job.status === 'failed' || job.status === 'cancelled' || job.status === 'interrupted') && <button title="Retry job" onClick={() => onRetry(job)}><RefreshCw size={12} /></button>}</div>
          </article>;
        })}
      </div>
    </aside>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'unknown size';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export type { PreviewState };
