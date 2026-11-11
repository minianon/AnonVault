/* ─────────────────────────────────────────────────────────
   reminders.js — a nudge before meetings and timed Board cards.

   While the app is open (any tab, even in the background), it checks every
   30 seconds for:
     - meetings starting within the lead time (default 10 min)
     - Board cards due today at a time within the lead time
   and shows an in-app toast (with Join for meetings) plus, if you allowed
   it, a system notification.

   There is no push server, so nothing fires while AnonVault is fully
   closed. Settings are per device (notification permission is too).
   ───────────────────────────────────────────────────────── */

import { useEffect, useSyncExternalStore } from 'react';
import { meetings, meetingsOn, timeRange, linkHref, ymd } from './meetings';
import { board } from './board';

const SETTINGS_KEY = 'anonvault_reminders';
const SENT_KEY = 'anonvault_reminders_sent';
export const LEAD_OPTIONS = [5, 10, 15, 30];
const DEFAULTS = { enabled: true, lead: 10 };

const listeners = new Set();
let cached = read();
function read() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function getReminderSettings() { return cached; }
export function setReminderSettings(patch) {
  cached = { ...cached, ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cached)); } catch { /* fine */ }
  listeners.forEach(fn => fn());
}
export function useReminderSettings() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => cached, () => cached);
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

/** Ask for system notifications. Resolves to the resulting permission. */
export async function enableSystemNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  const p = await Notification.requestPermission();
  listeners.forEach(fn => fn());
  return p;
}

function loadSent() {
  try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}') || {}; } catch { return {}; }
}
function markSent(key, today) {
  const sent = loadSent();
  // Keep only today's keys so this never grows.
  const next = Object.fromEntries(Object.entries(sent).filter(([, d]) => d === today));
  next[key] = today;
  try { localStorage.setItem(SENT_KEY, JSON.stringify(next)); } catch { /* fine */ }
}

/** Show a system notification, through the service worker when there is one (needed on phones). */
async function systemNotify(title, body, { tag, link } = {}) {
  if (notificationPermission() !== 'granted') return;
  const options = {
    body, tag, renotify: false, icon: '/icon-192.png', badge: '/icon-192.png',
    data: { link: link || null, url: '/' },
    ...(link ? { actions: [{ action: 'join', title: 'Join' }] } : {}),
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) { await reg.showNotification(title, options); return; }
  } catch { /* fall back below */ }
  try {
    const n = new Notification(title, { body, tag, icon: '/icon-192.png' });
    n.onclick = () => { window.focus(); if (link) window.open(link, '_blank', 'noopener'); n.close(); };
  } catch { /* some browsers only allow it through a service worker */ }
}

const minutesUntil = (dateStr, hm, now) => {
  const [h, m] = hm.split(':').map(Number);
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return (d - now) / 60000;
};

/** Everything that should remind right now and hasn't yet. */
function due(now, lead) {
  const today = ymd(now);
  const sent = loadSent();
  const out = [];
  for (const m of meetingsOn(meetings.getAll(), today)) {
    if (!m.start_time) continue;
    const mins = minutesUntil(today, m.start_time, now);
    const key = `m|${m.id}|${today}|${m.start_time}`;
    if (mins <= lead && mins > -2 && !sent[key]) {
      out.push({ key, kind: 'meeting', title: m.title, mins, body: timeRange(m), link: linkHref(m.link) });
    }
  }
  for (const c of board.getAll()) {
    if (c.status === 'done' || c.due_date !== today || !c.due_time) continue;
    const mins = minutesUntil(today, c.due_time, now);
    const key = `c|${c.id}|${today}|${c.due_time}`;
    if (mins <= lead && mins > -2 && !sent[key]) {
      out.push({ key, kind: 'card', title: c.title, mins, body: c.label ? `Board · ${c.label}` : 'Board card' });
    }
  }
  return { today, items: out };
}

/** Mount once (App). Runs the checks while the workspace is unlocked. */
export function useReminders({ active, showToast }) {
  useEffect(() => {
    if (!active) return undefined;
    const tick = () => {
      const s = getReminderSettings();
      if (!s.enabled) return;
      const { today, items } = due(new Date(), s.lead);
      for (const it of items) {
        markSent(it.key, today);
        const when = it.mins <= 0.5 ? 'now' : `in ${Math.round(it.mins)} min`;
        const title = it.kind === 'meeting' ? `${it.title} starts ${when}` : `${it.title} is due ${when}`;
        showToast?.('info', title, it.body, 20000,
          it.link ? { label: 'Join', onClick: () => window.open(it.link, '_blank', 'noopener') } : undefined);
        systemNotify(title, it.body, { tag: it.key, link: it.link });
      }
    };
    tick();
    const t = setInterval(tick, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [active, showToast]);
}
