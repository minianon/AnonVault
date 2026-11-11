/* ─────────────────────────────────────────────────────────
   tasks.js  –  daily checklist, local-first with a Supabase mirror

   Task shape (Supabase 'tasks' table):
   {
     id:              uuid (made in the browser, so a task can exist offline)
     title:           string
     is_recurring:    boolean
     recurrence:      'daily' | 'weekdays' | 'weekends' | 'weekly'
     recurrence_days: number[]   // 0=Sun…6=Sat (the column is text[]; normalised on read)
     date:            'YYYY-MM-DD' | null   // null for recurring
     subtasks:        [{ id, title, completed }]   // jsonb column
     completed:       boolean   // for one-off tasks
     created_at:      ISO string
   }

   Completions (recurring tasks only):
     task_completions    { task_id, date, completed }
     subtask_completions { task_id, subtask_id, date, completed }

   How saving works
   ────────────────
   Every change is written to localStorage first and then sent to Supabase.
   Until Supabase confirms it, the change is remembered as pending:
     anonvault_tasks_pending            { '<taskId>': 'upsert' | 'delete' }
     anonvault_task_completion_queue    { '<task>|<sub>|<date>': true|false }
   A load from Supabase never overwrites a pending change, and pending
   changes are retried on every load. That is what stops a tick from
   "un-ticking itself" when a save fails, and stops a task made offline
   from vanishing on the next load.

   All reads-then-writes run one at a time (serial()), so quick clicks and
   a background reload can't overwrite each other.

   localStorage keys (cache):
     anonvault_tasks
     anonvault_task_completions      → { '<taskId>': { '<date>': true } }
     anonvault_subtask_completions   → { '<taskId>__<subId>': { '<date>': true } }
───────────────────────────────────────────────────────── */

import { getSupabaseClient } from './supabase';
import { newId } from './localStore';
import { reportSyncIssue, missingColumnIn } from './syncStatus';

const TASKS_KEY    = 'anonvault_tasks';
const COMPLETE_KEY = 'anonvault_task_completions';
const SUBTASK_KEY  = 'anonvault_subtask_completions';
const PENDING_KEY  = 'anonvault_tasks_pending';
const QUEUE_KEY    = 'anonvault_task_completion_queue';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── localStorage helpers ────────────────────────────────────
function loadLS(key, def) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)) ?? def; }
  catch { return def; }
}
function saveLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota: memory copy still used this session */ }
}

function loadLocalTasks()       { return loadLS(TASKS_KEY, []); }
function saveLocalTasks(t)      { saveLS(TASKS_KEY, t); }
function loadCompletions()      { return loadLS(COMPLETE_KEY, {}); }
function saveCompletions(c)     { saveLS(COMPLETE_KEY, c); }
function loadSubCompletions()   { return loadLS(SUBTASK_KEY, {}); }
function saveSubCompletions(c)  { saveLS(SUBTASK_KEY, c); }
function loadPending()          { return loadLS(PENDING_KEY, {}); }
function loadQueue()            { return loadLS(QUEUE_KEY, {}); }
function saveQueue(q)           { saveLS(QUEUE_KEY, q); }

function setPending(id, op) {
  const p = loadPending();
  if (op) p[id] = op; else delete p[id];
  saveLS(PENDING_KEY, p);
}

/** Remember a recurring (sub)task tick that still has to reach Supabase. */
function queueCompletion(taskId, subtaskId, dateStr, completed) {
  const q = loadQueue();
  q[`${taskId}|${subtaskId || ''}|${dateStr}`] = !!completed;
  saveQueue(q);
}

const hasSupabase = () => !!getSupabaseClient();

/** Run fn after every earlier task operation has finished. */
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

// recurrence_days is a text[] column, so rows come back as ["1","3"].
function normalizeTask(t) {
  return {
    ...t,
    recurrence_days: (t.recurrence_days || []).map(Number).filter(Number.isFinite),
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
  };
}

