import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node, Viewport } from '@xyflow/react';
import type { ConseptProject } from './types';

export type GraphSnapshot = { nodes: Node[]; edges: Edge[] };

export function serializeNodes(nodes: Node[]): Array<Node<Record<string, unknown>>> {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { ...node.position },
    data: stripFunctions(node.data) as Record<string, unknown>,
  }));
}

export function serializeEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: edge.type,
    animated: edge.animated,
    markerEnd: edge.markerEnd,
    style: edge.style,
  }));
}

export function projectPayload(
  id: string,
  name: string,
  revision: number,
  nodes: Node[],
  edges: Edge[],
  viewport: Viewport,
): Omit<ConseptProject, 'updatedAt' | 'createdAt'> {
  return {
    schemaVersion: 1,
    id,
    name,
    revision,
    nodes: serializeNodes(nodes),
    edges: serializeEdges(edges),
    viewport,
  };
}

export function exportProject(project: ConseptProject) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${slug(project.name || 'consept-project')}.consept.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
}

export async function importProject(file: File): Promise<ConseptProject> {
  const parsed = JSON.parse(await file.text()) as ConseptProject;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('This is not a supported Consept project file.');
  }
  return parsed;
}

export function useGraphHistory(
  nodes: Node[],
  edges: Edge[],
  ready: boolean,
  apply: (snapshot: GraphSnapshot) => void,
) {
  const history = useRef<GraphSnapshot[]>([]);
  const hashes = useRef<string[]>([]);
  const index = useRef(-1);
  const applying = useRef(false);
  const [stateVersion, setStateVersion] = useState(0);

  useEffect(() => {
    if (!ready || applying.current) return;
    const snapshot = { nodes: serializeNodes(nodes) as Node[], edges: serializeEdges(edges) };
    const hash = JSON.stringify(snapshot);
    const timer = window.setTimeout(() => {
      if (hashes.current[index.current] === hash) return;
      history.current = history.current.slice(0, index.current + 1);
      hashes.current = hashes.current.slice(0, index.current + 1);
      history.current.push(snapshot);
      hashes.current.push(hash);
      if (history.current.length > 80) {
        history.current.shift();
        hashes.current.shift();
      }
      index.current = history.current.length - 1;
      setStateVersion((value) => value + 1);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [nodes, edges, ready]);

  const move = useCallback((delta: number) => {
    const nextIndex = index.current + delta;
    const snapshot = history.current[nextIndex];
    if (!snapshot) return;
    applying.current = true;
    index.current = nextIndex;
    apply(structuredClone(snapshot));
    setStateVersion((value) => value + 1);
    window.setTimeout(() => { applying.current = false; }, 0);
  }, [apply]);

  return {
    undo: () => move(-1),
    redo: () => move(1),
    canUndo: stateVersion >= 0 && index.current > 0,
    canRedo: stateVersion >= 0 && index.current < history.current.length - 1,
    reset: (snapshot: GraphSnapshot) => {
      const clean = { nodes: serializeNodes(snapshot.nodes) as Node[], edges: serializeEdges(snapshot.edges) };
      history.current = [clean];
      hashes.current = [JSON.stringify(clean)];
      index.current = 0;
      setStateVersion((value) => value + 1);
    },
  };
}

function stripFunctions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripFunctions);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, child]) => typeof child !== 'function').map(([key, child]) => [key, stripFunctions(child)]));
  }
  return value;
}

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'consept-project';
}
