/* ─────────────────────────────────────────────────────────
   nlp.js — turn "call bank tomorrow 5pm #personal !high" into
   { title: 'call bank', date: '2026-11-12', time: '17:00',
     label: 'personal', priority: 'high' }.

   Deliberately small and predictable: it only removes a phrase from the
   title when it is sure it is a date, a time, a #label or a !priority, so
   "buy 2 tickets" never loses its "2".
   ───────────────────────────────────────────────────────── */

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_RE = '(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';

const pad = n => String(n).padStart(2, '0');
export const ymdOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayIndex = s => DAYS.findIndex(d => d.startsWith(s.slice(0, 3)));
const monIndex = s => MONTHS.indexOf(s.slice(0, 3));

/* Each rule: regex (matched against the lowercased text), and a function
   returning { date } and/or { time } from the match. Order matters. */
function rules(now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Next occurrence of a weekday, never today ("friday" said on a Friday means next week).
  const nextDow = idx => {
    let diff = (idx - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return addDays(today, diff);
  };
  const futureDate = (m, d) => {
    let date = new Date(today.getFullYear(), m, d);
    if (date < today) date = new Date(today.getFullYear() + 1, m, d);
    return date;
  };
  return [
    { re: /\b(?:day after tomorrow|overmorrow)\b/, f: () => ({ date: addDays(today, 2) }) },
    { re: /\b(?:tomorrow|tmrw|tmr)\b/, f: () => ({ date: addDays(today, 1) }) },
    { re: /\btonight\b/, f: () => ({ date: today, time: '20:00' }) },
    { re: /\btoday\b/, f: () => ({ date: today }) },
    { re: /\byesterday\b/, f: () => ({ date: addDays(today, -1) }) },
    { re: /\bin (\d{1,3}) (day|days|week|weeks|month|months)\b/, f: m => {
      const n = Number(m[1]);
      if (m[2].startsWith('day')) return { date: addDays(today, n) };
      if (m[2].startsWith('week')) return { date: addDays(today, n * 7) };
      return { date: new Date(today.getFullYear(), today.getMonth() + n, today.getDate()) };
    } },
    { re: /\bnext week\b/, f: () => ({ date: nextDow(1) }) },
    { re: /\b(?:this )?weekend\b/, f: () => ({ date: today.getDay() === 6 || today.getDay() === 0 ? today : nextDow(6) }) },
    { re: /\bend of (?:the )?month\b/, f: () => ({ date: new Date(today.getFullYear(), today.getMonth() + 1, 0) }) },
    { re: new RegExp(`\\bnext ${DAY_RE}\\b`), f: m => ({ date: nextDow(dayIndex(m[1])) }) },
    { re: new RegExp(`\\b(?:on |this )?${DAY_RE}\\b`), f: m => ({ date: nextDow(dayIndex(m[1])) }) },
    // 15 nov, 15th november
    { re: new RegExp(`\\b(?:on )?(\\d{1,2})(?:st|nd|rd|th)? ${MON_RE}\\b`), f: m => ({ date: futureDate(monIndex(m[2]), Number(m[1])) }) },
    // nov 15, november 15th
    { re: new RegExp(`\\b(?:on )?${MON_RE} (\\d{1,2})(?:st|nd|rd|th)?\\b`), f: m => ({ date: futureDate(monIndex(m[1]), Number(m[2])) }) },
    // 15/11 or 15-11 (day first, as written in India)
    { re: /\b(?:on )?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/, f: m => {
      const d = Number(m[1]), mo = Number(m[2]) - 1;
      if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
      if (m[0].trim() === '24/7') return null; // "support 24/7" is not a date
      if (m[3]) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return { date: new Date(y, mo, d) }; }
      return { date: futureDate(mo, d) };
    } },
    // on the 15th
    { re: /\bon (?:the )?(\d{1,2})(?:st|nd|rd|th)\b/, f: m => {
      const d = Number(m[1]);
      let date = new Date(today.getFullYear(), today.getMonth(), d);
      if (date < today) date = new Date(today.getFullYear(), today.getMonth() + 1, d);
      return { date };
    } },
    // times: at 5, 5pm, 5:30 pm, 17:30, noon, morning…
    { re: /\b(?:at )?(\d{1,2})(?::(\d{2}))? ?(am|pm)\b/, f: m => {
      let h = Number(m[1]) % 12; if (m[3] === 'pm') h += 12;
      return h < 24 ? { time: `${pad(h)}:${m[2] || '00'}` } : null;
    } },
    { re: /\b(?:at )?([01]?\d|2[0-3]):([0-5]\d)\b/, f: m => ({ time: `${pad(Number(m[1]))}:${m[2]}` }) },
    { re: /\bat (\d{1,2})\b/, f: m => {
      const n = Number(m[1]); if (n < 1 || n > 12) return null;
      return { time: `${pad(n < 8 ? n + 12 : n)}:00` }; // "at 5" means 5pm, "at 9" means 9am
    } },
    { re: /\b(?:at )?noon\b/, f: () => ({ time: '12:00' }) },
    { re: /\b(?:in the )?morning\b/, f: () => ({ time: '09:00' }) },
    { re: /\b(?:in the )?(?:afternoon)\b/, f: () => ({ time: '15:00' }) },
    { re: /\b(?:in the )?evening\b/, f: () => ({ time: '19:00' }) },
  ];
}