// ── recurrence check ────────────────────────────────────────
function taskAppliesOnDate(task, dateStr) {
  if (!task.is_recurring) return task.date === dateStr;
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  switch (task.recurrence) {
    case 'daily':    return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekends': return dow === 0 || dow === 6;
    case 'weekly':   return (task.recurrence_days || []).map(Number).includes(dow);
    default:         return false;
  }
}

// ── enrich tasks with completion state (local completions map) ──
function enrichTasks(rawTasks, completions, subComp, dateStr) {
  return rawTasks
    .filter(t => taskAppliesOnDate(t, dateStr))
    .map(t => {
      const completed = t.is_recurring
        ? !!(completions[t.id]?.[dateStr])
        : !!t.completed;

      const subtasks = (t.subtasks || []).map(st => {
        const key = `${t.id}__${st.id}`;
        const stCompleted = t.is_recurring
          ? !!(subComp[key]?.[dateStr])
          : !!st.completed;
        return { ...st, completed: stCompleted };
      });

      return { ...t, completed, subtasks };
    });
}

// ══════════════════════════════════════════════════════════════
//  Supabase writes. Each returns true on success and never throws.
// ══════════════════════════════════════════════════════════════

// Columns this database turned out not to have (setup SQL not run yet).
const missingTaskCols = new Set();

function taskPayload(t) {
  const row = {
    id: t.id,
    title: t.title,
    priority: t.priority || 'medium',
    is_recurring: !!t.is_recurring,
    recurrence: t.recurrence || 'daily',
    recurrence_days: t.recurrence_days || [],
    date: t.is_recurring ? null : (t.date || null),
    subtasks: t.subtasks || [],
    completed: !!t.completed,
    hackathon_id: t.hackathon_id || null,
    ...(t.created_at ? { created_at: t.created_at } : {}),
  };
  missingTaskCols.forEach(c => delete row[c]);
  return row;
}

async function upsertTaskRemote(task) {
  const client = getSupabaseClient();
  if (!client) return false;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { error } = await client.from('tasks').upsert(taskPayload(task));
      if (!error) return true;
      const col = missingColumnIn(error);
      if (col && !missingTaskCols.has(col)) {
        missingTaskCols.add(col);
        reportSyncIssue(`tasks-col-${col}`, `The tasks table has no "${col}" column — run supabase/setup_full.sql.`, error.message);
        continue;
      }
      reportSyncIssue('tasks-save', 'A task change is saved on this device but did not reach Supabase. It will retry.', error.message || error);
      return false;
    } catch (err) {
      reportSyncIssue('tasks-save', 'A task change is saved on this device but did not reach Supabase. It will retry.', err?.message || err);
      return false;
    }
  }
  return false;
}

async function deleteTaskRemote(id) {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('tasks').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    reportSyncIssue('tasks-save', 'A task deletion did not reach Supabase. It will retry.', err?.message || err);
    return false;
  }
}

/** Save one task now; stays pending (and is retried on load) if that fails. */
async function pushTask(task) {
  setPending(task.id, 'upsert');
  if (!hasSupabase()) return false;
  if (await upsertTaskRemote(task)) { setPending(task.id, null); return true; }
  return false;
}

async function flushPendingTasks() {
  const pending = loadPending();
  const ids = Object.keys(pending);
  if (!ids.length) return;
  const local = new Map(loadLocalTasks().map(t => [t.id, t]));
  // One request per row, so a single bad row can't block every other one.
  for (const id of ids) {
    if (pending[id] === 'delete') {
      if (await deleteTaskRemote(id)) setPending(id, null);
    } else {
      const row = local.get(id);
      if (!row) { setPending(id, null); continue; }
      if (await upsertTaskRemote(row)) setPending(id, null);
    }
  }
}

