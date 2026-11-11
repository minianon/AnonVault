import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Check, ChevronRight, ChevronLeft, Plus, Repeat2, Play, Square, CalendarClock, CalendarRange, KanbanSquare, Quote, Receipt, CircleDollarSign,
  CheckSquare, Timer, X, CornerDownLeft, AlertCircle, Zap,
} from 'lucide-react';
import {
  getTasksForDate, getTasksForDateSync, toggleTaskCompletion, toggleSubtaskCompletion,
  getStreakDetails, getHackathonProgress,
} from '../services/tasks';
import {
  sessions, isRunning, durationMs, totalForDay, formatDuration, useNow, startSession, stopSession, recentLabels,
} from '../services/focus';
import {
  transactions, useMoneySettings, formatMoney, monthKey, spentOn, ymd,
  emis, emiStats, incomeSources, receivedFrom, payEmi, receiveIncome, monthLabel,
} from '../services/money';
import { board, dueInfo, moveItem } from '../services/board';
import { quotes, dayOffset } from '../services/quotes';
import { PageHeader, Card, CardHeader, LinkButton, Empty, StreakIcon } from './ui';
import MeetingsToday from './MeetingsToday';

const QUICK_ACTIONS = [
  { id: 'task', label: 'Task', icon: Plus, inline: true },
  { id: 'timer', label: 'Timer', icon: Play, inline: true },
  { id: 'expense', label: 'Expense', icon: Receipt, section: 'Money' },
  { id: 'board', label: 'Card', icon: KanbanSquare, section: 'Board' },
];

/* Tasks done today as a ring. Fills smoothly when you tick things off. */
function ProgressRing({ value, label, sub, onClick }) {
  const r = 34, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value || 0));
  const color = pct >= 1 ? 'var(--ok)' : 'var(--text-1)';
  return (
    <button onClick={onClick} className="hidden sm:flex relative w-[92px] h-[92px] shrink-0 items-center justify-center cursor-pointer group" title="Open checklist">
      <svg width="92" height="92" viewBox="0 0 92 92" className="absolute inset-0 -rotate-90">
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
        <circle cx="46" cy="46" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.8s var(--ease), stroke 0.3s ease' }} />
      </svg>
      <span className="relative text-center">
        <span className="block text-[17px] font-semibold tabular-nums text-slate-100 leading-none">{label}</span>
        <span className="block text-[11px] text-slate-500 mt-1 group-hover:text-slate-300 transition-colors">{sub}</span>
      </span>
    </button>
  );
}

