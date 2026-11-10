import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, RotateCcw, Trash2, Timer, Layers, History, CornerDownLeft, Building2, Plus, Pencil } from 'lucide-react';
import { companies as companyStore, companyById, nextCompanyColor, COMPANY_COLORS, resolveCompany } from '../services/work';
import { transactions, incomeSources, formatMoney, monthKey } from '../services/money';
import { CompanyChip } from './MoneyExtras';
import {
  sessions, startSession, stopSession, stopAll, resumeSession, isRunning,
  durationMs, overlapMs, dayBounds, totalForDay, dailyTotals, breakdown,
  formatDuration, useNow, recentLabels,
} from '../services/focus';
import { PageHeader, Card, CardHeader, Stat, Empty, Bars, Segmented, Progress, Modal, Field, Combo, inputCls } from './ui';

const timeFmt = { hour: '2-digit', minute: '2-digit' };

function dayLabel(d) {
  const today = new Date();
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function FocusView({ onLock, onMenuToggle, showToast, projectIdeas = [] }) {
  const all = sessions.useAll();
  const running = all.filter(isRunning);
  const now = useNow(1000, true);

  const [label, setLabel] = useState('');
  const [project, setProject] = useState('');
  const [range, setRange] = useState('week');
  const [splitBy, setSplitBy] = useState('label');
  const [source, setSource] = useState('');
  const [companyModal, setCompanyModal] = useState(null); // null | 'new' | company
  const companyList = companyStore.useAll();
  const activeCompanies = companyList.filter(c => c.active !== false);
  const inputRef = useRef(null);

  useEffect(() => {
    const onNew = () => inputRef.current?.focus();
    window.addEventListener('anonvault:new', onNew);
    return () => window.removeEventListener('anonvault:new', onNew);
  }, []);

  const projectOptions = useMemo(() => {
    const set = new Set();
    projectIdeas.forEach(p => p?.title && set.add(p.title));
    all.forEach(s => s.project && set.add(s.project));
    return [...set].slice(0, 30);
  }, [projectIdeas, all]);

  const start = e => {
    e?.preventDefault();
    const s = startSession({ label, project, company_id: resolveCompany(source) });
    if (!s) { inputRef.current?.focus(); return; }
    setLabel('');
    showToast?.('success', 'Timer started', s.label);
  };

  const remove = s => {
    sessions.remove(s.id);
    showToast?.('warning', 'Session deleted', s.label, 6000, { label: 'Undo', onClick: () => sessions.restore(s) });
  };

  /* ── numbers ── */
  const todayMs = totalForDay(all, new Date(), now);
  const week = dailyTotals(all, 7, now);
  const weekMs = week.reduce((s, d) => s + d.ms, 0);
  const activeDays = week.filter(d => d.ms > 0).length;
  const [todayFrom, todayTo] = dayBounds();
  const todaySessions = all.filter(s => overlapMs(s, todayFrom, todayTo, now) > 0);

  const windowFrom = range === 'today' ? todayFrom : range === 'week' ? week[0].date.getTime() : todayTo - 30 * 86400000;
  const split = breakdown(all, windowFrom, todayTo, splitBy, now).slice(0, 8)
    .map(r => splitBy === 'company'
      ? { ...r, label: companyById(companyList, r.key)?.name || 'No source', color: companyById(companyList, r.key)?.color }
      : { ...r, label: r.key });
  const splitTotal = split.reduce((s, r) => s + r.ms, 0) || 1;

  /* ── log grouped by day ── */
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of all.filter(x => !isRunning(x)).slice(0, 120)) {
      const d = new Date(s.started_at);
      const k = d.toDateString();
      if (!map.has(k)) map.set(k, { date: d, items: [] });
      map.get(k).items.push(s);
    }
    return [...map.values()];
  }, [all]);

  const recents = recentLabels(all, 6);

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Focus" subtitle="What you're working on, and where the hours went"
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={running.length > 1 && (
          <button onClick={stopAll} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
            <Square size={12} /> Stop all
          </button>
        )} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-6 space-y-5 reveal-stagger">

          {/* Start */}
          <Card className="p-2">
            <form onSubmit={start} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Timer size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input ref={inputRef} value={label} onChange={e => setLabel(e.target.value)}
                  placeholder="What are you working on?"
                  className="w-full h-10 pl-9 pr-3 bg-transparent text-[14px] text-slate-100 placeholder:text-slate-500 outline-none" />
              </div>
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <Combo value={source} onChange={setSource} placeholder="Source (company, client…)"
                  suggestions={activeCompanies.map(c => c.name)} className="flex-1 sm:w-48 sm:flex-none"
                  inputClassName="h-10 !bg-transparent" ariaLabel="Source" />
                <Combo value={project} onChange={setProject} placeholder="Project (optional)"
                  suggestions={projectOptions} className="flex-1 sm:w-44 sm:flex-none"
                  inputClassName="h-10 !bg-transparent" ariaLabel="Project" />
                <button type="submit" className="btn-primary h-10 px-4 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-2 shrink-0">
                  <Play size={13} fill="currentColor" /> Start
                </button>
              </div>
            </form>
            {recents.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 px-2 pt-2 pb-1 border-t border-white/[0.05] mt-2">
                <span className="text-[11.5px] text-slate-500 mr-1">Again:</span>
                {recents.map(r => (
                  <button key={r.label + r.project} onClick={() => startSession(r)}
                    className="h-6 px-2 rounded-md text-[12px] text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] cursor-pointer transition-colors inline-flex items-center gap-1.5">
                    <Play size={9} fill="currentColor" className="text-slate-500" />
                    {r.label}{(companyById(companyList, r.company_id)?.name || r.project) && <span className="text-slate-500">· {companyById(companyList, r.company_id)?.name || r.project}</span>}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Running */}
          {running.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {running.map(s => (
                <div key={s.id} className="panel p-4 fade-up" style={{ borderColor: 'rgba(79,209,160,0.22)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="live-dot" />
                    <span className="text-[12px] text-emerald-400 font-medium">Running</span>
                    <span className="text-[12px] text-slate-500 ml-auto tabular-nums">
                      since {new Date(s.started_at).toLocaleTimeString([], timeFmt)}
                    </span>
                  </div>
                  <p className="text-[14px] font-medium text-slate-100 truncate">{s.label}</p>
                  <p className="text-[12.5px] text-slate-500 truncate h-5 flex items-center gap-1.5">
                    <CompanyChip company={companyById(companyList, s.company_id)} />
                    {s.project || (s.company_id ? '' : '\u00a0')}
                  </p>
                  <div className="flex items-end justify-between mt-3">
                    <span className="font-mono text-[28px] leading-none text-slate-50 tracking-[-0.02em]">
                      {formatDuration(durationMs(s, now), { seconds: true })}
                    </span>
                    <button onClick={() => stopSession(s.id)}
                      className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
                      <Square size={11} fill="currentColor" /> Stop
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Focused today" value={formatDuration(todayMs)} hint={`${todaySessions.length} session${todaySessions.length === 1 ? '' : 's'}`} />
            <Stat label="Running now" value={running.length} hint={running.length > 1 ? 'Multitasking' : running.length ? 'Single track' : 'Nothing running'} tone={running.length ? 'good' : undefined} />
            <Stat label="Last 7 days" value={formatDuration(weekMs)} hint={`${activeDays}/7 active days`} />
            <Stat label="Daily average" value={formatDuration(activeDays ? weekMs / activeDays : 0)} hint="On active days" />
          </div>

          <CompaniesCard companies={companyList} sessions={all} now={now}
            onAdd={() => setCompanyModal('new')} onEdit={c => setCompanyModal(c)}
            onStart={c => { startSession({ label: `Work · ${c.name}`, company_id: c.id }); showToast?.('success', 'Timer started', c.name); }} />

          {/* Day timeline */}
          <Card>
            <CardHeader icon={Layers} title="Today" meta={formatDuration(todayMs)} />
            <div className="px-4 pb-4">
              <DayTimeline items={todaySessions} now={now} from={todayFrom} companies={companyList} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader title="Last 7 days" meta={formatDuration(weekMs)} />
              <div className="px-4 pb-4">
                <Bars
                  values={week.map(d => ({
                    label: d.date.toLocaleDateString(undefined, { weekday: 'narrow' }),
                    value: d.ms / 3600000,
                    title: `${d.date.toLocaleDateString(undefined, { weekday: 'long' })}: ${formatDuration(d.ms)}`,
                  }))}
                  height={110}
                />
              </div>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader title="Where the time went"
                action={<div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <Segmented size="sm" value={splitBy} onChange={setSplitBy}
                    options={[{ value: 'label', label: 'Activity' }, { value: 'company', label: 'Source' }, { value: 'project', label: 'Project' }]} />
                  <Segmented size="sm" value={range} onChange={setRange}
                    options={[{ value: 'today', label: 'Today' }, { value: 'week', label: '7d' }, { value: 'month', label: '30d' }]} />
                </div>} />
              <div className="px-4 pb-4 space-y-3">
                {split.length === 0 && <p className="text-[13px] text-slate-500 py-6 text-center">No tracked time in this range.</p>}
                {split.map(r => (
                  <div key={r.key}>
                    <div className="flex items-center justify-between text-[13px] mb-1.5">
                      <span className="text-slate-200 truncate pr-3 inline-flex items-center gap-2">
                        {r.color && <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: r.color }} />}{r.label}
                      </span>
                      <span className="text-slate-500 tabular-nums shrink-0">
                        {formatDuration(r.ms)} <span className="text-slate-600">· {Math.round((r.ms / splitTotal) * 100)}%</span>
                      </span>
                    </div>
                    <Progress value={r.ms / split[0].ms} tone="neutral" height={3} />
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Log */}
          <Card>
            <CardHeader icon={History} title="Log" />
            {groups.length === 0 ? (
              <Empty icon={Timer} title="No sessions yet"
                body="Type what you're doing above and press Enter. Start another while the first is running to track work in parallel." />
            ) : (
              <div className="pb-2">
                {groups.map(g => {
                  const total = g.items.reduce((s, x) => s + durationMs(x), 0);
                  return (
                    <div key={g.date.toDateString()}>
                      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.015] border-y border-white/[0.04]">
                        <span className="text-[12px] font-medium text-slate-400">{dayLabel(g.date)}</span>
                        <span className="text-[12px] text-slate-500 tabular-nums">{formatDuration(total)}</span>
                      </div>
                      {g.items.map(s => (
                        <div key={s.id} className="group flex items-center gap-3 px-4 h-11 hover:bg-white/[0.02] transition-colors">
                          <span className="text-[12px] text-slate-500 tabular-nums w-[104px] shrink-0">
                            {new Date(s.started_at).toLocaleTimeString([], timeFmt)} – {new Date(s.ended_at).toLocaleTimeString([], timeFmt)}
                          </span>
                          <span className="text-[13px] text-slate-200 truncate">{s.label}</span>
                          <span className="hidden sm:inline-flex"><CompanyChip company={companyById(companyList, s.company_id)} /></span>
                          {s.project && <span className="hidden sm:inline text-[11.5px] text-slate-500 px-1.5 h-5 leading-5 rounded bg-white/[0.04] border border-white/[0.05] truncate max-w-[160px]">{s.project}</span>}
                          <span className="ml-auto text-[13px] text-slate-300 tabular-nums shrink-0">{formatDuration(durationMs(s))}</span>
                          <div className="flex items-center sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button onClick={() => resumeSession(s)} className="icon-btn" title="Start again"><RotateCcw size={13} /></button>
                            <button onClick={() => remove(s)} className="icon-btn hover:!text-rose-400" title="Delete"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <p className="text-[12px] text-slate-600 flex items-center gap-1.5 justify-center pb-4">
            Press <span className="kbd">N</span> anywhere in Focus to start typing, then <CornerDownLeft size={12} /> to start.
          </p>
        </div>
      </div>

      {companyModal && (
        <CompanyModal initial={companyModal === 'new' ? null : companyModal} companies={companyList}
          onClose={created => { setCompanyModal(null); if (created) setSource(created.name); }} />
      )}
    </div>
  );
}

/* Sessions laid out on the day, one lane per overlapping track, so
   parallel work reads as parallel instead of being summed away. */
function DayTimeline({ items, now, from, companies = [] }) {
  const sorted = [...items].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const startHour = Math.min(8, ...sorted.map(s => Math.max(from, new Date(s.started_at).getTime())).map(t => new Date(t).getHours()));
  const endHour = Math.max(22, ...sorted.map(s => new Date(s.ended_at ? s.ended_at : now).getHours() + 1));
  const span = Math.max(1, Math.min(24, endHour) - startHour);
  const t0 = from + startHour * 3600000;
  const toPct = t => Math.max(0, Math.min(100, ((t - t0) / (span * 3600000)) * 100));

  const lanes = [];
  const placed = sorted.map(s => {
    const a = Math.max(from, new Date(s.started_at).getTime());
    const b = s.ended_at ? new Date(s.ended_at).getTime() : now;
    let lane = lanes.findIndex(end => end <= a);
    if (lane === -1) { lane = lanes.length; lanes.push(b); } else lanes[lane] = b;
    return { s, a, b, lane };
  });
  const laneCount = Math.max(1, lanes.length);
  const hours = Array.from({ length: span + 1 }, (_, i) => startHour + i);
  const nowPct = toPct(now);

  return (
    <div>
      <div className="relative rounded-lg bg-white/[0.02] border border-white/[0.05]" style={{ height: laneCount * 30 + 12 }}>
        {hours.map((h, i) => (
          <div key={h} className="absolute top-0 bottom-0 w-px bg-white/[0.04]" style={{ left: (i / span) * 100 + '%' }} />
        ))}
        {placed.map(({ s, a, b, lane }) => {
          const co = companyById(companies, s.company_id);
          return (
          <div key={s.id} title={`${s.label}${co ? ` · ${co.name}` : ''} · ${formatDuration(b - a)}`}
            className="absolute h-[24px] rounded-md px-2 flex items-center text-[11.5px] font-medium truncate"
            style={{
              top: 6 + lane * 30,
              left: toPct(a) + '%',
              width: `max(6px, ${toPct(b) - toPct(a)}%)`,
              background: (co?.color || (isRunning(s) ? '#4fd1a0' : '#4f7bff')) + '29',
              border: `1px solid ${(co?.color || (isRunning(s) ? '#4fd1a0' : '#4f7bff')) + '59'}`,
              color: '#e4e4e7',
            }}>
            {isRunning(s) && <span className="live-dot mr-1.5 !w-[5px] !h-[5px]" />}{s.label}
          </div>
          );
        })}
        {nowPct > 0 && nowPct < 100 && (
          <div className="absolute top-0 bottom-0 w-px bg-rose-400/70" style={{ left: nowPct + '%' }}>
            <span className="absolute -top-1 -left-[3px] w-[7px] h-[7px] rounded-full bg-rose-400" />
          </div>
        )}
        {placed.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[12.5px] text-slate-500">Nothing tracked yet today</div>
        )}
      </div>
      <div className="relative h-5 mt-1.5">
        {hours.filter((_, i) => i % (span > 12 ? 3 : 2) === 0 || i === span).map(h => (
          <span key={h} className={`absolute text-[10.5px] text-slate-600 tabular-nums ${h === startHour ? '' : h - startHour >= span ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: ((h - startHour) / span) * 100 + '%' }}>
            {String(h % 24).padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  );
}

/* Every company you work for, side by side: time this week and month,
   and the income its linked sources brought in this month. */
function CompaniesCard({ companies, sessions: list, now, onAdd, onEdit, onStart }) {
  const tx = transactions.useAll();
  const sources = incomeSources.useAll();
  const month = monthKey();
  const [, todayTo] = dayBounds();
  const weekFrom = todayTo - 7 * 86400000;
  const d = new Date();
  const monthFrom = new Date(d.getFullYear(), d.getMonth(), 1).getTime();

  const rows = companies.map(c => {
    const mine = list.filter(s => s.company_id === c.id);
    const week = mine.reduce((acc, s) => acc + overlapMs(s, weekFrom, todayTo, now), 0);
    const monthMs = mine.reduce((acc, s) => acc + overlapMs(s, monthFrom, todayTo, now), 0);
    const srcIds = new Set(sources.filter(s => s.company_id === c.id).map(s => s.id));
    const earned = tx.filter(t => t.type === 'income' && srcIds.has(t.source_id) && (t.date || '').startsWith(month))
      .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    const running = mine.some(isRunning);
    return { c, week, monthMs, earned, running, hasSource: srcIds.size > 0 };
  });
  const maxWeek = Math.max(1, ...rows.map(r => r.week));

  return (
    <Card>
      <CardHeader icon={Building2} title="Sources" meta={companies.length || null}
        action={<button onClick={onAdd} className="btn-ghost h-7 px-2.5 rounded-md text-[12px] cursor-pointer inline-flex items-center gap-1"><Plus size={12} /> Add</button>} />
      {rows.length === 0 ? (
        <div className="px-4 pb-4 text-[12.5px] text-slate-500">
          Type a source (company, client, side project) when you start a timer, or add one here, to see hours and income side by side.
        </div>
      ) : (
        <div className="pb-2">
          <div className="hidden sm:flex items-center gap-3 px-4 h-7 text-[11.5px] text-slate-500">
            <span className="flex-1">Source</span>
            <span className="w-40">Last 7 days</span>
            <span className="w-20 text-right">This month</span>
            <span className="w-24 text-right">Earned</span>
            <span className="w-[68px]" />
          </div>
          {rows.map(({ c, week, monthMs, earned, running, hasSource }) => (
            <div key={c.id} className={`group flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 px-4 py-2.5 border-t border-white/[0.04] hover:bg-white/[0.015] transition-colors ${c.active === false ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0 flex items-center gap-2.5 basis-full sm:basis-auto">
                <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: c.color }} />
                <div className="min-w-0">
                  <p className="text-[13.5px] text-slate-100 truncate flex items-center gap-2">{c.name}{running && <span className="live-dot" />}</p>
                  {c.role && <p className="text-[12px] text-slate-500 truncate">{c.role}</p>}
                </div>
              </div>
              <div className="sm:w-40 flex items-center gap-2 flex-1 sm:flex-none">
                <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: (week / maxWeek) * 100 + '%', background: c.color }} />
                </div>
                <span className="text-[12px] text-slate-300 tabular-nums w-14 text-right">{formatDuration(week)}</span>
              </div>
              <span className="sm:w-20 sm:text-right text-[12.5px] text-slate-400 tabular-nums">{formatDuration(monthMs)}</span>
              <span className="sm:w-24 sm:text-right text-[12.5px] tabular-nums" title={hasSource ? 'Income from sources linked to this company' : 'Link an income source to this company in Money'}>
                {hasSource ? <span className={earned ? 'text-emerald-400' : 'text-slate-500'}>{formatMoney(earned)}</span> : <span className="text-slate-600">—</span>}
              </span>
              <div className="w-[68px] flex justify-end ml-auto sm:ml-0">
                <button onClick={() => onStart(c)} className="icon-btn !w-7 !h-7" title={`Start a timer for ${c.name}`}><Play size={11} fill="currentColor" /></button>
                <button onClick={() => onEdit(c)} className="icon-btn !w-7 !h-7" title="Edit"><Pencil size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CompanyModal({ initial, companies, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [role, setRole] = useState(initial?.role || '');
  const [color, setColor] = useState(initial?.color || nextCompanyColor(companies));
  const [active, setActive] = useState(initial?.active !== false);
  const [error, setError] = useState('');

  const save = e => {
    e?.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    const row = { name: name.trim(), role: role.trim(), color, active };
    if (initial) { companyStore.update(initial.id, row); onClose(); }
    else onClose(companyStore.add(row));
  };

  const remove = () => {
    companyStore.remove(initial.id);
    onClose();
  };

  return (
    <Modal open onClose={() => onClose()} title={initial ? 'Edit source' : 'Add source'} width={420}
      footer={<>
        {initial && <button onClick={remove} className="btn-danger h-8 px-3 rounded-lg text-[13px] cursor-pointer mr-auto">Delete</button>}
        <button onClick={() => onClose()} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Cancel</button>
        <button onClick={save} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">Save</button>
      </>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Labs" className={inputCls} />
        </Field>
        <Field label="Your role">
          <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Frontend intern, Freelance designer" className={inputCls} />
        </Field>
        <Field label="Colour">
          <div className="flex gap-2">
            {COMPANY_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`}
                className="w-6 h-6 rounded-md cursor-pointer transition-transform"
                style={{ background: c, outline: color === c ? '2px solid #ededef' : 'none', outlineOffset: 2 }} />
            ))}
          </div>
        </Field>
        {initial && (
          <label className="flex items-center gap-2 text-[13px] text-slate-300 cursor-pointer">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="accent-slate-200" />
            Still working here
          </label>
        )}
        {error && <p className="text-[12.5px] text-rose-400">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
