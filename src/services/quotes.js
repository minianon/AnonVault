/* ─────────────────────────────────────────────────────────
   quotes.js — your quote collection, shown in turn on Today.

   Local-first like Money and Focus, mirrored to the existing Supabase
   `quotes` table (schema.sql), so quotes saved by the old Quotes Vault
   come back on the next unlock.

   { id, text, author, created_at }
   ───────────────────────────────────────────────────────── */

import { createCollection } from './localStore';

export const quotes = createCollection({
  storageKey: 'anonvault_quotes_v2',
  table: 'quotes',
  sort: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
});

export function addQuote({ text, author }) {
  const clean = (text || '').trim().replace(/^["“”']+|["“”']+$/g, '');
  if (!clean) return null;
  return quotes.add({ text: clean, author: (author || '').trim() || 'Unknown' });
}

/** Where today's rotation starts, so it moves on day to day. */
export function dayOffset(len) {
  if (!len) return 0;
  const d = new Date();
  return (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % len;
}
