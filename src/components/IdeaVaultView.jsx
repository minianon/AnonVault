import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  Plus, Search, Tag, Trash2, Edit3, X, Calendar,
  AlertTriangle, FileImage, Link as LinkIcon,
  Lightbulb, Lock, Hash, ExternalLink, Image as ImageIcon,
  Globe, ChevronDown, ChevronUp, GripVertical, Info, Maximize2,
  ChevronLeft, ChevronRight, Menu, Star, Rocket
} from 'lucide-react';
import { useShortcutHooks } from '../utils/useShortcutHooks';
import { uploadIdeaImage } from '../services/supabase';
import { formatDate } from '../utils/helpers';

/* ─── tiny helpers ─────────────────────────────────────── */
function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}

/* ─── Attachment type tabs ─────────────────────────────── */
const AttachTabs = ({ active, onChange }) => (
  <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06]">
    {[
      { id: 'images', icon: <ImageIcon size={12} />, label: 'Images' },
      { id: 'links',  icon: <Globe     size={12} />, label: 'Links'  },
    ].map(({ id, icon, label }) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-all cursor-pointer flex-1 justify-center ${
          active === id
            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/25'
            : 'text-slate-500 hover:text-slate-300'
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
    <div className="space-y-2 p-3 bg-white/[0.025] border border-white/[0.06] rounded-xl group/imgrow">
      {/* preview */}
      {img.url && (
        <div className="relative rounded-lg overflow-hidden h-48 bg-black/40 border border-white/[0.06] flex items-center justify-center">
          <img src={img.url} alt="preview" className="w-full h-full object-contain" />
          <button
            type="button"
            onClick={() => onSetPrimary(index)}
            className={`absolute top-2 left-2 p-1.5 rounded-lg text-[12px] font-bold border transition-all cursor-pointer flex items-center justify-center ${
              isPrimary
                ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                : 'bg-black/60 border-white/10 text-slate-400 hover:text-amber-300 hover:border-amber-500/30'
            }`}
            title={isPrimary ? 'Primary Cover' : 'Set as Cover'}
          >
            ★
          </button>
          <button type="button" onClick={() => onRemove(index)}
            className="absolute top-2 right-2 p-1.5 bg-black/60 border border-white/10 rounded-lg text-slate-350 hover:text-rose-455 transition-colors cursor-pointer">
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
          className="btn-ghost flex-1 py-2.5 rounded-lg text-[12px] font-semibold cursor-pointer flex items-center justify-center gap-1.5"
        >
          {isUploading
            ? <span className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
            : <FileImage size={13} />}
          {isUploading ? 'Uploading…' : 'Upload Image File'}
        </button>

        {/* remove row */}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="p-2.5 text-slate-600 hover:text-rose-455 rounded-lg transition-colors cursor-pointer bg-white/[0.03] border border-white/[0.06] hover:bg-rose-500/[0.08] hover:border-rose-500/20"
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
        className="input-premium w-full px-3.5 py-2 text-[11.5px] rounded-lg font-medium placeholder:text-slate-700"
      />

      {uploadError && uploadingIndex === index && (
        <p className="text-[10px] text-amber-400 flex items-center gap-1">
          <AlertTriangle size={10} />{uploadError}
        </p>
      )}
    </div>
  );
}

/* ─── Single link row inside form ─────────────────────── */
function LinkRow({ link, index, total, onRemove, onChange, onMoveUp, onMoveDown }) {
  return (
    <div className="flex items-center gap-2 p-2.5 bg-white/[0.025] border border-white/[0.06] rounded-xl">
      {/* Up/Down buttons for ordering */}
      <div className="flex flex-col gap-1 shrink-0">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMoveUp(index)}
          className={`p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/[0.08] hover:border-indigo-500/20 active:scale-95 transition-all cursor-pointer ${
            index === 0 ? 'opacity-20 cursor-not-allowed pointer-events-none' : ''
          }`}
          title="Move link up"
        >
          <ChevronUp size={11} />
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onMoveDown(index)}
          className={`p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/[0.08] hover:border-indigo-500/20 active:scale-95 transition-all cursor-pointer ${
            index === total - 1 ? 'opacity-20 cursor-not-allowed pointer-events-none' : ''
          }`}
          title="Move link down"
        >
          <ChevronDown size={11} />
        </button>
      </div>
      <Globe size={12} className="text-indigo-400 shrink-0" />
      <div className="flex-1 grid grid-cols-2 gap-2">
        <input
          type="url"
          placeholder="https://…"
          value={link.url}
          onChange={e => onChange(index, { ...link, url: e.target.value })}
          className="input-premium px-3.5 py-2 text-[12px] rounded-lg w-full font-medium placeholder:text-slate-700"
        />
        <input
          type="text"
          placeholder="Label (e.g. GitHub)"
          value={link.label}
          onChange={e => onChange(index, { ...link, label: e.target.value })}
          className="input-premium px-3.5 py-2 text-[12px] rounded-lg w-full font-medium placeholder:text-slate-700"
        />
      </div>
      <button type="button" onClick={() => onRemove(index)}
        className="p-1.5 text-slate-600 hover:text-rose-400 rounded-lg transition-colors cursor-pointer shrink-0">
        <X size={12} />
      </button>
    </div>
  );
}

/* ─── Premium Custom Dropdown ─────────────────────────── */
function CustomDropdown({ value, onChange, options, icon, placeholder }) {
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
        className="select-premium pl-8 pr-10 py-2 text-[13px] rounded-xl cursor-pointer font-medium flex items-center gap-1.5 min-w-[130px] justify-between relative group/btn"
      >
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {icon}
        </span>
        <span className="truncate pr-1">{activeOption.label}</span>
        <ChevronDown 
          size={12} 
          className={`text-slate-500 transition-transform duration-200 group-hover/btn:text-slate-350 ${isOpen ? 'rotate-180 text-indigo-400' : ''}`} 
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 min-w-[180px] bg-slate-950/98 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-[0_12px_30px_rgba(0,0,0,0.6)] py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 text-[12.5px] transition-all flex items-center justify-between border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.04] cursor-pointer ${
                value === opt.value 
                  ? 'text-indigo-300 font-semibold bg-indigo-500/[0.04]' 
                  : 'text-slate-355 hover:text-white'
              }`}
            >
              <span>{opt.label}</span>
              {value === opt.value && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
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
  onPromoteToProject, promotedMap = {}, onOpenConcept
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
      return matchesSearch && matchesTag;
    });
  };

  const processedIdeas = getProcessedIdeas();
  const pinnedIdeas = processedIdeas.filter(idea => pinnedIds.includes(idea.id));
  const regularIdeas = processedIdeas.filter(idea => !pinnedIds.includes(idea.id));

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
    <div ref={rootRef} className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ background: '#07060f' }}>
      <div className="workspace-aurora-glow workspace-glow-1" />
      <div className="workspace-aurora-glow workspace-glow-2" />

      {/* Header */}
      <header className="glass-header px-4 lg:px-7 py-4 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <button onClick={onMenuToggle}
            className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-white rounded-xl cursor-pointer flex items-center justify-center shrink-0 bg-white/[0.04] border border-white/[0.06] transition-all hover:bg-white/[0.07]">
            <Menu size={16} />
          </button>
          <div>
            <h2 className="text-[15px] lg:text-[17px] font-extrabold text-white tracking-tight leading-tight">Idea Vault</h2>
            <p className="text-[10px] lg:text-[11px] text-slate-600 mt-0.5 font-medium">{(ideas||[]).length} ideas captured</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onLock} className="btn-ghost p-2.5 rounded-xl cursor-pointer flex items-center justify-center"
            title="Lock workspace">
            <Lock size={13} className="text-slate-500 hover:text-rose-400 transition-colors" />
          </button>
          <button onClick={handleOpenAdd} className="btn-primary flex items-center gap-2 px-4 py-2 text-[13px] font-bold rounded-xl cursor-pointer">
            <Plus size={14} />
            <span className="hidden sm:inline">New Idea</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </header>

      {/* Unified Toolbar Dropdowns */}
      <div className="px-4 lg:px-7 py-3 border-b border-white/[0.04] flex flex-wrap gap-3 items-center justify-between shrink-0 relative z-10"
        style={{ background: 'rgba(7,6,15,0.6)', backdropFilter: 'blur(16px)' }}>
        <div className="relative min-w-[220px] max-w-xs flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            ref={searchRef}
            placeholder="Search ideas…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input-premium w-full pl-9 pr-4 py-2.5 text-[13px] rounded-xl font-medium placeholder:text-slate-700"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedTag && (
            <div className="flex items-center shrink-0">
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
                <Hash size={9} /> {selectedTag}
                <button onClick={() => setSelectedTag('')} className="hover:text-white ml-0.5 cursor-pointer" title="Clear filter">
                  <X size={9} />
                </button>
              </span>
            </div>
          )}

          <CustomDropdown
            value={selectedTag}
            onChange={setSelectedTag}
            options={tagOptions}
            icon={<Tag size={11} className="text-indigo-400/80" />}
            placeholder="All Tags"
          />

          <CustomDropdown
            value={sortBy}
            onChange={setSortBy}
            options={sortOptions}
            icon={<Calendar size={11} className="text-amber-400/80" />}
            placeholder="Custom"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-7 py-6 reveal-stagger">
        {loading ? (
          <div className="h-48 flex items-center justify-center gap-3 text-slate-500 text-sm">
            <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : processedIdeas.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
              <Lightbulb size={24} className="text-slate-600 animate-pulse" />
            </div>
            <h3 className="text-sm font-semibold text-slate-300">No ideas yet</h3>
            <p className="text-[12px] text-slate-600 mt-1.5 leading-relaxed">
              {searchTerm || selectedTag ? 'Try adjusting your search or tags.' : 'Capture your first creative thought.'}
            </p>
            {!searchTerm && !selectedTag && (
              <button onClick={handleOpenAdd} className="btn-primary mt-5 px-5 py-2 text-[13px] font-semibold rounded-xl cursor-pointer">
                Capture Idea
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* Pinned Section */}
            {pinnedIdeas.length > 0 && (
              <div className="mb-8 animate-in fade-in duration-300">
                <div className="flex items-center gap-2 mb-4">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pinned Ideas</h3>
                  <span className="px-2 py-0.5 text-[10px] bg-amber-400/10 text-amber-350 rounded-full font-bold border border-amber-400/20">{pinnedIdeas.length}</span>
                </div>
                <div className="columns-1 md:columns-2 xl:columns-3 gap-5">
                  {pinnedIdeas.map(idea => (
                    <div key={idea.id} className="break-inside-avoid mb-5">
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
                        onPromote={onPromoteToProject}
                        promotedTo={promotedMap[idea.id]}
                        onOpenConcept={onOpenConcept}
                      />
                    </div>
                  ))}
                </div>
                {regularIdeas.length > 0 && <div className="h-px bg-white/[0.04] my-8" />}
              </div>
            )}

            {/* Main Section */}
            {regularIdeas.length > 0 && (
              <>
                {pinnedIdeas.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb size={14} className="text-slate-500" />
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Other Ideas</h3>
                  </div>
                )}
                <div className="columns-1 md:columns-2 xl:columns-3 gap-5">
                  {regularIdeas.map(idea => (
                    <div
                      key={idea.id}
                      data-flip-id={idea.id}
                      draggable={sortBy === 'custom' && hoveredDragId === idea.id && !searchTerm && !selectedTag}
                      onDragStart={e => handleDragStart(e, idea.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={e => handleDragOver(e, idea.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, idea.id)}
                      className={`break-inside-avoid mb-5 transition-opacity duration-200 ${
                        draggedId === idea.id ? 'opacity-20 scale-95 border-2 border-dashed border-indigo-500/20 rounded-2xl' : ''
                      } ${
                        draggedOverId === idea.id ? 'border-2 border-indigo-500 scale-[1.01] shadow-[0_0_15px_rgba(99,102,241,0.25)] rounded-2xl' : ''
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
                        onPromote={onPromoteToProject}
                        promotedTo={promotedMap[idea.id]}
                        onOpenConcept={onOpenConcept}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ ADD / EDIT MODAL ═══ */}
      {isFormOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setIsFormOpen(false)}>
          <div className="modal-surface w-full max-w-xl max-h-[92vh] rounded-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* modal header */}
            <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-[15px] font-bold text-white">{editingIdea ? 'Edit Idea' : 'New Idea'}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{editingIdea ? 'Update your idea below' : 'Capture a creative thought'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormStarred(s => !s)}
                  className={`p-2 rounded-lg cursor-pointer transition-all duration-200 ${
                    formStarred
                      ? 'bg-amber-400/10 border border-amber-400/35 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.06)]'
                      : 'btn-ghost text-slate-555 hover:text-amber-400'
                  }`}
                  title={formStarred ? 'Featured (Starred)' : 'Mark as Featured'}
                >
                  <Star size={15} className={formStarred ? 'fill-amber-300' : ''} />
                </button>
                <button onClick={() => setIsFormOpen(false)} className="btn-ghost p-2 rounded-lg cursor-pointer"><X size={15} /></button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Title */}
              <FormField label="Title" required>
                <input type="text" required placeholder="e.g. AI-driven portfolio tracker"
                  value={formTitle} onChange={e => setFormTitle(e.target.value)}
                  className="input-premium w-full px-4 py-2.5 text-[13px] rounded-xl font-semibold placeholder:text-slate-700" />
              </FormField>

              {/* Description */}
              <FormField label="Description">
                <textarea rows={4} placeholder="Elaborate on your idea…"
                  value={formContent} onChange={e => setFormContent(e.target.value)}
                  className="input-premium w-full px-4 py-3 text-[13px] rounded-xl resize-none leading-relaxed font-medium placeholder:text-slate-700" />
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
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-[12px] font-semibold
                               text-indigo-400 border border-dashed border-indigo-500/25 rounded-xl
                               hover:border-indigo-500/50 hover:bg-indigo-500/[0.05] transition-all cursor-pointer"
                  >
                    <Plus size={13} /> Add Image
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
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-[12px] font-semibold
                               text-indigo-400 border border-dashed border-indigo-500/25 rounded-xl
                               hover:border-indigo-500/50 hover:bg-indigo-500/[0.05] transition-all cursor-pointer"
                  >
                    <Plus size={13} /> Add Link
                  </button>
                </div>
              </FormField>

              {/* Enter-to-Tag interactive chip input */}
              <FormField label="Tags">
                <div className="input-premium w-full px-3.5 py-2.5 text-[13px] rounded-xl flex flex-wrap gap-2 items-center min-h-[42px] focus-within:border-indigo-500/40 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all">
                  {formTags.map((tag, idx) => (
                    <span key={idx} className="tag-pill flex items-center gap-1 bg-indigo-500/15 border-indigo-500/25 text-indigo-300"
                          onClick={e => e.stopPropagation()}
                          onDragStart={e => e.stopPropagation()}>
                      #{tag}
                      <button
                        type="button"
                        onClick={() => removeFormTag(tag)}
                        className="hover:text-white ml-0.5 cursor-pointer flex items-center justify-center rounded-full p-0.5 hover:bg-white/10"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  <div className="flex-1 min-w-[120px] flex items-center gap-1.5">
                    <Tag size={11} className="text-slate-500 shrink-0" />
                    <input
                      type="text"
                      placeholder={formTags.length === 0 ? "Type tag & press Enter…" : "Add tag…"}
                      value={tagInputVal}
                      onChange={e => setTagInputVal(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      className="bg-transparent border-none outline-none focus:outline-none w-full text-[13px] text-slate-200 placeholder-slate-700 font-medium"
                    />
                  </div>
                </div>
              </FormField>

              {/* actions */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsFormOpen(false)}
                  className="btn-ghost flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" disabled={uploadingIndex !== null}
                  className={`btn-primary flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer ${uploadingIndex !== null ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {editingIdea ? 'Save Changes' : 'Capture Idea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ DELETE CONFIRM ═══ */}
      {deleteConfirmId && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-surface w-full max-w-sm rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 size={16} className="text-rose-400" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-white">Delete Idea</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">This cannot be undone</p>
              </div>
            </div>
            <p className="text-[13px] text-slate-400 leading-relaxed">
              Are you sure you want to delete this idea?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)}
                className="btn-ghost flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Keep It</button>
              <button onClick={async () => { await onDelete(deleteConfirmId); setDeleteConfirmId(null); }}
                className="btn-danger flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Delete</button>
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
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
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
    <div className={`modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`modal-surface w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[92vh] ${isClosing ? 'closing' : ''}`}
           onClick={e => e.stopPropagation()}>

        {/* image carousel */}
        {images.length > 0 && (
          <div className="relative bg-slate-950 shrink-0 h-64 border-b border-white/[0.04] flex items-center justify-center group/carousel">
            <img src={images[imgIdx].url} alt={images[imgIdx].caption || idea.title}
              className="w-full h-full object-contain" />
            
            {/* fullscreen toggle button */}
            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              className="absolute top-3 right-3 p-2 bg-black/60 border border-white/10 rounded-xl text-slate-300 hover:text-white transition-all cursor-pointer opacity-0 group-hover/carousel:opacity-100 flex items-center justify-center"
              title="Open full screen"
            >
              <Maximize2 size={13} />
            </button>

            {/* prev / next */}
            {images.length > 1 && (
              <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
                {images.map((_, i) => (
                  <button key={i} type="button" onClick={() => setImgIdx(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${i === imgIdx ? 'bg-white scale-125' : 'bg-white/40'}`} />
                ))}
              </div>
            )}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-black/60 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center hover:bg-indigo-600/90 hover:border-indigo-500/30 hover:scale-105 active:scale-95 transition-all shadow-lg backdrop-blur-md cursor-pointer"
                  title="Previous image"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setImgIdx(i => (i + 1) % images.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-black/60 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center hover:bg-indigo-600/90 hover:border-indigo-500/30 hover:scale-105 active:scale-95 transition-all shadow-lg backdrop-blur-md cursor-pointer"
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
          <div className="bg-white/[0.02] border-b border-white/[0.04] px-5 py-2.5 flex items-start gap-2 text-[12px] text-slate-350 italic">
            <span className="text-indigo-400 font-bold tracking-wide uppercase text-[10px] not-italic mt-0.5 shrink-0">Caption:</span>
            <span className="leading-relaxed">{images[imgIdx].caption}</span>
          </div>
        )}

        {/* header */}
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-start justify-between shrink-0">
          <div className="flex-1 pr-4">
            <h3 className="text-[15px] font-bold text-white leading-snug">{idea.title}</h3>
            {idea.tags && idea.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {idea.tags.map(tag => <span key={tag} className="tag-pill">#{tag}</span>)}
              </div>
            )}
          </div>
          <button onClick={handleClose} className="btn-ghost p-2 rounded-lg cursor-pointer"><X size={15} /></button>
        </div>

        {/* body */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">

          {/* description */}
          {idea.content && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Notes</p>
              <div className="glass-panel rounded-xl p-4 text-[13px] text-slate-300 whitespace-pre-line leading-relaxed">
                {idea.content}
              </div>
            </div>
          )}

          {/* links */}
          {links.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Links
              </p>
              <div className="space-y-1.5">
                {links.map((link, i) => (
                  isValidUrl(link.url) ? (
                    <a key={i} href={link.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]
                                 hover:bg-indigo-500/[0.07] hover:border-indigo-500/20 transition-all group/link">
                      <Globe size={13} className="text-indigo-400 shrink-0" />
                      <span className="text-[13px] text-slate-300 truncate flex-1 group-hover/link:text-indigo-300">
                        {link.label || link.url}
                      </span>
                      <ExternalLink size={11} className="text-slate-600 group-hover/link:text-indigo-400 shrink-0" />
                    </a>
                  ) : (
                    <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                      <Globe size={13} className="text-slate-600 shrink-0" />
                      <span className="text-[12px] text-slate-600 truncate">{link.label || link.url || '—'}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* images grid (thumbnails) */}
          {images.length > 1 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Images · <span className="text-slate-650">{images.length}</span>
              </p>
              <div className="grid grid-cols-4 gap-2">
                {images.map((img, i) => (
                  <button key={i} type="button" onClick={e => { e.stopPropagation(); setImgIdx(i); setIsFullscreen(true); }}
                    className={`rounded-lg overflow-hidden aspect-square border-2 cursor-pointer transition-all ${i === imgIdx ? 'border-indigo-500' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                    <img src={img.url} alt={img.caption || `Image ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-6 py-4 border-t border-white/[0.04] flex gap-3 shrink-0">
          <button onClick={() => onEdit(idea)} className="btn-primary flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Edit</button>
          <button onClick={handleClose} className="btn-ghost py-2.5 px-5 text-[13px] font-semibold rounded-xl cursor-pointer">Close</button>
        </div>
      </div>

      {/* Fullscreen Overlay */}
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-in fade-in duration-200" 
          onClick={e => { e.stopPropagation(); setIsFullscreen(false); }}
        >
          <button 
            onClick={e => { e.stopPropagation(); setIsFullscreen(false); }} 
            className="absolute top-4 right-4 p-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-white transition-all cursor-pointer z-[101]"
          >
            <X size={18} />
          </button>
          <img 
            src={images[imgIdx].url} 
            alt="Fullscreen" 
            className="max-w-full max-h-[82vh] object-contain rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
            onClick={e => e.stopPropagation()} 
          />
          {images[imgIdx].caption && (
            <p 
              className="mt-4 text-center text-sm text-slate-300 max-w-xl italic leading-relaxed bg-black/40 px-4 py-2.5 rounded-xl border border-white/5"
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
function IdeaCard({ idea, sortBy, onEdit, onDelete, onSelectTag, onViewDetails, isFilteringOrSearching, setHoveredDragId, isPinned, onTogglePin, onPromote, promotedTo, onOpenConcept }) {
  // Without this the funnel leaks: a promoted idea looked identical to an
  // unpromoted one, so the same idea would get promoted twice.
  const isPromoted = !!promotedTo;
  const images = idea.images?.length > 0
    ? idea.images
    : idea.image_url ? [{ url: idea.image_url, caption: '' }] : [];
  const links  = idea.links || [];

  const showDragHandle = sortBy === 'custom' && !isFilteringOrSearching;
  const primaryImage = images.find(img => img.is_primary) || images[0];

  return (
    <article
      onClick={() => onViewDetails && onViewDetails(idea)}
      className={`glass-card rounded-2xl !overflow-visible cursor-pointer select-none group tactile-item ${
        isPinned ? 'premium-starred-card' : ''
      }`}
    >
      {/* hero image */}
      {primaryImage?.url && (
        <div className="relative h-40 overflow-hidden rounded-t-2xl bg-black/25 flex items-center justify-center border-b border-white/[0.04]">
          <img src={primaryImage.url} alt={idea.title}
            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-102" loading="lazy" />
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* title + drag handle + actions */}
        <div className="flex items-start gap-2 justify-between">
          <div className="flex items-start gap-1.5 flex-1 min-w-0">
            {showDragHandle && (
              <div 
                className="text-slate-655 hover:text-slate-400 cursor-grab active:cursor-grabbing p-1 shrink-0 -ml-1 select-none transition-colors"
                title="Drag to reorder card"
                onClick={e => e.stopPropagation()}
                onDragStart={e => e.stopPropagation()}
                onMouseEnter={() => setHoveredDragId(idea.id)}
                onMouseLeave={() => setHoveredDragId(null)}
              >
                <GripVertical size={13} className="mt-0.5" />
              </div>
            )}
            <h4 className="text-[13px] font-bold text-white leading-snug break-words flex-1 mt-0.5 flex items-center gap-1.5">
              <span>{idea.title}</span>
            </h4>
          </div>
          
          {/* Glass action container strip (hidden by default, shown on card hover) */}
          <div className="flex items-center gap-0.5 bg-white/[0.02] border border-white/[0.07] rounded-xl p-0.5 shrink-0 select-none
                          opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100
                          transition-all duration-200 ease-out"
               onClick={e => e.stopPropagation()}
               onDragStart={e => e.stopPropagation()}>
            {/* pin toggle button */}
            <button onClick={() => onTogglePin(idea.id)}
              className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center border border-transparent ${
                isPinned 
                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/[0.08] hover:border-amber-400/20' 
                  : 'text-slate-400 hover:text-amber-400 hover:bg-amber-400/[0.08] hover:border-amber-400/20'
              }`}
              title={isPinned ? "Unpin idea" : "Pin idea"}>
              <Star size={11} className={isPinned ? 'fill-amber-400' : ''} />
            </button>
            
            <div className="w-[1px] h-3 bg-white/[0.08] self-center" />

            {/* info tooltip */}
            <div className="relative group/info select-none">
              <button
                type="button"
                className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-indigo-500/[0.08] transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-indigo-500/20"
              >
                <Info size={11} />
              </button>
              <div className="absolute right-0 top-full mt-2 hidden group-hover/info:block bg-slate-950/98 border border-white/[0.08] text-[9.5px] text-slate-300 font-bold px-2.5 py-1.5 rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.85)] whitespace-nowrap z-50 pointer-events-none w-max">
                Logged {formatDate(idea.created_at || new Date())}
              </div>
            </div>
            
            <div className="w-[1px] h-3 bg-white/[0.08] self-center" />

            <button
              onClick={() => isPromoted
                ? (onOpenConcept && onOpenConcept(promotedTo))
                : (onPromote && onPromote(idea))}
              className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center border border-transparent ${
                isPromoted
                  ? 'text-sky-400 hover:bg-sky-500/[0.12] hover:border-sky-500/25'
                  : 'text-slate-400 hover:text-sky-400 hover:bg-sky-500/[0.08] hover:border-sky-500/20'
              }`}
              title={isPromoted ? 'Open the concept this became' : 'Promote to a project concept'}>
              <Rocket size={11} />
            </button>

            <button onClick={() => onEdit(idea)}
              className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-indigo-500/[0.08] transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-indigo-500/20"
              title="Edit idea">
              <Edit3 size={11} />
            </button>
            
            <button onClick={() => onDelete(idea.id)}
              className="p-1.5 text-slate-455 hover:text-rose-455 rounded-lg hover:bg-rose-500/[0.08] transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-rose-500/20"
              title="Delete idea">
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {/* links preview strip */}
        {links.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2.5 border-t border-white/[0.06]" 
               onClick={e => e.stopPropagation()}
               onDragStart={e => e.stopPropagation()}>
            {links.map((link, i) => (
              isValidUrl(link.url) ? (
                <a key={i} href={link.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg
                             bg-indigo-500/[0.08] border border-indigo-500/15 text-indigo-400
                             hover:bg-indigo-500/15 hover:text-indigo-300 transition-all cursor-pointer">
                  <Globe size={9} />
                  {link.label || new URL(link.url).hostname.replace('www.','')}
                  <ExternalLink size={8} className="opacity-60" />
                </a>
              ) : null
            ))}
          </div>
        )}

        {/* promoted marker + tags */}
        {(isPromoted || (idea.tags && idea.tags.length > 0)) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-white/[0.06]"
               onClick={e => e.stopPropagation()}
               onDragStart={e => e.stopPropagation()}>
            {isPromoted && (
              <button
                onClick={() => onOpenConcept && onOpenConcept(promotedTo)}
                title="Open the concept this became"
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full cursor-pointer
                  bg-sky-500/[0.12] text-sky-300 border border-sky-500/30 hover:brightness-125 transition-all">
                <Rocket size={8} />
                Promoted
              </button>
            )}
            {(idea.tags || []).map(tag => (
              <button key={tag} onClick={() => onSelectTag(tag)} className="tag-pill cursor-pointer">#{tag}</button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