async function writeCompletionRemote(client, taskId, subtaskId, dateStr, completed) {
  const table = subtaskId ? 'subtask_completions' : 'task_completions';
  const match = subtaskId ? { task_id: taskId, subtask_id: subtaskId, date: dateStr } : { task_id: taskId, date: dateStr };
  const res = completed
    ? await client.from(table).upsert({ ...match, completed: true }, { onConflict: subtaskId ? 'task_id,subtask_id,date' : 'task_id,date' })
    : await client.from(table).delete().match(match);
  if (res.error) throw res.error;
}

/** Send queued recurring ticks. Entries are only dropped once Supabase confirms them. */
async function flushQueue() {
  const client = getSupabaseClient();
  if (!client) return;
  const pending = loadPending();
  const entries = Object.entries(loadQueue());
  for (const [key, completed] of entries) {
    const [taskId, subId, dateStr] = key.split('|');
    // Its task isn't on the server yet; the foreign key would reject this.
    if (pending[taskId] === 'upsert') continue;
    try {
      await writeCompletionRemote(client, taskId, subId || null, dateStr, completed);
      const q = loadQueue();
      if (q[key] === completed) { delete q[key]; saveQueue(q); }
    } catch (err) {
      // The task was deleted: nothing left to record against.
      if (pending[taskId] === 'delete' || /foreign key/i.test(err?.message || '')) {
        const q = loadQueue(); delete q[key]; saveQueue(q);
        continue;
      }
      reportSyncIssue('tasks-ticks', 'A tick is saved on this device but did not reach Supabase. It will retry.', err?.message || err);
    }
  }
}

/** Old offline tasks got ids Supabase can't store; give them real uuids. */
function migrateLegacyIds() {
  const tasks = loadLocalTasks();
  const bad = tasks.filter(t => t.id && !UUID_RE.test(String(t.id)));
  if (!bad.length) return;
  const c = loadCompletions();
  const sc = loadSubCompletions();
  const q = loadQueue();
  for (const t of bad) {
    const oldId = t.id;
    const id = newId();
    t.id = id;
    if (c[oldId]) { c[id] = c[oldId]; delete c[oldId]; }
    for (const k of Object.keys(sc)) {
      if (k.startsWith(oldId + '__')) { sc[id + k.slice(oldId.length)] = sc[k]; delete sc[k]; }
    }
    for (const k of Object.keys(q)) {
      if (k.startsWith(oldId + '|')) { q[id + k.slice(oldId.length)] = q[k]; delete q[k]; }
    }
    // Recurring ticks were never sent for these; queue what's recorded.
    if (t.is_recurring) {
      for (const [d, v] of Object.entries(c[id] || {})) if (v) q[`${id}||${d}`] = true;
      for (const st of t.subtasks || []) {
        for (const [d, v] of Object.entries(sc[`${id}__${st.id}`] || {})) if (v) q[`${id}|${st.id}|${d}`] = true;
      }
    }
    setPending(oldId, null);
    setPending(id, 'upsert');
  }
  saveLocalTasks(tasks);
  saveCompletions(c);
  saveSubCompletions(sc);
  saveQueue(q);
}

// ── convert Supabase completions rows → local map format, keeping queued ticks ──
function buildCompletionMaps(compRows, subRows) {
  const queue = loadQueue();
  const comp = {};
  for (const r of compRows) {
    if (!r.completed) continue;
    (comp[r.task_id] ||= {})[r.date] = true;
  }
  let sub = null;
  if (subRows) {
    sub = {};
    for (const r of subRows) {
      if (!r.completed) continue;
      (sub[`${r.task_id}__${r.subtask_id}`] ||= {})[r.date] = true;
    }
  }
  for (const [key, done] of Object.entries(queue)) {
    const [taskId, subId, dateStr] = key.split('|');
    if (subId) {
      if (!sub) continue;
      const k = `${taskId}__${subId}`;
      if (done) (sub[k] ||= {})[dateStr] = true; else if (sub[k]) delete sub[k][dateStr];
    } else if (done) (comp[taskId] ||= {})[dateStr] = true;
    else if (comp[taskId]) delete comp[taskId][dateStr];
  }
  return { comp, sub };
}

