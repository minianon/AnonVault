import { useMemo, useState } from 'react';
import {
  Menu, Lock, TrendingUp, Flame, CalendarDays, Trophy,
  AlertTriangle, CheckCircle2, Rocket, Target
} from 'lucide-react';
import {
  getCompletionHistory, getTaskReliability, getStreaks, getDayCount
} from '../services/tasks';

const WINDOWS = [
  { value: 7,  label: '7 days'  },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

/* Hackathon status keys, using the same vocabulary the Timeline shows. */
const FUNNEL = [
  { key: 'pending',      label: 'Tracked',    color: '#64748b' },
  { key: 'applied',      label: 'Registered', color: '#38bdf8' },
  { key: 'interviewing', label: 'Building',   color: '#a78bfa' },
  { key: 'offered',      label: 'Won',        color: '#fbbf24' },
  { key: 'rejected',     label: 'Completed',  color: '#34d399' },
];

const pct = n => (n === null || n === undefined ? '—' : Math.round(n * 100) + '%');

/* ── Headline stat ──────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2.5 relative overflow-hidden"
      style={{
        background: 'linear-gradient(150deg, rgba(14,16,30,0.8) 0%, rgba(10,12,22,0.65) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: accent + '1f', border: '1px solid ' + accent + '38' }}>
          <Icon size={12} style={{ color: accent }} />
        </div>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-600">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[26px] font-extrabold leading-none tabular-nums"
          style={{ color: accent }}>
          {value}
        </span>
        {sub && <span className="text-[10.5px] font-semibold text-slate-600">{sub}</span>}
      </div>
    </div>
  );
}

/* ── Daily completion bars ──────────────────────────────── */
function HistoryChart({ history, onPickDate }) {
  // A day with nothing scheduled is drawn as a flat marker rather than a
  // zero bar — no work due is not the same as work missed.
  return (
    <div className="flex items-end gap-[3px] h-28">
      {history.map(d => {
        const empty = d.scheduled === 0;
        const h = empty ? 3 : Math.max(4, Math.round((d.completed / d.scheduled) * 100));
        const full = !empty && d.completed === d.scheduled;
        return (
          <button key={d.date}
            onClick={() => onPickDate && onPickDate(d.date)}
            className="flex-1 flex flex-col justify-end group/bar relative cursor-pointer"
            style={{ minWidth: 3, background: 'none', border: 'none', padding: 0 }}>
            <div
              title={empty
                ? d.date + ' — nothing scheduled'
                : `${d.date} — ${d.completed}/${d.scheduled} done`}
              style={{
                height: `${h}%`,
                borderRadius: 3,
                background: empty
                  ? 'rgba(255,255,255,0.07)'
                  : full
                    ? 'linear-gradient(180deg, #34d399, #10b981)'
                    : 'linear-gradient(180deg, #38bdf8, #0ea5e9)',
                opacity: empty ? 1 : 0.55 + (d.completed / d.scheduled) * 0.45,
                transition: 'opacity 0.2s ease',
              }}
              className="hover:!opacity-100"
            />
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
  const color = weak ? '#fb7185' : strong ? '#34d399' : '#fbbf24';
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors hover:bg-white/[0.025]">
      <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-slate-300 truncate">
        {row.title}
      </span>
      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-700 shrink-0 hidden sm:inline">
        {row.recurrence}
      </span>
      <div className="w-24 h-1 rounded-full overflow-hidden shrink-0"
        style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div style={{
          width: `${rate * 100}%`, height: '100%', borderRadius: 99,
          background: color, boxShadow: `0 0 6px ${color}80`,
        }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums shrink-0 w-9 text-right"
        style={{ color }}>
        {pct(row.rate)}
      </span>
      <span className="text-[10px] font-medium text-slate-700 tabular-nums shrink-0 w-12 text-right">
        {row.completed}/{row.scheduled}
      </span>
    </div>
  );
}

function SectionHead({ icon: Icon, title, hint }) {
  return (
    <div className="flex items-center gap-2 mb-3.5">
      <Icon size={13} className="text-slate-500" />
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{title}</h3>
      {hint && <span className="text-[10.5px] text-slate-700 font-medium">{hint}</span>}
    </div>
  );
}

export default function ReviewView({ applications, projectIdeas, onLock, onMenuToggle, setActiveTab, onPickDate }) {
  const [windowDays, setWindowDays] = useState(30);

  // Recomputed only when the window changes. These read the localStorage
  // caches synchronously, so there is no loading state to manage.
  const history = useMemo(() => getCompletionHistory(windowDays), [windowDays]);
  const reliability = useMemo(() => getTaskReliability(windowDays), [windowDays]);
  const streaks = useMemo(() => getStreaks(180), []);
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
    <div className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ background: '#07060f' }}>
      <div className="workspace-aurora-glow workspace-glow-1" />
      <div className="workspace-aurora-glow workspace-glow-2" />

      <header className="glass-header px-4 lg:px-7 py-4 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <button onClick={onMenuToggle}
            className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-white rounded-xl cursor-pointer flex items-center justify-center shrink-0 bg-white/[0.04] border border-white/[0.06] transition-all hover:bg-white/[0.07]">
            <Menu size={16} />
          </button>
          <div>
            <h2 className="text-[15px] lg:text-[17px] font-extrabold text-white tracking-tight leading-tight">Review</h2>
            <p className="text-[10px] lg:text-[11px] text-slate-600 mt-0.5 font-medium">
              Day {dayCount} &middot; what actually happened
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            {WINDOWS.map(w => (
              <button key={w.value}
                onClick={() => setWindowDays(w.value)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer transition-all ${
                  windowDays === w.value
                    ? 'bg-sky-500/[0.14] text-sky-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}>
                {w.label}
              </button>
            ))}
          </div>
          <button onClick={onLock}
            className="btn-ghost p-2.5 rounded-xl cursor-pointer flex items-center justify-center"
            title="Lock workspace">
            <Lock size={13} className="text-slate-500 hover:text-rose-400 transition-colors" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 lg:px-7 py-6 space-y-7 relative z-10 reveal-stagger custom-scrollbar">

        {/* Headline numbers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp} label={`Completion / ${windowDays}d`} accent="#38bdf8"
            value={pct(overall)}
            sub={hasHistory ? `${totals.completed}/${totals.scheduled}` : 'no data yet'} />
          <StatCard icon={Flame} label="Current streak" accent="#fb923c"
            value={streaks.current} sub={streaks.current === 1 ? 'clean day' : 'clean days'} />
          <StatCard icon={Trophy} label="Longest streak" accent="#fbbf24"
            value={streaks.longest} sub="days" />
          <StatCard icon={Rocket} label="Shipped this month" accent="#34d399"
            value={shippedThisMonth} sub={building ? `${building} building` : 'concepts'} />
        </div>

        {/* Daily bars */}
        <div>
          <SectionHead icon={CalendarDays} title="Daily completion"
            hint={`last ${windowDays} days · click a day to open it`} />
          {hasHistory ? (
            <div className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <HistoryChart history={history} onPickDate={onPickDate} />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.04]">
                <span className="text-[10px] font-semibold text-slate-700">{history[0]?.date}</span>
                <div className="flex items-center gap-3 text-[9.5px] font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-2 h-2 rounded-sm" style={{ background: '#10b981' }} /> all done
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-2 h-2 rounded-sm" style={{ background: '#0ea5e9' }} /> partial
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <span className="w-2 h-2 rounded-sm" style={{ background: 'rgba(255,255,255,0.1)' }} /> nothing due
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-slate-700">today</span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl px-5 py-10 text-center"
              style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <CheckCircle2 size={22} className="text-slate-700 mx-auto mb-2.5" />
              <p className="text-[12.5px] font-semibold text-slate-400">No completion history yet</p>
              <p className="text-[11px] text-slate-600 mt-1">
                Add a recurring task and this fills in from tomorrow.
              </p>
              <button onClick={() => setActiveTab('tasks')}
                className="btn-primary mt-4 px-4 py-2 text-[12px] font-bold rounded-xl cursor-pointer">
                Open Checklist
              </button>
            </div>
          )}
        </div>

        {/* The honest bit */}
        {worst.length > 0 && (
          <div>
            <SectionHead icon={AlertTriangle} title="Consistently skipped"
              hint="under 40% — worth rewording or dropping" />
            <div className="rounded-2xl p-2"
              style={{ background: 'rgba(251,113,133,0.03)', border: '1px solid rgba(251,113,133,0.12)' }}>
              {worst.map(r => <ReliabilityRow key={r.id} row={r} />)}
            </div>
          </div>
        )}

        {/* Every recurring task */}
        {reliability.length > 0 && (
          <div>
            <SectionHead icon={Target} title="Recurring task reliability"
              hint={`${reliability.length} tracked · least reliable first`} />
            <div className="rounded-2xl p-2"
              style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              {reliability.map(r => <ReliabilityRow key={r.id} row={r} />)}
            </div>
          </div>
        )}

        {/* Hackathon funnel */}
        <div>
          <SectionHead icon={Trophy} title="Hackathon funnel"
            hint={winRate === null ? 'no results yet' : `${pct(winRate)} win rate on resolved`} />
          <div className="rounded-2xl p-5"
            style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {funnel.map(f => (
                <button key={f.key}
                  onClick={() => setActiveTab('timeline')}
                  className="flex flex-col items-start gap-1.5 text-left cursor-pointer rounded-xl p-2 -m-2 transition-colors hover:bg-white/[0.03]">
                  <span className="text-[22px] font-extrabold leading-none tabular-nums"
                    style={{ color: f.count ? f.color : 'rgba(148,163,184,0.35)' }}>
                    {String(f.count).padStart(2, '0')}
                  </span>
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-600">
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
