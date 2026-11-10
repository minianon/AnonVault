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

  async function mirror(op) {
    const client = getSupabaseClient();
    if (!client || !table) return;
    try {
      const { error } = await op(client.from(table));
      if (error) throw error;
    } catch (err) {
      console.warn(`[${table}] Supabase mirror failed, kept locally:`, err?.message || err);
    }
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
      mirror(q => q.upsert(row));
      return row;
    },
    update(id, patch) {
      let updated = null;
      commit(items.map(it => (it.id === id ? (updated = { ...it, ...patch }) : it)));
      if (updated) mirror(q => q.upsert(updated));
      return updated;
    },
    remove(id) {
      const removed = items.find(it => it.id === id) || null;
      commit(items.filter(it => it.id !== id));
      mirror(q => q.delete().eq('id', id));
      return removed;
    },
    restore(row) {
      commit([row, ...items.filter(it => it.id !== row.id)]);
      mirror(q => q.upsert(row));
    },
    /** Pull remote rows and push local-only ones. Never throws. */
    async sync() {
      const client = getSupabaseClient();
      if (!client || !table) return;
      try {
        const { data, error } = await client.from(table).select('*');
        if (error) throw error;
        const remote = new Map((data || []).map(r => [r.id, r]));
        const localOnly = items.filter(it => !remote.has(it.id));
        commit([...remote.values(), ...localOnly]);
        if (localOnly.length) await mirror(q => q.upsert(localOnly));
      } catch (err) {
        console.warn(`[${table}] not available, staying local:`, err?.message || err);
      }
    },
  };
}
