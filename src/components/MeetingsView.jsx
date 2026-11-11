import { useEffect, useRef, useState } from 'react';
import { Video, Plus, Search, Repeat2, ExternalLink, Pencil, Trash2, CalendarX2, ChevronDown, CalendarClock } from 'lucide-react';
import { PageHeader, Card, CardHeader, Empty } from './ui';
import { useNow } from '../services/focus';
import {
  meetings as meetingStore, meetingsOn, nextDate, occurrencesBetween, timeRange, repeatLabel, timing, linkHref, formatTime,
  endSeriesBefore, ymd,
} from '../services/meetings';
import MeetingModal from './MeetingModal';

const dayLabel = (key, today) => {
  const d = new Date(key + 'T00:00:00');
  const diff = Math.round((d - new Date(today + 'T00:00:00')) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
};
const shortDate = key => new Date(key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const isRepeating = m => !!m.recurrence && m.recurrence !== 'none';

function JoinLink({ meeting, strong }) {
  const href = linkHref(meeting.link);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      className={`h-7 px-2 rounded-md border text-[12px] inline-flex items-center gap-1 shrink-0 transition-colors ${
        strong ? 'border-emerald-400/40 text-emerald-200 hover:text-emerald-100' : 'border-white/[0.1] text-slate-300 hover:text-slate-50'}`}>
      Join <ExternalLink size={11} />
    </a>
  );
}

/** One occurrence in the Today / This week lists. */
function OccurrenceRow({ meeting: m, date, today, now, onOpen }) {
  const t = timing(m, date, now);
  const status = t?.live ? { text: 'Now', cls: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30' }
    : t && !t.over && t.mins <= 60 ? { text: t.mins <= 0 ? 'Starting' : `in ${t.mins}m`, cls: 'text-amber-300 bg-amber-400/10 border-amber-400/30' }
    : null;
  return (
    <li>
      <div role="button" tabIndex={0} onClick={() => onOpen(m, date)}
        onKeyDown={e => { if (e.key === 'Enter') onOpen(m, date); }}
        className={`flex items-center gap-3 px-3 min-h-[48px] py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer outline-none focus-visible:bg-white/[0.05] ${t?.over ? 'opacity-50' : ''}`}>
        <span className="w-[68px] shrink-0 tabular-nums leading-tight">
          <span className="block text-[12.5px] text-slate-300">{m.start_time ? formatTime(m.start_time) : 'All day'}</span>
          {m.end_time && <span className="block text-[11px] text-slate-500">{formatTime(m.end_time)}</span>}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] text-slate-100 truncate">{m.title}</span>
          {(isRepeating(m) || m.note) && (
            <span className="flex items-center gap-1 text-[11.5px] text-slate-500 truncate">
              {isRepeating(m) && <><Repeat2 size={11} className="shrink-0" />{repeatLabel(m)}</>}
              {isRepeating(m) && m.note && ' · '}
              {m.note && <span className="truncate">{m.note.split('\n')[0]}</span>}
            </span>
          )}
        </span>
        {status && <span className={`h-5 px-1.5 rounded-md border text-[11px] leading-[18px] shrink-0 ${status.cls}`}>{status.text}</span>}
        {date === today && !t?.over && <JoinLink meeting={m} strong={t?.live || (t && t.mins <= 10)} />}
      </div>
    </li>
  );
}

export default function MeetingsView({ onLock, onMenuToggle, showToast }) {
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
  const weekEnd = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  const tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const week = occurrencesBetween(list, tomorrow, weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.meeting.start_time || '').localeCompare(b.meeting.start_time || ''));
  const weekByDay = week.reduce((map, o) => map.set(o.date, [...(map.get(o.date) || []), o]), new Map());

  const series = list.filter(isRepeating).map(m => ({ m, next: nextDate(m, today) }))
    .sort((a, b) => Number(!a.next) - Number(!b.next) || (a.next || '').localeCompare(b.next || '') || (a.m.start_time || '').localeCompare(b.m.start_time || ''));
  const activeSeries = series.filter(s => s.next);
  const endedSeries = series.filter(s => !s.next);
  const oneTime = list.filter(m => !isRepeating(m));
  const upcomingOnce = oneTime.filter(m => m.start_date >= today).sort((a, b) => (a.start_date + (a.start_time || '')).localeCompare(b.start_date + (b.start_time || '')));
  const pastOnce = oneTime.filter(m => m.start_date < today).sort((a, b) => b.start_date.localeCompare(a.start_date));

  const open = (meeting, date) => setEditing({ meeting, date: date || meeting?.start_date || today });

  const endSeries = m => {
    // Ending a series that hasn't started yet just removes it.
    if (m.start_date >= today) return remove(m);
    const undo = endSeriesBefore(m, today);
    showToast?.('success', 'Series ended', `${m.title} — earlier meetings are kept`, 6000, { label: 'Undo', onClick: undo });
  };
  const remove = m => {
    meetingStore.remove(m.id);
    showToast?.('warning', isRepeating(m) ? 'Meeting series deleted' : 'Meeting deleted', m.title, 6000,
      { label: 'Undo', onClick: () => meetingStore.restore(m) });
  };

  const left = todays.filter(m => !timing(m, today, now)?.over).length;

  return (
    <div ref={rootRef} className="h-full flex flex-col">
      <PageHeader title="Meetings"
        stats={[
          { value: left, label: 'left today', tone: left ? 'warn' : undefined },
          { value: week.length, label: 'next 7 days' },
          { value: activeSeries.length, label: 'repeating' },
        ]}
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={
          <button onClick={() => open(null, today)}
            className="btn-primary h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
            <Plus size={14} /><span className="hidden sm:inline">New meeting</span>
          </button>
        } />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[980px] mx-auto px-3 sm:px-4 lg:px-6 py-5 space-y-5">
          {all.length === 0 ? (
            <Card>
              <Empty icon={Video} title="No meetings yet"
                body="Add one-time or repeating meetings — standups, client calls, classes. They show up here, on the Calendar and on Today."
                action={<button onClick={() => open(null, today)} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">New meeting</button>} />
            </Card>
          ) : (
            <>
              {all.length > 5 && (
                <div className="relative max-w-xs">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search meetings"
                    className="input-premium w-full h-8 pl-8 pr-3 rounded-lg text-[13px]" />
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
                <div className="space-y-5 min-w-0">
                  {/* Today */}
                  <Card>
                    <CardHeader icon={Video} title="Today" meta={todays.length ? `${left} of ${todays.length} left` : null} />
                    {todays.length === 0
                      ? <p className="px-4 pb-4 text-[12.5px] text-slate-500">No meetings today.</p>
                      : <ul className="px-1 pb-2">{todays.map(m => <OccurrenceRow key={m.id} meeting={m} date={today} today={today} now={now} onOpen={open} />)}</ul>}
                  </Card>

                  {/* Next 7 days */}
                  <Card>
                    <CardHeader icon={CalendarClock} title="Next 7 days" meta={week.length || null} />
                    {week.length === 0
                      ? <p className="px-4 pb-4 text-[12.5px] text-slate-500">Nothing coming up this week.</p>
                      : (
                        <div className="pb-2">
                          {[...weekByDay.entries()].map(([date, items]) => (
                            <div key={date}>
                              <p className="px-4 pt-2 pb-1 text-[11.5px] font-medium text-slate-500 uppercase tracking-wide">{dayLabel(date, today)}</p>
                              <ul className="px-1">{items.map(o => <OccurrenceRow key={o.meeting.id + date} meeting={o.meeting} date={date} today={today} now={now} onOpen={open} />)}</ul>
                            </div>
                          ))}
                        </div>
                      )}
                  </Card>
                </div>

                <div className="space-y-5 min-w-0">
                  {/* Repeating series */}
                  <Card>
                    <CardHeader icon={Repeat2} title="Repeating" meta={activeSeries.length || null} />
                    {activeSeries.length === 0 ? (
                      <p className="px-4 pb-4 text-[12.5px] text-slate-500">No repeating meetings. Set "Repeats" when you add one.</p>
                    ) : (
                      <ul className="px-1 pb-2">
                        {activeSeries.map(({ m, next }) => (
                          <li key={m.id} className="group flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                            <button onClick={() => open(m, next)} className="flex-1 min-w-0 text-left cursor-pointer">
                              <p className="text-[13.5px] text-slate-100 truncate">{m.title}</p>
                              <p className="text-[11.5px] text-slate-500 truncate">{repeatLabel(m)} · {timeRange(m)}</p>
                              <p className="text-[11.5px] text-slate-500 truncate">
                                Next {next === today ? 'today' : shortDate(next)}
                                {m.ends_on ? ` · until ${shortDate(m.ends_on)}` : ''}
                                {(m.skipped || []).filter(d => d >= today).length ? ` · ${(m.skipped || []).filter(d => d >= today).length} skipped` : ''}
                              </p>
                            </button>
                            <span className="flex items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button onClick={() => open(m, next)} className="icon-btn !w-7 !h-7" title="Edit series" aria-label="Edit series"><Pencil size={12} /></button>
                              <button onClick={() => endSeries(m)} className="icon-btn !w-7 !h-7" title="End series (keep past meetings)" aria-label="End series"><CalendarX2 size={12} /></button>
                              <button onClick={() => remove(m)} className="icon-btn !w-7 !h-7 hover:!text-rose-400" title="Delete series" aria-label="Delete series"><Trash2 size={12} /></button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>

                  {/* One-time */}
                  <Card>
                    <CardHeader icon={CalendarClock} title="One-time" meta={upcomingOnce.length || null} />
                    {upcomingOnce.length === 0 ? (
                      <p className="px-4 pb-3 text-[12.5px] text-slate-500">No upcoming one-time meetings.</p>
                    ) : (
                      <ul className="px-1 pb-2">
                        {upcomingOnce.map(m => (
                          <li key={m.id} className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                            <button onClick={() => open(m)} className="flex-1 min-w-0 text-left cursor-pointer">
                              <p className="text-[13.5px] text-slate-100 truncate">{m.title}</p>
                              <p className="text-[11.5px] text-slate-500 truncate">{dayLabel(m.start_date, today)} · {timeRange(m)}</p>
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
                          <ul className="px-1 pb-2">
                            {[...endedSeries.map(s => s.m), ...pastOnce].map(m => (
                              <li key={m.id} className="group flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors">
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
