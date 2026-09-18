import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import {
  AlignHorizontalSpaceAround,
  ArrowLeft, Check, ChevronDown, CircleDot, CloudOff, Component, Download, Expand,
  GalleryHorizontalEnd, Grid2X2, Hand, Import, Keyboard, Layers3, ListTodo,
  LoaderCircle, Map, MoreHorizontal, MousePointer2, Palette, Plus, Redo2,
  Save, Sparkles, Trash2, Undo2, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { CodexStatus, ProjectSaveState, UnityStatus } from '../types';
import { canvasDuration } from '../workspace-display';
import { homePath, shouldHandleAppLink } from '../app-route';
import '../shell.css';

function ToolButton({ label, active, href, children, onClick, disabled, ...props }: {
  label: string; active?: boolean; href?: string; children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const className = `shell-tool ${active ? 'is-active' : ''}`;
  if (href) {
    return <a href={href} className={className} title={label} aria-label={label} aria-disabled={disabled || undefined} onClick={(event) => {
      if (disabled || !shouldHandleAppLink(event)) return;
      onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
    }}>{children}</a>;
  }
  return <button type="button" className={className} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} {...props}>{children}</button>;
}

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { close(); ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); } };
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key); };
  }, [open, close, ref]);
}

type WorkspaceChromeProps = {
  projectName: string; saveState: ProjectSaveState; busy: boolean;
  activePanel: 'gallery' | 'jobs' | 'appearance' | null; activeJobs: number;
  codex: CodexStatus; authBusy: boolean; providerDetail?: string;
  unity: UnityStatus; unityBusy: boolean;
  onHome: () => void; onPanel: (panel: 'gallery' | 'jobs' | 'appearance') => void;
  onRename: (name: string) => void; onSave: () => void; onImport: () => void;
  onExport: () => void; onClear: () => void; onConnect: () => void;
  onUnityTarget: (projectPath: string) => void;
};

