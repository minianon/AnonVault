/* ─────────────────────────────────────────────────────────
   meetings.js — one-off and repeating meetings, shown on the Calendar
   and on Today.

   Local-first like the Board and Money; mirrored to the Supabase
   `meetings` table (setup_full.sql) and synced live across devices.

   {
     id, title,
     start_date:      'YYYY-MM-DD'   first (or only) day
     start_time:      'HH:MM' | null null = all day
     end_time:        'HH:MM' | null
     recurrence:      'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly'
     recurrence_days: number[]       0=Sun…6=Sat, for weekly / biweekly
     ends_on:         'YYYY-MM-DD' | null   last day the series runs
     skipped:         ['YYYY-MM-DD'] single occurrences that were cancelled
     link, note, created_at
   }
   ───────────────────────────────────────────────────────── */

import { createCollection } from './localStore';

export const meetings = createCollection({
  storageKey: 'anonvault_meetings',
  table: 'meetings',
  sort: (a, b) => (a.start_time || '99').localeCompare(b.start_time || '99') || (a.title || '').localeCompare(b.title || ''),
});

export const REPEATS = [
  { value: 'none',     label: 'Does not repeat' },
  { value: 'daily',    label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly',   label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly',  label: 'Every month' },
];

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => new Date(s + 'T00:00:00');
const DAY_MS = 86400000;

/** Days a weekly / biweekly meeting runs on; defaults to the start date's weekday. */
export function daysOf(m) {
  const days = (m.recurrence_days || []).map(Number).filter(n => n >= 0 && n <= 6);
  return days.length ? days : [parse(m.start_date).getDay()];
}

/** Does meeting `m` happen on `dateStr`? */
export function occursOn(m, dateStr) {
  if (!m?.start_date || dateStr < m.start_date) return false;
  if (m.ends_on && dateStr > m.ends_on) return false;
  if ((m.skipped || []).includes(dateStr)) return false;
  const d = parse(dateStr);
  const dow = d.getDay();
  switch (m.recurrence || 'none') {
    case 'none':     return dateStr === m.start_date;
    case 'daily':    return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekly':   return daysOf(m).includes(dow);
    case 'biweekly': {
      if (!daysOf(m).includes(dow)) return false;
      // Same parity of week (Monday-based) as the first week.
      const monday = x => { const y = parse(x); y.setDate(y.getDate() - ((y.getDay() + 6) % 7)); return y; };
      const weeks = Math.round((monday(dateStr) - monday(m.start_date)) / (7 * DAY_MS));
      return weeks % 2 === 0;
    }
    case 'monthly': {
      // The 31st falls on the last day of shorter months.
      const want = parse(m.start_date).getDate();
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(want, last);
    }
    default: return false;
  }
}

/** Every occurrence between two dates (inclusive), as [{ meeting, date }]. */
export function occurrencesBetween(list, from, to) {
  const out = [];
  for (let d = parse(from); ymd(d) <= to; d.setDate(d.getDate() + 1)) {
    const key = ymd(d);
    for (const m of list) if (occursOn(m, key)) out.push({ meeting: m, date: key });
  }
  return out;
}

/** Meetings on one day, earliest first (all-day ones on top). */
export function meetingsOn(list, dateStr) {
  return list
    .filter(m => occursOn(m, dateStr))
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
}

/** Next date (from `fromStr`, inclusive) this meeting happens, within a year. */
export function nextDate(m, fromStr) {
  const d = parse(fromStr);
  for (let i = 0; i < 366; i++, d.setDate(d.getDate() + 1)) {
    const key = ymd(d);
    if (m.ends_on && key > m.ends_on) return null;
    if (occursOn(m, key)) return key;
  }
  return null;
}

export function formatTime(t) {
  if (!t) return '';
  const [h, mi] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, mi).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function timeRange(m) {
  if (!m.start_time) return 'All day';
  return m.end_time ? `${formatTime(m.start_time)} – ${formatTime(m.end_time)}` : formatTime(m.start_time);
}

/** "Every Mon, Wed" / "Every 2 weeks on Tue" / "Every month on the 5th" … */
export function repeatLabel(m) {
  const r = m.recurrence || 'none';
  if (r === 'none') return 'Once';
  if (r === 'daily') return 'Every day';
  if (r === 'weekdays') return 'Weekdays';
  const days = [...daysOf(m)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(n => DAY_SHORT[n]).join(', ');
  if (r === 'weekly') return `Every ${days}`;
  if (r === 'biweekly') return `Every 2 weeks · ${days}`;
  if (r === 'monthly') {
    const n = parse(m.start_date).getDate();
    const sfx = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
    return `Monthly on the ${n}${sfx}`;
  }
  return '';
}

/** Minutes from `now` until it starts (negative once started), and whether it's on right now. */
export function timing(m, dateStr, now = new Date()) {
  if (!m.start_time || dateStr !== ymd(now)) return null;
  const at = t => { const [h, mi] = t.split(':').map(Number); return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi); };
  const start = at(m.start_time);
  const end = m.end_time ? at(m.end_time) : new Date(start.getTime() + 30 * 60000);
  const mins = Math.round((start - now) / 60000);
  return { mins, live: now >= start && now < end, over: now >= end };
}

/** Make sure a link opens as a URL even when typed without https://. */
export function linkHref(link) {
  const l = (link || '').trim();
  if (!l) return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(l) ? l : `https://${l}`;
}

/* ── writes ───────────────────────────────────────────── */

export function saveMeeting(id, fields) {
  const row = {
    title: (fields.title || '').trim(),
    start_date: fields.start_date,
    start_time: fields.start_time || null,
    end_time: fields.start_time && fields.end_time ? fields.end_time : null,
    recurrence: fields.recurrence || 'none',
    recurrence_days: ['weekly', 'biweekly'].includes(fields.recurrence) ? (fields.recurrence_days || []).map(Number) : [],
    ends_on: fields.recurrence && fields.recurrence !== 'none' ? fields.ends_on || null : null,
    link: (fields.link || '').trim(),
    note: (fields.note || '').trim(),
  };
  if (!row.title || !row.start_date) return null;
  return id ? meetings.update(id, row) : meetings.add({ ...row, skipped: [] });
}

/** Cancel one occurrence of a repeating meeting. Returns an undo function. */
export function skipOccurrence(m, dateStr) {
  const before = m.skipped || [];
  meetings.update(m.id, { skipped: [...new Set([...before, dateStr])] });
  return () => meetings.update(m.id, { skipped: before });
}

/** Stop a series from `dateStr` on (keeps earlier ones). Returns an undo function. */
export function endSeriesBefore(m, dateStr) {
  const before = m.ends_on || null;
  const prev = parse(dateStr);
  prev.setDate(prev.getDate() - 1);
  meetings.update(m.id, { ends_on: ymd(prev) });
  return () => meetings.update(m.id, { ends_on: before });
}
