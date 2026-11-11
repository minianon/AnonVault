import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Trash2, Edit3, X, ChevronDown, Check, RotateCcw,
  ChevronLeft, ChevronRight as ChevronRightIcon, Repeat2,
  ListChecks, EyeOff, CheckCheck, CalendarRange, NotebookPen, Flag, Calendar, CheckSquare
} from 'lucide-react';
import {
  getTasksForDate, getTasksForDateSync, addTask, updateTask, deleteTask,
  toggleTaskCompletion, toggleSubtaskCompletion
} from '../services/tasks';
import { useShortcutHooks } from '../utils/useShortcutHooks';
import { Play as PlayIcon, Square as StopIcon } from 'lucide-react';
import { sessions as focusSessions, startSession, stopSession, durationMs, formatDuration, useNow } from '../services/focus';
import { getHabitGrid, getStreakDetails } from '../services/tasks';
import { Zap } from 'lucide-react';
import { getNote, setNote } from '../services/journal';
import { usePref, getPref } from '../services/prefs';
import { PageHeader, Card, CardHeader, Empty, Progress, Select, Modal, StreakIcon } from './ui';
import { useHoverTip } from '../utils/useHoverTip';
import { EditorLayout, PropRow, TitleInput, SectionTitle, DueField, ComposerShell } from './editor';
import { parseCapture, parseRepeat, formatWhen } from '../services/nlp';

/* ── helpers ───────────────────────────────────────────── */
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function todayStr() { return toDateStr(new Date()); }

function formatDisplayDate(dateStr) {
  const today     = todayStr();
  const yesterday = toDateStr(new Date(Date.now() - 86400000));
  const tomorrow  = toDateStr(new Date(Date.now() + 86400000));
  if (dateStr === today)     return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  if (dateStr === tomorrow)  return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatDayFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_META  = {
  high:   { label: 'High',   dot: 'bg-rose-400'  },
  medium: { label: 'Medium', dot: 'bg-amber-400' },
  low:    { label: 'Low',    dot: 'bg-slate-600' },
};

const RECUR_SHORT = { daily: 'Daily', weekdays: 'Weekdays', weekends: 'Weekends' };

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ── Checkbox ────────────────────────────────────────────── */
function Checkbox({ checked, onChange, size = 'md', disabled = false }) {
  const small = size === 'sm';
  const sz = small ? 'w-[15px] h-[15px] rounded-[4px]' : 'w-[17px] h-[17px] rounded-[5px]';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); if (!disabled) onChange(); }}
      className={`${sz} shrink-0 flex items-center justify-center border transition-colors duration-150 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${
        checked ? 'bg-slate-100 border-slate-100 text-slate-950' : 'border-white/[0.22] hover:border-white/[0.45] bg-transparent'
      }`}
    >
      <Check size={small ? 10 : 11} strokeWidth={3}
        style={{ opacity: checked ? 1 : 0, transform: checked ? 'scale(1)' : 'scale(0.6)', transition: 'all .18s var(--ease)' }} />
    </button>
  );
}

/* ── Task row ────────────────────────────────────────────── */
/* A focus timer tied to this task: the play button starts one, and while
   it runs the row shows the elapsed time (click to stop). */
function useTaskTimer(task) {
  const all = focusSessions.useAll();
  return all.find(s => !s.ended_at && s.task_id === task.id) || null;
}
function RunningPill({ run }) {
  const now = useNow(1000, true);
  return (
    <button onClick={e => { e.stopPropagation(); stopSession(run.id); }} title="Stop timer"
      className="h-6 px-2 rounded-md inline-flex items-center gap-1.5 text-[11.5px] font-mono tabular-nums text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 hover:bg-emerald-400/15 cursor-pointer shrink-0">
      <StopIcon size={8} fill="currentColor" /> {formatDuration(durationMs(run, now), { seconds: true })}
    </button>
  );
}

/* Streaks and habits, at the bottom of Checklist.

   Top: the overall streak (days in a row with every task done), how today
   stands, and the next milestone. Then a calendar heatmap — weeks across,
   Mon–Sun down, greener the more got done — for every task together or
   for one habit. Below it, each recurring task with its last 7 days, its
   streak and how often it gets done; click one to see its own heatmap. */
const HEAT = {
  empty:  'rgba(255,255,255,0.045)',
  missed: 'rgba(245,118,138,0.38)',
  l1: 'rgba(79,209,160,0.22)',
  l2: 'rgba(79,209,160,0.42)',
  l3: 'rgba(79,209,160,0.68)',
  l4: 'var(--ok)',
};
const HEAT_RANGES = [{ value: 91, label: '3M' }, { value: 182, label: '6M' }, { value: 365, label: '1Y' }];
const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const fmtDay = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Overall day → heat level. */
function overallLevel(c) {
  if (c.state === 'none') return 'empty';
  if (c.state === 'today') return c.done ? (c.done / c.due < 0.5 ? 'l1' : 'l2') : 'today';
  if (c.done === 0) return 'missed';
  const r = c.done / c.due;
  return r >= 1 ? 'l4' : r >= 0.67 ? 'l3' : r >= 0.34 ? 'l2' : 'l1';
}
const habitLevel = c => (c.state === 'done' ? 'l4' : c.state === 'missed' ? 'missed' : c.state === 'pending' ? 'today' : 'empty');

