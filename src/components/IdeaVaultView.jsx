import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Search, Trash2, Pencil, X, AlertTriangle, Lightbulb, ExternalLink, Globe,
  ChevronLeft, ChevronRight, GripVertical, Maximize2, Star, Loader2, Tag, Clock,
  Rocket, Archive, ArchiveRestore, CheckSquare, Square, Pin, PinOff, Link2, Images,
  ImagePlus, Hash, Image as ImageIcon, Sparkles,
} from 'lucide-react';
import { useShortcutHooks } from '../utils/useShortcutHooks';
import { useArchive } from '../utils/useArchive';
import { IDEA_STAGES, stageOf, stepsIn } from '../services/ideas';
import { useListNav } from '../utils/useListNav';
import BulkBar from './BulkBar';
import { PageHeader, Empty, Card, Modal, Select } from './ui';
import { EditorLayout, PropRow, TitleInput, DescriptionInput, SectionTitle, LinksEditor, DueField } from './editor';
import { uploadIdeaImage } from '../services/supabase';
import { formatDate } from '../utils/helpers';
import { usePref } from '../services/prefs';

/* ─── shared looks ─────────────────────────────────────── */
const MAX_IMAGE_MB = 4;
const chipCls = active =>
  `h-8 px-2.5 rounded-lg text-[12.5px] border cursor-pointer transition-colors shrink-0 inline-flex items-center ${
    active ? 'bg-white/[0.09] border-white/[0.14] text-slate-100' : 'border-white/[0.06] text-slate-400 hover:text-slate-200'
  }`;
const actionBtn = 'icon-btn !w-7 !h-7 cursor-pointer';
const masonryCls = 'columns-1 sm:columns-2 xl:columns-3 gap-3 [&>*]:mb-3';

const SORT_OPTIONS = [
  { value: 'custom', label: 'Custom order' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

/* ─── tiny helpers ─────────────────────────────────────── */
function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}

const cleanTag = raw => (raw || '').trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, '');

// Normalise the legacy single image_url into the images array.
const ideaImages = idea =>
  idea.images?.length > 0 ? idea.images : idea.image_url ? [{ url: idea.image_url, caption: '' }] : [];

function shortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}


// Links go into the shared LinksEditor as [{ url, label }] — the same shape
// ideas store — so only rows without a URL (never saved anyway) are dropped.
const editorLinks = links =>
  (links || []).filter(l => l && (l.url || '').trim()).map(l => ({ ...l, url: l.url, label: l.label || '' }));

/* Full-screen image overlay. Portalled, because the dialog surface is
   transformed and would trap a fixed overlay inside it. Escape closes this
   first, not the dialog under it. */
function ImageViewer({ images, index, setIndex, onClose, fallbackAlt }) {
  const count = images.length;
  const current = images[index];
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
      else if (e.key === 'ArrowRight' && count > 1) setIndex(i => (i + 1) % count);
      else if (e.key === 'ArrowLeft' && count > 1) setIndex(i => (i - 1 + count) % count);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [count, onClose, setIndex]);
  if (!current) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/90 flex flex-col items-center justify-center p-4 sm:p-6 fade-up"
      onClick={onClose}>
      <button onClick={e => { e.stopPropagation(); onClose(); }} aria-label="Close full screen"
        className="absolute top-4 right-4 w-9 h-9 inline-flex items-center justify-center bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-slate-200 hover:text-white transition-colors cursor-pointer">
        <X size={16} />
      </button>
      <img src={current.url} alt={current.caption || fallbackAlt}
        className="max-w-full max-h-[82vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
      {current.caption && (
        <p className="mt-4 text-center text-[13px] text-slate-300 max-w-xl leading-relaxed" onClick={e => e.stopPropagation()}>
          {current.caption}
        </p>
      )}
    </div>,
    document.body,
  );
}

/* ─── Images with cover + captions ─────────────────────────
   Same look as the kit's ImagesEditor, but ideas keep a caption per image
   and an explicit cover, which that editor (plain URL strings) can't hold. */
function IdeaImagesEditor({ images, uploading, error, onAddFiles, onRemove, onCaption, onSetPrimary }) {
  const fileRef = useRef(null);
  const [viewer, setViewer] = useState(null);
  const closeViewer = useCallback(() => setViewer(null), []);
  const shown = images.filter(img => img.url);
  const hasExplicitPrimary = images.some(img => img.is_primary);

  return (
    <section>
      <SectionTitle right={`Paste with Ctrl+V · up to ${MAX_IMAGE_MB} MB`}>Images</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {images.map((img, i) => {
          if (!img.url) return null;
          const isPrimary = hasExplicitPrimary ? !!img.is_primary : i === 0;
          return (
            <div key={img.url.slice(-48) + i} className="w-28 space-y-1">
              <div className="group/img relative w-28 h-20 rounded-lg overflow-hidden border border-white/[0.07] bg-black/30">
                <img src={img.url} alt={img.caption || 'Idea image'} className="w-full h-full object-cover cursor-zoom-in"
                  onClick={() => setViewer(shown.indexOf(img))} />
                <button type="button" onClick={() => onSetPrimary(i)} aria-pressed={isPrimary}
                  title={isPrimary ? 'Cover image' : 'Set as cover'}
                  className={`absolute left-1 top-1 h-5 px-1 rounded text-[10px] inline-flex items-center gap-0.5 cursor-pointer transition-opacity ${
                    isPrimary ? 'bg-black/70 text-amber-300' : 'bg-black/65 text-slate-200 hover:text-amber-200 opacity-100 sm:opacity-0 sm:group-hover/img:opacity-100 focus-visible:opacity-100'}`}>
                  <Star size={9} className={isPrimary ? 'fill-amber-300' : ''} />
                  {isPrimary ? 'Cover' : <span className="sr-only">Set as cover</span>}
                </button>
                <button type="button" onClick={() => onRemove(i)} title="Remove" aria-label="Remove image"
                  className="absolute right-1 top-1 w-6 h-6 rounded-md bg-black/65 text-slate-200 hover:text-rose-300 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover/img:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer">
                  <X size={12} />
                </button>
              </div>
              <input value={img.caption || ''} onChange={e => onCaption(i, e.target.value)}
                placeholder="Caption" aria-label="Image caption"
                className="w-full h-6 px-1.5 -mx-px rounded-md bg-transparent text-[11.5px] text-slate-300 placeholder:text-slate-600 outline-none hover:bg-white/[0.03] focus:bg-white/[0.04] transition-colors" />
            </div>
          );
        })}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={'up' + i} className="w-28 h-20 rounded-lg border border-white/[0.07] skeleton flex items-center justify-center">
            <Loader2 size={15} className="animate-spin text-slate-500" />
          </div>
        ))}
        <button type="button" onClick={() => fileRef.current?.click()}
          className={`${shown.length || uploading ? 'w-28 h-20 flex-col' : 'h-9 px-3'} rounded-lg border border-dashed border-white/[0.12] hover:border-white/[0.25] hover:bg-white/[0.02] text-slate-500 hover:text-slate-200 flex items-center justify-center gap-1.5 text-[12.5px] cursor-pointer transition-colors`}>
          <ImageIcon size={14} /> Add image
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { onAddFiles(e.target.files); e.target.value = ''; }} />
      </div>
      {error && (
        <p className="mt-2 text-[12px] text-amber-400 flex items-center gap-1.5">
          <AlertTriangle size={12} className="shrink-0" />{error}
        </p>
      )}
      {viewer !== null && viewer >= 0 && (
        <ImageViewer images={shown} index={viewer} setIndex={setViewer} onClose={closeViewer} fallbackAlt="Idea image" />
      )}
    </section>
  );
}

