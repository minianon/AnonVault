import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search, CornerDownLeft, Plus, CalendarRange, Lightbulb,
  CheckSquare, Rocket, Quote, LayoutDashboard, BarChart3, ArrowRight
} from 'lucide-react';

/* Every section, so the palette doubles as navigation. */
const SECTIONS = [
  { tab: 'dashboard',     label: 'Dashboard',         icon: LayoutDashboard, accent: '#38bdf8' },
  { tab: 'tasks',         label: 'Daily Checklist',   icon: CheckSquare,     accent: '#38bdf8' },
  { tab: 'timeline',      label: 'Hackathon Timeline', icon: CalendarRange,  accent: '#34d399' },
  { tab: 'ideas',         label: 'Idea Vault',        icon: Lightbulb,       accent: '#fbbf24' },
  { tab: 'project-ideas', label: 'Project Ideas',     icon: Rocket,          accent: '#818cf8' },
  { tab: 'review',        label: 'Review',            icon: BarChart3,       accent: '#a78bfa' },
  { tab: 'quotes',        label: 'Quotes Vault',      icon: Quote,           accent: '#f472b6' },
];

const KIND_META = {
  task:     { icon: CheckSquare,   accent: '#38bdf8', label: 'Task'     },
  hackathon:{ icon: CalendarRange, accent: '#34d399', label: 'Hackathon'},
  idea:     { icon: Lightbulb,     accent: '#fbbf24', label: 'Idea'     },
  project:  { icon: Rocket,        accent: '#818cf8', label: 'Concept'  },
  quote:    { icon: Quote,         accent: '#f472b6', label: 'Quote'    },
  section:  { icon: ArrowRight,    accent: '#94a3b8', label: 'Go to'    },
  action:   { icon: Plus,          accent: '#34d399', label: 'Create'   },
};

const norm = v => (v || '').toString().toLowerCase();

export default function CommandPalette({
  open,
  onClose,
  tasks,
  applications,
  ideas,
  projectIdeas,
  quotes,
  setActiveTab,
  onSelectIdea,
  onSelectProject,
  onSelectHackathon,
  onQuickAddTask,
  onQuickAddIdea,
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Reset on each open so it never reopens mid-search.
  useEffect(() => {
    if (!open) return;
    // Deliberate reset so the palette never reopens mid-search.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery('');
    setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const results = useMemo(() => {
    const q = norm(query).trim();

    // With no query, offer the sections rather than dumping every record.
    if (!q) {
      return SECTIONS.map(s => ({
        kind: 'section', id: 'sec-' + s.tab, title: s.label, tab: s.tab,
      }));
    }

    const hit = (...fields) => fields.some(f => norm(f).includes(q));
    const out = [];

    for (const t of tasks || []) {
      if (t && hit(t.title)) {
        out.push({ kind: 'task', id: 't-' + t.id, title: t.title, tab: 'tasks',
          meta: t.is_recurring ? t.recurrence : 'one-off' });
      }
    }
    for (const a of applications || []) {
      if (a && hit(a.name, a.company, a.notes)) {
        out.push({ kind: 'hackathon', id: 'h-' + a.id, title: a.name, tab: 'timeline',
          meta: a.company || undefined, selectId: a.id });
      }
    }
    for (const i of ideas || []) {
      if (i && hit(i.title, i.content, (i.tags || []).join(' '))) {
        out.push({ kind: 'idea', id: 'i-' + i.id, title: i.title, tab: 'ideas',
          meta: (i.tags || [])[0], selectId: i.id });
      }
    }
    for (const p of projectIdeas || []) {
      if (p && hit(p.title, p.content, (p.tags || []).join(' '))) {
        out.push({ kind: 'project', id: 'p-' + p.id, title: p.title, tab: 'project-ideas',
          meta: p.status || undefined, selectId: p.id });
      }
    }
    for (const qt of quotes || []) {
      if (qt && hit(qt.text, qt.author, qt.category)) {
        out.push({ kind: 'quote', id: 'q-' + qt.id, title: qt.text, tab: 'quotes',
          meta: qt.author || undefined });
      }
    }
    for (const s of SECTIONS) {
      if (hit(s.label)) {
        out.push({ kind: 'section', id: 'sec-' + s.tab, title: s.label, tab: s.tab });
      }
    }

    // Capture actions last, so typing a search term never steals Enter from a
    // real match — but they are always reachable, which is the point: adding
    // something should not require navigating to its section first.
    out.push({ kind: 'action', id: 'new-task', title: `Add task “${query.trim()}”`, action: 'task' });
    out.push({ kind: 'action', id: 'new-idea', title: `Add idea “${query.trim()}”`, action: 'idea' });

    return out.slice(0, 40);
  }, [query, tasks, applications, ideas, projectIdeas, quotes]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCursor(0); }, [query]);

  const run = useCallback(item => {
    if (!item) return;
    if (item.kind === 'action') {
      if (item.action === 'task') onQuickAddTask?.(query.trim());
      if (item.action === 'idea') onQuickAddIdea?.(query.trim());
      onClose();
      return;
    }
    if (item.selectId) {
      if (item.kind === 'idea') onSelectIdea?.(item.selectId);
      else if (item.kind === 'project') onSelectProject?.(item.selectId);
      else if (item.kind === 'hackathon') onSelectHackathon?.(item.selectId);
      else setActiveTab(item.tab);
    } else {
      setActiveTab(item.tab);
    }
    onClose();
  }, [query, onClose, setActiveTab, onSelectIdea, onSelectProject, onSelectHackathon,
      onQuickAddTask, onQuickAddIdea]);

  const onKeyDown = e => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => (results.length ? (c + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => (results.length ? (c - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[cursor]);
    }
  };

  // Keep the cursor row in view when arrowing past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-row="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="modal-surface w-full max-w-xl rounded-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Query */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06]">
          <Search size={15} className="text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search everything, or type to add…"
            className="flex-1 bg-transparent border-none outline-none text-[14px] text-slate-100 placeholder:text-slate-600 font-medium"
          />
          <kbd className="text-[9.5px] font-bold text-slate-600 px-1.5 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5 custom-scrollbar">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-slate-600 font-medium">
              Nothing matches “{query}”.
            </p>
          ) : results.map((r, idx) => {
            const meta = KIND_META[r.kind];
            const Icon = meta.icon;
            const activeRow = idx === cursor;
            return (
              <button
                key={r.id}
                data-row={idx}
                onClick={() => run(r)}
                onMouseEnter={() => setCursor(idx)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors ${
                  activeRow ? 'bg-white/[0.055]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: meta.accent + '1c', border: '1px solid ' + meta.accent + '33' }}>
                  <Icon size={11} style={{ color: meta.accent }} />
                </div>
                <span className="flex-1 min-w-0 text-[13px] font-semibold text-slate-200 truncate">
                  {r.title}
                </span>
                {r.meta && (
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-700 shrink-0 hidden sm:inline">
                    {r.meta}
                  </span>
                )}
                <span className="text-[9.5px] font-bold uppercase tracking-wider shrink-0"
                  style={{ color: meta.accent + 'b0' }}>
                  {meta.label}
                </span>
                {activeRow && <CornerDownLeft size={11} className="text-slate-600 shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Hints */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-white/[0.06] text-[9.5px] font-bold uppercase tracking-wider text-slate-700">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1 py-0.5 rounded border border-white/[0.08] bg-white/[0.03]">↑↓</kbd> move
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1 py-0.5 rounded border border-white/[0.08] bg-white/[0.03]">↵</kbd> open
          </span>
          <span className="ml-auto text-slate-800">{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
