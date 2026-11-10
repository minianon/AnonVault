import { useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarRange, KanbanSquare, CalendarClock, CircleDollarSign, CheckSquare,
  Plus, Check, ArrowUpRight, Timer,
} from 'lucide-react';
import { board, addItem, moveItem, dueInfo } from '../services/board';
import { emis, emiStats, payEmi, transactions, incomeSources, formatMoney, useMoneySettings, monthLabel, shiftMonth } from '../services/money';
import { sessions, totalForDay, formatDuration, useFocusGoal } from '../services/focus';
import { getAllTasksSync } from '../services/tasks';
import { parseCapture, ymdOf } from '../services/nlp';
import { addToChecklist } from '../utils/jump';
import { PageHeader, Card, Empty, Segmented } from './ui';

const KINDS = {
  hackathon: { label: 'Deadlines', color: '#f0b445', icon: CalendarRange },
  card:      { label: 'Board',     color: '#6c96ff', icon: KanbanSquare },
  emi:       { label: 'EMIs',      color: '#f5768a', icon: CalendarClock },
  income:    { label: 'Income',    color: '#4fd1a0', icon: CircleDollarSign },
  task:      { label: 'Checklist', color: '#a1a1aa', icon: CheckSquare },
};
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function mondayOf(d) { return addDays(d, -((d.getDay() + 6) % 7)); }

