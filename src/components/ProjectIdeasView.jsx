import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useShortcutHooks } from '../utils/useShortcutHooks';
import { useArchive } from '../utils/useArchive';
import { useListNav } from '../utils/useListNav';
import BulkBar from './BulkBar';
import { 
  Plus, Search, Tag, Trash2, Edit3, X, Rocket, Menu, Lock, 
  Globe, ExternalLink, Info, GripVertical, ChevronLeft, ChevronRight, 
  Maximize2, Calendar, Image as ImageIcon, FileImage, AlertTriangle, Hash,
  ChevronDown, ChevronUp, Star, Archive, ArchiveRestore, CheckSquare, Square, Trash2 as TrashBulk
} from 'lucide-react';

/* ─── tiny helpers ─────────────────────────────────────── */
/* Project lifecycle. Without this, concepts were a pile with no exit —
   captured, then nothing. */
const PROJECT_STATUS = {
  backlog:  { label: 'Backlog',  color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)' },
  building: { label: 'Building', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  border: 'rgba(56,189,248,0.32)' },
  shipped:  { label: 'Shipped',  color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.32)' },
  parked:   { label: 'Parked',   color: '#a1a1aa', bg: 'rgba(161,161,170,0.10)', border: 'rgba(161,161,170,0.24)' },
};
const STATUS_ORDER = ['backlog', 'building', 'shipped', 'parked'];

function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}



