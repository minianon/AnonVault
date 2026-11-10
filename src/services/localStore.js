/* ─────────────────────────────────────────────────────────
   localStore.js — a tiny local-first collection with an optional
   Supabase mirror.

   localStorage is the source of truth, so every read is synchronous
   and every write is instant; the mirror is best-effort. That mirrors
   how journal.js already works, and means the Money and Focus screens
   keep working on a database that has not had migration 003 applied.

   Each collection exposes a React hook built on useSyncExternalStore,
   so every screen that reads it (sidebar, dashboard, section) updates
   together the moment anything writes.
   ───────────────────────────────────────────────────────── */

import { useSyncExternalStore } from 'react';
import { getSupabaseClient } from './supabase';

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // RFC4122-ish fallback; only used on very old browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function createCollection({ storageKey, table, sort }) {
  let items = read();
  const listeners = new Set();
  const PENDING = storageKey + '__pending';
  // Ids known to exist on the server. A local row that is missing remotely
  // but was synced before has been deleted on another device, so it's
  // dropped instead of being uploaded again.
  const SYNCED = storageKey + '__synced';
  // Columns the Supabase table turned out not to have (setup SQL not run
  // yet). Rows are sent without them, and the values stay local.
  const missingCols = new Set();

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(raw) ? (sort ? [...raw].sort(sort) : raw) : [];
    } catch {
      return [];
    }
  }

  function commit(next) {
    items = sort ? [...next].sort(sort) : next;
    try { localStorage.setItem(storageKey, JSON.stringify(items)); }
    catch { /* quota: state still lives in memory for this session */ }
    listeners.forEach(fn => fn());
  }

  /* Rows whose last change hasn't reached Supabase: { id: 'upsert' | 'delete' }.
     sync() never lets the server's older copy overwrite these. */
  function loadPending() {
    try { return JSON.parse(localStorage.getItem(PENDING) || '{}') || {}; } catch { return {}; }
  }
  function setPending(id, op) {
    const p = loadPending();
    if (op) p[id] = op; else delete p[id];
    try { localStorage.setItem(PENDING, JSON.stringify(p)); } catch { /* ignore */ }
  }

  function loadSynced() {
    try { return new Set(JSON.parse(localStorage.getItem(SYNCED) || '[]')); } catch { return new Set(); }
  }
  function saveSynced(set) {
    try { localStorage.setItem(SYNCED, JSON.stringify([...set])); } catch { /* ignore */ }
  }
  function markSynced(ids, on = true) {
    const set = loadSynced();
    ids.forEach(id => (on ? set.add(id) : set.delete(id)));
    saveSynced(set);
  }

  const strip = row => {
    if (!missingCols.size) return row;
    const r = { ...row };
    missingCols.forEach(c => delete r[c]);
    return r;
  };

  /** Upsert, dropping columns the table doesn't have. Resolves true/false. */
  async function upsertRemote(rows) {
    const client = getSupabaseClient();
    if (!client || !table || !rows.length) return true;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const { error } = await client.from(table).upsert(rows.map(strip));
        if (!error) return true;
        const m = /Could not find the '([^']+)' column/i.exec(error.message || '');
        if (m && !missingCols.has(m[1])) {
          missingCols.add(m[1]);
          console.warn(`[${table}] column "${m[1]}" is missing in Supabase — run supabase/setup_full.sql. Keeping it locally.`);
          continue;
        }
        console.warn(`[${table}] Supabase save failed, will retry:`, error.message || error);
        return false;
      } catch (err) {
        console.warn(`[${table}] Supabase save failed, will retry:`, err?.message || err);
        return false;
      }
    }
    return false;
  }

  async function deleteRemote(id) {
    const client = getSupabaseClient();
    if (!client || !table) return true;
    try {
      const { error } = await client.from(table).delete().eq('id', id);
      return !error;
    } catch { return false; }
  }

  function pushRow(row) {
    if (!getSupabaseClient() || !table) return;
    setPending(row.id, 'upsert');
    upsertRemote([row]).then(ok => { if (ok) { setPending(row.id, null); markSynced([row.id]); } });
  }
  function pushDelete(id) {
    if (!getSupabaseClient() || !table) return;
    setPending(id, 'delete');
    deleteRemote(id).then(ok => { if (ok) { setPending(id, null); markSynced([id], false); } });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Another tab wrote: pick it up.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', e => {
      if (e.key === storageKey) { items = read(); listeners.forEach(fn => fn()); }
    });
  }

  return {
    getAll: () => items,
    subscribe,
    useAll() {
      return useSyncExternalStore(subscribe, () => items, () => items);
    },
    add(record) {
      const row = { id: newId(), created_at: new Date().toISOString(), ...record };
      commit([row, ...items]);
      pushRow(row);
      return row;
    },
    update(id, patch) {
      let updated = null;
      commit(items.map(it => (it.id === id ? (updated = { ...it, ...patch }) : it)));
      if (updated) pushRow(updated);
      return updated;
    },
    remove(id) {
      const removed = items.find(it => it.id === id) || null;
      commit(items.filter(it => it.id !== id));
      pushDelete(id);
      return removed;
    },
    restore(row) {
      commit([row, ...items.filter(it => it.id !== row.id)]);
      pushRow(row);
    },
    /**
     * Pull remote rows, merge, and push anything still waiting. Never throws.
     * - A row edited here but not yet saved remotely keeps the local version.
     * - A row deleted here but not yet deleted remotely stays deleted.
     * - Otherwise the server wins for the columns it has; fields it doesn't
     *   have (setup SQL not run yet) keep their local values.
     */
    async sync() {
      const client = getSupabaseClient();
      if (!client || !table) return;
      try {
        const { data, error } = await client.from(table).select('*');
        if (error) throw error;
        const pending = loadPending();
        const remote = new Map((data || []).map(r => [r.id, r]));
        const local = new Map(items.map(i => [i.id, i]));

        const merged = [];
        for (const [id, r] of remote) {
          if (pending[id] === 'delete') continue;
          const l = local.get(id);
          if (l && pending[id] === 'upsert') merged.push(l);
          else merged.push(l ? { ...l, ...r } : r);
        }
        const synced = loadSynced();
        const missing = items.filter(i => !remote.has(i.id));
        // New here (never reached the server) → keep and upload.
        // Was on the server, now gone, and not edited here since → deleted elsewhere.
        const localOnly = missing.filter(i => !synced.has(i.id) || pending[i.id] === 'upsert');
        commit([...merged, ...localOnly]);

        const nowSynced = new Set([...remote.keys()].filter(id => pending[id] !== 'delete'));
        const toPush = [...localOnly, ...items.filter(i => remote.has(i.id) && pending[i.id] === 'upsert')];
        if (toPush.length) {
          const ok = await upsertRemote(toPush);
          toPush.forEach(r => { setPending(r.id, ok ? null : 'upsert'); if (ok) nowSynced.add(r.id); });
        }
        for (const [id, op] of Object.entries(pending)) {
          if (op === 'delete' && await deleteRemote(id)) setPending(id, null);
        }
        saveSynced(nowSynced);
      } catch (err) {
        console.warn(`[${table}] not available, staying local:`, err?.message || err);
      }
    },
  };
}
