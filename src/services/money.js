/* ─────────────────────────────────────────────────────────
   money.js — expenses, income and a monthly budget.

   Transaction shape (Supabase 'transactions' table, migration 003):
   {
     id:         uuid
     type:       'expense' | 'income'
     amount:     number (always positive; `type` carries the sign)
     category:   string
     note:       string
     method:     'upi' | 'card' | 'cash' | 'bank'
     date:       'YYYY-MM-DD'
     created_at: ISO string
   }
   ───────────────────────────────────────────────────────── */

import { useSyncExternalStore } from 'react';
import { createCollection } from './localStore';

export const transactions = createCollection({
  storageKey: 'anonvault_transactions',
  table: 'transactions',
  sort: (a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at || '').localeCompare(a.created_at || ''),
});

export const EXPENSE_CATEGORIES = [
  { id: 'food',          label: 'Food & dining',   color: '#f0b445' },
  { id: 'groceries',     label: 'Groceries',       color: '#4fd1a0' },
  { id: 'transport',     label: 'Transport',       color: '#6c96ff' },
  { id: 'shopping',      label: 'Shopping',        color: '#f5768a' },
  { id: 'bills',         label: 'Bills & recharge', color: '#94b6ff' },
  { id: 'rent',          label: 'Rent',            color: '#c49cff' },
  { id: 'subscriptions', label: 'Subscriptions',   color: '#5fd4e8' },
  { id: 'education',     label: 'Education',       color: '#7ee2b8' },
  { id: 'health',        label: 'Health',          color: '#fca5b3' },
  { id: 'fun',           label: 'Entertainment',   color: '#f7cf7b' },
  { id: 'travel',        label: 'Travel',          color: '#8fb5ff' },
  { id: 'emi',           label: 'EMI',             color: '#e5485f' },
  { id: 'other',         label: 'Other',           color: '#8d8d96' },
];

export const INCOME_CATEGORIES = [
  { id: 'salary',    label: 'Salary / stipend', color: '#4fd1a0' },
  { id: 'freelance', label: 'Freelance',        color: '#6c96ff' },
  { id: 'prize',     label: 'Hackathon prize',  color: '#f0b445' },
  { id: 'gift',      label: 'Gift / family',    color: '#f5768a' },
  { id: 'refund',    label: 'Refund',           color: '#94b6ff' },
  { id: 'other-in',  label: 'Other',            color: '#8d8d96' },
];

export const METHODS = [
  { id: 'upi',  label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'cash', label: 'Cash' },
  { id: 'bank', label: 'Bank' },
];

const ALL_CATS = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
export function categoryMeta(id) {
  return ALL_CATS.find(c => c.id === id) || { id, label: id || 'Other', color: '#8d8d96' };
}

/* ── settings ──────────────────────────────────────────── */
const SETTINGS_KEY = 'anonvault_money_settings';
const DEFAULT_SETTINGS = { currency: 'INR', monthlyBudget: 0 };
let settings = readSettings();
const settingsListeners = new Set();

function readSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function getMoneySettings() { return settings; }
export function setMoneySettings(patch) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  settingsListeners.forEach(fn => fn());
}
export function useMoneySettings() {
  return useSyncExternalStore(
    fn => { settingsListeners.add(fn); return () => settingsListeners.delete(fn); },
    () => settings,
    () => settings,
  );
}

/* ── formatting ────────────────────────────────────────── */
const fmtCache = new Map();
export function formatMoney(amount, currency = settings.currency, { compact = false, sign = false } = {}) {
  const key = currency + compact;
  if (!fmtCache.has(key)) {
    try {
      fmtCache.set(key, new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
        style: 'currency', currency,
        maximumFractionDigits: compact ? 1 : 2,
        minimumFractionDigits: 0,
        notation: compact ? 'compact' : 'standard',
      }));
    } catch {
      fmtCache.set(key, { format: n => `${currency} ${n.toFixed(2)}` });
    }
  }
  const n = Number(amount) || 0;
  // Paise on a ₹567.13/day figure is noise; keep decimals only for small sums.
  const abs = Math.abs(n) >= 100 && !compact ? Math.round(Math.abs(n)) : Math.abs(n);
  const s = fmtCache.get(key).format(abs);
  if (!sign) return n < 0 ? '−' + s : s;
  return (n < 0 ? '−' : '+') + s;
}

/* ── dates ─────────────────────────────────────────────── */
export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function monthKey(d = new Date()) { return ymd(d).slice(0, 7); }
export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
export function monthLabel(key, opts = { month: 'long', year: 'numeric' }) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, opts);
}
export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/* ── analysis ──────────────────────────────────────────── */
export function summarizeMonth(list, key) {
  const rows = list.filter(t => (t.date || '').startsWith(key));
  let income = 0, expense = 0;
  const byCat = new Map();
  const byDay = new Array(daysInMonth(key)).fill(0);
  for (const t of rows) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') income += amt;
    else {
      expense += amt;
      byCat.set(t.category, (byCat.get(t.category) || 0) + amt);
      const day = Number((t.date || '').slice(8, 10));
      if (day >= 1) byDay[day - 1] += amt;
    }
  }
  const categories = [...byCat.entries()]
    .map(([id, total]) => ({ ...categoryMeta(id), total }))
    .sort((a, b) => b.total - a.total);
  return { rows, income, expense, net: income - expense, categories, byDay };
}

