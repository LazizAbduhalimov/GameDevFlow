import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, Clock3, Folder, FolderPlus, House, Layers3, LoaderCircle, Palette, Pencil, Plus, Search, Trash2, Workflow, X } from 'lucide-react';
import type { ProjectSummary } from '../types';
import '../home.css';

export type ProjectHomeProps = {
  projects: ProjectSummary[];
  activeProjectId: string;
  busy?: boolean;
  loading?: boolean;
  error?: string | null;
  onOpen: (id: string) => void | Promise<void>;
  onCreate: (name: string) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onAppearance: () => void;
};

type ProjectEdit = { kind: 'rename' | 'delete'; id: string } | null;

function timestamp(project: ProjectSummary) {
  const value = Date.parse(project.updatedAt || project.createdAt || '');
  return Number.isFinite(value) ? value : 0;
}

function updatedLabel(project: ProjectSummary) {
  const value = timestamp(project);
  if (!value) return 'Not saved yet';
  const elapsed = Math.max(0, Date.now() - value);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(value);
}

export function ProjectHome({ projects, activeProjectId, busy = false, loading = false, error, onOpen, onCreate, onRename, onDelete, onAppearance }: ProjectHomeProps) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [edit, setEdit] = useState<ProjectEdit>(null);
  const [editName, setEditName] = useState('');
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const disabled = busy || pending || loading;
  const sorted = useMemo(() => [...projects].sort((a, b) => timestamp(b) - timestamp(a) || a.name.localeCompare(b.name)), [projects]);
  const visible = useMemo(() => sorted.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase())), [sorted, query]);

  useEffect(() => {
    if (creating) {
      createInputRef.current?.focus();
      createInputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [creating]);

  useEffect(() => {
    if (edit?.kind === 'rename') { renameInputRef.current?.focus(); renameInputRef.current?.select(); }
  }, [edit]);

  async function perform(action: () => void | Promise<void>, done?: () => void) {
    if (disabled) return;
    setPending(true);
    setLocalError('');
    try { await action(); done?.(); }
    catch (failure) { setLocalError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setPending(false); }
  }

  function startCreating() {
    setCreating(true);
    setEdit(null);
    setLocalError('');
  }

  function create(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    void perform(() => onCreate(newName.trim()), () => { setCreating(false); setNewName(''); });
  }

  function rename(event: FormEvent, id: string) {
    event.preventDefault();
    if (!editName.trim()) return;
    void perform(() => onRename(id, editName.trim()), () => setEdit(null));
  }

  function startEdit(project: ProjectSummary, kind: 'rename' | 'delete') {
    setCreating(false);
    setEdit({ id: project.id, kind });
    setEditName(project.name);
    setLocalError('');
  }

  return (
    <div className="ff-home" onKeyDown={(event) => event.stopPropagation()} onPaste={(event) => event.stopPropagation()}>
      <aside className="ff-home-sidebar" aria-label="Workspace navigation">
        <div className="ff-home-brand"><span className="ff-home-brand-mark"><Workflow size={22} strokeWidth={1.6} /></span><strong>Frameforge</strong></div>
        <button className="ff-home-new-sidebar" type="button" onClick={startCreating} disabled={disabled}><span><Plus size={16} /></span>New project</button>
        <label className="ff-home-sidebar-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search projects" placeholder="Search projects…" />{query && <button type="button" aria-label="Clear project search" onClick={() => setQuery('')}><X size={14} /></button>}</label>
        <nav className="ff-home-navigation"><button type="button" aria-current="page" onClick={() => { setQuery(''); mainRef.current?.scrollTo({ top: 0 }); }}><House size={18} /><span>Home</span></button></nav>
        <div className="ff-home-recents">
          <span className="ff-home-section-label">Recent projects</span>
          {sorted.slice(0, 5).map((project) => <button className={project.id === activeProjectId ? 'is-current' : ''} type="button" disabled={disabled} key={project.id} onClick={() => void perform(() => onOpen(project.id))} title={project.name}><Folder size={17} /><span><strong>{project.name}</strong><small>{updatedLabel(project)}</small></span></button>)}
          {!sorted.length && <p>Your projects will appear here.</p>}
        </div>
        <div className="ff-home-sidebar-bottom"><button type="button" onClick={onAppearance}><Palette size={17} /><span>Appearance</span></button><div className="ff-home-profile-space" aria-hidden="true" /></div>
      </aside>

      <main className="ff-home-main" ref={mainRef}>
        <div className="ff-home-content">
          <div className="ff-home-topline"><span><span className="ff-home-status-dot" />Your workspace</span><button type="button" className="ff-home-mobile-appearance" aria-label="Appearance settings" onClick={onAppearance}><Palette size={18} /></button></div>
          <header className="ff-home-heading"><div><h1>Your projects</h1><p>Create a project or continue your work.</p></div><button type="button" className="ff-home-primary" onClick={startCreating} disabled={disabled}><Plus size={17} /><span>New project</span></button></header>

          {(error || localError) && <div className="ff-home-error" role="alert">{localError || error}</div>}

          {creating && <form className="ff-home-create-form" onSubmit={create} onKeyDown={(event) => { if (event.key === 'Escape' && !disabled) setCreating(false); }}>
            <div className="ff-home-form-title"><FolderPlus size={20} /><strong>Create a project</strong><button type="button" className="ff-home-icon-button" aria-label="Cancel creating project" onClick={() => setCreating(false)} disabled={disabled}><X size={17} /></button></div>
            <label htmlFor="ff-home-new-name">Project name</label><div className="ff-home-form-fields"><input id="ff-home-new-name" ref={createInputRef} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Untitled project" autoComplete="off" maxLength={100} disabled={disabled} /><button className="ff-home-primary" type="submit" disabled={disabled || !newName.trim()}>{pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}Create project</button></div>
          </form>}

          <div className="ff-home-project-toolbar"><h2>{query.trim() ? 'Search results' : 'All projects'} <span>{visible.length}</span></h2><span className="ff-home-sort"><Clock3 size={14} />Last edited</span></div>

          {loading && <div className="ff-home-empty" role="status"><LoaderCircle className="spin" size={28} /><h3>Loading your projects</h3><p>Getting your workspace ready.</p></div>}

          {!loading && !visible.length && <div className="ff-home-empty"><span className="ff-home-empty-icon">{query.trim() ? <Search size={27} /> : <FolderPlus size={27} />}</span><h3>{query.trim() ? 'No projects found' : 'Make something new'}</h3><p>{query.trim() ? `No project names match “${query.trim()}”.` : 'Start with an empty canvas. Bring your references and follow the idea.'}</p><button type="button" className="ff-home-secondary" disabled={disabled} onClick={query.trim() ? () => setQuery('') : startCreating}>{query.trim() ? 'Clear search' : 'Create your first project'}{!query.trim() && <ArrowUpRight size={15} />}</button></div>}

          {!loading && visible.length > 0 && <div className="ff-home-project-grid">{visible.map((project) => <article className={`ff-home-project-card ${edit?.id === project.id ? 'is-editing' : ''}`} key={project.id}>
            <div className="ff-home-card-top"><span className="ff-home-project-symbol"><Workflow size={22} strokeWidth={1.6} /></span><div className="ff-home-card-tools"><button className="ff-home-icon-button" type="button" title="Rename project" aria-label={`Rename ${project.name}`} disabled={disabled} onClick={() => startEdit(project, 'rename')}><Pencil size={15} /></button>{project.id !== 'default' && <button className="ff-home-icon-button is-danger" type="button" title="Delete project" aria-label={`Delete ${project.name}`} disabled={disabled} onClick={() => startEdit(project, 'delete')}><Trash2 size={15} /></button>}</div></div>
            {edit?.id === project.id && edit.kind === 'rename' ? <form className="ff-home-rename-form" onSubmit={(event) => rename(event, project.id)} onKeyDown={(event) => { if (event.key === 'Escape' && !disabled) setEdit(null); }}><label htmlFor={`ff-rename-${project.id}`}>Project name</label><input id={`ff-rename-${project.id}`} ref={renameInputRef} value={editName} onChange={(event) => setEditName(event.target.value)} disabled={disabled} maxLength={100} /><div><button type="button" className="ff-home-secondary" onClick={() => setEdit(null)} disabled={disabled}>Cancel</button><button type="submit" className="ff-home-primary" disabled={disabled || !editName.trim()}><Check size={14} />Save</button></div></form>
              : <><button type="button" className="ff-home-card-open" disabled={disabled} onClick={() => void perform(() => onOpen(project.id))} aria-label={`Open ${project.name}`}><h3 title={project.name}>{project.name}</h3><span><Layers3 size={14} />{project.nodeCount} {project.nodeCount === 1 ? 'node' : 'nodes'}</span><ArrowUpRight className="ff-home-open-arrow" size={20} /></button><div className="ff-home-card-footer"><time dateTime={project.updatedAt || project.createdAt} title={timestamp(project) ? new Date(timestamp(project)).toLocaleString() : undefined}>{updatedLabel(project)}</time>{project.id === activeProjectId && <span className="ff-home-current-label">Last opened</span>}</div></>}
            {edit?.id === project.id && edit.kind === 'delete' && <div className="ff-home-delete-confirm" role="group" aria-label={`Confirm deleting ${project.name}`}><strong>Delete this project?</strong><p>Its files stay recoverable in the local project trash.</p><div><button type="button" className="ff-home-secondary" disabled={disabled} onClick={() => setEdit(null)}>Cancel</button><button type="button" className="ff-home-delete-button" disabled={disabled} onClick={() => void perform(() => onDelete(project.id), () => setEdit(null))}><Trash2 size={14} />Delete project</button></div></div>}
          </article>)}</div>}
          {!loading && projects.length > 0 && <p className="ff-home-bottom-note">Your projects are saved locally on this device.</p>}
        </div>
      </main>
    </div>
  );
}
