import { useState } from 'react';
import { Video, ChevronRight, ExternalLink, Repeat2, Plus } from 'lucide-react';
import { Card, CardHeader, LinkButton } from './ui';
import { useNow } from '../services/focus';
import { meetings as meetingStore, meetingsOn, nextDate, timeRange, timing, linkHref, ymd } from '../services/meetings';
import MeetingModal from './MeetingModal';

/** Today's meetings on the dashboard, with what's on now and what's next. */
export default function MeetingsToday({ setActiveTab, showToast }) {
  const list = meetingStore.useAll();
  const now = new Date(useNow(30000));
  const today = ymd(now);
  const [editing, setEditing] = useState(null); // { meeting, date }

  // A handful of meetings at most, so this is cheap to work out each render.
  const todays = meetingsOn(list, today);

  // Nothing today: say when the next one is (within a week).
  let upcoming = null;
  if (!todays.length) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    for (const m of list) {
      const d = nextDate(m, ymd(tomorrow));
      if (!d) continue;
      const key = d + (m.start_time || '');
      if (!upcoming || key < upcoming.key) upcoming = { m, d, key };
    }
    const days = upcoming ? Math.round((new Date(upcoming.d + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) : 0;
    if (days > 7) upcoming = null;
  }

  const left = todays.filter(m => !timing(m, today, now)?.over).length;

  return (
    <Card>
      <CardHeader icon={Video} title="Meetings" meta={todays.length ? `${left} of ${todays.length} left` : null}
        action={<LinkButton onClick={() => setActiveTab('meetings')}>All meetings <ChevronRight size={12} /></LinkButton>} />
      {todays.length === 0 ? (
        <div className="px-4 pb-4 flex items-center gap-2">
          <p className="flex-1 text-[12.5px] text-slate-500 min-w-0">
            {upcoming
              ? <>No meetings today. Next: <button onClick={() => setEditing({ meeting: upcoming.m, date: upcoming.d })} className="text-slate-300 hover:text-slate-100 cursor-pointer">{upcoming.m.title}</button>, {new Date(upcoming.d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}{upcoming.m.start_time ? ` · ${timeRange(upcoming.m)}` : ''}</>
              : 'No meetings today.'}
          </p>
          <button onClick={() => setEditing({ meeting: null, date: today })} className="icon-btn shrink-0" title="New meeting" aria-label="New meeting"><Plus size={14} /></button>
        </div>
      ) : (
        <ul className="px-2 pb-2">
          {todays.map(m => {
            const t = timing(m, today, now);
            const href = linkHref(m.link);
            const status = t?.live ? { text: 'Now', cls: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30' }
              : t && !t.over && t.mins <= 60 ? { text: t.mins <= 0 ? 'Starting' : `in ${t.mins}m`, cls: 'text-amber-300 bg-amber-400/10 border-amber-400/30' }
              : null;
            return (
              <li key={m.id} className={`flex items-center gap-2.5 px-2 min-h-[44px] py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors ${t?.over ? 'opacity-50' : ''}`}>
                <span className="w-[68px] shrink-0 text-[12px] tabular-nums text-slate-400 leading-tight">
                  {m.start_time ? timeRange(m).split(' – ')[0] : 'All day'}
                </span>
                <button onClick={() => setEditing({ meeting: m, date: today })} className="flex-1 min-w-0 text-left cursor-pointer">
                  <p className="text-[13px] text-slate-200 truncate flex items-center gap-1.5">
                    {m.title}
                    {m.recurrence && m.recurrence !== 'none' && <Repeat2 size={11} className="text-slate-500 shrink-0" />}
                  </p>
                  {m.end_time && <p className="text-[11.5px] text-slate-500 truncate">{timeRange(m)}</p>}
                </button>
                {status && <span className={`h-5 px-1.5 rounded-md border text-[11px] leading-[18px] shrink-0 ${status.cls}`}>{status.text}</span>}
                {href && !t?.over && (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    className={`h-7 px-2 rounded-md border text-[12px] inline-flex items-center gap-1 shrink-0 transition-colors ${
                      t?.live || (t && t.mins <= 10) ? 'border-emerald-400/40 text-emerald-200 hover:text-emerald-100' : 'border-white/[0.1] text-slate-300 hover:text-slate-50'}`}>
                    Join <ExternalLink size={11} />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <MeetingModal key={(editing.meeting?.id || 'new') + editing.date} initial={editing.meeting} date={editing.date}
          onClose={() => setEditing(null)} showToast={showToast} />
      )}
    </Card>
  );
}