export function parseCapture(input, now = new Date()) {
  let text = ` ${input || ''} `;
  const out = { title: '', date: null, time: null, label: null, priority: null, matched: [] };

  // #label (one word, or #"two words")
  text = text.replace(/\s#"([^"]+)"|\s#([\p{L}\p{N}_-]+)/u, (all, q, w) => { out.label = (q || w).trim(); out.matched.push(all.trim()); return ' '; });
  // !high / !! / !low / p1
  text = text.replace(/\s(!high|!!!?|!urgent|!h|p1)(?=\s)/i, (all) => { out.priority = 'high'; out.matched.push(all.trim()); return ' '; });
  text = text.replace(/\s(!low|!l|p3)(?=\s)/i, (all) => { out.priority = 'low'; out.matched.push(all.trim()); return ' '; });
  text = text.replace(/\s(!med|!medium|!m|p2)(?=\s)/i, (all) => { out.priority = 'medium'; out.matched.push(all.trim()); return ' '; });

  // A connector word left dangling after we cut a date ("call bank by tomorrow").
  const tidy = s => s.replace(/\s+(by|on|at|due|before|for)\s*$/i, '').replace(/^\s*(remind me to|remind me|todo:?|to)\s+/i, '');

  for (const r of rules(now)) {
    const lower = text.toLowerCase();
    const m = r.re.exec(lower);
    if (!m) continue;
    const res = r.f(m);
    if (!res) continue;
    if (res.date && out.date) continue; // first date wins
    if (res.time && out.time && !res.date) continue;
    if (res.date) out.date = ymdOf(res.date);
    if (res.time && !out.time) out.time = res.time;
    out.matched.push(text.slice(m.index, m.index + m[0].length).trim());
    text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
  }

  // A time with no date means today (or tomorrow if that time already passed).
  if (out.time && !out.date) {
    const [h, mi] = out.time.split(':').map(Number);
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
    out.date = ymdOf(t < now ? addDays(t, 1) : t);
  }

  out.title = tidy(text.replace(/\s{2,}/g, ' ').trim()).trim();
  if (!out.title) out.title = (input || '').trim();
  return out;
}

export function formatWhen(date, time, now = new Date()) {
  if (!date) return '';
  const today = ymdOf(now);
  const tmr = ymdOf(addDays(now, 1));
  const d = new Date(date + 'T00:00:00');
  let s = date === today ? 'Today' : date === tmr ? 'Tomorrow'
    : (d - now) / 86400000 < 6 && d > now ? d.toLocaleDateString(undefined, { weekday: 'long' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  if (time) {
    const [h, m] = time.split(':').map(Number);
    s += ' ' + new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return s;
}

/* "gym every day", "standup weekdays", "call mom every sun",
   "dsa daily", "review every mon and thu" → repeat info + cleaned title. */
const DAY_KEYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
export function parseRepeat(input) {
  let text = ` ${input || ''} `;
  let rep = null;
  const cut = re => { const m = re.exec(text.toLowerCase()); if (!m) return null; text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length); return m; };
  if (cut(/\s(?:every ?day|daily|everyday)(?=\s)/)) rep = { recurrence: 'daily', days: [] };
  else if (cut(/\s(?:every )?weekdays?(?=\s)/)) rep = { recurrence: 'weekdays', days: [] };
  else if (cut(/\s(?:every )?weekends?(?=\s)/)) rep = { recurrence: 'weekends', days: [] };
  else {
    const m = cut(/\severy ((?:(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*(?:,? (?:and |& )?)?)+)(?=\s)/);
    if (m) {
      const days = [...new Set((m[1].match(/sun|mon|tue|wed|thu|fri|sat/g) || []).map(d => DAY_KEYS[d]))];
      if (days.length) rep = { recurrence: 'weekly', days };
    }
  }
  return { title: text.replace(/\s{2,}/g, ' ').trim(), repeat: rep };
}
