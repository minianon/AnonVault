/* ─────────────────────────────────────────────────────────
   prefs.js — small settings that should follow you across devices.

   Idea pins / order / archive, cancelled-for-today tasks, Review targets,
   the money budget and currency, hidden repeat payments and the focus goal
   all used to live only in this browser's localStorage, so a second device
   never saw them.

   localStorage stays the source of truth (same keys as before, so existing
   values are kept and synchronous reads still work). Each write is also
   mirrored to the Supabase `app_settings` table, and syncPrefs() pulls the
   other devices' values in. Last write wins per key.
   ───────────────────────────────────────────────────────── */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { getSupabaseClient } from './supabase';
import { reportSyncIssue } from './syncStatus';

const TABLE = 'app_settings';
const PENDING_KEY = 'anonvault_prefs_pending';

/** Keys that sync. Pure view state (sidebar, active tab, sort) stays per device. */
export const SYNCED_PREF_KEYS = [
  'anonvault_ideas_pinned',
  'anonvault_ideas_order',
  'anonvault_ideas_archived',
  'anonvault_task_cancelled',
  'anonvault_targets',
  'anonvault_money_settings',
  'anonvault_money_repeat_hidden',
  'anonvault_focus_goal_min',
];

const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

function readRaw(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function getPref(key, fallback) {
  const raw = readRaw(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function loadPending() {
  try { return new Set(JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')); } catch { return new Set(); }
}
function savePending(set) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

async function pushPref(key) {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client
      .from(TABLE)
      .upsert({ key, value: getPref(key, null), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    const p = loadPending(); p.delete(key); savePending(p);
    return true;
  } catch (err) {
    reportSyncIssue('prefs', 'Settings are saved on this device but could not sync — run supabase/setup_full.sql if the app_settings table is missing.', err?.message || err);
    return false;
  }
}

/** Save locally right away, then mirror upstream. */
export function setPref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
  notify();
  if (!getSupabaseClient()) return;
  const p = loadPending(); p.add(key); savePending(p);
  pushPref(key);
}

export function subscribePrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Another tab wrote one of these keys.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => { if (SYNCED_PREF_KEYS.includes(e.key)) notify(); });
}

/** React: [value, setValue] for one synced key. */
export function usePref(key, fallback) {
  const raw = useSyncExternalStore(subscribePrefs, () => readRaw(key), () => readRaw(key));
  const value = useMemo(() => {
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
    // fallback is usually an inline literal; only the stored text matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);
  // Updaters get the latest stored value, or what this hook is showing.
  const set = useCallback(
    next => setPref(key, typeof next === 'function' ? next(getPref(key, undefined) ?? value) : next),
    [key, value],
  );
  return [value, set];
}

/**
 * Pull other devices' values, then push anything that only exists here.
 * Never throws.
 */
export async function syncPrefs() {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { data, error } = await client.from(TABLE).select('key, value');
    if (error) throw error;
    const pending = loadPending();
    const remote = new Map((data || []).map(r => [r.key, r.value]));
    let changed = false;
    for (const [key, value] of remote) {
      if (pending.has(key)) continue; // our newer local value wins
      const text = JSON.stringify(value);
      if (readRaw(key) !== text) {
        try { localStorage.setItem(key, text); changed = true; } catch { /* quota */ }
      }
    }
    if (changed) notify();
    // Values set on this device before syncing existed, or while offline.
    const toPush = SYNCED_PREF_KEYS.filter(k => pending.has(k) || (!remote.has(k) && readRaw(k) != null));
    for (const key of toPush) await pushPref(key);
  } catch (err) {
    reportSyncIssue('prefs', 'Settings could not sync — run supabase/setup_full.sql to create the app_settings table.', err?.message || err);
  }
}