// ══════════════════════════════════════════════════════════════
//  PUBLIC API (all async)
// ══════════════════════════════════════════════════════════════

/**
 * Pull tasks + completions from Supabase into the local cache, keeping any
 * change that hasn't been confirmed yet, then retry those changes.
 */
export function loadAllTasks() {
  return serial(async () => {
    migrateLegacyIds();
    const client = getSupabaseClient();
    if (client) {
      try {
        const [taskRes, compRes, subRes] = await Promise.all([
          client.from('tasks').select('*').order('created_at', { ascending: true }),
          client.from('task_completions').select('*'),
          client.from('subtask_completions').select('*'),
        ]);
        if (taskRes.error) throw taskRes.error;
        if (compRes.error) throw compRes.error;
        if (subRes.error) {
          reportSyncIssue('tasks-subtable', 'The subtask_completions table is missing — recurring subtask ticks stay on this device until you run supabase/setup_full.sql.', subRes.error.message);
        }

        const pending = loadPending();
        const local = loadLocalTasks();
        const localById = new Map(local.map(t => [t.id, t]));
        const remoteIds = new Set();
        const merged = [];
        for (const r of taskRes.data || []) {
          remoteIds.add(r.id);
          if (pending[r.id] === 'delete') continue;
          const mine = localById.get(r.id);
          merged.push(pending[r.id] === 'upsert' && mine ? mine : normalizeTask(r));
        }
        // Made or edited here and not on the server yet. Anything else that's
        // missing remotely was deleted on another device.
        for (const t of local) {
          if (!remoteIds.has(t.id) && pending[t.id] === 'upsert') merged.push(t);
        }
        merged.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
        saveLocalTasks(merged);

        const { comp, sub } = buildCompletionMaps(compRes.data || [], subRes.error ? null : subRes.data || []);
        saveCompletions(comp);
        if (sub) saveSubCompletions(sub);

        await flushPendingTasks();
        await flushQueue();
      } catch (err) {
        reportSyncIssue('tasks-load', 'Could not load tasks from Supabase — showing what this device has.', err?.message || err);
      }
    }
    return { tasks: loadLocalTasks().map(normalizeTask), completions: loadCompletions() };
  });
}

/** Get all tasks visible on a given date, enriched with completion state */
export async function getTasksForDate(dateStr) {
  const { tasks, completions } = await loadAllTasks();
  const subComp = loadSubCompletions();
  return enrichTasks(tasks, completions, subComp, dateStr);
}

/** Sync version used by computePendingTasks in App.jsx (stays local) */
export function getTasksForDateSync(dateStr) {
  const tasks = loadLocalTasks();
  const completions = loadCompletions();
  const subComp = loadSubCompletions();
  return enrichTasks(tasks, completions, subComp, dateStr);
}

/** Add a new task. Always succeeds locally; Supabase catches up if it's down. */
export function addTask(task) {
  return serial(async () => {
    const newTask = {
      id: newId(),
      created_at: new Date().toISOString(),
      title: task.title.trim(),
      is_recurring: !!task.is_recurring,
      recurrence: task.recurrence || 'daily',
      recurrence_days: (task.recurrence_days || []).map(Number),
      date: task.is_recurring ? null : (task.date || null),
      subtasks: (task.subtasks || [])
        .map(st => ({ id: st.id || uid(), title: (st.title || '').trim(), completed: false }))
        .filter(st => st.title),
      completed: false,
      priority: task.priority || 'medium',
      hackathon_id: task.hackathon_id || null,
    };
    const tasks = loadLocalTasks();
    tasks.push(newTask);
    saveLocalTasks(tasks);
    await pushTask(newTask);
    return newTask;
  });
}

