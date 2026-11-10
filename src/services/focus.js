/* ─────────────────────────────────────────────────────────
   focus.js — "what am I doing right now", as timed sessions.

   More than one session can run at once. That is the point: a build
   running in one window while you write a submission in another is two
   things you are doing, and the log should say so instead of forcing a
   single "current task".

   Session shape (Supabase 'focus_sessions' table, migration 003):
   {
     id:         uuid
     label:      string            what you are doing
     project:    string | null     optional grouping (a project)
     company_id: uuid | null       which company it was for (services/work.js)
     started_at: ISO string
     ended_at:   ISO string | null null while running
     note:       string
     created_at: ISO string
   }
   ───────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import { createCollection } from './localStore';

export const sessions = createCollection({
  storageKey: 'anonvault_focus_sessions',
  table: 'focus_sessions',
  sort: (a, b) => (b.started_at || '').localeCompare(a.started_at || ''),
});

export function startSession({ label, project = null, company_id = null }) {
  const clean = (label || '').trim();
  if (!clean) return null;
  return sessions.add({
    label: clean,
    project: project ? project.trim() || null : null,
    company_id: company_id || null,
    started_at: new Date().toISOString(),
    ended_at: null,
    note: '',
  });
}

export function stopSession(id) {
  return sessions.update(id, { ended_at: new Date().toISOString() });
}

export function stopAll() {
  for (const s of sessions.getAll()) if (!s.ended_at) stopSession(s.id);
}

/** Start a fresh session with the same label/project. */
export function resumeSession(s) {
  return startSession({ label: s.label, project: s.project, company_id: s.company_id });
}

export function isRunning(s) { return !s.ended_at; }

export function durationMs(s, now = Date.now()) {
  const start = new Date(s.started_at).getTime();
  const end = s.ended_at ? new Date(s.ended_at).getTime() : now;
  return Math.max(0, end - start);
}

/** Milliseconds of a session that fall inside [from, to). */
export function overlapMs(s, from, to, now = Date.now()) {
  const start = new Date(s.started_at).getTime();
  const end = s.ended_at ? new Date(s.ended_at).getTime() : now;
  return Math.max(0, Math.min(end, to) - Math.max(start, from));
}

export function dayBounds(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return [from, from + 86400000];
}

export function totalForDay(list, d = new Date(), now = Date.now()) {
  const [from, to] = dayBounds(d);
  return list.reduce((sum, s) => sum + overlapMs(s, from, to, now), 0);
}

/** Last `n` days, oldest first: [{ date, ms }] */
export function dailyTotals(list, n = 7, now = Date.now()) {
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push({ date: d, ms: totalForDay(list, d, now) });
  }
  return out;
}

/** Time per label (or project) inside a window, largest first. */
export function breakdown(list, from, to, by = 'label', now = Date.now()) {
  const map = new Map();
  for (const s of list) {
    const ms = overlapMs(s, from, to, now);
    if (!ms) continue;
    const key = (by === 'project' ? s.project : by === 'company' ? s.company_id : s.label) || (by === 'company' ? '' : 'Unsorted');
    map.set(key, (map.get(key) || 0) + ms);
  }
  return [...map.entries()].map(([key, ms]) => ({ key, ms })).sort((a, b) => b.ms - a.ms);
}

export function formatDuration(ms, { seconds = false } = {}) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (seconds) {
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return total > 0 ? '<1m' : '0m';
}

/** Re-render on an interval while `active`. Returns the current time. */
export function useNow(intervalMs = 1000, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;

    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, active]);
  return now;
}

/** Recently used labels, for one-click restarts. */
export function recentLabels(list, limit = 6) {
  const seen = new Map();
  for (const s of list) {
    const k = s.label + '\u0000' + (s.project || '') + '\u0000' + (s.company_id || '');
    if (!seen.has(k)) seen.set(k, { label: s.label, project: s.project, company_id: s.company_id || null });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}
