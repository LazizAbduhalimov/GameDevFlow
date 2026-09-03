import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, Check, Download, LoaderCircle, Rotate3D, TriangleAlert } from 'lucide-react';
import type { Model3DNodeData } from '../types';

type ViewerState = 'idle' | 'loading' | 'loaded' | 'error';

function disposeScene(root: { traverse: (callback: (object: any) => void) => void }) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials: any[] = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material: any) => {
      Object.values(material).forEach((value: any) => {
        if (value?.isTexture) value.dispose?.();
      });
      material.dispose?.();
    });
  });
}

function TripoModelPreview({ modelUrl, onStateChange }: { modelUrl: string; onStateChange: Dispatch<SetStateAction<ViewerState>> }) {
  const mountRef = useRef<HTMLDivElement | null>(null);

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
      scene.add(new THREE.HemisphereLight(0xf5efff, 0x15121d, 2.4));
      const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
      keyLight.position.set(3, 5, 4);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0xa78bfa, 2.1);
      rimLight.position.set(-4, 2, -3);
      scene.add(rimLight);

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
        const model = gltf.scene;
        scene.add(model);
        const bounds = new THREE.Box3().setFromObject(model);
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        const radius = Math.max(sphere.radius, 0.01);
        controls.target.copy(sphere.center);
        camera.position.set(sphere.center.x + radius * 1.35, sphere.center.y + radius * 0.7, sphere.center.z + radius * 2.1);
        camera.near = Math.max(radius / 100, 0.01);
        camera.far = Math.max(radius * 100, 100);
        camera.updateProjectionMatrix();
        controls.update();
        onStateChange('loaded');
      }, undefined, () => onStateChange('error'));

      dispose = () => {
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

  return <div ref={mountRef} className="tripo-model-preview" aria-label="Interactive 3D model preview" />;
}

export default function Model3DNode({ id, data, selected }: NodeProps) {
  const nodeData = data as Model3DNodeData;
  const ready = nodeData.status === 'ready' && Boolean(nodeData.modelUrl);
  const [viewerState, setViewerState] = useState<ViewerState>('idle');

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
        {ready ? <TripoModelPreview modelUrl={nodeData.modelUrl!} onStateChange={setViewerState} /> : <div className="model-waiting">
          {nodeData.status === 'failed' ? <TriangleAlert size={28} /> : <LoaderCircle className="spin" size={28} />}
          <strong>{nodeData.status === 'failed' ? 'Import failed' : 'Waiting for Tripo'}</strong>
          <span>{nodeData.status === 'waiting' ? 'Press Generate in Tripo Studio' : nodeData.error || 'Generating and copying the GLB locally…'}</span>
          <button type="button" onClick={() => nodeData.onRecover?.(id)}>Check ready model</button>
        </div>}
        {ready && viewerState === 'loading' && <div className="model-viewer-message"><LoaderCircle className="spin" size={18} /><span>Loading local GLB…</span></div>}
        {ready && viewerState === 'error' && <div className="model-viewer-message error"><TriangleAlert size={18} /><span>Preview could not open this GLB.</span><button type="button" onClick={() => nodeData.onRecover?.(id)}>Recover from Tripo</button></div>}
        {ready && <div className="model-orbit-hint"><Rotate3D size={11} /> Drag to orbit · wheel to zoom</div>}
      </div>

      <div className="model-meta">
        <span className={`model-status ${nodeData.status}`}>{ready ? <Check size={11} /> : nodeData.status === 'failed' ? <TriangleAlert size={11} /> : <LoaderCircle className="spin" size={11} />}{ready ? 'Local model ready' : nodeData.status === 'failed' ? 'Capture failed' : `${Math.round(nodeData.progress || 0)}% · listening`}</span>
        {nodeData.taskId && <small title={nodeData.taskId}>{nodeData.taskId}</small>}
      </div>
      {ready && <div className="model-actions nodrag">
        <button type="button" onClick={() => nodeData.onDownload?.(id)}><Download size={12} /> Download GLB</button>
        <button type="button" onClick={() => nodeData.onRecover?.(id)}><Rotate3D size={12} /> Refresh from Tripo</button>
        <span title={nodeData.fileName}>{nodeData.fileName || 'Tripo model.glb'}</span>
      </div>}
      <Handle type="source" position={Position.Right} className="flow-handle output-handle model-output-handle" aria-label="3D model output" />
    </article>
  );
}
