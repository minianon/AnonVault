import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search, CornerDownLeft, Plus, CalendarRange, Lightbulb, CheckSquare, KanbanSquare,
  ArrowRight, Play, Wallet, Square, Timer, Quote, CircleDollarSign, CalendarClock, TrendingUp, HandCoins,
} from 'lucide-react';
import { NAV } from '../nav';
import { startSession, stopAll, sessions, isRunning, durationMs, formatDuration } from '../services/focus';
import {
  transactions, formatMoney, ymd, categoryMeta, incomeSources, emis, investments, loans, incomeIdeas,
} from '../services/money';
import { quotes as quoteStore } from '../services/quotes';
import { getAllTasksSync } from '../services/tasks';
import { openCard } from '../utils/jump';
import { addItem } from '../services/board';
import { parseCapture, formatWhen } from '../services/nlp';

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
  card:      { icon: KanbanSquare,  label: 'Board' },
  session:   { icon: Timer,         label: 'Focus' },
  expense:   { icon: Wallet,        label: 'Money' },
  income:    { icon: CircleDollarSign, label: 'Money' },
  emi:       { icon: CalendarClock, label: 'EMI' },
  invest:    { icon: TrendingUp,    label: 'Investment' },
  loan:      { icon: HandCoins,     label: 'Lending' },
  quote:     { icon: Quote,         label: 'Quote' },
};

/* Bold the part of a result that matched, so it's clear why it's there. */
function Mark({ text, q }) {
  const t = String(text || '');
  const i = q ? t.toLowerCase().indexOf(q) : -1;
  if (i < 0) return t;
  return <>{t.slice(0, i)}<span className="text-slate-50 font-semibold">{t.slice(i, i + q.length)}</span>{t.slice(i + q.length)}</>;
}

const norm = v => (v || '').toString().toLowerCase();

/* "500 topmate", "₹2,000 trade nifty", "1500 colab" → { amount, note, category }
   for extra income. The kind comes from the words in the note. */
