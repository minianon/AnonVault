import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarRange, KanbanSquare, CheckSquare, Lightbulb,
  Plus, Check, Timer, Video, ExternalLink, Repeat2, ChevronDown,
} from 'lucide-react';
import { board, addItem, moveItem, dueInfo } from '../services/board';
import { monthLabel, shiftMonth } from '../services/money';
import { ideas as ideaStore } from '../services/ideas';
import { usePref } from '../services/prefs';
import { sessions, totalForDay, formatDuration, useFocusGoal } from '../services/focus';
import { getTasksForDateSync, toggleTaskCompletion } from '../services/tasks';
import { parseCapture, ymdOf } from '../services/nlp';
import { addToChecklist } from '../utils/jump';
import { PageHeader, Card, Empty, Segmented } from './ui';
import { meetings as meetingStore, occurrencesBetween, timeRange, repeatLabel, linkHref, skipOccurrence, saveMeeting, formatTime } from '../services/meetings';
import MeetingModal from './MeetingModal';
import MeetingsView from './MeetingsView';
import TimeGrid from './TimeGrid';

const VIEW_OPTIONS = [{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }, { value: 'meetings', label: 'Meetings' }];

/* What the Calendar shows: everything with a date to act on — meetings,
   the checklist, Board cards, hackathon deadlines and ideas with a
   deadline. Money (EMIs, income) lives in Money. */
