import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  Plus, Search, Tag, Trash2, Edit3, X, Calendar,
  AlertTriangle, FileImage, Link as LinkIcon,
  Lightbulb, Hash, ExternalLink, Image as ImageIcon,
  Globe, ChevronDown, ChevronUp, GripVertical, Info, Maximize2,
  ChevronLeft, ChevronRight, Star, Rocket, Archive, ArchiveRestore, CheckSquare, Square, Trash2 as TrashBulk, Check
} from 'lucide-react';
import { useShortcutHooks } from '../utils/useShortcutHooks';
import { useArchive } from '../utils/useArchive';
import { useListNav } from '../utils/useListNav';
import BulkBar from './BulkBar';
import { PageHeader, Empty } from './ui';
import { uploadIdeaImage } from '../services/supabase';
import { formatDate } from '../utils/helpers';

/* Shared chip look for tags, links and markers on cards. */
const chipCls = 'inline-flex items-center gap-1 h-5 px-1.5 text-[11px] text-slate-400 bg-white/[0.04] border border-white/[0.06] rounded-md transition-colors';
const addRowCls = 'w-full h-8 inline-flex items-center justify-center gap-1.5 text-[12.5px] text-slate-400 border border-dashed border-white/[0.1] rounded-lg hover:text-slate-100 hover:border-white/[0.18] hover:bg-white/[0.02] transition-colors cursor-pointer';
/* Card action buttons: quiet ghost squares. */
const cardBtnCls = 'w-6 h-6 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer';
const sectionLabelCls = 'text-[12px] font-medium text-slate-400 mb-2';

/* ─── tiny helpers ─────────────────────────────────────── */
function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}

/* ─── Attachment type tabs ─────────────────────────────── */
const AttachTabs = ({ active, onChange }) => (
  <div className="flex h-8 p-0.5 rounded-lg border border-white/[0.08]">
    {[
      { id: 'images', icon: <ImageIcon size={12} />, label: 'Images' },
      { id: 'links',  icon: <Globe     size={12} />, label: 'Links'  },
    ].map(({ id, icon, label }) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        className={`flex items-center gap-1.5 px-3 h-full text-[12.5px] font-medium rounded-md transition-colors cursor-pointer flex-1 justify-center ${
          active === id
            ? 'bg-white/[0.09] text-slate-100'
            : 'text-slate-500 hover:text-slate-200'
        }`}
      >
        {icon}{label}
      </button>
    ))}
  </div>
);

/* ─── Single image row inside form ────────────────────── */
function ImageRow({ img, index, onRemove, onChangeUrl, onFileUpload, uploadingIndex, uploadError, isPrimary, onSetPrimary }) {
  const fileRef = useRef(null);
  const isUploading = uploadingIndex === index;

  return (
    <div className="space-y-2 p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-lg">
      {/* preview */}
      {img.url && (
        <div className="relative rounded-md overflow-hidden h-40 bg-black/30 border border-white/[0.06] flex items-center justify-center">
          <img src={img.url} alt="preview" className="w-full h-full object-contain" />
          <button
            type="button"
            onClick={() => onSetPrimary(index)}
            className={`absolute top-2 left-2 h-7 px-2 rounded-md text-[11.5px] font-medium border transition-colors cursor-pointer inline-flex items-center gap-1 ${
              isPrimary
                ? 'bg-black/70 border-amber-400/40 text-amber-300'
                : 'bg-black/60 border-white/10 text-slate-400 hover:text-slate-100'
            }`}
            title={isPrimary ? 'Primary Cover' : 'Set as Cover'}
          >
            <Star size={11} className={isPrimary ? 'fill-amber-300' : ''} />
            {isPrimary ? 'Cover' : 'Set cover'}
          </button>
          <button type="button" onClick={() => onRemove(index)}
            className="absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center bg-black/60 border border-white/10 rounded-md text-slate-300 hover:text-rose-400 transition-colors cursor-pointer"
            aria-label="Remove image">
            <X size={12} />
          </button>
        </div>
      )}

      {/* upload button only row */}
      <div className="flex items-center gap-2">
        <input type="file" ref={fileRef} accept="image/*"
          className="hidden" onChange={e => onFileUpload(index, e)} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isUploading}
          className="btn-ghost flex-1 h-8 rounded-lg text-[12.5px] cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          {isUploading
            ? <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
            : <FileImage size={13} />}
          {isUploading ? 'Uploading…' : 'Upload image file'}
        </button>

        {/* remove row */}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="icon-btn !w-8 !h-8 border border-white/[0.08] hover:!text-rose-400 cursor-pointer shrink-0"
          aria-label="Remove image row"
        >
          <X size={13} />
        </button>
      </div>

      {/* caption */}
      <input
        type="text"
        placeholder="Caption (optional)"
        value={img.caption}
        onChange={e => {
          onChangeUrl(index, img.url, e.target.value);
        }}
        className="input-premium w-full h-8 px-3 text-[12.5px] rounded-lg"
      />

      {uploadError && uploadingIndex === index && (
        <p className="text-[11.5px] text-amber-400 flex items-center gap-1">
          <AlertTriangle size={11} />{uploadError}
        </p>
      )}
    </div>
  );
}