/* ─── Single image row inside form ────────────────────── */
function ImageRow({ img, index, onRemove, onChangeUrl, onFileUpload, uploadingIndex, uploadError, isPrimary, onSetPrimary }) {
  const fileRef = useRef(null);
  const isUploading = uploadingIndex === index;

  return (
    <div className="space-y-2 p-3 bg-white/[0.025] border border-white/[0.06] rounded-xl group/imgrow">
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
          {isUploading ? 'Loading…' : 'Load Image File'}
        </button>

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="p-2.5 text-slate-600 hover:text-rose-455 rounded-lg transition-colors cursor-pointer bg-white/[0.03] border border-white/[0.06] hover:bg-rose-500/[0.08] hover:border-rose-500/20"
        >
          <X size={13} />
        </button>
      </div>

      <input
        type="text"
        placeholder="Caption (optional)"
        value={img.caption || ''}
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
        className="p-1.5 text-slate-655 hover:text-rose-400 rounded-lg transition-colors cursor-pointer shrink-0">
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

const DEFAULT_PROJECTS = [
  {
    id: '1',
    title: "AnonVault E2E Sync",
    content: "Implement local-first offline synchronization for secure document vaults with encrypted cloud backup tunnels.",
    tags: ["Security", "IndexedDB", "AES-GCM", "Supabase"],
    images: [],
    links: [{ url: "https://supabase.com", label: "Supabase Core" }],
    created_at: new Date().toISOString()
  },
  {
    id: '2',
    title: "Localized AI Agent Workspace",
    content: "A fast, privacy-focused browser extension running dynamic Llama3 completions via local Ollama services.",
    tags: ["AI/ML", "WebGPU", "React", "Ollama"],
    images: [],
    links: [],
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: '3',
    title: "P2P Ephemeral Share Link",
    content: "Create anonymous peer-to-peer file transfer links that establish direct WebRTC tunnels for large file shares.",
    tags: ["Web App", "WebRTC", "Socket.io", "Vite"],
    images: [],
    links: [],
    created_at: new Date(Date.now() - 172800000).toISOString()
  }
];

export default function ProjectIdeasView({
  ideas = [], onAdd, onUpdate, onDelete, onReorder, loading, theme, onLock, showToast, onMenuToggle, initialSelectedIdeaId, onClearInitialSelectedIdea
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const { isArchived, toggleArchived, archivedIds } = useArchive('anonvault_projects_archived');
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('anonvault_projects_view') || 'board'; }
    catch { return 'board'; }
  });

  const setView = mode => {
    setViewMode(mode);
    try { localStorage.setItem('anonvault_projects_view', mode); } catch { /* not critical */ }
  };

  // Board drag: the id being carried between columns. Kept separate from the
  // reorder drag state above, which only applies to the grid.
  const [boardDragId, setBoardDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const setStatus = async (idea, next) => {
    if (!idea || (idea.status || 'backlog') === next) return;
    try {
      if (onUpdate) await onUpdate(idea.id, { ...idea, status: next });
    } catch (err) {
      console.error('Failed to move concept:', err);
      showToast?.('error', 'Move Failed', 'Could not change the stage.');
    }
  };
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('anonvault_project_ideas_sortby') || 'custom');

  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      const saved = localStorage.getItem('anonvault_project_ideas_pinned');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [formStarred, setFormStarred] = useState(false);

  const togglePin = (id) => {
    setPinnedIds(prev => {
      const updated = prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id];
      localStorage.setItem('anonvault_project_ideas_pinned', JSON.stringify(updated));
      return updated;
    });
  };
  
  // Drag & drop state for custom manual ordering
  const [orderedIdeas, setOrderedIdeas] = useState([]);
  const [draggedId, setDraggedId] = useState(null);
  const [draggedOverId, setDraggedOverId] = useState(null);
  const [hoveredDragId, setHoveredDragId] = useState(null);

  // Form Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState([]);
  const [tagInputVal, setTagInputVal] = useState('');
  const [formImages, setFormImages] = useState([]);
  const [formLinks, setFormLinks] = useState([]);
  const [uploadingIndex, setUploadingIndex] = useState(null);
  const [uploadError, setUploadError] = useState('');

  // Persist sorting selection
  useEffect(() => {
    localStorage.setItem('anonvault_project_ideas_sortby', sortBy);
  }, [sortBy]);

  // Sync database project ideas with custom local order
  useEffect(() => {
    if (!ideas) return;
    
    let savedOrder = [];
    try {
      const saved = localStorage.getItem('anonvault_project_ideas_order');
      if (saved) savedOrder = JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse project ideas order:', e);
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

  // Modals
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const prevRectsRef = useRef({});

  // Flip Layout Animations
  useLayoutEffect(() => {
    const cards = document.querySelectorAll('[data-flip-id]');
    const newRects = {};
    cards.forEach(card => {
      const id = card.getAttribute('data-flip-id');
      newRects[id] = card.getBoundingClientRect();
    });

    Object.keys(newRects).forEach(id => {
      const first = prevRectsRef.current[id];
      const last = newRects[id];
      if (first && last) {
        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;

        if (deltaX !== 0 || deltaY !== 0) {
          const el = Array.from(cards).find(node => node.getAttribute('data-flip-id') === id);
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
  }, [orderedIdeas, searchTerm, selectedTag, sortBy]);

  // Tag extraction for sidebar filter dropdown list
  const allTags = Array.from(new Set(ideas.flatMap(i => i.tags || []))).sort();
  const tagOptions = [{ value: '', label: 'All Tags' }, ...allTags.map(t => ({ value: t, label: `#${t}` }))];

  const sortOptions = [
    { value: 'custom', label: 'Custom (Drag & Drop)' },
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' }
  ];

  // Drag-and-drop Reordering handlers
  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDraggedOverId(null);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (draggedId !== id && draggedOverId !== id) {
      setDraggedOverId(id);
    }
  };

  const handleDragLeave = (e, id) => {
    if (draggedOverId === id) {
      setDraggedOverId(null);
    }
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (draggedId === targetId) return;

    const dragIdx = orderedIdeas.findIndex(i => i.id === draggedId);
    const dropIdx = orderedIdeas.findIndex(i => i.id === targetId);
    if (dragIdx === -1 || dropIdx === -1) return;

    const updated = [...orderedIdeas];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(dropIdx, 0, moved);
    
    const newOrderIds = updated.map(item => item.id);
    localStorage.setItem('anonvault_project_ideas_order', JSON.stringify(newOrderIds));
    setOrderedIdeas(updated);
    if (onReorder) {
      onReorder(updated);
    }
  };

  // Image upload simulation (base64 saving)
  const handleFileUpload = (index, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file');
      return;
    }

    if (file.size > 1.5 * 1024 * 1024) {
      showToast?.('warning', 'File Too Large', 'Maximum image size is 1.5 MB to preserve local vault capacity.');
      setUploadError('Max 1.5 MB');
      return;
    }

    setUploadingIndex(index);
    setUploadError('');

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      const updated = [...formImages];
      updated[index] = { ...updated[index], url: base64 };
      setFormImages(updated);
      setUploadingIndex(null);
    };
    reader.onerror = () => {
      setUploadError('Failed to read image file');
      setUploadingIndex(null);
    };
    reader.readAsDataURL(file);
  };

  const addImageRow = () => {
    setFormImages([...formImages, { url: '', caption: '', is_primary: false }]);
  };

  const removeImageRow = (idx) => {
    setFormImages(formImages.filter((_, i) => i !== idx));
  };

  const changeImageRow = (idx, url, caption) => {
    const updated = [...formImages];
    updated[idx] = { ...updated[idx], url, caption };
    setFormImages(updated);
  };

  const handleSetPrimary = (idx) => {
    setFormImages(formImages.map((img, i) => ({ ...img, is_primary: i === idx })));
  };

  // Link Form Rows Handlers
  const addLinkRow = () => {
    setFormLinks([...formLinks, { url: '', label: '' }]);
  };

  const removeLinkRow = (idx) => {
    setFormLinks(formLinks.filter((_, i) => i !== idx));
  };

  const changeLinkRow = (idx, link) => {
    const updated = [...formLinks];
    updated[idx] = link;
    setFormLinks(updated);
  };

  const moveLink = (index, direction) => {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= formLinks.length) return;
    const updated = [...formLinks];
    const temp = updated[index];
    updated[index] = updated[nextIdx];
    updated[nextIdx] = temp;
    setFormLinks(updated);
  };

  // Form Tags Helper Handlers
  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const cleaned = tagInputVal
        .trim()
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]/g, '');
      if (cleaned && !formTags.includes(cleaned)) {
        setFormTags(prev => [...prev, cleaned]);
      }
      setTagInputVal('');
    } else if (e.key === 'Backspace' && !tagInputVal && formTags.length > 0) {
      setFormTags(prev => prev.slice(0, -1));
    }
  };

  const removeFormTag = (tag) => {
    setFormTags(formTags.filter(t => t !== tag));
  };

  // Form Open Helper Handlers
  const handleOpenAdd = () => {
    setEditingIdea(null);
    setFormTitle('');
    setFormContent('');
    setFormTags([]);
    setTagInputVal('');
    setFormImages([]);
    setFormLinks([]);
    setFormStarred(false);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (idea) => {
    setEditingIdea(idea);
    setFormTitle(idea.title);
    setFormContent(idea.content || '');
    setFormTags(idea.tags || []);
    setTagInputVal('');
    setFormImages(idea.images || []);
    setFormLinks(idea.links || []);
    setFormStarred(pinnedIds.includes(idea.id));
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      if (showToast) showToast('error', 'Title Required', 'Please give your concept a title before saving.');
      return;
    }

    let finalTags = [...formTags];
    if (tagInputVal.trim()) {
      const cleaned = tagInputVal.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      if (cleaned && !finalTags.includes(cleaned)) {
        finalTags.push(cleaned);
      }
    }

    const validImages = formImages.filter(img => img.url);
    const validLinks  = formLinks.filter(lnk => lnk.url);

    const payload = {
      title: formTitle.trim(),
      content: formContent.trim(),
      tags: finalTags,
      images: validImages,
      links: validLinks,
    };

    if (editingIdea) {
      if (onUpdate) await onUpdate(editingIdea.id, payload);
      setPinnedIds(prev => {
        const isCurrentlyPinned = prev.includes(editingIdea.id);
        if (formStarred && !isCurrentlyPinned) {
          const updated = [...prev, editingIdea.id];
          localStorage.setItem('anonvault_project_ideas_pinned', JSON.stringify(updated));
          return updated;
        } else if (!formStarred && isCurrentlyPinned) {
          const updated = prev.filter(id => id !== editingIdea.id);
          localStorage.setItem('anonvault_project_ideas_pinned', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    } else {
      if (onAdd) {
        const added = await onAdd(payload);
        if (added && added.id && formStarred) {
          setPinnedIds(prev => {
            const updated = [...prev, added.id];
            localStorage.setItem('anonvault_project_ideas_pinned', JSON.stringify(updated));
            return updated;
          });
        }
      }
    }
    setIsFormOpen(false);
  };

  const handleDeleteConfirm = (id) => {
    if (onDelete) onDelete(id);
    setDeleteConfirmId(null);
  };

  // Filter & Search & Sort calculation
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
        (idea.content || '').toLowerCase().includes(q) ||
        (idea.tags || []).some(t => t.toLowerCase().includes(q));
      const matchesTag = !selectedTag || (idea.tags && idea.tags.includes(selectedTag));
      // Untagged rows count as backlog, so nothing vanishes behind a filter
      // just because it predates the pipeline.
      const matchesStatus = !selectedStatus || (idea.status || 'backlog') === selectedStatus;
      // Same rule as the vault: archived rows only appear in archive mode.
      if (showArchived !== archivedIds.includes(idea.id)) return false;
      return matchesSearch && matchesTag && matchesStatus;
    });
  };

  // Cycles backlog -> building -> shipped -> parked -> backlog. A one-click
  // move keeps the pipeline usable; burying it in the edit modal would mean
  // nobody ever updates it.
  const advanceStatus = async idea => {
    const current = idea.status || 'backlog';
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length];
    try {
      if (onUpdate) await onUpdate(idea.id, { ...idea, status: next });
      showToast?.('success', PROJECT_STATUS[next].label, `"${idea.title}" moved to ${PROJECT_STATUS[next].label}.`);
    } catch (err) {
      console.error('Failed to change project stage:', err);
      showToast?.('error', 'Update Failed', 'Could not change the stage.');
    }
  };

  const rootRef = useRef(null);
  const searchRef = useRef(null);
  useShortcutHooks({ onNew: handleOpenAdd, searchRef, rootRef });

  const processedIdeas = getProcessedIdeas();

  // Display order differs by view: the board reads column by column, the grid
  // reads pinned then the rest. j/k has to follow whichever is on screen.
  const navIds = viewMode === 'board'
    ? STATUS_ORDER.flatMap(key =>
        processedIdeas.filter(i => (i.status || 'backlog') === key).map(i => i.id))
    : [
        ...processedIdeas.filter(i => pinnedIds.includes(i.id)),
        ...processedIdeas.filter(i => !pinnedIds.includes(i.id)),
      ].map(i => i.id);

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
      `${ids.length} concept${ids.length === 1 ? '' : 's'} ${showArchived ? 'restored' : 'archived'}.`);
  };

  const bulkStage = async next => {
    const ids = nav.selectedIds;
    nav.clearSelection();
    for (const id of ids) {
      const item = processedIdeas.find(i => i.id === id);
      if (item && (item.status || 'backlog') !== next) {
        await onUpdate?.(item.id, { ...item, status: next });
      }
    }
    showToast?.('success', PROJECT_STATUS[next].label,
      `${ids.length} concept${ids.length === 1 ? '' : 's'} moved to ${PROJECT_STATUS[next].label}.`);
  };

  const bulkDelete = async () => {
    const ids = nav.selectedIds;
    nav.clearSelection();
    for (const id of ids) await onDelete?.(id);
  };
  const pinnedIdeas = processedIdeas.filter(idea => pinnedIds.includes(idea.id));
  const regularIdeas = processedIdeas.filter(idea => !pinnedIds.includes(idea.id));

  return (
    <div ref={rootRef} className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ background: '#07060f' }}>
      <div className="workspace-aurora-glow workspace-glow-1" />
      <div className="workspace-aurora-glow workspace-glow-2" />

      {/* Header */}
      <header className="glass-header px-4 lg:px-7 py-4 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <button onClick={onMenuToggle}
            className="lg:hidden p-2 -ml-1 text-slate-555 hover:text-white rounded-xl cursor-pointer flex items-center justify-center shrink-0 bg-white/[0.04] border border-white/[0.06] transition-all hover:bg-white/[0.07]">
            <Menu size={16} />
          </button>
          <div>
            <h2 className="text-[15px] lg:text-[17px] font-extrabold text-white tracking-tight leading-tight">
              Project Ideas
            </h2>
            <p className="text-[10px] lg:text-[11px] text-slate-600 mt-0.5 font-medium">{ideas.length} concepts captured</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onLock} className="btn-ghost p-2.5 rounded-xl cursor-pointer flex items-center justify-center"
            title="Lock workspace">
            <Lock size={13} className="text-slate-500 hover:text-rose-400 transition-colors" />
          </button>
          <button onClick={handleOpenAdd} className="btn-primary flex items-center gap-2 px-4 py-2 text-[13px] font-bold rounded-xl cursor-pointer">
            <Plus size={14} />
            <span className="hidden sm:inline">New Concept</span>
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
            placeholder="Search concepts…"
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

          <button
            onClick={() => setShowArchived(v => !v)}
            title={showArchived ? 'Back to active' : 'Show archived'}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-xl border transition-all cursor-pointer ${
              showArchived
                ? 'bg-slate-500/[0.14] border-slate-400/30 text-slate-300'
                : 'bg-white/[0.02] border-white/[0.04] text-slate-500 hover:text-slate-300'
            }`}>
            <Archive size={12} />
            {showArchived ? 'Archived' : 'Archive'}
          </button>

          <div className="flex items-center gap-1 p-1 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            {['board', 'grid'].map(mode => (
              <button key={mode} onClick={() => setView(mode)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer transition-all capitalize ${
                  viewMode === mode ? 'bg-sky-500/[0.14] text-sky-300' : 'text-slate-500 hover:text-slate-300'
                }`}>
                {mode}
              </button>
            ))}
          </div>

          <CustomDropdown
            value={selectedStatus}
            onChange={setSelectedStatus}
            options={[
              { value: '', label: 'All Stages' },
              ...STATUS_ORDER.map(k => ({ value: k, label: PROJECT_STATUS[k].label })),
            ]}
            icon={<Rocket size={11} className="text-sky-400/80" />}
            placeholder="All Stages"
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
        {/* Being inside the archive has to be unmistakable — otherwise an
            empty archive reads as an empty section. */}
        {showArchived && (
          <div className="flex items-center gap-2.5 mb-5 px-3.5 py-2.5 rounded-2xl"
            style={{ background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.2)' }}>
            <Archive size={13} className="text-slate-400 shrink-0" />
            <p className="text-[12px] font-semibold text-slate-300 flex-1 min-w-0">
              Viewing archive
              <span className="text-slate-500 font-medium">
                {' '}&middot; {archivedIds.length} concept{archivedIds.length === 1 ? '' : 's'} archived
              </span>
            </p>
            <button
              onClick={() => setShowArchived(false)}
              className="shrink-0 px-3 py-1 text-[11px] font-bold rounded-xl cursor-pointer
                text-sky-300 bg-sky-500/[0.12] border border-sky-500/25 hover:bg-sky-500/[0.2] transition-all">
              Back to active
            </button>
          </div>
        )}

        {processedIdeas.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
              {showArchived
                ? <Archive size={24} className="text-slate-600" />
                : <Rocket size={24} className="text-indigo-400 animate-pulse" />}
            </div>
            {/* An empty archive is not an empty section, and must not offer to
                create something into a bucket you cannot create into. */}
            <h3 className="text-sm font-semibold text-slate-300">
              {showArchived ? 'Nothing archived' : 'No concepts yet'}
            </h3>
            <p className="text-[12px] text-slate-600 mt-1.5 leading-relaxed">
              {showArchived
                ? 'Your concepts are all still active. Archive one to tuck it away without deleting it.'
                : searchTerm || selectedTag ? 'Try adjusting your search or tags.' : 'Capture your first project concept.'}
            </p>
            {showArchived ? (
              <button onClick={() => setShowArchived(false)}
                className="btn-primary mt-5 px-5 py-2 text-[13px] font-semibold rounded-xl cursor-pointer">
                Back to active concepts
              </button>
            ) : !searchTerm && !selectedTag && (
              <button onClick={handleOpenAdd} className="btn-primary mt-5 px-5 py-2 text-[13px] font-semibold rounded-xl cursor-pointer">
                Create Concept
              </button>
            )}
          </div>
        ) : viewMode === 'board' ? (
          /* Four columns, one per stage. A grid plus a filter dropdown hid the
             distribution, which is the entire point of a funnel. */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
            {STATUS_ORDER.map(key => {
              const meta = PROJECT_STATUS[key];
              const column = processedIdeas.filter(i => (i.status || 'backlog') === key);
              const isTarget = dragOverCol === key;
              return (
                <div key={key}
                  onDragOver={e => { e.preventDefault(); setDragOverCol(key); }}
                  onDragLeave={() => setDragOverCol(c => (c === key ? null : c))}
                  onDrop={e => {
                    e.preventDefault();
                    const moved = processedIdeas.find(i => i.id === boardDragId);
                    setDragOverCol(null);
                    setBoardDragId(null);
                    if (moved) setStatus(moved, key);
                  }}
                  className="rounded-2xl p-2.5 transition-all min-h-[140px]"
                  style={{
                    background: isTarget ? meta.bg : 'rgba(255,255,255,0.014)',
                    border: '1px solid ' + (isTarget ? meta.border : 'rgba(255,255,255,0.05)'),
                  }}>
                  <div className="flex items-center gap-2 px-1.5 pb-2.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
                    <h3 className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
                      style={{ color: meta.color }}>{meta.label}</h3>
                    <span className="text-[10px] font-bold tabular-nums text-slate-600 ml-auto">
                      {column.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {column.map(idea => (
                      <div key={idea.id}
                        data-nav-id={idea.id}
                        draggable
                        onDragStart={() => setBoardDragId(idea.id)}
                        onDragEnd={() => { setBoardDragId(null); setDragOverCol(null); }}
                        className={`transition-opacity ${boardDragId === idea.id ? 'opacity-30' : ''}`}>
                        <IdeaCard
                          idea={idea}
                          sortBy={sortBy}
                          onEdit={handleOpenEdit}
                          onDelete={id => setDeleteConfirmId(id)}
                          onSelectTag={setSelectedTag}
                          onViewDetails={setSelectedIdea}
                          isFilteringOrSearching={true}
                          setHoveredDragId={setHoveredDragId}
                          isPinned={pinnedIds.includes(idea.id)}
                          onTogglePin={togglePin}
                          onAdvanceStatus={advanceStatus}
                          onToggleArchive={toggleArchived}
                          archived={isArchived(idea.id)}
                          selected={nav.isSelected(idea.id)}
                          onToggleSelect={nav.toggleSelect}
                          focused={nav.cursorId === idea.id}
                        />
                      </div>
                    ))}
                    {column.length === 0 && (
                      <p className="text-[10.5px] text-slate-700 font-semibold text-center py-5">
                        Drop here
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            {/* Pinned Section */}
            {pinnedIdeas.length > 0 && (
              <div className="mb-8 animate-in fade-in duration-300">
                <div className="flex items-center gap-2 mb-4">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pinned Concepts</h3>
                  <span className="px-2 py-0.5 text-[10px] bg-amber-400/10 text-amber-350 rounded-full font-bold border border-amber-400/20">{pinnedIdeas.length}</span>
                </div>
                <div className="columns-1 md:columns-2 xl:columns-3 gap-5">
                  {pinnedIdeas.map(idea => (
                    <div key={idea.id} data-nav-id={idea.id} className="break-inside-avoid mb-5">
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
                        onAdvanceStatus={advanceStatus}
                        onToggleArchive={toggleArchived}
                        archived={isArchived(idea.id)}
                        selected={nav.isSelected(idea.id)}
                        onToggleSelect={nav.toggleSelect}
                        focused={nav.cursorId === idea.id}
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
                    <Rocket size={14} className="text-slate-500" />
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Other Concepts</h3>
                  </div>
                )}
                <div className="columns-1 md:columns-2 xl:columns-3 gap-5">
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
                        onAdvanceStatus={advanceStatus}
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
        )}
      </div>

      <BulkBar
        count={nav.selectedIds.length}
        noun="concept"
        onClear={nav.clearSelection}
        actions={[
          { label: 'Building', icon: Rocket, onClick: () => bulkStage('building') },
          { label: 'Shipped', icon: CheckSquare, onClick: () => bulkStage('shipped') },
          { label: showArchived ? 'Restore' : 'Archive', icon: showArchived ? ArchiveRestore : Archive, onClick: bulkArchive },
          { label: 'Delete', icon: TrashBulk, danger: true, onClick: bulkDelete },
        ]}
      />

      {/* ═══ ADD / EDIT MODAL ═══ */}
      {isFormOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setIsFormOpen(false)}>
          <div className="modal-surface w-full max-w-xl max-h-[92vh] rounded-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* modal header */}
            <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-[15px] font-bold text-white">{editingIdea ? 'Edit Concept' : 'New Project Concept'}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{editingIdea ? 'Update your project concept details below' : 'Capture a secure project concept'}</p>
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
                <textarea rows={4} placeholder="Elaborate on your project concept…"
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
                    <Plus size={13} /> Add Image Reference
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
                    <Plus size={13} /> Add Link Reference
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
                  {editingIdea ? 'Save Changes' : 'Create Concept'}
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
                <h3 className="text-[14px] font-bold text-white">Delete Concept</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">This cannot be undone</p>
              </div>
            </div>
            <p className="text-[13px] text-slate-400 leading-relaxed">
              Are you sure you want to delete this project concept?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)}
                className="btn-ghost flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Keep It</button>
              <button onClick={() => handleDeleteConfirm(deleteConfirmId)}
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
  const images = idea.images || [];
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-black/60 border border-white/10 text-slate-350 hover:text-white flex items-center justify-center hover:bg-indigo-600/90 hover:border-indigo-500/30 hover:scale-105 active:scale-95 transition-all shadow-lg backdrop-blur-md cursor-pointer"
                  title="Next image"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
          </div>
        )}

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
                {idea.tags.map(tag => <span key={tag} className="tag-pill bg-indigo-500/15 border-indigo-500/20 text-indigo-300">#{tag}</span>)}
              </div>
            )}
          </div>
          <button onClick={handleClose} className="btn-ghost p-2 rounded-lg cursor-pointer"><X size={15} /></button>
        </div>

        {/* body */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          {idea.content && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Concept Notes</p>
              <div className="glass-panel rounded-xl p-4 text-[13px] text-slate-300 whitespace-pre-line leading-relaxed">
                {idea.content}
              </div>
            </div>
          )}

          {links.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Links</p>
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
                      <Globe size={13} className="text-slate-650 shrink-0" />
                      <span className="text-[12px] text-slate-600 truncate">{link.label || link.url || '—'}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

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

function IdeaCard({ idea, sortBy, onEdit, onDelete, onSelectTag, onViewDetails, isFilteringOrSearching, setHoveredDragId, isPinned, onTogglePin, onAdvanceStatus, onToggleArchive, archived, selected, onToggleSelect, focused }) {
  const status = PROJECT_STATUS[idea.status || 'backlog'] || PROJECT_STATUS.backlog;
  const images = idea.images || [];
  const links  = idea.links || [];

  const showDragHandle = sortBy === 'custom' && !isFilteringOrSearching;
  const primaryImage = images.find(img => img.is_primary) || images[0];

  return (
    <article
      onClick={() => onViewDetails && onViewDetails(idea)}
      style={focused ? { outline: '1px solid rgba(56,189,248,0.55)', outlineOffset: 2 } : undefined}
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
                  : 'text-slate-405 hover:text-amber-400 hover:bg-amber-400/[0.08] hover:border-amber-400/20'
              }`}
              title={isPinned ? "Unpin concept" : "Pin concept"}>
              <Star size={11} className={isPinned ? 'fill-amber-400' : ''} />
            </button>
            
            <div className="w-[1px] h-3 bg-white/[0.08] self-center" />

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

            <button onClick={() => onEdit(idea)}
              className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-indigo-500/[0.08] transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-indigo-500/20"
              title="Edit concept">
              <Edit3 size={11} />
            </button>
            
            <button onClick={() => onToggleSelect && onToggleSelect(idea.id)}
              className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center border border-transparent ${
                selected
                  ? 'text-sky-300 bg-sky-500/[0.14] border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] hover:border-white/[0.12]'
              }`}
              title={selected ? 'Deselect (x)' : 'Select for bulk actions (x)'}>
              {selected ? <CheckSquare size={11} /> : <Square size={11} />}
            </button>

            <button onClick={() => onToggleArchive && onToggleArchive(idea.id)}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-white/[0.06] transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-white/[0.12]"
              title={archived ? 'Restore from archive' : 'Archive this concept'}>
              {archived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
            </button>

            <button onClick={() => onDelete(idea.id)}
              className="p-1.5 text-slate-455 hover:text-rose-455 rounded-lg hover:bg-rose-500/[0.08] transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-rose-500/20"
              title="Delete concept">
              <Trash2 size={11} />
            </button>
          </div>
        </div>

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

        <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-white/[0.06]"
             onClick={e => e.stopPropagation()}
             onDragStart={e => e.stopPropagation()}>
          <button
            onClick={() => onAdvanceStatus && onAdvanceStatus(idea)}
            title="Click to move to the next stage"
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full cursor-pointer transition-all hover:brightness-125"
            style={{ background: status.bg, color: status.color, border: '1px solid ' + status.border }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.color }} />
            {status.label}
          </button>
          {(idea.tags || []).map(tag => (
            <button key={tag} onClick={() => onSelectTag(tag)} className="tag-pill cursor-pointer bg-indigo-500/15 border-indigo-500/20 text-indigo-300">#{tag}</button>
          ))}
        </div>
      </div>
    </article>
  );
}
