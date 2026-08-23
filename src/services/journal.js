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
 * Write locally, then mirror upstream. Never throws: a failed mirror is
 * logged and ignored, because losing the note would be worse than being
 * briefly out of sync.
 */
export async function setNote(dateStr, note) {
  const all = loadAll();
  if (note && note.trim()) all[dateStr] = note;
  else delete all[dateStr];
  saveAll(all);

  const client = getSupabaseClient();
  if (!client) return;
  try {
    if (note && note.trim()) {
      await client.from('daily_notes').upsert({ date: dateStr, note }, { onConflict: 'date' });
    } else {
      await client.from('daily_notes').delete().eq('date', dateStr);
    }
  } catch (err) {
    console.warn('[journal] Supabase mirror failed, note kept locally:', err);
  }
}

/** Pull the table into the local cache. Safe to call when it does not exist. */
export async function syncNotes() {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { data, error } = await client.from('daily_notes').select('date, note');
    if (error) throw error;
    const all = loadAll();
    for (const row of data || []) {
      if (row?.date) all[row.date] = row.note || '';
    }
    saveAll(all);
  } catch (err) {
    console.warn('[journal] daily_notes not available, staying local:', err);
  }
}