/** Edit a task's definition. Subtask ticks are kept unless the caller sends them. */
export function updateTask(id, updates) {
  return serial(async () => {
    const tasks = loadLocalTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    const prev = tasks[idx];
    const prevSubs = new Map((prev.subtasks || []).map(st => [st.id, st]));

    const subtasks = (updates.subtasks || [])
      .map(st => ({
        id: st.id || uid(),
        title: (st.title || '').trim(),
        completed: st.completed ?? prevSubs.get(st.id)?.completed ?? false,
      }))
      .filter(st => st.title);

    const next = {
      ...prev,
      title: updates.title?.trim() ?? prev.title,
      is_recurring: updates.is_recurring ?? prev.is_recurring,
      recurrence: updates.recurrence ?? prev.recurrence,
      recurrence_days: (updates.recurrence_days ?? prev.recurrence_days ?? []).map(Number),
      date: updates.date !== undefined ? updates.date : prev.date,
      priority: updates.priority ?? prev.priority,
      subtasks,
    };
    if (next.is_recurring) next.date = null;
    // Only touch the hackathon link when the caller sent one.
    if (updates.hackathon_id !== undefined) next.hackathon_id = updates.hackathon_id || null;
    // A one-off task with subtasks is done exactly when they all are
    // (adding a new subtask to a finished task reopens it).
    if (!next.is_recurring && subtasks.length) next.completed = subtasks.every(st => st.completed);

    tasks[idx] = next;
    saveLocalTasks(tasks);
    await pushTask(next);
    return next;
  });
}

/** Delete a task entirely */
export function deleteTask(id) {
  return serial(async () => {
    saveLocalTasks(loadLocalTasks().filter(t => t.id !== id));
    const c = loadCompletions();
    delete c[id];
    saveCompletions(c);
    const sc = loadSubCompletions();
    Object.keys(sc).forEach(k => { if (k.startsWith(id + '__')) delete sc[k]; });
    saveSubCompletions(sc);
    const q = loadQueue();
    Object.keys(q).forEach(k => { if (k.startsWith(id + '|')) delete q[k]; });
    saveQueue(q);

    setPending(id, 'delete');
    if (hasSupabase() && await deleteTaskRemote(id)) setPending(id, null);
  });
}

/**
 * Set a task's completion for a date. `desired` is the state the UI is
 * showing after the click; without it the stored state is flipped.
 */
export function toggleTaskCompletion(task, dateStr, desired) {
  return serial(async () => {
    if (task.is_recurring) {
      const c = loadCompletions();
      const next = desired ?? !c[task.id]?.[dateStr];
      if (next) (c[task.id] ||= {})[dateStr] = true;
      else if (c[task.id]) delete c[task.id][dateStr];
      saveCompletions(c);

      // Subtasks follow the parent.
      const sc = loadSubCompletions();
      for (const st of task.subtasks || []) {
        const k = `${task.id}__${st.id}`;
        if (next) (sc[k] ||= {})[dateStr] = true;
        else if (sc[k]) delete sc[k][dateStr];
        queueCompletion(task.id, st.id, dateStr, next);
      }
      saveSubCompletions(sc);
      queueCompletion(task.id, null, dateStr, next);

      await flushQueue();
      return next;
    }

    const tasks = loadLocalTasks();
    const idx = tasks.findIndex(t => t.id === task.id);
    if (idx === -1) return false;
    const next = desired ?? !tasks[idx].completed;
    tasks[idx] = {
      ...tasks[idx],
      completed: next,
      subtasks: (tasks[idx].subtasks || []).map(st => ({ ...st, completed: next })),
    };
    saveLocalTasks(tasks);
    await pushTask(tasks[idx]);
    return next;
  });
}

