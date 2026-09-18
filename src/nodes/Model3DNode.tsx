import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Blend, Box, Check, Component, Download, Grid3X3, LoaderCircle, Rotate3D, Sun, TriangleAlert } from 'lucide-react';
import type { Model3DNodeData } from '../types';

type ViewerState = 'idle' | 'loading' | 'loaded' | 'error';
type DisplayMode = { wireframe: boolean; shadedSmooth: boolean; lighting: boolean };

function asMaterials(material: any): any[] {
  return (Array.isArray(material) ? material : [material]).filter(Boolean);
}

function disposeMaterials(materials: any[], disposeTextures: boolean) {
  materials.forEach((material: any) => {
    if (disposeTextures) {
      Object.values(material).forEach((value: any) => {
        if (value?.isTexture) value.dispose?.();
      });
    }
    material.dispose?.();
  });
}

function disposeScene(root: { traverse: (callback: (object: any) => void) => void }) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const current = asMaterials(object.material);
    const lit = object.userData?.__litMaterial;
    const unlit = object.userData?.__unlitMaterial;
    disposeMaterials(lit ? asMaterials(lit) : current, true);
    if (unlit) disposeMaterials(asMaterials(unlit), false);
  });
}

function toUnlitMaterial(THREE: any, material: any) {
  const unlit = new THREE.MeshBasicMaterial();
  if (material.color) unlit.color.copy(material.color);
  unlit.map = material.map ?? null;
  unlit.alphaMap = material.alphaMap ?? null;
  unlit.transparent = Boolean(material.transparent);
  unlit.opacity = material.opacity ?? 1;
  unlit.side = material.side;
  unlit.vertexColors = Boolean(material.vertexColors);
  unlit.alphaTest = material.alphaTest ?? 0;
  unlit.toneMapped = false;
  unlit.flatShading = Boolean(material.flatShading);
  return unlit;
}

function ensureWireframe(THREE: any, mesh: any) {
  if (mesh.getObjectByName('__tripoWireframe')) return;
  const lines = new THREE.LineSegments(
    new THREE.WireframeGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0xf4f1ea, transparent: true, opacity: 0.62, depthTest: true }),
  );
  lines.name = '__tripoWireframe';
  lines.raycast = () => {};
  mesh.add(lines);
}

