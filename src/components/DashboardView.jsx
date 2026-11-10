import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Check, ChevronRight, ChevronLeft, Plus, Repeat2, Play, Square, CalendarClock, KanbanSquare, Wallet, Quote,
  CheckSquare, Timer, ArrowUpRight, ArrowDownRight, Flame,
} from 'lucide-react';
import {
  getTasksForDate, getTasksForDateSync, toggleTaskCompletion, toggleSubtaskCompletion,
  getStreaks, getCompletionHistory, getHackathonProgress,
} from '../services/tasks';
import {
  sessions, isRunning, durationMs, totalForDay, formatDuration, useNow, startSession, stopSession, recentLabels,
} from '../services/focus';
import {
  transactions, useMoneySettings, formatMoney, summarizeMonth, monthKey, spentOn, ymd, categoryMeta,
} from '../services/money';
import { board, dueInfo, moveItem } from '../services/board';
import { quotes, dayOffset } from '../services/quotes';
import { PageHeader, Card, CardHeader, LinkButton, Stat, Progress, Empty } from './ui';

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks(getTasksForDateSync(todayStr));
  }, [tasksVersion, todayStr]);

  useEffect(() => {
    const onNew = () => taskInputRef.current?.focus();
    window.addEventListener('anonvault:new', onNew);
    return () => window.removeEventListener('anonvault:new', onNew);
  }, []);

  const toggleTask = async task => {
    const next = !task.completed;
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, completed: next, subtasks: (t.subtasks || []).map(st => ({ ...st, completed: next })) } : t));
    try { await toggleTaskCompletion(task, todayStr); onTasksChange?.(); }
    catch { await loadTodayTasks(); }
  };

  const toggleSub = async (task, sub) => {
    const next = !sub.completed;
    setTasks(prev => prev.map(t => {
      if (t.id !== task.id) return t;
      const subs = (t.subtasks || []).map(st => st.id === sub.id ? { ...st, completed: next } : st);
      return { ...t, subtasks: subs, completed: subs.length > 0 && subs.every(s => s.completed) };
    }));
    try { await toggleSubtaskCompletion(task, sub.id, todayStr); onTasksChange?.(); }
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

  const pulse = useMemo(() => {
    const streaks = getStreaks(180);
    const history = getCompletionHistory(7);
    const totals = history.reduce((a, d) => ({ s: a.s + d.scheduled, c: a.c + d.completed }), { s: 0, c: 0 });
    return { streak: streaks.current, weekRate: totals.s ? Math.round((totals.c / totals.s) * 100) : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksVersion]);

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
  const month = useMemo(() => summarizeMonth(allTx, monthKey()), [allTx]);
  const spentToday = spentOn(allTx, todayStr);
  const budget = Number(settings.monthlyBudget) || 0;
  const fmt = n => formatMoney(n, settings.currency);

  /* ── deadlines & projects ── */
  const hackProgress = useMemo(() => getHackathonProgress(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasksVersion]);
  const upcoming = (applications || [])
    .filter(a => a && a.status !== 'rejected')
    .map(a => ({ ...a, days: daysUntil(a.deadline) }))
    .filter(a => a.days != null && a.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 4);
  const boardItems = board.useAll();
  const reminders = boardItems
    .filter(i => i.status !== 'done')
    .map(i => ({ i, due: dueInfo(i) }))
    .filter(r => r.i.status === 'doing' || (r.due && r.due.days <= 2))
    .sort((a, b) => (a.due?.days ?? 99) - (b.due?.days ?? 99))
    .slice(0, 6);
  const boardOpen = boardItems.filter(i => i.status !== 'done').length;

  const clock = new Date(now);
  const hour = clock.getHours();
  const summaryParts = [];
  if (tasks.length) summaryParts.push(done === tasks.length ? 'All tasks done' : `${tasks.length - done} task${tasks.length - done === 1 ? '' : 's'} left`);
  if (upcoming[0]?.days != null && upcoming[0].days <= 7) summaryParts.push(`${upcoming[0].name} due ${upcoming[0].days === 0 ? 'today' : `in ${upcoming[0].days}d`}`);
  if (running.length) summaryParts.push(`${running.length} timer${running.length === 1 ? '' : 's'} running`);

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Today" subtitle={clock.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        onMenuToggle={onMenuToggle} onLock={onLock} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6 space-y-5 reveal-stagger">

          {/* Greeting */}
          <div className="flex items-end justify-between gap-4 pt-1">
            <div className="min-w-0">
              <h2 className="text-[24px] sm:text-[26px] font-semibold tracking-[-0.03em] text-slate-50">{greetingFor(hour)}.</h2>
              <p className="text-[14px] text-slate-500 mt-0.5 truncate">
                {summaryParts.length ? summaryParts.join(' · ') : 'Nothing scheduled yet. Add a task or start a timer.'}
              </p>
            </div>
            <span className="hidden sm:block font-mono text-[13px] text-slate-500 tabular-nums shrink-0">
              {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Tasks" value={`${done}/${tasks.length}`} onClick={() => setActiveTab('tasks')}
              hint={pulse.weekRate != null ? `${pulse.weekRate}% done over 7 days` : 'No history yet'}>
              <Progress className="mt-1.5" value={tasks.length ? done / tasks.length : 0} tone={tasks.length && done === tasks.length ? 'good' : 'neutral'} height={3} />
            </Stat>
            <Stat label="Focused today" value={formatDuration(focusedToday)} onClick={() => setActiveTab('focus')}
              hint={running.length ? `${running.length} running now` : 'No timer running'} tone={running.length ? 'good' : undefined} />
            <Stat label="Spent today" value={fmt(spentToday)} onClick={() => setActiveTab('money')}
              hint={budget ? `${fmt(Math.max(0, budget - month.expense))} left this month` : `${fmt(month.expense)} this month`} />
            <Stat label="Streak" value={<span className="inline-flex items-center gap-1.5">{pulse.streak}<Flame size={16} className={pulse.streak ? 'text-amber-400' : 'text-slate-600'} /></span>}
              onClick={() => setActiveTab('review')} hint="Days with every task done" />
          </div>

          <QuoteRotator onOpen={() => setActiveTab('quotes')} />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 items-start">
            <div className="md:col-span-1 lg:col-span-2 space-y-5 min-w-0">
            {/* Tasks */}
            <Card className="overflow-hidden">
              <CardHeader icon={CheckSquare} title="Today's tasks" meta={tasks.length ? `${done}/${tasks.length}` : null}
                action={<LinkButton onClick={() => setActiveTab('tasks')}>Open checklist <ChevronRight size={12} /></LinkButton>} />
              <form onSubmit={addTask} className="mx-4 mb-2 flex items-center gap-2 h-9 px-2.5 rounded-lg border border-dashed border-white/[0.1] focus-within:border-white/[0.2] focus-within:border-solid transition-colors">
                <Plus size={14} className="text-slate-500" />
                <input ref={taskInputRef} value={newTask} onChange={e => setNewTask(e.target.value)}
                  placeholder="Add a task for today…"
                  className="flex-1 bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 outline-none" />
                {newTask && <span className="kbd">↵</span>}
              </form>

              {tasks.length === 0 ? (
                <Empty icon={CheckSquare} title="No tasks for today" body="Add one above, or set up recurring tasks in the checklist." />
              ) : (
                <ul className="pb-2">
                  {sortedTasks.slice(0, 12).map(t => {
                    const subs = t.subtasks || [];
                    const subDone = subs.filter(s => s.completed).length;
                    const open = expanded === t.id;
                    return (
                      <li key={t.id}>
                        <div className="group flex items-center gap-3 px-4 min-h-[40px] py-1.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                          onClick={() => subs.length && setExpanded(open ? null : t.id)}>
                          <Checkbox checked={!!t.completed} onChange={() => toggleTask(t)} />
                          <span className={`text-[13.5px] truncate strikethrough-draw ${t.completed ? 'strikethrough-completed' : 'text-slate-200'}`}>{t.title}</span>
                          {t.is_recurring && <Repeat2 size={12} className="text-slate-600 shrink-0" title="Recurring" />}
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

            {/* Board: what's in progress and what's due */}
            <Card>
              <CardHeader icon={KanbanSquare} title="Board" meta={boardOpen ? `${boardOpen} open` : null}
                action={<LinkButton onClick={() => (onOpenBoard ? onOpenBoard() : setActiveTab('board'))}>Open board <ChevronRight size={12} /></LinkButton>} />
              {reminders.length === 0 ? (
                <p className="px-4 pb-4 text-[12.5px] text-slate-500">
                  {boardOpen ? 'Nothing in progress or due in the next two days.' : 'Add issues and reminders on the Board — anything with a due date shows up here.'}
                </p>
              ) : (
                <ul className="pb-2">
                  {reminders.map(({ i, due }) => (
                    <li key={i.id} className="group flex items-center gap-3 px-4 min-h-[40px] py-1.5 hover:bg-white/[0.02] transition-colors">
                      <Checkbox checked={false} onChange={() => { moveItem(i.id, 'done'); showToast?.('success', 'Done', i.title, 5000, { label: 'Undo', onClick: () => moveItem(i.id, i.status) }); }} />
                      <span className="text-[13.5px] text-slate-200 truncate">{i.title}</span>
                      {i.label && <span className="hidden sm:inline text-[11.5px] text-slate-500 px-1.5 h-5 leading-5 rounded-md bg-white/[0.04] border border-white/[0.06] truncate max-w-[120px]">{i.label}</span>}
                      <span className="ml-auto flex items-center gap-2 shrink-0">
                        {i.status === 'doing' && <span className={`text-[11.5px] text-amber-400 ${due ? 'hidden sm:inline' : ''}`}>In progress</span>}
                        {due && <span className={`text-[11.5px] ${due.tone === 'bad' ? 'text-rose-400' : due.tone === 'warn' ? 'text-amber-400' : 'text-slate-500'}`}>{due.text}</span>}
                        <button onClick={() => { startSession({ label: i.title, project: i.label || null }); showToast?.('success', 'Timer started', i.title); }}
                          className="icon-btn !w-6 !h-6 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" title="Track time on this"><Play size={10} fill="currentColor" /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            </div>

            <div className="space-y-5 min-w-0">
              {/* Focus */}
              <Card>
                <CardHeader icon={Timer} title="Now" meta={focusedToday ? formatDuration(focusedToday) + ' today' : null}
                  action={<LinkButton onClick={() => setActiveTab('focus')}>Focus <ChevronRight size={12} /></LinkButton>} />
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

              {/* Money */}
              <Card>
                <CardHeader icon={Wallet} title="Money" meta={new Date().toLocaleDateString(undefined, { month: 'long' })}
                  action={<LinkButton onClick={() => setActiveTab('money')}>Log <Plus size={12} /></LinkButton>} />
                <div className="px-4 pb-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[20px] font-semibold tracking-[-0.02em] tabular-nums text-slate-100">{fmt(month.expense)}</span>
                    <span className="text-[12px] text-slate-500">{budget ? `of ${fmt(budget)}` : 'spent'}</span>
                  </div>
                  {budget > 0 && (
                    <Progress className="mt-2" value={month.expense / budget}
                      tone={month.expense > budget ? 'bad' : month.expense / budget > 0.85 ? 'warn' : 'neutral'} height={3} />
                  )}
                  <div className="mt-3 space-y-1">
                    {month.rows.slice(0, 4).map(t => {
                      const c = categoryMeta(t.category);
                      const income = t.type === 'income';
                      return (
                        <div key={t.id} className="flex items-center gap-2 h-7 text-[12.5px]">
                          {income ? <ArrowDownRight size={12} className="text-emerald-400" /> : <ArrowUpRight size={12} className="text-slate-500" />}
                          <span className="text-slate-300 truncate flex-1">{t.note || c.label}</span>
                          <span className={`tabular-nums ${income ? 'text-emerald-400' : 'text-slate-300'}`}>{income ? '+' : '−'}{fmt(t.amount)}</span>
                        </div>
                      );
                    })}
                    {month.rows.length === 0 && <p className="text-[12.5px] text-slate-500 py-2">No transactions this month yet.</p>}
                  </div>
                </div>
              </Card>

              {/* Deadlines */}
              <Card>
                <CardHeader icon={CalendarClock} title="Up next"
                  action={<LinkButton onClick={() => setActiveTab('timeline')}>Hackathons <ChevronRight size={12} /></LinkButton>} />
                <div className="px-2 pb-2">
                  {upcoming.length === 0 && <p className="text-[12.5px] text-slate-500 px-2 pb-2">No upcoming deadlines.</p>}
                  {upcoming.map(a => {
                    const prog = hackProgress[a.id];
                    return (
                      <button key={a.id} onClick={() => onSelectHackathon?.(a.id)}
                        className="w-full flex items-center gap-3 px-2 h-11 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer text-left">
                        <div className={`w-9 text-center shrink-0 text-[12px] font-medium tabular-nums ${a.days <= 2 ? 'text-rose-400' : a.days <= 7 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {a.days === 0 ? 'Today' : `${a.days}d`}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-slate-200 truncate">{a.name}</p>
                          {prog && <p className="text-[11.5px] text-slate-500 tabular-nums">{prog.done}/{prog.total} steps</p>}
                        </div>
                        <ChevronRight size={13} className="text-slate-600" />
                      </button>
                    );
                  })}
                </div>
              </Card>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