function monthGrid(key) {
  const [y, m] = key.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const start = new Date(y, m - 1, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export default function CalendarView({ applications = [], tasksVersion, setActiveTab, onSelectHackathon, onLock, onMenuToggle, showToast }) {
  const today = ymdOf(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [hidden, setHidden] = useState(() => new Set());
  const [draft, setDraft] = useState('');
  const [addAs, setAddAs] = useState('card');
  const [view, setView] = useState(() => localStorage.getItem('anonvault_calendar_view') || 'month');
  const [weekStart, setWeekStart] = useState(() => ymdOf(mondayOf(new Date())));
  const [dragId, setDragId] = useState(null);
  const [dropKey, setDropKey] = useState(null);
  const goal = useFocusGoal();

  const cards = board.useAll();
  const emiList = emis.useAll();
  const tx = transactions.useAll();
  const sourceList = incomeSources.useAll();
  const focusList = sessions.useAll();
  const settings = useMoneySettings();
  const fmt = n => formatMoney(n, settings.currency);

  const days = useMemo(() => (view === 'week'
    ? Array.from({ length: 7 }, (_, i) => addDays(new Date(weekStart + 'T00:00:00'), i))
    : monthGrid(month)), [view, weekStart, month]);
  const rangeFrom = ymdOf(days[0]);
  const rangeTo = ymdOf(days[days.length - 1]);

  // Focus time per visible day, drawn as a thin bar against the daily goal.
  const focusByDay = useMemo(() => new Map(days.map(d => [ymdOf(d), totalForDay(focusList, d)])), [days, focusList]);

  /* every event in the visible 6 weeks, grouped by date */
  const byDate = useMemo(() => {
    const map = new Map();
    const push = (date, ev) => {
      if (!date || date < rangeFrom || date > rangeTo) return;
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(ev);
    };

    for (const a of applications) {
      if (!a?.deadline || a.status === 'rejected') continue;
      const d = new Date(a.deadline);
      push(ymdOf(d), { kind: 'hackathon', id: a.id, title: a.name, sub: a.company || '', time: a.deadline.includes('T') ? d.toTimeString().slice(0, 5) : null });
    }
    for (const c of cards) {
      if (!c.due_date) continue;
      push(c.due_date, { kind: 'card', id: c.id, title: c.title, sub: c.label || '', time: c.due_time || null, done: c.status === 'done', overdue: dueInfo(c)?.tone === 'bad', item: c });
    }
    for (const e of emiList) {
      if (e.closed) continue;
      const st = emiStats(e);
      const start = e.start_month || rangeFrom.slice(0, 7);
      for (let m = rangeFrom.slice(0, 7); m <= rangeTo.slice(0, 7); m = shiftMonth(m, 1)) {
        if (m < start) continue;
        if (!st.endless && st.endMonth && m > st.endMonth && !(e.payments || []).includes(m)) continue;
        const dim = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
        const day = Math.min(Number(e.due_day) || 1, dim);
        const paid = (e.payments || []).includes(m);
        if (m < today.slice(0, 7) && !paid) continue; // past months: only show what was ticked here
        push(`${m}-${String(day).padStart(2, '0')}`, { kind: 'emi', id: e.id + m, title: e.name, sub: fmt(st.amount), done: paid, emi: e, month: m });
      }
    }
    const sourceIds = new Set(sourceList.map(s => s.id));
    for (const t of tx) {
      if (t.type !== 'income') continue;
      if (t.source_id && !sourceIds.has(t.source_id)) continue; // tick left behind by a deleted source
      push(t.date, { kind: 'income', id: t.id, title: t.note || 'Income', sub: '+' + fmt(t.amount) });
    }
    for (const t of getAllTasksSync()) {
      if (t.is_recurring || !t.date) continue;
      push(t.date, { kind: 'task', id: t.id, title: t.title, done: !!t.completed });
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.time || '99').localeCompare(b.time || '99'));
    }
    return map;
    // tasksVersion re-reads the checklist cache after edits elsewhere
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, cards, emiList, tx, sourceList, rangeFrom, rangeTo, tasksVersion, settings.currency, today]);

  const visible = date => (byDate.get(date) || []).filter(e => !hidden.has(e.kind));
  const dayEvents = visible(selected);
  const selDate = new Date(selected + 'T00:00:00');
  const focusMs = totalForDay(focusList, selDate);
  const spent = tx.filter(t => t.type !== 'income' && t.date === selected).reduce((s, t) => s + Number(t.amount || 0), 0);

  // header counts for the month (or week) on screen
  const inMonth = [...byDate.entries()].filter(([d]) => (view === 'week' ? d >= rangeFrom && d <= rangeTo : d.startsWith(month))).flatMap(([, l]) => l);
  const count = k => inMonth.filter(e => e.kind === k && !e.done).length;

  const go = d => { setMonth(d.slice(0, 7)); setWeekStart(ymdOf(mondayOf(new Date(d + 'T00:00:00')))); setSelected(d); };
  const changeView = v => {
    setView(v);
    try { localStorage.setItem('anonvault_calendar_view', v); } catch { /* fine */ }
    go(selected);
  };
  const step = n => {
    if (view === 'week') {
      const ws = addDays(new Date(weekStart + 'T00:00:00'), n * 7);
      setWeekStart(ymdOf(ws));
      setMonth(ymdOf(ws).slice(0, 7));
      setSelected(ymdOf(ws));
    } else setMonth(m => shiftMonth(m, n));
  };
  const navLabel = view === 'week'
    ? (() => {
        const a = days[0], b = days[6];
        return `${a.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString(undefined, a.getMonth() === b.getMonth() ? { day: 'numeric' } : { day: 'numeric', month: 'short' })}`;
      })()
    : null;

  /* Drag a Board card onto another day to move its due date. */
  const reschedule = (id, key) => {
    const c = cards.find(x => x.id === id);
    if (!c || c.due_date === key) return;
    const prev = c.due_date;
    board.update(id, { due_date: key });
    showToast?.('success', `Moved to ${new Date(key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`, c.title, 6000,
      { label: 'Undo', onClick: () => board.update(id, { due_date: prev }) });
  };
  const dragProps = ev => (ev.kind === 'card' && !ev.done ? {
    draggable: true,
    onDragStart: e => { e.dataTransfer.setData('text/plain', ev.id); e.dataTransfer.effectAllowed = 'move'; setDragId(ev.id); },
    onDragEnd: () => { setDragId(null); setDropKey(null); },
  } : {});
  const dropProps = key => ({
    onDragOver: e => { if (!dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropKey !== key) setDropKey(key); },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropKey(k => (k === key ? null : k)); },
    onDrop: e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || dragId; setDragId(null); setDropKey(null); if (id) reschedule(id, key); },
  });

  const toggleKind = k => setHidden(h => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const addOnDay = e => {
    e.preventDefault();
    if (!draft.trim()) return;
    const p = parseCapture(draft);
    if (addAs === 'task') {
      addToChecklist(p.title, p.date || selected);
      setDraft('');
      if (p.date && p.date !== selected) go(p.date);
      return;
    }
    const it = addItem({ title: p.title, label: p.label || '', priority: p.priority || 'medium', due_date: p.date || selected, due_time: p.time });
    if (it) { setDraft(''); showToast?.('success', 'Card added', it.title); if (p.date && p.date !== selected) go(p.date); }
  };

  const openEvent = ev => {
    if (ev.kind === 'card') { setActiveTab('board'); setTimeout(() => window.dispatchEvent(new CustomEvent('anonvault:open-card', { detail: ev.id })), 60); }
    else if (ev.kind === 'hackathon') onSelectHackathon?.(ev.id);
    else if (ev.kind === 'emi') { setActiveTab('money'); window.dispatchEvent(new CustomEvent('anonvault:money-tab', { detail: 'emi' })); }
    else if (ev.kind === 'income') { setActiveTab('money'); window.dispatchEvent(new CustomEvent('anonvault:money-tab', { detail: 'overview' })); }
    else if (ev.kind === 'task') setActiveTab('tasks');
  };

  const quickDone = ev => {
    if (ev.kind === 'card') {
      const prev = ev.item.status;
      moveItem(ev.id, 'done');
      showToast?.('success', 'Done', ev.title, 5000, { label: 'Undo', onClick: () => moveItem(ev.id, prev) });
    } else if (ev.kind === 'emi') {
      const r = payEmi(ev.emi);
      showToast?.('success', `${monthLabel(r.month, { month: 'short' })} EMI paid`, ev.title, 6000, { label: 'Undo', onClick: r.undo });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Calendar"
        stats={[
          { value: count('hackathon'), label: 'deadlines', tone: 'warn' },
          { value: count('card'), label: 'cards due' },
          { value: count('emi'), label: 'EMIs left', tone: 'bad' },
        ]}
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={<>
          <div className="hidden sm:block">
            <Segmented size="sm" value={view} onChange={changeView}
              options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} />
          </div>
          <div className="flex items-center rounded-lg border border-white/[0.08] h-8">
            <button onClick={() => step(-1)} className="icon-btn !h-full !rounded-r-none" aria-label={`Previous ${view}`}><ChevronLeft size={14} /></button>
            <span className="px-1.5 sm:px-2 text-[12.5px] text-slate-200 font-medium whitespace-nowrap min-w-[64px] sm:min-w-[110px] text-center tabular-nums">
              {view === 'week' ? navLabel : <>
                <span className="sm:hidden">{monthLabel(month, { month: 'short' })}</span>
                <span className="hidden sm:inline">{monthLabel(month)}</span>
              </>}
            </span>
            <button onClick={() => step(1)} className="icon-btn !h-full !rounded-l-none" aria-label={`Next ${view}`}><ChevronRight size={14} /></button>
          </div>
          <button onClick={() => go(today)} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Today</button>
        </>} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1300px] mx-auto px-3 sm:px-4 lg:px-6 py-5 space-y-4">
          {/* legend / filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="sm:hidden w-full mb-1">
              <Segmented size="sm" value={view} onChange={changeView}
                options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} />
            </div>
            {Object.entries(KINDS).map(([k, v]) => {
              const on = !hidden.has(k);
              return (
                <button key={k} onClick={() => toggleKind(k)}
                  className={`h-7 px-2.5 rounded-md text-[12px] border inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    on ? 'border-white/[0.1] text-slate-200 bg-white/[0.04]' : 'border-white/[0.05] text-slate-600 line-through'}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: on ? v.color : '#46464e' }} />{v.label}
                </button>
              );
            })}
            <span className="hidden md:inline ml-auto text-[12px] text-slate-600">Drag a Board card to another day to move it</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
            {/* month grid / week columns */}
            <div className="panel overflow-hidden min-w-0">
              <div className={`grid grid-cols-7 border-b border-white/[0.06] ${view === 'week' ? 'hidden sm:grid' : ''}`}>
                {days.slice(0, 7).map((d, i) => {
                  const key = ymdOf(d);
                  return view === 'week' ? (
                    <button key={key} onClick={() => setSelected(key)}
                      className={`h-12 flex flex-col items-center justify-center cursor-pointer ${key === selected ? 'bg-white/[0.04]' : ''}`}>
                      <span className="text-[11.5px] text-slate-500">{WEEK[i]}</span>
                      <span className={`text-[13px] tabular-nums font-medium inline-flex items-center justify-center min-w-6 h-6 px-1 rounded-full ${key === today ? 'bg-slate-100 text-slate-950' : 'text-slate-200'}`}>{d.getDate()}</span>
                    </button>
                  ) : (
                    <div key={WEEK[i]} className="h-8 flex items-center justify-center text-[11.5px] text-slate-500">{WEEK[i]}</div>
                  );
                })}
              </div>

              {view === 'month' ? (
                <div className="grid grid-cols-7">
                  {days.map((d, i) => {
                    const key = ymdOf(d);
                    const inM = key.startsWith(month);
                    const evs = visible(key);
                    const isToday = key === today;
                    const isSel = key === selected;
                    const weekend = i % 7 >= 5;
                    const ms = focusByDay.get(key) || 0;
                    const isDrop = dropKey === key;
                    return (
                      <div key={key} role="button" tabIndex={0} onClick={() => setSelected(key)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(key); } }}
                        {...dropProps(key)}
                        className={`relative text-left min-h-[56px] sm:min-h-[96px] p-1 sm:p-1.5 pb-2 sm:pb-2.5 border-white/[0.05] cursor-pointer transition-colors outline-none focus-visible:bg-white/[0.05]
                          ${i % 7 !== 6 ? 'border-r' : ''} ${i < 35 ? 'border-b' : ''}
                          ${isDrop ? 'bg-[var(--accent)]/[0.12] ring-1 ring-inset ring-[var(--accent)]/50' : isSel ? 'bg-white/[0.06]' : weekend ? 'bg-white/[0.012] hover:bg-white/[0.035]' : 'hover:bg-white/[0.03]'}`}>
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] tabular-nums
                          ${isToday ? 'bg-slate-100 text-slate-950 font-semibold' : inM ? 'text-slate-300' : 'text-slate-600'}`}>
                          {d.getDate()}
                        </span>
                        {/* desktop: chips */}
                        <div className="hidden sm:block space-y-0.5 mt-0.5">
                          {evs.slice(0, 3).map(ev => (
                            <div key={ev.kind + ev.id} {...dragProps(ev)}
                              className={`flex items-center gap-1 h-[18px] px-1 rounded text-[11px] truncate ${ev.done ? 'opacity-45 line-through' : ''} ${ev.kind === 'card' && !ev.done ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === ev.id ? 'opacity-30' : ''}`}
                              style={{ background: KINDS[ev.kind].color + '1f', color: ev.overdue ? '#f9909f' : '#e4e4e7' }}>
                              <span className="w-1 h-1 rounded-full shrink-0" style={{ background: KINDS[ev.kind].color }} />
                              <span className="truncate">{ev.title}</span>
                            </div>
                          ))}
                          {evs.length > 3 && <div className="text-[10.5px] text-slate-500 px-1">+{evs.length - 3} more</div>}
                        </div>
                        {/* phone: dots */}
                        <div className="sm:hidden flex flex-wrap gap-0.5 mt-0.5 px-0.5">
                          {evs.slice(0, 4).map(ev => (
                            <span key={ev.kind + ev.id} className="w-1.5 h-1.5 rounded-full" style={{ background: KINDS[ev.kind].color, opacity: ev.done ? 0.4 : 1 }} />
                          ))}
                        </div>
                        {/* focus time, against the daily goal */}
                        {ms > 0 && (
                          <span className="absolute left-1.5 right-1.5 bottom-1 h-[3px] rounded-full bg-white/[0.05] overflow-hidden" title={`${formatDuration(ms)} focused`}>
                            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (ms / (goal * 60000)) * 100)}%`, background: ms >= goal * 60000 ? 'var(--ok)' : 'rgba(255,255,255,0.45)' }} />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-7">
                  {days.map((d, i) => {
                    const key = ymdOf(d);
                    const evs = visible(key);
                    const isSel = key === selected;
                    const ms = focusByDay.get(key) || 0;
                    const isDrop = dropKey === key;
                    return (
                      <div key={key} role="button" tabIndex={0} onClick={() => setSelected(key)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(key); } }}
                        {...dropProps(key)}
                        className={`flex flex-col min-w-0 p-1.5 cursor-pointer transition-colors outline-none border-white/[0.05] sm:min-h-[440px]
                          ${i < 6 ? 'border-b sm:border-b-0 sm:border-r' : ''}
                          ${isDrop ? 'bg-[var(--accent)]/[0.12] ring-1 ring-inset ring-[var(--accent)]/50' : isSel ? 'bg-white/[0.04]' : i >= 5 ? 'bg-white/[0.012] hover:bg-white/[0.03]' : 'hover:bg-white/[0.025]'}`}>
                        {/* phone: day label row (desktop has the header above) */}
                        <div className="sm:hidden flex items-center gap-2 px-1 py-1">
                          <span className={`text-[12.5px] font-medium ${key === today ? 'text-slate-50' : 'text-slate-300'}`}>
                            {WEEK[i]} {d.getDate()}{key === today && <span className="ml-1.5 text-[11px] text-slate-500 font-normal">Today</span>}
                          </span>
                        </div>
                        {/* focus for the day */}
                        <div className="flex items-center gap-1.5 px-1 h-5 mb-1" title={ms ? `${formatDuration(ms)} focused` : 'No focus time'}>
                          <span className="flex-1 h-[3px] rounded-full bg-white/[0.05] overflow-hidden">
                            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (ms / (goal * 60000)) * 100)}%`, background: ms >= goal * 60000 ? 'var(--ok)' : 'rgba(255,255,255,0.45)' }} />
                          </span>
                          <span className="text-[10.5px] text-slate-500 tabular-nums shrink-0">{ms ? formatDuration(ms) : ''}</span>
                        </div>
                        <div className="space-y-1 flex-1">
                          {evs.map(ev => (
                            <div key={ev.kind + ev.id} {...dragProps(ev)}
                              onClick={e => { e.stopPropagation(); openEvent(ev); }}
                              title={ev.kind === 'card' && !ev.done ? 'Click to open · drag to another day' : 'Open'}
                              className={`px-1.5 py-1 rounded-md text-[11.5px] leading-snug border-l-2 transition-colors hover:brightness-125
                                ${ev.done ? 'opacity-45 line-through' : ''} ${ev.kind === 'card' && !ev.done ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${dragId === ev.id ? 'opacity-30' : ''}`}
                              style={{ background: KINDS[ev.kind].color + '17', borderColor: KINDS[ev.kind].color, color: ev.overdue ? '#f9909f' : '#e4e4e7' }}>
                              <span className="block truncate">{ev.title}</span>
                              {(ev.time || ev.sub) && <span className="block text-[10.5px] text-slate-500 truncate">{[ev.time, ev.sub].filter(Boolean).join(' · ')}</span>}
                            </div>
                          ))}
                          {evs.length === 0 && <div className="hidden sm:block h-full min-h-[40px]" />}
                          {evs.length === 0 && <p className="sm:hidden px-1 pb-1 text-[11.5px] text-slate-600">Nothing</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* day agenda */}
            <Card className="lg:sticky lg:top-0 min-w-0">
              <div className="px-4 pt-3.5 pb-3 border-b border-white/[0.06]">
                <p className="text-[15px] font-semibold text-slate-100">
                  {selected === today ? 'Today' : selDate.toLocaleDateString(undefined, { weekday: 'long' })}
                </p>
                <p className="text-[12.5px] text-slate-500">{selDate.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                {(focusMs > 0 || spent > 0) && (
                  <div className="flex gap-3 mt-2 text-[12px] text-slate-400">
                    {focusMs > 0 && <span className="inline-flex items-center gap-1"><Timer size={12} className="text-slate-500" />{formatDuration(focusMs)} focused</span>}
                    {spent > 0 && <span className="inline-flex items-center gap-1"><ArrowUpRight size={12} className="text-slate-500" />{fmt(spent)} spent</span>}
                  </div>
                )}
              </div>

              <form onSubmit={addOnDay} className="px-3 pt-3">
                <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-dashed border-white/[0.1] focus-within:border-white/[0.2] focus-within:border-solid transition-colors">
                  <Plus size={14} className="text-slate-500" />
                  <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={addAs === 'task' ? 'Add a task on this day…' : 'Add a card on this day…'}
                    className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 outline-none" />
                  <div className="flex items-center p-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] shrink-0" role="radiogroup" aria-label="Add as">
                    {[['card', 'Card'], ['task', 'Task']].map(([v, l]) => (
                      <button key={v} type="button" role="radio" aria-checked={addAs === v} onClick={() => setAddAs(v)}
                        className={`h-5 px-1.5 rounded text-[11px] cursor-pointer transition-colors ${addAs === v ? 'bg-white/[0.1] text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>{l}</button>
                    ))}
                  </div>
                </div>
              </form>

              {dayEvents.length === 0 ? (
                <Empty icon={CalendarRange} title="Nothing on this day" body="Board cards with a due date, hackathon deadlines, EMIs and income all show up here." />
              ) : (
                <ul className="p-2">
                  {dayEvents.map(ev => {
                    const K = KINDS[ev.kind];
                    const canTick = (ev.kind === 'card' || ev.kind === 'emi') && !ev.done;
                    return (
                      <li key={ev.kind + ev.id} {...dragProps(ev)}
                        className={`group flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors ${ev.kind === 'card' && !ev.done ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === ev.id ? 'opacity-40' : ''}`}>
                        <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: K.color + '1f' }}>
                          <K.icon size={13} style={{ color: K.color }} />
                        </span>
                        <button onClick={() => openEvent(ev)} className="flex-1 min-w-0 text-left cursor-pointer">
                          <p className={`text-[13px] truncate ${ev.done ? 'text-slate-500 line-through' : ev.overdue ? 'text-rose-300' : 'text-slate-200'}`}>{ev.title}</p>
                          <p className="text-[11.5px] text-slate-500 truncate">
                            {K.label}{ev.time ? ` · ${ev.time}` : ''}{ev.sub ? ` · ${ev.sub}` : ''}{ev.done ? ' · done' : ''}
                          </p>
                        </button>
                        {canTick && (
                          <button onClick={() => quickDone(ev)} title={ev.kind === 'emi' ? 'Mark paid' : 'Mark done'}
                            className="w-7 h-7 rounded-md border border-white/[0.1] text-slate-400 hover:text-emerald-300 hover:border-emerald-400/40 flex items-center justify-center cursor-pointer shrink-0 transition-colors">
                            <Check size={13} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