export function WorkspaceChrome(props: WorkspaceChromeProps) {
  const [projectOpen, setProjectOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [unityOpen, setUnityOpen] = useState(false);
  const projectRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<HTMLDivElement>(null);
  const unityRef = useRef<HTMLDivElement>(null);
  useDismiss(projectOpen, () => setProjectOpen(false), projectRef);
  useDismiss(providerOpen, () => setProviderOpen(false), providerRef);
  useDismiss(unityOpen, () => setUnityOpen(false), unityRef);
  const run = (action: () => void) => { action(); setProjectOpen(false); };
  const saveLabels: Record<ProjectSaveState, string> = {
    loading: 'Loading project', saving: 'Saving changes', saved: 'All changes saved',
    offline: 'Offline · backup kept in this browser', conflict: 'Save conflict · backup kept in this browser',
  };
  const unityProjects = [
    ...props.unity.running,
    ...props.unity.recents.filter((project) => !props.unity.running.some((item) => item.path === project.path)),
  ];
  const unityLabel = props.unity.target?.name || 'No project';
  return <>
    <nav className="workspace-rail" aria-label="Workspace navigation">
      <ToolButton label="Back to projects" href={homePath()} onClick={(event) => {
        if (!shouldHandleAppLink(event)) return;
        event.preventDefault();
        props.onHome();
      }}><ArrowLeft size={20} /></ToolButton>
      <span className="rail-rule" />
      <ToolButton label="Open gallery" active={props.activePanel === 'gallery'} onClick={() => props.onPanel('gallery')}><GalleryHorizontalEnd size={19} /></ToolButton>
      <ToolButton label="Open generation queue" active={props.activePanel === 'jobs'} onClick={() => props.onPanel('jobs')}><ListTodo size={19} />{props.activeJobs > 0 && <span className="rail-count">{props.activeJobs}</span>}</ToolButton>
      <span className="rail-spacer" />
      <ToolButton label="Appearance settings" active={props.activePanel === 'appearance'} onClick={() => props.onPanel('appearance')}><Palette size={19} /></ToolButton>
    </nav>
    <div className="workspace-hud">
      <div className="hud-project" ref={projectRef}>
        <button type="button" className="hud-project-trigger" onClick={() => { setProjectOpen(!projectOpen); setProviderOpen(false); setUnityOpen(false); }} aria-expanded={projectOpen} aria-label="Project menu">
          <strong>{props.projectName}</strong>
          <span className={`hud-save ${props.saveState}`} title={saveLabels[props.saveState]} aria-label={saveLabels[props.saveState]}>{props.saveState === 'saving' || props.saveState === 'loading' ? <LoaderCircle size={13} className="spin" /> : props.saveState === 'saved' ? <Check size={13} /> : <CloudOff size={14} />}</span>
          <ChevronDown size={13} />
        </button>
        {projectOpen && <div className="shell-menu project-actions" role="dialog" aria-label="Project actions">
          <label>Project name<input autoFocus value={props.projectName} maxLength={100} aria-label="Project name" onChange={(event) => props.onRename(event.target.value)} /></label>
          <button onClick={() => run(props.onSave)}><Save size={16} />Save project<kbd>Ctrl S</kbd></button>
          <button onClick={() => run(props.onImport)}><Import size={16} />Import project</button>
          <button onClick={() => run(props.onExport)}><Download size={16} />Export project</button>
          <div className="shell-menu-rule" />
          <button className="danger" onClick={() => run(props.onClear)}><Trash2 size={16} />Clear canvas</button>
        </div>}
      </div>
      <div className="hud-tools">
      <div className="hud-unity" ref={unityRef}>
        <button type="button" className="hud-provider-trigger" onClick={() => { setUnityOpen(!unityOpen); setProviderOpen(false); setProjectOpen(false); }} aria-expanded={unityOpen} aria-label="Unity project target">
          <Component size={14} className={props.unity.ready ? 'is-ready' : ''} /><span>Unity</span><small>{unityLabel}</small><ChevronDown size={12} />
        </button>
        {unityOpen && <div className="shell-menu connection-settings unity-settings" role="dialog" aria-label="Unity project">
          <div className="connection-title"><Component size={18} /><strong>Unity Editor</strong></div>
          <p>{props.unity.ready ? `Sends images and models into Assets/${props.projectName || 'Consept'}.` : 'Open a Unity project, or pick one from Hub recents.'}</p>
          {unityProjects.length === 0 && <p className="menu-note">No running Editor or Hub recents were found on this computer.</p>}
          {unityProjects.map((project) => (
            <button key={project.path} type="button" disabled={props.unityBusy} onClick={() => { props.onUnityTarget(project.path); setUnityOpen(false); }}>
              <CircleDot size={16} className={project.running ? 'is-ready' : ''} />
              <span>
                <strong>{project.name}</strong>
                <small>{project.running ? 'Open in Editor' : 'Hub recent'}</small>
              </span>
              {props.unity.target?.path === project.path && <Check size={15} />}
            </button>
          ))}
        </div>}
      </div>
      <div className="hud-provider" ref={providerRef}>
        <button type="button" className="hud-provider-trigger" onClick={() => { setProviderOpen(!providerOpen); setUnityOpen(false); setProjectOpen(false); }} aria-expanded={providerOpen} aria-label="Codex connection settings">
          <CircleDot size={14} className={props.codex.connected ? 'is-ready' : ''} /><span>Codex</span><small>{props.codex.connected ? 'Ready' : 'Offline'}</small><ChevronDown size={12} />
        </button>
        {providerOpen && <div className="shell-menu connection-settings" role="dialog" aria-label="Codex connection">
          <div className="connection-title"><Sparkles size={18} /><strong>Codex ImageGen</strong></div>
          <p>{props.providerDetail || props.codex.label}</p>
          <button className="shell-primary" disabled={props.authBusy} onClick={props.onConnect}>{props.authBusy ? <LoaderCircle className="spin" size={16} /> : <CircleDot size={16} />}{props.codex.connected ? 'Refresh connection' : 'Connect ChatGPT'}</button>
        </div>}
      </div>
      </div>
    </div>
  </>;
}

type CanvasDockProps = {
  mode: 'select' | 'pan'; onMode: (mode: 'select' | 'pan') => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  onAdd: () => void; minimap: boolean; onMinimap: () => void;
  onArrange?: () => void;
  onViewsRecipe: () => void; onMaterialRecipe: () => void;
};

export function CanvasDock(props: CanvasDockProps) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const [moreOpen, setMoreOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(moreOpen || shortcutsOpen, () => { setMoreOpen(false); setShortcutsOpen(false); }, ref);
  const fit = () => { const selected = flow.getNodes().filter((node) => node.selected); void flow.fitView({ nodes: selected.length ? selected : undefined, padding: 0.18, duration: canvasDuration(200) }); };
  return <div className="canvas-dock-wrap" ref={ref}>
    {moreOpen && <div className="shell-menu dock-menu" role="dialog" aria-label="More canvas tools">
      <button onClick={props.onMinimap}><Map size={16} />Mini map{props.minimap && <Check size={15} />}</button>
      <button onClick={() => { props.onArrange?.(); setMoreOpen(false); }}><AlignHorizontalSpaceAround size={16} />Arrange cards<kbd>Ctrl L</kbd></button>
      <button onClick={() => { props.onViewsRecipe(); setMoreOpen(false); }}><Grid2X2 size={16} />Attach 4-view set</button>
      <button onClick={() => { props.onMaterialRecipe(); setMoreOpen(false); }}><Layers3 size={16} />Build PBR material</button>
      <p className="menu-note">Recipes use the selected image.</p>
      <div className="shell-menu-rule" />
      <button onClick={() => { setShortcutsOpen(true); setMoreOpen(false); }}><Keyboard size={16} />Keyboard shortcuts</button>
    </div>}
    {shortcutsOpen && <div className="shell-menu dock-menu shortcut-menu" role="dialog" aria-label="Keyboard shortcuts">
      <div className="shortcut-title"><strong>Canvas shortcuts</strong><ToolButton label="Close shortcuts" onClick={() => setShortcutsOpen(false)}><X size={16} /></ToolButton></div>
      {[['LMB drag', 'Select area'], ['Space + drag', 'Pan canvas'], ['MMB drag', 'Pan canvas'], ['Ctrl G', 'Group references'], ['Ctrl L', 'Arrange cards'], ['Ctrl V', 'Paste image'], ['Ctrl Z', 'Undo'], ['Ctrl Shift Z', 'Redo'], ['F', 'Fit selection']].map(([key, label]) => <div className="shortcut-entry" key={key}><span>{label}</span><kbd>{key}</kbd></div>)}
    </div>}
    <div className="canvas-dock" role="toolbar" aria-label="Canvas tools">
      <ToolButton label="Undo (Ctrl+Z)" onClick={props.onUndo} disabled={!props.canUndo}><Undo2 size={14} /></ToolButton>
      <ToolButton label="Redo (Ctrl+Shift+Z)" onClick={props.onRedo} disabled={!props.canRedo}><Redo2 size={14} /></ToolButton>
      <span className="dock-divider" />
      <ToolButton label="Selection tool" active={props.mode === 'select'} onClick={() => props.onMode('select')}><MousePointer2 size={15} /></ToolButton>
      <ToolButton label="Pan tool" active={props.mode === 'pan'} onClick={() => props.onMode('pan')}><Hand size={15} /></ToolButton>
      <span className="dock-divider" />
      <ToolButton label="Zoom out" onClick={() => void flow.zoomOut({ duration: canvasDuration(150) })}><ZoomOut size={14} /></ToolButton>
      <button className="dock-zoom" title="Reset zoom to 100%" aria-label="Reset zoom to 100%" onClick={() => void flow.zoomTo(1, { duration: canvasDuration(150) })}>{Math.round(zoom * 100)}%</button>
      <ToolButton label="Fit canvas or selection" onClick={fit}><Expand size={14} /></ToolButton>
      <ToolButton label="Arrange unpacked cards (Ctrl+L)" onClick={() => props.onArrange?.()}><AlignHorizontalSpaceAround size={14} /></ToolButton>
      <ToolButton label="Zoom in" onClick={() => void flow.zoomIn({ duration: canvasDuration(150) })}><ZoomIn size={14} /></ToolButton>
      <span className="dock-divider" />
      <ToolButton label="Add node" onClick={props.onAdd} className="shell-tool dock-add"><Plus size={17} /></ToolButton>
      <ToolButton label="More canvas tools" active={moreOpen} onClick={() => { setMoreOpen(!moreOpen); setShortcutsOpen(false); }} aria-expanded={moreOpen}><MoreHorizontal size={15} /></ToolButton>
    </div>
  </div>;
}
