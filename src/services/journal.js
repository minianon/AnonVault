/* ─────────────────────────────────────────────────────────
   journal.js — one free-text line per day.

   Review could report how much got done but never what happened, so
   clicking a bad day told you nothing about why it was bad.

   localStorage is the source of truth and Supabase is a mirror. That is
   deliberate: the note is typed a character at a time, so it must never
   wait on the network, and it must keep working against a database that
   has not had migration 002 applied.
   ───────────────────────────────────────────────────────── */

import { getSupabaseClient } from './supabase';
import { reportSyncIssue } from './syncStatus';

const KEY = 'anonvault_daily_notes';

function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}

function saveAll(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); }
  catch { /* quota — the note is still in component state */ }
}

/** Synchronous read for a single date. */
export function getNote(dateStr) {
  return loadAll()[dateStr] || '';
}

/** Every date that has a non-empty note, for marking the Review chart. */
export function getNotedDates() {
  const all = loadAll();
  return new Set(Object.keys(all).filter(d => (all[d] || '').trim()));
}

/**
 * Notes for a list of dates, newest first, empty ones dropped.
 * One cache read rather than one per day.
 */
export function getNotes(dateStrs) {
  const all = loadAll();
  return dateStrs
    .map(date => ({ date, note: all[date] || '' }))
    .filter(entry => entry.note.trim())
    .reverse();
}

// Dates whose latest edit hasn't reached Supabase yet. syncNotes() never
// lets the server's older copy replace these, and retries them.
const PENDING_KEY = 'anonvault_daily_notes_pending';
function loadPending() {
  try { return new Set(JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')); } catch { return new Set(); }
}
function savePending(set) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

async function pushNote(client, dateStr) {
  const note = loadAll()[dateStr] || '';
  try {
    const { error } = note.trim()
      ? await client.from('daily_notes').upsert({ date: dateStr, note }, { onConflict: 'date' })
      : await client.from('daily_notes').delete().eq('date', dateStr);
    if (error) throw error;
    const p = loadPending(); p.delete(dateStr); savePending(p);
    return true;
  } catch (err) {
    reportSyncIssue('daily-notes', 'Your daily note is saved on this device but did not reach Supabase. It will retry.', err?.message || err);
    return false;
  }
}

/**
 * Write locally, then mirror upstream. Never throws: a failed mirror is
 * reported and retried on the next sync, because losing the note would be
 * worse than being briefly out of sync.
 */
export async function setNote(dateStr, note) {
  const all = loadAll();
  if (note && note.trim()) all[dateStr] = note;
  else delete all[dateStr];
  saveAll(all);

  const client = getSupabaseClient();
  if (!client) return;
  const p = loadPending(); p.add(dateStr); savePending(p);
  await pushNote(client, dateStr);
}

/**
 * Make the local cache match the table: notes added or changed elsewhere
 * come in, notes cleared elsewhere go away, and unsent local edits are kept
 * and retried. Safe to call when the table does not exist.
 */
export async function syncNotes() {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { data, error } = await client.from('daily_notes').select('date, note');
    if (error) throw error;
    const pending = loadPending();
    const local = loadAll();
    const next = {};
    for (const row of data || []) {
      if (row?.date && !pending.has(row.date) && (row.note || '').trim()) next[row.date] = row.note;
    }
    for (const d of pending) if (local[d]) next[d] = local[d];
    // Notes from before this sync existed have never been uploaded; keep and send them.
    const remoteDates = new Set((data || []).map(r => r?.date));
    const SEEDED = 'anonvault_daily_notes_seeded';
    if (!localStorage.getItem(SEEDED)) {
      for (const [d, n] of Object.entries(local)) {
        if (!remoteDates.has(d) && (n || '').trim()) { next[d] = n; pending.add(d); }
      }
      try { localStorage.setItem(SEEDED, '1'); } catch { /* ignore */ }
      savePending(pending);
    }
    saveAll(next);
    for (const d of pending) await pushNote(client, d);
  } catch (err) {
    reportSyncIssue('daily-notes', "Couldn't load daily notes from Supabase — showing this device's copy.", err?.message || err);
  }
}
