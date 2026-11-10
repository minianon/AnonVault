/* ─────────────────────────────────────────────────────────
   board.js — issues / to-dos / reminders on a simple board.

   Not tied to a project: a card can be "fix login bug" for one company,
   "renew passport" for yourself, or "call the bank" as a reminder. The
   label says what it belongs to; the due date makes it a reminder.

   { id, title, description, status: 'todo'|'doing'|'done',
     priority: 'low'|'medium'|'high', label, due_date 'YYYY-MM-DD'|null,
     due_time 'HH:MM'|null, links: [{ url, label }], images: [url],
     rank (number, lower = higher in its column), done_at, promoted_from,
     created_at }
   ───────────────────────────────────────────────────────── */

import { createCollection } from './localStore';

export const board = createCollection({
  storageKey: 'anonvault_board',
  table: 'board_items',
  sort: (a, b) => (a.rank ?? 0) - (b.rank ?? 0) || (b.created_at || '').localeCompare(a.created_at || ''),
});

export const COLUMNS = [
  { id: 'todo',  label: 'To do',       color: '#8d8d96' },
  { id: 'doing', label: 'In progress', color: '#f0b445' },
  { id: 'done',  label: 'Done',        color: '#4fd1a0' },
];

export const PRIORITIES = [
  { id: 'high',   label: 'High',   color: '#f5768a' },
  { id: 'medium', label: 'Medium', color: '#f0b445' },
  { id: 'low',    label: 'Low',    color: '#6c6c75' },
];

function topRank(status) {
  const inCol = board.getAll().filter(i => i.status === status);
  return inCol.length ? Math.min(...inCol.map(i => i.rank ?? 0)) - 1 : 0;
}

export function addItem({ title, status = 'todo', ...rest }) {
  const clean = (title || '').trim();
  if (!clean) return null;
  return board.add({
    title: clean, description: '', priority: 'medium', label: '', due_date: null, due_time: null,
    links: [], images: [],
    ...rest, status, rank: topRank(status), done_at: status === 'done' ? new Date().toISOString() : null,
  });
}

/** Move to a column, optionally before another card (for drag-and-drop). */
export function moveItem(id, status, beforeId = null) {
  const all = board.getAll();
  const item = all.find(i => i.id === id);
  if (!item) return;
  const col = all.filter(i => i.status === status && i.id !== id);
  let rank;
  if (beforeId) {
    const idx = col.findIndex(i => i.id === beforeId);
    const before = col[idx];
    const prev = col[idx - 1];
    rank = prev ? ((prev.rank ?? 0) + (before.rank ?? 0)) / 2 : (before.rank ?? 0) - 1;
  } else {
    rank = col.length ? Math.max(...col.map(i => i.rank ?? 0)) + 1 : 0;
  }
  board.update(id, {
    status, rank,
    done_at: status === 'done' ? item.done_at || new Date().toISOString() : null,
  });
}

export function dueInfo(item, today = new Date()) {
  if (!item.due_date || item.status === 'done') return null;
  const at = item.due_time
    ? ' ' + new Date(2000, 0, 1, ...item.due_time.split(':').map(Number)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = new Date(item.due_date + 'T00:00:00');
  const days = Math.round((d - t0) / 86400000);
  if (days < 0) return { days, text: `${-days}d overdue`, tone: 'bad' };
  if (days === 0) {
    const late = item.due_time && new Date(`${item.due_date}T${item.due_time}`) < today;
    return { days, text: (late ? 'Overdue' : 'Today') + at, tone: late ? 'bad' : 'warn' };
  }
  if (days === 1) return { days, text: 'Tomorrow' + at, tone: 'warn' };
  if (days <= 7) return { days, text: d.toLocaleDateString(undefined, { weekday: 'short' }) + at, tone: 'neutral' };
  return { days, text: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + at, tone: 'neutral' };
}