function TripoModelPreview({
  modelUrl,
  display,
  onStateChange,
}: {
  modelUrl: string;
  display: DisplayMode;
  onStateChange: Dispatch<SetStateAction<ViewerState>>;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const displayRef = useRef(display);
  const applyDisplayRef = useRef<(mode: DisplayMode) => void>(() => {});
  displayRef.current = display;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let cancelled = false;
    let animationFrame = 0;
    let dispose = () => {};
    onStateChange('loading');

    void (async () => {
      const [THREE, { GLTFLoader }, { OrbitControls }, { MeshoptDecoder }] = await Promise.all([
        import('three'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      if (cancelled) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.domElement.className = 'tripo-model-canvas';
      mount.replaceChildren(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.15;
      controls.minDistance = 0.2;
      controls.maxDistance = 80;

      const lights = new THREE.Group();
      lights.add(new THREE.HemisphereLight(0xf5efff, 0x15121d, 2.4));
      const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
      keyLight.position.set(3, 5, 4);
      lights.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0xa78bfa, 2.1);
      rimLight.position.set(-4, 2, -3);
      lights.add(rimLight);
      scene.add(lights);

      let modelRoot: { traverse: (callback: (object: any) => void) => void } | null = null;
      const applyDisplay = (mode: DisplayMode) => {
        lights.visible = mode.lighting;
        renderer.toneMapping = mode.lighting ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
        if (!modelRoot) return;
        modelRoot.traverse((object: any) => {
          if (!object.isMesh) return;
          if (mode.wireframe) ensureWireframe(THREE, object);
          const overlay = object.getObjectByName('__tripoWireframe');
          if (overlay) overlay.visible = mode.wireframe;
          if (!object.userData.__litMaterial) object.userData.__litMaterial = object.material;
          if (!object.userData.__unlitMaterial) {
            const source = object.userData.__litMaterial;
            object.userData.__unlitMaterial = Array.isArray(source)
              ? source.map((material: any) => toUnlitMaterial(THREE, material))
              : toUnlitMaterial(THREE, source);
          }
          object.material = mode.lighting ? object.userData.__litMaterial : object.userData.__unlitMaterial;
          asMaterials(object.material).forEach((material: any) => {
            if ('flatShading' in material && material.flatShading !== !mode.shadedSmooth) {
              material.flatShading = !mode.shadedSmooth;
              material.needsUpdate = true;
            }
            if ('polygonOffset' in material) {
              material.polygonOffset = mode.wireframe;
              material.polygonOffsetFactor = mode.wireframe ? 1 : 0;
              material.polygonOffsetUnits = mode.wireframe ? 1 : 0;
            }
          });
        });
      };
      applyDisplayRef.current = applyDisplay;
      applyDisplay(displayRef.current);

      const resize = () => {
        const width = Math.max(mount.clientWidth, 1);
        const height = Math.max(mount.clientHeight, 1);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);
      resize();

      const render = () => {
        animationFrame = requestAnimationFrame(render);
        controls.update();
        renderer.render(scene, camera);
      };
      render();

      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.load(modelUrl, (gltf) => {
        if (cancelled) {
          disposeScene(gltf.scene);
          return;
        }
        modelRoot = gltf.scene;
        scene.add(gltf.scene);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        const radius = Math.max(sphere.radius, 0.01);
        controls.target.copy(sphere.center);
        camera.position.set(sphere.center.x + radius * 1.35, sphere.center.y + radius * 0.7, sphere.center.z + radius * 2.1);
        camera.near = Math.max(radius / 100, 0.01);
        camera.far = Math.max(radius * 100, 100);
        camera.updateProjectionMatrix();
        controls.update();
        applyDisplay(displayRef.current);
        onStateChange('loaded');
      }, undefined, () => onStateChange('error'));

      dispose = () => {
        applyDisplayRef.current = () => {};
        resizeObserver.disconnect();
        controls.dispose();
        scene.children.forEach((child) => disposeScene(child));
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => onStateChange('error'));

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      dispose();
    };
  }, [modelUrl, onStateChange]);

  useEffect(() => {
    applyDisplayRef.current(display);
  }, [display]);

  return <div ref={mountRef} className="tripo-model-preview" aria-label="Interactive 3D model preview" />;
}

export default function Model3DNode({ id, data, selected }: NodeProps) {
  const nodeData = data as Model3DNodeData;
  const ready = nodeData.status === 'ready' && Boolean(nodeData.modelUrl);
  const [viewerState, setViewerState] = useState<ViewerState>('idle');
  const [wireframe, setWireframe] = useState(false);
  const [shadedSmooth, setShadedSmooth] = useState(true);
  const [lighting, setLighting] = useState(true);
  const display = useMemo(() => ({ wireframe, shadedSmooth, lighting }), [wireframe, shadedSmooth, lighting]);

  useEffect(() => {
    if (!ready) setViewerState('idle');
  }, [ready]);

  return (
    <article className={`studio-node model-3d-node status-${nodeData.status} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle input-handle model-input-handle" aria-label="Tripo source" />
      <div className="node-cap model-cap">
        <span className="node-kind"><Box size={13} /> Tripo model</span>
        <span className="node-code">GLB</span>
      </div>

      <div className="model-stage nodrag nowheel">
        {ready ? <TripoModelPreview modelUrl={nodeData.modelUrl!} display={display} onStateChange={setViewerState} /> : <div className="model-waiting">
          {nodeData.status === 'failed' ? <TriangleAlert size={28} /> : <LoaderCircle className="spin" size={28} />}
          <strong>{nodeData.status === 'failed' ? 'Import failed' : 'Waiting for Tripo'}</strong>
          <span>{nodeData.status === 'waiting' ? 'Press Generate in Tripo Studio' : nodeData.error || 'Generating and copying the GLB locally…'}</span>
          <button type="button" onClick={() => nodeData.onRecover?.(id)}>Check ready model</button>
        </div>}
        {ready && viewerState === 'loading' && <div className="model-viewer-message"><LoaderCircle className="spin" size={18} /><span>Loading local GLB…</span></div>}
        {ready && viewerState === 'error' && <div className="model-viewer-message error"><TriangleAlert size={18} /><span>Preview could not open this GLB.</span><button type="button" onClick={() => nodeData.onRecover?.(id)}>Recover from Tripo</button></div>}
        {ready && <div className="model-view-toggles nodrag" role="toolbar" aria-label="Model display">
          <button type="button" className={wireframe ? 'is-on' : ''} aria-pressed={wireframe} title="Wireframe overlay" onClick={() => setWireframe((value) => !value)}>
            <Grid3X3 size={12} /> Wire
          </button>
          <button type="button" className={shadedSmooth ? 'is-on' : ''} aria-pressed={shadedSmooth} title="Smooth shading. Off shows low-poly faces" onClick={() => setShadedSmooth((value) => !value)}>
            <Blend size={12} /> Smooth
          </button>
          <button type="button" className={lighting ? 'is-on' : ''} aria-pressed={lighting} title="Studio lighting. Off is unlit" onClick={() => setLighting((value) => !value)}>
            <Sun size={12} /> Lights
          </button>
        </div>}
        {ready && <div className="model-orbit-hint"><Rotate3D size={11} /> Drag to orbit · wheel to zoom</div>}
      </div>

      <div className="model-meta">
        <span className={`model-status ${nodeData.status}`}>{ready ? <Check size={11} /> : nodeData.status === 'failed' ? <TriangleAlert size={11} /> : <LoaderCircle className="spin" size={11} />}{ready ? 'Local model ready' : nodeData.status === 'failed' ? 'Capture failed' : `${Math.round(nodeData.progress || 0)}% · listening`}</span>
        {nodeData.taskId && <small title={nodeData.taskId}>{nodeData.taskId}</small>}
      </div>
      {ready && <div className="model-actions nodrag">
        <button type="button" onClick={() => nodeData.onDownload?.(id)}><Download size={12} /> Download GLB</button>
        <button type="button" disabled={nodeData.unityBusy} onClick={() => nodeData.onSendToUnity?.(id)}>{nodeData.unityBusy ? <LoaderCircle className="spin" size={12} /> : <Component size={12} />} Unity</button>
        <button type="button" onClick={() => nodeData.onRecover?.(id)}><Rotate3D size={12} /> Refresh from Tripo</button>
        <span title={nodeData.fileName}>{nodeData.fileName || 'Tripo model.glb'}</span>
      </div>}
      <Handle type="source" position={Position.Right} className="flow-handle output-handle model-output-handle" aria-label="3D model output" />
    </article>
  );
}
