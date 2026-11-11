import { useEffect, useMemo, useState } from 'react';
import {
  Flame, CalendarDays, Trophy, AlertTriangle, CheckCircle2, Target, NotebookPen,
  ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Timer, Wallet, KanbanSquare, Sparkles,
} from 'lucide-react';
import { getCompletionHistory, getTaskReliability, getStreaks, getDayCount } from '../services/tasks';
import { getNotes } from '../services/journal';
import { sessions, overlapMs, breakdown, formatDuration, useFocusGoal } from '../services/focus';
import { transactions, categoryMeta, formatMoney, useMoneySettings, emis, emiStats } from '../services/money';
import { board, dueInfo } from '../services/board';
import { companies as companyStore, companyById } from '../services/work';
import { topParts } from '../utils/chart';
import { usePref } from '../services/prefs';
import { PageHeader, Card, CardHeader, Progress, Segmented, Bars } from './ui';

/* Review is a report for one week or one month, read like a statement:
   what you did, where the time and money went, and what slipped. Every
   headline number is compared with the same stretch of the previous
   period, so a half-finished week is measured against half of last week. */

const TARGETS_KEY = 'anonvault_targets';
const DEFAULT_TARGETS = { completion: 80 };

const DAY = 86400000;
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
const pct = n => (n == null ? '—' : Math.round(n * 100) + '%');

/** A week (Mon–Sun) or calendar month, `offset` periods from the current one. */
function periodOf(kind, offset, today) {
  if (kind === 'week') {
    const monday = addDays(today, -((today.getDay() + 6) % 7) + offset * 7);
    return { from: monday, to: addDays(monday, 6) };
  }
  const from = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 0) };
}