function parseIncome(q) {
  const m = q.trim().match(/^[₹$€£]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(.*)$/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const note = m[2].trim();
  const n = note.toLowerCase();
  const category = /\btrad(e|ing)\b|quotex|nifty|options|stock|crypto/.test(n) ? 'trade'
    : /topmate|mentor|session|call/.test(n) ? 'topmate'
    : /colab|collab|brand|sponsor/.test(n) ? 'colab' : 'other-in';
  return { amount, note, category };
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
  const allSessions = sessions.useAll();
  const running = allSessions.filter(isRunning);
  const txList = transactions.useAll();
  const sourceList = incomeSources.useAll();
  const emiList = emis.useAll();
  const investList = investments.useAll();
  const loanList = loans.useAll();
  const incomeIdeaList = incomeIdeas.useAll();
  const quoteList = quoteStore.useAll();

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
        { kind: 'money', id: 'hint-money', title: 'Log extra income…', hint: true, group: 'Quick actions', sub: 'Type an amount, e.g. 500 topmate' },
      ];
      if (running.length) out.push({ kind: 'stop', id: 'stop-all', title: `Stop ${running.length} running timer${running.length === 1 ? '' : 's'}`, group: 'Quick actions' });
      NAV.forEach((s, i) => out.push({ kind: 'section', id: 'sec-' + s.id, title: s.label, tab: s.id, group: 'Navigate', shortcut: i < 9 ? String(i + 1) : i === 9 ? '0' : null }));
      return out;
    }

    const hit = (...fields) => fields.some(f => norm(f).includes(q));
    const out = [];
    const expense = parseIncome(raw); // named for the old flow; it's extra income now

    if (expense) {
      out.push({ kind: 'money', id: 'log-income', group: 'Actions', expense,
        title: `Log extra income ${formatMoney(expense.amount)} · ${categoryMeta(expense.category).label}${expense.note ? ` · ${expense.note}` : ''}` });
    }

    // Everything you've stored, grouped by where it lives; a few per group.
    const PER = 5;
    const group = (name, rows) => { out.push(...rows.slice(0, PER).map(r => ({ ...r, group: name }))); };
    const day = d => (d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : undefined);

    group('Board', (boardItems || []).filter(p => p && hit(p.title, p.description, p.label))
      .map(p => ({ kind: 'project', id: 'b-' + p.id, title: p.title, cardId: p.id, meta: p.status === 'done' ? 'done' : p.due_date ? day(p.due_date) : p.label || p.status })));
    const allTasks = (() => { try { return getAllTasksSync(); } catch { return tasks || []; } })();
    group('Checklist', allTasks.filter(t => t && hit(t.title, (t.subtasks || []).map(x => x.title).join(' ')))
      .map(t => ({ kind: 'task', id: 't-' + t.id, title: t.title, tab: 'tasks', meta: t.is_recurring ? t.recurrence : t.date ? day(t.date) : undefined })));
    group('Hackathons', (applications || []).filter(a => a && hit(a.name, a.company, a.notes))
      .map(a => ({ kind: 'hackathon', id: 'h-' + a.id, title: a.name, tab: 'timeline', meta: a.company || undefined, selectId: a.id })));
    group('Ideas', [
      ...(ideas || []).filter(i => i && hit(i.title, i.content, (i.tags || []).join(' ')))
        .map(i => ({ kind: 'idea', id: 'i-' + i.id, title: i.title, tab: 'ideas', meta: (i.tags || [])[0], selectId: i.id })),
      ...incomeIdeaList.filter(i => hit(i.title, i.notes, i.note))
        .map(i => ({ kind: 'idea', id: 'ii-' + i.id, title: i.title, tab: 'ideas', meta: 'income idea', ideasTab: 'income' })),
    ]);
    // Focus: one row per activity, with the total time spent on it.
    const byLabel = new Map();
    for (const x of allSessions) {
      if (!hit(x.label, x.project, x.note)) continue;
      const cur = byLabel.get(x.label) || { ms: 0, n: 0, last: x };
      cur.ms += durationMs(x); cur.n += 1;
      byLabel.set(x.label, cur);
    }
    group('Focus', [...byLabel.entries()].map(([label, v]) => ({
      kind: 'session', id: 'f-' + label, title: label, tab: 'focus', restart: v.last,
      meta: `${formatDuration(v.ms)} · ${v.n} session${v.n === 1 ? '' : 's'}`,
    })));
    group('Money', [
      ...txList.filter(t => t.type === 'income' && hit(t.note, categoryMeta(t.category).label))
        .map(t => ({ kind: t.type === 'income' ? 'income' : 'expense', id: 'x-' + t.id, title: t.note || categoryMeta(t.category).label,
          sub: `${t.type === 'income' ? '+' : ''}${formatMoney(t.amount)}`, tab: 'money', moneyTab: 'overview', meta: day(t.date) })),
      ...sourceList.filter(x => hit(x.name, x.note)).map(x => ({ kind: 'income', id: 'src-' + x.id, title: x.name, tab: 'money', moneyTab: 'income', meta: 'income source' })),
      ...emiList.filter(x => hit(x.name, x.note)).map(x => ({ kind: 'emi', id: 'emi-' + x.id, title: x.name, sub: formatMoney(x.amount), tab: 'money', moneyTab: 'emi', meta: 'EMI' })),
      ...investList.filter(x => hit(x.name, x.note, x.kind)).map(x => ({ kind: 'invest', id: 'inv-' + x.id, title: x.name, tab: 'money', moneyTab: 'invest', meta: x.kind })),
      ...loanList.filter(x => hit(x.person, x.note)).map(x => ({ kind: 'loan', id: 'loan-' + x.id, title: x.person, sub: formatMoney(x.amount), tab: 'money', moneyTab: 'lending', meta: x.direction })),
    ]);
    group('Quotes', quoteList.filter(x => hit(x.text, x.author))
      .map(x => ({ kind: 'quote', id: 'q-' + x.id, title: x.text, tab: 'quotes', meta: x.author })));
    for (const s of NAV) {
      if (hit(s.label)) out.push({ kind: 'section', id: 'sec-' + s.id, title: s.label, tab: s.id, group: 'Navigate' });
    }

    // A date in the text ("call bank tomorrow 5pm") makes a reminder the
    // obvious intent, so it goes to the top; otherwise it waits with the others.
    const parsed = !expense ? parseCapture(raw) : null;
    const cardAction = parsed && {
      kind: 'card', id: 'new-card', group: parsed?.date ? 'Suggested' : 'Actions', parsed,
      title: `Add card “${parsed.title}”${parsed.date ? ` · ${formatWhen(parsed.date, parsed.time)}` : ''}${parsed.label ? ` · ${parsed.label}` : ''}`,
    };
    if (cardAction && parsed.date) out.unshift(cardAction);

    // Create actions last, so a search term never steals Enter from a real match.
    if (!expense) out.push({ kind: 'timer', id: 'start-timer', title: `Start timer “${raw}”`, group: 'Actions' });
    if (cardAction && !parsed.date) out.push(cardAction);
    out.push({ kind: 'action', id: 'new-task', title: `Add task “${raw}”`, action: 'task', group: 'Actions' });
    out.push({ kind: 'action', id: 'new-idea', title: `Save idea “${raw}”`, action: 'idea', group: 'Actions' });

    return out.slice(0, 40);
  }, [query, tasks, applications, ideas, boardItems, running.length, allSessions, txList, sourceList, emiList, investList, loanList, incomeIdeaList, quoteList]);

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
      case 'card': {
        const p = item.parsed;
        addItem({ title: p.title, label: p.label || '', priority: p.priority || 'medium', due_date: p.date, due_time: p.time });
        break;
      }
      case 'money':
        transactions.add({ type: 'income', amount: item.expense.amount, category: item.expense.category, note: item.expense.note, method: 'bank', date: ymd(), source_id: null });
        break;
      default:
        if (item.cardId) { openCard(item.cardId); break; }
        if (item.moneyTab) {
          setActiveTab('money');
          window.dispatchEvent(new CustomEvent('anonvault:money-tab', { detail: item.moneyTab }));
          break;
        }
        if (item.ideasTab) {
          setActiveTab('ideas');
          window.dispatchEvent(new CustomEvent('anonvault:ideas-tab', { detail: item.ideasTab }));
          break;
        }
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
            placeholder="Search everything, or type “250 lunch”, “call bank tomorrow 5pm”…"
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
                  <span className="flex-1 min-w-0 text-[13.5px] text-slate-300 truncate">
                    {r.group === 'Quick actions' || r.group === 'Actions' || r.group === 'Suggested' || r.group === 'Navigate'
                      ? <span className="text-slate-200">{r.title}</span> : <Mark text={r.title} q={norm(query.trim())} />}
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