const KINDS = {
  meeting:   { label: 'Meetings',   color: '#c49cff', icon: Video },
  task:      { label: 'Checklist',  color: '#a1a1aa', icon: CheckSquare },
  card:      { label: 'Board',      color: '#6c96ff', icon: KanbanSquare },
  hackathon: { label: 'Hackathons', color: '#f0b445', icon: CalendarRange },
  idea:      { label: 'Ideas',      color: '#f7cf7b', icon: Lightbulb },
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

/* "+ New" in the header: add something on the selected day, or jump to
   another section's own "new" form. */
function NewMenu({ dayLabel, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const groups = [
    { title: `On ${dayLabel}`, items: [
      { id: 'meeting', icon: Video, label: 'Meeting', color: '#c49cff' },
      { id: 'task', icon: CheckSquare, label: 'Checklist task', color: '#a1a1aa' },
      { id: 'card', icon: KanbanSquare, label: 'Board card', hint: 'due that day', color: '#6c96ff' },
    ] },
    { title: 'Elsewhere', items: [
      { id: 'idea', icon: Lightbulb, label: 'Idea', hint: 'Ideas', color: '#f7cf7b' },
      { id: 'focus', icon: Timer, label: 'Focus session', hint: 'Focus', color: '#4fd1a0' },
    ] },
  ];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        className="btn-primary h-8 pl-2.5 pr-2 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
        <Plus size={14} /><span className="hidden sm:inline">New</span><ChevronDown size={13} className={`opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 z-50 w-[240px] p-1 rounded-xl border border-white/[0.1]"
          style={{ background: 'var(--surface-2)', boxShadow: 'var(--shadow-lg)', animation: 'selectIn 0.14s var(--ease) both', transformOrigin: 'top right' }}>
          {groups.map((g, gi) => (
            <div key={g.title} className={gi ? 'mt-1 pt-1 border-t border-white/[0.06]' : ''}>
              <p className="px-2.5 pt-1.5 pb-1 text-[10.5px] uppercase tracking-wide text-slate-500">{g.title}</p>
              {g.items.map(it => (
                <button key={it.id} role="menuitem" onClick={() => { setOpen(false); onPick(it.id); }}
                  className="w-full flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-left text-[13px] text-slate-200 hover:bg-white/[0.06] cursor-pointer transition-colors">
                  <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: it.color + '22' }}>
                    <it.icon size={13} style={{ color: it.color }} />
                  </span>
                  <span className="flex-1">{it.label}</span>
                  {it.hint && <span className="text-[11px] text-slate-500">{it.hint}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendarView({ applications = [], tasksVersion, setActiveTab, onSelectHackathon, onOpenIdea, onOpenChecklistDate, onTasksChange, onLock, onMenuToggle, showToast }) {
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
  // { meeting: existing|null, date, draft? } while the meeting editor is open
  const [meetingEdit, setMeetingEdit] = useState(null);
  const addInputRef = useRef(null);

  // Other screens can open a view directly (Today → "All meetings").
  useEffect(() => {
    const on = e => {
      if (!VIEW_OPTIONS.some(o => o.value === e.detail)) return;
      setView(e.detail);
      try { localStorage.setItem('anonvault_calendar_view', e.detail); } catch { /* fine */ }
    };
    window.addEventListener('anonvault:calendar-view', on);
    return () => window.removeEventListener('anonvault:calendar-view', on);
  }, []);
  // Ticks shown straight away while the save runs: { eventId: done }
  const [ticking, setTicking] = useState({});

  const cards = board.useAll();
  const ideaList = ideaStore.useAll();
  const [archivedIdeas] = usePref('anonvault_ideas_archived', []);
  const focusList = sessions.useAll();
  const meetingList = meetingStore.useAll();

  const days = useMemo(() => (view === 'week'
    ? Array.from({ length: 7 }, (_, i) => addDays(new Date(weekStart + 'T00:00:00'), i))
    : view === 'day' ? [new Date(selected + 'T00:00:00')]
    : monthGrid(month)), [view, weekStart, month, selected]);
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

    for (const { meeting: m, date } of occurrencesBetween(meetingList, rangeFrom, rangeTo)) {
      push(date, {
        kind: 'meeting', id: m.id + date, title: m.title, time: m.start_time || null,
        sub: [timeRange(m), m.recurrence && m.recurrence !== 'none' ? repeatLabel(m) : null].filter(Boolean).join(' · '),
        meeting: m, date, repeats: !!m.recurrence && m.recurrence !== 'none',
      });
    }
    for (const a of applications) {
      if (!a?.deadline || a.status === 'rejected') continue;
      const d = new Date(a.deadline);
      push(ymdOf(d), { kind: 'hackathon', id: a.id, title: a.name, sub: a.company || '', time: a.deadline.includes('T') ? d.toTimeString().slice(0, 5) : null });
    }
    for (const c of cards) {
      if (!c.due_date) continue;
      push(c.due_date, { kind: 'card', id: c.id, title: c.title, sub: c.label || '', time: c.due_time || null, done: c.status === 'done', overdue: dueInfo(c)?.tone === 'bad', item: c });
    }
    // Ideas with a deadline (archived ones are out of the way on purpose).
    const archived = new Set(Array.isArray(archivedIdeas) ? archivedIdeas : []);
    for (const i of ideaList) {
      if (!i.due_date || archived.has(i.id)) continue;
      push(i.due_date, { kind: 'idea', id: i.id, title: i.title, sub: i.status === 'ready' ? 'Ready to build' : i.status === 'exploring' ? 'Exploring' : 'Idea', overdue: i.due_date < today });
    }
    // The whole checklist: one-off tasks on their date, repeating ones on
    // every day they're due, each with that day's done state.
    for (const d of days) {
      const key = ymdOf(d);
      for (const t of getTasksForDateSync(key)) {
        push(key, { kind: 'task', id: t.id + key, title: t.title, done: !!t.completed, task: t, date: key, repeats: !!t.is_recurring, priority: t.priority });
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.time || '99').localeCompare(b.time || '99'));
    }
    return map;
    // tasksVersion re-reads the checklist cache after edits elsewhere
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, cards, ideaList, archivedIdeas, meetingList, days, rangeFrom, rangeTo, tasksVersion, today]);

  const visible = date => (byDate.get(date) || [])
    .filter(e => !hidden.has(e.kind))
    .map(e => (e.kind === 'task' && ticking[e.id] !== undefined ? { ...e, done: ticking[e.id] } : e));
  const dayEvents = visible(selected);
  const dayOthers = dayEvents.filter(e => e.kind !== 'task');
  const dayTasks = dayEvents.filter(e => e.kind === 'task');
  const dayTasksDone = dayTasks.filter(e => e.done).length;
  const selDate = new Date(selected + 'T00:00:00');
  const focusMs = totalForDay(focusList, selDate);

  // header counts for the month (or week) on screen
  const inMonth = [...byDate.entries()].filter(([d]) => (view === 'month' ? d.startsWith(month) : d >= rangeFrom && d <= rangeTo)).flatMap(([, l]) => l);
  const count = k => inMonth.filter(e => e.kind === k && !e.done).length;

  const go = d => { setMonth(d.slice(0, 7)); setWeekStart(ymdOf(mondayOf(new Date(d + 'T00:00:00')))); setSelected(d); };
  const changeView = v => {
    setView(v);
    try { localStorage.setItem('anonvault_calendar_view', v); } catch { /* fine */ }
    go(selected);
  };
  const step = n => {
    if (view === 'day') go(ymdOf(addDays(new Date(selected + 'T00:00:00'), n)));
    else if (view === 'week') {
      const ws = addDays(new Date(weekStart + 'T00:00:00'), n * 7);
      setWeekStart(ymdOf(ws));
      setMonth(ymdOf(ws).slice(0, 7));
      setSelected(ymdOf(ws));
    } else setMonth(m => shiftMonth(m, n));
  };
  const navLabel = view === 'day'
    ? new Date(selected + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : view === 'week'
    ? (() => {
        const a = days[0], b = days[6];
        return `${a.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString(undefined, a.getMonth() === b.getMonth() ? { day: 'numeric' } : { day: 'numeric', month: 'short' })}`;
      })()
    : null;

  const navShort = view === 'day'
    ? new Date(selected + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : view === 'week' ? `${days[0].getDate()}–${days[days.length - 1].getDate()}` : null;

  /* Time grid: drag a block to move it, click an empty slot to add a meeting. */
  const canMove = ev => ev.kind === 'meeting' || (ev.kind === 'card' && !ev.done);
  const createAt = (date, time) => setMeetingEdit({ meeting: null, date, draft: { title: '', time } });
  const moveEvent = (ev, date, start, end) => {
    const where = `${new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatTime(start)}`;
    if (ev.kind === 'card') {
      const prev = { due_date: ev.item.due_date, due_time: ev.item.due_time || null };
      board.update(ev.item.id, { due_date: date, due_time: start });
      showToast?.('success', `Moved to ${where}`, ev.title, 6000, { label: 'Undo', onClick: () => board.update(ev.item.id, prev) });
      return;
    }
    const m = ev.meeting;
    if (!m.recurrence || m.recurrence === 'none') {
      const prev = { start_date: m.start_date, start_time: m.start_time, end_time: m.end_time };
      meetingStore.update(m.id, { start_date: date, start_time: start, end_time: m.end_time ? end : null });
      showToast?.('success', `Moved to ${where}`, m.title, 6000, { label: 'Undo', onClick: () => meetingStore.update(m.id, prev) });
      return;
    }
    // A repeating meeting: move just this one (the rest of the series stays put).
    const undoSkip = skipOccurrence(m, ev.date);
    const copy = saveMeeting(null, {
      title: m.title, start_date: date, start_time: start, end_time: m.end_time ? end : '',
      recurrence: 'none', link: m.link, note: m.note,
    });
    showToast?.('success', `Moved this one to ${where}`, `${m.title} — the rest of the series is unchanged`, 7000,
      { label: 'Undo', onClick: () => { undoSkip(); if (copy) meetingStore.remove(copy.id); } });
  };

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
    if (addAs === 'meeting') {
      // Open the editor prefilled, so time, repeat and link can be set.
      setMeetingEdit({ meeting: null, date: p.date || selected, draft: { title: p.title, time: p.time } });
      setDraft('');
      if (p.date && p.date !== selected) go(p.date);
      return;
    }
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
    if (ev.kind === 'meeting') setMeetingEdit({ meeting: ev.meeting, date: ev.date });
    else if (ev.kind === 'card') { setActiveTab('board'); setTimeout(() => window.dispatchEvent(new CustomEvent('anonvault:open-card', { detail: ev.id })), 60); }
    else if (ev.kind === 'hackathon') onSelectHackathon?.(ev.id);
    else if (ev.kind === 'idea') { if (onOpenIdea) onOpenIdea(ev.id); else setActiveTab('ideas'); }
    else if (ev.kind === 'task') { if (onOpenChecklistDate) onOpenChecklistDate(ev.date); else setActiveTab('tasks'); }
  };

  /** Tick a checklist task for that day, right here. Not for days still to come. */
  const tickTask = async ev => {
    if (ev.date > today) return;
    const next = !ev.done;
    setTicking(t => ({ ...t, [ev.id]: next }));
    try {
      await toggleTaskCompletion(ev.task, ev.date, next);
      onTasksChange?.();
    } catch {
      showToast?.('error', 'Could not update the task', ev.title);
    } finally {
      setTicking(t => { const n = { ...t }; delete n[ev.id]; return n; });
    }
  };

  const pickNew = kind => {
    if (kind === 'meeting') setMeetingEdit({ meeting: null, date: selected });
    else if (kind === 'task' || kind === 'card') {
      setAddAs(kind);
      setTimeout(() => { addInputRef.current?.focus(); addInputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 0);
    } else {
      // Other sections open their own "new" form on this event.
      setActiveTab(kind === 'idea' ? 'ideas' : 'focus');
      setTimeout(() => window.dispatchEvent(new CustomEvent('anonvault:new')), 80);
    }
  };
  const selectedLabel = selected === today ? 'today' : new Date(selected + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  const quickDone = ev => {
    if (ev.kind === 'card') {
      const prev = ev.item.status;
      moveItem(ev.id, 'done');
      showToast?.('success', 'Done', ev.title, 5000, { label: 'Undo', onClick: () => moveItem(ev.id, prev) });
    }
  };

  // Meetings is the third view of the Calendar, with the same switcher on top.
  if (view === 'meetings') {
    return (
      <MeetingsView onLock={onLock} onMenuToggle={onMenuToggle} showToast={showToast} title="Calendar"
        viewSwitch={<Segmented size="sm" value={view} onChange={changeView} options={VIEW_OPTIONS} />} />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Calendar"
        stats={[
          { value: count('meeting'), label: 'meetings' },
          { value: count('hackathon'), label: 'deadlines', tone: 'warn' },
          { value: count('card'), label: 'cards due' },
          { value: count('idea'), label: 'idea deadlines' },
        ]}
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={<>
          <div className="hidden sm:block">
            <Segmented size="sm" value={view} onChange={changeView}
              options={VIEW_OPTIONS} />
          </div>
          <div className="flex items-center rounded-lg border border-white/[0.08] h-8">
            <button onClick={() => step(-1)} className="icon-btn !h-full !rounded-r-none" aria-label={`Previous ${view}`}><ChevronLeft size={14} /></button>
            <span className="px-1.5 sm:px-2 text-[12.5px] text-slate-200 font-medium whitespace-nowrap min-w-[64px] sm:min-w-[110px] text-center tabular-nums">
              {view !== 'month' ? <>
                <span className="sm:hidden">{navShort}</span>
                <span className="hidden sm:inline">{navLabel}</span>
              </> : <>
                <span className="sm:hidden">{monthLabel(month, { month: 'short' })}</span>
                <span className="hidden sm:inline">{monthLabel(month)}</span>
              </>}
            </span>
            <button onClick={() => step(1)} className="icon-btn !h-full !rounded-l-none" aria-label={`Next ${view}`}><ChevronRight size={14} /></button>
          </div>
          <button onClick={() => go(today)} className="hidden sm:inline-flex items-center btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Today</button>
          <NewMenu dayLabel={selectedLabel} onPick={pickNew} />
        </>} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1300px] mx-auto px-3 sm:px-4 lg:px-6 py-5 space-y-4">
          {/* legend / filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="sm:hidden w-full mb-1">
              <Segmented size="sm" value={view} onChange={changeView}
                options={VIEW_OPTIONS} />
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
            <span className="hidden md:inline ml-auto text-[12px] text-slate-600">
              {view === 'month' ? 'Drag a Board card to another day to move it' : 'Drag a block to move it · click an empty time to add a meeting'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
            {/* month grid / week columns */}
            <div className="panel overflow-hidden min-w-0">
              <div className={`grid grid-cols-7 border-b border-white/[0.06] ${view === 'month' ? '' : 'hidden'}`}>
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
                    const others = evs.filter(e => e.kind !== 'task');
                    const evTasks = evs.filter(e => e.kind === 'task');
                    const tasksDone = evTasks.filter(e => e.done).length;
                    const slots = evTasks.length ? 2 : 3;
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
                          {others.slice(0, slots).map(ev => (
                            <div key={ev.kind + ev.id} {...dragProps(ev)}
                              onClick={ev.kind === 'meeting' ? e => { e.stopPropagation(); setSelected(key); openEvent(ev); } : undefined}
                              className={`flex items-center gap-1 h-[18px] px-1 rounded text-[11px] truncate ${ev.done ? 'opacity-45 line-through' : ''} ${ev.kind === 'card' && !ev.done ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === ev.id ? 'opacity-30' : ''}`}
                              style={{ background: KINDS[ev.kind].color + '1f', color: ev.overdue ? '#f9909f' : '#e4e4e7' }}>
                              <span className="w-1 h-1 rounded-full shrink-0" style={{ background: KINDS[ev.kind].color }} />
                              {ev.kind === 'meeting' && ev.time && <span className="shrink-0 tabular-nums text-slate-400">{ev.time}</span>}
                              <span className="truncate">{ev.title}</span>
                            </div>
                          ))}
                          {others.length > slots && <div className="text-[10.5px] text-slate-500 px-1">+{others.length - slots} more</div>}
                          {evTasks.length > 0 && (
                            <div className={`flex items-center gap-1 h-[18px] px-1 rounded text-[11px] tabular-nums ${key > today ? 'text-slate-400' : tasksDone === evTasks.length ? 'text-emerald-300' : 'text-slate-300'}`}
                              style={{ background: tasksDone === evTasks.length && key <= today ? 'rgba(79,209,160,0.12)' : 'rgba(161,161,170,0.12)' }}
                              title={`Checklist: ${key > today ? `${evTasks.length} due` : `${tasksDone} of ${evTasks.length} done`}`}>
                              <CheckSquare size={10} className="shrink-0" />
                              <span className="truncate">{key > today ? `${evTasks.length} task${evTasks.length === 1 ? '' : 's'}` : `${tasksDone}/${evTasks.length} tasks`}</span>
                            </div>
                          )}
                        </div>
                        {/* phone: dots */}
                        <div className="sm:hidden flex flex-wrap gap-0.5 mt-0.5 px-0.5">
                          {others.slice(0, 3).map(ev => (
                            <span key={ev.kind + ev.id} className="w-1.5 h-1.5 rounded-full" style={{ background: KINDS[ev.kind].color, opacity: ev.done ? 0.4 : 1 }} />
                          ))}
                          {evTasks.length > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: tasksDone === evTasks.length && key <= today ? 'var(--ok)' : KINDS.task.color }} />}
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
                <>
                <div className={view === 'week' ? 'hidden sm:block' : ''}>
                  <TimeGrid days={days} today={today} selected={selected} kinds={KINDS} eventsFor={visible}
                    onSelectDay={setSelected} onOpenEvent={openEvent} onCreateAt={createAt}
                    onMoveEvent={moveEvent} canMove={canMove}
                    focusFor={d => focusByDay.get(ymdOf(d)) || 0} goalMs={goal * 60000} />
                </div>
                {view === 'week' && (
                <div className="grid grid-cols-1 sm:hidden">
                  {days.map((d, i) => {
                    const key = ymdOf(d);
                    const evAll = visible(key);
                    const evs = evAll.filter(e => e.kind !== 'task');
                    const wTasks = evAll.filter(e => e.kind === 'task');
                    const wDone = wTasks.filter(e => e.done).length;
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
                              {(ev.time || ev.sub) && <span className="block text-[10.5px] text-slate-500 truncate">{[ev.kind === 'meeting' ? null : ev.time, ev.sub].filter(Boolean).join(' · ')}</span>}
                            </div>
                          ))}
                          {wTasks.length > 0 && (
                            <div className="mt-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-1">
                              <p className={`flex items-center gap-1 text-[10.5px] tabular-nums mb-0.5 ${wDone === wTasks.length && key <= today ? 'text-emerald-300' : 'text-slate-500'}`}>
                                <CheckSquare size={10} /> {key > today ? `${wTasks.length} due` : `${wDone}/${wTasks.length} done`}
                              </p>
                              {wTasks.slice(0, 6).map(ev => (
                                <p key={ev.id} className={`flex items-center gap-1 text-[11px] leading-[18px] truncate ${ev.done ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                                  <span className={`w-[9px] h-[9px] rounded-[3px] shrink-0 border ${ev.done ? 'bg-[var(--ok)] border-[var(--ok)]' : 'border-white/30'}`} />
                                  <span className="truncate">{ev.title}</span>
                                </p>
                              ))}
                              {wTasks.length > 6 && <p className="text-[10.5px] text-slate-500">+{wTasks.length - 6} more</p>}
                            </div>
                          )}
                          {evAll.length === 0 && <div className="hidden sm:block h-full min-h-[40px]" />}
                          {evAll.length === 0 && <p className="sm:hidden px-1 pb-1 text-[11.5px] text-slate-600">Nothing</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
                </>
              )}
            </div>

            {/* day agenda */}
            <Card className="lg:sticky lg:top-0 min-w-0">
              <div className="px-4 pt-3.5 pb-3 border-b border-white/[0.06]">
                <p className="text-[15px] font-semibold text-slate-100">
                  {selected === today ? 'Today' : selDate.toLocaleDateString(undefined, { weekday: 'long' })}
                </p>
                <p className="text-[12.5px] text-slate-500">{selDate.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                {focusMs > 0 && (
                  <div className="flex gap-3 mt-2 text-[12px] text-slate-400">
                    {focusMs > 0 && <span className="inline-flex items-center gap-1"><Timer size={12} className="text-slate-500" />{formatDuration(focusMs)} focused</span>}
                  </div>
                )}
              </div>

              <form onSubmit={addOnDay} className="px-3 pt-3">
                <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-dashed border-white/[0.1] focus-within:border-white/[0.2] focus-within:border-solid transition-colors">
                  <Plus size={14} className="text-slate-500" />
                  <input ref={addInputRef} value={draft} onChange={e => setDraft(e.target.value)} placeholder={addAs === 'task' ? 'Add a task on this day…' : addAs === 'meeting' ? 'Add a meeting… e.g. standup at 10' : 'Add a card on this day…'}
                    className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 outline-none" />
                  <div className="flex items-center p-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] shrink-0" role="radiogroup" aria-label="Add as">
                    {[['card', 'Card'], ['task', 'Task'], ['meeting', 'Meeting']].map(([v, l]) => (
                      <button key={v} type="button" role="radio" aria-checked={addAs === v} onClick={() => setAddAs(v)}
                        className={`h-5 px-1.5 rounded text-[11px] cursor-pointer transition-colors ${addAs === v ? 'bg-white/[0.1] text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>{l}</button>
                    ))}
                  </div>
                </div>
              </form>

              {dayEvents.length === 0 ? (
                <Empty icon={CalendarRange} title="Nothing on this day" body="Meetings, your checklist, Board cards with a due date, hackathon deadlines and ideas with a deadline all show up here." />
              ) : dayOthers.length > 0 && (
                <ul className="p-2">
                  {dayOthers.map(ev => {
                    const K = KINDS[ev.kind];
                    const canTick = ev.kind === 'card' && !ev.done;
                    return (
                      <li key={ev.kind + ev.id} {...dragProps(ev)}
                        className={`group flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors ${ev.kind === 'card' && !ev.done ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === ev.id ? 'opacity-40' : ''}`}>
                        <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: K.color + '1f' }}>
                          <K.icon size={13} style={{ color: K.color }} />
                        </span>
                        <button onClick={() => openEvent(ev)} className="flex-1 min-w-0 text-left cursor-pointer">
                          <p className={`text-[13px] truncate ${ev.done ? 'text-slate-500 line-through' : ev.overdue ? 'text-rose-300' : 'text-slate-200'}`}>{ev.title}</p>
                          <p className="text-[11.5px] text-slate-500 truncate flex items-center gap-1 max-w-full">
                            {ev.kind === 'meeting'
                              ? <>{ev.repeats && <Repeat2 size={11} className="shrink-0" />}<span className="truncate">{ev.sub}</span></>
                              : <>{K.label}{ev.time ? ` · ${ev.time}` : ''}{ev.sub ? ` · ${ev.sub}` : ''}{ev.done ? ' · done' : ''}</>}
                          </p>
                        </button>
                        {ev.kind === 'meeting' && linkHref(ev.meeting.link) && (
                          <a href={linkHref(ev.meeting.link)} target="_blank" rel="noopener noreferrer" title="Join"
                            className="h-7 px-2 rounded-md border border-white/[0.1] text-[12px] text-slate-300 hover:text-slate-50 hover:border-white/[0.2] inline-flex items-center gap-1 shrink-0 transition-colors">
                            Join <ExternalLink size={11} />
                          </a>
                        )}
                        {canTick && (
                          <button onClick={() => quickDone(ev)} title="Mark done"
                            className="w-7 h-7 rounded-md border border-white/[0.1] text-slate-400 hover:text-emerald-300 hover:border-emerald-400/40 flex items-center justify-center cursor-pointer shrink-0 transition-colors">
                            <Check size={13} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {dayTasks.length > 0 && (
                <div className={`px-2 pb-2 ${dayOthers.length ? 'border-t border-white/[0.06] pt-1' : 'pt-2'}`}>
                  <div className="flex items-center gap-2 px-2 pt-1.5 pb-1">
                    <CheckSquare size={13} className="text-slate-500" />
                    <span className="text-[12.5px] font-medium text-slate-200">Checklist</span>
                    <span className="text-[11.5px] text-slate-500 tabular-nums">
                      {selected > today ? `${dayTasks.length} due` : `${dayTasksDone}/${dayTasks.length} done`}
                    </span>
                    <button onClick={() => (onOpenChecklistDate ? onOpenChecklistDate(selected) : setActiveTab('tasks'))}
                      className="ml-auto text-[11.5px] text-slate-500 hover:text-slate-200 cursor-pointer inline-flex items-center gap-0.5">
                      Open <ChevronRight size={12} />
                    </button>
                  </div>
                  {selected <= today && (
                    <div className="mx-2 mb-1.5 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                      <div className="h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${(dayTasksDone / dayTasks.length) * 100}%`, background: dayTasksDone === dayTasks.length ? 'var(--ok)' : 'rgba(255,255,255,0.45)' }} />
                    </div>
                  )}
                  <ul>
                    {dayTasks.map(ev => {
                      const future = ev.date > today;
                      return (
                        <li key={ev.id} className="flex items-center gap-2.5 px-2 min-h-[36px] rounded-lg hover:bg-white/[0.03] transition-colors">
                          <button type="button" role="checkbox" aria-checked={ev.done} disabled={future} onClick={() => tickTask(ev)}
                            title={future ? 'You can tick this on the day' : ev.done ? 'Mark not done' : 'Mark done'}
                            className={`w-[17px] h-[17px] rounded-[5px] shrink-0 flex items-center justify-center border transition-colors ${
                              future ? 'border-white/[0.12] cursor-not-allowed' : 'cursor-pointer'} ${
                              ev.done ? 'bg-slate-100 border-slate-100 text-slate-950' : 'border-white/[0.25] hover:border-white/[0.5]'}`}>
                            {ev.done && <Check size={11} strokeWidth={3} />}
                          </button>
                          <button onClick={() => openEvent(ev)} className="flex-1 min-w-0 text-left cursor-pointer flex items-center gap-1.5">
                            <span className={`text-[13px] truncate ${ev.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{ev.title}</span>
                            {ev.repeats && <Repeat2 size={11} className="text-slate-600 shrink-0" />}
                          </button>
                          {ev.priority === 'high' && !ev.done && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" title="High priority" />}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {meetingEdit && (
        <MeetingModal key={(meetingEdit.meeting?.id || 'new') + meetingEdit.date}
          initial={meetingEdit.meeting} date={meetingEdit.date} draft={meetingEdit.draft}
          onClose={() => setMeetingEdit(null)} showToast={showToast} />
      )}
    </div>
  );
}