function periodLabel(kind, offset, p) {
  if (kind === 'week') {
    if (offset === 0) return 'This week';
    if (offset === -1) return 'Last week';
    const same = p.from.getMonth() === p.to.getMonth();
    return `${p.from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${p.to.toLocaleDateString(undefined, same ? { day: 'numeric' } : { day: 'numeric', month: 'short' })}`;
  }
  return p.from.toLocaleDateString(undefined, { month: 'long', year: p.from.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/** Everything the report needs for [from, to] (inclusive dates). */
function measure(from, to, { focusList, tx, cards, today }) {
  const end = to > today ? today : to;
  const days = end >= from ? daysBetween(from, end) + 1 : 0;
  const fromMs = from.getTime();
  const toMs = addDays(end, 1).getTime();
  const fromStr = ymd(from), toStr = ymd(end);

  const history = days ? getCompletionHistory(days, daysBetween(today, end)) : [];
  const scheduled = history.reduce((s, d) => s + d.scheduled, 0);
  const done = history.reduce((s, d) => s + d.completed, 0);

  const focusMs = days ? focusList.reduce((s, x) => s + overlapMs(x, fromMs, toMs), 0) : 0;

  let spent = 0, income = 0;
  const byCat = new Map();
  for (const t of tx) {
    if (!t.date || t.date < fromStr || t.date > toStr) continue;
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') income += amt;
    else { spent += amt; byCat.set(t.category, (byCat.get(t.category) || 0) + amt); }
  }

  const finished = cards.filter(c => c.status === 'done' && c.done_at && c.done_at.slice(0, 10) >= fromStr && c.done_at.slice(0, 10) <= toStr);

  return { days, fromMs, toMs, history, scheduled, done, rate: scheduled ? done / scheduled : null, focusMs, spent, income, byCat, finished };
}

/* ── small pieces ─────────────────────────────────────────── */

/** "+12% vs last week". `goodWhenUp` false for spending. */
function Delta({ cur, prev, goodWhenUp = true, vs }) {
  if (!prev && !cur) return <span className="text-[11.5px] text-slate-600">None this time or {vs.replace(/^vs /, '')}</span>;
  if (!prev) return <span className="text-[11.5px] text-slate-500">Nothing {vs.replace(/^vs /, '')}</span>;
  const change = (cur - prev) / prev;
  if (Math.abs(change) < 0.005) return <span className="text-[11.5px] text-slate-500">Same as {vs.replace(/^vs /, '')}</span>;
  const up = change > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11.5px] tabular-nums ${good ? 'text-emerald-400' : 'text-rose-400'}`}>
      <Icon size={12} />{Math.round(Math.abs(change) * 100)}%<span className="text-slate-500 ml-1">{vs}</span>
    </span>
  );
}

function Tile({ icon: Icon, label, value, sub, delta, onClick, children }) {
  return (
    <button onClick={onClick} className="panel panel-hover px-4 py-3.5 text-left flex flex-col gap-1 min-w-0 cursor-pointer">
      <span className="eyebrow truncate inline-flex items-center gap-1.5"><Icon size={12} className="text-slate-500" />{label}</span>
      <span className="text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums text-slate-100 truncate">{value}</span>
      {sub && <span className="text-[12px] text-slate-500 truncate">{sub}</span>}
      {children}
      <span className="mt-0.5">{delta}</span>
    </button>
  );
}

/** One stacked bar + legend, top four parts and Other. */
function Split({ items, fmt, empty }) {
  const list = topParts(items);
  const total = list.reduce((t, x) => t + x.value, 0);
  if (!list.length) return <p className="text-[12.5px] text-slate-500 py-3">{empty}</p>;
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] mb-3">
        {list.map(x => <div key={x.id} style={{ flex: x.value, background: x.color }} title={`${x.label}: ${fmt(x.value)}`} />)}
      </div>
      <div className="space-y-2">
        {list.map(x => (
          <div key={x.id} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: x.color }} />
            <span className="text-slate-300 truncate flex-1 min-w-0">{x.label}</span>
            <span className="text-slate-200 tabular-nums shrink-0">{fmt(x.value)}</span>
            <span className="text-slate-500 tabular-nums w-9 text-right shrink-0">{Math.round((x.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReliabilityRow({ row }) {
  const rate = row.rate ?? 0;
  const tone = rate < 0.4 ? 'bad' : rate >= 0.8 ? 'good' : 'warn';
  const text = rate < 0.4 ? 'text-rose-400' : rate >= 0.8 ? 'text-emerald-400' : 'text-amber-400';
  return (
    <div className="flex items-center gap-3 px-4 h-10 transition-colors hover:bg-white/[0.02]">
      <span className="flex-1 min-w-0 text-[13px] text-slate-200 truncate" title={row.title}>{row.title}</span>
      <span className="text-[12px] text-slate-500 shrink-0 hidden sm:inline capitalize">{row.recurrence}</span>
      <Progress className="!w-12 sm:!w-24 shrink-0" value={rate} tone={tone} height={3} />
      <span className={`text-[12.5px] font-medium tabular-nums shrink-0 w-9 text-right ${text}`}>{pct(row.rate)}</span>
      <span className="text-[12px] text-slate-500 tabular-nums shrink-0 w-11 text-right">{row.completed}/{row.scheduled}</span>
    </div>
  );
}

const FUNNEL = [
  { key: 'pending',      label: 'Tracked',    color: 'var(--text-3)' },
  { key: 'applied',      label: 'Registered', color: 'var(--accent)' },
  { key: 'interviewing', label: 'Building',   color: '#94b6ff' },
  { key: 'offered',      label: 'Won',        color: 'var(--warn)' },
  { key: 'rejected',     label: 'Completed',  color: 'var(--ok)' },
];

/* ═══════════════════════════════════════════════════════════ */

export default function ReviewView({ applications, tasksVersion, onLock, onMenuToggle, setActiveTab, onPickDate }) {
  const [kind, setKind] = useState('week');
  const [offset, setOffset] = useState(0);
  const [split, setSplit] = useState('source');
  // Synced across devices (prefs.js).
  const [storedTargets, setTargets] = usePref(TARGETS_KEY, {});
  const targets = useMemo(() => ({ ...DEFAULT_TARGETS, ...(storedTargets || {}) }), [storedTargets]);
  const [editingTargets, setEditingTargets] = useState(false);

  const focusList = sessions.useAll();
  const tx = transactions.useAll();
  const cards = board.useAll();
  const companyList = companyStore.useAll();
  const emiList = emis.useAll();
  const money = useMoneySettings();
  const fmt = n => formatMoney(n, money.currency);
  const dailyGoal = useFocusGoal();

  // Day boundary for everything below; re-read when the inputs change.
  const [todayKey] = useState(() => ymd(new Date()));
  const today = useMemo(() => new Date(todayKey + 'T00:00:00'), [todayKey]);

  const saveTargets = next => {
    setTargets(next);
  };
  const changeKind = k => { setKind(k); setOffset(0); };
  useEffect(() => {
    const on = e => { if (e.detail) { setKind(e.detail.kind || 'week'); setOffset(e.detail.offset || 0); } };
    window.addEventListener('anonvault:review-period', on);
    return () => window.removeEventListener('anonvault:review-period', on);
  }, []);

  const period = periodOf(kind, offset, today);
  const label = periodLabel(kind, offset, period);
  const vs = kind === 'week' ? 'vs last week' : 'vs last month';
  const isCurrent = offset === 0;

  const report = useMemo(() => {
    const ctx = { focusList, tx, cards, today };
    const cur = measure(period.from, period.to, ctx);
    // Same stretch of the previous period, so partial weeks compare fairly.
    const prevP = periodOf(kind, offset - 1, today);
    const prevLen = Math.max(1, cur.days || daysBetween(period.from, period.to) + 1);
    const prevTo = addDays(prevP.from, Math.min(prevLen, daysBetween(prevP.from, prevP.to) + 1) - 1);
    const prev = measure(prevP.from, prevTo, ctx);
    const reliability = cur.days ? getTaskReliability(cur.days, daysBetween(today, addDays(period.from, cur.days - 1))) : [];
    return { cur, prev, reliability };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, offset, focusList, tx, cards, today, tasksVersion]);
  const { cur, prev, reliability } = report;

  const streaks = useMemo(() => getStreaks(180),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasksVersion]);
  const dayCount = useMemo(() => getDayCount(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasksVersion]);
  const notes = useMemo(() => getNotes(cur.history.map(d => d.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cur.history, tasksVersion]);

  /* ── day by day ── */
  const totalDays = daysBetween(period.from, period.to) + 1;
  const dayRows = Array.from({ length: totalDays }, (_, i) => {
    const d = addDays(period.from, i);
    const key = ymd(d);
    const future = d > today;
    const h = cur.history.find(x => x.date === key);
    const ms = future ? 0 : focusList.reduce((s, x) => s + overlapMs(x, d.getTime(), d.getTime() + DAY), 0);
    return { d, key, future, ms, h };
  });
  const best = dayRows.filter(r => !r.future && r.ms > 0).sort((a, b) => b.ms - a.ms)[0];
  const cleanDays = cur.history.filter(d => d.scheduled > 0 && d.completed === d.scheduled).length;
  const daysWithTasks = cur.history.filter(d => d.scheduled > 0).length;

  /* ── splits ── */
  const timeItems = (split === 'source'
    ? breakdown(focusList, cur.fromMs, cur.toMs, 'company').map(r => ({ id: r.key || '__none', label: companyById(companyList, r.key)?.name || 'No source', value: r.ms }))
    : breakdown(focusList, cur.fromMs, cur.toMs, 'label').map(r => ({ id: r.key, label: r.key, value: r.ms })));
  const moneyItems = [...cur.byCat.entries()].map(([id, value]) => ({ id, label: categoryMeta(id).label, value }));

  /* ── what slipped ── */
  const overdue = isCurrent ? cards.filter(c => dueInfo(c)?.tone === 'bad') : [];
  const missedInPeriod = cards.filter(c => c.status !== 'done' && c.due_date && c.due_date >= ymd(period.from) && c.due_date <= ymd(period.to < today ? period.to : addDays(today, -1)));
  const slippedCards = isCurrent ? overdue : missedInPeriod;
  const weak = reliability.filter(r => (r.rate ?? 1) < 0.4).slice(0, 5);
  const unpaidEmis = isCurrent ? emiList.map(e => ({ e, st: emiStats(e) })).filter(({ st }) => !st.done && !st.paidThisMonth) : [];
  const budget = Number(money.monthlyBudget) || 0;
  const overBudget = kind === 'month' && budget > 0 && cur.spent > budget;
  const slipCount = slippedCards.length + weak.length + unpaidEmis.length + (overBudget ? 1 : 0);

  /* ── the one-line summary ── */
  const summary = [
    cur.focusMs > 0 && `${formatDuration(cur.focusMs)} focused`,
    cur.scheduled > 0 && `${cur.done} of ${cur.scheduled} tasks done`,
    cur.finished.length > 0 && `${cur.finished.length} card${cur.finished.length === 1 ? '' : 's'} finished`,
    cur.spent > 0 && `${fmt(cur.spent)} spent`,
  ].filter(Boolean);

  const focusTarget = dailyGoal * 60000 * Math.max(1, cur.days);
  const nothing = !cur.focusMs && !cur.scheduled && !cur.spent && !cur.income && !cur.finished.length;

  const funnel = (applications || []).length
    ? FUNNEL.map(f => ({ ...f, count: applications.filter(a => a?.status === f.key).length }))
    : null;

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Review"
        stats={[{ value: `Day ${dayCount}`, label: '', always: true }]}
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={<>
          <div className="hidden sm:block">
            <Segmented size="sm" value={kind} onChange={changeKind}
              options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
          </div>
          <div className="flex items-center rounded-lg border border-white/[0.08] h-8">
            <button onClick={() => setOffset(o => o - 1)} className="icon-btn !h-full !rounded-r-none" aria-label={`Previous ${kind}`}><ChevronLeft size={14} /></button>
            <button onClick={() => setOffset(0)} title={`Jump to this ${kind}`}
              className="px-1.5 sm:px-2 text-[12.5px] text-slate-200 font-medium tabular-nums sm:min-w-[92px] cursor-pointer whitespace-nowrap">{label}</button>
            <button onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={isCurrent}
              className="icon-btn !h-full !rounded-l-none disabled:opacity-30 disabled:cursor-default" aria-label={`Next ${kind}`}><ChevronRight size={14} /></button>
          </div>
          <button onClick={() => setEditingTargets(v => !v)} aria-pressed={editingTargets}
            className={`icon-btn ${editingTargets ? '!bg-white/[0.07] !text-slate-100' : ''}`} title="Targets" aria-label="Targets">
            <Target size={14} />
          </button>
        </>} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-6 space-y-5 reveal-stagger">

          <div className="sm:hidden">
            <Segmented size="sm" value={kind} onChange={changeKind}
              options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
          </div>

          {editingTargets && (
            <Card className="p-4 flex flex-wrap items-end gap-x-6 gap-y-3 fade-up">
              <label className="block">
                <span className="block text-[12px] font-medium text-slate-400 mb-1.5">Task completion target</span>
                <span className="flex items-center gap-1.5">
                  <input type="number" min={1} max={100} value={targets.completion}
                    onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) saveTargets({ ...targets, completion: n }); }}
                    className="input-premium w-20 h-8 px-2.5 rounded-lg text-[13px] tabular-nums" />
                  <span className="text-[13px] text-slate-500">%</span>
                </span>
              </label>
              <p className="text-[12px] text-slate-500 flex-1 min-w-[200px] pb-1.5">
                Focus target comes from your daily goal in Focus ({formatDuration(dailyGoal * 60000)} a day). Budget comes from Money.
              </p>
            </Card>
          )}

          {/* Summary */}
          <div className="panel relative overflow-hidden p-5 sm:p-6">
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(70% 120% at 100% 0%, rgba(79,123,255,0.07) 0%, transparent 60%)' }} />
            <div className="relative">
              <p className="text-[12.5px] text-slate-500 tabular-nums">
                {period.from.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} – {period.to.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                {isCurrent && cur.days < totalDays && <span className="text-slate-600"> · day {cur.days} of {totalDays}</span>}
              </p>
              <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-[-0.03em] text-slate-50 mt-1">{label}</h2>
              <p className="text-[14px] text-slate-400 mt-1 max-w-[720px]">
                {nothing ? (isCurrent ? 'Nothing tracked yet.' : 'Nothing was tracked in this stretch.') : summary.join(' · ')}
                {best && <span className="text-slate-500"> · best day {best.d.toLocaleDateString(undefined, { weekday: 'long' })} ({formatDuration(best.ms)})</span>}
              </p>
            </div>
          </div>

          {/* Headline numbers, each against the same stretch last period */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile icon={Timer} label="Focused" value={formatDuration(cur.focusMs)} onClick={() => setActiveTab('focus')}
              sub={`${pct(cur.focusMs / focusTarget)} of ${formatDuration(focusTarget)} goal`}
              delta={<Delta cur={cur.focusMs} prev={prev.focusMs} vs={vs} />}>
              <Progress className="mt-1" value={cur.focusMs / focusTarget} tone={cur.focusMs >= focusTarget ? 'good' : 'neutral'} height={3} />
            </Tile>
            <Tile icon={CheckCircle2} label="Tasks done" value={pct(cur.rate)} onClick={() => setActiveTab('tasks')}
              sub={cur.scheduled ? `${cur.done}/${cur.scheduled} · target ${targets.completion}%` : 'Nothing scheduled'}
              delta={<Delta cur={cur.rate ?? 0} prev={prev.rate ?? 0} vs={vs} />}>
              <Progress className="mt-1" value={cur.rate ?? 0} tone={cur.rate != null && cur.rate * 100 >= targets.completion ? 'good' : 'neutral'} height={3} />
            </Tile>
            <Tile icon={KanbanSquare} label="Cards finished" value={cur.finished.length} onClick={() => setActiveTab('board')}
              sub={cur.finished[0] ? `Latest: ${[...cur.finished].sort((a, b) => b.done_at.localeCompare(a.done_at))[0].title}` : 'Move cards to Done on the Board'}
              delta={<Delta cur={cur.finished.length} prev={prev.finished.length} vs={vs} />} />
            <Tile icon={Wallet} label="Spent" value={fmt(cur.spent)} onClick={() => setActiveTab('money')}
              sub={cur.income ? `${fmt(cur.income)} came in · net ${fmt(cur.income - cur.spent)}` : 'No income logged'}
              delta={<Delta cur={cur.spent} prev={prev.spent} goodWhenUp={false} vs={vs} />} />
          </div>

          {/* Day by day */}
          <Card>
            <CardHeader icon={CalendarDays} title="Day by day"
              action={<span className="text-[12px] text-slate-500 hidden sm:inline">{daysWithTasks ? `${cleanDays} of ${daysWithTasks} days with every task done` : 'Bars are focus time'}</span>} />
            <div className="px-4 pb-4">
              <Bars height={110} highlightLast={false}
                format={v => formatDuration(v * 3600000)}
                values={dayRows.map(r => ({
                  label: kind === 'week' ? r.d.toLocaleDateString(undefined, { weekday: 'narrow' })
                    : (r.d.getDate() === 1 || r.d.getDate() % 7 === 1 ? String(r.d.getDate()) : ''),
                  value: r.ms / 3600000,
                  muted: r.future,
                  highlight: best && r.key === best.key,
                  tip: `${r.d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}${r.h?.scheduled ? ` · ${r.h.completed}/${r.h.scheduled} tasks` : ''}`,
                }))} />
              {/* Task completion, one cell per day, lined up under the bars */}
              <div className="flex gap-[3px] sm:gap-1.5 mt-2" aria-label="Tasks completed per day">
                {dayRows.map(r => {
                  const h = r.h;
                  const full = h && h.scheduled > 0 && h.completed === h.scheduled;
                  const part = h && h.scheduled > 0 && !full;
                  return (
                    <button key={r.key} onClick={() => !r.future && onPickDate?.(r.key)} disabled={r.future}
                      title={r.future ? '' : h?.scheduled ? `${h.completed}/${h.scheduled} tasks done — open this day` : 'Nothing scheduled'}
                      className="flex-1 h-1.5 rounded-full cursor-pointer disabled:cursor-default"
                      style={{
                        background: r.future ? 'rgba(255,255,255,0.03)' : full ? 'var(--ok)' : part ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                        opacity: part ? 0.35 + (h.completed / h.scheduled) * 0.55 : 1,
                      }} />
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-white/[0.05] text-[12px] text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-white/[0.25]" /> Focus time</span>
                {best && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: 'var(--accent)' }} /> Best day</span>}
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full" style={{ background: 'var(--ok)' }} /> All tasks done</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full opacity-60" style={{ background: 'var(--accent)' }} /> Some done</span>
                <span className="ml-auto hidden sm:inline">Click a day’s line to open it in Checklist</span>
              </div>
            </div>
          </Card>

          {/* Where it went */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <CardHeader icon={Timer} title="Where your time went" meta={cur.focusMs ? formatDuration(cur.focusMs) : null}
                action={<Segmented size="sm" value={split} onChange={setSplit}
                  options={[{ value: 'source', label: 'Source' }, { value: 'label', label: 'Activity' }]} />} />
              <div className="px-4 pb-4">
                <Split items={timeItems} fmt={ms => formatDuration(ms)} empty="No focus time tracked in this stretch." />
              </div>
            </Card>
            <Card>
              <CardHeader icon={Wallet} title="Where your money went" meta={cur.spent ? fmt(cur.spent) : null}
                action={kind === 'month' && budget > 0 && (
                  <span className={`text-[12px] tabular-nums ${overBudget ? 'text-rose-400' : 'text-slate-500'}`}>
                    {overBudget ? `${fmt(cur.spent - budget)} over budget` : `${fmt(budget - cur.spent)} under budget`}
                  </span>
                )} />
              <div className="px-4 pb-4">
                <Split items={moneyItems} fmt={fmt} empty="No spending logged in this stretch." />
              </div>
            </Card>
          </div>

          {/* What slipped */}
          <Card className="overflow-hidden">
            <CardHeader icon={AlertTriangle} title="What slipped" meta={slipCount || null}
              action={!slipCount && <span className="text-[12px] text-emerald-400 inline-flex items-center gap-1"><Sparkles size={12} /> Nothing — clean {kind}</span>} />
            {slipCount > 0 ? (
              <div className="pb-2">
                {slippedCards.slice(0, 6).map(c => (
                  <button key={c.id} onClick={() => { setActiveTab('board'); setTimeout(() => window.dispatchEvent(new CustomEvent('anonvault:open-card', { detail: c.id })), 60); }}
                    className="w-full flex items-center gap-3 px-4 h-10 text-left hover:bg-white/[0.02] transition-colors cursor-pointer">
                    <KanbanSquare size={13} className="text-slate-500 shrink-0" />
                    <span className="flex-1 min-w-0 text-[13px] text-slate-200 truncate">{c.title}</span>
                    <span className="text-[12px] text-rose-400 shrink-0">{isCurrent ? dueInfo(c)?.text : `Was due ${new Date(c.due_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}`}</span>
                  </button>
                ))}
                {unpaidEmis.map(({ e, st }) => (
                  <button key={e.id} onClick={() => { setActiveTab('money'); window.dispatchEvent(new CustomEvent('anonvault:money-tab', { detail: 'emi' })); }}
                    className="w-full flex items-center gap-3 px-4 h-10 text-left hover:bg-white/[0.02] transition-colors cursor-pointer">
                    <Wallet size={13} className="text-slate-500 shrink-0" />
                    <span className="flex-1 min-w-0 text-[13px] text-slate-200 truncate">{e.name} EMI not marked paid this month</span>
                    <span className="text-[12px] text-amber-400 tabular-nums shrink-0">{fmt(st.amount)}</span>
                  </button>
                ))}
                {overBudget && (
                  <div className="flex items-center gap-3 px-4 h-10">
                    <Wallet size={13} className="text-slate-500 shrink-0" />
                    <span className="flex-1 min-w-0 text-[13px] text-slate-200 truncate">Spent more than the monthly budget</span>
                    <span className="text-[12px] text-rose-400 tabular-nums shrink-0">+{fmt(cur.spent - budget)}</span>
                  </div>
                )}
                {weak.length > 0 && (
                  <>
                    <p className="px-4 pt-3 pb-1 text-[11.5px] text-slate-500">Recurring tasks done under 40% of the time — worth rewording or dropping</p>
                    {weak.map(r => <ReliabilityRow key={r.id} row={r} />)}
                  </>
                )}
              </div>
            ) : (
              <p className="px-4 pb-4 text-[12.5px] text-slate-500">No overdue cards, unpaid EMIs or skipped habits in this stretch.</p>
            )}
          </Card>

          {/* Streaks + written log */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="p-4 flex flex-col gap-3">
              <span className="eyebrow">Streak</span>
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-[28px] leading-8 font-semibold tabular-nums text-slate-100 inline-flex items-center gap-1.5">
                    {streaks.current}<Flame size={18} className={streaks.current ? 'text-amber-400' : 'text-slate-600'} />
                  </p>
                  <p className="text-[12px] text-slate-500">days in a row, every task done</p>
                </div>
                <div>
                  <p className="text-[20px] leading-7 font-semibold tabular-nums text-slate-300">{streaks.longest}</p>
                  <p className="text-[12px] text-slate-500">longest</p>
                </div>
              </div>
            </Card>
            <Card className="lg:col-span-2 overflow-hidden">
              <CardHeader icon={NotebookPen} title="What you wrote" meta={notes.length || null} />
              {notes.length > 0 ? (
                <div className="max-h-[240px] overflow-y-auto pb-1.5">
                  {notes.map(entry => (
                    <button key={entry.date} onClick={() => onPickDate?.(entry.date)} title="Open this day in Checklist"
                      className="w-full flex items-start gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors hover:bg-white/[0.02]">
                      <span className="text-[12px] tabular-nums text-slate-500 shrink-0 mt-[1px] w-[84px]">
                        {new Date(entry.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <span className="flex-1 min-w-0 text-[13px] text-slate-300 leading-relaxed break-words">{entry.note}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-4 pb-4 text-[12.5px] text-slate-500">No notes for these days. Add a line about your day from the top of Checklist.</p>
              )}
            </Card>
          </div>

          {/* Habits */}
          {reliability.length > weak.length && (
            <Card className="overflow-hidden">
              <CardHeader icon={Target} title="Recurring tasks" meta={reliability.length}
                action={<span className="text-[12px] text-slate-500">Least reliable first</span>} />
              <div className="pb-1.5">{reliability.map(r => <ReliabilityRow key={r.id} row={r} />)}</div>
            </Card>
          )}

          {/* Hackathons (all time) */}
          {funnel && (
            <Card>
              <CardHeader icon={Trophy} title="Hackathons" action={<span className="text-[12px] text-slate-500">All time</span>} />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 px-2 pb-2">
                {funnel.map(f => (
                  <button key={f.key} onClick={() => setActiveTab('timeline')}
                    className="flex flex-col items-start gap-1 text-left cursor-pointer rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.03]">
                    <span className={`text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums ${f.count ? 'text-slate-100' : 'text-slate-600'}`}>{f.count}</span>
                    <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: f.color }} />{f.label}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