/** GitHub-style grid: one column per week (Mon at the top), month names above. */
function CalendarHeatmap({ cells, selected, onPickDate, describe }) {
  const gap = 3;
  const tip = useHoverTip();
  const scrollRef = useRef(null);
  const [width, setWidth] = useState(0);
  // Squares grow to fill the card (up to 22px); a year on a phone scrolls.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const weeks = useMemo(() => {
    if (!cells.length) return [];
    const first = new Date(cells[0].date + 'T00:00:00');
    const lead = (first.getDay() + 6) % 7; // blanks before the first Monday
    const flat = [...Array(lead).fill(null), ...cells];
    while (flat.length % 7) flat.push(null); // rest of this week (future)
    const out = [];
    for (let i = 0; i < flat.length; i += 7) out.push(flat.slice(i, i + 7));
    return out;
  }, [cells]);

  const cell = width ? Math.max(10, Math.min(22, Math.floor((width - 30) / Math.max(1, weeks.length)) - gap)) : 12;
  // Start scrolled to today (the right edge) when it doesn't fit.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [cells.length, cell]);

  // Month name over the first week that contains the 1st (and the first column).
  const monthAt = weeks.map((w, i) => {
    const firstOfMonth = w.find(c => c && c.date.endsWith('-01'));
    if (firstOfMonth) return new Date(firstOfMonth.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short' });
    if (i === 0) {
      const c = w.find(Boolean);
      // Skip the label if a new month starts within two columns (avoids overlap).
      const soon = weeks.slice(1, 3).some(x => x.some(y => y && y.date.endsWith('-01')));
      return c && !soon ? new Date(c.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short' }) : '';
    }
    return '';
  });

  return (
    <div ref={scrollRef} className="overflow-x-auto pb-1 -mx-1 px-1">
      <div className="inline-flex flex-col min-w-max">
        <div className="flex" style={{ paddingLeft: 30, height: 16 }}>
          {weeks.map((_, i) => (
            <div key={i} className="relative shrink-0" style={{ width: cell + gap }}>
              {monthAt[i] && <span className="absolute left-0 top-0 text-[10.5px] text-slate-500 whitespace-nowrap">{monthAt[i]}</span>}
            </div>
          ))}
        </div>
        <div className="flex">
          <div className="flex flex-col shrink-0" style={{ width: 30, gap }}>
            {WEEKDAY_LABELS.map((l, i) => (
              <span key={i} className="text-[10px] text-slate-500 leading-none flex items-center" style={{ height: cell }}>{l}</span>
            ))}
          </div>
          <div className="flex" style={{ gap }}>
            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap }}>
                {w.map((c, di) => c ? (
                  <button key={c.date} type="button" onClick={() => onPickDate?.(c.date)}
                    {...tip.bind(fmtDay(c.date), describe(c))} aria-label={`${fmtDay(c.date)}: ${describe(c)}`}
                    className={`rounded-[3px] cursor-pointer transition-[transform,box-shadow] hover:scale-[1.25] hover:z-10 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
                      ${c.level === 'today' ? 'border border-dashed border-white/35' : ''}
                      ${c.date === selected ? 'ring-[1.5px] ring-white/80' : ''}`}
                    style={{ width: cell, height: cell, background: c.level === 'today' ? 'transparent' : HEAT[c.level] }} />
                ) : <span key={'x' + di} style={{ width: cell, height: cell }} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
      {tip.node}
    </div>
  );
}

/** Last 7 days of one habit as dots, oldest first. */
function WeekDots({ cells, tip }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {cells.slice(-7).map(c => (
        <span key={c.date} {...tip.bind(fmtDay(c.date), c.state === 'off' ? 'Not due' : c.state === 'pending' ? 'Due today' : c.state === 'done' ? 'Done' : 'Missed')}
          className={`w-[14px] h-[14px] rounded-full flex items-center justify-center ${
            c.state === 'done' ? 'bg-[var(--ok)] text-slate-950'
            : c.state === 'missed' ? 'border border-rose-400/60'
            : c.state === 'pending' ? 'border border-dashed border-white/40'
            : ''}`}>
          {c.state === 'done' && <Check size={9} strokeWidth={3.5} />}
          {c.state === 'off' && <span className="w-[4px] h-[4px] rounded-full bg-white/15" />}
        </span>
      ))}
    </div>
  );
}

