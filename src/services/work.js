/* ─────────────────────────────────────────────────────────
   work.js — the companies / clients you work for.

   One shared list, so the same "Acme" means the same thing in Focus
   (hours), Money (income sources) and anywhere else that asks "for whom".

   { id, name, role, color, active, created_at }
   ───────────────────────────────────────────────────────── */

import { createCollection } from './localStore';

export const companies = createCollection({
  storageKey: 'anonvault_companies',
  table: 'companies',
  sort: (a, b) => Number(a.active === false) - Number(b.active === false) || (a.name || '').localeCompare(b.name || ''),
});

export const COMPANY_COLORS = ['#6c96ff', '#4fd1a0', '#f0b445', '#f5768a', '#c49cff', '#5fd4e8', '#f7cf7b', '#94b6ff'];

export function nextCompanyColor(list) {
  const used = new Set(list.map(c => c.color));
  return COMPANY_COLORS.find(c => !used.has(c)) || COMPANY_COLORS[list.length % COMPANY_COLORS.length];
}

/** Find a company by name (case-insensitive) or create it. Returns its id, or null for blank. */
export function resolveCompany(name) {
  const clean = (name || '').trim();
  if (!clean) return null;
  const hit = companies.getAll().find(c => (c.name || '').toLowerCase() === clean.toLowerCase());
  if (hit) return hit.id;
  return companies.add({ name: clean, role: '', color: nextCompanyColor(companies.getAll()), active: true }).id;
}

export function companyById(list, id) {
  return list.find(c => c.id === id) || null;
}
