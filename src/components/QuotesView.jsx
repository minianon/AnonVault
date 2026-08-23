import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { 
  Search, Star, Plus, Edit3, Trash2, X, Lock, Menu, 
  Tag, Quote, Filter, Hash, ChevronDown, ChevronRight, ExternalLink, Calendar
} from 'lucide-react';

/* ─── Helpers ─── */
const formatDate = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Check if string is a valid URL
const isValidUrl = (str) => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

/* ── Custom Dropdown for Toolbar ── */
function CustomDropdown({ value, onChange, options, icon, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3.5 py-2 text-[12.5px] text-slate-350 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.12] rounded-xl transition-all flex items-center gap-2 cursor-pointer"
      >
        {icon}
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown size={11} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 min-w-[170px] bg-slate-950/98 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.85)] py-1.5 z-40 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 text-[12.5px] transition-all flex items-center justify-between border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.04] cursor-pointer ${
                value === opt.value 
                  ? 'text-rose-400 font-semibold bg-rose-500/[0.04]' 
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>{opt.label}</span>
              {value === opt.value && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN VIEW COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function QuotesView({
  ideas: quotes = [], onAdd, onUpdate, onDelete, loading, theme, onLock, showToast, onMenuToggle
}) {
  const [searchTerm, setSearchTerm]     = useState('');
  const [selectedTag, setSelectedTag]   = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isFormOpen, setIsFormOpen]     = useState(false);
  const [editingQuote, setEditingQuote] = useState(null);

  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      const saved = localStorage.getItem('anonvault_quotes_pinned');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [formStarred, setFormStarred] = useState(false);

  const togglePin = (id) => {
    setPinnedIds(prev => {
      const updated = prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id];
      localStorage.setItem('anonvault_quotes_pinned', JSON.stringify(updated));
      return updated;
    });
  };

  const [sortBy, setSortBy] = useState(() => localStorage.getItem('anonvault_quotes_sortby') || 'newest'); // 'newest', 'oldest'

  /* form fields */
  const [formText,        setFormText]        = useState('');
  const [formAuthor,      setFormAuthor]      = useState('');
  const [formCategory,    setFormCategory]    = useState('');
  const [formTags,        setFormTags]        = useState([]);   // Array of strings
  const [tagInputVal,     setTagInputVal]     = useState('');   // Active typed tag
  const [formSource,      setFormSource]      = useState('');

  /* modals */
  const [selectedQuote,   setSelectedQuote]   = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Auto save sorting preference
  useEffect(() => {
    localStorage.setItem('anonvault_quotes_sortby', sortBy);
  }, [sortBy]);

  /* ── helpers ── */
  const resetForm = () => {
    setFormText(''); setFormAuthor(''); 
    setFormCategory(''); setFormTags([]); setTagInputVal('');
    setFormSource('');
    setEditingQuote(null);
    setFormStarred(false);
  };

  const handleOpenAdd = () => { resetForm(); setIsFormOpen(true); };

  const handleOpenEdit = (q) => {
    setEditingQuote(q);
    setFormText(q.text || '');
    setFormAuthor(q.author || '');
    setFormCategory(q.category || '');
    setFormTags(q.tags || []);
    setTagInputVal('');
    setFormSource(q.source || '');
    setFormStarred(pinnedIds.includes(q.id));
    setIsFormOpen(true);
  };

  const handleDeleteClick = (id) => {
    setDeleteConfirmId(id);
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmId) {
      await onDelete(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const handleAddTag = () => {
    const trimmed = tagInputVal.trim().toLowerCase().replace(/#/g, '');
    if (trimmed && !formTags.includes(trimmed)) {
      setFormTags([...formTags, trimmed]);
    }
    setTagInputVal('');
  };

  const handleRemoveTag = (idxToRemove) => {
    setFormTags(formTags.filter((_, i) => i !== idxToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formText.trim()) {
      showToast?.('error', 'Text Required', 'Please enter the quote text.');
      return;
    }

    const quotePayload = {
      text: formText.trim(),
      author: formAuthor.trim(),
      category: editingQuote ? (editingQuote.category || '') : '',
      tags: formTags,
      source: editingQuote ? (editingQuote.source || '') : ''
    };

    try {
      if (editingQuote) {
        const updated = await onUpdate(editingQuote.id, quotePayload);
        // Handle pinned state
        setPinnedIds(prev => {
          const isCurrentlyPinned = prev.includes(editingQuote.id);
          let nextPinned = [...prev];
          if (formStarred && !isCurrentlyPinned) {
            nextPinned.push(editingQuote.id);
          } else if (!formStarred && isCurrentlyPinned) {
            nextPinned = nextPinned.filter(id => id !== editingQuote.id);
          }
          localStorage.setItem('anonvault_quotes_pinned', JSON.stringify(nextPinned));
          return nextPinned;
        });
        showToast?.('success', 'Quote Saved', 'The quote was updated successfully.');
      } else {
        const added = await onAdd(quotePayload);
        if (added && added.id && formStarred) {
          setPinnedIds(prev => {
            const nextPinned = [...prev, added.id];
            localStorage.setItem('anonvault_quotes_pinned', JSON.stringify(nextPinned));
            return nextPinned;
          });
        }
        showToast?.('success', 'Quote Added', 'Your quote has been saved.');
      }
      setIsFormOpen(false);
      resetForm();
    } catch (err) {
      console.error('Failed to save quote:', err);
      showToast?.('error', 'Operation Failed', 'Could not save the quote.');
    }
  };

  /* ── Get dropdown filter options ── */
  const allCategories = Array.from(new Set(quotes.map(q => q.category).filter(Boolean)));
  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...allCategories.map(cat => ({ value: cat, label: cat }))
  ];

  const allTags = Array.from(new Set(quotes.flatMap(q => q.tags || []).filter(Boolean)));
  const tagOptions = [
    { value: '', label: 'All Tags' },
    ...allTags.map(t => ({ value: t, label: `#${t}` }))
  ];

  const sortOptions = [
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' }
  ];

  /* ── Filter & Sort Logic ── */
  const getProcessedQuotes = () => {
    let result = [...quotes];

    // Search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(quote => 
        (quote.text || '').toLowerCase().includes(q) ||
        (quote.author || '').toLowerCase().includes(q) ||
        (quote.source || '').toLowerCase().includes(q)
      );
    }

    // Category filter
    if (selectedCategory) {
      result = result.filter(q => q.category === selectedCategory);
    }

    // Tag filter
    if (selectedTag) {
      result = result.filter(q => q.tags && q.tags.includes(selectedTag));
    }

    // Sorting
    result.sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return sortBy === 'oldest' ? dateA - dateB : dateB - dateA;
    });

    return result;
  };

  const processedQuotes = getProcessedQuotes();
  const pinnedQuotes = processedQuotes.filter(q => pinnedIds.includes(q.id));
  const regularQuotes = processedQuotes.filter(q => !pinnedIds.includes(q.id));

  /* FLIP layout transition animation */
  const prevRectsRef = useRef({});
  useLayoutEffect(() => {
    const elements = document.querySelectorAll('[data-flip-id]');
    const newRects = {};

    elements.forEach(el => {
      const id = el.getAttribute('data-flip-id');
      newRects[id] = el.getBoundingClientRect();
    });

    Object.keys(newRects).forEach(id => {
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
  }, [processedQuotes.map(q => q.id).join(',')]);

  return (
    <div className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ background: '#07060f' }}>
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
            <h2 className="text-[15px] lg:text-[17px] font-extrabold text-white tracking-tight leading-tight">Quotes Vault</h2>
            <p className="text-[10px] lg:text-[11px] text-slate-600 mt-0.5 font-medium">{quotes.length} quotes captured</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onLock} className="btn-ghost p-2.5 rounded-xl cursor-pointer flex items-center justify-center"
            title="Lock workspace">
            <Lock size={13} className="text-slate-500 hover:text-rose-455 transition-colors" />
          </button>
          <button onClick={handleOpenAdd} className="btn-primary flex items-center gap-2 px-4 py-2 text-[13px] font-bold rounded-xl cursor-pointer">
            <Plus size={14} />
            <span className="hidden sm:inline">New Quote</span>
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
            placeholder="Search quotes or authors…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input-premium w-full pl-9 pr-4 py-2 text-[13px] rounded-xl"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedCategory && (
            <div className="flex items-center shrink-0">
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
                <Filter size={9} /> {selectedCategory}
                <button onClick={() => setSelectedCategory('')} className="hover:text-white ml-0.5 cursor-pointer" title="Clear filter">
                  <X size={9} />
                </button>
              </span>
            </div>
          )}

          {selectedTag && (
            <div className="flex items-center shrink-0">
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
                <Hash size={9} /> {selectedTag}
                <button onClick={() => setSelectedTag('')} className="hover:text-white ml-0.5 cursor-pointer" title="Clear filter">
                  <X size={9} />
                </button>
              </span>
            </div>
          )}

          <CustomDropdown
            value={selectedCategory}
            onChange={setSelectedCategory}
            options={categoryOptions}
            icon={<Filter size={11} className="text-rose-400/85" />}
            placeholder="All Categories"
          />

          <CustomDropdown
            value={selectedTag}
            onChange={setSelectedTag}
            options={tagOptions}
            icon={<Tag size={11} className="text-rose-400/85" />}
            placeholder="All Tags"
          />

          <CustomDropdown
            value={sortBy}
            onChange={setSortBy}
            options={sortOptions}
            icon={<Calendar size={11} className="text-rose-400/85" />}
            placeholder="Newest"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-7 py-6 reveal-stagger">
        {loading ? (
          <div className="h-48 flex items-center justify-center gap-3 text-slate-500 text-sm">
            <span className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : processedQuotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
              <Quote size={24} className="text-slate-600 animate-pulse" />
            </div>
            <h3 className="text-sm font-semibold text-slate-300">No quotes yet</h3>
            <p className="text-[12px] text-slate-655 mt-1.5 leading-relaxed">
              {searchTerm || selectedTag || selectedCategory ? 'Try adjusting your search filters.' : 'Save your first inspiring quote.'}
            </p>
            {!searchTerm && !selectedTag && !selectedCategory && (
              <button onClick={handleOpenAdd} className="btn-primary mt-5 px-5 py-2 text-[13px] font-semibold rounded-xl cursor-pointer">
                Capture Quote
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* Pinned Section */}
            {pinnedQuotes.length > 0 && (
              <div className="mb-8 animate-in fade-in duration-300">
                <div className="flex items-center gap-2 mb-4">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pinned Quotes</h3>
                  <span className="px-2 py-0.5 text-[10px] bg-amber-400/10 text-amber-350 rounded-full font-bold border border-amber-400/20">{pinnedQuotes.length}</span>
                </div>
                <div className="columns-1 md:columns-2 xl:columns-3 gap-5">
                  {pinnedQuotes.map(quote => (
                    <div key={quote.id} className="break-inside-avoid mb-5">
                      <QuoteCard
                        quote={quote}
                        onEdit={handleOpenEdit}
                        onDelete={handleDeleteClick}
                        onSelectTag={setSelectedTag}
                        onViewDetails={setSelectedQuote}
                        isPinned={true}
                        onTogglePin={togglePin}
                      />
                    </div>
                  ))}
                </div>
                {regularQuotes.length > 0 && <div className="h-px bg-white/[0.04] my-8" />}
              </div>
            )}

            {/* Main Section */}
            {regularQuotes.length > 0 && (
              <>
                {pinnedQuotes.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <Quote size={13} className="text-slate-500" />
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Other Quotes</h3>
                  </div>
                )}
                <div className="columns-1 md:columns-2 xl:columns-3 gap-5">
                  {regularQuotes.map(quote => (
                    <div
                      key={quote.id}
                      data-flip-id={quote.id}
                      className="break-inside-avoid mb-5"
                    >
                      <QuoteCard
                        quote={quote}
                        onEdit={handleOpenEdit}
                        onDelete={handleDeleteClick}
                        onSelectTag={setSelectedTag}
                        onViewDetails={setSelectedQuote}
                        isPinned={false}
                        onTogglePin={togglePin}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── ADD / EDIT MODAL ── */}
      {isFormOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setIsFormOpen(false)}>
          <div className="modal-surface w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            {/* modal header */}
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-[15px] font-bold text-white">{editingQuote ? 'Edit Quote' : 'New Quote'}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormStarred(s => !s)}
                  className={`p-2 rounded-xl cursor-pointer transition-all duration-200 ${
                    formStarred
                      ? 'bg-amber-400/10 border border-amber-400/35 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.06)]'
                      : 'btn-ghost text-slate-550 hover:text-amber-400'
                  }`}
                  title={formStarred ? 'Pinned' : 'Pin to top'}
                >
                  <Star size={15} className={formStarred ? 'fill-amber-300' : ''} />
                </button>
                <button onClick={() => setIsFormOpen(false)} className="btn-ghost p-2 rounded-xl cursor-pointer"><X size={15} /></button>
              </div>
            </div>

            {/* modal body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Text */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quote Text *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Enter the quote..."
                  value={formText}
                  onChange={e => setFormText(e.target.value)}
                  className="input-premium w-full px-4 py-3 text-[13px] rounded-xl placeholder:text-slate-700 resize-none font-medium leading-relaxed italic"
                />
              </div>

              {/* Author */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Author</label>
                <input
                  type="text"
                  placeholder="e.g. Marcus Aurelius"
                  value={formAuthor}
                  onChange={e => setFormAuthor(e.target.value)}
                  className="input-premium w-full px-4 py-2.5 text-[13px] rounded-xl placeholder:text-slate-700 font-semibold"
                />
              </div>

              {/* Tag interface */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tags</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add tag and press Enter"
                    value={tagInputVal}
                    onChange={e => setTagInputVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                    className="input-premium flex-1 px-4 py-2.5 text-[13px] rounded-xl placeholder:text-slate-700 font-medium"
                  />
                  <button type="button" onClick={handleAddTag} className="btn-ghost border border-white/[0.08] px-4 rounded-xl text-[12.5px] font-semibold cursor-pointer">Add</button>
                </div>

                {formTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {formTags.map((tag, idx) => (
                      <span key={tag} className="tag-pill pr-1.5 pl-2.5 py-0.5 flex items-center gap-1.5 select-none bg-rose-500/10 border-rose-500/20 text-rose-350">
                        <span>#{tag}</span>
                        <button type="button" onClick={() => handleRemoveTag(idx)} className="hover:text-white cursor-pointer shrink-0">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer buttons */}
              <div className="pt-4 flex gap-3 border-t border-white/[0.04]">
                <button type="submit" className="btn-primary flex-1 py-2.5 text-[13px] font-bold rounded-xl cursor-pointer">
                  {editingQuote ? 'Save Changes' : 'Create Quote'}
                </button>
                <button type="button" onClick={() => setIsFormOpen(false)} className="btn-ghost px-5 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DETAIL MODAL ── */}
      {selectedQuote && (
        <QuoteDetailModal 
          quote={selectedQuote} 
          onClose={() => setSelectedQuote(null)} 
          onEdit={handleOpenEdit}
          isPinned={pinnedIds.includes(selectedQuote.id)}
          onTogglePin={togglePin}
        />
      )}

      {/* ── DELETE CONFIRMATION MODAL ── */}
      {deleteConfirmId && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal-surface w-full max-w-sm rounded-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0 border border-rose-500/20">
                <Trash2 size={16} />
              </div>
              <h3 className="text-sm font-bold text-white">Delete Quote?</h3>
            </div>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              Are you sure you want to permanently delete this quote? This action cannot be undone.
            </p>
            <div className="flex gap-2.5 pt-2">
              <button onClick={handleConfirmDelete} className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white text-[12.5px] font-bold rounded-xl transition-all cursor-pointer border border-transparent">
                Yes, Delete
              </button>
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-2 btn-ghost border border-white/[0.08] text-[12.5px] font-semibold rounded-xl cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Quote Card ───────────────────────────────────────── */
function QuoteCard({ quote, onEdit, onDelete, onSelectTag, onViewDetails, isPinned, onTogglePin }) {
  const tags = quote.tags || [];

  return (
    <article
      onClick={() => onViewDetails && onViewDetails(quote)}
      className={`glass-card rounded-2xl !overflow-visible cursor-pointer select-none group tactile-item relative ${
        isPinned ? 'premium-starred-card' : ''
      }`}
    >
      {/* Absolute hover actions strip */}
      <div className="absolute top-3.5 right-3.5 flex items-center gap-0.5 bg-slate-950/80 backdrop-blur border border-white/[0.07] rounded-xl p-0.5 shrink-0 select-none
                      opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100
                      transition-all duration-200 ease-out z-10"
           onClick={e => e.stopPropagation()}>
        {/* pin toggle button */}
        <button onClick={(e) => { e.stopPropagation(); onTogglePin(quote.id); }}
          className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center border border-transparent ${
            isPinned 
              ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/[0.08] hover:border-amber-400/20' 
              : 'text-slate-400 hover:text-amber-400 hover:bg-amber-400/[0.08] hover:border-amber-400/20'
          }`}
          title={isPinned ? "Unpin quote" : "Pin quote"}>
          <Star size={11} className={isPinned ? 'fill-amber-400' : ''} />
        </button>
        
        <div className="w-[1px] h-3 bg-white/[0.08] self-center" />

        <button onClick={(e) => { e.stopPropagation(); onEdit(quote); }}
          className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-indigo-500/[0.08] transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-indigo-500/20"
          title="Edit quote">
          <Edit3 size={11} />
        </button>
        
        <button onClick={(e) => { e.stopPropagation(); onDelete(quote.id); }}
          className="p-1.5 text-slate-455 hover:text-rose-455 rounded-lg hover:bg-rose-500/[0.08] transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-rose-500/20"
          title="Delete quote">
          <Trash2 size={11} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Quote category */}
        {quote.category && quote.category !== 'Inspiration' && (
          <div className="flex items-start">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 bg-white/[0.03] border border-white/[0.05] rounded-lg px-2 py-0.5">
              {quote.category}
            </span>
          </div>
        )}

        {/* Quote Text */}
        <div className="relative">
          <Quote className="absolute -top-3.5 -left-3.5 w-6 h-6 text-white/[0.03] rotate-180 pointer-events-none" />
          <p className="text-[13px] font-medium text-slate-100 italic leading-relaxed whitespace-pre-wrap break-words pl-1">
            "{quote.text}"
          </p>
        </div>

        {/* Author & Source */}
        {((quote.author && quote.author !== 'Unknown') || quote.source) && (
          <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[11px]">
            {quote.author && quote.author !== 'Unknown' ? (
              <span className="font-bold text-rose-350 truncate pr-2">— {quote.author}</span>
            ) : <div />}
            {quote.source && (
              isValidUrl(quote.source) ? (
                <a href={quote.source} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                   className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-indigo-400 transition-colors">
                  <span>Link</span> <ExternalLink size={9} />
                </a>
              ) : (
                <span className="text-[10px] text-slate-600 truncate max-w-[120px] font-medium italic">{quote.source}</span>
              )
            )}
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/[0.04]"
               onClick={e => e.stopPropagation()}>
            {tags.map(tag => (
              <button key={tag} onClick={() => onSelectTag(tag)} className="tag-pill cursor-pointer bg-rose-500/10 border-rose-500/15 text-rose-350 hover:bg-rose-500/15 hover:text-rose-300">#{tag}</button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/* ─── Quote Detail Modal ───────────────────────────────── */
function QuoteDetailModal({ quote, onClose, onEdit, isPinned, onTogglePin }) {
  const [isClosing, setIsClosing] = useState(false);
  const tags = quote.tags || [];

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  };

  return (
    <div className={`modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`modal-surface w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[90vh] ${isClosing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div>
            {quote.category && quote.category !== 'Inspiration' && (
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 bg-white/[0.03] border border-white/[0.05] rounded-lg px-2 py-0.5">
                {quote.category}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTogglePin(quote.id)}
              className={`p-2 rounded-xl cursor-pointer transition-all duration-200 ${
                isPinned 
                  ? 'bg-amber-400/10 border border-amber-400/35 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.06)]' 
                  : 'btn-ghost text-slate-550 hover:text-amber-400'
              }`}
              title={isPinned ? 'Starred / Pinned' : 'Star / Pin to top'}
            >
              <Star size={15} className={isPinned ? 'fill-amber-300' : ''} />
            </button>
            <button onClick={handleClose} className="btn-ghost p-2 rounded-xl cursor-pointer"><X size={15} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          <div className="relative py-2 pl-4 border-l-2 border-rose-500/30">
            <Quote className="absolute -top-3.5 -left-3.5 w-8 h-8 text-white/[0.02] rotate-180 pointer-events-none" />
            <p className="text-[15px] font-semibold text-white italic leading-relaxed whitespace-pre-wrap break-words">
              "{quote.text}"
            </p>
          </div>

          {((quote.author && quote.author !== 'Unknown') || quote.source) && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/[0.04] text-[12px]">
              {quote.author && quote.author !== 'Unknown' && (
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Author</span>
                  <p className="font-extrabold text-rose-350">{quote.author}</p>
                </div>
              )}

              {quote.source && (
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Source / Reference</span>
                  <div>
                    {isValidUrl(quote.source) ? (
                      <a href={quote.source} target="_blank" rel="noreferrer"
                         className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-bold hover:underline">
                        <span>External Link</span> <ExternalLink size={10} />
                      </a>
                    ) : (
                      <p className="font-semibold text-slate-300 italic">{quote.source}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-white/[0.04]">
              <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Tags</span>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <span key={tag} className="tag-pill bg-rose-500/10 border-rose-500/20 text-rose-350">#{tag}</span>
                ))}
              </div>
            </div>
          )}

          {quote.created_at && (
            <div className="pt-2 text-[10px] text-slate-655 font-bold tracking-wide">
              Captured {formatDate(quote.created_at)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.04] flex gap-3 shrink-0">
          <button onClick={() => { onEdit(quote); onClose(); }} className="btn-primary flex-1 py-2.5 text-[13px] font-bold rounded-xl cursor-pointer">Edit</button>
          <button onClick={handleClose} className="btn-ghost py-2.5 px-5 text-[13px] font-semibold rounded-xl cursor-pointer">Close</button>
        </div>
      </div>
    </div>
  );
}