/* ─── Single link row inside form ─────────────────────── */
function LinkRow({ link, index, total, onRemove, onChange, onMoveUp, onMoveDown }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-white/[0.02] border border-white/[0.06] rounded-lg">
      {/* Up/Down buttons for ordering */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMoveUp(index)}
          className={`w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-100 hover:bg-white/[0.06] transition-colors cursor-pointer ${
            index === 0 ? 'opacity-25 cursor-not-allowed pointer-events-none' : ''
          }`}
          title="Move link up"
        >
          <ChevronUp size={12} />
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onMoveDown(index)}
          className={`w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-100 hover:bg-white/[0.06] transition-colors cursor-pointer ${
            index === total - 1 ? 'opacity-25 cursor-not-allowed pointer-events-none' : ''
          }`}
          title="Move link down"
        >
          <ChevronDown size={12} />
        </button>
      </div>
      <Globe size={13} className="text-slate-500 shrink-0 hidden sm:block" />
      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="url"
          placeholder="https://…"
          value={link.url}
          onChange={e => onChange(index, { ...link, url: e.target.value })}
          className="input-premium h-8 px-3 text-[12.5px] rounded-lg w-full min-w-0"
        />
        <input
          type="text"
          placeholder="Label (e.g. GitHub)"
          value={link.label}
          onChange={e => onChange(index, { ...link, label: e.target.value })}
          className="input-premium h-8 px-3 text-[12.5px] rounded-lg w-full min-w-0"
        />
      </div>
      <button type="button" onClick={() => onRemove(index)}
        className="icon-btn !w-7 !h-7 hover:!text-rose-400 cursor-pointer shrink-0"
        aria-label="Remove link">
        <X size={13} />
      </button>
    </div>
  );
}

