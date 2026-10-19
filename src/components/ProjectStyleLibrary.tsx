import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, CloudOff, ImagePlus, Images, LoaderCircle, Palette, Trash2, X } from 'lucide-react';
import type { ProjectSaveState, ProjectStyleLibrary as ProjectStyleLibraryData } from '../types';
import { PROJECT_STYLE_IMAGE_LIMIT, PROJECT_STYLE_TEXT_LIMIT } from '../project-style';
import './ProjectStyleLibrary.css';

type ProjectStyleLibraryProps = {
  projectName: string;
  library: ProjectStyleLibraryData;
  busy: boolean;
  saveState: ProjectSaveState;
  onTextChange: (text: string) => void;
  onUploadImages: (files: File[]) => void | Promise<void>;
  onRemoveImage: (assetId: string) => void | Promise<void>;
  onClose: () => void;
};

const imageTypes = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';
const saveLabels: Record<ProjectSaveState, string> = {
  loading: 'Loading project…',
  saving: 'Saving changes…',
  saved: 'All changes saved',
  offline: 'Backup saved in this browser · server unavailable',
  conflict: 'Backup saved in this browser · sync conflict',
};

export function ProjectStyleLibrary({ projectName, library, busy, saveState, onTextChange, onUploadImages, onRemoveImage, onClose }: ProjectStyleLibraryProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const titleId = useId();
  const descriptionId = useId();
  const textId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const upload = async (files: File[]) => {
    if (busy || !files.length) return;
    const images = files.filter((file) => imageTypes.split(',').includes(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name));
    setUploadError(images.length !== files.length ? 'Use PNG, JPG, WebP, GIF or BMP images.' : '');
    if (!images.length) return;
    if (library.images.length + images.length > PROJECT_STYLE_IMAGE_LIMIT) {
      setUploadError(`A project can have up to ${PROJECT_STYLE_IMAGE_LIMIT} style reference images. Remove an image or choose fewer files.`);
      return;
    }
    try {
      await onUploadImages(images);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not upload these images. Try again.');
    }
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void upload(Array.from(event.dataTransfer.files));
  };

  return createPortal(<dialog
    ref={dialogRef}
    id="project-style-library-dialog"
    className="project-style-dialog"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}
  >
    <header className="project-style-header">
      <div className="project-style-heading">
        <span className="project-style-eyebrow"><Palette size={13} />PROJECT CONTEXT</span>
        <h2 id={titleId}>Project style</h2>
        <p title={projectName}>{projectName}</p>
      </div>
      <button type="button" className="project-style-close" aria-label="Close project style" onClick={onClose}><X size={19} /></button>
    </header>

    <div className="project-style-content">
      <p className="project-style-scope" id={descriptionId}><span className="project-style-scope-dot" />Shared with every node in this project. Applied automatically to AI generation and analysis.</p>

      <section className="project-style-text-section" aria-labelledby={`${textId}-label`}>
        <div className="project-style-section-heading">
          <label id={`${textId}-label`} htmlFor={textId}>Style instructions</label>
          <span>Shared across the project</span>
        </div>
        <textarea
          id={textId}
          value={library.text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Describe your visual style: colors, materials, lighting, shapes, mood, and details to avoid…"
          spellCheck
          maxLength={PROJECT_STYLE_TEXT_LIMIT}
          rows={7}
        />
        <p className="project-style-field-hint">For example: soft clay materials, warm muted colors, rounded shapes, and clean backgrounds.</p>
      </section>

      <section className="project-style-images-section" aria-labelledby={`${titleId}-images`}>
        <div className="project-style-section-heading">
          <h3 id={`${titleId}-images`}>Reference images <span className="project-style-image-count">{library.images.length}/{PROJECT_STYLE_IMAGE_LIMIT}</span></h3>
          {library.images.length > 0 && <button type="button" className="project-style-add" disabled={busy || library.images.length >= PROJECT_STYLE_IMAGE_LIMIT} onClick={() => fileInputRef.current?.click()}><ImagePlus size={14} />Add images</button>}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={imageTypes}
          multiple
          hidden
          aria-label="Upload project style reference images"
          onChange={(event) => {
            void upload(Array.from(event.currentTarget.files || []));
            event.currentTarget.value = '';
          }}
        />
        <div
          className={`project-style-image-area${dragging ? ' is-dragging' : ''}${library.images.length ? ' has-images' : ''}`}
          aria-busy={busy}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!Array.from(event.dataTransfer.types).includes('Files')) return;
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDrop={drop}
        >
          {library.images.length > 0 ? <div className="project-style-image-grid">
            {library.images.map((image, index) => <figure className="project-style-image" key={image.assetId}>
              <a href={image.url} target="_blank" rel="noreferrer" title={`Preview ${image.name}`} aria-label={`Preview style reference ${index + 1}: ${image.name}`}>
                <img src={image.url} alt={image.name || `Style reference ${index + 1}`} loading="lazy" />
              </a>
              <figcaption title={image.name}>{image.name}</figcaption>
              <button type="button" className="project-style-remove" disabled={busy} title={`Remove ${image.name}`} aria-label={`Remove style reference ${index + 1}: ${image.name}`} onClick={() => void onRemoveImage(image.assetId)}><Trash2 size={14} /></button>
            </figure>)}
          </div> : <button type="button" className="project-style-upload" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            <span className="project-style-upload-icon"><Images size={26} strokeWidth={1.4} /></span>
            <strong>{busy ? 'Uploading reference images…' : 'Build your style library'}</strong>
            <span>Drop images here or <b>choose files</b></span>
            <small>PNG, JPG, WebP, GIF or BMP · up to {PROJECT_STYLE_IMAGE_LIMIT} images</small>
          </button>}
          {dragging && <div className="project-style-drop-hint"><ImagePlus size={22} /><strong>Drop images to add them</strong></div>}
        </div>
        {uploadError && <p className="project-style-error" role="alert">{uploadError}</p>}
      </section>
    </div>

    <footer className="project-style-footer">
      <span className={`project-style-save ${saveState}`} role="status" aria-live="polite">
        {busy || saveState === 'loading' || saveState === 'saving' ? <LoaderCircle size={14} className="spin" /> : saveState === 'saved' ? <Check size={14} /> : <CloudOff size={14} />}
        {busy ? 'Uploading reference images…' : saveLabels[saveState]}
      </span>
      <button type="button" className="project-style-done" onClick={onClose}>Done</button>
    </footer>
  </dialog>, document.body);
}