/* ─── Tag chips + input, with existing tags offered as quick picks ─── */
function TagEditor({ tags, input, setInput, onAdd, onRemove, suggestions = [], onEmptyEnter, bare = false }) {
  const [focused, setFocused] = useState(false);
  const q = cleanTag(input);
  const picks = focused ? suggestions.filter(s => !tags.includes(s) && (!q || s.includes(q))).slice(0, 8) : [];

  const onKeyDown = e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.trim()) onAdd(input);
      else if (e.key === 'Enter') onEmptyEnter?.();
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onRemove(tags[tags.length - 1]);
    }
  };

  return (
    <div className="min-w-0">
      <div className={bare
        ? 'flex flex-wrap items-center gap-1.5 min-w-0'
        : 'input-premium w-full min-h-9 px-2 py-1 rounded-lg flex flex-wrap items-center gap-1.5 focus-within:border-[color:var(--accent-line)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]'}>
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-0.5 h-6 pl-2 pr-0.5 rounded-md text-[12px] text-slate-300 bg-white/[0.05] border border-white/[0.08] max-w-full">
            <span className="truncate">{tag}</span>
            <button type="button" onClick={() => onRemove(tag)}
              className="w-5 h-5 inline-flex items-center justify-center rounded text-slate-500 hover:text-slate-100 hover:bg-white/[0.08] cursor-pointer shrink-0"
              aria-label={`Remove tag ${tag}`}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label="Add tag"
          placeholder={tags.length ? 'Add tag…' : 'Add tags…'}
          className="flex-1 min-w-[90px] h-7 bg-transparent outline-none text-[13px] text-slate-200 placeholder:text-slate-500"
        />
      </div>
      {picks.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {picks.map(s => (
            <button key={s} type="button" onMouseDown={e => e.preventDefault()} onClick={() => onAdd(s)}
              className="h-6 px-2 rounded-md text-[11.5px] text-slate-400 border border-dashed border-white/[0.1] hover:text-slate-100 hover:border-white/[0.18] transition-colors cursor-pointer">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Quick capture ────────────────────────────────────── */
function QuickCapture({ inputRef, onCapture, onMore, suggestions, defaultTag }) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef(null);

  const reset = () => { setTitle(''); setNotes(''); setTags([]); setTagInput(''); };

  const finalTags = () => {
    const pending = cleanTag(tagInput);
    return pending && !tags.includes(pending) ? [...tags, pending] : tags;
  };

  const addTag = raw => {
    const c = cleanTag(raw);
    if (c && !tags.includes(c)) setTags(prev => [...prev, c]);
    setTagInput('');
  };

  const submit = async e => {
    e?.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const added = await onCapture({
        title: title.trim(), content: notes.trim(),
        image_url: '', images: [], links: [], tags: finalTags(),
      });
      // A failed save keeps the draft; App already shows the error toast.
      if (added) { reset(); inputRef.current?.focus(); }
    } finally {
      setSaving(false);
    }
  };

  const more = () => {
    onMore({ title: title.trim(), content: notes.trim(), tags: finalTags() });
    reset();
    setOpen(false);
  };

  const onFocus = () => {
    if (open) return;
    setOpen(true);
    if (defaultTag && tags.length === 0) setTags([defaultTag]);
  };

  const onBlur = e => {
    if (wrapRef.current?.contains(e.relatedTarget)) return;
    if (!title.trim() && !notes.trim() && !tagInput.trim()) { setOpen(false); setTags([]); }
  };

  const keepFocus = e => e.preventDefault();

  return (
    <Card as="form" ref={wrapRef} onSubmit={submit} onFocus={onFocus} onBlur={onBlur}
      className={`transition-[border-color,box-shadow] duration-200 ${open ? '!border-white/[0.14] shadow-[var(--shadow-md)]' : ''}`}>
      <div className="flex items-center gap-2.5 px-3.5">
        <Lightbulb size={15} className={`shrink-0 transition-colors ${open ? 'text-slate-300' : 'text-slate-500'}`} />
        <input
          ref={inputRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
            else if (e.key === 'Escape') e.currentTarget.blur();
          }}
          placeholder="Capture an idea…"
          aria-label="Capture an idea"
          className="flex-1 min-w-0 h-11 bg-transparent text-[14px] text-slate-100 placeholder:text-slate-500 outline-none"
        />
        {!open && <span className="kbd hidden sm:inline-flex shrink-0" title="Press N to capture">N</span>}
      </div>

      {open && (
        <div className="px-3.5 pb-3 fade-up">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }}
            rows={2}
            placeholder="Add a description…"
            aria-label="Description"
            className="w-full bg-transparent py-1 text-[13px] leading-relaxed text-slate-300 placeholder:text-slate-600 outline-none resize-none [field-sizing:content] min-h-[44px] max-h-48"
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-2.5 mt-1">
            <div className="flex-1 min-w-[160px] flex items-start gap-1.5">
              <Hash size={12} className="text-slate-500 shrink-0 mt-2" />
              <div className="flex-1 min-w-0">
                <TagEditor bare tags={tags} input={tagInput} setInput={setTagInput}
                  onAdd={addTag} onRemove={t => setTags(prev => prev.filter(x => x !== t))}
                  suggestions={suggestions} onEmptyEnter={submit} />
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden md:flex items-center gap-1 text-[11.5px] text-slate-600"><span className="kbd">↵</span> save</span>
              <button type="button" onMouseDown={keepFocus} onClick={more} title="Open the full editor for links and images"
                className="btn-ghost h-8 px-2.5 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
                <ImagePlus size={13} />
                <span className="hidden sm:inline">Links &amp; images</span>
                <span className="sm:hidden">More</span>
              </button>
              <button type="submit" onMouseDown={keepFocus} disabled={!title.trim() || saving}
                className="btn-primary h-8 px-3.5 rounded-lg text-[13px] cursor-pointer">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function IdeaVaultView({
  ideas, onAdd, onUpdate, onDelete, loading, onLock, showToast, onMenuToggle, initialSelectedIdeaId, onClearInitialSelectedIdea,
  onPromoteToProject, promotedMap = {}, onOpenConcept, headerExtra, onSetStage
}) {
  const [searchTerm, setSearchTerm]     = useState('');
  const [selectedTag, setSelectedTag]   = useState('');
  const [isFormOpen, setIsFormOpen]     = useState(false);
  const [editingIdea, setEditingIdea]   = useState(null);

  // Pins and the custom order are synced across devices (prefs.js).
  const [pinnedPref, setPinnedIds] = usePref('anonvault_ideas_pinned', []);
  const pinnedIds = useMemo(() => (Array.isArray(pinnedPref) ? pinnedPref : []), [pinnedPref]);
  const [formStarred, setFormStarred] = useState(false);
  const [formStatus, setFormStatus] = useState('new');
  const [formDue, setFormDue] = useState(''); // optional deadline, shown on the Calendar
  const [stage, setStage] = useState(''); // '' = every stage

  const togglePin = (id) => {
    setPinnedIds(prev => {
      const updated = prev.includes(id)
        ? prev.filter(item => item !== id)
        : [...prev, id];
      return updated;
    });
  };

  /* sorting and drag state */
  const [orderPref, setSavedOrder]      = usePref('anonvault_ideas_order', []);
  const savedOrder = useMemo(() => (Array.isArray(orderPref) ? orderPref : []), [orderPref]);
  const [sortBy, setSortBy]             = useState(() => localStorage.getItem('anonvault_ideas_sortby') || 'custom'); // 'custom', 'newest', 'oldest'
  const [draggedId, setDraggedId]       = useState(null);
  const [draggedOverId, setDraggedOverId] = useState(null);
  const [hoveredDragId, setHoveredDragId] = useState(null);

  /* form fields */
  const [formTitle,       setFormTitle]       = useState('');
  const [formContent,     setFormContent]     = useState('');
  const [formTags,        setFormTags]        = useState([]);   // Array of strings
  const [tagInputVal,     setTagInputVal]     = useState('');   // Active typed tag
  const [formImages,      setFormImages]      = useState([]);   // [{url, caption, is_primary?}]
  const [formLinks,       setFormLinks]       = useState([]);   // [{url, label}]

  /* upload state */
  const [uploading,       setUploading]       = useState(0);    // images in flight
  const [uploadError,     setUploadError]     = useState('');

  /* modals */
  const [deleteConfirmId,    setDeleteConfirmId]    = useState(null);
  const [selectedIdea,       setSelectedIdea]       = useState(null);

  // Stable, because <Modal> re-runs its focus effect whenever onClose changes —
  // an inline arrow would yank focus back to the title on every keystroke.
  const closeForm   = useCallback(() => setIsFormOpen(false), []);
  const closeDetail = useCallback(() => setSelectedIdea(null), []);
  const closeDelete = useCallback(() => setDeleteConfirmId(null), []);

  /* Persist sorting selection */
  useEffect(() => {
    localStorage.setItem('anonvault_ideas_sortby', sortBy);
  }, [sortBy]);

  /* Database ideas in the custom local order; ideas not in it yet go on top. */
  const orderedIdeas = useMemo(() => {
    if (!ideas) return [];
    const orderMap = new Map();
    savedOrder.forEach((id, idx) => orderMap.set(String(id), idx));

    return [...ideas].sort((a, b) => {
      const orderA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : -1;
      const orderB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : -1;

      if (orderA === -1 && orderB === -1) {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      if (orderA === -1) return -1;
      if (orderB === -1) return 1;
      return orderA - orderB;
    });
  }, [ideas, savedOrder]);

  useEffect(() => {
    if (initialSelectedIdeaId && ideas) {
      const found = ideas.find(i => String(i.id) === String(initialSelectedIdeaId));
      if (found) {
        setSelectedIdea(found);
        onClearInitialSelectedIdea?.();
      }
    }
  }, [initialSelectedIdeaId, ideas, onClearInitialSelectedIdea]);

  /* ── helpers ── */
  const resetForm = () => {
    setFormTitle(''); setFormContent('');
    setFormTags([]); setTagInputVal('');
    setFormImages([]); setFormLinks([]);
    setUploading(0); setUploadError('');
    setEditingIdea(null);
    setFormStarred(false);
    setFormStatus('new');
    setFormDue('');
  };

  const { isArchived, toggleArchived, archivedIds } = useArchive('anonvault_ideas_archived');
  const [showArchived, setShowArchived] = useState(false);

  // Promoted means moved, not copied — so the idea leaves the active vault.
  // Archived rather than deleted, deliberately: the concept carries a
  // promoted_from FK to this row, and the FK is ON DELETE SET NULL, so
  // deleting the idea would silently sever the trace and break the
  // "Promoted" badge that depends on it. Archiving gets it out of the way
  // and stays reversible.
  const handlePromote = async idea => {
    const ok = await onPromoteToProject?.(idea);
    if (ok && !isArchived(idea.id)) toggleArchived(idea.id);
  };

  /* Full editor for a new idea, optionally carrying over the quick-capture draft. */
  const handleOpenAdd = (prefill) => {
    resetForm();
    if (prefill) {
      setFormTitle(prefill.title || '');
      setFormContent(prefill.content || '');
      setFormTags(prefill.tags || []);
    }
    setIsFormOpen(true);
  };

  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const captureRef = useRef(null);

  // N goes to quick capture; the header button opens the full editor. The archive hides the
  // composer, since nothing can be created into it.
  const focusCapture = useCallback(() => {
    setShowArchived(false);
    requestAnimationFrame(() => captureRef.current?.focus());
  }, []);
  useShortcutHooks({ onNew: focusCapture, searchRef, rootRef });

  const handleOpenEdit = (idea) => {
    setEditingIdea(idea);
    setFormTitle(idea.title);
    setFormContent(idea.content || '');
    setFormTags(idea.tags || []);
    setTagInputVal('');
    setFormStarred(pinnedIds.includes(idea.id));
    setFormStatus(stageOf(idea).id);
    setFormDue(idea.due_date || '');
    setFormImages(ideaImages(idea));
    setFormLinks(editorLinks(idea.links));
    setUploading(0); setUploadError('');
    setIsFormOpen(true);
  };

  /* ── image handlers ── */
  const removeImageRow = (i) => setFormImages(p => p.filter((_, idx) => idx !== i));
  const changeImageCaption = (i, caption) =>
    setFormImages(p => p.map((item, idx) => idx === i ? { ...item, caption } : item));
  const handleSetPrimary = (index) =>
    setFormImages(p => p.map((item, idx) => ({ ...item, is_primary: idx === index })));

  // Ideas upload to the Supabase "idea-images" bucket only (no local
  // fallback), capped at 4 MB each. Several files (picked or pasted) go
  // one after another.
  const addImageFiles = async (files) => {
    const list = [...(files || [])].filter(f => f.type?.startsWith('image/'));
    if (!list.length) return;
    setUploadError('');
    for (const file of list) {
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        showToast?.('warning', 'File Too Large', `Maximum image size is ${MAX_IMAGE_MB} MB.`);
        setUploadError(`Max ${MAX_IMAGE_MB} MB`);
        continue;
      }
      setUploading(n => n + 1);
      try {
        const publicUrl = await uploadIdeaImage(file);
        setFormImages(p => [...p, { url: publicUrl, caption: '' }]);
        showToast?.('success', 'Image Uploaded', 'Your image is ready.');
      } catch {
        setUploadError('Upload failed — check your "idea-images" storage bucket.');
        showToast?.('error', 'Upload Failed', 'Could not upload image. Check your storage bucket.');
      } finally {
        setUploading(n => n - 1);
      }
    }
  };

  const handleFormPaste = (e) => {
    const imgs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (imgs.length) { e.preventDefault(); addImageFiles(imgs); }
  };

  /* ── tag form handlers ── */
  const addFormTag = (tagText) => {
    const cleaned = cleanTag(tagText);
    if (cleaned && !formTags.includes(cleaned)) {
      setFormTags(prev => [...prev, cleaned]);
    }
    setTagInputVal('');
  };

  const removeFormTag = (tagToRemove) => {
    setFormTags(prev => prev.filter(t => t !== tagToRemove));
  };

  /* ── native drag events ── */
  const handleDragStart = (e, id) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDraggedId(id);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDraggedOverId(null);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) {
      setDraggedOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDraggedOverId(null);
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedId;
    if (!sourceId || String(sourceId) === String(targetId)) {
      handleDragEnd();
      return;
    }

    const sourceIndex = orderedIdeas.findIndex(item => String(item.id) === String(sourceId));
    const targetIndex = orderedIdeas.findIndex(item => String(item.id) === String(targetId));

    if (sourceIndex !== -1 && targetIndex !== -1) {
      const newOrderedIdeas = [...orderedIdeas];
      const [removed] = newOrderedIdeas.splice(sourceIndex, 1);
      newOrderedIdeas.splice(targetIndex, 0, removed);

      const newOrderIds = newOrderedIdeas.map(item => item.id);
      setSavedOrder(newOrderIds);
    }
    handleDragEnd();
  };

  /* ── submit ──
     saveForm returns false when nothing was saved, otherwise the saved idea
     as far as it is known here (edits merged over the stored row). */
  const saveForm = async () => {
    if (uploading > 0) return false;
    if (!formTitle.trim()) {
      showToast?.('error', 'Title Required', 'Please give your idea a title before saving.');
      return false;
    }

    let finalTags = [...formTags];
    const pending = cleanTag(tagInputVal);
    if (pending && !finalTags.includes(pending)) finalTags.push(pending);

    const validImages = formImages.filter(i => i.url.trim());
    const validLinks  = formLinks.filter(l => l.url.trim());

    const payload = {
      title:     formTitle.trim(),
      content:   formContent.trim(),
      image_url: validImages[0]?.url || '',   // keep legacy field
      images:    validImages,
      links:     validLinks,
      tags:      finalTags,
      status:    formStatus,
      due_date:  formDue || null,
    };

    if (editingIdea) {
      await onUpdate(editingIdea.id, payload);
      setPinnedIds(prev => {
        const isCurrentlyPinned = prev.includes(editingIdea.id);
        if (formStarred && !isCurrentlyPinned) {
          const updated = [...prev, editingIdea.id];
          return updated;
        } else if (!formStarred && isCurrentlyPinned) {
          const updated = prev.filter(id => id !== editingIdea.id);
          return updated;
        }
        return prev;
      });
      return { ...editingIdea, ...payload };
    }
    const added = await onAdd(payload);
    if (added && added.id && formStarred) {
      setPinnedIds(prev => {
        const updated = [...prev, added.id];
        return updated;
      });
    }
    return added || null;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const saved = await saveForm();
    if (saved === false) return;
    setIsFormOpen(false); resetForm();
  };

  // "Send to board" from the editor: save the edits first so the card is
  // made from what is on screen, then run the usual promote flow.
  const handleSendFromEditor = async () => {
    if (!editingIdea) return;
    const saved = await saveForm();
    if (saved === false) return;
    setIsFormOpen(false); resetForm();
    await handlePromote(saved);
  };

  /* ── derived tags for filters ── */
  const allTags = Array.from(new Set((ideas || []).flatMap(i => (i && i.tags) || []))).sort();
  // A filter on a tag that no longer exists must still be clearable.
  const tagChips = selectedTag && !allTags.includes(selectedTag) ? [...allTags, selectedTag] : allTags;

  // Perform filtering and sorting dynamically
  const getProcessedIdeas = () => {
    let list = [...orderedIdeas];

    if (sortBy === 'newest') {
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } else if (sortBy === 'oldest') {
      list.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    }

    return list.filter(idea => {
      if (!idea) return false;
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        (idea.title  || '').toLowerCase().includes(q) ||
        (idea.content || '').toLowerCase().includes(q);
      const matchesTag = !selectedTag || (idea.tags && idea.tags.includes(selectedTag));
      if (stage && stageOf(idea).id !== stage) return false;
      // Archived rows are hidden unless explicitly asked for; the archive view
      // shows only them, so nothing is ever invisible in both modes.
      if (showArchived !== archivedIds.includes(idea.id)) return false;
      return matchesSearch && matchesTag;
    });
  };

  const processedIdeas = getProcessedIdeas();
  const pinnedIdeas = processedIdeas.filter(i => pinnedIds.includes(i.id));
  const regularIdeas = processedIdeas.filter(i => !pinnedIds.includes(i.id));
  // Display order, not data order — j/k must follow what is on screen.
  const navIds = [...pinnedIdeas, ...regularIdeas].map(i => i.id);
  const isFiltering = !!(searchTerm || selectedTag || stage);
  const stageCounts = IDEA_STAGES.reduce((m, st) => {
    m[st.id] = (ideas || []).filter(i => i && !archivedIds.includes(i.id) && stageOf(i).id === st.id).length;
    return m;
  }, {});

  const nav = useListNav({
    ids: navIds,
    onOpen: id => {
      const found = processedIdeas.find(i => i.id === id);
      if (found) setSelectedIdea(found);
    },
    rootRef,
  });

  const bulkArchive = () => {
    const ids = nav.selectedIds;
    ids.forEach(id => { if (showArchived === isArchived(id)) toggleArchived(id); });
    nav.clearSelection();
    showToast?.('success', showArchived ? 'Restored' : 'Archived',
      `${ids.length} idea${ids.length === 1 ? '' : 's'} ${showArchived ? 'restored' : 'archived'}.`);
  };

  const bulkDelete = async () => {
    const ids = nav.selectedIds;
    nav.clearSelection();
    // Sequential: each delete updates the same list state, and the handlers
    // filter from the previous value.
    for (const id of ids) await onDelete?.(id);
  };

  /* FLIP layout transition animation */
  const prevRectsRef = useRef({});
  const flipKey = processedIdeas.map(i => i.id).join(',');

  useLayoutEffect(() => {
    const elements = rootRef.current?.querySelectorAll('[data-flip-id]') || [];
    const newRects = {};

    elements.forEach(el => {
      const id = el.getAttribute('data-flip-id');
      newRects[id] = el.getBoundingClientRect();
    });

    Object.keys(prevRectsRef.current).forEach(id => {
      const first = prevRectsRef.current[id];
      const last = newRects[id];

      if (first && last) {
        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;

        if (deltaX !== 0 || deltaY !== 0) {
          const el = Array.from(elements).find(node => node.getAttribute('data-flip-id') === id);
          if (el) {
            el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            el.style.transition = 'none';
            el.offsetHeight; // force reflow

            requestAnimationFrame(() => {
              el.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
              el.style.transform = '';
            });

            setTimeout(() => {
              el.style.transition = '';
              el.style.transform = '';
            }, 450);
          }
        }
      }
    });

    prevRectsRef.current = newRects;
  }, [flipKey]);

  const cardProps = idea => ({
    idea,
    onEdit: handleOpenEdit,
    onDelete: id => setDeleteConfirmId(id),
    onSelectTag: setSelectedTag,
    onViewDetails: setSelectedIdea,
    setHoveredDragId,
    isPinned: pinnedIds.includes(idea.id),
    onTogglePin: togglePin,
    onPromote: handlePromote,
    promotedTo: promotedMap[idea.id],
    onOpenConcept,
    onToggleArchive: toggleArchived,
    archived: isArchived(idea.id),
    selected: nav.isSelected(idea.id),
    onToggleSelect: nav.toggleSelect,
    focused: nav.cursorId === idea.id,
  });

  /* ── render ── */
  return (
    <div ref={rootRef} className="h-full flex flex-col overflow-hidden">
      <PageHeader
        title="Ideas"
        stats={[{ value: (ideas || []).length, label: 'ideas', always: true }]}
        onMenuToggle={onMenuToggle}
        onLock={onLock}
        headerChildren={headerExtra}
        actions={
          <button onClick={() => handleOpenAdd()} className="btn-primary h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
            <Plus size={14} />
            <span className="hidden sm:inline">New idea</span>
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-6 space-y-5 reveal-stagger">
          {!showArchived && (
            <QuickCapture
              inputRef={captureRef}
              onCapture={onAdd}
              onMore={handleOpenAdd}
              suggestions={allTags}
              defaultTag={selectedTag}
            />
          )}

          {/* stages: where each idea is on its way to being built */}
          {!showArchived && (
            <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Stage">
              {IDEA_STAGES.map(st => {
                const on = stage === st.id;
                return (
                  <button key={st.id} role="tab" aria-selected={on} onClick={() => setStage(v => (v === st.id ? '' : st.id))}
                    className={`panel text-left px-3.5 py-2.5 cursor-pointer transition-colors ${on ? '!border-white/[0.18] !bg-white/[0.05]' : 'panel-hover'}`}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: st.color }} />
                      <span className="text-[13px] text-slate-200 font-medium">{st.label}</span>
                      <span className="ml-auto text-[13px] tabular-nums text-slate-400">{stageCounts[st.id]}</span>
                    </span>
                    <span className="hidden sm:block text-[11.5px] text-slate-500 mt-0.5 pl-4">{st.hint}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] sm:max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                ref={searchRef}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search ideas"
                aria-label="Search ideas"
                className="input-premium w-full h-8 pl-8 pr-3 rounded-lg text-[13px]"
              />
            </div>

            {tagChips.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 max-w-full [scrollbar-width:none]">
                <button onClick={() => setSelectedTag('')} className={chipCls(!selectedTag)}>All</button>
                {tagChips.map(tag => (
                  <button key={tag} onClick={() => setSelectedTag(t => (t === tag ? '' : tag))}
                    aria-pressed={selectedTag === tag} className={chipCls(selectedTag === tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setShowArchived(v => !v)}
                title={showArchived ? 'Back to active' : 'Show archived'}
                aria-pressed={showArchived}
                className={`${chipCls(showArchived)} gap-1.5 !text-[13px]`}>
                <Archive size={13} className={showArchived ? 'text-slate-300' : 'text-slate-500'} />
                {showArchived ? 'Archived' : 'Archive'}
              </button>
              <Select size="sm" value={sortBy} onChange={setSortBy} options={SORT_OPTIONS}
                ariaLabel="Sort ideas" className="w-[140px]" />
            </div>
          </div>

          {/* Being inside the archive has to be unmistakable — otherwise an
              empty archive reads as an empty section. */}
          {showArchived && (
            <div className="panel flex items-center gap-2.5 px-3.5 py-2.5">
              <Archive size={14} className="text-slate-500 shrink-0" />
              <p className="text-[13px] text-slate-200 flex-1 min-w-0">
                Viewing archive
                <span className="text-slate-500">
                  {' '}&middot; {archivedIds.length} idea{archivedIds.length === 1 ? '' : 's'} archived
                </span>
              </p>
              <button
                onClick={() => setShowArchived(false)}
                className="btn-ghost shrink-0 h-7 px-2.5 text-[12.5px] rounded-md cursor-pointer">
                Back to active
              </button>
            </div>
          )}

          {loading ? (
            <div className="h-48 flex items-center justify-center gap-2.5 text-slate-500 text-[13px]">
              <span className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : processedIdeas.length === 0 ? (
            /* An empty archive is not an empty vault, and must not offer to
               create something into a bucket you cannot create into. */
            <Empty
              icon={showArchived ? Archive : isFiltering ? Search : Lightbulb}
              title={showArchived ? 'Nothing archived' : isFiltering ? 'No matching ideas' : 'No ideas yet'}
              body={showArchived
                ? 'Ideas land in the archive when you archive them, or when you send one to the board.'
                : isFiltering ? 'Try another search or tag.' : 'Type a title above and press Enter. Add notes, links and images whenever you like.'}
              action={showArchived ? (
                <button onClick={() => setShowArchived(false)}
                  className="btn-primary h-8 px-3 text-[13px] rounded-lg cursor-pointer">
                  Back to active ideas
                </button>
              ) : isFiltering ? (
                <button onClick={() => { setSearchTerm(''); setSelectedTag(''); setStage(''); }}
                  className="btn-ghost h-8 px-3 text-[13px] rounded-lg cursor-pointer">
                  Clear filters
                </button>
              ) : null}
            />
          ) : (
            <div className="space-y-5">
              {pinnedIdeas.length > 0 && (
                <section>
                  <SectionHeading icon={Pin} label="Pinned" count={pinnedIdeas.length} />
                  <div className={masonryCls}>
                    {pinnedIdeas.map(idea => (
                      <div key={idea.id} data-nav-id={idea.id} className="break-inside-avoid">
                        <IdeaCard {...cardProps(idea)} canDrag={false} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {regularIdeas.length > 0 && (
                <section>
                  {pinnedIdeas.length > 0 && <SectionHeading icon={Lightbulb} label="Other ideas" count={regularIdeas.length} />}
                  <div className={masonryCls}>
                    {regularIdeas.map(idea => (
                      <div
                        key={idea.id}
                        data-flip-id={idea.id}
                        data-nav-id={idea.id}
                        draggable={sortBy === 'custom' && hoveredDragId === idea.id && !isFiltering}
                        onDragStart={e => handleDragStart(e, idea.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={e => handleDragOver(e, idea.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={e => handleDrop(e, idea.id)}
                        className={`break-inside-avoid rounded-xl transition-opacity duration-200 ${
                          draggedId === idea.id ? 'opacity-40' : ''
                        } ${
                          draggedOverId === idea.id ? 'ring-1 ring-white/25 ring-offset-2 ring-offset-[color:var(--bg)]' : ''
                        }`}
                      >
                        <IdeaCard {...cardProps(idea)} canDrag={sortBy === 'custom' && !isFiltering} />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      <BulkBar
        count={nav.selectedIds.length}
        noun="idea"
        onClear={nav.clearSelection}
        actions={[
          { label: showArchived ? 'Restore' : 'Archive', icon: showArchived ? ArchiveRestore : Archive, onClick: bulkArchive },
          { label: 'Delete', icon: Trash2, danger: true, onClick: bulkDelete },
        ]}
      />

      {/* ═══ ADD / EDIT ═══
          Built from the shared editor kit (editor.jsx), like the board's card
          editor: content on the left, properties on the right. */}
      <Modal open={isFormOpen} onClose={closeForm} title={editingIdea ? 'Edit idea' : 'New idea'} width={780}
        footer={<>
          {editingIdea && (
            <button type="button" onClick={() => { const id = editingIdea.id; closeForm(); setDeleteConfirmId(id); }}
              className="btn-danger h-8 px-3 rounded-lg text-[13px] cursor-pointer mr-auto inline-flex items-center gap-1.5">
              <Trash2 size={13} /><span className="hidden sm:inline">Delete</span>
            </button>
          )}
          <span className="hidden sm:flex items-center gap-1 text-[11.5px] text-slate-600 mr-1"><span className="kbd">Ctrl</span><span className="kbd">↵</span> save</span>
          <button type="button" onClick={closeForm} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={uploading > 0}
            className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {editingIdea ? 'Save' : 'Save idea'}
          </button>
        </>}>
        <form onSubmit={handleSubmit} onPaste={handleFormPaste}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e); }}>
          <EditorLayout aside={<>
            <PropRow icon={Sparkles} label="Stage">
              <div className="flex flex-wrap gap-1">
                {IDEA_STAGES.map(st => (
                  <button key={st.id} type="button" onClick={() => setFormStatus(st.id)} aria-pressed={formStatus === st.id}
                    className={`${chipCls(formStatus === st.id)} !h-7 gap-1.5`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />{st.label}
                  </button>
                ))}
              </div>
            </PropRow>
            <PropRow icon={Clock} label="Deadline">
              <DueField compact withTime={false} date={formDue} onDate={setFormDue} placeholder="No deadline" />
            </PropRow>
            <PropRow icon={Tag} label="Tags" top>
              <TagEditor tags={formTags} input={tagInputVal} setInput={setTagInputVal}
                onAdd={addFormTag} onRemove={removeFormTag} suggestions={allTags} />
            </PropRow>
            <PropRow icon={Pin} label="Pinned">
              <button type="button" onClick={() => setFormStarred(s => !s)} aria-pressed={formStarred}
                className={`${chipCls(formStarred)} !h-7 gap-1.5`}>
                <Pin size={12} className={formStarred ? 'text-amber-400 fill-amber-400/30' : 'text-slate-500'} />
                {formStarred ? 'Pinned to top' : 'Pin to top'}
              </button>
            </PropRow>
            {editingIdea && (
              <PropRow icon={Rocket} label="Board">
                {promotedMap[editingIdea.id] ? (
                  <button type="button" title="Open the board card this became"
                    onClick={() => { const to = promotedMap[editingIdea.id]; closeForm(); onOpenConcept?.(to); }}
                    className="inline-flex items-center gap-1.5 h-7 px-2 text-[12.5px] rounded-md cursor-pointer transition-colors text-accent-300 bg-accent-500/10 border border-accent-500/25 hover:bg-accent-500/15">
                    <Rocket size={12} /> On the board
                  </button>
                ) : (
                  <button type="button" onClick={handleSendFromEditor} disabled={uploading > 0}
                    title="Save, then turn this idea (and any - step lines in the notes) into Board cards"
                    className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12.5px] text-slate-300 border border-white/[0.1] hover:bg-white/[0.05] hover:text-slate-100 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <Rocket size={12} /> Start building{stepsIn(formContent).length ? ` · ${stepsIn(formContent).length} steps` : ''}
                  </button>
                )}
              </PropRow>
            )}
            {editingIdea?.created_at && (
              <p className="text-[11.5px] text-slate-600 pt-3 mt-2 border-t border-white/[0.06]">
                Created {formatDate(editingIdea.created_at)}
              </p>
            )}
          </>}>
            <TitleInput value={formTitle} onChange={setFormTitle} placeholder="Idea title" />
            <DescriptionInput value={formContent} onChange={setFormContent}
              placeholder={'What is it, who is it for…\n\nSteps become Board cards when you start building:\n- First step\n- Second step'} />
            <LinksEditor links={formLinks} onChange={setFormLinks} />
            <IdeaImagesEditor images={formImages} uploading={uploading} error={uploadError}
              onAddFiles={addImageFiles} onRemove={removeImageRow} onCaption={changeImageCaption}
              onSetPrimary={handleSetPrimary} />
          </EditorLayout>
          <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
        </form>
      </Modal>

      {/* ═══ DELETE CONFIRM ═══ */}
      <Modal open={!!deleteConfirmId} onClose={closeDelete} title="Delete idea" width={400}
        footer={<>
          <button onClick={closeDelete} className="btn-ghost h-8 px-3 text-[13px] rounded-lg cursor-pointer">Keep it</button>
          <button onClick={async () => { await onDelete(deleteConfirmId); setDeleteConfirmId(null); }}
            className="btn-danger h-8 px-3 text-[13px] rounded-lg cursor-pointer">Delete</button>
        </>}>
        <p className="text-[13px] text-slate-400 leading-relaxed">
          Delete this idea? Its notes, links and images go with it. This cannot be undone.
        </p>
      </Modal>

      {/* ═══ DETAILS ═══ */}
      {selectedIdea && (
        <IdeaDetailModal
          key={selectedIdea.id}
          idea={selectedIdea}
          onClose={closeDetail}
          onEdit={(idea) => { handleOpenEdit(idea); setSelectedIdea(null); }}
          promotedTo={promotedMap[selectedIdea.id]}
          onOpenConcept={onOpenConcept}
          isPinned={pinnedIds.includes(selectedIdea.id)}
          onTogglePin={() => togglePin(selectedIdea.id)}
          onPromote={() => { const idea = selectedIdea; setSelectedIdea(null); handlePromote(idea); }}
          archived={isArchived(selectedIdea.id)}
          onToggleArchive={() => { toggleArchived(selectedIdea.id); setSelectedIdea(null); }}
          onDelete={() => { const id = selectedIdea.id; setSelectedIdea(null); setDeleteConfirmId(id); }}
          onSetStage={st => { onSetStage?.(selectedIdea.id, st); setSelectedIdea(i => (i ? { ...i, status: st } : i)); }}
        />
      )}
    </div>
  );
}

function SectionHeading({ icon: Icon, label, count }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={13} className="text-slate-500" />
      <h3 className="text-[13px] font-medium text-slate-200">{label}</h3>
      <span className="text-[12px] text-slate-500 tabular-nums">{count}</span>
    </div>
  );
}

/* ─── Detail dialog ───────────────────────────────────────
   Same two-pane feel as the editor: content left, properties and actions
   right (stacked under the content on phones). */
function IdeaDetailModal({
  idea, onClose, onEdit, promotedTo, onOpenConcept,
  isPinned, onTogglePin, onPromote, archived, onToggleArchive, onDelete, onSetStage,
}) {
  const images = ideaImages(idea);
  const links  = (idea.links || []).filter(l => l && (l.url || l.label));
  const tags   = idea.tags || [];

  const [imgIdx, setImgIdx] = useState(() => Math.max(0, images.findIndex(img => img.is_primary)));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const closeFullscreen = useCallback(() => setIsFullscreen(false), []);
  const current = images[imgIdx];

  const navBtn = 'absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-black/60 border border-white/10 text-slate-300 hover:text-white hover:bg-black/80 flex items-center justify-center transition-colors cursor-pointer';
  const sideBtn = 'w-full h-8 px-2.5 rounded-lg text-[13px] inline-flex items-center gap-2 border border-transparent text-slate-300 hover:bg-white/[0.05] hover:text-slate-100 cursor-pointer transition-colors';

  return (
    <Modal open onClose={onClose} title="Idea" width={780}
      footer={<>
        <button onClick={onClose} className="btn-ghost h-8 px-3 text-[13px] rounded-lg cursor-pointer">Close</button>
        <button onClick={() => onEdit(idea)} className="btn-primary h-8 px-4 text-[13px] rounded-lg cursor-pointer inline-flex items-center gap-1.5">
          <Pencil size={13} /> Edit
        </button>
      </>}>
      <EditorLayout aside={<>
        <PropRow icon={Tag} label="Tags" top={tags.length > 0}>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tags.map(tag => (
                <span key={tag} className="inline-flex items-center h-6 px-2 rounded-md text-[12px] text-slate-300 bg-white/[0.05] border border-white/[0.08] max-w-full truncate">{tag}</span>
              ))}
            </div>
          ) : <span className="text-[12.5px] text-slate-600">None</span>}
        </PropRow>
        <PropRow icon={Pin} label="Pinned">
          <button type="button" onClick={onTogglePin} aria-pressed={!!isPinned}
            className={`${chipCls(isPinned)} !h-7 gap-1.5`}>
            <Pin size={12} className={isPinned ? 'text-amber-400 fill-amber-400/30' : 'text-slate-500'} />
            {isPinned ? 'Pinned to top' : 'Pin to top'}
          </button>
        </PropRow>
        <PropRow icon={Sparkles} label="Stage">
          <div className="flex flex-wrap gap-1">
            {IDEA_STAGES.map(st => {
              const on = stageOf(idea).id === st.id;
              return (
                <button key={st.id} type="button" onClick={() => onSetStage?.(st.id)} aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] border cursor-pointer transition-colors ${on ? 'bg-white/[0.08] border-white/[0.16] text-slate-100' : 'border-white/[0.07] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'}`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />{st.label}
                </button>
              );
            })}
          </div>
        </PropRow>
        <PropRow icon={Clock} label="Deadline">
          {idea.due_date ? (
            <span className={`text-[12.5px] ${idea.due_date < new Date().toISOString().slice(0, 10) ? 'text-rose-300' : 'text-slate-200'}`}>
              {new Date(idea.due_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          ) : <span className="text-[12.5px] text-slate-600">None</span>}
        </PropRow>
        <PropRow icon={Rocket} label="Board">
          {promotedTo ? (
            <button onClick={() => { onClose(); onOpenConcept?.(promotedTo); }} title="Open the board card this became"
              className="inline-flex items-center gap-1.5 h-7 px-2 text-[12.5px] rounded-md cursor-pointer transition-colors text-accent-300 bg-accent-500/10 border border-accent-500/25 hover:bg-accent-500/15">
              <Rocket size={12} /> On the board
            </button>
          ) : <span className="text-[12.5px] text-slate-600">Not sent yet</span>}
        </PropRow>
        {archived && (
          <PropRow icon={Archive} label="Status">
            <span className="text-[12.5px] text-slate-400">Archived</span>
          </PropRow>
        )}

        <div className="pt-3 mt-2 border-t border-white/[0.06] space-y-0.5">
          {!promotedTo && (
            <button type="button" onClick={onPromote} className={sideBtn}
              title="Turn this idea, and any - step lines in its notes, into Board cards">
              <Rocket size={13} className="text-slate-500" /> Start building{stepsIn(idea.content).length ? ` · ${stepsIn(idea.content).length} steps` : ''}
            </button>
          )}
          <button type="button" onClick={onToggleArchive} className={sideBtn}>
            {archived
              ? <><ArchiveRestore size={13} className="text-slate-500" /> Restore from archive</>
              : <><Archive size={13} className="text-slate-500" /> Archive</>}
          </button>
          <button type="button" onClick={onDelete} className={`${sideBtn} hover:!text-rose-300 hover:!bg-rose-400/[0.06]`}>
            <Trash2 size={13} className="text-slate-500" /> Delete
          </button>
          {idea.created_at && (
            <p className="text-[11.5px] text-slate-600 pt-2 px-0.5">
              <Clock size={11} className="inline -mt-px mr-1" />Captured {formatDate(idea.created_at)}
            </p>
          )}
        </div>
      </>}>
        <h2 className="text-[20px] font-semibold leading-snug tracking-[-0.015em] text-slate-50 break-words">{idea.title}</h2>

        {idea.content ? (
          <p className="text-[14px] text-slate-300 whitespace-pre-line leading-relaxed break-words">{idea.content}</p>
        ) : !current && !links.length && (
          <p className="text-[13px] text-slate-500">No notes yet. Edit to add a description, links or images.</p>
        )}

        {/* images */}
        {current && (
          <section className="space-y-2">
            <div className="relative h-56 sm:h-72 rounded-lg overflow-hidden bg-black/30 border border-white/[0.06] flex items-center justify-center group/carousel">
              <img src={current.url} alt={current.caption || idea.title} className="w-full h-full object-contain cursor-zoom-in"
                onClick={() => setIsFullscreen(true)} />
              <button type="button" onClick={() => setIsFullscreen(true)} title="Open full screen" aria-label="Open full screen"
                className="absolute top-2.5 right-2.5 w-8 h-8 inline-flex items-center justify-center bg-black/60 border border-white/10 rounded-lg text-slate-300 hover:text-white hover:bg-black/80 transition-[opacity,color,background-color] cursor-pointer [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/carousel:opacity-100 focus-visible:opacity-100">
                <Maximize2 size={13} />
              </button>
              {images.length > 1 && (
                <>
                  <button type="button" onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)}
                    className={`${navBtn} left-2.5`} title="Previous image" aria-label="Previous image">
                    <ChevronLeft size={16} />
                  </button>
                  <button type="button" onClick={() => setImgIdx(i => (i + 1) % images.length)}
                    className={`${navBtn} right-2.5`} title="Next image" aria-label="Next image">
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>
            {current.caption && <p className="text-[12.5px] text-slate-400 leading-relaxed">{current.caption}</p>}
            {images.length > 1 && (
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5">
                {images.map((img, i) => (
                  <button key={i} type="button" onClick={() => setImgIdx(i)} aria-label={`Show image ${i + 1}`}
                    className={`rounded-md overflow-hidden aspect-square border cursor-pointer transition-opacity ${
                      i === imgIdx ? 'border-slate-300' : 'border-white/[0.06] opacity-60 hover:opacity-100'}`}>
                    <img src={img.url} alt={img.caption || `Image ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {links.length > 0 && (
          <section>
            <SectionTitle>Links</SectionTitle>
            <div className="space-y-1">
              {links.map((link, i) => (
                isValidUrl(link.url) ? (
                  <a key={i} href={link.url} target="_blank" rel="noreferrer"
                    className="group/link flex items-center gap-2 h-9 px-2.5 -mx-2.5 rounded-lg hover:bg-white/[0.03] transition-colors min-w-0">
                    <span className="w-6 h-6 rounded-md bg-white/[0.05] flex items-center justify-center shrink-0"><Globe size={12} className="text-slate-400" /></span>
                    <span className="text-[13px] text-slate-200 truncate flex-1 group-hover/link:text-white">
                      {link.label || new URL(link.url).hostname.replace('www.', '')}
                    </span>
                    <ExternalLink size={12} className="text-slate-600 group-hover/link:text-slate-300 shrink-0" />
                  </a>
                ) : (
                  <div key={i} className="flex items-center gap-2 h-9 px-2.5 -mx-2.5 rounded-lg min-w-0">
                    <span className="w-6 h-6 rounded-md bg-white/[0.03] flex items-center justify-center shrink-0"><Globe size={12} className="text-slate-600" /></span>
                    <span className="text-[12.5px] text-slate-600 truncate">{link.label || link.url || '—'}</span>
                  </div>
                )
              ))}
            </div>
          </section>
        )}
      </EditorLayout>

      {isFullscreen && current && (
        <ImageViewer images={images} index={imgIdx} setIndex={setImgIdx} onClose={closeFullscreen} fallbackAlt={idea.title} />
      )}
    </Modal>
  );
}

/* ─── Idea card ───────────────────────────────────────── */
function IdeaCard({ idea, onEdit, onDelete, onSelectTag, onViewDetails, canDrag, setHoveredDragId, isPinned, onTogglePin, onPromote, promotedTo, onOpenConcept, onToggleArchive, archived, selected, onToggleSelect, focused }) {
  // Without this the funnel leaks: a promoted idea looked identical to an
  // unpromoted one, so the same idea would get promoted twice.
  const isPromoted = !!promotedTo;
  const images = ideaImages(idea);
  const cover = images.find(img => img.is_primary) || images[0];
  const linkCount = (idea.links || []).filter(l => l && l.url && l.url.trim()).length;
  const tags = idea.tags || [];
  const stop = e => e.stopPropagation();

  return (
    <article
      onClick={() => onViewDetails?.(idea)}
      style={focused ? { outline: '1px solid var(--accent-line)', outlineOffset: 2 } : undefined}
      className={`group panel panel-hover p-4 cursor-pointer ${selected ? '!border-[color:var(--accent-line)] !bg-[var(--surface-2)]' : ''}`}
    >
      {cover?.url && (
        <img src={cover.url} alt="" loading="lazy"
          className="block w-full max-h-40 object-cover rounded-lg mb-3 bg-black/20 border border-white/[0.06]" />
      )}

      <div className="flex items-start gap-2">
        <h4 className="flex-1 min-w-0 text-[14px] font-medium leading-snug text-slate-100 break-words">{idea.title}</h4>
        {isPinned && <Pin size={12} className="text-amber-400 fill-amber-400/30 shrink-0 mt-[3px]" aria-label="Pinned" />}
      </div>

      {idea.content && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400 line-clamp-4 break-words whitespace-pre-line">{idea.content}</p>
      )}

      {(isPromoted || tags.length > 0 || stageOf(idea).id !== 'new') && (
        <div className="flex flex-wrap items-center gap-1 mt-3" onClick={stop}>
          {!isPromoted && stageOf(idea).id !== 'new' && (
            <span className="inline-flex items-center gap-1 h-5 px-1.5 text-[11px] rounded-md border border-white/[0.08] text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: stageOf(idea).color }} />{stageOf(idea).label}
            </span>
          )}
          {isPromoted && (
            <button onClick={() => onOpenConcept?.(promotedTo)} title="Open the board card this became"
              className="inline-flex items-center gap-1 h-5 px-1.5 text-[11px] rounded-md cursor-pointer transition-colors text-accent-300 bg-accent-500/10 border border-accent-500/25 hover:bg-accent-500/15">
              <Rocket size={10} /> On board
            </button>
          )}
          {tags.map(tag => (
            <button key={tag} onClick={() => onSelectTag(tag)} title={`Filter by ${tag}`}
              className="inline-flex items-center h-5 px-1.5 text-[11px] text-slate-400 bg-white/[0.04] border border-white/[0.06] rounded-md hover:text-slate-100 hover:bg-white/[0.07] transition-colors cursor-pointer max-w-[160px] truncate">
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-3 min-h-7 text-[11.5px] text-slate-500">
        <span className="tabular-nums" title={idea.created_at ? formatDate(idea.created_at) : undefined}>{shortDate(idea.created_at)}</span>
        {linkCount > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums" title={`${linkCount} link${linkCount === 1 ? '' : 's'}`}>
            <Link2 size={11} />{linkCount}
          </span>
        )}
        {images.length > 1 && (
          <span className="inline-flex items-center gap-1 tabular-nums" title={`${images.length} images`}>
            <Images size={11} />{images.length}
          </span>
        )}

        <div onClick={stop}
          className={`ml-auto -mr-1.5 flex items-center transition-opacity duration-150 ${
            selected ? '' : 'sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'}`}>
          {canDrag && (
            <span
              className={`${actionBtn} !cursor-grab active:!cursor-grabbing hidden [@media(hover:hover)]:inline-flex`}
              title="Drag to reorder"
              onMouseEnter={() => setHoveredDragId(idea.id)}
              onMouseLeave={() => setHoveredDragId(null)}>
              <GripVertical size={12} />
            </span>
          )}
          <button onClick={() => onTogglePin(idea.id)} className={`${actionBtn} ${isPinned ? '!text-amber-400' : ''}`}
            title={isPinned ? 'Unpin' : 'Pin to top'} aria-label={isPinned ? 'Unpin' : 'Pin to top'}>
            {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
          <button
            onClick={() => (isPromoted ? onOpenConcept?.(promotedTo) : onPromote?.(idea))}
            className={`${actionBtn} ${isPromoted ? '!text-accent-300' : ''}`}
            title={isPromoted ? 'Open the board card this became' : 'Start building: turn into Board cards'}
            aria-label={isPromoted ? 'Open board card' : 'Start building'}>
            <Rocket size={12} />
          </button>
          <button onClick={() => onToggleSelect?.(idea.id)} className={`${actionBtn} ${selected ? '!text-slate-100 bg-white/[0.09]' : ''}`}
            title={selected ? 'Deselect (x)' : 'Select for bulk actions (x)'} aria-pressed={!!selected}>
            {selected ? <CheckSquare size={12} /> : <Square size={12} />}
          </button>
          <button onClick={() => onToggleArchive?.(idea.id)} className={actionBtn}
            title={archived ? 'Restore from archive' : 'Archive'} aria-label={archived ? 'Restore from archive' : 'Archive'}>
            {archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
          </button>
          <button onClick={() => onEdit(idea)} className={actionBtn} title="Edit" aria-label="Edit">
            <Pencil size={12} />
          </button>
          <button onClick={() => onDelete(idea.id)} className={`${actionBtn} hover:!text-rose-400`} title="Delete" aria-label="Delete">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </article>
  );
}
