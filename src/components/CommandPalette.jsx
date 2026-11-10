import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search, CornerDownLeft, Plus, CalendarRange, Lightbulb, CheckSquare, KanbanSquare,
  ArrowRight, Play, Wallet, Square,
} from 'lucide-react';
import { NAV } from '../nav';
import { startSession, stopAll, sessions, isRunning } from '../services/focus';
import { transactions, formatMoney, ymd } from '../services/money';

const KIND_META = {
  task:      { icon: CheckSquare,   label: 'Task' },
  hackathon: { icon: CalendarRange, label: 'Hackathon' },
  idea:      { icon: Lightbulb,     label: 'Idea' },
  project:   { icon: KanbanSquare,  label: 'Board' },
  section:   { icon: ArrowRight,    label: 'Go to' },
  action:    { icon: Plus,          label: 'Create' },
  timer:     { icon: Play,          label: 'Focus' },
  stop:      { icon: Square,        label: 'Focus' },
  money:     { icon: Wallet,        label: 'Money' },
};

const norm = v => (v || '').toString().toLowerCase();

/* "250 lunch", "₹1,200 rent", "120.5 uber" → { amount, note } */
function parseExpense(q) {
  const m = q.trim().match(/^[₹$€£]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(.*)$/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, note: m[2].trim() };
}

