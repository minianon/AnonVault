/* ─────────────────────────────────────────────────────────
   ideas.js — project ideas, local-first like everything else.

   They used to live only in Supabase, so Ideas was empty (and saving
   failed) whenever the database wasn't reachable. Now localStorage is the
   source of truth and the 'ideas' table is a mirror; existing rows there
   are pulled in on the first sync.

   { id, title, content, images: [{url, caption, is_primary}], links,
     tags: [string], status: 'new'|'exploring'|'ready', created_at }
   ───────────────────────────────────────────────────────── */

import { createCollection } from './localStore';

export const ideas = createCollection({
  storageKey: 'anonvault_ideas_v2',
  table: 'ideas',
  sort: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
});

export const IDEA_STAGES = [
  { id: 'new',       label: 'New',       color: '#8d8d96', hint: 'Just captured' },
  { id: 'exploring', label: 'Exploring', color: '#f0b445', hint: 'Thinking it through' },
  { id: 'ready',     label: 'Ready',     color: '#4fd1a0', hint: 'Ready to build' },
];
export const stageOf = idea => IDEA_STAGES.find(s => s.id === idea?.status) || IDEA_STAGES[0];

/** Lines in the notes that read like steps: "- x", "* x", "1. x", "[ ] x". */
export function stepsIn(text) {
  return String(text || '')
    .split('\n')
    .map(l => l.match(/^\s*(?:[-*•]|\d+[.)]|\[\s?\])\s+(.+?)\s*$/)?.[1])
    .filter(Boolean)
    .slice(0, 20);
}
