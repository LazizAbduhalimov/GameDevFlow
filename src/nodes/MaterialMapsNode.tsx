import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Check, Component, Download, Expand, Layers3, LoaderCircle, Package, SlidersHorizontal, Trash2 } from 'lucide-react';
import { InspectablePreview } from '../components/InspectablePreview';
import type { MaterialMapKey, MaterialMapsNodeData } from '../types';

const mapKeys: MaterialMapKey[] = ['baseColor', 'normal', 'height', 'roughness', 'metallic', 'ambientOcclusion', 'orm'];

export default function MaterialMapsNode({ id, data, selected }: NodeProps) {
  const nodeData = data as MaterialMapsNodeData;
  const busy = nodeData.status === 'building';
  const readyMaps = mapKeys.filter((key) => Boolean(nodeData.maps[key]?.outputUrl));
  const allReady = readyMaps.length === mapKeys.length;
  const change = (patch: Partial<MaterialMapsNodeData['settings']>) => nodeData.onSettingsChange?.(id, patch);

  return (
    <article className={`studio-node material-maps-node status-${nodeData.status} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle input-handle material-input-handle" aria-label="Base color texture input" />
      <div className="node-cap material-cap">
        <span className="node-kind"><Layers3 size={13} /> Material maps</span>
        <span className="node-code">PBR · 7</span>
      </div>

      <div className="material-map-stage">
        <div className="material-map-grid">
          {mapKeys.map((key) => {
            const map = nodeData.maps[key];
            return <section className={`material-map-cell ${map.outputUrl ? 'ready' : ''}`} key={key}>
            <header><strong>{map.title}</strong><small>{map.outputUrl ? 'ready' : 'empty'}</small></header>
            {map.outputUrl ? (
              <InspectablePreview
                className="material-map-preview"
                ariaLabel={`Inspect ${map.title}`}
                title="Drag to move, click to inspect"
                onInspect={() => nodeData.onOpen?.(map.outputUrl!, `${nodeData.title} · ${map.title}`)}
              >
                <img src={map.outputUrl} alt={map.title} draggable={false} />
                <Expand size={11} />
              </InspectablePreview>
            ) : <div className="material-map-empty"><Layers3 size={18} /></div>}
            <div className="material-map-actions nodrag">
              <button disabled={!map.outputUrl} title={`Download ${map.title}`} aria-label={`Download ${map.title}`} onClick={() => nodeData.onDownloadMap?.(id, key)}><Download size={10} /></button>
              <button className="danger" disabled={!map.outputUrl || key === 'baseColor'} title={key === 'baseColor' ? 'Base color belongs to the source node' : `Move ${map.title} to trash`} aria-label={`Delete ${map.title}`} onClick={() => nodeData.onDeleteMap?.(id, key)}><Trash2 size={10} /></button>
            </div>
            </section>;
          })}
        </div>
        <div className="material-port-rail" aria-label="Material map outputs">
          {mapKeys.map((key) => <div key={key}><span>{portLabel(key)}</span><Handle type="source" id={key} position={Position.Right} className={`flow-handle material-map-handle ${nodeData.maps[key].outputUrl ? 'ready' : ''}`} aria-label={`${nodeData.maps[key].title} output`} /></div>)}
        </div>
      </div>

      <div className={`material-all-output ${allReady ? 'ready' : ''}`}>
        <span><Package size={12} /> All maps</span><small>{readyMaps.length} / {mapKeys.length} ready</small>
        <Handle type="source" id="all" position={Position.Right} className="flow-handle material-all-handle" aria-label="All material maps output" />
      </div>

      <fieldset className="material-settings nodrag" disabled={busy}>
        <legend><SlidersHorizontal size={11} /> Map authoring</legend>
        <label>Normal <input aria-label="Normal strength" type="range" min="0.5" max="6" step="0.25" value={nodeData.settings.normalStrength} onChange={(event) => change({ normalStrength: Number(event.target.value) })} /><small>{nodeData.settings.normalStrength.toFixed(2)}</small></label>
        <label>Height <input aria-label="Height contrast" type="range" min="0.5" max="3" step="0.1" value={nodeData.settings.heightContrast} onChange={(event) => change({ heightContrast: Number(event.target.value) })} /><small>{nodeData.settings.heightContrast.toFixed(1)}</small></label>
        <label>Roughness <input aria-label="Roughness level" type="range" min="0" max="1" step="0.05" value={nodeData.settings.roughnessLevel} onChange={(event) => change({ roughnessLevel: Number(event.target.value) })} /><small>{nodeData.settings.roughnessLevel.toFixed(2)}</small></label>
        <label>Metallic <input aria-label="Metallic level" type="range" min="0" max="1" step="0.05" value={nodeData.settings.metallicLevel} onChange={(event) => change({ metallicLevel: Number(event.target.value) })} /><small>{nodeData.settings.metallicLevel.toFixed(2)}</small></label>
        <label>AO <input aria-label="Ambient occlusion strength" type="range" min="0" max="8" step="0.25" value={nodeData.settings.aoStrength} onChange={(event) => change({ aoStrength: Number(event.target.value) })} /><small>{nodeData.settings.aoStrength.toFixed(1)}</small></label>
        <label className="material-select">Normal Y<select aria-label="Normal map convention" value={nodeData.settings.normalFormat} onChange={(event) => change({ normalFormat: event.target.value as 'opengl' | 'directx' })}><option value="opengl">OpenGL +Y</option><option value="directx">DirectX -Y</option></select></label>
        <label className="material-toggle"><input aria-label="Invert height map" type="checkbox" checked={nodeData.settings.invertHeight} onChange={(event) => change({ invertHeight: event.target.checked })} /> Invert height</label>
      </fieldset>

      {nodeData.error && <p className="node-error material-error"><AlertTriangle size={12} /> {nodeData.error}</p>}
      <div className="material-actions nodrag">
        <button type="button" className="node-action primary material-build" disabled={busy || !nodeData.inputUrl} onClick={() => nodeData.onBuild?.(id)}>{busy ? <LoaderCircle className="spin" size={12} /> : <Layers3 size={12} />} {busy ? 'Building maps…' : allReady ? 'Rebuild maps' : 'Build & save maps'}</button>
        <button type="button" className="node-action material-export" disabled={!allReady} onClick={() => nodeData.onExport?.(id)}><Package size={12} /> Export ZIP</button>
        <button type="button" className="node-action material-export" disabled={!allReady || nodeData.unityBusy} onClick={() => nodeData.onSendToUnity?.(id)}>{nodeData.unityBusy ? <LoaderCircle className="spin" size={12} /> : <Component size={12} />} Unity</button>
        <button type="button" className="material-json" disabled={!nodeData.manifest} onClick={() => nodeData.onDownloadManifest?.(id)}><Download size={10} /> JSON</button>
      </div>
      {allReady && <div className="material-ready-note"><Check size={10} /> Same resolution · repeat-ready edges · locally saved</div>}
    </article>
  );
}

function portLabel(key: MaterialMapKey) {
  return key === 'baseColor' ? 'BC' : key === 'ambientOcclusion' ? 'AO' : key === 'roughness' ? 'RGH' : key === 'metallic' ? 'MTL' : key.slice(0, 3).toUpperCase();
}