export function spentOn(list, dateStr) {
  return list
    .filter(t => t.type !== 'income' && t.date === dateStr)
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

/* ── income sources ────────────────────────────────────────
   A source is where income comes from and what you expect from it:
   a fixed amount (stipend ₹25,000) or a range (freelance ₹10k–30k).
   Income transactions can point at one via `source_id`, which is how
   "expected vs received" is worked out per month.

   { id, name, kind: 'fixed'|'range', amount, min, max,
     frequency: 'monthly'|'weekly'|'yearly'|'one-time', active, note } */
export const incomeSources = createCollection({
  storageKey: 'anonvault_income_sources',
  table: 'income_sources',
  sort: (a, b) => (a.name || '').localeCompare(b.name || ''),
});

export const FREQUENCIES = [
  { id: 'monthly',  label: 'Monthly',  perMonth: 1 },
  { id: 'weekly',   label: 'Weekly',   perMonth: 52 / 12 },
  { id: 'yearly',   label: 'Yearly',   perMonth: 1 / 12 },
  { id: 'one-time', label: 'One-time', perMonth: 0 },
];

/** Expected per month as [low, high]. */
export function expectedPerMonth(src) {
  const f = FREQUENCIES.find(x => x.id === src.frequency)?.perMonth ?? 1;
  const lo = src.kind === 'range' ? Number(src.min) || 0 : Number(src.amount) || 0;
  const hi = src.kind === 'range' ? Number(src.max) || lo : lo;
  return [lo * f, hi * f];
}

/* ── investments ──────────────────────────────────────────
   { id, name, kind, invested, current_value, date, note }
   `invested` is the cost basis; `current_value` is what it's worth now
   (falls back to invested when not filled in). */
export const investments = createCollection({
  storageKey: 'anonvault_investments',
  table: 'investments',
  sort: (a, b) => (b.date || '').localeCompare(a.date || ''),
});

export const INVESTMENT_KINDS = [
  { id: 'mutual-fund', label: 'Mutual fund / SIP', color: '#6c96ff' },
  { id: 'stocks',      label: 'Stocks',            color: '#4fd1a0' },
  { id: 'fd',          label: 'FD / RD',           color: '#f0b445' },
  { id: 'gold',        label: 'Gold',              color: '#f7cf7b' },
  { id: 'crypto',      label: 'Crypto',            color: '#c49cff' },
  { id: 'ppf',         label: 'PPF / EPF / NPS',   color: '#5fd4e8' },
  { id: 'other',       label: 'Other',             color: '#8d8d96' },
];
export const investmentKind = id => INVESTMENT_KINDS.find(k => k.id === id) || INVESTMENT_KINDS[INVESTMENT_KINDS.length - 1];

export function currentValue(inv) {
  const v = Number(inv.current_value);
  return Number.isFinite(v) && inv.current_value !== '' && inv.current_value != null ? v : Number(inv.invested) || 0;
}

/* ── lending ──────────────────────────────────────────────
   { id, person, direction: 'lent'|'borrowed', amount, repaid,
     date, due_date, note, settled } */
export const loans = createCollection({
  storageKey: 'anonvault_loans',
  table: 'loans',
  sort: (a, b) => Number(!!a.settled) - Number(!!b.settled) || (b.date || '').localeCompare(a.date || ''),
});

export function outstanding(loan) {
  if (loan.settled) return 0;
  return Math.max(0, (Number(loan.amount) || 0) - (Number(loan.repaid) || 0));
}

/* ── income ideas ─────────────────────────────────────────
   Side-income ideas you haven't started (or are trying out).
   { id, title, potential_min, potential_max, effort: 'low'|'medium'|'high',
     status: 'idea'|'testing'|'earning'|'dropped', note, source_id } */
export const incomeIdeas = createCollection({
  storageKey: 'anonvault_income_ideas',
  table: 'income_ideas',
  sort: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
});

export const IDEA_STATUSES = [
  { id: 'idea',    label: 'Idea',    color: '#8d8d96' },
  { id: 'testing', label: 'Testing', color: '#f0b445' },
  { id: 'earning', label: 'Earning', color: '#4fd1a0' },
  { id: 'dropped', label: 'Dropped', color: '#55555d' },
];

/* ── EMIs ─────────────────────────────────────────────────
   { id, name, lender, emi_amount, total_months, start_month 'YYYY-MM',
     due_day 1–31, paid_before (instalments paid before tracking began),
     payments: ['YYYY-MM', …], interest_rate, note, closed }
   An instalment is "paid" when its month is in `payments`. Marking one
   paid also logs an expense (category 'emi', linked by emi_id), so EMIs
   show up in monthly spending without being entered twice. */
export const emis = createCollection({
  storageKey: 'anonvault_emis',
  table: 'emis',
  sort: (a, b) => Number(!!a.closed) - Number(!!b.closed) || (a.due_day || 0) - (b.due_day || 0),
});

export function emiStats(e, today = new Date()) {
  const endless = !(Number(e.total_months) > 0);
  const total = endless ? null : Number(e.total_months);
  const paidBefore = Number(e.paid_before) || 0;
  const payments = Array.isArray(e.payments) ? e.payments : [];
  const paid = endless ? paidBefore + payments.length : Math.min(total, paidBefore + payments.length);
  const remaining = endless ? null : Math.max(0, total - paid);
  const amount = Number(e.emi_amount) || 0;
  const thisMonth = monthKey(today);
  const paidThisMonth = payments.includes(thisMonth);
  let nextMonth = paidThisMonth ? shiftMonth(thisMonth, 1) : thisMonth;
  if (e.start_month && nextMonth < e.start_month) nextMonth = e.start_month;
  const done = !!e.closed || (!endless && remaining === 0);
  const endMonth = !endless && remaining > 0 ? shiftMonth(nextMonth, remaining - 1) : null;
  return { endless, total, paid, remaining, amount, left: endless ? 0 : remaining * amount, paidThisMonth, nextMonth, done, endMonth };
}
