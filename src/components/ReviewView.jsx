import { useMemo, useState } from 'react';
import {
  Flame, CalendarDays, Trophy,
  AlertTriangle, CheckCircle2, Target, NotebookPen
} from 'lucide-react';
import {
  getCompletionHistory, getTaskReliability, getStreaks, getDayCount
} from '../services/tasks';
import { getNotedDates, getNotes } from '../services/journal';
import { PageHeader, Card, CardHeader, Stat, Progress, Empty, Segmented } from './ui';

/* Targets turn the numbers into something with a verdict. 68% means nothing
   on its own; 68% against a target of 80% means something. */
const TARGETS_KEY = 'anonvault_targets';
const DEFAULT_TARGETS = { completion: 80, ships: 2 };

function loadTargets() {
  try {
    const raw = localStorage.getItem(TARGETS_KEY);
    return raw ? { ...DEFAULT_TARGETS, ...JSON.parse(raw) } : DEFAULT_TARGETS;
  } catch { return DEFAULT_TARGETS; }
}

const WINDOWS = [
  { value: 7,  label: '7 days'  },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

/* Hackathon status keys, using the same vocabulary the Timeline shows. */
const FUNNEL = [
  { key: 'pending',      label: 'Tracked',    color: 'var(--text-3)' },
  { key: 'applied',      label: 'Registered', color: 'var(--accent)' },
  { key: 'interviewing', label: 'Building',   color: '#94b6ff' },
  { key: 'offered',      label: 'Won',        color: 'var(--warn)' },
  { key: 'rejected',     label: 'Completed',  color: 'var(--ok)' },
];

const pct = n => (n === null || n === undefined ? '—' : Math.round(n * 100) + '%');

/* ── Headline stat ──────────────────────────────────────── */
function StatCard({ label, value, sub, target, actual, suffix = '' }) {
  // Only shown when there is a target to compare against.
  const hit = target != null && actual != null && actual >= target;
  return (
    <Stat label={label} value={value} hint={sub}>
      {target != null && (
        <div className="flex items-center gap-2 mt-1.5">
          <Progress className="flex-1" value={(actual || 0) / target} tone={hit ? 'good' : 'neutral'} height={3} />
          <span className={`text-[11.5px] tabular-nums shrink-0 ${hit ? 'text-emerald-400' : 'text-slate-500'}`}>
            Target {target}{suffix}
          </span>
        </div>
      )}
    </Stat>
  );
}

/* ── Daily completion bars ──────────────────────────────── */
function HistoryChart({ history, onPickDate, notedDates }) {
  // A day with nothing scheduled is drawn as a flat marker rather than a
  // zero bar — no work due is not the same as work missed.
  return (
    <div className="flex items-end gap-px sm:gap-[3px] h-28 mb-1.5">
      {history.map(d => {
        const empty = d.scheduled === 0;
        const h = empty ? 3 : Math.max(4, Math.round((d.completed / d.scheduled) * 100));
        const full = !empty && d.completed === d.scheduled;
        return (
          <button key={d.date}
            onClick={() => onPickDate && onPickDate(d.date)}
            className="flex-1 flex flex-col justify-end relative cursor-pointer"
            style={{ minWidth: 2, background: 'none', border: 'none', padding: 0 }}>
            <div
              title={empty
                ? d.date + ' — nothing scheduled'
                : `${d.date} — ${d.completed}/${d.scheduled} done`}
              style={{
                height: `${h}%`,
                borderRadius: 2,
                background: empty
                  ? 'rgba(255,255,255,0.06)'
                  : full ? 'var(--ok)' : 'var(--accent)',
                opacity: empty ? 1 : full ? 0.85 : 0.45 + (d.completed / d.scheduled) * 0.4,
                transition: 'opacity var(--dur-1) ease',
              }}
              className="hover:!opacity-100"
            />
            {/* A day with a log entry gets a marker, so the chart shows where
                there is context to read, not just numbers. */}
            {notedDates?.has(d.date) && (
              <span className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-slate-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Reliability row ───────────────────────────────────── */
function ReliabilityRow({ row }) {
  const rate = row.rate ?? 0;
  const weak = rate < 0.4;
  const strong = rate >= 0.8;
  const tone = weak ? 'bad' : strong ? 'good' : 'warn';
  const text = weak ? 'text-rose-400' : strong ? 'text-emerald-400' : 'text-amber-400';
  return (
    <div className="flex items-center gap-3 px-4 h-10 transition-colors hover:bg-white/[0.02]">
      <span className="flex-1 min-w-0 text-[13px] text-slate-200 truncate" title={row.title}>
        {row.title}
      </span>
      <span className="text-[12px] text-slate-500 shrink-0 hidden sm:inline capitalize">
        {row.recurrence}
      </span>
      <Progress className="!w-12 sm:!w-24 shrink-0" value={rate} tone={tone} height={3} />
      <span className={`text-[12.5px] font-medium tabular-nums shrink-0 w-9 text-right ${text}`}>
        {pct(row.rate)}
      </span>
      <span className="text-[12px] text-slate-500 tabular-nums shrink-0 w-11 text-right">
        {row.completed}/{row.scheduled}
      </span>
    </div>
  );
}

function OpenChecklist({ onClick }) {
  return (
    <button onClick={onClick}
      className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">
      Open checklist
    </button>
  );
}

function Hint({ children, className = '' }) {
  return <span className={`text-[12px] text-slate-500 truncate min-w-0 ${className}`}>{children}</span>;
}

export default function ReviewView({ applications, projectIdeas, onLock, onMenuToggle, setActiveTab, onPickDate }) {
  const [windowDays, setWindowDays] = useState(30);
  const [targets, setTargets] = useState(loadTargets);
  const [editingTargets, setEditingTargets] = useState(false);

  const saveTargets = next => {
    setTargets(next);
    try { localStorage.setItem(TARGETS_KEY, JSON.stringify(next)); }
    catch { /* not critical */ }
  };

  // Recomputed only when the window changes. These read the localStorage
  // caches synchronously, so there is no loading state to manage.
  const history = useMemo(() => getCompletionHistory(windowDays), [windowDays]);
  const reliability = useMemo(() => getTaskReliability(windowDays), [windowDays]);
  const streaks = useMemo(() => getStreaks(180), []);
  const notedDates = useMemo(() => getNotedDates(), []);
  // The daily log had nowhere to be read back — notes went in and only ever
  // came out one date at a time. This is the payoff surface.
  const logEntries = useMemo(
    () => getNotes(history.map(d => d.date)),
    [history]
  );
  const dayCount = useMemo(() => getDayCount(), []);

  const totals = history.reduce(
    (a, d) => ({ scheduled: a.scheduled + d.scheduled, completed: a.completed + d.completed }),
    { scheduled: 0, completed: 0 }
  );
  const overall = totals.scheduled ? totals.completed / totals.scheduled : null;

  const funnel = useMemo(() => {
    const apps = applications || [];
    return FUNNEL.map(f => ({ ...f, count: apps.filter(a => a?.status === f.key).length }));
  }, [applications]);

  const winRate = useMemo(() => {
    const apps = (applications || []).filter(a => a?.status === 'offered' || a?.status === 'rejected');
    if (!apps.length) return null;
    return apps.filter(a => a.status === 'offered').length / apps.length;
  }, [applications]);

  // Shipped this month, from the new project pipeline.
  const shippedThisMonth = useMemo(() => {
    const now = new Date();
    return (projectIdeas || []).filter(p => {
      if (p?.status !== 'shipped') return false;
      const d = p.updated_at || p.created_at;
      if (!d) return false;
      const t = new Date(d);
      return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth();
    }).length;
  }, [projectIdeas]);

  const building = (projectIdeas || []).filter(p => p?.status === 'building').length;
  const worst = reliability.filter(r => (r.rate ?? 1) < 0.4).slice(0, 5);
  const hasHistory = totals.scheduled > 0;

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Review" subtitle={<>Day {dayCount} &middot; what actually happened</>}
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={<>
          <div className="hidden sm:block">
            <Segmented size="sm" value={windowDays} onChange={setWindowDays} options={WINDOWS} />
          </div>
          <button onClick={() => setEditingTargets(v => !v)}
            aria-pressed={editingTargets}
            className={`btn-ghost h-8 px-2.5 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5 ${
              editingTargets ? '!bg-white/[0.07] !text-slate-100' : ''
            }`}
            title="Set your targets">
            <Target size={14} />
            <span className="hidden sm:inline">Targets</span>
          </button>
        </>} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-6 space-y-5 reveal-stagger">

          {/* Window picker lives in the header from sm up */}
          <div className="sm:hidden flex items-center justify-between gap-3">
            <span className="text-[12px] text-slate-500">Day {dayCount}</span>
            <Segmented size="sm" value={windowDays} onChange={setWindowDays} options={WINDOWS} />
          </div>

          {editingTargets && (
            <Card className="p-4 flex flex-wrap items-end gap-x-5 gap-y-3 fade-up">
              {[
                { key: 'completion', label: 'Completion target', suffix: '%', min: 1, max: 100 },
                { key: 'ships', label: 'Ships per month', suffix: '', min: 1, max: 30 },
              ].map(f => (
                <label key={f.key} className="block">
                  <span className="block text-[12px] font-medium text-slate-400 mb-1.5">{f.label}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min={f.min} max={f.max}
                      value={targets[f.key]}
                      onChange={e => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) saveTargets({ ...targets, [f.key]: n });
                      }}
                      className="input-premium w-20 h-8 px-2.5 rounded-lg text-[13px] tabular-nums" />
                    {f.suffix && <span className="text-[13px] text-slate-500">{f.suffix}</span>}
                  </div>
                </label>
              ))}
              <p className="text-[12px] text-slate-500 flex-1 min-w-[180px] pb-1.5">
                Saved as you type. A metric without a target is trivia.
              </p>
            </Card>
          )}

          {/* Headline numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label={`Completion · ${windowDays}d`}
              value={pct(overall)}
              sub={hasHistory ? `${totals.completed}/${totals.scheduled} done` : 'No data yet'}
              target={targets.completion} suffix="%"
              actual={overall === null ? null : Math.round(overall * 100)} />
            <StatCard label="Current streak"
              value={<span className="inline-flex items-center gap-1.5">{streaks.current}<Flame size={16} className={streaks.current ? 'text-amber-400' : 'text-slate-600'} /></span>}
              sub={streaks.current === 1 ? 'Clean day' : 'Clean days'} />
            <StatCard label="Longest streak"
              value={streaks.longest} sub="Days" />
            <StatCard label="Shipped this month"
              value={shippedThisMonth} sub={building ? `${building} building` : 'Concepts'}
              target={targets.ships} actual={shippedThisMonth} />
          </div>

          {/* Daily bars */}
          <Card>
            <CardHeader icon={CalendarDays} title="Daily completion" meta={`${windowDays}d`}
              action={hasHistory && <Hint className="hidden sm:block">Click a day to open it</Hint>} />
            {hasHistory ? (
              <div className="px-4 pb-4">
                <HistoryChart history={history} onPickDate={onPickDate} notedDates={notedDates} />
                <div className="flex items-center justify-between mt-2 text-[11.5px] text-slate-600 tabular-nums">
                  <span>{history[0]?.date}</span>
                  <span>Today</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-white/[0.05] text-[12px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background: 'var(--ok)' }} /> All done
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background: 'var(--accent)' }} /> Partial
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-white/[0.1]" /> Nothing due
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-slate-400" /> Logged
                  </span>
                </div>
              </div>
            ) : (
              <Empty icon={CheckCircle2} title="No completion history yet"
                body="Add a recurring task and this fills in from tomorrow."
                action={<OpenChecklist onClick={() => setActiveTab('tasks')} />} />
            )}
          </Card>

          {/* Written log for the window */}
          <Card className="overflow-hidden">
            <CardHeader icon={NotebookPen} title="Log"
              meta={logEntries.length || null}
              action={logEntries.length > 0 && <Hint>Newest first</Hint>} />
            {logEntries.length > 0 ? (
              <div className="max-h-[300px] overflow-y-auto pb-1.5">
                {logEntries.map(entry => (
                  <button key={entry.date}
                    onClick={() => onPickDate && onPickDate(entry.date)}
                    title="Open this day in the Checklist"
                    className="w-full flex items-start gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors hover:bg-white/[0.02]">
                    <span className="text-[12px] tabular-nums text-slate-500 shrink-0 mt-[1px] w-[84px]">
                      {new Date(entry.date + 'T00:00:00').toLocaleDateString(undefined,
                        { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="flex-1 min-w-0 text-[13px] text-slate-300 leading-relaxed break-words">
                      {entry.note}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty icon={NotebookPen} title={`Nothing written in the last ${windowDays} days`}
                body="Add a line about your day from the top of the Checklist."
                action={<OpenChecklist onClick={() => setActiveTab('tasks')} />} />
            )}
          </Card>

          {/* The honest bit */}
          {worst.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader icon={AlertTriangle} title="Consistently skipped"
                meta={worst.length} />
              <p className="px-4 -mt-1 pb-2 text-[12px] text-slate-500">Under 40% — worth rewording or dropping.</p>
              <div className="pb-1.5">
                {worst.map(r => <ReliabilityRow key={r.id} row={r} />)}
              </div>
            </Card>
          )}

          {/* Every recurring task */}
          {reliability.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader icon={Target} title="Recurring task reliability"
                meta={reliability.length}
                action={<Hint>Least reliable first</Hint>} />
              <div className="pb-1.5">
                {reliability.map(r => <ReliabilityRow key={r.id} row={r} />)}
              </div>
            </Card>
          )}

          {/* Hackathon funnel */}
          <Card>
            <CardHeader icon={Trophy} title="Hackathon funnel"
              action={<Hint>{winRate === null ? 'No results yet' : `${pct(winRate)} win rate on resolved`}</Hint>} />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 px-2 pb-2">
              {funnel.map(f => (
                <button key={f.key}
                  onClick={() => setActiveTab('timeline')}
                  className="flex flex-col items-start gap-1 text-left cursor-pointer rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.03]">
                  <span className={`text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums ${
                    f.count ? 'text-slate-100' : 'text-slate-600'
                  }`}>
                    {String(f.count).padStart(2, '0')}
                  </span>
                  <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: f.color }} />
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