export default function CommandPalette({
  open,
  onClose,
  tasks,
  applications,
  ideas,
  boardItems,
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
  const running = sessions.useAll().filter(isRunning);

  useEffect(() => {
    if (!open) return;
    // Deliberate reset so the palette never reopens mid-search.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery('');
    setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  const results = useMemo(() => {
    const raw = query.trim();
    const q = norm(raw);

    if (!q) {
      const out = [
        { kind: 'timer', id: 'hint-timer', title: 'Start a timer…', hint: true, group: 'Quick actions' },
        { kind: 'money', id: 'hint-money', title: 'Log an expense…', hint: true, group: 'Quick actions', sub: 'Type an amount, e.g. 250 lunch' },
      ];
      if (running.length) out.push({ kind: 'stop', id: 'stop-all', title: `Stop ${running.length} running timer${running.length === 1 ? '' : 's'}`, group: 'Quick actions' });
      NAV.forEach((s, i) => out.push({ kind: 'section', id: 'sec-' + s.id, title: s.label, tab: s.id, group: 'Navigate', shortcut: String(i + 1) }));
      return out;
    }

    const hit = (...fields) => fields.some(f => norm(f).includes(q));
    const out = [];
    const expense = parseExpense(raw);

    if (expense) {
      out.push({ kind: 'money', id: 'log-expense', group: 'Actions', expense,
        title: `Log expense ${formatMoney(expense.amount)}${expense.note ? ` · ${expense.note}` : ''}` });
    }

    for (const t of tasks || []) {
      if (t && hit(t.title)) out.push({ kind: 'task', id: 't-' + t.id, title: t.title, tab: 'tasks', group: 'Results', meta: t.is_recurring ? t.recurrence : 'today' });
    }
    for (const a of applications || []) {
      if (a && hit(a.name, a.company, a.notes)) out.push({ kind: 'hackathon', id: 'h-' + a.id, title: a.name, tab: 'timeline', group: 'Results', meta: a.company || undefined, selectId: a.id });
    }
    for (const p of boardItems || []) {
      if (p && hit(p.title, p.description, p.label)) out.push({ kind: 'project', id: 'b-' + p.id, title: p.title, tab: 'board', group: 'Results', meta: p.label || p.status });
    }
    for (const i of ideas || []) {
      if (i && hit(i.title, i.content, (i.tags || []).join(' '))) out.push({ kind: 'idea', id: 'i-' + i.id, title: i.title, tab: 'ideas', group: 'Results', meta: (i.tags || [])[0], selectId: i.id });
    }
    for (const s of NAV) {
      if (hit(s.label)) out.push({ kind: 'section', id: 'sec-' + s.id, title: s.label, tab: s.id, group: 'Navigate' });
    }

    // Create actions last, so a search term never steals Enter from a real match.
    if (!expense) out.push({ kind: 'timer', id: 'start-timer', title: `Start timer “${raw}”`, group: 'Actions' });
    out.push({ kind: 'action', id: 'new-task', title: `Add task “${raw}”`, action: 'task', group: 'Actions' });
    out.push({ kind: 'action', id: 'new-idea', title: `Save idea “${raw}”`, action: 'idea', group: 'Actions' });

    return out.slice(0, 40);
  }, [query, tasks, applications, ideas, boardItems, running.length]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCursor(0); }, [query]);

  const run = useCallback(item => {
    if (!item) return;
    const raw = query.trim();
    if (item.hint) {
      if (item.kind === 'money') setActiveTab('money');
      else { setActiveTab('focus'); }
      onClose();
      setTimeout(() => window.dispatchEvent(new CustomEvent('anonvault:new')), 60);
      return;
    }
    switch (item.kind) {
      case 'action':
        if (item.action === 'task') onQuickAddTask?.(raw);
        if (item.action === 'idea') onQuickAddIdea?.(raw);
        break;
      case 'timer':
        startSession({ label: raw });
        break;
      case 'stop':
        stopAll();
        break;
      case 'money':
        transactions.add({ type: 'expense', amount: item.expense.amount, category: 'other', note: item.expense.note, method: 'upi', date: ymd() });
        break;
      default:
        if (item.selectId) {
          if (item.kind === 'idea') onSelectIdea?.(item.selectId);
          else if (item.kind === 'project') onSelectProject?.(item.selectId);
          else if (item.kind === 'hackathon') onSelectHackathon?.(item.selectId);
          else setActiveTab(item.tab);
        } else setActiveTab(item.tab);
    }
    onClose();
  }, [query, onClose, setActiveTab, onSelectIdea, onSelectProject, onSelectHackathon, onQuickAddTask, onQuickAddIdea]);

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

  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  let lastGroup = null;
  return (
    <div className="modal-overlay fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[14vh]" onMouseDown={onClose}>
      <div className="modal-surface w-full max-w-[580px] rounded-xl flex flex-col overflow-hidden" onMouseDown={e => e.stopPropagation()}
        role="dialog" aria-label="Command palette">
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/[0.06]">
          <Search size={15} className="text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search, jump, or type “250 lunch” to log an expense…"
            className="flex-1 bg-transparent outline-none text-[14px] text-slate-100 placeholder:text-slate-500"
            aria-label="Command"
          />
          <span className="kbd">Esc</span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-slate-500">Nothing matches “{query}”.</p>
          ) : results.map((r, idx) => {
            const meta = KIND_META[r.kind];
            const Icon = meta.icon;
            const active = idx === cursor;
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <div key={r.id}>
                {header && <p className="px-2.5 pt-2.5 pb-1.5 text-[11.5px] font-medium text-slate-500">{header}</p>}
                <button
                  data-row={idx}
                  onClick={() => run(r)}
                  onMouseMove={() => cursor !== idx && setCursor(idx)}
                  className={`w-full flex items-center gap-3 px-2.5 h-10 rounded-lg text-left cursor-pointer ${active ? 'bg-white/[0.07]' : ''}`}>
                  <Icon size={15} className={active ? 'text-slate-200' : 'text-slate-500'} />
                  <span className="flex-1 min-w-0 text-[13.5px] text-slate-200 truncate">
                    {r.title}
                    {r.sub && <span className="text-slate-500 ml-2 text-[12.5px]">{r.sub}</span>}
                  </span>
                  {r.meta && <span className="text-[12px] text-slate-500 shrink-0 hidden sm:inline capitalize">{r.meta}</span>}
                  {r.shortcut ? <span className="kbd">{r.shortcut}</span>
                    : <span className="text-[12px] text-slate-600 shrink-0">{meta.label}</span>}
                  {active && <CornerDownLeft size={13} className="text-slate-500 shrink-0" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 h-10 border-t border-white/[0.06] text-[12px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> Navigate</span>
          <span className="flex items-center gap-1.5"><span className="kbd">↵</span> Open</span>
          <span className="ml-auto hidden sm:flex items-center gap-1.5"><span className="kbd">N</span> New in section</span>
        </div>
      </div>
    </div>
  );
}