/** Set one subtask's completion for a date (see toggleTaskCompletion for `desired`). */
export function toggleSubtaskCompletion(task, subtaskId, dateStr, desired) {
  return serial(async () => {
    if (task.is_recurring) {
      const key = `${task.id}__${subtaskId}`;
      const sc = loadSubCompletions();
      const next = desired ?? !sc[key]?.[dateStr];
      if (next) (sc[key] ||= {})[dateStr] = true;
      else if (sc[key]) delete sc[key][dateStr];
      saveSubCompletions(sc);
      queueCompletion(task.id, subtaskId, dateStr, next);

      // Parent is done exactly when every subtask is.
      const subs = task.subtasks || [];
      const allDone = subs.length > 0 && subs.every(st => !!sc[`${task.id}__${st.id}`]?.[dateStr]);
      const c = loadCompletions();
      const was = !!c[task.id]?.[dateStr];
      if (allDone !== was) {
        if (allDone) (c[task.id] ||= {})[dateStr] = true;
        else delete c[task.id][dateStr];
        saveCompletions(c);
        queueCompletion(task.id, null, dateStr, allDone);
      }

      await flushQueue();
      return next;
    }

    const tasks = loadLocalTasks();
    const tIdx = tasks.findIndex(t => t.id === task.id);
    if (tIdx === -1) return false;
    const subs = tasks[tIdx].subtasks || [];
    const stIdx = subs.findIndex(s => s.id === subtaskId);
    if (stIdx === -1) return false;
    const next = desired ?? !subs[stIdx].completed;
    const nextSubs = subs.map((s, i) => (i === stIdx ? { ...s, completed: next } : s));
    tasks[tIdx] = { ...tasks[tIdx], subtasks: nextSubs, completed: nextSubs.every(st => st.completed) };
    saveLocalTasks(tasks);
    await pushTask(tasks[tIdx]);
    return next;
  });
}

/* ══════════════════════════════════════════════════════════════
   History aggregates for the Review section.

   All of these read the localStorage caches synchronously. The
   completion log has been accumulating a row per (task, date) since
   the app was first used and nothing has ever read more than a single
   day of it — these are the first functions that look across dates.

   A recurring task only counts on days its recurrence actually covers,
   and never before the task was created: without that, adding a task
   today would retroactively show as months of missed days.
   ══════════════════════════════════════════════════════════════ */