/* ─── Premium Custom Dropdown ─────────────────────────── */
function CustomDropdown({ value, onChange, options, icon, placeholder, align = 'left' }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeOption = options.find(o => o.value === value) || { label: placeholder || value };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-8 pl-8 pr-2.5 text-[13px] rounded-lg cursor-pointer flex items-center gap-1.5 justify-between relative border transition-colors max-w-[200px] ${
          isOpen
            ? 'border-white/[0.14] bg-white/[0.05] text-slate-100'
            : 'border-white/[0.08] text-slate-300 hover:bg-white/[0.04] hover:text-slate-100'
        }`}
      >
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 flex">
          {icon}
        </span>
        <span className="truncate">{activeOption.label}</span>
        <ChevronDown
          size={13}
          className={`text-slate-500 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className={`absolute top-full ${align === 'right' ? 'right-0' : 'left-0'} mt-1 min-w-[180px] max-w-[calc(100vw-32px)] max-h-72 overflow-y-auto bg-[color:var(--surface-2)] border border-white/[0.08] rounded-lg shadow-lg p-1 z-50`}>
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left h-8 px-2.5 rounded-md text-[13px] transition-colors flex items-center justify-between gap-3 hover:bg-white/[0.05] cursor-pointer ${
                value === opt.value
                  ? 'text-slate-100'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {value === opt.value && <Check size={13} className="text-slate-300 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function IdeaVaultView({
  ideas, onAdd, onUpdate, onDelete, loading, theme, onLock, showToast, onMenuToggle, initialSelectedIdeaId, onClearInitialSelectedIdea,
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
  /* sorting and drag state */
  const [orderedIdeas, setOrderedIdeas] = useState([]);
  const [sortBy, setSortBy]             = useState(() => localStorage.getItem('anonvault_ideas_sortby') || 'custom'); // 'custom', 'newest', 'oldest'
  const [draggedId, setDraggedId]       = useState(null);
  const [draggedOverId, setDraggedOverId] = useState(null);
  const [hoveredDragId, setHoveredDragId] = useState(null);

  /* form fields */
  const [formTitle,       setFormTitle]       = useState('');
  const [formContent,     setFormContent]     = useState('');
  const [formTags,        setFormTags]        = useState([]);   // Array of strings
  const [tagInputVal,     setTagInputVal]     = useState('');   // Active typed tag
  const [formImages,      setFormImages]      = useState([]);   // [{url, caption}]
  const [formLinks,       setFormLinks]       = useState([]);   // [{url, label}]
  const [attachTab,       setAttachTab]       = useState('images');

  /* upload state */
  const [uploadingIndex,  setUploadingIndex]  = useState(null);
  const [uploadError,     setUploadError]     = useState('');

  /* modals */
  const [deleteConfirmId,    setDeleteConfirmId]    = useState(null);
  const [selectedIdea,       setSelectedIdea]       = useState(null);

  /* Persist sorting selection */
  useEffect(() => {
    localStorage.setItem('anonvault_ideas_sortby', sortBy);
  }, [sortBy]);

  /* Sync database ideas with custom local order */
  useEffect(() => {
    if (!ideas) return;
    
    let savedOrder = [];
    try {
      const saved = localStorage.getItem('anonvault_ideas_order');
      if (saved) savedOrder = JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse ideas order:', e);
    }

    const orderMap = new Map();
    savedOrder.forEach((id, idx) => orderMap.set(String(id), idx));

    const sorted = [...ideas].sort((a, b) => {
      const orderA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : -1;
      const orderB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : -1;

      // Put new ideas at the top
      if (orderA === -1 && orderB === -1) {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      if (orderA === -1) return -1;
      if (orderB === -1) return 1;
      return orderA - orderB;
    });

    setOrderedIdeas(sorted);
  }, [ideas]);

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
    setEditingIdea(null); setAttachTab('images');
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

  const handleOpenAdd = () => { resetForm(); setIsFormOpen(true); };

  const rootRef = useRef(null);
  const searchRef = useRef(null);
  useShortcutHooks({ onNew: handleOpenAdd, searchRef, rootRef });

  const handleOpenEdit = (idea) => {
    setEditingIdea(idea);
    setFormTitle(idea.title);
    setFormContent(idea.content || '');
    setFormTags(idea.tags || []);
    setTagInputVal('');
    setFormStarred(pinnedIds.includes(idea.id));

    // normalise legacy single image_url → images array
    const imgs = idea.images && idea.images.length > 0
      ? idea.images
      : idea.image_url
        ? [{ url: idea.image_url, caption: '' }]
        : [];
    setFormImages(imgs);
    setFormLinks(idea.links || []);
    setIsFormOpen(true);
  };

  /* ── image handlers ── */
  const addImageRow    = () => setFormImages(p => [...p, { url: '', caption: '' }]);
  const removeImageRow = (i) => setFormImages(p => p.filter((_, idx) => idx !== i));
  const changeImageRow = (i, url, caption) =>
    setFormImages(p => p.map((item, idx) => idx === i ? { ...item, url, caption: caption ?? item.caption } : item));
  const handleSetPrimary = (index) =>
    setFormImages(p => p.map((item, idx) => ({ ...item, is_primary: idx === index })));

  const handleFileUpload = async (index, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      showToast?.('warning', 'File Too Large', 'Maximum image size is 4 MB.');
      setUploadError('Max 4 MB');
      return;
    }
    setUploadingIndex(index); setUploadError('');
    try {
      const publicUrl = await uploadIdeaImage(file);
      changeImageRow(index, publicUrl, formImages[index]?.caption || '');
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
    const cleaned = tagText
      .trim()
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]/g, '');
    if (cleaned && !formTags.includes(cleaned)) {
      setFormTags(prev => [...prev, cleaned]);
    }
    setTagInputVal('');
  };

  const removeFormTag = (tagToRemove) => {
    setFormTags(prev => prev.filter(t => t !== tagToRemove));
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (tagInputVal.trim()) {
        addFormTag(tagInputVal);
      }
    } else if (e.key === 'Backspace' && !tagInputVal && formTags.length > 0) {
      setFormTags(prev => prev.slice(0, -1));
    }
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
      setOrderedIdeas(newOrderedIdeas);
    }
    handleDragEnd();
  };

  /* ── submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast?.('error', 'Title Required', 'Please give your idea a title before saving.');
      return;
    }

    let finalTags = [...formTags];
    if (tagInputVal.trim()) {
      const cleaned = tagInputVal.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      if (cleaned && !finalTags.includes(cleaned)) {
        finalTags.push(cleaned);
      }
    }

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
  const allTags = Array.from(new Set((ideas || []).flatMap(i => (i && i.tags) || [])));

  const tagOptions = [
    { value: '', label: 'All Tags' },
    ...allTags.map(tag => ({ value: tag, label: `#${tag}` }))
  ];

  const sortOptions = [
    { value: 'custom', label: 'Custom (Drag & Drop)' },
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' }
  ];

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
  const pinnedIdeasList = processedIdeas.filter(i => pinnedIds.includes(i.id));
  const regularIdeasList = processedIdeas.filter(i => !pinnedIds.includes(i.id));
  // Display order, not data order — j/k must follow what is on screen.
  const navIds = [...pinnedIdeasList, ...regularIdeasList].map(i => i.id);

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
  const pinnedIdeas = pinnedIdeasList;
  const regularIdeas = regularIdeasList;

  /* FLIP layout transition animation */
  const prevRectsRef = useRef({});

  useLayoutEffect(() => {
    const elements = document.querySelectorAll('[data-flip-id]');
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
  }, [processedIdeas.map(i => i.id).join(',')]);

  /* ── render ── */
  return (
    <div ref={rootRef} className="flex-1 h-full flex flex-col overflow-hidden relative">
      <PageHeader
        title="Ideas"
        subtitle={`${(ideas||[]).length} ideas captured`}
        onMenuToggle={onMenuToggle}
        onLock={onLock}
        headerChildren={headerExtra}
        actions={
          <button onClick={handleOpenAdd} className="btn-primary h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
            <Plus size={14} />
            <span className="hidden sm:inline">New idea</span>
            <span className="sm:hidden">New</span>
          </button>
        }
      />

      {/* Toolbar */}
      <div className="px-4 lg:px-6 py-2.5 border-b border-white/[0.06] flex flex-wrap gap-2 items-center justify-between shrink-0 relative z-10">
        <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-xs min-w-0">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            ref={searchRef}
            placeholder="Search ideas…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input-premium w-full h-8 pl-8 pr-3 text-[13px] rounded-lg"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {selectedTag && (
            <span className="inline-flex items-center gap-1 h-8 pl-2.5 pr-1 text-[13px] text-slate-200 bg-white/[0.05] border border-white/[0.08] rounded-lg shrink-0 max-w-full">
              <Hash size={12} className="text-slate-500 shrink-0" />
              <span className="truncate">{selectedTag}</span>
              <button onClick={() => setSelectedTag('')}
                className="w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-100 hover:bg-white/[0.08] cursor-pointer shrink-0"
                title="Clear filter">
                <X size={12} />
              </button>
            </span>
          )}

          <button
            onClick={() => setShowArchived(v => !v)}
            title={showArchived ? 'Back to active' : 'Show archived'}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 text-[13px] rounded-lg border transition-colors cursor-pointer ${
              showArchived
                ? 'bg-white/[0.08] border-white/[0.14] text-slate-100'
                : 'border-white/[0.08] text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
            }`}>
            <Archive size={13} className={showArchived ? 'text-slate-300' : 'text-slate-500'} />
            {showArchived ? 'Archived' : 'Archive'}
          </button>

          <CustomDropdown
            value={selectedTag}
            onChange={setSelectedTag}
            options={tagOptions}
            icon={<Tag size={13} />}
            placeholder="All Tags"
          />

          <CustomDropdown
            value={sortBy}
            onChange={setSortBy}
            options={sortOptions}
            icon={<Calendar size={13} />}
            placeholder="Custom"
            align="right"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 lg:px-6 py-6 reveal-stagger">
        {loading ? (
          <div className="h-48 flex items-center justify-center gap-2.5 text-slate-500 text-[13px]">
            <span className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : processedIdeas.length === 0 ? (
          /* An empty archive is not an empty vault, and must not offer to
             create something into a bucket you cannot create into. */
          <div className="py-10">
            <Empty
              icon={showArchived ? Archive : Lightbulb}
              title={showArchived ? 'Nothing archived' : 'No ideas yet'}
              body={showArchived
                ? 'Nothing here yet. Ideas land in the archive when you archive them, or when you promote one to Project Ideas.'
                : searchTerm || selectedTag ? 'Try adjusting your search or tags.' : 'Capture your first creative thought.'}
              action={showArchived ? (
                <button onClick={() => setShowArchived(false)}
                  className="btn-primary h-8 px-3 text-[13px] rounded-lg cursor-pointer">
                  Back to active ideas
                </button>
              ) : !searchTerm && !selectedTag ? (
                <button onClick={handleOpenAdd} className="btn-primary h-8 px-3 text-[13px] rounded-lg cursor-pointer">
                  Capture idea
                </button>
              ) : null}
            />
          </div>
        ) : (
          <>
        {/* Being inside the archive has to be unmistakable — otherwise an
            empty archive reads as an empty section. */}
        {showArchived && (
          <div className="panel flex items-center gap-2.5 mb-5 px-3.5 py-2.5">
            <Archive size={14} className="text-slate-500 shrink-0" />
            <p className="text-[13px] text-slate-200 flex-1 min-w-0">
              Viewing archive
              <span className="text-slate-500">
                {' '}&middot; {archivedIds.length} idea archived
              </span>
            </p>
            <button
              onClick={() => setShowArchived(false)}
              className="btn-ghost shrink-0 h-7 px-2.5 text-[12.5px] rounded-md cursor-pointer">
              Back to active
            </button>
          </div>
        )}

          <div>
            {/* Pinned Section */}
            {pinnedIdeas.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Star size={13} className="text-slate-500" />
                  <h3 className="text-[13px] font-medium text-slate-200">Pinned</h3>
                  <span className="text-[12px] text-slate-500 tabular-nums">{pinnedIdeas.length}</span>
                </div>
                <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
                  {pinnedIdeas.map(idea => (
                    <div key={idea.id} data-nav-id={idea.id} className="break-inside-avoid mb-4">
                      <IdeaCard
                        idea={idea}
                        sortBy={sortBy}
                        onEdit={handleOpenEdit}
                        onDelete={id => setDeleteConfirmId(id)}
                        onSelectTag={setSelectedTag}
                        onViewDetails={setSelectedIdea}
                        isFilteringOrSearching={true}
                        setHoveredDragId={setHoveredDragId}
                        isPinned={true}
                        onTogglePin={togglePin}
                        onPromote={handlePromote}
                        promotedTo={promotedMap[idea.id]}
                        onOpenConcept={onOpenConcept}
                        onToggleArchive={toggleArchived}
                        archived={isArchived(idea.id)}
                        selected={nav.isSelected(idea.id)}
                        onToggleSelect={nav.toggleSelect}
                        focused={nav.cursorId === idea.id}
                      />
                    </div>
                  ))}
                </div>
                {regularIdeas.length > 0 && <div className="h-px bg-white/[0.06] my-6" />}
              </div>
            )}

            {/* Main Section */}
            {regularIdeas.length > 0 && (
              <>
                {pinnedIdeas.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb size={13} className="text-slate-500" />
                    <h3 className="text-[13px] font-medium text-slate-200">Other ideas</h3>
                    <span className="text-[12px] text-slate-500 tabular-nums">{regularIdeas.length}</span>
                  </div>
                )}
                <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
                  {regularIdeas.map(idea => (
                    <div
                      key={idea.id}
                      data-flip-id={idea.id}
                      data-nav-id={idea.id}
                      draggable={sortBy === 'custom' && hoveredDragId === idea.id && !searchTerm && !selectedTag}
                      onDragStart={e => handleDragStart(e, idea.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={e => handleDragOver(e, idea.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, idea.id)}
                      className={`break-inside-avoid mb-4 rounded-xl transition-opacity duration-200 ${
                        draggedId === idea.id ? 'opacity-40' : ''
                      } ${
                        draggedOverId === idea.id ? 'ring-1 ring-white/25 ring-offset-2 ring-offset-[color:var(--bg)]' : ''
                      }`}
                    >
                      <IdeaCard
                        idea={idea}
                        sortBy={sortBy}
                        onEdit={handleOpenEdit}
                        onDelete={id => setDeleteConfirmId(id)}
                        onSelectTag={setSelectedTag}
                        onViewDetails={setSelectedIdea}
                        isFilteringOrSearching={!!(searchTerm || selectedTag)}
                        setHoveredDragId={setHoveredDragId}
                        isPinned={false}
                        onTogglePin={togglePin}
                        onPromote={handlePromote}
                        promotedTo={promotedMap[idea.id]}
                        onOpenConcept={onOpenConcept}
                        onToggleArchive={toggleArchived}
                        archived={isArchived(idea.id)}
                        selected={nav.isSelected(idea.id)}
                        onToggleSelect={nav.toggleSelect}
                        focused={nav.cursorId === idea.id}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          </>
        )}
      </div>

      <BulkBar
        count={nav.selectedIds.length}
        noun="idea"
        onClear={nav.clearSelection}
        actions={[
          { label: showArchived ? 'Restore' : 'Archive', icon: showArchived ? ArchiveRestore : Archive, onClick: bulkArchive },
          { label: 'Delete', icon: TrashBulk, danger: true, onClick: bulkDelete },
        ]}
      />

      {/* ═══ ADD / EDIT MODAL ═══ */}
      {isFormOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-[6vh] sm:pt-4" onClick={() => setIsFormOpen(false)}>
          <div className="modal-surface w-full max-w-xl max-h-[88vh] rounded-xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* modal header */}
            <div className="px-5 h-12 border-b border-white/[0.06] flex items-center justify-between gap-3 shrink-0">
              <h2 className="text-[14px] font-semibold text-slate-100 truncate">{editingIdea ? 'Edit idea' : 'New idea'}</h2>
              <div className="flex items-center gap-0.5 -mr-2">
                <button
                  type="button"
                  onClick={() => setFormStarred(s => !s)}
                  className={`icon-btn cursor-pointer ${formStarred ? '!text-amber-400' : ''}`}
                  title={formStarred ? 'Featured (Starred)' : 'Mark as Featured'}
                  aria-pressed={formStarred}
                >
                  <Star size={14} className={formStarred ? 'fill-amber-400' : ''} />
                </button>
                <button onClick={() => setIsFormOpen(false)} className="icon-btn cursor-pointer" aria-label="Close"><X size={15} /></button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
             <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Title */}
              <FormField label="Title" required>
                <input type="text" required placeholder="e.g. AI-driven portfolio tracker"
                  value={formTitle} onChange={e => setFormTitle(e.target.value)}
                  className="input-premium w-full h-9 px-3 text-[13px] rounded-lg" />
              </FormField>

              {/* Description */}
              <FormField label="Description">
                <textarea rows={4} placeholder="Elaborate on your idea…"
                  value={formContent} onChange={e => setFormContent(e.target.value)}
                  className="input-premium w-full px-3 py-2 text-[13px] rounded-lg resize-none leading-relaxed" />
              </FormField>

              {/* Images Section */}
              <FormField label="Images">
                <div className="space-y-2">
                  {formImages.map((img, i) => (
                    <ImageRow
                      key={i}
                      img={img}
                      index={i}
                      onRemove={removeImageRow}
                      onChangeUrl={changeImageRow}
                      onFileUpload={handleFileUpload}
                      uploadingIndex={uploadingIndex}
                      uploadError={uploadError}
                      isPrimary={img.is_primary ?? (i === 0)}
                      onSetPrimary={handleSetPrimary}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={addImageRow}
                    className={addRowCls}
                  >
                    <Plus size={13} /> Add image
                  </button>
                </div>
              </FormField>

              {/* Links Section */}
              <FormField label="Links">
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
                  <button
                    type="button"
                    onClick={addLinkRow}
                    className={addRowCls}
                  >
                    <Plus size={13} /> Add link
                  </button>
                </div>
              </FormField>

              {/* Enter-to-Tag interactive chip input */}
              <FormField label="Tags">
                <div className="input-premium w-full px-2 py-1 min-h-9 text-[13px] rounded-lg flex flex-wrap gap-1.5 items-center focus-within:border-[color:var(--accent-line)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
                  {formTags.map((tag, idx) => (
                    <span key={idx} className={`${chipCls} !text-slate-300 pr-0.5`}
                          onClick={e => e.stopPropagation()}
                          onDragStart={e => e.stopPropagation()}>
                      #{tag}
                      <button
                        type="button"
                        onClick={() => removeFormTag(tag)}
                        className="w-4 h-4 inline-flex items-center justify-center rounded text-slate-500 hover:text-slate-100 hover:bg-white/10 cursor-pointer"
                        aria-label={`Remove tag ${tag}`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  <div className="flex-1 min-w-[120px] flex items-center gap-1.5 pl-1">
                    <Tag size={12} className="text-slate-500 shrink-0" />
                    <input
                      type="text"
                      placeholder={formTags.length === 0 ? "Type tag & press Enter…" : "Add tag…"}
                      value={tagInputVal}
                      onChange={e => setTagInputVal(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      className="bg-transparent border-none outline-none focus:outline-none w-full h-7 text-[13px] text-slate-200 placeholder:text-slate-600"
                    />
                  </div>
                </div>
              </FormField>
             </div>

              {/* actions */}
              <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end gap-2 bg-white/[0.015] shrink-0">
                <button type="button" onClick={() => setIsFormOpen(false)}
                  className="btn-ghost h-8 px-3 text-[13px] rounded-lg cursor-pointer">Cancel</button>
                <button type="submit" disabled={uploadingIndex !== null}
                  className="btn-primary h-8 px-4 text-[13px] rounded-lg cursor-pointer">
                  {editingIdea ? 'Save changes' : 'Capture idea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ DELETE CONFIRM ═══ */}
      {deleteConfirmId && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-surface w-full max-w-sm rounded-xl overflow-hidden" role="dialog" aria-modal="true" aria-label="Delete idea">
            <div className="px-5 h-12 border-b border-white/[0.06] flex items-center gap-2">
              <Trash2 size={14} className="text-rose-400" />
              <h2 className="text-[14px] font-semibold text-slate-100">Delete idea</h2>
            </div>
            <p className="p-5 text-[13px] text-slate-400 leading-relaxed">
              Are you sure you want to delete this idea? This cannot be undone.
            </p>
            <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end gap-2 bg-white/[0.015]">
              <button onClick={() => setDeleteConfirmId(null)}
                className="btn-ghost h-8 px-3 text-[13px] rounded-lg cursor-pointer">Keep it</button>
              <button onClick={async () => { await onDelete(deleteConfirmId); setDeleteConfirmId(null); }}
                className="btn-danger h-8 px-3 text-[13px] rounded-lg cursor-pointer">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DETAILS MODAL ═══ */}
      {selectedIdea && (
        <IdeaDetailModal
          idea={selectedIdea}
          onClose={() => setSelectedIdea(null)}
          onEdit={(idea) => { handleOpenEdit(idea); setSelectedIdea(null); }}
        />
      )}
    </div>
  );
}

/* ─── Form Field wrapper ──────────────────────────────── */
function FormField({ label, required, children }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-slate-400 mb-1.5">
        {label}{required && <span className="text-slate-600 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ─── Detail Modal ────────────────────────────────────── */
function IdeaDetailModal({ idea, onClose, onEdit }) {
  const images = idea.images?.length > 0
    ? idea.images
    : idea.image_url ? [{ url: idea.image_url, caption: '' }] : [];
  const links  = idea.links || [];

  const [imgIdx, setImgIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  };

  return (
    <div className={`modal-overlay fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-[6vh] sm:pt-4 ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`modal-surface w-full max-w-lg rounded-xl overflow-hidden flex flex-col max-h-[88vh] ${isClosing ? 'closing' : ''}`}
           role="dialog" aria-modal="true" aria-label={idea.title}
           onClick={e => e.stopPropagation()}>

        {/* header */}
        <div className="px-5 min-h-12 py-2.5 border-b border-white/[0.06] flex items-center justify-between gap-3 shrink-0">
          <h2 className="text-[14px] font-semibold text-slate-100 leading-snug break-words min-w-0">{idea.title}</h2>
          <button onClick={handleClose} className="icon-btn -mr-2 shrink-0 cursor-pointer" aria-label="Close"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* image carousel */}
          {images.length > 0 && (
            <div className="relative bg-black/30 h-56 sm:h-64 border-b border-white/[0.06] flex items-center justify-center group/carousel">
              <img src={images[imgIdx].url} alt={images[imgIdx].caption || idea.title}
                className="w-full h-full object-contain" />

              {/* fullscreen toggle button */}
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="absolute top-3 right-3 w-8 h-8 inline-flex items-center justify-center bg-black/60 border border-white/10 rounded-lg text-slate-300 hover:text-white hover:bg-black/80 transition-[opacity,color,background-color] cursor-pointer [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/carousel:opacity-100 focus-visible:opacity-100"
                title="Open full screen"
              >
                <Maximize2 size={13} />
              </button>

              {/* prev / next */}
              {images.length > 1 && (
                <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
                  {images.map((_, i) => (
                    <button key={i} type="button" onClick={() => setImgIdx(i)}
                      aria-label={`Show image ${i + 1}`}
                      className={`w-1.5 h-1.5 rounded-full transition-colors cursor-pointer ${i === imgIdx ? 'bg-white' : 'bg-white/35 hover:bg-white/60'}`} />
                  ))}
                </div>
              )}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-black/60 border border-white/10 text-slate-300 hover:text-white hover:bg-black/80 flex items-center justify-center transition-colors cursor-pointer"
                    title="Previous image"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setImgIdx(i => (i + 1) % images.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-black/60 border border-white/10 text-slate-300 hover:text-white hover:bg-black/80 flex items-center justify-center transition-colors cursor-pointer"
                    title="Next image"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>
          )}

          {/* dedicated image caption bar */}
          {images.length > 0 && images[imgIdx].caption && (
            <div className="border-b border-white/[0.06] px-5 py-2.5 flex items-start gap-2 text-[12.5px] text-slate-400">
              <span className="text-slate-500 shrink-0">Caption</span>
              <span className="leading-relaxed">{images[imgIdx].caption}</span>
            </div>
          )}

          {/* body */}
          <div className="p-5 space-y-5">
            {idea.tags && idea.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {idea.tags.map(tag => <span key={tag} className={chipCls}>#{tag}</span>)}
              </div>
            )}

            {/* description */}
            {idea.content && (
              <div>
                <p className={sectionLabelCls}>Notes</p>
                <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3.5 text-[13px] text-slate-300 whitespace-pre-line leading-relaxed break-words">
                  {idea.content}
                </div>
              </div>
            )}

            {/* links */}
            {links.length > 0 && (
              <div>
                <p className={sectionLabelCls}>Links</p>
                <div className="space-y-1.5">
                  {links.map((link, i) => (
                    isValidUrl(link.url) ? (
                      <a key={i} href={link.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2.5 px-3 h-9 rounded-lg border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-colors group/link">
                        <Globe size={13} className="text-slate-500 shrink-0" />
                        <span className="text-[13px] text-slate-300 truncate flex-1 group-hover/link:text-slate-100">
                          {link.label || link.url}
                        </span>
                        <ExternalLink size={12} className="text-slate-600 group-hover/link:text-slate-300 shrink-0" />
                      </a>
                    ) : (
                      <div key={i} className="flex items-center gap-2.5 px-3 h-9 rounded-lg border border-white/[0.04]">
                        <Globe size={13} className="text-slate-600 shrink-0" />
                        <span className="text-[12.5px] text-slate-600 truncate">{link.label || link.url || '—'}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* images grid (thumbnails) */}
            {images.length > 1 && (
              <div>
                <p className={sectionLabelCls}>
                  Images <span className="text-slate-600 tabular-nums">{images.length}</span>
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {images.map((img, i) => (
                    <button key={i} type="button" onClick={e => { e.stopPropagation(); setImgIdx(i); setIsFullscreen(true); }}
                      className={`rounded-md overflow-hidden aspect-square border cursor-pointer transition-opacity ${i === imgIdx ? 'border-slate-300' : 'border-white/[0.06] opacity-60 hover:opacity-100'}`}>
                      <img src={img.url} alt={img.caption || `Image ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end gap-2 bg-white/[0.015] shrink-0">
          <button onClick={handleClose} className="btn-ghost h-8 px-3 text-[13px] rounded-lg cursor-pointer">Close</button>
          <button onClick={() => onEdit(idea)} className="btn-primary h-8 px-4 text-[13px] rounded-lg cursor-pointer inline-flex items-center gap-1.5">
            <Edit3 size={13} /> Edit
          </button>
        </div>
      </div>

      {/* Fullscreen Overlay */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 sm:p-6"
          onClick={e => { e.stopPropagation(); setIsFullscreen(false); }}
        >
          <button
            onClick={e => { e.stopPropagation(); setIsFullscreen(false); }}
            className="absolute top-4 right-4 w-9 h-9 inline-flex items-center justify-center bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-slate-200 hover:text-white transition-colors cursor-pointer z-[101]"
            aria-label="Close full screen"
          >
            <X size={16} />
          </button>
          <img
            src={images[imgIdx].url}
            alt="Fullscreen"
            className="max-w-full max-h-[82vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          {images[imgIdx].caption && (
            <p
              className="mt-4 text-center text-[13px] text-slate-300 max-w-xl leading-relaxed"
              onClick={e => e.stopPropagation()}
            >
              {images[imgIdx].caption}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Idea Card ───────────────────────────────────────── */
function IdeaCard({ idea, sortBy, onEdit, onDelete, onSelectTag, onViewDetails, isFilteringOrSearching, setHoveredDragId, isPinned, onTogglePin, onPromote, promotedTo, onOpenConcept, onToggleArchive, archived, selected, onToggleSelect, focused }) {
  // Without this the funnel leaks: a promoted idea looked identical to an
  // unpromoted one, so the same idea would get promoted twice.
  const isPromoted = !!promotedTo;
  const images = idea.images?.length > 0
    ? idea.images
    : idea.image_url ? [{ url: idea.image_url, caption: '' }] : [];
  const links  = idea.links || [];

  const showDragHandle = sortBy === 'custom' && !isFilteringOrSearching;
  const primaryImage = images.find(img => img.is_primary) || images[0];

  // Actions stay visible on touch screens (no hover there) and while the
  // card is selected; on pointer devices they appear on hover.
  const actionsVisibility = selected
    ? ''
    : '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100';

  return (
    <article
      onClick={() => onViewDetails && onViewDetails(idea)}
      style={focused ? { outline: '1px solid var(--accent-line)', outlineOffset: 2 } : undefined}
      className={`glass-card rounded-xl !overflow-visible cursor-pointer select-none group ${
        selected ? '!border-[color:var(--accent-line)]' : ''
      }`}
    >
      {/* hero image */}
      {primaryImage?.url && (
        <div className="relative h-36 overflow-hidden rounded-t-xl bg-black/20 flex items-center justify-center border-b border-white/[0.05]">
          <img src={primaryImage.url} alt={idea.title}
            className="w-full h-full object-contain" loading="lazy" />
        </div>
      )}

      <div className="p-3.5 space-y-2">
        {/* title + drag handle */}
        <div className="flex items-start gap-1.5 min-w-0">
          {showDragHandle && (
            <div
              className="text-slate-600 hover:text-slate-300 cursor-grab active:cursor-grabbing p-0.5 shrink-0 -ml-1 select-none transition-colors"
              title="Drag to reorder card"
              onClick={e => e.stopPropagation()}
              onDragStart={e => e.stopPropagation()}
              onMouseEnter={() => setHoveredDragId(idea.id)}
              onMouseLeave={() => setHoveredDragId(null)}
            >
              <GripVertical size={13} className="mt-px" />
            </div>
          )}
          <h4 className="text-[13.5px] font-medium text-slate-100 leading-snug break-words flex-1 min-w-0 line-clamp-2">
            {idea.title}
          </h4>
          {isPinned && <Star size={12} className="fill-amber-400 text-amber-400 shrink-0 mt-[3px]" aria-label="Pinned" />}
        </div>

        {idea.content && (
          <p className="text-[12.5px] text-slate-400 leading-relaxed line-clamp-3 break-words">{idea.content}</p>
        )}

        {/* links preview strip */}
        {links.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap"
               onClick={e => e.stopPropagation()}
               onDragStart={e => e.stopPropagation()}>
            {links.map((link, i) => (
              isValidUrl(link.url) ? (
                <a key={i} href={link.url} target="_blank" rel="noreferrer"
                  className={`${chipCls} max-w-full hover:text-slate-100 hover:bg-white/[0.07] cursor-pointer`}>
                  <Globe size={10} className="shrink-0 text-slate-500" />
                  <span className="truncate max-w-[160px]">{link.label || new URL(link.url).hostname.replace('www.','')}</span>
                  <ExternalLink size={9} className="shrink-0 text-slate-600" />
                </a>
              ) : null
            ))}
          </div>
        )}

        {/* promoted marker + tags + actions */}
        <div className="flex flex-wrap items-center gap-1 pt-0.5"
             onClick={e => e.stopPropagation()}
             onDragStart={e => e.stopPropagation()}>
          {isPromoted && (
            <button
              onClick={() => onOpenConcept && onOpenConcept(promotedTo)}
              title="Open the concept this became"
              className="inline-flex items-center gap-1 h-5 px-1.5 text-[11px] rounded-md cursor-pointer transition-colors
                text-accent-300 bg-accent-500/10 border border-accent-500/25 hover:bg-accent-500/15">
              <Rocket size={10} />
              Promoted
            </button>
          )}
          {(idea.tags || []).map(tag => (
            <button key={tag} onClick={() => onSelectTag(tag)}
              className={`${chipCls} hover:text-slate-100 hover:bg-white/[0.07] cursor-pointer`}>#{tag}</button>
          ))}

          {/* actions */}
          <div className={`ml-auto flex items-center gap-px shrink-0 select-none transition-opacity duration-150 ${actionsVisibility}`}>
            <button onClick={() => onTogglePin(idea.id)}
              className={`${cardBtnCls} ${isPinned ? 'text-amber-400 hover:bg-white/[0.06]' : 'text-slate-500 hover:text-slate-100 hover:bg-white/[0.06]'}`}
              title={isPinned ? "Unpin idea" : "Pin idea"}>
              <Star size={12} className={isPinned ? 'fill-amber-400' : ''} />
            </button>

            {/* info tooltip */}
            <div className="relative group/info select-none">
              <button
                type="button"
                className={`${cardBtnCls} text-slate-500 hover:text-slate-100 hover:bg-white/[0.06]`}
                aria-label="Details"
              >
                <Info size={12} />
              </button>
              <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover/info:block bg-[color:var(--surface-3)] border border-white/[0.08] text-[11.5px] text-slate-300 px-2 py-1 rounded-md shadow-lg whitespace-nowrap z-50 pointer-events-none w-max">
                Logged {formatDate(idea.created_at || new Date())}
              </div>
            </div>

            <button
              onClick={() => isPromoted
                ? (onOpenConcept && onOpenConcept(promotedTo))
                : (onPromote && onPromote(idea))}
              className={`${cardBtnCls} ${
                isPromoted
                  ? 'text-accent-300 hover:bg-white/[0.06]'
                  : 'text-slate-500 hover:text-slate-100 hover:bg-white/[0.06]'
              }`}
              title={isPromoted ? 'Open the concept this became' : 'Promote to a project concept'}>
              <Rocket size={12} />
            </button>

            <button onClick={() => onEdit(idea)}
              className={`${cardBtnCls} text-slate-500 hover:text-slate-100 hover:bg-white/[0.06]`}
              title="Edit idea">
              <Edit3 size={12} />
            </button>

            <button onClick={() => onToggleSelect && onToggleSelect(idea.id)}
              className={`${cardBtnCls} ${
                selected
                  ? 'text-slate-100 bg-white/[0.09]'
                  : 'text-slate-500 hover:text-slate-100 hover:bg-white/[0.06]'
              }`}
              title={selected ? 'Deselect (x)' : 'Select for bulk actions (x)'}>
              {selected ? <CheckSquare size={12} /> : <Square size={12} />}
            </button>

            <button onClick={() => onToggleArchive && onToggleArchive(idea.id)}
              className={`${cardBtnCls} text-slate-500 hover:text-slate-100 hover:bg-white/[0.06]`}
              title={archived ? 'Restore from archive' : 'Archive this idea'}>
              {archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            </button>

            <button onClick={() => onDelete(idea.id)}
              className={`${cardBtnCls} text-slate-500 hover:text-rose-400 hover:bg-rose-500/[0.08]`}
              title="Delete idea">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
