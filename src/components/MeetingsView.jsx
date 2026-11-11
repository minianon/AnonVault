import { useEffect, useRef, useState } from 'react';
import {
  Video, Plus, Search, Repeat2, Pencil, Trash2, CalendarX2, ChevronDown, CalendarClock, Clock, CalendarPlus,
} from 'lucide-react';
import { PageHeader, Card, CardHeader, Empty } from './ui';
import { useNow } from '../services/focus';
import {
  meetings as meetingStore, meetingsOn, nextDate, occurrencesBetween, timeRange, repeatLabel, timing, linkHref, formatTime,
  endSeriesBefore, ymd, colorOf, durationMin, durationLabel, weekdaysOf,
} from '../services/meetings';
import MeetingModal from './MeetingModal';

const isRepeating = m => !!m.recurrence && m.recurrence !== 'none';
const parseDay = key => new Date(key + 'T00:00:00');
const addDaysKey = (key, n) => { const d = parseDay(key); d.setDate(d.getDate() + n); return ymd(d); };
const shortDate = key => parseDay(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
function relDay(key, today) {
  const diff = Math.round((parseDay(key) - parseDay(today)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return parseDay(key).toLocaleDateString(undefined, { weekday: 'long' });
  return shortDate(key);
}
const PILL_ORDER = [1, 2, 3, 4, 5, 6, 0];
const PILL_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Minutes from now until `date`+`time` (can be negative). */
function minsUntil(date, time, now) {
  const [h, m] = (time || '00:00').split(':').map(Number);
  const d = parseDay(date);
  d.setHours(h, m, 0, 0);
  return Math.round((d - now) / 60000);
}
function inLabel(mins) {
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return h < 24 ? `in ${h} h${m ? ` ${m} min` : ''}` : null;
}

function JoinButton({ meeting, big = false, glow = false }) {
  const href = linkHref(meeting.link);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      className={big
        ? `h-9 px-4 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 shrink-0 transition-colors ${glow ? 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300' : 'btn-primary'}`
        : `h-7 px-2.5 rounded-md border text-[12px] inline-flex items-center gap-1 shrink-0 transition-colors ${glow ? 'border-emerald-400/40 text-emerald-200 hover:text-emerald-100 bg-emerald-400/[0.06]' : 'border-white/[0.1] text-slate-300 hover:text-slate-50 hover:border-white/[0.2]'}`}>
      <Video size={big ? 14 : 12} /> Join
    </a>
  );
}

/* ── Up next ───────────────────────────────────────────── */
function UpNext({ list, today, now, onOpen, onNew }) {
  // Live now, else the next one later today, else the next one in the coming month.
  let pick = null;
  for (const m of meetingsOn(list, today)) {
    const t = timing(m, today, now);
    if (!m.start_time || t?.over) continue;
    if (t?.live) { pick = { m, date: today, live: true, t }; break; }
    if (!pick) pick = { m, date: today, t };
  }
  if (!pick) {
    for (let i = 1; i <= 30 && !pick; i++) {
      const key = addDaysKey(today, i);
      const first = meetingsOn(list, key)[0];
      if (first) pick = { m: first, date: key };
    }
  }

  if (!pick) {
    return (
      <Card className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
          <CalendarClock size={18} className="text-slate-500" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-slate-100">Nothing scheduled</p>
          <p className="text-[12.5px] text-slate-500">No meetings in the next 30 days.</p>
        </div>
        <button onClick={onNew} className="btn-primary h-9 px-4 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-auto">
          <Plus size={14} /> New meeting
        </button>
      </Card>
    );
  }

  const { m, date, live } = pick;
  const color = colorOf(m);
  const len = durationMin(m);
  const mins = date === today && m.start_time ? minsUntil(date, m.start_time, now) : null;
  let eyebrow;
  if (live) eyebrow = 'Happening now';
  else if (mins != null && mins <= 0) eyebrow = 'Starting now';
  else if (mins != null && inLabel(mins)) eyebrow = `Up next · ${inLabel(mins)}`;
  else eyebrow = `Next · ${relDay(date, today)}`;

  // Live progress through the meeting.
  let elapsedPct = 0, leftMin = null;
  if (live && len) {
    const startedAgo = -minsUntil(date, m.start_time, now);
    elapsedPct = Math.min(1, Math.max(0, startedAgo / len));
    leftMin = Math.max(0, len - startedAgo);
  }

  return (
    <Card className="relative overflow-hidden">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.07]" style={{ background: `radial-gradient(600px 160px at 0% 0%, ${color}, transparent)` }} />
      <div className="relative p-5 pl-6 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] font-medium inline-flex items-center gap-1.5 ${live ? 'text-emerald-300' : 'text-slate-400'}`}>
            {live && <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" /><span className="relative w-2 h-2 rounded-full bg-emerald-400" /></span>}
            {eyebrow}
          </p>
          <button onClick={() => onOpen(m, date)} className="block text-left cursor-pointer mt-1 max-w-full">
            <h2 className="text-[20px] sm:text-[22px] font-semibold text-slate-50 tracking-[-0.01em] truncate">{m.title}</h2>
          </button>
          <p className="mt-1 text-[13px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><Clock size={13} className="text-slate-500" />{timeRange(m)}{len ? <span className="text-slate-500"> · {durationLabel(len)}</span> : null}</span>
            {isRepeating(m) && <span className="inline-flex items-center gap-1.5"><Repeat2 size={13} className="text-slate-500" />{repeatLabel(m)}</span>}
          </p>
          {m.note && <p className="mt-2 text-[12.5px] text-slate-500 line-clamp-2 whitespace-pre-line max-w-2xl">{m.note}</p>}
          {live && len && (
            <div className="mt-3 max-w-md">
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-700" style={{ width: `${elapsedPct * 100}%` }} />
              </div>
              <p className="mt-1 text-[11.5px] text-slate-500 tabular-nums">{leftMin} min left</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => onOpen(m, date)} className="btn-ghost h-9 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
            <Pencil size={13} /> Edit
          </button>
          <JoinButton meeting={m} big glow={live || (mins != null && mins <= 10)} />
        </div>
      </div>
    </Card>
  );
}

/* ── Agenda for one day ────────────────────────────────── */
function AgendaItem({ m, date, today, now, onOpen }) {
  const t = timing(m, date, now);
  const color = colorOf(m);
  const len = durationMin(m);
  const past = date < today || t?.over;
  const mins = date === today && m.start_time && !t?.live && !t?.over ? minsUntil(date, m.start_time, now) : null;
  return (
    <li>
      <div role="button" tabIndex={0} onClick={() => onOpen(m, date)} onKeyDown={e => { if (e.key === 'Enter') onOpen(m, date); }}
        className={`group flex gap-3 px-3 py-2.5 rounded-xl cursor-pointer outline-none transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.05] ${past ? 'opacity-50' : ''}`}>
        <div className="w-[64px] shrink-0 pt-0.5 tabular-nums leading-tight">
          <p className="text-[13px] font-medium text-slate-200">{m.start_time ? formatTime(m.start_time) : 'All day'}</p>
          {m.end_time && <p className="text-[11.5px] text-slate-500">{formatTime(m.end_time)}</p>}
        </div>
        <div className="flex-1 min-w-0 flex gap-3 rounded-lg px-3 py-2 border border-white/[0.05]"
          style={{ background: `linear-gradient(90deg, ${color}1c, ${color}08 60%, transparent)` }}>
          <span className="w-[3px] rounded-full shrink-0 self-stretch" style={{ background: color }} />
          <div className="flex-1 min-w-0">
            <p className={`text-[13.5px] font-medium truncate ${past ? 'text-slate-400' : 'text-slate-100'}`}>{m.title}</p>
            <p className="text-[11.5px] text-slate-500 truncate flex items-center gap-1.5">
              {len ? <span>{durationLabel(len)}</span> : null}
              {isRepeating(m) && <>{len ? <span>·</span> : null}<Repeat2 size={11} className="shrink-0" /><span className="truncate">{repeatLabel(m)}</span></>}
              {m.note && <><span>·</span><span className="truncate">{m.note.split('\n')[0]}</span></>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {t?.live && <span className="h-5 px-1.5 rounded-md border text-[11px] leading-[18px] text-emerald-300 bg-emerald-400/10 border-emerald-400/30">Now</span>}
            {mins != null && mins <= 60 && <span className="h-5 px-1.5 rounded-md border text-[11px] leading-[18px] text-amber-300 bg-amber-400/10 border-amber-400/30">{mins <= 0 ? 'Starting' : `in ${mins}m`}</span>}
            {date === today && !t?.over && <JoinButton meeting={m} glow={t?.live || (mins != null && mins <= 10)} />}
          </div>
        </div>
      </div>
    </li>
  );
}

function NowLine({ now }) {
  return (
    <li aria-hidden="true" className="flex items-center gap-3 px-3 py-1">
      <span className="w-[64px] shrink-0 text-[11px] font-medium tabular-nums text-rose-300">
        {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </span>
      <span className="relative flex-1 h-px bg-rose-400/70">
        <span className="absolute -left-1 -top-[3px] w-[7px] h-[7px] rounded-full bg-rose-400" />
      </span>
    </li>
  );
}

function Agenda({ list, today, now, onOpen, onNew }) {
  const [day, setDay] = useState(today);
  // Midnight rolled over: follow it if "today" was selected.
  const prevToday = useRef(today);
  useEffect(() => {
    if (prevToday.current !== today) { setDay(d => (d === prevToday.current ? today : d)); prevToday.current = today; }
  }, [today]);

  const strip = Array.from({ length: 7 }, (_, i) => addDaysKey(today, i));
  const items = meetingsOn(list, day);
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // Where the "now" line goes: before the first timed meeting that hasn't started.
  const nowIdx = day === today ? (() => {
    const i = items.findIndex(m => m.start_time && m.start_time > nowHM);
    return i === -1 ? items.length : i;
  })() : -1;
  const totalMin = items.reduce((s, m) => s + (durationMin(m) || 0), 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader icon={CalendarClock} title="Agenda"
        meta={items.length ? `${items.length} meeting${items.length === 1 ? '' : 's'}${totalMin ? ` · ${durationLabel(totalMin)}` : ''}` : null}
        action={<button onClick={() => onNew(day)} className="icon-btn" title={`New meeting on ${shortDate(day)}`} aria-label="New meeting on this day"><CalendarPlus size={14} /></button>} />

      {/* 7-day strip */}
      <div className="grid grid-cols-7 gap-1.5 px-4 pb-3">
        {strip.map(key => {
          const d = parseDay(key);
          const ms = meetingsOn(list, key);
          const sel = key === day;
          return (
            <button key={key} onClick={() => setDay(key)} aria-pressed={sel}
              title={`${shortDate(key)} · ${ms.length || 'no'} meeting${ms.length === 1 ? '' : 's'}`}
              className={`h-[62px] rounded-xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                sel ? 'bg-white/[0.08] border-white/[0.16]' : 'border-white/[0.05] hover:bg-white/[0.03] hover:border-white/[0.1]'}`}>
              <span className={`text-[10.5px] uppercase tracking-wide ${key === today ? 'text-[var(--accent)]' : 'text-slate-500'}`}>
                {key === today ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
              <span className={`text-[16px] font-semibold tabular-nums leading-none ${sel ? 'text-slate-50' : 'text-slate-300'}`}>{d.getDate()}</span>
              <span className="flex items-center gap-[3px] h-[5px]">
                {ms.slice(0, 4).map(m => <span key={m.id} className="w-[5px] h-[5px] rounded-full" style={{ background: colorOf(m) }} />)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/[0.05] pt-2 pb-2">
        {items.length === 0 ? (
          <div className="px-4 py-8 flex flex-col items-center text-center gap-2">
            <p className="text-[13px] text-slate-400">No meetings {day === today ? 'today' : `on ${relDay(day, today)}`}.</p>
            <button onClick={() => onNew(day)} className="btn-ghost h-8 px-3 rounded-lg text-[12.5px] cursor-pointer inline-flex items-center gap-1.5">
              <Plus size={13} /> Add one
            </button>
          </div>
        ) : (
          <ul className="px-1">
            {items.map((m, i) => (
              <FragmentWithNow key={m.id} showNow={i === nowIdx} now={now}>
                <AgendaItem m={m} date={day} today={today} now={now} onOpen={onOpen} />
              </FragmentWithNow>
            ))}
            {nowIdx === items.length && <NowLine now={now} />}
          </ul>
        )}
      </div>
    </Card>
  );
}
function FragmentWithNow({ showNow, now, children }) {
  return <>{showNow && <NowLine now={now} />}{children}</>;
}

/* ── Repeating series ──────────────────────────────────── */
function SeriesCard({ m, next, today, onOpen, onEnd, onDelete }) {
  const color = colorOf(m);
  const days = weekdaysOf(m);
  const skippedAhead = (m.skipped || []).filter(d => d >= today).length;
  return (
    <li className="group relative rounded-xl border border-white/[0.06] hover:border-white/[0.12] bg-white/[0.015] transition-colors">
      <button onClick={() => onOpen(m, next)} className="w-full text-left px-3.5 py-3 cursor-pointer">
        <div className="flex items-center gap-2 pr-16">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <p className="text-[13.5px] font-medium text-slate-100 truncate">{m.title}</p>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {days ? (
            <span className="inline-flex gap-[3px]">
              {PILL_ORDER.map(d => (
                <span key={d} className={`w-[18px] h-[18px] rounded-[5px] text-[10px] font-medium flex items-center justify-center ${
                  days.includes(d) ? 'text-slate-950' : 'text-slate-600 bg-white/[0.03]'}`}
                  style={days.includes(d) ? { background: color } : undefined}>{PILL_LETTER[d]}</span>
              ))}
            </span>
          ) : <span className="text-[11.5px] text-slate-400">{repeatLabel(m)}</span>}
          {m.recurrence === 'biweekly' && <span className="text-[11px] text-slate-500">every 2 weeks</span>}
        </div>
        <p className="mt-2 text-[11.5px] text-slate-500 flex flex-wrap gap-x-2">
          <span className="text-slate-300 tabular-nums">{timeRange(m)}</span>
          <span>Next {next === today ? 'today' : relDay(next, today).toLowerCase() === 'tomorrow' ? 'tomorrow' : shortDate(next)}</span>
          {m.ends_on && <span>until {shortDate(m.ends_on)}</span>}
          {skippedAhead > 0 && <span>{skippedAhead} skipped</span>}
        </p>
      </button>
      <span className="absolute top-2 right-2 flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button onClick={() => onEnd(m)} className="icon-btn !w-7 !h-7" title="End series (keeps past ones)" aria-label="End series"><CalendarX2 size={12} /></button>
        <button onClick={() => onDelete(m)} className="icon-btn !w-7 !h-7 hover:!text-rose-400" title="Delete series" aria-label="Delete series"><Trash2 size={12} /></button>
      </span>
    </li>
  );
}

/* ── One-time ──────────────────────────────────────────── */
function DateBadge({ date, color }) {
  const d = parseDay(date);
  return (
    <span className="w-11 shrink-0 rounded-lg overflow-hidden border border-white/[0.08] text-center bg-white/[0.02]">
      <span className="block text-[9.5px] font-semibold uppercase tracking-wider py-[2px] text-slate-950" style={{ background: color }}>
        {d.toLocaleDateString(undefined, { month: 'short' })}
      </span>
      <span className="block text-[16px] font-semibold tabular-nums text-slate-100 leading-[26px]">{d.getDate()}</span>
    </span>
  );
}

export default function MeetingsView({ onLock, onMenuToggle, showToast, title = 'Meetings', viewSwitch = null }) {
  const all = meetingStore.useAll();
  const now = new Date(useNow(30000));
  const today = ymd(now);
  const [editing, setEditing] = useState(null); // { meeting, date }
  const [query, setQuery] = useState('');
  const [showPast, setShowPast] = useState(false);
  const rootRef = useRef(null);

  // "n" anywhere in this section starts a new meeting.
  useEffect(() => {
    const onNew = () => { if (rootRef.current?.closest('[aria-hidden="false"]')) setEditing({ meeting: null, date: ymd(new Date()) }); };
    window.addEventListener('anonvault:new', onNew);
    return () => window.removeEventListener('anonvault:new', onNew);
  }, []);

  const q = query.trim().toLowerCase();
  const list = q ? all.filter(m => `${m.title} ${m.note || ''}`.toLowerCase().includes(q)) : all;

  const todays = meetingsOn(list, today);
  const week = occurrencesBetween(list, addDaysKey(today, 1), addDaysKey(today, 7));
  const series = list.filter(isRepeating).map(m => ({ m, next: nextDate(m, today) }))
    .sort((a, b) => Number(!a.next) - Number(!b.next) || (a.next || '').localeCompare(b.next || '') || (a.m.start_time || '').localeCompare(b.m.start_time || ''));
  const activeSeries = series.filter(s => s.next);
  const endedSeries = series.filter(s => !s.next);
  const oneTime = list.filter(m => !isRepeating(m));
  const upcomingOnce = oneTime.filter(m => m.start_date >= today).sort((a, b) => (a.start_date + (a.start_time || '')).localeCompare(b.start_date + (b.start_time || '')));
  const pastOnce = oneTime.filter(m => m.start_date < today).sort((a, b) => b.start_date.localeCompare(a.start_date));

  const open = (meeting, date) => setEditing({ meeting, date: date || meeting?.start_date || today });
  const newOn = date => setEditing({ meeting: null, date: date || today });

  const remove = m => {
    meetingStore.remove(m.id);
    showToast?.('warning', isRepeating(m) ? 'Meeting series deleted' : 'Meeting deleted', m.title, 6000,
      { label: 'Undo', onClick: () => meetingStore.restore(m) });
  };
  const endSeries = m => {
    // Ending a series that hasn't started yet just removes it.
    if (m.start_date >= today) return remove(m);
    const undo = endSeriesBefore(m, today);
    showToast?.('success', 'Series ended', `${m.title} — earlier meetings are kept`, 6000, { label: 'Undo', onClick: undo });
  };

  const left = todays.filter(m => !timing(m, today, now)?.over).length;

  return (
    <div ref={rootRef} className="h-full flex flex-col">
      <PageHeader title={title}
        stats={[
          { value: left, label: 'left today', tone: left ? 'warn' : undefined },
          { value: week.length, label: 'next 7 days' },
          { value: activeSeries.length, label: 'repeating' },
        ]}
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={<>
          {viewSwitch && <div className="hidden sm:block">{viewSwitch}</div>}
          {all.length > 3 && (
            <div className="relative hidden md:block w-[200px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search meetings"
                className="input-premium w-full h-8 pl-8 pr-3 rounded-lg text-[13px]" />
            </div>
          )}
          <button onClick={() => newOn(today)}
            className="btn-primary h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
            <Plus size={14} /><span className="hidden sm:inline">New meeting</span>
          </button>
        </>} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4 lg:px-6 py-5 space-y-5">
          {viewSwitch && <div className="sm:hidden">{viewSwitch}</div>}
          {all.length === 0 ? (
            <Card>
              <Empty icon={Video} title="No meetings yet"
                body="Add one-time or repeating meetings — standups, client calls, classes. They show up here, on the Calendar and on Today."
                action={<button onClick={() => newOn(today)} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">New meeting</button>} />
            </Card>
          ) : (
            <>
              {all.length > 3 && (
                <div className="relative md:hidden">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search meetings"
                    className="input-premium w-full h-9 pl-8 pr-3 rounded-lg text-[13px]" />
                </div>
              )}

              <UpNext list={list} today={today} now={now} onOpen={open} onNew={() => newOn(today)} />

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
                <Agenda list={list} today={today} now={now} onOpen={open} onNew={newOn} />

                <div className="space-y-5 min-w-0">
                  <Card className="overflow-hidden">
                    <CardHeader icon={Repeat2} title="Repeating" meta={activeSeries.length || null} />
                    {activeSeries.length === 0 ? (
                      <p className="px-4 pb-4 text-[12.5px] text-slate-500">No repeating meetings. Pick "Repeats" when you add one.</p>
                    ) : (
                      <ul className="px-3 pb-3 space-y-2">
                        {activeSeries.map(({ m, next }) => (
                          <SeriesCard key={m.id} m={m} next={next} today={today} onOpen={open} onEnd={endSeries} onDelete={remove} />
                        ))}
                      </ul>
                    )}
                  </Card>

                  <Card className="overflow-hidden">
                    <CardHeader icon={CalendarClock} title="One-time" meta={upcomingOnce.length || null} />
                    {upcomingOnce.length === 0 ? (
                      <p className="px-4 pb-3 text-[12.5px] text-slate-500">No upcoming one-time meetings.</p>
                    ) : (
                      <ul className="px-2 pb-2">
                        {upcomingOnce.map(m => (
                          <li key={m.id} className="group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                            <button onClick={() => open(m)} className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer">
                              <DateBadge date={m.start_date} color={colorOf(m)} />
                              <span className="min-w-0">
                                <span className="block text-[13.5px] font-medium text-slate-100 truncate">{m.title}</span>
                                <span className="block text-[11.5px] text-slate-500 truncate">{relDay(m.start_date, today)} · {timeRange(m)}</span>
                              </span>
                            </button>
                            <button onClick={() => remove(m)} className="icon-btn !w-7 !h-7 hover:!text-rose-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" title="Delete" aria-label="Delete meeting"><Trash2 size={12} /></button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {(pastOnce.length > 0 || endedSeries.length > 0) && (
                      <div className="border-t border-white/[0.05]">
                        <button onClick={() => setShowPast(s => !s)}
                          className="w-full flex items-center gap-1.5 px-4 h-9 text-[12px] text-slate-500 hover:text-slate-300 cursor-pointer">
                          <ChevronDown size={13} className={`transition-transform ${showPast ? '' : '-rotate-90'}`} />
                          Past & ended ({pastOnce.length + endedSeries.length})
                        </button>
                        {showPast && (
                          <ul className="px-2 pb-2">
                            {[...endedSeries.map(s => s.m), ...pastOnce].map(m => (
                              <li key={m.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0 opacity-50" style={{ background: colorOf(m) }} />
                                <button onClick={() => open(m)} className="flex-1 min-w-0 text-left cursor-pointer">
                                  <p className="text-[13px] text-slate-400 truncate">{m.title}</p>
                                  <p className="text-[11.5px] text-slate-600 truncate">
                                    {isRepeating(m) ? `${repeatLabel(m)} · ended ${m.ends_on ? shortDate(m.ends_on) : ''}` : shortDate(m.start_date)}
                                  </p>
                                </button>
                                <button onClick={() => remove(m)} className="icon-btn !w-7 !h-7 hover:!text-rose-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" title="Delete" aria-label="Delete meeting"><Trash2 size={12} /></button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {editing && (
        <MeetingModal key={(editing.meeting?.id || 'new') + editing.date} initial={editing.meeting} date={editing.date}
          onClose={() => setEditing(null)} showToast={showToast} />
      )}
    </div>
  );
}