function dateStrOffset(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function createdOnOrBefore(task, dateStr) {
  if (!task.created_at) return true;
  const created = new Date(task.created_at);
  if (Number.isNaN(created.getTime())) return true;
  const y = created.getFullYear();
  const m = String(created.getMonth() + 1).padStart(2, '0');
  const d = String(created.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}` <= dateStr;
}

function isDoneOn(task, dateStr, completions) {
  return task.is_recurring
    ? !!(completions[task.id]?.[dateStr])
    : !!task.completed;
}

/** Per-day scheduled/completed counts, oldest first, ending `end` days from today (0 = today, -7 = a week ago). */
export function getCompletionHistory(days = 30, end = 0) {
  const tasks = loadLocalTasks();
  const completions = loadCompletions();
  const out = [];

  for (let i = end - (days - 1); i <= end; i++) {
    const date = dateStrOffset(i);
    const due = tasks.filter(t => taskAppliesOnDate(t, date) && createdOnOrBefore(t, date));
    const done = due.filter(t => isDoneOn(t, date, completions));
    out.push({
      date,
      scheduled: due.length,
      completed: done.length,
      rate: due.length ? done.length / due.length : null,
    });
  }
  return out;
}

/** Per-recurring-task reliability over its scheduled days in the window. */
export function getTaskReliability(days = 30, end = 0) {
  const tasks = loadLocalTasks().filter(t => t.is_recurring);
  const completions = loadCompletions();

  return tasks
    .map(t => {
      let scheduled = 0;
      let completed = 0;
      for (let i = end - (days - 1); i <= end; i++) {
        const date = dateStrOffset(i);
        if (!taskAppliesOnDate(t, date) || !createdOnOrBefore(t, date)) continue;
        scheduled++;
        if (isDoneOn(t, date, completions)) completed++;
      }
      return {
        id: t.id,
        title: t.title,
        recurrence: t.recurrence,
        priority: t.priority,
        scheduled,
        completed,
        rate: scheduled ? completed / scheduled : null,
      };
    })
    .filter(r => r.scheduled > 0)
    .sort((a, b) => a.rate - b.rate);
}

/**
 * One row per recurring task for the last `days` days, oldest first:
 * each day is 'done', 'missed', 'off' (not scheduled that day, or before the
 * task existed) — plus the hit rate and the current run of done days.
 */
export function getHabitGrid(days = 30) {
  const tasks = loadLocalTasks().filter(t => t.is_recurring);
  const completions = loadCompletions();
  const today = dateStrOffset(0);
  return tasks.map(t => {
    const cells = [];
    let scheduled = 0, done = 0;
    for (let i = -(days - 1); i <= 0; i++) {
      const date = dateStrOffset(i);
      if (!taskAppliesOnDate(t, date) || !createdOnOrBefore(t, date)) { cells.push({ date, state: 'off' }); continue; }
      const ok = isDoneOn(t, date, completions);
      // Today isn't missed until it's over.
      const state = ok ? 'done' : date === today ? 'pending' : 'missed';
      if (state !== 'pending') { scheduled++; if (ok) done++; }
      cells.push({ date, state });
    }
    let run = 0;
    for (let i = cells.length - 1; i >= 0; i--) {
      const st = cells[i].state;
      if (st === 'off' || st === 'pending') continue;
      if (st === 'done') run++; else break;
    }
    return { id: t.id, title: t.title, recurrence: t.recurrence, cells, rate: scheduled ? done / scheduled : null, streak: run };
  }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
}

/**
 * Current and longest run of clean days — every scheduled task completed.
 * Days with nothing scheduled are skipped rather than breaking the run: a
 * weekends-only schedule should not lose its streak every Monday.
 */
export function getStreaks(days = 180) {
  const tasks = loadLocalTasks();
  const completions = loadCompletions();

  let longest = 0;
  let run = 0;

  for (let i = -(days - 1); i <= 0; i++) {
    const date = dateStrOffset(i);
    const due = tasks.filter(t => taskAppliesOnDate(t, date) && createdOnOrBefore(t, date));
    if (due.length === 0) continue;

    if (due.every(t => isDoneOn(t, date, completions))) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  // The loop ends on today, so whatever run it finished with IS the current
  // one. A day still in progress simply has not joined the run yet, rather
  // than reading as a break.
  return { current: run, longest };
}

/** Days since the earliest task was created — a simple "day N" counter. */
export function getDayCount() {
  const tasks = loadLocalTasks();
  const stamps = tasks
    .map(t => t.created_at && new Date(t.created_at).getTime())
    .filter(n => n && !Number.isNaN(n));
  if (!stamps.length) return 1;
  const first = Math.min(...stamps);
  const dayMs = 86400000;
  return Math.max(1, Math.round((Date.now() - first) / dayMs) + 1);
}

/** Raw local tasks, unfiltered by date — for views that need all of them. */
export function getAllTasksSync() {
  return loadLocalTasks();
}

/**
 * Checklist progress per hackathon, keyed by hackathon id.
 * Recurring steps are judged on today; one-off steps on their own flag.
 */
export function getHackathonProgress() {
  const tasks = loadLocalTasks();
  const completions = loadCompletions();
  const today = dateStrOffset(0);
  const map = {};

  for (const t of tasks) {
    if (!t.hackathon_id) continue;
    if (!map[t.hackathon_id]) map[t.hackathon_id] = { total: 0, done: 0, steps: [] };
    const done = t.is_recurring ? !!(completions[t.id]?.[today]) : !!t.completed;
    const bucket = map[t.hackathon_id];
    bucket.total++;
    if (done) bucket.done++;
    bucket.steps.push({ id: t.id, title: t.title, completed: done, priority: t.priority });
  }
  return map;
}