function HabitHeatmap({ version, selected, onPickDate }) {
  const [range, setRange] = useState(() => {
    const saved = Number(localStorage.getItem('anonvault_heatmap_range'));
    return HEAT_RANGES.some(r => r.value === saved) ? saved : 182;
  });
  const [subject, setSubject] = useState('all'); // 'all' or a habit's task id
  const tip = useHoverTip();
  const changeRange = v => { setRange(v); try { localStorage.setItem('anonvault_heatmap_range', String(v)); } catch { /* fine */ } };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => getHabitGrid(range, 365), [range, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const st = useMemo(() => getStreakDetails(365, range), [range, version]);
  if (!rows.length && !st.longest && !st.today.due) return null;

  const habit = subject === 'all' ? null : rows.find(r => r.id === subject) || null;
  const heatCells = habit
    ? habit.cells.map(c => ({ ...c, level: habitLevel(c) }))
    : st.days.map(c => ({ ...c, level: overallLevel(c) }));
  const describe = habit
    ? c => (c.state === 'off' ? 'not due' : c.state === 'pending' ? 'due today' : c.state)
    : c => (c.state === 'none' ? 'nothing due' : c.state === 'today' ? `${c.done} of ${c.due} done so far` : `${c.done} of ${c.due} done`);

  // Footer line, like "48 clean days in the last 6 months".
  const rangeLabel = range <= 91 ? '3 months' : range <= 182 ? '6 months' : 'year';
  const summary = habit
    ? `${habit.cells.filter(c => c.state === 'done').length} times done in the last ${rangeLabel}${habit.rate != null ? ` · ${Math.round(habit.rate * 100)}% of due days` : ''}`
    : `${st.days.filter(c => c.state === 'clean').length} clean days in the last ${rangeLabel}`;

  const left = st.today.due - st.today.done;
  const todayLine = st.today.state === 'none' ? 'Nothing due today — your streak carries on.'
    : st.today.state === 'clean' ? (st.current > 1 ? `All done. ${st.current} days in a row.` : 'All done today. Streak started.')
    : `${left} task${left === 1 ? '' : 's'} left to make it ${st.current + 1}.`;
  const mile = st.next;
  const milePct = mile ? (st.current - mile.from) / (mile.at - mile.from) : 1;
  const pctOf = r => (r == null ? '—' : Math.round(r * 100) + '%');

  return (
    <Card className="overflow-hidden">
      <CardHeader icon={Zap} title="Streaks & habits" />

      {/* Overall streak, today, next milestone */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px mx-4 mb-4 rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.06]">
        <div className="bg-[var(--surface)] px-4 py-3">
          <p className="text-[11.5px] text-slate-500">Current streak</p>
          <p className="mt-0.5 flex items-center gap-1.5">
            <span className="text-[26px] leading-8 font-semibold tabular-nums text-slate-50">{st.current}</span>
            <StreakIcon active={st.current > 0} size={18} />
            <span className="text-[12.5px] text-slate-500 ml-0.5">day{st.current === 1 ? '' : 's'}</span>
          </p>
          <p className="text-[11.5px] text-slate-500 mt-0.5">
            {st.best && st.current > 1
              ? <span className="text-emerald-300">Personal best</span>
              : <>Best <span className="tabular-nums text-slate-300">{st.longest}</span></>}
            <span className="text-slate-600"> · every task done</span>
          </p>
        </div>
        <div className="bg-[var(--surface)] px-4 py-3">
          <p className="text-[11.5px] text-slate-500">Today</p>
          <p className="mt-0.5 text-[20px] leading-8 font-semibold tabular-nums text-slate-100">
            {st.today.due ? <>{st.today.done}<span className="text-slate-500 text-[15px]">/{st.today.due}</span></> : '—'}
          </p>
          {st.today.due > 0 && <Progress className="mt-1" value={st.today.done / st.today.due} tone={st.today.state === 'clean' ? 'good' : 'neutral'} height={3} />}
          <p className={`text-[11.5px] mt-1.5 ${st.today.state === 'clean' ? 'text-emerald-300' : st.today.state === 'progress' ? 'text-amber-300' : 'text-slate-500'}`}>{todayLine}</p>
        </div>
        <div className="bg-[var(--surface)] px-4 py-3">
          <p className="text-[11.5px] text-slate-500">Next milestone</p>
          {mile ? (
            <>
              <p className="mt-0.5 text-[20px] leading-8 font-semibold tabular-nums text-slate-100">{mile.at} <span className="text-[13px] font-normal text-slate-500">days</span></p>
              <Progress className="mt-1" value={milePct} height={3} />
              <p className="text-[11.5px] text-slate-500 mt-1.5">{mile.at - st.current} more clean day{mile.at - st.current === 1 ? '' : 's'} to go</p>
            </>
          ) : <p className="mt-1 text-[13px] text-emerald-300">Every milestone reached.</p>}
        </div>
      </div>

      {/* Heatmap */}
      <div className="px-4 pb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto flex-1 -mx-1 px-1">
            {[{ id: 'all', title: 'Every task' }, ...rows].map(r => (
              <button key={r.id} onClick={() => setSubject(r.id)} aria-pressed={subject === r.id}
                className={`h-7 px-2.5 rounded-md text-[12px] whitespace-nowrap cursor-pointer border transition-colors ${
                  subject === r.id ? 'bg-white/[0.08] border-white/[0.14] text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>
                {r.title}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] shrink-0">
            {HEAT_RANGES.map(r => (
              <button key={r.value} onClick={() => changeRange(r.value)} aria-pressed={range === r.value}
                className={`h-6 px-2 rounded text-[11.5px] cursor-pointer transition-colors ${range === r.value ? 'bg-white/[0.1] text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>{r.label}</button>
            ))}
          </div>
        </div>

        <CalendarHeatmap cells={heatCells} selected={selected} onPickDate={onPickDate} describe={describe} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2.5 text-[11.5px] text-slate-500">
          <span>{summary}</span>
          {/* Gray = nothing was due that day (e.g. a weekly habit's other days), not a miss. */}
          <span className="ml-auto inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><span className="w-[11px] h-[11px] rounded-[3px]" style={{ background: HEAT.empty }} />Not due</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-[11px] h-[11px] rounded-[3px]" style={{ background: HEAT.missed }} />Missed</span>
            {habit ? (
              <span className="inline-flex items-center gap-1.5"><span className="w-[11px] h-[11px] rounded-[3px]" style={{ background: HEAT.l4 }} />Done</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <span className="mr-0.5">Less</span>
                {['l1', 'l2', 'l3', 'l4'].map(l => <span key={l} className="w-[11px] h-[11px] rounded-[3px]" style={{ background: HEAT[l] }} />)}
                <span className="ml-0.5">More done</span>
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Habits */}
      {rows.length > 0 && (
        <div className="border-t border-white/[0.06]">
          <div className="flex items-center gap-3 px-4 h-9 text-[11px] text-slate-500 uppercase tracking-wide">
            <span className="flex-1">Habits</span>
            <span className="hidden sm:flex items-center gap-1.5 shrink-0 normal-case tracking-normal">
              {(rows[0]?.cells || []).slice(-7).map(c => (
                <span key={c.date} className="w-[14px] text-center">{new Date(c.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
              ))}
            </span>
            <span className="w-[64px] text-right shrink-0">Streak</span>
            <span className="w-[40px] text-right shrink-0">Done</span>
          </div>
          <ul className="pb-2">
            {rows.map(r => (
              <li key={r.id}>
                <button onClick={() => setSubject(subject === r.id ? 'all' : r.id)} aria-pressed={subject === r.id}
                  className={`w-full flex items-center gap-3 px-4 min-h-[40px] py-1.5 text-left cursor-pointer transition-colors ${
                    subject === r.id ? 'bg-white/[0.05]' : 'hover:bg-white/[0.025]'}`}>
                  <span className="flex-1 min-w-0 text-[13px] text-slate-200 truncate">{r.title}</span>
                  <span className="hidden sm:block"><WeekDots cells={r.cells} tip={tip} /></span>
                  <span className={`w-[64px] shrink-0 inline-flex items-center justify-end gap-1 text-[12px] tabular-nums ${r.streak ? 'text-slate-100' : 'text-slate-600'}`}
                    {...tip.bind(`${r.streak} day streak`, `Best ${r.best}`)}>
                    <StreakIcon active={r.streak > 0} size={11} />{r.streak}
                    {r.best > r.streak && <span className="text-slate-600 text-[11px]">/{r.best}</span>}
                  </span>
                  <span className={`w-[40px] shrink-0 text-right text-[12px] tabular-nums ${r.rate == null ? 'text-slate-600' : r.rate >= 0.8 ? 'text-emerald-400' : r.rate < 0.4 ? 'text-rose-400' : 'text-amber-400'}`}
                    {...tip.bind(`${pctOf(r.rate)} done`, `of due days in the last ${rangeLabel}`)}>{pctOf(r.rate)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tip.node}
    </Card>
  );
}

function TaskCard({ task, onToggle, onToggleSub, onEdit, onDelete, onCancel, hackathonName }) {
  const run = useTaskTimer(task);
  const [collapsed, setCollapsed] = useState(false);
  const hasSubtasks  = task.subtasks && task.subtasks.length > 0;
  const completedSubs = hasSubtasks ? task.subtasks.filter(s => s.completed).length : 0;
  const allSubsDone  = hasSubtasks && completedSubs === task.subtasks.length;
  const p            = PRIORITY_META[task.priority] || PRIORITY_META.low;
  const showThread   = hasSubtasks && !collapsed;
  const hasMeta      = hasSubtasks || task.is_recurring || hackathonName;

  return (
    <li className="group">
      <div className="flex items-center gap-3 px-4 min-h-[44px] py-2 hover:bg-white/[0.02] transition-colors">
        <Checkbox
          checked={task.completed}
          onChange={() => onToggle(task)}
          disabled={false}
        />

        <div className="flex-1 min-w-0">
          <span title={task.title}
            className={`block text-[13.5px] leading-snug truncate strikethrough-draw ${
              task.completed ? 'strikethrough-completed' : 'text-slate-200'
            }`}>
            {task.title}
          </span>

          {hasMeta && (
            <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11.5px] text-slate-500 min-w-0">
              {hasSubtasks && (
                <button
                  onClick={e => { e.stopPropagation(); setCollapsed(c => !c); }}
                  className="inline-flex items-center gap-1 tabular-nums hover:text-slate-300 transition-colors cursor-pointer"
                  title={collapsed ? 'Expand' : 'Collapse'}
                >
                  <span className={allSubsDone ? 'text-emerald-400' : ''}>
                    {completedSubs}/{task.subtasks.length} subtasks
                  </span>
                  <ChevronDown size={12} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                </button>
              )}
              {task.is_recurring && (
                <span className="inline-flex items-center gap-1">
                  <Repeat2 size={11} />
                  {RECUR_SHORT[task.recurrence] || 'Weekly'}
                </span>
              )}
              {/* Which hackathon this step belongs to */}
              {hackathonName && (
                <span className="inline-flex items-center gap-1 min-w-0 max-w-[180px]">
                  <CalendarRange size={11} className="shrink-0" />
                  <span className="truncate">{hackathonName}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {run && <RunningPill run={run} />}

        {/* Row actions — always visible on touch, on hover from sm up */}
        <div className="flex items-center shrink-0 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {!run && !task.completed && (
            <button
              onClick={e => { e.stopPropagation(); startSession({ label: task.title, task_id: task.id, project: hackathonName || null }); }}
              className="icon-btn !w-7 !h-7 hover:!text-emerald-400 cursor-pointer"
              title="Start a focus timer"
              aria-label="Start a focus timer"
            >
              <PlayIcon size={12} />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onCancel(task); }}
            className="icon-btn !w-7 !h-7 hover:!text-amber-400 cursor-pointer"
            title="Cancel for today"
            aria-label="Cancel for today"
          >
            <EyeOff size={13} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onEdit(task); }}
            className="icon-btn !w-7 !h-7 cursor-pointer"
            title="Edit"
            aria-label="Edit"
          >
            <Edit3 size={13} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(task); }}
            className="icon-btn !w-7 !h-7 hover:!text-rose-400 cursor-pointer"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Priority — quiet dot, label from sm up */}
        <span className="flex items-center gap-1.5 shrink-0 sm:w-[64px]" title={`${p.label} priority`}>
          <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
          <span className="hidden sm:inline text-[12px] text-slate-500">{p.label}</span>
        </span>
      </div>

      {/* ── Subtask list ── */}
      {showThread && (
        <ul className="pl-11 pr-4 pb-2 space-y-0.5 fade-up">
          {task.subtasks.map(st => (
            <li key={st.id} className="flex items-center gap-2.5 min-h-[28px]">
              <Checkbox
                checked={st.completed}
                onChange={() => onToggleSub(task, st.id)}
                size="sm"
              />
              <span className={`min-w-0 truncate text-[12.5px] strikethrough-draw ${
                st.completed ? 'strikethrough-completed' : 'text-slate-300'
              }`}>
                {st.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* ── Editor options ──────────────────────────────────────── */
const PRIORITY_OPTS = [
  { value: 'high',   label: 'High',   color: '#f5768a' },
  { value: 'medium', label: 'Medium', color: '#f0b445' },
  { value: 'low',    label: 'Low',    color: '#6c6c75' },
];

// 'none' is the one-off case; everything else maps onto `recurrence`.
const REPEAT_OPTS = [
  { value: 'none',     label: 'One-off'                  },
  { value: 'daily',    label: 'Daily'                    },
  { value: 'weekdays', label: 'Weekdays', hint: 'Mon–Fri' },
  { value: 'weekends', label: 'Weekends', hint: 'Sat–Sun' },
  { value: 'weekly',   label: 'Custom days'              },
];

const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const newSubtaskId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ── Subtasks editor ─────────────────────────────────────────
   Plain rows you can type into, plus a dashed "add" row like LinksEditor's.
   Enter on the add row adds and stays there for the next one; Enter on a
   row opens a new one below it; Backspace on an empty row removes it. */
function SubtasksEditor({ subtasks, onChange, draft, onDraft, onCommitDraft }) {
  const rowRefs  = useRef({});
  const draftRef = useRef(null);
  const focusAfter = useRef(null);

  useEffect(() => {
    const id = focusAfter.current;
    if (id == null) return;
    focusAfter.current = null;
    (id === '__draft' ? draftRef.current : rowRefs.current[id])?.focus();
  }, [subtasks]);

  const setTitle = (i, value) => onChange(subtasks.map((s, j) => (j === i ? { ...s, title: value } : s)));
  const remove = i => onChange(subtasks.filter((_, j) => j !== i));

  const onRowKey = (e, i) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (i === subtasks.length - 1) { draftRef.current?.focus(); return; }
      const st = { id: newSubtaskId(), title: '' };
      focusAfter.current = st.id;
      onChange([...subtasks.slice(0, i + 1), st, ...subtasks.slice(i + 1)]);
    } else if (e.key === 'Backspace' && !subtasks[i].title) {
      e.preventDefault();
      focusAfter.current = i > 0 ? subtasks[i - 1].id : '__draft';
      remove(i);
    }
  };

  return (
    <section>
      <SectionTitle right={subtasks.length ? subtasks.length : null}>Subtasks</SectionTitle>
      <div className="space-y-1">
        {subtasks.map((st, i) => (
          <div key={st.id || i}
            className="group/st flex items-center gap-2.5 h-9 px-2.5 -mx-2.5 rounded-lg hover:bg-white/[0.03] focus-within:bg-white/[0.03] transition-colors">
            <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
            <input ref={el => { rowRefs.current[st.id] = el; }}
              value={st.title} onChange={e => setTitle(i, e.target.value)} onKeyDown={e => onRowKey(e, i)}
              placeholder="Subtask" aria-label={`Subtask ${i + 1}`}
              className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-200 placeholder:text-slate-600 outline-none" />
            <button type="button" onClick={() => remove(i)}
              className="icon-btn !w-7 !h-7 shrink-0 hover:!text-rose-400 cursor-pointer sm:opacity-0 sm:group-hover/st:opacity-100 focus:opacity-100"
              title="Remove subtask" aria-label="Remove subtask">
              <X size={12} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 h-9 px-2.5 -mx-2.5 rounded-lg border border-dashed border-white/[0.08] focus-within:border-white/[0.18] focus-within:border-solid transition-colors">
          <Plus size={13} className="text-slate-500 shrink-0" />
          <input ref={draftRef} value={draft} onChange={e => onDraft(e.target.value)} onBlur={onCommitDraft}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); onCommitDraft(); }
              else if (e.key === 'Backspace' && !draft && subtasks.length) {
                e.preventDefault(); rowRefs.current[subtasks[subtasks.length - 1].id]?.focus();
              }
            }}
            placeholder="Add subtask" aria-label="Add subtask"
            className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-200 placeholder:text-slate-600 outline-none" />
        </div>
      </div>
    </section>
  );
}

/* ── Task editor ─────────────────────────────────────────────
   Built from the shared editor kit (editor.jsx) so it matches Board's card
   editor: content on the left, properties on the right. */
/* ─── Inline composer ──────────────────────────────────
   "gym every day !high", "submit report friday", "standup weekdays".
   Dates and repeat words are picked up; anything set by hand wins. */
const REPEAT_OPTIONS = [
  { value: 'none', label: 'One-off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'weekly', label: 'Custom days…' },
];
const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High', color: '#f5768a' },
  { value: 'medium', label: 'Medium', color: '#f0b445' },
  { value: 'low', label: 'Low', color: '#6c6c75' },
];

function TaskComposer({ inputRef, defaultDate, onAdd, onExpand }) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState(null);
  const [repeat, setRepeat] = useState(null);
  const [date, setDate] = useState('');

  const r = parseRepeat(text);
  const p = parseCapture(r.title);
  const effRepeat = repeat || r.repeat?.recurrence || 'none';
  const effDays = repeat ? [] : r.repeat?.days || [];
  const effPriority = priority || p.priority || 'medium';
  const effDate = date || p.date || defaultDate;
  const title = (p.title || r.title || text).trim();

  const reset = () => { setText(''); setPriority(null); setRepeat(null); setDate(''); };
  const draft = () => ({
    title, priority: effPriority, is_recurring: effRepeat !== 'none',
    recurrence: effRepeat === 'none' ? 'daily' : effRepeat, recurrence_days: effDays,
    date: effRepeat === 'none' ? effDate : null, subtasks: [],
  });

  const submit = () => {
    // "Custom days" without days picked needs the full editor's day chips.
    if (effRepeat === 'weekly' && effDays.length === 0) { onExpand(draft()); reset(); return; }
    onAdd(draft());
    reset();
  };

  const understood = (r.repeat || p.date || p.priority) && (
    <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500 mb-2 -mt-1">
      <span className="text-accent-400">✦</span> Understood:
      {r.repeat && !repeat && <span className="text-slate-300">{r.repeat.recurrence === 'weekly'
        ? 'every ' + r.repeat.days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
        : r.repeat.recurrence}</span>}
      {p.date && !date && effRepeat === 'none' && <span className="text-slate-300">{formatWhen(p.date)}</span>}
      {p.priority && !priority && <span className="text-slate-300">{p.priority} priority</span>}
    </p>
  );

  return (
    <ComposerShell inputRef={inputRef} icon={CheckSquare} value={text} onChange={setText}
      placeholder='Add a task… try "gym every day" or "submit report friday !high"'
      onSubmit={submit} onExpand={() => { onExpand(draft()); reset(); }} onCancel={reset}
      isDirty={!!(priority || repeat || date)} submitLabel="Add task" preview={understood}>
      <Select size="sm" className="w-[112px]" value={effPriority} onChange={setPriority} ariaLabel="Priority" options={PRIORITY_OPTIONS} />
      <Select size="sm" className="w-[140px]" value={effRepeat} onChange={setRepeat} ariaLabel="Repeat" options={REPEAT_OPTIONS} />
      {effRepeat === 'none' && (
        <DueField compact withTime={false} date={effDate} onDate={d => setDate(d || defaultDate)} placeholder="Date" />
      )}
    </ComposerShell>
  );
}

function TaskFormModal({ isOpen, onClose, onSave, onDelete, editingTask, defaultDate, showToast, applications, draft }) {
  const [title,         setTitle]         = useState('');
  const [priority,      setPriority]      = useState('medium');
  const [isRecurring,   setIsRecurring]   = useState(false);
  const [recurrence,    setRecurrence]    = useState('daily');
  const [recurrenceDays, setRecurrenceDays] = useState([]);
  const [taskDate,      setTaskDate]      = useState(defaultDate || todayStr());
  const [subtasks,      setSubtasks]      = useState([]);
  const [hackathonId,   setHackathonId]   = useState('');
  const [stInput,       setStInput]       = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editingTask) {
      setTitle(editingTask.title);
      setPriority(editingTask.priority || 'medium');
      setIsRecurring(editingTask.is_recurring);
      setRecurrence(editingTask.recurrence || 'daily');
      setRecurrenceDays((editingTask.recurrence_days || []).map(Number));
      setTaskDate(editingTask.date || defaultDate || todayStr());
      setSubtasks(editingTask.subtasks?.map(s => ({ id: s.id, title: s.title })) || []);
      setHackathonId(editingTask.hackathon_id || '');
    } else {
      setTitle(draft?.title || ''); setPriority(draft?.priority || 'medium'); setIsRecurring(!!draft?.is_recurring);
      setRecurrence(draft?.recurrence || 'daily'); setRecurrenceDays(draft?.recurrence_days || []);
      setTaskDate(draft?.date || defaultDate || todayStr()); setSubtasks([]);
      setHackathonId('');
    }
    setStInput('');
  }, [isOpen, editingTask, defaultDate, draft]);

  const commitDraft = () => {
    const t = stInput.trim();
    if (!t) return;
    setSubtasks(prev => [...prev, { id: newSubtaskId(), title: t }]);
    setStInput('');
  };

  const toggleDay = day =>
    setRecurrenceDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

  const repeat = isRecurring ? recurrence : 'none';
  const setRepeat = v => {
    if (v === 'none') { setIsRecurring(false); return; }
    setIsRecurring(true);
    setRecurrence(v);
  };

  const handleSave = () => {
    if (!title.trim()) { showToast?.('error', 'Title Required', 'Please enter a task title.'); return; }
    if (!isRecurring && !taskDate) { showToast?.('error', 'Date Required', 'Please select a date.'); return; }
    if (isRecurring && recurrence === 'weekly' && recurrenceDays.length === 0) {
      showToast?.('error', 'Select Days', 'Choose at least one day for weekly recurrence.'); return;
    }
    // A subtask still sitting in the add row counts — Ctrl+Enter shouldn't drop it.
    const pending = stInput.trim();
    const allSubs = pending ? [...subtasks, { id: newSubtaskId(), title: pending }] : subtasks;
    onSave({ title, priority, is_recurring: isRecurring, recurrence, recurrence_days: recurrenceDays,
             date: isRecurring ? null : taskDate, subtasks: allSubs.filter(s => s.title.trim()),
             hackathon_id: hackathonId || null });
  };

  const hackathons = (applications || []).filter(a => a && a.name);

  return (
    <Modal open={isOpen} onClose={onClose} title={editingTask ? 'Edit task' : 'New task'} width={780}
      footer={<>
        {editingTask && (
          <button type="button" onClick={onDelete}
            className="btn-danger h-8 px-3 rounded-lg text-[13px] cursor-pointer mr-auto inline-flex items-center gap-1.5">
            <Trash2 size={13} /><span className="hidden sm:inline">Delete</span>
          </button>
        )}
        <span className="hidden sm:flex items-center gap-1 text-[11.5px] text-slate-600 mr-1"><span className="kbd">Ctrl</span><span className="kbd">↵</span> save</span>
        <button type="button" onClick={onClose} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Cancel</button>
        <button type="button" onClick={handleSave} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">
          {editingTask ? 'Save' : 'Add task'}
        </button>
      </>}>
      <div onKeyDown={e => {
        if (e.key !== 'Enter') return;
        // Ctrl/Cmd+Enter saves from anywhere; plain Enter in the title saves too, as it always has.
        if (e.metaKey || e.ctrlKey || (!e.shiftKey && e.target.getAttribute?.('aria-label') === 'Title')) {
          e.preventDefault(); handleSave();
        }
      }}>
        <EditorLayout aside={<>
          <PropRow icon={Flag} label="Priority">
            <Select className="w-full" size="sm" value={priority} onChange={setPriority} ariaLabel="Priority"
              options={PRIORITY_OPTS} />
          </PropRow>
          <PropRow icon={Repeat2} label="Repeat">
            <Select className="w-full" size="sm" value={repeat} onChange={setRepeat} ariaLabel="Repeat"
              options={REPEAT_OPTS} />
          </PropRow>
          {isRecurring && recurrence === 'weekly' && (
            <PropRow label="On" top>
              <div className="flex flex-wrap gap-1">
                {DAY_SHORT.map((short, i) => {
                  const on = recurrenceDays.includes(i);
                  return (
                    <button key={i} type="button" onClick={() => toggleDay(i)}
                      aria-pressed={on} aria-label={DAY_LABELS[i]} title={DAY_LABELS[i]}
                      className={`h-7 min-w-[27px] px-1 rounded-md text-[11.5px] font-medium border transition-colors cursor-pointer ${
                        on ? 'border-white/[0.16] bg-white/[0.09] text-slate-100'
                           : 'border-white/[0.07] text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'}`}>
                      {short}
                    </button>
                  );
                })}
              </div>
            </PropRow>
          )}
          {!isRecurring && (
            <PropRow icon={Calendar} label="Date" top>
              <DueField date={taskDate} onDate={setTaskDate} withTime={false} placeholder="Pick a date" />
            </PropRow>
          )}
          {/* Hackathon link — turns a Timeline entry into a checklist owner
              (register, form team, record demo, submit) instead of the two
              sections running in parallel with no connection. */}
          {(applications || []).length > 0 && (
            <PropRow icon={CalendarRange} label="Hackathon">
              <Select className="w-full" size="sm" value={hackathonId || ''} onChange={setHackathonId} ariaLabel="Linked hackathon"
                options={[{ value: '', label: 'Not linked' }, ...hackathons.map(a => ({ value: a.id, label: a.name }))]} />
            </PropRow>
          )}
        </>}>
          <TitleInput value={title} onChange={setTitle} placeholder="Task title" />
          <SubtasksEditor subtasks={subtasks} onChange={setSubtasks}
            draft={stInput} onDraft={setStInput} onCommitDraft={commitDraft} />
        </EditorLayout>
      </div>
    </Modal>
  );
}

/* ── Delete confirm modal ────────────────────────────────── */
function DeleteModal({ task, onConfirm, onClose }) {
  if (!task) return null;
  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-surface w-full max-w-sm rounded-xl overflow-hidden">
        <div className="p-5 space-y-2">
          <h2 className="text-[14px] font-semibold text-slate-100">Delete task</h2>
          <p className="text-[13px] text-slate-400 leading-relaxed">
            Delete <span className="text-slate-100 font-medium">"{task.title}"</span>?
            {task.is_recurring && ' This removes the recurring task and all its history.'}
            {' '}This cannot be undone.
          </p>
        </div>
        <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end gap-2 bg-white/[0.015]">
          <button onClick={onClose}
            className="btn-ghost h-8 px-3 text-[13px] rounded-lg cursor-pointer">Keep it</button>
          <button onClick={onConfirm}
            className="btn-danger h-8 px-3 text-[13px] rounded-lg cursor-pointer">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN VIEW
══════════════════════════════════════════════════════════ */
export default function TasksView({ showToast, onTasksChange, tasksVersion, onLock, onMenuToggle, applications, initialDate, onClearInitialDate }) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [tasks,        setTasks]        = useState([]);
  const [isFormOpen,   setIsFormOpen]   = useState(false);
  const [editingTask,  setEditingTask]  = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy,         setBusy]         = useState(false);
  const [markingAll,   setMarkingAll]   = useState(false);

  // Synced across devices (prefs.js). Falls back to the pre-rename key.
  const [cancelledMap, setCancelledMap] = usePref('anonvault_task_cancelled', getPref('anonvault_task_ignored', {}));

  const handleCancel = useCallback(async task => {
    setCancelledMap(prev => ({
      ...prev,
      [task.id]: { ...(prev?.[task.id] || {}), [selectedDate]: true },
    }));
    showToast?.('warning', 'Task Cancelled', `"${task.title}" cancelled for today.`);
  }, [selectedDate, showToast, setCancelledMap]);

  const handleUncancel = useCallback(async taskId => {
    setCancelledMap(prev => {
      const updated = { ...(prev || {}) };
      if (updated[taskId]) {
        const days = { ...updated[taskId] };
        delete days[selectedDate];
        if (Object.keys(days).length === 0) delete updated[taskId];
        else updated[taskId] = days;
      }
      return updated;
    });
    showToast?.('success', 'Task Restored', 'Task is visible again.');
  }, [selectedDate, showToast, setCancelledMap]);

  // fetch only — used for external refreshes so we never notify back and loop
  const reload = useCallback(async () => {
    const fetched = await getTasksForDate(selectedDate);
    setTasks(fetched);
  }, [selectedDate]);

  const refresh = useCallback(async () => {
    await reload();
    onTasksChange?.();
  }, [reload, onTasksChange]);


  useEffect(() => { refresh(); }, [refresh]);

  // Jumped to from the Review chart. Cleared immediately so returning to this
  // tab later does not snap back to that date.
  useEffect(() => {
    if (!initialDate) return;
    // Applying a prop to state is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDate(initialDate);
    onClearInitialDate?.();
  }, [initialDate, onClearInitialDate]);

  // Re-derive when another view mutates tasks. Reads the localStorage cache
  // synchronously instead of re-hitting the network — every mutation writes
  // that cache first, so it is already current. Skips the first run so this
  // does not clobber the mount fetch above.
  const seenVersion = useRef(tasksVersion);
  useEffect(() => {
    if (seenVersion.current === tasksVersion) return;
    seenVersion.current = tasksVersion;
    setTasks(getTasksForDateSync(selectedDate));
  }, [tasksVersion, selectedDate]);


  const shiftDate = delta => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(toDateStr(d));
  };

  const handleToggle    = useCallback(async task => {
    // Optimistic Update
    const isCompleted = !task.completed;
    setTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        const updatedSubs = (t.subtasks || []).map(st => ({
          ...st,
          completed: isCompleted
        }));
        return { ...t, completed: isCompleted, subtasks: updatedSubs };
      }
      return t;
    }));

    try {
      await toggleTaskCompletion(task, selectedDate, isCompleted);
      await refresh();
    } catch (err) {
      console.error('Failed to toggle task:', err);
      showToast?.('error', 'Error', 'Failed to update task state. Rolling back.');
      await refresh();
    }
  }, [selectedDate, refresh, showToast]);

  // ── mark every pending (non-cancelled) task for this day as completed ──
  const handleMarkAllComplete = useCallback(async () => {
    const pending = tasks.filter(t => !cancelledMap[t.id]?.[selectedDate] && !t.completed);
    if (pending.length === 0) return;

    setMarkingAll(true);

    // Optimistic Update
    const pendingIds = new Set(pending.map(t => t.id));
    setTasks(prev => prev.map(t => pendingIds.has(t.id)
      ? { ...t, completed: true, subtasks: (t.subtasks || []).map(st => ({ ...st, completed: true })) }
      : t
    ));

    try {
      for (const task of pending) {
        await toggleTaskCompletion(task, selectedDate, true);
      }
      showToast?.('success', 'All Done',
        `${pending.length} task${pending.length > 1 ? 's' : ''} marked as completed.`);
    } catch (err) {
      console.error('Failed to mark all tasks complete:', err);
      showToast?.('error', 'Error', 'Could not mark all tasks complete. Rolling back.');
    }
    await refresh();
    setMarkingAll(false);
  }, [tasks, cancelledMap, selectedDate, refresh, showToast]);

  const handleToggleSub = useCallback(async (task, sid) => {
    const desired = !(task.subtasks || []).find(st => st.id === sid)?.completed;
    // Optimistic Update
    setTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        const updatedSubs = (t.subtasks || []).map(st => {
          if (st.id === sid) {
            return { ...st, completed: desired };
          }
          return st;
        });
        const allCompleted = updatedSubs.every(st => st.completed);
        return { 
          ...t, 
          subtasks: updatedSubs,
          completed: allCompleted
        };
      }
      return t;
    }));

    try {
      await toggleSubtaskCompletion(task, sid, selectedDate, desired);
      await refresh();
    } catch (err) {
      console.error('Failed to toggle subtask:', err);
      showToast?.('error', 'Error', 'Failed to update subtask state. Rolling back.');
      await refresh();
    }
  }, [selectedDate, refresh, showToast]);

  const handleSave = async task => {
    setBusy(true);
    try {
      if (editingTask) {
        await updateTask(editingTask.id, task);
        showToast?.('success', 'Task Updated', `"${task.title}" has been saved.`);
      } else {
        await addTask(task);
        showToast?.('success', task.is_recurring ? 'Recurring Task Added' : 'Task Added',
          `"${task.title}" added to your checklist.`);
      }
    } catch (err) {
      showToast?.('error', 'Save Failed', 'Could not save task. Check console.');
      console.error(err);
    }
    setIsFormOpen(false); setEditingTask(null);
    await refresh();
    setBusy(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteTask(deleteTarget.id);
      showToast?.('warning', 'Task Deleted', `"${deleteTarget.title}" has been removed.`);
    } catch (err) {
      showToast?.('error', 'Delete Failed', 'Could not remove task. Check console.');
      console.error(err);
    }
    setDeleteTarget(null);
    await refresh();
    setBusy(false);
  };

  // ── sort pending: high → medium → low ──
  const sortByPriority = arr =>
    [...arr].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));

  // One line about the day. Local-first, debounced, so typing never waits
  // on the network.
  const [dayNote, setDayNote] = useState('');
  const noteTimer = useRef(null);

  // Reload on a new date, and when a sync brings in another device's note
  // (tasksVersion) — but never over a line that's still being typed here.
  const noteDateRef = useRef(null);
  useEffect(() => {
    const dateChanged = noteDateRef.current !== selectedDate;
    noteDateRef.current = selectedDate;
    if (!dateChanged && noteTimer.current) return;
    setDayNote(getNote(selectedDate));
  }, [selectedDate, tasksVersion]);

  const onNoteChange = value => {
    setDayNote(value);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => { noteTimer.current = null; setNote(selectedDate, value); }, 600);
  };

  useEffect(() => () => clearTimeout(noteTimer.current), []);

  const rootRef = useRef(null);
  const composerRef = useRef(null);
  const [draft, setDraft] = useState(null);
  // N goes to the inline composer; the header button opens the full editor.
  useShortcutHooks({
    onNew: () => composerRef.current?.focus(),
    rootRef,
  });

  const quickAdd = async task => {
    try {
      await addTask(task);
      showToast?.('success', task.is_recurring ? 'Recurring task added' : 'Task added',
        task.is_recurring ? task.title : `${task.title} · ${formatWhen(task.date)}`);
    } catch (err) {
      console.error(err);
      showToast?.('error', 'Save Failed', 'Could not save task.');
    }
    await refresh();
  };
  const expandDraft = d => { setEditingTask(null); setDraft(d); setIsFormOpen(true); };

  const hackathonNames = (applications || []).reduce((acc, a) => {
    if (a && a.id) acc[a.id] = a.name;
    return acc;
  }, {});

  const activeTasks    = tasks.filter(t => !cancelledMap[t.id]?.[selectedDate]);
  const cancelledToday = tasks.filter(t => !!cancelledMap[t.id]?.[selectedDate]);

  const allPending     = sortByPriority(activeTasks.filter(t => !t.completed));
  const completedTasks = activeTasks.filter(t => t.completed);
  const totalCount     = activeTasks.length;
  const doneCount      = completedTasks.length;
  const progress       = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const isToday        = selectedDate === todayStr();

  const openNew  = () => { setEditingTask(null); setDraft(null); setIsFormOpen(true); };
  const openEdit = t => { setEditingTask(t); setIsFormOpen(true); };

  const renderRows = list => list.map(task => (
    <TaskCard key={task.id} task={task}
      onToggle={handleToggle} onToggleSub={handleToggleSub}
      onEdit={openEdit}
      onDelete={setDeleteTarget}
      onCancel={handleCancel}
      hackathonName={hackathonNames[task.hackathon_id]}
    />
  ));

  return (
    <div ref={rootRef} className="h-full flex flex-col">
      <PageHeader title="Checklist" subtitle={formatDayFull(selectedDate)}
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={<>
          {!isToday && (
            <button onClick={() => setSelectedDate(todayStr())}
              className="btn-ghost h-8 px-2.5 rounded-lg text-[13px] cursor-pointer hidden sm:inline-flex items-center gap-1.5"
              title="Back to today">
              <RotateCcw size={12} /> Today
            </button>
          )}
          <div className="flex items-center rounded-lg border border-white/[0.08] h-8">
            <button onClick={() => shiftDate(-1)} className="icon-btn !h-full !rounded-r-none cursor-pointer" aria-label="Previous day">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setSelectedDate(todayStr())}
              className={`px-1 sm:px-2 text-[12.5px] font-medium tabular-nums min-w-[52px] sm:min-w-[92px] cursor-pointer whitespace-nowrap ${
                isToday ? 'text-slate-100' : 'text-slate-300 hover:text-slate-100'
              }`}
              title="Jump to today">
              {formatDisplayDate(selectedDate)}
            </button>
            <button onClick={() => shiftDate(1)} className="icon-btn !h-full !rounded-l-none cursor-pointer" aria-label="Next day">
              <ChevronRightIcon size={14} />
            </button>
          </div>
          <button
            onClick={openNew}
            className="btn-primary h-8 px-2.5 sm:px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5"
            title="New task" aria-label="New task">
            <Plus size={14} />
            <span className="hidden sm:inline">New task</span>
          </button>
        </>} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-6 space-y-5 reveal-stagger">
          <TaskComposer inputRef={composerRef} defaultDate={selectedDate} onAdd={quickAdd} onExpand={expandDraft} />

          {/* Progress for the day */}
          {totalCount > 0 && (
            <Card className="px-4 py-3.5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-slate-200 inline-flex items-center gap-1.5">
                    {progress === 100
                      ? <><Check size={13} className="text-emerald-400" /> All done</>
                      : `${allPending.length} left`}
                  </span>
                  <span className="text-[12px] text-slate-500 tabular-nums">
                    {doneCount}/{totalCount} · {progress}%
                  </span>
                </div>
                <Progress className="mt-2" value={progress / 100} tone={progress === 100 ? 'good' : 'neutral'} height={4} />
              </div>
              {allPending.length > 0 && (
                <button
                  onClick={handleMarkAllComplete}
                  disabled={markingAll}
                  title={`Mark all ${allPending.length} remaining task${allPending.length > 1 ? 's' : ''} as completed`}
                  className="btn-ghost h-8 px-2.5 sm:px-3 rounded-lg text-[13px] inline-flex items-center gap-1.5 shrink-0
                    cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  <CheckCheck size={14} />
                  <span className="hidden sm:inline">{markingAll ? 'Marking…' : 'Mark all done'}</span>
                  <span className="sm:hidden">{markingAll ? '…' : 'All done'}</span>
                </button>
              )}
            </Card>
          )}

          {/* Daily log — Review can say how much got done but never what
              happened, and this is where "what happened" gets recorded. */}
          <div className="panel flex items-center gap-2.5 px-3.5 h-11">
            <NotebookPen size={14} className="text-slate-500 shrink-0" />
            <input
              value={dayNote}
              onChange={e => onNoteChange(e.target.value)}
              placeholder="One line about this day…"
              aria-label="Note for this day"
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-slate-200 placeholder:text-slate-500"
            />
            {dayNote.trim() && (
              <span className="text-[11.5px] text-slate-500 shrink-0">Saved</span>
            )}
          </div>

          {totalCount === 0 ? (
            <Card>
              <Empty icon={ListChecks} title="No tasks for this day"
                body="Add a one-off task or set up recurring ones to see them here."
                action={
                  <button onClick={openNew}
                    className="btn-primary h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
                    <Plus size={14} /> Add first task
                  </button>
                } />
            </Card>
          ) : (
            <>
              {/* Pending tasks — single unified list */}
              {allPending.length > 0 && (
                <Card className="overflow-hidden">
                  <CardHeader icon={ListChecks} title="To do" meta={allPending.length} />
                  <ul className="pb-1.5">{renderRows(allPending)}</ul>
                </Card>
              )}

              {/* Completed */}
              {completedTasks.length > 0 && (
                <Card className="overflow-hidden">
                  <CardHeader icon={CheckCheck} title="Completed" meta={completedTasks.length} />
                  <ul className="pb-1.5">{renderRows(completedTasks)}</ul>
                </Card>
              )}

              {/* Cancelled Today */}
              {cancelledToday.length > 0 && (
                <Card className="overflow-hidden">
                  <CardHeader icon={EyeOff} title="Cancelled today" meta={cancelledToday.length} />
                  <ul className="pb-1.5">
                    {cancelledToday.map(task => (
                      <li key={task.id} className="flex items-center justify-between gap-3 px-4 h-11 hover:bg-white/[0.02] transition-colors">
                        <span className="text-[13px] text-slate-500 line-through truncate min-w-0">{task.title}</span>
                        <button
                          onClick={() => handleUncancel(task.id)}
                          className="btn-ghost h-7 px-2.5 rounded-md text-[12px] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                          title="Restore task"
                        >
                          <RotateCcw size={11} />
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}

          <HabitHeatmap version={tasksVersion} selected={selectedDate} onPickDate={setSelectedDate} />
        </div>
      </div>

      <TaskFormModal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTask(null); setDraft(null); }}
        onSave={t => { setDraft(null); return handleSave(t); }}
        draft={draft}
        onDelete={() => { const t = editingTask; setIsFormOpen(false); setEditingTask(null); setDeleteTarget(t); }}
        editingTask={editingTask}
        defaultDate={selectedDate}
        showToast={showToast}
        applications={applications}
      />
      <DeleteModal
        task={deleteTarget}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
