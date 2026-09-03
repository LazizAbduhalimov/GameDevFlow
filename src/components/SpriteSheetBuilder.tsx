import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Download, Grid2X2, Image as ImageIcon, LoaderCircle, X } from 'lucide-react';
import { saveLocalBlob } from '../api';
import type { AssetRecord } from '../types';

type SpriteSheetBuilderProps = {
  open: boolean;
  assets: AssetRecord[];
  onClose: () => void;
  onExportSources: (assets: AssetRecord[]) => void;
};

type LoadedFrame = { asset: AssetRecord; image: HTMLImageElement };

export function SpriteSheetBuilder({ open, assets, onClose, onExportSources }: SpriteSheetBuilderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const manifestRef = useRef<Record<string, unknown> | null>(null);
  const [columns, setColumns] = useState(4);
  const [cellSize, setCellSize] = useState(256);
  const [padding, setPadding] = useState(0);
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [background, setBackground] = useState<'transparent' | 'dark' | 'light'>('transparent');
  const [pixelEdges, setPixelEdges] = useState(false);
  const [name, setName] = useState('character-sprite-sheet');
  const [renderState, setRenderState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const safeColumns = Math.max(1, Math.min(columns, Math.max(1, assets.length)));
  const rows = Math.max(1, Math.ceil(assets.length / safeColumns));
  const dimensions = useMemo(() => ({
    width: safeColumns * cellSize + (safeColumns + 1) * padding,
    height: rows * cellSize + (rows + 1) * padding,
  }), [cellSize, padding, rows, safeColumns]);

  useEffect(() => {
    if (!open || !assets.length) return;
    setColumns((value) => Math.min(Math.max(1, value), assets.length));
    let cancelled = false;
    setRenderState('loading');

    void loadFrames(assets).then((frames) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) throw new Error('Canvas is not available.');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = !pixelEdges;
      context.imageSmoothingQuality = pixelEdges ? 'low' : 'high';
      if (background !== 'transparent') {
        context.fillStyle = background === 'dark' ? '#0e110e' : '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      const manifestFrames = frames.map(({ asset, image }, index) => {
        const column = index % safeColumns;
        const row = Math.floor(index / safeColumns);
        const x = padding + column * (cellSize + padding);
        const y = padding + row * (cellSize + padding);
        drawFrame(context, image, x, y, cellSize, fit);
        return {
          id: asset.id,
          name: asset.name,
          source: asset.url,
          frame: { x, y, width: cellSize, height: cellSize },
          sourceSize: { width: image.naturalWidth, height: image.naturalHeight },
          grid: { column, row },
        };
      });

      manifestRef.current = {
        schemaVersion: 1,
        image: null,
        width: canvas.width,
        height: canvas.height,
        columns: safeColumns,
        rows,
        cellSize,
        padding,
        fit,
        background,
        pixelEdges,
        frames: manifestFrames,
      };
      setRenderState('ready');
    }).catch(() => { if (!cancelled) setRenderState('error'); });

    return () => { cancelled = true; };
  }, [assets, background, cellSize, dimensions.height, dimensions.width, fit, open, padding, pixelEdges, rows, safeColumns]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  function downloadPng() {
    canvasRef.current?.toBlob((blob) => {
      if (blob) saveLocalBlob(blob, `${safeName(name)}.png`);
    }, 'image/png');
  }

  function downloadManifest() {
    if (!manifestRef.current) return;
    const manifest = { ...manifestRef.current, image: `${safeName(name)}.png` };
    saveLocalBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), `${safeName(name)}.json`);
  }

  return (
    <aside className="workspace-drawer sprite-builder open" aria-label="Sprite sheet builder">
      <div className="drawer-head">
        <div><span className="drawer-kicker">{assets.length} frames · {dimensions.width} × {dimensions.height}</span><h2>Sprite sheet</h2></div>
        <div className="drawer-head-actions"><button onClick={onClose} aria-label="Close sprite sheet builder"><X size={16} /></button></div>
      </div>

      <div className="sprite-controls">
        <label className="wide"><span>Output name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>Columns</span><select value={safeColumns} onChange={(event) => setColumns(Number(event.target.value))}>{Array.from({ length: Math.min(8, Math.max(1, assets.length)) }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
        <label><span>Cell</span><select value={cellSize} onChange={(event) => setCellSize(Number(event.target.value))}>{[64, 128, 256, 512].map((size) => <option key={size} value={size}>{size}px</option>)}</select></label>
        <label><span>Padding</span><select value={padding} onChange={(event) => setPadding(Number(event.target.value))}>{[0, 2, 4, 8, 16, 32].map((size) => <option key={size} value={size}>{size}px</option>)}</select></label>
        <label><span>Fit</span><select value={fit} onChange={(event) => setFit(event.target.value as 'contain' | 'cover')}><option value="contain">Contain</option><option value="cover">Cover</option></select></label>
        <label><span>Background</span><select value={background} onChange={(event) => setBackground(event.target.value as typeof background)}><option value="transparent">Transparent</option><option value="dark">Dark</option><option value="light">Light</option></select></label>
        <label className="sprite-toggle"><input type="checkbox" checked={pixelEdges} onChange={(event) => setPixelEdges(event.target.checked)} /><span>Pixel edges</span></label>
      </div>

      <div className="sprite-frame-strip" aria-label="Frame order">
        {assets.map((asset, index) => <div key={asset.id} title={asset.name}><b>{index + 1}</b><img src={asset.thumbnailUrl || asset.url} alt="" /></div>)}
      </div>

      <div className="sprite-preview">
        {renderState === 'loading' && <div className="sprite-status"><LoaderCircle className="spin" size={19} /> Rendering sheet</div>}
        {renderState === 'error' && <div className="sprite-status error"><ImageIcon size={19} /> One or more images could not be loaded</div>}
        {!assets.length && <div className="sprite-status"><Grid2X2 size={19} /> Select images in Gallery first</div>}
        <canvas ref={canvasRef} aria-label="Sprite sheet preview" />
      </div>

      <div className="sprite-actions">
        <button className="secondary-action" disabled={!assets.length} onClick={() => onExportSources(assets)}><Archive size={14} /> Export source ZIP</button>
        <button className="secondary-action" disabled={renderState !== 'ready'} onClick={downloadManifest}><Download size={14} /> Download JSON</button>
        <button className="primary-action" disabled={renderState !== 'ready'} onClick={downloadPng}><Download size={14} /> Download PNG</button>
      </div>
    </aside>
  );
}

async function loadFrames(assets: AssetRecord[]): Promise<LoadedFrame[]> {
  return Promise.all(assets.map((asset) => new Promise<LoadedFrame>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve({ asset, image });
    image.onerror = reject;
    image.src = asset.url;
  })));
}

function drawFrame(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, cellSize: number, fit: 'contain' | 'cover') {
  const scale = fit === 'cover'
    ? Math.max(cellSize / image.naturalWidth, cellSize / image.naturalHeight)
    : Math.min(cellSize / image.naturalWidth, cellSize / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.save();
  context.beginPath();
  context.rect(x, y, cellSize, cellSize);
  context.clip();
  context.drawImage(image, x + (cellSize - width) / 2, y + (cellSize - height) / 2, width, height);
  context.restore();
}

function safeName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'sprite-sheet';
}
