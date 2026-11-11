/* ─────────────────────────────────────────────────────────
   syncStatus.js — one place for "a save didn't reach Supabase".

   The services keep the change locally and retry later, so a failure is
   never data loss, but it used to be invisible: a warning in the console
   and nothing on screen. Services report here; App shows a toast once per
   distinct problem.
   ───────────────────────────────────────────────────────── */

const listeners = new Set();

/**
 * @param {string} key      stable id for the problem, so repeats are deduped
 * @param {string} message  short text for the user
 * @param {unknown} [detail] logged to the console
 */
export function reportSyncIssue(key, message, detail) {
  console.warn(`[sync] ${message}`, detail ?? '');
  listeners.forEach(fn => {
    try { fn({ key, message }); } catch { /* a listener must not break a save */ }
  });
}

export function onSyncIssue(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Pull the "missing column" name out of a PostgREST error, if that's what it is. */
export function missingColumnIn(error) {
  const m = /Could not find the '([^']+)' column/i.exec(error?.message || '');
  return m ? m[1] : null;
}
