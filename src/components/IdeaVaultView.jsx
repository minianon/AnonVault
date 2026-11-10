import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Search, Trash2, Pencil, X, AlertTriangle, Lightbulb, ExternalLink, Globe,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, GripVertical, Maximize2, Star,
  Rocket, Archive, ArchiveRestore, CheckSquare, Square, Pin, PinOff, Link2, Images,
  ImagePlus, Hash,
} from 'lucide-react';
import { useShortcutHooks } from '../utils/useShortcutHooks';
import { useArchive } from '../utils/useArchive';
import { useListNav } from '../utils/useListNav';
import BulkBar from './BulkBar';
import { PageHeader, Empty, Card, Modal, Field, Select, inputCls } from './ui';
import { uploadIdeaImage } from '../services/supabase';
import { formatDate } from '../utils/helpers';

/* ─── shared looks ─────────────────────────────────────── */
const labelCls = 'block text-[12px] font-medium text-slate-400';
const addRowCls = 'w-full h-8 inline-flex items-center justify-center gap-1.5 text-[12.5px] text-slate-400 border border-dashed border-white/[0.1] rounded-lg hover:text-slate-100 hover:border-white/[0.18] hover:bg-white/[0.02] transition-colors cursor-pointer';
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

function readOrder() {
  try {
    const saved = localStorage.getItem('anonvault_ideas_order');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error('Failed to parse ideas order:', e);
    return [];
  }
}

/* Label row for groups that hold buttons. <Field> wraps its children in a
   <label>, which would forward stray clicks to the first button inside. */
