import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { ArrowUpRight, Box, Check, Clock3, Folder, FolderPlus, Grid2X2, House, Image, Layers3, LoaderCircle, Palette, Pencil, Plus, Repeat2, Search, Trash2, UserRound, Workflow, X, type LucideIcon } from 'lucide-react';
import type { ProjectSummary } from '../types';
import { shouldHandleAppLink, workspacePath } from '../app-route';
import { filterWorkflowTemplates, WORKFLOW_TEMPLATES, type WorkflowTemplateId } from '../workflow-templates';
import '../home.css';

export type ProjectHomeProps = {
  projects: ProjectSummary[];
  activeProjectId: string;
  busy?: boolean;
  loading?: boolean;
  error?: string | null;
  onOpen: (id: string) => void | Promise<void>;
  onCreate: (name: string) => void | Promise<void>;
  onUseTemplate: (id: WorkflowTemplateId) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onAppearance: () => void;
};

type ProjectEdit = { kind: 'rename' | 'delete'; id: string } | null;

const starterIcons: Record<WorkflowTemplateId, LucideIcon> = {
  image: Image,
  '3d': Box,
  characters: UserRound,
  'ui-kits': Grid2X2,
  materials: Repeat2,
};

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

export function ProjectHome({ projects, activeProjectId, busy = false, loading = false, error, onOpen, onCreate, onUseTemplate, onRename, onDelete, onAppearance }: ProjectHomeProps) {
  const [query, setQuery] = useState('');
  const [templateQuery, setTemplateQuery] = useState('');
  const [hoveredTemplate, setHoveredTemplate] = useState<WorkflowTemplateId | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [edit, setEdit] = useState<ProjectEdit>(null);
  const [editName, setEditName] = useState('');
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const disabled = busy || pending || loading;
  const sorted = useMemo(() => [...projects].sort((a, b) => timestamp(b) - timestamp(a) || a.name.localeCompare(b.name)), [projects]);
  const visible = useMemo(() => sorted.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase())), [sorted, query]);
  const templates = useMemo(() => filterWorkflowTemplates(templateQuery), [templateQuery]);
  const deleting = edit?.kind === 'delete' ? projects.find((project) => project.id === edit.id) : undefined;

  useEffect(() => {
    if (creating) {
      createInputRef.current?.focus();
      createInputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [creating]);

  useEffect(() => {
    if (edit?.kind === 'rename') { renameInputRef.current?.focus(); renameInputRef.current?.select(); }
    if (edit?.kind === 'delete') deleteCancelRef.current?.focus();
  }, [edit]);

  useEffect(() => {
    if (edit?.kind !== 'delete') return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending) setEdit(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [edit, pending]);

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

  function openProject(event: MouseEvent, id: string) {
    if (disabled || !shouldHandleAppLink(event)) return;
    event.preventDefault();
    void perform(() => onOpen(id));
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
        <div className="ff-home-brand"><span className="ff-home-brand-mark"><Workflow size={22} strokeWidth={1.6} /></span><strong>Consept</strong></div>
        <button className="ff-home-new-sidebar" type="button" onClick={startCreating} disabled={disabled}><span><Plus size={16} /></span>New project</button>
        <label className="ff-home-sidebar-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search projects" placeholder="Search projects…" />{query && <button type="button" aria-label="Clear project search" onClick={() => setQuery('')}><X size={14} /></button>}</label>
        <nav className="ff-home-navigation"><button type="button" aria-current="page" onClick={() => { setQuery(''); setTemplateQuery(''); mainRef.current?.scrollTo({ top: 0 }); }}><House size={18} /><span>Home</span></button></nav>
        <div className="ff-home-recents">
          <span className="ff-home-section-label">Recent projects</span>
          {sorted.slice(0, 5).map((project) => (
            <div className={`ff-home-recent ${project.id === activeProjectId ? 'is-current' : ''}`} key={project.id}>
              <a href={workspacePath(project.id)} aria-disabled={disabled || undefined} onClick={(event) => openProject(event, project.id)} title={project.name}><Folder size={17} /><span><strong>{project.name}</strong><small>{updatedLabel(project)}</small></span></a>
              {project.id !== 'default' && <button className="ff-home-recent-delete" type="button" title="Delete project" aria-label={`Delete ${project.name}`} disabled={disabled} onClick={() => startEdit(project, 'delete')}><Trash2 size={14} /></button>}
            </div>
          ))}
          {!sorted.length && <p>Your projects will appear here.</p>}
        </div>
        <div className="ff-home-sidebar-bottom"><button type="button" onClick={onAppearance}><Palette size={17} /><span>Appearance</span></button><div className="ff-home-profile-space" aria-hidden="true" /></div>
      </aside>

      <main className="ff-home-main" ref={mainRef}>
        <div className="ff-home-content">
          <div className="ff-home-topline"><span><span className="ff-home-status-dot" />Your workspace</span><button type="button" className="ff-home-mobile-appearance" aria-label="Appearance settings" onClick={onAppearance}><Palette size={18} /></button></div>
          <header className="ff-home-heading">
            <div>
              <h1>Pick a starting point.</h1>
              <p>Use a template, or open one of your projects. Templates stay unchanged.</p>
            </div>
            <button type="button" className="ff-home-primary" onClick={startCreating} disabled={disabled}><Plus size={17} /><span>New project</span></button>
          </header>

          {(error || localError) && !deleting && <div className="ff-home-error" role="alert">{localError || error}</div>}

          {creating && <form className="ff-home-create-form" onSubmit={create} onKeyDown={(event) => { if (event.key === 'Escape' && !disabled) setCreating(false); }}>
            <div className="ff-home-form-title"><FolderPlus size={20} /><strong>Create a project</strong><button type="button" className="ff-home-icon-button" aria-label="Cancel creating project" onClick={() => setCreating(false)} disabled={disabled}><X size={17} /></button></div>
            <label htmlFor="ff-home-new-name">Project name</label><div className="ff-home-form-fields"><input id="ff-home-new-name" ref={createInputRef} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Untitled project" autoComplete="off" maxLength={100} disabled={disabled} /><button className="ff-home-primary" type="submit" disabled={disabled || !newName.trim()}>{pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}Create project</button></div>
          </form>}

          <section className="ff-home-starters" aria-labelledby="ff-home-starters-heading">
            <h2 id="ff-home-starters-heading" className="ff-home-starters-heading">Templates</h2>
            <label className="ff-home-template-search">
              <Search size={16} />
              <input value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} aria-label="Search templates" placeholder={`Search ${WORKFLOW_TEMPLATES.length} templates`} />
              {templateQuery && <button type="button" aria-label="Clear template search" onClick={() => setTemplateQuery('')}><X size={14} /></button>}
            </label>
            {templates.length > 0 ? (
              <div className={`ff-home-starter-tree ${templates.length === WORKFLOW_TEMPLATES.length ? 'is-complete' : ''}`} data-active-template={hoveredTemplate || undefined} onPointerLeave={() => setHoveredTemplate(null)}>
                {templates.length === WORKFLOW_TEMPLATES.length && <svg className="ff-home-starter-wires" viewBox="0 0 1000 146" preserveAspectRatio="none" aria-hidden="true">
                  <path className="ff-home-starter-wire wire-image" pathLength="1" d="M500 13 C486 52 100 54 58 121" />
                  <path className="ff-home-starter-wire wire-3d" pathLength="1" d="M500 13 C470 51 312 59 297 121" />
                  <path className="ff-home-starter-wire wire-characters" pathLength="1" d="M500 13 L500 121" />
                  <path className="ff-home-starter-wire wire-ui-kits" pathLength="1" d="M500 13 C530 51 688 59 703 121" />
                  <path className="ff-home-starter-wire wire-materials" pathLength="1" d="M500 13 C514 52 900 54 942 121" />
                  <circle className="ff-home-starter-root" cx="500" cy="13" r="4" />
                  <circle className="ff-home-starter-terminal terminal-image" cx="58" cy="121" r="4" />
                  <circle className="ff-home-starter-terminal terminal-3d" cx="297" cy="121" r="4" />
                  <circle className="ff-home-starter-terminal terminal-characters" cx="500" cy="121" r="4" />
                  <circle className="ff-home-starter-terminal terminal-ui-kits" cx="703" cy="121" r="4" />
                  <circle className="ff-home-starter-terminal terminal-materials" cx="942" cy="121" r="4" />
                </svg>}
                <div className="ff-home-starter-row">
                  {templates.map((template) => {
                    const Icon = starterIcons[template.id];
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className="ff-home-starter"
                        disabled={disabled}
                        title={template.description}
                        aria-label={`Use ${template.title} template. ${template.description}`}
                        onClick={() => void perform(() => onUseTemplate(template.id))}
                        onPointerEnter={() => setHoveredTemplate(template.id)}
                        onFocus={() => setHoveredTemplate(template.id)}
                        onBlur={() => setHoveredTemplate(null)}
                      >
                        <span className="ff-home-starter-icon"><Icon size={22} strokeWidth={1.6} /></span>
                        <strong>{template.title}</strong>
                        <small>{template.description}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="ff-home-template-empty">
                <p>No templates match “{templateQuery.trim()}”.</p>
                <button type="button" className="ff-home-secondary" onClick={() => setTemplateQuery('')}>Clear search</button>
              </div>
            )}
          </section>

          <div className="ff-home-project-toolbar"><h2>{query.trim() ? 'Search results' : 'Your projects'} <span>{visible.length}</span></h2><span className="ff-home-sort"><Clock3 size={14} />Last edited</span></div>

          {loading && <div className="ff-home-empty" role="status"><LoaderCircle className="spin" size={28} /><h3>Loading your projects</h3><p>Getting your workspace ready.</p></div>}

          {!loading && !visible.length && <div className="ff-home-empty"><span className="ff-home-empty-icon">{query.trim() ? <Search size={27} /> : <FolderPlus size={27} />}</span><h3>{query.trim() ? 'No projects found' : 'Make something new'}</h3><p>{query.trim() ? `No project names match “${query.trim()}”.` : 'Start with an empty canvas, or use a template above.'}</p><button type="button" className="ff-home-secondary" disabled={disabled} onClick={query.trim() ? () => setQuery('') : startCreating}>{query.trim() ? 'Clear search' : 'Create your first project'}{!query.trim() && <ArrowUpRight size={15} />}</button></div>}

          {!loading && visible.length > 0 && <div className="ff-home-project-grid">{visible.map((project) => <article className={`ff-home-project-card ${edit?.id === project.id ? 'is-editing' : ''}`} key={project.id}>
            <div className="ff-home-card-top"><span className="ff-home-project-symbol"><Workflow size={22} strokeWidth={1.6} /></span><div className="ff-home-card-tools"><button className="ff-home-icon-button" type="button" title="Rename project" aria-label={`Rename ${project.name}`} disabled={disabled} onClick={() => startEdit(project, 'rename')}><Pencil size={15} /></button>{project.id !== 'default' && <button className="ff-home-icon-button is-danger" type="button" title="Delete project" aria-label={`Delete ${project.name}`} disabled={disabled} onClick={() => startEdit(project, 'delete')}><Trash2 size={15} /></button>}</div></div>
            {edit?.id === project.id && edit.kind === 'rename' ? <form className="ff-home-rename-form" onSubmit={(event) => rename(event, project.id)} onKeyDown={(event) => { if (event.key === 'Escape' && !disabled) setEdit(null); }}><label htmlFor={`ff-rename-${project.id}`}>Project name</label><input id={`ff-rename-${project.id}`} ref={renameInputRef} value={editName} onChange={(event) => setEditName(event.target.value)} disabled={disabled} maxLength={100} /><div><button type="button" className="ff-home-secondary" onClick={() => setEdit(null)} disabled={disabled}>Cancel</button><button type="submit" className="ff-home-primary" disabled={disabled || !editName.trim()}><Check size={14} />Save</button></div></form>
              : <><a href={workspacePath(project.id)} className="ff-home-card-open" aria-disabled={disabled || undefined} onClick={(event) => openProject(event, project.id)} aria-label={`Open ${project.name}`}><h3 title={project.name}>{project.name}</h3><span><Layers3 size={14} />{project.nodeCount} {project.nodeCount === 1 ? 'node' : 'nodes'}</span><ArrowUpRight className="ff-home-open-arrow" size={20} /></a><div className="ff-home-card-footer"><time dateTime={project.updatedAt || project.createdAt} title={timestamp(project) ? new Date(timestamp(project)).toLocaleString() : undefined}>{updatedLabel(project)}</time>{project.id === activeProjectId && <span className="ff-home-current-label">Last opened</span>}</div></>}
          </article>)}</div>}
          {!loading && projects.length > 0 && <p className="ff-home-bottom-note">Your projects are saved locally on this device. Using a template creates a copy in this list.</p>}
        </div>
      </main>
      {deleting && <div className="ff-home-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (!pending && event.target === event.currentTarget) setEdit(null); }}>
        <div className="ff-home-dialog" role="dialog" aria-modal="true" aria-labelledby="ff-home-delete-title" aria-describedby="ff-home-delete-copy">
          <h2 id="ff-home-delete-title">Delete “{deleting.name}”?</h2>
          <p id="ff-home-delete-copy">This project will be removed from the list. Its files stay recoverable in the local project trash.</p>
          {localError && <p className="ff-home-dialog-error" role="alert">{localError}</p>}
          <div className="ff-home-dialog-actions">
            <button type="button" className="ff-home-secondary" ref={deleteCancelRef} disabled={pending} onClick={() => setEdit(null)}>Cancel</button>
            <button type="button" className="ff-home-delete-button" disabled={pending} onClick={() => void perform(() => onDelete(deleting.id), () => setEdit(null))}>{pending ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}Delete project</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