/* Your saved quotes, one after another. Pauses while hovered. */
function QuoteRotator({ onOpen }) {
  const all = quotes.useAll();
  const len = all.length;
  const [i, setI] = useState(() => dayOffset(quotes.getAll().length));
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);

  const go = d => {
    if (len < 2) return;
    setFading(true);
    setTimeout(() => { setI(x => (x + d + len) % len); setFading(false); }, 220);
  };
  useEffect(() => {
    if (len < 2 || paused) return;
    const t = setInterval(() => go(1), 15000);
    return () => clearInterval(t);
  }, [len, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!len) {
    return (
      <button onClick={onOpen} className="panel panel-hover w-full px-4 py-3 text-left flex items-center gap-3 cursor-pointer">
        <Quote size={14} className="text-slate-500" />
        <span className="text-[13px] text-slate-500">Add a few quotes and they'll show up here, one after another.</span>
      </button>
    );
  }
  const q = all[i % len];
  return (
    <div className="panel px-4 py-3.5 flex items-center gap-3" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <Quote size={14} className="text-slate-500 shrink-0 self-start mt-1" />
      <figure className="flex-1 min-w-0 transition-[opacity,transform] duration-200"
        style={{ opacity: fading ? 0 : 1, transform: fading ? 'translateY(3px)' : 'none' }}>
        <blockquote className="text-[14px] leading-relaxed text-slate-200">{q.text}</blockquote>
        {q.author && q.author !== 'Unknown' && <figcaption className="text-[12.5px] text-slate-500 mt-1">— {q.author}</figcaption>}
      </figure>
      {len > 1 && (
        <div className="flex items-center gap-0.5 shrink-0 self-start">
          <button onClick={() => go(-1)} className="icon-btn !w-7 !h-7" aria-label="Previous quote"><ChevronLeft size={14} /></button>
          <span className="text-[11.5px] text-slate-600 tabular-nums w-9 text-center">{(i % len) + 1}/{len}</span>
          <button onClick={() => go(1)} className="icon-btn !w-7 !h-7" aria-label="Next quote"><ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

const PRIORITY_DOT = { high: 'bg-rose-400', medium: 'bg-amber-400', low: 'bg-slate-600' };

function daysUntil(deadline) {
  if (!deadline) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(deadline); t.setHours(0, 0, 0, 0);
  return Math.round((t - today) / 86400000);
}

function greetingFor(h) {
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
}

function Checkbox({ checked, onChange, small }) {
  const sz = small ? 'w-[15px] h-[15px] rounded-[4px]' : 'w-[17px] h-[17px] rounded-[5px]';
  return (
    <button type="button" role="checkbox" aria-checked={checked}
      onClick={e => { e.stopPropagation(); onChange(); }}
      className={`${sz} shrink-0 flex items-center justify-center border transition-colors duration-150 cursor-pointer ${
        checked ? 'bg-slate-100 border-slate-100 text-slate-950' : 'border-white/[0.22] hover:border-white/[0.45] bg-transparent'
      }`}>
      <Check size={small ? 10 : 11} strokeWidth={3}
        style={{ opacity: checked ? 1 : 0, transform: checked ? 'scale(1)' : 'scale(0.6)', transition: 'all .18s var(--ease)' }} />
    </button>
  );
}

/* Streak at a glance: current run, this week's days, and what today needs. */
const STREAK_DOT = {
  clean: 'var(--ok)', partial: 'rgba(240,180,69,0.6)', missed: 'rgba(245,118,138,0.45)', none: 'rgba(255,255,255,0.05)', today: 'transparent',
};
function StreakCard({ version, onOpen }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const st = useMemo(() => getStreakDetails(365, 7), [version]);
  const left = st.today.due - st.today.done;
  const line = st.today.state === 'progress' ? `${left} task${left === 1 ? '' : 's'} left to make it ${st.current + 1}`
    : st.today.state === 'clean' ? 'Today is done — streak safe'
    : 'Nothing due today';
  return (
    <Card>
      <CardHeader icon={Zap} title="Streak" action={<LinkButton onClick={onOpen}>Habits <ChevronRight size={12} /></LinkButton>} />
      <div className="px-4 pb-4">
        <div className="flex items-end justify-between gap-3">
          <p className="flex items-center gap-1.5">
            <span className="text-[28px] leading-8 font-semibold tabular-nums text-slate-50">{st.current}</span>
            <StreakIcon active={st.current > 0} size={18} />
            <span className="text-[12px] text-slate-500 ml-0.5">day{st.current === 1 ? '' : 's'}</span>
          </p>
          <div className="flex gap-1.5">
            {st.days.map(c => {
              const d = new Date(c.date + 'T00:00:00');
              const label = c.state === 'none' ? 'nothing due' : c.state === 'today' ? `${c.done} of ${c.due} so far` : `${c.done} of ${c.due} done`;
              return (
                <span key={c.date} className="flex flex-col items-center gap-1">
                  <span title={`${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} — ${label}`}
                    className={`w-[18px] h-[18px] rounded-[5px] ${c.state === 'today' ? 'border border-dashed border-white/40' : ''}`}
                    style={{ background: STREAK_DOT[c.state] }} />
                  <span className="text-[9.5px] text-slate-600">{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                </span>
              );
            })}
          </div>
        </div>
        <p className={`mt-2 text-[12px] ${st.today.state === 'clean' ? 'text-emerald-300' : st.today.state === 'progress' ? 'text-slate-300' : 'text-slate-500'}`}>
          {line}{st.longest > st.current ? <span className="text-slate-500"> · best {st.longest}</span> : null}
        </p>
      </div>
    </Card>
  );
}

const ATTN_KIND = {
  card:      { icon: KanbanSquare,      color: '#6c96ff', label: 'Board' },
  hackathon: { icon: CalendarRange,     color: '#f0b445', label: 'Deadline' },
  emi:       { icon: CalendarClock,     color: '#f5768a', label: 'EMI' },
  income:    { icon: CircleDollarSign,  color: '#4fd1a0', label: 'Income' },
};

export default function DashboardView({
  applications,
  onTasksChange,
  tasksVersion,
  setActiveTab,
  onMenuToggle,
  onLock,
  showToast,
  onQuickAddTask,
  onOpenBoard,
  onSelectHackathon,
}) {
  const todayStr = ymd();
  const [tasks, setTasks] = useState(() => getTasksForDateSync(todayStr));
  const [expanded, setExpanded] = useState(null);
  const [newTask, setNewTask] = useState('');
  const [focusLabel, setFocusLabel] = useState('');
  const taskInputRef = useRef(null);

  /* ── tasks ── */
  const loadTodayTasks = useCallback(async () => {
    try { setTasks(await getTasksForDate(todayStr)); }
    catch (err) { console.error('Failed to load today tasks:', err); }
  }, [todayStr]);

  useEffect(() => {
    let alive = true;
    getTasksForDate(todayStr).then(list => { if (alive) setTasks(list); }).catch(() => {});
    return () => { alive = false; };
  }, [todayStr]);

  const seenVersion = useRef(tasksVersion);
  useEffect(() => {
    if (seenVersion.current === tasksVersion) return;
    seenVersion.current = tasksVersion;
    setTasks(getTasksForDateSync(todayStr));
  }, [tasksVersion, todayStr]);

  useEffect(() => {
    const onNew = () => { if (taskInputRef.current?.closest('[aria-hidden="false"]')) taskInputRef.current.focus(); };
    window.addEventListener('anonvault:new', onNew);
    return () => window.removeEventListener('anonvault:new', onNew);
  }, []);

  const toggleTask = async task => {
    const next = !task.completed;
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, completed: next, subtasks: (t.subtasks || []).map(st => ({ ...st, completed: next })) } : t));
    try { await toggleTaskCompletion(task, todayStr, next); onTasksChange?.(); }
    catch { await loadTodayTasks(); }
  };

  const toggleSub = async (task, sub) => {
    const next = !sub.completed;
    setTasks(prev => prev.map(t => {
      if (t.id !== task.id) return t;
      const subs = (t.subtasks || []).map(st => st.id === sub.id ? { ...st, completed: next } : st);
      return { ...t, subtasks: subs, completed: subs.length > 0 && subs.every(s => s.completed) };
    }));
    try { await toggleSubtaskCompletion(task, sub.id, todayStr, next); onTasksChange?.(); }
    catch { await loadTodayTasks(); }
  };

  const addTask = async e => {
    e.preventDefault();
    const title = newTask.trim();
    if (!title) return;
    setNewTask('');
    await onQuickAddTask?.(title);
    setTasks(getTasksForDateSync(todayStr));
  };

  const sortedTasks = useMemo(() => {
    const rank = { high: 0, medium: 1, low: 2 };
    return [...tasks].sort((a, b) =>
      Number(a.completed) - Number(b.completed) || (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1));
  }, [tasks]);
  const done = tasks.filter(t => t.completed).length;

  /* ── focus ── */
  const allSessions = sessions.useAll();
  const running = allSessions.filter(isRunning);
  const now = useNow(1000, true);
  const focusedToday = totalForDay(allSessions, new Date(), now);
  const recents = recentLabels(allSessions, 3);
  const quickStart = e => {
    e.preventDefault();
    if (startSession({ label: focusLabel })) setFocusLabel('');
  };

  /* ── money ── */
  const allTx = transactions.useAll();
  const settings = useMoneySettings();
  const spentToday = spentOn(allTx, todayStr);
  const fmt = n => formatMoney(n, settings.currency);
  const thisMonth = monthKey();
  const emiList = emis.useAll();
  const sourceList = incomeSources.useAll();

  /* ── one list of everything that needs you: board items due soon,
        close hackathon deadlines, EMIs and income still open this month ── */
  const hackProgress = useMemo(() => getHackathonProgress(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasksVersion]);
  const boardItems = board.useAll();
  const attention = [];
  for (const i of boardItems) {
    if (i.status === 'done') continue;
    const due = dueInfo(i);
    if (!(i.status === 'doing' || (due && due.days <= 2))) continue;
    attention.push({
      kind: 'card', id: i.id, title: i.title, rank: due ? due.days : 50,
      sub: [i.status === 'doing' ? 'In progress' : null, i.label || null].filter(Boolean).join(' · '),
      when: due ? due.text : null, tone: due?.tone,
      action: { label: 'Done', run: () => { moveItem(i.id, 'done'); showToast?.('success', 'Done', i.title, 5000, { label: 'Undo', onClick: () => moveItem(i.id, i.status) }); } },
      open: () => (onOpenBoard ? onOpenBoard() : setActiveTab('board')),
    });
  }
  for (const a of applications || []) {
    if (!a || a.status === 'rejected') continue;
    const days = daysUntil(a.deadline);
    if (days == null || days < 0 || days > 3) continue;
    const prog = hackProgress[a.id];
    attention.push({
      kind: 'hackathon', id: a.id, title: a.name, rank: days,
      sub: prog ? `${prog.done}/${prog.total} steps` : a.company || '',
      when: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`, tone: days <= 1 ? 'bad' : 'warn',
      open: () => onSelectHackathon?.(a.id),
    });
  }
  const dayOfMonth = new Date().getDate();
  for (const e of emiList) {
    const st = emiStats(e);
    if (st.done || st.paidThisMonth) continue;
    const dueDay = Number(e.due_day) || 1;
    attention.push({
      kind: 'emi', id: e.id, title: e.name, rank: dueDay - dayOfMonth,
      sub: fmt(st.amount), when: dueDay < dayOfMonth ? 'Overdue' : dueDay === dayOfMonth ? 'Today' : `on the ${dueDay}${dueDay % 10 === 1 && dueDay !== 11 ? 'st' : dueDay % 10 === 2 && dueDay !== 12 ? 'nd' : dueDay % 10 === 3 && dueDay !== 13 ? 'rd' : 'th'}`,
      tone: dueDay <= dayOfMonth ? 'bad' : dueDay - dayOfMonth <= 3 ? 'warn' : undefined,
      action: { label: 'Paid', run: () => {
        const r = payEmi(e);
        showToast?.('success', `${monthLabel(r.month, { month: 'short' })} EMI paid`, `${fmt(r.amount)} · ${e.name}`, 6000, { label: 'Undo', onClick: r.undo });
      } },
      open: () => { setActiveTab('money'); window.dispatchEvent(new CustomEvent('anonvault:money-tab', { detail: 'emi' })); },
    });
  }
  for (const s of sourceList) {
    if (s.active === false || s.frequency === 'one-time' || receivedFrom(allTx, s.id, thisMonth).length) continue;
    attention.push({
      kind: 'income', id: s.id, title: s.name, rank: 40,
      sub: s.kind === 'range' ? `${fmt(s.min)}–${fmt(s.max)}` : fmt(Number(s.amount) || 0), when: 'This month',
      action: { label: 'Received', run: () => {
        if (s.kind === 'range') { setActiveTab('money'); window.dispatchEvent(new CustomEvent('anonvault:money-tab', { detail: 'income' })); return; }
        const r = receiveIncome(s, thisMonth, s.amount);
        showToast?.('success', `${monthLabel(thisMonth, { month: 'short' })} received`, `${fmt(s.amount)} · ${s.name}`, 6000, { label: 'Undo', onClick: r.undo });
      } },
      open: () => { setActiveTab('money'); window.dispatchEvent(new CustomEvent('anonvault:money-tab', { detail: 'income' })); },
    });
  }
  attention.sort((a, b) => a.rank - b.rank);
  const overdueCount = attention.filter(a => a.tone === 'bad').length;

  /* ── hero ── */
  const [quickMode, setQuickMode] = useState(null); // null | 'task' | 'timer'
  const [quickText, setQuickText] = useState('');
  const quickRef = useRef(null);
  const go = (tab, moneyTab) => {
    setActiveTab(tab);
    if (moneyTab) window.dispatchEvent(new CustomEvent('anonvault:money-tab', { detail: moneyTab }));
    setTimeout(() => window.dispatchEvent(new CustomEvent('anonvault:new')), 80);
  };
  const quick = id => {
    if (id === 'task' || id === 'timer') {
      setQuickMode(m => (m === id ? null : id));
      setQuickText('');
      setTimeout(() => quickRef.current?.focus(), 30);
    } else if (id === 'expense') go('money', 'overview');
    else go(id);
  };
  const submitQuick = async e => {
    e.preventDefault();
    const text = quickText.trim();
    if (!text) return quickRef.current?.focus();
    if (quickMode === 'task') {
      setQuickText('');
      await onQuickAddTask?.(text);
      setTasks(getTasksForDateSync(todayStr));
      quickRef.current?.focus();
    } else if (startSession({ label: text })) {
      showToast?.('success', 'Timer started', text);
      setQuickText('');
      setQuickMode(null);
    }
  };

  const clock = new Date(now);
  const summary = [];
  if (tasks.length) summary.push(done === tasks.length ? 'All tasks done' : `${tasks.length - done} task${tasks.length - done === 1 ? '' : 's'} left`);
  if (overdueCount) summary.push(`${overdueCount} need${overdueCount === 1 ? 's' : ''} attention`);
  if (running.length) summary.push(`${running.length} timer${running.length === 1 ? '' : 's'} running`);
  if (spentToday > 0) summary.push(`${fmt(spentToday)} spent`);

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Today"
        stats={[
          { value: tasks.length - done, label: 'tasks left' },
          { value: overdueCount, label: 'urgent', tone: 'bad' },
          { value: running.length, label: 'running', tone: 'good' },
        ]}
        onMenuToggle={onMenuToggle} onLock={onLock} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1120px] mx-auto px-4 lg:px-6 py-6 space-y-5 reveal-stagger">

          {/* Hero: where the day stands, and the two things you do most */}
          <div className="panel relative overflow-hidden px-5 py-5 sm:px-6">
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(70% 120% at 100% 0%, rgba(79,123,255,0.07) 0%, transparent 60%)' }} />
            <div className="relative flex items-center gap-6">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-slate-500">
                  {clock.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                  <span className="text-slate-700 mx-1.5">·</span>
                  <span className="font-mono tabular-nums">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </p>
                <h2 className="text-[24px] sm:text-[26px] font-semibold tracking-[-0.03em] text-slate-50 mt-1">{greetingFor(clock.getHours())}.</h2>
                <p className="text-[13.5px] text-slate-400 mt-0.5">{summary.length ? summary.join(' · ') : 'A clear day. Add a task or start a timer.'}</p>
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  {QUICK_ACTIONS.map(a => {
                    const on = quickMode === a.id;
                    return a.inline ? (
                      <button key={a.id} onClick={() => quick(a.id)} aria-expanded={on}
                        className={`h-8 px-3 rounded-lg text-[12.5px] font-medium border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                          on ? 'bg-slate-100 border-slate-100 text-slate-950' : 'text-slate-200 bg-white/[0.06] border-white/[0.1] hover:bg-white/[0.1] hover:text-slate-50'}`}>
                        <a.icon size={13} className={on ? 'text-slate-700' : 'text-slate-400'} /> {a.label}
                      </button>
                    ) : (
                      <button key={a.id} onClick={() => quick(a.id)} title={`New ${a.label.toLowerCase()} in ${a.section}`}
                        className="h-8 px-2.5 rounded-lg text-[12.5px] text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-colors cursor-pointer inline-flex items-center gap-1.5">
                        <a.icon size={13} className="text-slate-500" /> {a.label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid transition-[grid-template-rows,opacity] duration-300"
                  style={{ gridTemplateRows: quickMode ? '1fr' : '0fr', opacity: quickMode ? 1 : 0, transitionTimingFunction: 'var(--ease)' }}>
                  <div className="overflow-hidden">
                    <form onSubmit={submitQuick} className="mt-3 flex items-center gap-2 max-w-[560px]">
                      <div className="relative flex-1">
                        {quickMode === 'timer'
                          ? <Timer size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                          : <Plus size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />}
                        <input ref={quickRef} value={quickText} onChange={e => setQuickText(e.target.value)} tabIndex={quickMode ? 0 : -1}
                          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setQuickMode(null); } }}
                          placeholder={quickMode === 'timer' ? 'What are you working on?' : 'Add a task for today…'}
                          className="input-premium w-full h-9 pl-9 pr-3 rounded-lg text-[13px]" />
                      </div>
                      <button type="submit" tabIndex={quickMode ? 0 : -1} disabled={!quickText.trim()}
                        className="btn-primary h-9 px-3.5 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-default">
                        {quickMode === 'timer' ? <><Play size={12} fill="currentColor" /> Start</> : <><CornerDownLeft size={13} /> Add</>}
                      </button>
                      <button type="button" onClick={() => setQuickMode(null)} tabIndex={quickMode ? 0 : -1} className="icon-btn shrink-0" aria-label="Close"><X size={14} /></button>
                    </form>
                  </div>
                </div>
              </div>
              <ProgressRing value={tasks.length ? done / tasks.length : 0} label={tasks.length ? `${done}/${tasks.length}` : '—'} sub="tasks" onClick={() => setActiveTab('tasks')} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
            {/* ── main column: what to do ── */}
            <div className="space-y-5 min-w-0">
              <Card className="overflow-hidden">
                <CardHeader icon={CheckSquare} title="Today's tasks" meta={tasks.length ? `${done}/${tasks.length}` : null}
                  action={<LinkButton onClick={() => setActiveTab('tasks')}>Checklist <ChevronRight size={12} /></LinkButton>} />
                {tasks.length > 0 && (
                  <div className="mx-4 mb-2 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                    <div className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${(done / tasks.length) * 100}%`, background: done === tasks.length ? 'var(--ok)' : 'rgba(255,255,255,0.5)' }} />
                  </div>
                )}
                <form onSubmit={addTask} className="mx-4 mb-1 flex items-center gap-2 h-9 px-2.5 rounded-lg border border-dashed border-white/[0.1] focus-within:border-white/[0.2] focus-within:border-solid transition-colors">
                  <Plus size={14} className="text-slate-500" />
                  <input ref={taskInputRef} value={newTask} onChange={e => setNewTask(e.target.value)}
                    placeholder="Add a task for today…"
                    className="flex-1 bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 outline-none" />
                  {newTask && <span className="kbd">↵</span>}
                </form>
                {tasks.length === 0 ? (
                  <Empty icon={CheckSquare} title="No tasks for today" body="Add one above, or set up repeating tasks in Checklist." />
                ) : (
                  <ul className="py-1.5">
                    {sortedTasks.slice(0, 12).map(t => {
                      const subs = t.subtasks || [];
                      const subDone = subs.filter(s => s.completed).length;
                      const open = expanded === t.id;
                      return (
                        <li key={t.id}>
                          <div className="group flex items-center gap-3 px-4 min-h-[42px] py-1.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                            onClick={() => subs.length && setExpanded(open ? null : t.id)}>
                            <Checkbox checked={!!t.completed} onChange={() => toggleTask(t)} />
                            <span className={`text-[13.5px] truncate strikethrough-draw ${t.completed ? 'strikethrough-completed' : 'text-slate-200'}`}>{t.title}</span>
                            {t.is_recurring && <Repeat2 size={12} className="text-slate-600 shrink-0" />}
                            <span className="ml-auto flex items-center gap-2.5 shrink-0">
                              {subs.length > 0 && (
                                <span className="text-[11.5px] text-slate-500 tabular-nums inline-flex items-center gap-1">
                                  {subDone}/{subs.length}
                                  <ChevronRight size={12} className="transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
                                </span>
                              )}
                              <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority] || PRIORITY_DOT.medium}`} title={`${t.priority || 'medium'} priority`} />
                            </span>
                          </div>
                          {open && (
                            <ul className="pl-11 pr-4 pb-2 space-y-1 fade-up">
                              {subs.map(s => (
                                <li key={s.id} className="flex items-center gap-2.5 h-7">
                                  <Checkbox small checked={!!s.completed} onChange={() => toggleSub(t, s)} />
                                  <span className={`text-[12.5px] truncate ${s.completed ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{s.title}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                    {tasks.length > 12 && (
                      <li className="px-4 pt-1"><LinkButton onClick={() => setActiveTab('tasks')}>+{tasks.length - 12} more</LinkButton></li>
                    )}
                  </ul>
                )}
              </Card>

              <Card className="overflow-hidden">
                <CardHeader icon={AlertCircle} title="Needs attention" meta={attention.length || null}
                  action={<LinkButton onClick={() => setActiveTab('calendar')}>Calendar <ChevronRight size={12} /></LinkButton>} />
                {attention.length === 0 ? (
                  <p className="px-4 pb-4 text-[12.5px] text-slate-500">Nothing due — no overdue cards, close deadlines or open payments.</p>
                ) : (
                  <ul className="pb-1.5">
                    {attention.slice(0, 8).map(a => {
                      const K = ATTN_KIND[a.kind];
                      return (
                        <li key={a.kind + a.id} className="group flex items-center gap-3 px-4 min-h-[48px] py-1.5 hover:bg-white/[0.02] transition-colors">
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: K.color + '1c' }}>
                            <K.icon size={13} style={{ color: K.color }} />
                          </span>
                          <button onClick={a.open} className="flex-1 min-w-0 text-left cursor-pointer">
                            <p className="text-[13.5px] text-slate-200 truncate">{a.title}</p>
                            <p className="text-[11.5px] text-slate-500 truncate">{[K.label, a.sub].filter(Boolean).join(' · ')}</p>
                          </button>
                          {a.when && (
                            <span className={`text-[11.5px] tabular-nums shrink-0 ${a.tone === 'bad' ? 'text-rose-400' : a.tone === 'warn' ? 'text-amber-400' : 'text-slate-500'}`}>{a.when}</span>
                          )}
                          {a.action && (
                            <button onClick={a.action.run}
                              className="h-7 px-2.5 rounded-md text-[12px] text-slate-300 border border-white/[0.1] hover:bg-white/[0.07] hover:text-slate-50 cursor-pointer shrink-0 transition-colors">
                              {a.action.label}
                            </button>
                          )}
                        </li>
                      );
                    })}
                    {attention.length > 8 && <li className="px-4 pt-1 pb-1 text-[12px] text-slate-500">+{attention.length - 8} more on the Calendar</li>}
                  </ul>
                )}
              </Card>
            </div>

            {/* ── side column: schedule, timer, streak ── */}
            <div className="space-y-5 min-w-0">
              <MeetingsToday setActiveTab={setActiveTab} showToast={showToast} />

              <Card>
                <CardHeader icon={Timer} title="Focus" meta={focusedToday ? formatDuration(focusedToday) + ' today' : null}
                  action={<LinkButton onClick={() => setActiveTab('focus')}>Open <ChevronRight size={12} /></LinkButton>} />
                <div className="px-4 pb-4 space-y-2">
                  {running.map(s => (
                    <div key={s.id} className="flex items-center gap-2.5 h-10 px-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04]">
                      <span className="live-dot" />
                      <span className="text-[13px] text-slate-100 truncate flex-1">{s.label}</span>
                      <span className="font-mono text-[12.5px] text-slate-300 tabular-nums">{formatDuration(durationMs(s, now), { seconds: true })}</span>
                      <button onClick={() => stopSession(s.id)} className="icon-btn !w-6 !h-6" title="Stop"><Square size={10} fill="currentColor" /></button>
                    </div>
                  ))}
                  <form onSubmit={quickStart} className="flex items-center gap-2">
                    <input value={focusLabel} onChange={e => setFocusLabel(e.target.value)}
                      placeholder={running.length ? 'Start another in parallel…' : 'What are you working on?'}
                      className="input-premium flex-1 h-9 px-3 rounded-lg text-[13px]" />
                    <button type="submit" className="btn-primary h-9 w-9 rounded-lg flex items-center justify-center cursor-pointer" title="Start timer">
                      <Play size={13} fill="currentColor" />
                    </button>
                  </form>
                  {!running.length && recents.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {recents.map(r => (
                        <button key={r.label + r.project} onClick={() => startSession(r)}
                          className="h-6 px-2 rounded-md text-[11.5px] text-slate-400 hover:text-slate-100 bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] cursor-pointer transition-colors truncate max-w-full">
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              <StreakCard version={tasksVersion} onOpen={() => setActiveTab('tasks')} />
            </div>
          </div>

          <QuoteRotator onOpen={() => setActiveTab('quotes')} />
        </div>
      </div>
    </div>
  );
}