function Section({ label, meta, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={labelCls}>{label}</span>
        {meta != null && <span className="text-[11.5px] text-slate-600 tabular-nums">{meta}</span>}
      </div>
      {children}
    </div>
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

/* ─── Single link row inside the editor ────────────────── */
function LinkRow({ link, index, total, onRemove, onChange, onMoveUp, onMoveDown }) {
  const moveCls = disabled =>
    `w-6 h-[17px] inline-flex items-center justify-center rounded text-slate-500 hover:text-slate-100 hover:bg-white/[0.06] transition-colors cursor-pointer ${
      disabled ? 'opacity-25 pointer-events-none' : ''}`;
  return (
    <div className="flex items-start gap-1.5">
      <div className="flex flex-col shrink-0 pt-px">
        <button type="button" disabled={index === 0} onClick={() => onMoveUp(index)} className={moveCls(index === 0)} title="Move link up" aria-label="Move link up">
          <ChevronUp size={12} />
        </button>
        <button type="button" disabled={index === total - 1} onClick={() => onMoveDown(index)} className={moveCls(index === total - 1)} title="Move link down" aria-label="Move link down">
          <ChevronDown size={12} />
        </button>
      </div>
      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-1.5">
        <input type="url" placeholder="https://…" value={link.url} aria-label="Link URL"
          onChange={e => onChange(index, { ...link, url: e.target.value })}
          className="input-premium w-full min-w-0 h-9 px-3 rounded-lg text-[13px]" />
        <input type="text" placeholder="Label (e.g. GitHub)" value={link.label} aria-label="Link label"
          onChange={e => onChange(index, { ...link, label: e.target.value })}
          className="input-premium w-full min-w-0 h-9 px-3 rounded-lg text-[13px]" />
      </div>
      <button type="button" onClick={() => onRemove(index)} className="icon-btn !w-9 !h-9 hover:!text-rose-400 cursor-pointer shrink-0" aria-label="Remove link">
        <X size={13} />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function IdeaVaultView({
  ideas, onAdd, onUpdate, onDelete, loading, onLock, showToast, onMenuToggle, initialSelectedIdeaId, onClearInitialSelectedIdea,
  onPromoteToProject, promotedMap = {}, onOpenConcept, headerExtra
}) {
  const [searchTerm, setSearchTerm]     = useState('');
  const [selectedTag, setSelectedTag]   = useState('');
  const [isFormOpen, setIsFormOpen]     = useState(false);
  const [editingIdea, setEditingIdea]   = useState(null);

  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      const saved = localStorage.getItem('anonvault_ideas_pinned');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [formStarred, setFormStarred] = useState(false);

  const togglePin = (id) => {
    setPinnedIds(prev => {
      const updated = prev.includes(id)
        ? prev.filter(item => item !== id)
        : [...prev, id];
      localStorage.setItem('anonvault_ideas_pinned', JSON.stringify(updated));
      return updated;
    });
  };

  /* sorting and drag state */
  const [savedOrder, setSavedOrder]     = useState(readOrder);
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
  const [uploadingIndex,  setUploadingIndex]  = useState(null);
  const [uploadError,     setUploadError]     = useState('');
  const fileRef = useRef(null);

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
    setUploadingIndex(null); setUploadError('');
    setEditingIdea(null);
    setFormStarred(false);
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

  // N (and the header button) go to quick capture. The archive hides the
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
    setFormImages(ideaImages(idea));
    setFormLinks(idea.links || []);
    setUploadingIndex(null); setUploadError('');
    setIsFormOpen(true);
  };

  /* ── image handlers ── */
  const removeImageRow = (i) => setFormImages(p => p.filter((_, idx) => idx !== i));
  const changeImageRow = (i, url, caption) =>
    setFormImages(p => p.map((item, idx) => idx === i ? { ...item, url, caption: caption ?? item.caption } : item));
  const handleSetPrimary = (index) =>
    setFormImages(p => p.map((item, idx) => ({ ...item, is_primary: idx === index })));
  const hasExplicitPrimary = formImages.some(img => img.is_primary);

  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      showToast?.('warning', 'File Too Large', 'Maximum image size is 4 MB.');
      setUploadError('Max 4 MB');
      return;
    }
    setUploadingIndex(formImages.length); setUploadError('');
    try {
      const publicUrl = await uploadIdeaImage(file);
      setFormImages(p => [...p, { url: publicUrl, caption: '' }]);
      showToast?.('success', 'Image Uploaded', 'Your image is ready.');
    } catch {
      setUploadError('Upload failed — check your "idea-images" storage bucket.');
      showToast?.('error', 'Upload Failed', 'Could not upload image. Check your storage bucket.');
    } finally {
      setUploadingIndex(null);
    }
  };

  /* ── link handlers ── */
  const addLinkRow    = () => setFormLinks(p => [...p, { url: '', label: '' }]);
  const removeLinkRow = (i) => setFormLinks(p => p.filter((_, idx) => idx !== i));
  const changeLinkRow = (i, val) => setFormLinks(p => p.map((item, idx) => idx === i ? val : item));
  const moveLink = (index, direction) => {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= formLinks.length) return;
    const updated = [...formLinks];
    const temp = updated[index];
    updated[index] = updated[nextIdx];
    updated[nextIdx] = temp;
    setFormLinks(updated);
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
      localStorage.setItem('anonvault_ideas_order', JSON.stringify(newOrderIds));
      setSavedOrder(newOrderIds);
    }
    handleDragEnd();
  };

  /* ── submit ── */
  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (uploadingIndex !== null) return;
    if (!formTitle.trim()) {
      showToast?.('error', 'Title Required', 'Please give your idea a title before saving.');
      return;
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
    };

    if (editingIdea) {
      await onUpdate(editingIdea.id, payload);
      setPinnedIds(prev => {
        const isCurrentlyPinned = prev.includes(editingIdea.id);
        if (formStarred && !isCurrentlyPinned) {
          const updated = [...prev, editingIdea.id];
          localStorage.setItem('anonvault_ideas_pinned', JSON.stringify(updated));
          return updated;
        } else if (!formStarred && isCurrentlyPinned) {
          const updated = prev.filter(id => id !== editingIdea.id);
          localStorage.setItem('anonvault_ideas_pinned', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    } else {
      const added = await onAdd(payload);
      if (added && added.id && formStarred) {
        setPinnedIds(prev => {
          const updated = [...prev, added.id];
          localStorage.setItem('anonvault_ideas_pinned', JSON.stringify(updated));
          return updated;
        });
      }
    }
    setIsFormOpen(false); resetForm();
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
  const isFiltering = !!(searchTerm || selectedTag);

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
          <button onClick={focusCapture} className="btn-primary h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
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
                <button onClick={() => { setSearchTerm(''); setSelectedTag(''); }}
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

      {/* ═══ ADD / EDIT ═══ */}
      <Modal open={isFormOpen} onClose={closeForm} title={editingIdea ? 'Edit idea' : 'New idea'} width={560}
        footer={<>
          {editingIdea && (
            <button type="button" onClick={() => { const id = editingIdea.id; closeForm(); setDeleteConfirmId(id); }}
              className="btn-danger h-8 px-3 rounded-lg text-[13px] cursor-pointer mr-auto inline-flex items-center gap-1.5">
              <Trash2 size={13} /><span className="hidden sm:inline">Delete</span>
            </button>
          )}
          <button type="button" onClick={closeForm} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={uploadingIndex !== null}
            className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">
            {editingIdea ? 'Save' : 'Save idea'}
          </button>
        </>}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Title">
            <input value={formTitle} onChange={e => setFormTitle(e.target.value)}
              placeholder="e.g. AI-driven portfolio tracker" className={inputCls} />
          </Field>

          <Field label="Notes">
            <textarea value={formContent} onChange={e => setFormContent(e.target.value)} rows={4}
              placeholder="What is it, who is it for, first step…"
              className="input-premium w-full px-3 py-2 rounded-lg text-[13px] leading-relaxed resize-y min-h-[88px]" />
          </Field>

          <Section label="Tags">
            <TagEditor tags={formTags} input={tagInputVal} setInput={setTagInputVal}
              onAdd={addFormTag} onRemove={removeFormTag} suggestions={allTags} />
          </Section>

          <Section label="Links" meta={formLinks.length || null}>
            <div className="space-y-2">
              {formLinks.map((link, i) => (
                <LinkRow
                  key={i}
                  link={link}
                  index={i}
                  total={formLinks.length}
                  onRemove={removeLinkRow}
                  onChange={changeLinkRow}
                  onMoveUp={idx => moveLink(idx, -1)}
                  onMoveDown={idx => moveLink(idx, 1)}
                />
              ))}
              <button type="button" onClick={addLinkRow} className={addRowCls}>
                <Plus size={13} /> Add link
              </button>
            </div>
          </Section>

          <Section label="Images" meta={formImages.filter(i => i.url).length || null}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-start">
              {formImages.map((img, i) => {
                if (!img.url) return null;
                const isPrimary = hasExplicitPrimary ? !!img.is_primary : i === 0;
                return (
                  <div key={i} className="space-y-1.5 min-w-0">
                    <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-black/30 border border-white/[0.06]">
                      <img src={img.url} alt={img.caption || 'Idea image'} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => handleSetPrimary(i)} aria-pressed={isPrimary}
                        title={isPrimary ? 'Cover image' : 'Set as cover'}
                        className={`absolute top-1.5 left-1.5 h-6 px-1.5 rounded-md text-[11px] font-medium border inline-flex items-center gap-1 cursor-pointer transition-colors ${
                          isPrimary ? 'bg-black/70 border-amber-400/40 text-amber-300' : 'bg-black/60 border-white/10 text-slate-300 hover:text-slate-100'
                        }`}>
                        <Star size={10} className={isPrimary ? 'fill-amber-300' : ''} />
                        {isPrimary ? 'Cover' : <span className="sr-only">Set as cover</span>}
                      </button>
                      <button type="button" onClick={() => removeImageRow(i)} aria-label="Remove image"
                        className="absolute top-1.5 right-1.5 w-6 h-6 inline-flex items-center justify-center rounded-md bg-black/60 border border-white/10 text-slate-300 hover:text-rose-400 cursor-pointer transition-colors">
                        <X size={12} />
                      </button>
                    </div>
                    <input value={img.caption || ''} onChange={e => changeImageRow(i, img.url, e.target.value)}
                      placeholder="Caption" aria-label="Image caption"
                      className="input-premium w-full h-7 px-2 rounded-md text-[12px]" />
                  </div>
                );
              })}

              {uploadingIndex !== null && (
                <div className="aspect-[4/3] rounded-lg border border-white/[0.08] bg-white/[0.02] flex flex-col items-center justify-center gap-1.5 text-[12px] text-slate-400">
                  <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  Uploading…
                </div>
              )}

              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingIndex !== null}
                className="aspect-[4/3] rounded-lg border border-dashed border-white/[0.1] text-slate-400 hover:text-slate-100 hover:border-white/[0.18] hover:bg-white/[0.02] transition-colors cursor-pointer flex flex-col items-center justify-center gap-1.5 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed">
                <ImagePlus size={16} />
                Upload image
              </button>
            </div>
            <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={handleImageFile} />
            {uploadError && (
              <p className="mt-2 text-[12px] text-amber-400 flex items-center gap-1.5">
                <AlertTriangle size={12} className="shrink-0" />{uploadError}
              </p>
            )}
            <p className="mt-1.5 text-[11.5px] text-slate-600">Up to 4 MB each.</p>
          </Section>

          <button type="button" onClick={() => setFormStarred(s => !s)} aria-pressed={formStarred}
            className={`${chipCls(formStarred)} gap-1.5`}>
            {formStarred
              ? <Pin size={13} className="text-amber-400 fill-amber-400/30" />
              : <Pin size={13} className="text-slate-500" />}
            {formStarred ? 'Pinned to top' : 'Pin to top'}
          </button>

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

/* ─── Detail dialog ───────────────────────────────────── */
function IdeaDetailModal({ idea, onClose, onEdit, promotedTo, onOpenConcept }) {
  const images = ideaImages(idea);
  const links  = (idea.links || []).filter(l => l && (l.url || l.label));

  const [imgIdx, setImgIdx] = useState(() => Math.max(0, images.findIndex(img => img.is_primary)));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const current = images[imgIdx];

  // Escape closes the full-screen view first, not the dialog under it.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = e => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setIsFullscreen(false); }
      else if (e.key === 'ArrowRight' && images.length > 1) setImgIdx(i => (i + 1) % images.length);
      else if (e.key === 'ArrowLeft' && images.length > 1) setImgIdx(i => (i - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isFullscreen, images.length]);

  const navBtn = 'absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-black/60 border border-white/10 text-slate-300 hover:text-white hover:bg-black/80 flex items-center justify-center transition-colors cursor-pointer';

  return (
    <Modal open onClose={onClose} title={idea.title} width={600}
      footer={<>
        <button onClick={onClose} className="btn-ghost h-8 px-3 text-[13px] rounded-lg cursor-pointer">Close</button>
        <button onClick={() => onEdit(idea)} className="btn-primary h-8 px-4 text-[13px] rounded-lg cursor-pointer inline-flex items-center gap-1.5">
          <Pencil size={13} /> Edit
        </button>
      </>}>
      <div className="space-y-5">
        {/* meta */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-slate-500">
          {idea.created_at && <span>Captured {formatDate(idea.created_at)}</span>}
          {promotedTo && (
            <button onClick={() => { onClose(); onOpenConcept?.(promotedTo); }}
              className="inline-flex items-center gap-1 h-5 px-1.5 text-[11px] rounded-md cursor-pointer transition-colors text-accent-300 bg-accent-500/10 border border-accent-500/25 hover:bg-accent-500/15">
              <Rocket size={10} /> On the board
            </button>
          )}
        </div>

        {/* images */}
        {current && (
          <div className="space-y-2">
            <div className="relative h-56 sm:h-72 rounded-lg overflow-hidden bg-black/30 border border-white/[0.06] flex items-center justify-center group/carousel">
              <img src={current.url} alt={current.caption || idea.title} className="w-full h-full object-contain" />
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
          </div>
        )}

        {idea.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {idea.tags.map(tag => (
              <span key={tag} className="inline-flex items-center h-6 px-2 rounded-md text-[12px] text-slate-300 bg-white/[0.05] border border-white/[0.08]">{tag}</span>
            ))}
          </div>
        )}

        {idea.content && (
          <div>
            <p className={`${labelCls} mb-1.5`}>Notes</p>
            <p className="text-[13.5px] text-slate-300 whitespace-pre-line leading-relaxed break-words">{idea.content}</p>
          </div>
        )}

        {links.length > 0 && (
          <div>
            <p className={`${labelCls} mb-1.5`}>Links</p>
            <div className="space-y-1.5">
              {links.map((link, i) => (
                isValidUrl(link.url) ? (
                  <a key={i} href={link.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2.5 px-3 h-9 rounded-lg border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-colors group/link min-w-0">
                    <Globe size={13} className="text-slate-500 shrink-0" />
                    <span className="text-[13px] text-slate-300 truncate flex-1 group-hover/link:text-slate-100">
                      {link.label || new URL(link.url).hostname.replace('www.', '')}
                    </span>
                    <ExternalLink size={12} className="text-slate-600 group-hover/link:text-slate-300 shrink-0" />
                  </a>
                ) : (
                  <div key={i} className="flex items-center gap-2.5 px-3 h-9 rounded-lg border border-white/[0.04] min-w-0">
                    <Globe size={13} className="text-slate-600 shrink-0" />
                    <span className="text-[12.5px] text-slate-600 truncate">{link.label || link.url || '—'}</span>
                  </div>
                )
              ))}
            </div>
          </div>
        )}

        {!current && !idea.content && !links.length && !idea.tags?.length && (
          <p className="text-[13px] text-slate-500">No notes yet. Edit to add a description, links or images.</p>
        )}
      </div>

      {/* Portalled: the dialog surface is transformed, which would trap a
          fixed overlay inside it. */}
      {isFullscreen && current && createPortal(
        <div className="fixed inset-0 z-[120] bg-black/90 flex flex-col items-center justify-center p-4 sm:p-6"
          onClick={() => setIsFullscreen(false)}>
          <button onClick={e => { e.stopPropagation(); setIsFullscreen(false); }} aria-label="Close full screen"
            className="absolute top-4 right-4 w-9 h-9 inline-flex items-center justify-center bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-slate-200 hover:text-white transition-colors cursor-pointer">
            <X size={16} />
          </button>
          <img src={current.url} alt={current.caption || idea.title}
            className="max-w-full max-h-[82vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          {current.caption && (
            <p className="mt-4 text-center text-[13px] text-slate-300 max-w-xl leading-relaxed" onClick={e => e.stopPropagation()}>
              {current.caption}
            </p>
          )}
        </div>,
        document.body,
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

      {(isPromoted || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1 mt-3" onClick={stop}>
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
            title={isPromoted ? 'Open the board card this became' : 'Send to board'}
            aria-label={isPromoted ? 'Open board card' : 'Send to board'}>
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
