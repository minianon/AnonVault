import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Edit3, X, ChevronDown, Check, RotateCcw,
  ChevronLeft, ChevronRight as ChevronRightIcon, Repeat2,
  ListChecks, EyeOff, CheckCheck, CalendarRange, NotebookPen
} from 'lucide-react';
import {
  getTasksForDate, getTasksForDateSync, addTask, updateTask, deleteTask,
  toggleTaskCompletion, toggleSubtaskCompletion
} from '../services/tasks';
import { useShortcutHooks } from '../utils/useShortcutHooks';
import { getNote, setNote } from '../services/journal';
import { PageHeader, Card, CardHeader, Empty, Progress, inputCls, Select } from './ui';

/* ── helpers ───────────────────────────────────────────── */
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function todayStr() { return toDateStr(new Date()); }

function formatDisplayDate(dateStr) {
  const today     = todayStr();
  const yesterday = toDateStr(new Date(Date.now() - 86400000));
  const tomorrow  = toDateStr(new Date(Date.now() + 86400000));
  if (dateStr === today)     return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  if (dateStr === tomorrow)  return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatDayFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_META  = {
  high:   { label: 'High',   dot: 'bg-rose-400'  },
  medium: { label: 'Medium', dot: 'bg-amber-400' },
  low:    { label: 'Low',    dot: 'bg-slate-600' },
};

const RECUR_SHORT = { daily: 'Daily', weekdays: 'Weekdays', weekends: 'Weekends' };

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RECUR_OPTS = [
  { value: 'daily',    label: 'Every day'          },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekends', label: 'Weekends (Sat–Sun)' },
  { value: 'weekly',   label: 'Weekly (custom)'    }
];

/* ── Checkbox ────────────────────────────────────────────── */
function Checkbox({ checked, onChange, size = 'md', disabled = false }) {
  const small = size === 'sm';
  const sz = small ? 'w-[15px] h-[15px] rounded-[4px]' : 'w-[17px] h-[17px] rounded-[5px]';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); if (!disabled) onChange(); }}
      className={`${sz} shrink-0 flex items-center justify-center border transition-colors duration-150 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${
        checked ? 'bg-slate-100 border-slate-100 text-slate-950' : 'border-white/[0.22] hover:border-white/[0.45] bg-transparent'
      }`}
    >
      <Check size={small ? 10 : 11} strokeWidth={3}
        style={{ opacity: checked ? 1 : 0, transform: checked ? 'scale(1)' : 'scale(0.6)', transition: 'all .18s var(--ease)' }} />
    </button>
  );
}

/* ── Task row ────────────────────────────────────────────── */
function TaskCard({ task, onToggle, onToggleSub, onEdit, onDelete, onCancel, hackathonName }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasSubtasks  = task.subtasks && task.subtasks.length > 0;
  const completedSubs = hasSubtasks ? task.subtasks.filter(s => s.completed).length : 0;
  const allSubsDone  = hasSubtasks && completedSubs === task.subtasks.length;
  const p            = PRIORITY_META[task.priority] || PRIORITY_META.low;
  const showThread   = hasSubtasks && !collapsed;
  const hasMeta      = hasSubtasks || task.is_recurring || hackathonName;

  return (
    <li className="group">
      <div className="flex items-center gap-3 px-4 min-h-[44px] py-2 hover:bg-white/[0.02] transition-colors">
        <Checkbox
          checked={task.completed}
          onChange={() => onToggle(task)}
          disabled={false}
        />

        <div className="flex-1 min-w-0">
          <span title={task.title}
            className={`block text-[13.5px] leading-snug truncate strikethrough-draw ${
              task.completed ? 'strikethrough-completed' : 'text-slate-200'
            }`}>
            {task.title}
          </span>

          {hasMeta && (
            <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11.5px] text-slate-500 min-w-0">
              {hasSubtasks && (
                <button
                  onClick={e => { e.stopPropagation(); setCollapsed(c => !c); }}
                  className="inline-flex items-center gap-1 tabular-nums hover:text-slate-300 transition-colors cursor-pointer"
                  title={collapsed ? 'Expand' : 'Collapse'}
                >
                  <span className={allSubsDone ? 'text-emerald-400' : ''}>
                    {completedSubs}/{task.subtasks.length} subtasks
                  </span>
                  <ChevronDown size={12} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                </button>
              )}
              {task.is_recurring && (
                <span className="inline-flex items-center gap-1">
                  <Repeat2 size={11} />
                  {RECUR_SHORT[task.recurrence] || 'Weekly'}
                </span>
              )}
              {/* Which hackathon this step belongs to */}
              {hackathonName && (
                <span className="inline-flex items-center gap-1 min-w-0 max-w-[180px]">
                  <CalendarRange size={11} className="shrink-0" />
                  <span className="truncate">{hackathonName}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Row actions — always visible on touch, on hover from sm up */}
        <div className="flex items-center shrink-0 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onCancel(task); }}
            className="icon-btn !w-7 !h-7 hover:!text-amber-400 cursor-pointer"
            title="Cancel for today"
            aria-label="Cancel for today"
          >
            <EyeOff size={13} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onEdit(task); }}
            className="icon-btn !w-7 !h-7 cursor-pointer"
            title="Edit"
            aria-label="Edit"
          >
            <Edit3 size={13} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(task); }}
            className="icon-btn !w-7 !h-7 hover:!text-rose-400 cursor-pointer"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Priority — quiet dot, label from sm up */}
        <span className="flex items-center gap-1.5 shrink-0 sm:w-[64px]" title={`${p.label} priority`}>
          <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
          <span className="hidden sm:inline text-[12px] text-slate-500">{p.label}</span>
        </span>
      </div>

      {/* ── Subtask list ── */}
      {showThread && (
        <ul className="pl-11 pr-4 pb-2 space-y-0.5 fade-up">
          {task.subtasks.map(st => (
            <li key={st.id} className="flex items-center gap-2.5 min-h-[28px]">
              <Checkbox
                checked={st.completed}
                onChange={() => onToggleSub(task, st.id)}
                size="sm"
              />
              <span className={`min-w-0 truncate text-[12.5px] strikethrough-draw ${
                st.completed ? 'strikethrough-completed' : 'text-slate-300'
              }`}>
                {st.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* ── Priority selector ───────────────────────────────────── */
function PrioritySelector({ value, onChange }) {
  const opts = ['high', 'medium', 'low'];
  return (
    <div className="grid grid-cols-3 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
      {opts.map(key => {
        const meta = PRIORITY_META[key];
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`h-8 px-3 rounded-md inline-flex items-center justify-center gap-2 text-[13px] font-medium transition-colors cursor-pointer ${
              active ? 'bg-white/[0.09] text-slate-100 shadow-[0_1px_2px_rgba(0,0,0,0.4)]' : 'text-slate-500 hover:text-slate-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ children }) {
  return <span className="block text-[12px] font-medium text-slate-400 mb-1.5">{children}</span>;
}

const CHOICE_ON  = 'border-white/[0.16] bg-white/[0.07] text-slate-100';
const CHOICE_OFF = 'border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]';

/* ── Task Form Modal ─────────────────────────────────────── */
function TaskFormModal({ isOpen, onClose, onSave, editingTask, defaultDate, showToast, applications }) {
  const [title,         setTitle]         = useState('');
  const [priority,      setPriority]      = useState('medium');
  const [isRecurring,   setIsRecurring]   = useState(false);
  const [recurrence,    setRecurrence]    = useState('daily');
  const [recurrenceDays, setRecurrenceDays] = useState([]);
  const [taskDate,      setTaskDate]      = useState(defaultDate || todayStr());
  const [subtasks,      setSubtasks]      = useState([]);
  const [hackathonId,   setHackathonId]   = useState('');
  const [stInput,       setStInput]       = useState('');
  const stInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editingTask) {
      setTitle(editingTask.title);
      setPriority(editingTask.priority || 'medium');
      setIsRecurring(editingTask.is_recurring);
      setRecurrence(editingTask.recurrence || 'daily');
      setRecurrenceDays(editingTask.recurrence_days || []);
      setTaskDate(editingTask.date || defaultDate || todayStr());
      setSubtasks(editingTask.subtasks?.map(s => ({ id: s.id, title: s.title })) || []);
      setHackathonId(editingTask.hackathon_id || '');
    } else {
      setTitle(''); setPriority('medium'); setIsRecurring(false);
      setRecurrence('daily'); setRecurrenceDays([]);
      setTaskDate(defaultDate || todayStr()); setSubtasks([]);
      setHackathonId('');
    }
    setStInput('');
  }, [isOpen, editingTask, defaultDate]);

  const addSubtask = () => {
    const t = stInput.trim();
    if (!t) return;
    setSubtasks(prev => [...prev, { id: Date.now().toString(), title: t }]);
    setStInput('');
    stInputRef.current?.focus();
  };

  const toggleDay = day =>
    setRecurrenceDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

  const handleSave = () => {
    if (!title.trim()) { showToast?.('error', 'Title Required', 'Please enter a task title.'); return; }
    if (!isRecurring && !taskDate) { showToast?.('error', 'Date Required', 'Please select a date.'); return; }
    if (isRecurring && recurrence === 'weekly' && recurrenceDays.length === 0) {
      showToast?.('error', 'Select Days', 'Choose at least one day for weekly recurrence.'); return;
    }
    onSave({ title, priority, is_recurring: isRecurring, recurrence, recurrence_days: recurrenceDays,
             date: isRecurring ? null : taskDate, subtasks: subtasks.filter(s => s.title.trim()),
             hackathon_id: hackathonId || null });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-surface w-full max-w-lg rounded-xl flex flex-col overflow-hidden max-h-[92vh]"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 h-12 border-b border-white/[0.06] shrink-0">
          <h2 className="text-[14px] font-semibold text-slate-100">{editingTask ? 'Edit task' : 'New task'}</h2>
          <button onClick={onClose} className="icon-btn -mr-2 cursor-pointer" aria-label="Close"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Title */}
          <label className="block">
            <FieldLabel>Title <span className="text-rose-400">*</span></FieldLabel>
            <input autoFocus type="text" placeholder="e.g. Review pull requests"
              value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className={inputCls} />
          </label>

          {/* Priority */}
          <div>
            <FieldLabel>Priority</FieldLabel>
            <PrioritySelector value={priority} onChange={setPriority} />
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-3 min-w-0">
              <Repeat2 size={15} className="text-slate-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-200">Recurring task</p>
                <p className="text-[12px] text-slate-500">Repeats on a schedule</p>
              </div>
            </div>
            <button type="button" role="switch" aria-checked={isRecurring} aria-label="Recurring task"
              onClick={() => setIsRecurring(p => !p)}
              className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative shrink-0 ${isRecurring ? 'bg-accent-500' : 'bg-white/[0.12]'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isRecurring ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Recurring / date options */}
          {isRecurring ? (
            <div className="space-y-4">
              <div>
                <FieldLabel>Frequency</FieldLabel>
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
                  {RECUR_OPTS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => setRecurrence(opt.value)}
                      className={`h-9 px-3 rounded-lg text-[13px] text-left transition-colors cursor-pointer border ${
                        recurrence === opt.value ? CHOICE_ON : CHOICE_OFF
                      }`}>{opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {recurrence === 'weekly' && (
                <div>
                  <FieldLabel>On these days</FieldLabel>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAY_LABELS.map((label, i) => (
                      <button key={i} type="button" onClick={() => toggleDay(i)}
                        aria-pressed={recurrenceDays.includes(i)}
                        className={`h-8 min-w-[40px] px-2 rounded-md text-[12px] font-medium transition-colors cursor-pointer border ${
                          recurrenceDays.includes(i) ? CHOICE_ON : CHOICE_OFF
                        }`}>{label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <label className="block">
              <FieldLabel>Date <span className="text-rose-400">*</span></FieldLabel>
              <input type="date" value={taskDate} onChange={e => setTaskDate(e.target.value)}
                className={`${inputCls} cursor-pointer`} />
            </label>
          )}

          {/* Hackathon link — turns a Timeline entry into a checklist owner
              (register, form team, record demo, submit) instead of the two
              sections running in parallel with no connection. */}
          {(applications || []).length > 0 && (
            <label className="block">
              <FieldLabel>
                Part of a hackathon <span className="font-normal text-slate-500">(optional)</span>
              </FieldLabel>
              <Select className="w-full" value={hackathonId || ''} onChange={setHackathonId} ariaLabel="Linked hackathon"
                options={[{ value: '', label: 'Not linked' },
                  ...(applications || []).filter(a => a && a.name).map(a => ({ value: a.id, label: a.name }))]} />
            </label>
          )}

          {/* Subtasks */}
          <div>
            <FieldLabel>Subtasks</FieldLabel>
            {subtasks.length > 0 && (
              <ul className="mb-2 rounded-lg border border-white/[0.06] divide-y divide-white/[0.04]">
                {subtasks.map((st, i) => (
                  <li key={st.id || i} className="flex items-center gap-2.5 h-9 pl-3 pr-1">
                    <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                    <span className="text-[13px] text-slate-300 flex-1 min-w-0 truncate">{st.title}</span>
                    <button type="button"
                      onClick={() => setSubtasks(prev => prev.filter((_, idx) => idx !== i))}
                      className="icon-btn !w-7 !h-7 hover:!text-rose-400 cursor-pointer shrink-0"
                      title="Delete subtask" aria-label="Delete subtask">
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input ref={stInputRef} type="text" placeholder="Add subtask… (press Enter)"
                value={stInput} onChange={e => setStInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubtask())}
                className="input-premium flex-1 min-w-0 h-9 px-3 rounded-lg text-[13px]" />
              <button type="button" onClick={addSubtask}
                className="btn-ghost h-9 px-3 rounded-lg text-[13px] cursor-pointer shrink-0">
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end gap-2 bg-white/[0.015] shrink-0">
          <button type="button" onClick={onClose}
            className="btn-ghost h-8 px-3 text-[13px] rounded-lg cursor-pointer">Cancel</button>
          <button type="button" onClick={handleSave}
            className="btn-primary h-8 px-3 text-[13px] rounded-lg cursor-pointer">
            {editingTask ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Delete confirm modal ────────────────────────────────── */
function DeleteModal({ task, onConfirm, onClose }) {
  if (!task) return null;
  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-surface w-full max-w-sm rounded-xl overflow-hidden">
        <div className="p-5 space-y-2">
          <h2 className="text-[14px] font-semibold text-slate-100">Delete task</h2>
          <p className="text-[13px] text-slate-400 leading-relaxed">
            Delete <span className="text-slate-100 font-medium">"{task.title}"</span>?
            {task.is_recurring && ' This removes the recurring task and all its history.'}
            {' '}This cannot be undone.
          </p>
        </div>
        <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end gap-2 bg-white/[0.015]">
          <button onClick={onClose}
            className="btn-ghost h-8 px-3 text-[13px] rounded-lg cursor-pointer">Keep it</button>
          <button onClick={onConfirm}
            className="btn-danger h-8 px-3 text-[13px] rounded-lg cursor-pointer">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN VIEW
══════════════════════════════════════════════════════════ */
export default function TasksView({ showToast, onTasksChange, tasksVersion, onLock, onMenuToggle, applications, initialDate, onClearInitialDate }) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [tasks,        setTasks]        = useState([]);
  const [isFormOpen,   setIsFormOpen]   = useState(false);
  const [editingTask,  setEditingTask]  = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy,         setBusy]         = useState(false);
  const [markingAll,   setMarkingAll]   = useState(false);

  const [cancelledMap, setCancelledMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('anonvault_task_cancelled') || localStorage.getItem('anonvault_task_ignored') || '{}');
    } catch {
      return {};
    }
  });

  const handleCancel = useCallback(async task => {
    const updated = { ...cancelledMap };
    if (!updated[task.id]) updated[task.id] = {};
    updated[task.id][selectedDate] = true;
    setCancelledMap(updated);
    localStorage.setItem('anonvault_task_cancelled', JSON.stringify(updated));
    showToast?.('warning', 'Task Cancelled', `"${task.title}" cancelled for today.`);
  }, [cancelledMap, selectedDate, showToast]);

  const handleUncancel = useCallback(async taskId => {
    const updated = { ...cancelledMap };
    if (updated[taskId]) {
      delete updated[taskId][selectedDate];
      if (Object.keys(updated[taskId]).length === 0) {
        delete updated[taskId];
      }
    }
    setCancelledMap(updated);
    localStorage.setItem('anonvault_task_cancelled', JSON.stringify(updated));
    showToast?.('success', 'Task Restored', 'Task is visible again.');
  }, [cancelledMap, selectedDate, showToast]);

  // fetch only — used for external refreshes so we never notify back and loop
  const reload = useCallback(async () => {
    const fetched = await getTasksForDate(selectedDate);
    setTasks(fetched);
  }, [selectedDate]);

  const refresh = useCallback(async () => {
    await reload();
    onTasksChange?.();
  }, [reload, onTasksChange]);


  useEffect(() => { refresh(); }, [refresh]);

  // Jumped to from the Review chart. Cleared immediately so returning to this
  // tab later does not snap back to that date.
  useEffect(() => {
    if (!initialDate) return;
    // Applying a prop to state is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDate(initialDate);
    onClearInitialDate?.();
  }, [initialDate, onClearInitialDate]);

  // Re-derive when another view mutates tasks. Reads the localStorage cache
  // synchronously instead of re-hitting the network — every mutation writes
  // that cache first, so it is already current. Skips the first run so this
  // does not clobber the mount fetch above.
  const seenVersion = useRef(tasksVersion);
  useEffect(() => {
    if (seenVersion.current === tasksVersion) return;
    seenVersion.current = tasksVersion;
    setTasks(getTasksForDateSync(selectedDate));
  }, [tasksVersion, selectedDate]);


  const shiftDate = delta => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(toDateStr(d));
  };

  const handleToggle    = useCallback(async task => {
    // Optimistic Update
    const isCompleted = !task.completed;
    setTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        const updatedSubs = (t.subtasks || []).map(st => ({
          ...st,
          completed: isCompleted
        }));
        return { ...t, completed: isCompleted, subtasks: updatedSubs };
      }
      return t;
    }));

    try {
      await toggleTaskCompletion(task, selectedDate);
      await refresh();
    } catch (err) {
      console.error('Failed to toggle task:', err);
      showToast?.('error', 'Error', 'Failed to update task state. Rolling back.');
      await refresh();
    }
  }, [selectedDate, refresh, showToast]);

  // ── mark every pending (non-cancelled) task for this day as completed ──
  const handleMarkAllComplete = useCallback(async () => {
    const pending = tasks.filter(t => !cancelledMap[t.id]?.[selectedDate] && !t.completed);
    if (pending.length === 0) return;

    setMarkingAll(true);

    // Optimistic Update
    const pendingIds = new Set(pending.map(t => t.id));
    setTasks(prev => prev.map(t => pendingIds.has(t.id)
      ? { ...t, completed: true, subtasks: (t.subtasks || []).map(st => ({ ...st, completed: true })) }
      : t
    ));

    try {
      for (const task of pending) {
        await toggleTaskCompletion(task, selectedDate);
      }
      showToast?.('success', 'All Done',
        `${pending.length} task${pending.length > 1 ? 's' : ''} marked as completed.`);
    } catch (err) {
      console.error('Failed to mark all tasks complete:', err);
      showToast?.('error', 'Error', 'Could not mark all tasks complete. Rolling back.');
    }
    await refresh();
    setMarkingAll(false);
  }, [tasks, cancelledMap, selectedDate, refresh, showToast]);

  const handleToggleSub = useCallback(async (task, sid) => {
    // Optimistic Update
    setTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        const updatedSubs = (t.subtasks || []).map(st => {
          if (st.id === sid) {
            return { ...st, completed: !st.completed };
          }
          return st;
        });
        const allCompleted = updatedSubs.every(st => st.completed);
        return { 
          ...t, 
          subtasks: updatedSubs,
          completed: allCompleted
        };
      }
      return t;
    }));

    try {
      await toggleSubtaskCompletion(task, sid, selectedDate);
      await refresh();
    } catch (err) {
      console.error('Failed to toggle subtask:', err);
      showToast?.('error', 'Error', 'Failed to update subtask state. Rolling back.');
      await refresh();
    }
  }, [selectedDate, refresh, showToast]);

  const handleSave = async task => {
    setBusy(true);
    try {
      if (editingTask) {
        await updateTask(editingTask.id, task);
        showToast?.('success', 'Task Updated', `"${task.title}" has been saved.`);
      } else {
        await addTask(task);
        showToast?.('success', task.is_recurring ? 'Recurring Task Added' : 'Task Added',
          `"${task.title}" added to your checklist.`);
      }
    } catch (err) {
      showToast?.('error', 'Save Failed', 'Could not save task. Check console.');
      console.error(err);
    }
    setIsFormOpen(false); setEditingTask(null);
    await refresh();
    setBusy(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteTask(deleteTarget.id);
      showToast?.('warning', 'Task Deleted', `"${deleteTarget.title}" has been removed.`);
    } catch (err) {
      showToast?.('error', 'Delete Failed', 'Could not remove task. Check console.');
      console.error(err);
    }
    setDeleteTarget(null);
    await refresh();
    setBusy(false);
  };

  // ── sort pending: high → medium → low ──
  const sortByPriority = arr =>
    [...arr].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));

  // One line about the day. Local-first, debounced, so typing never waits
  // on the network.
  const [dayNote, setDayNote] = useState('');
  const noteTimer = useRef(null);

  useEffect(() => {
    // Loading the note for a new date is exactly what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDayNote(getNote(selectedDate));
  }, [selectedDate]);

  const onNoteChange = value => {
    setDayNote(value);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(selectedDate, value), 600);
  };

  useEffect(() => () => clearTimeout(noteTimer.current), []);

  const rootRef = useRef(null);
  useShortcutHooks({
    onNew: () => { setEditingTask(null); setIsFormOpen(true); },
    rootRef,
  });

  const hackathonNames = (applications || []).reduce((acc, a) => {
    if (a && a.id) acc[a.id] = a.name;
    return acc;
  }, {});

  const activeTasks    = tasks.filter(t => !cancelledMap[t.id]?.[selectedDate]);
  const cancelledToday = tasks.filter(t => !!cancelledMap[t.id]?.[selectedDate]);

  const allPending     = sortByPriority(activeTasks.filter(t => !t.completed));
  const completedTasks = activeTasks.filter(t => t.completed);
  const totalCount     = activeTasks.length;
  const doneCount      = completedTasks.length;
  const progress       = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const isToday        = selectedDate === todayStr();

  const openNew  = () => { setEditingTask(null); setIsFormOpen(true); };
  const openEdit = t => { setEditingTask(t); setIsFormOpen(true); };

  const renderRows = list => list.map(task => (
    <TaskCard key={task.id} task={task}
      onToggle={handleToggle} onToggleSub={handleToggleSub}
      onEdit={openEdit}
      onDelete={setDeleteTarget}
      onCancel={handleCancel}
      hackathonName={hackathonNames[task.hackathon_id]}
    />
  ));

  return (
    <div ref={rootRef} className="h-full flex flex-col">
      <PageHeader title="Checklist" subtitle={formatDayFull(selectedDate)}
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={<>
          {!isToday && (
            <button onClick={() => setSelectedDate(todayStr())}
              className="btn-ghost h-8 px-2.5 rounded-lg text-[13px] cursor-pointer hidden sm:inline-flex items-center gap-1.5"
              title="Back to today">
              <RotateCcw size={12} /> Today
            </button>
          )}
          <div className="flex items-center rounded-lg border border-white/[0.08] h-8">
            <button onClick={() => shiftDate(-1)} className="icon-btn !h-full !rounded-r-none cursor-pointer" aria-label="Previous day">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setSelectedDate(todayStr())}
              className={`px-1 sm:px-2 text-[12.5px] font-medium tabular-nums min-w-[52px] sm:min-w-[92px] cursor-pointer whitespace-nowrap ${
                isToday ? 'text-slate-100' : 'text-slate-300 hover:text-slate-100'
              }`}
              title="Jump to today">
              {formatDisplayDate(selectedDate)}
            </button>
            <button onClick={() => shiftDate(1)} className="icon-btn !h-full !rounded-l-none cursor-pointer" aria-label="Next day">
              <ChevronRightIcon size={14} />
            </button>
          </div>
          <button
            onClick={openNew}
            className="btn-primary h-8 px-2.5 sm:px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5"
            title="New task" aria-label="New task">
            <Plus size={14} />
            <span className="hidden sm:inline">New task</span>
          </button>
        </>} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-6 space-y-5 reveal-stagger">

          {/* Progress for the day */}
          {totalCount > 0 && (
            <Card className="px-4 py-3.5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-slate-200 inline-flex items-center gap-1.5">
                    {progress === 100
                      ? <><Check size={13} className="text-emerald-400" /> All done</>
                      : `${allPending.length} left`}
                  </span>
                  <span className="text-[12px] text-slate-500 tabular-nums">
                    {doneCount}/{totalCount} · {progress}%
                  </span>
                </div>
                <Progress className="mt-2" value={progress / 100} tone={progress === 100 ? 'good' : 'neutral'} height={4} />
              </div>
              {allPending.length > 0 && (
                <button
                  onClick={handleMarkAllComplete}
                  disabled={markingAll}
                  title={`Mark all ${allPending.length} remaining task${allPending.length > 1 ? 's' : ''} as completed`}
                  className="btn-ghost h-8 px-2.5 sm:px-3 rounded-lg text-[13px] inline-flex items-center gap-1.5 shrink-0
                    cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  <CheckCheck size={14} />
                  <span className="hidden sm:inline">{markingAll ? 'Marking…' : 'Mark all done'}</span>
                  <span className="sm:hidden">{markingAll ? '…' : 'All done'}</span>
                </button>
              )}
            </Card>
          )}

          {/* Daily log — Review can say how much got done but never what
              happened, and this is where "what happened" gets recorded. */}
          <div className="panel flex items-center gap-2.5 px-3.5 h-11">
            <NotebookPen size={14} className="text-slate-500 shrink-0" />
            <input
              value={dayNote}
              onChange={e => onNoteChange(e.target.value)}
              placeholder="One line about this day…"
              aria-label="Note for this day"
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-slate-200 placeholder:text-slate-500"
            />
            {dayNote.trim() && (
              <span className="text-[11.5px] text-slate-500 shrink-0">Saved</span>
            )}
          </div>

          {totalCount === 0 ? (
            <Card>
              <Empty icon={ListChecks} title="No tasks for this day"
                body="Add a one-off task or set up recurring ones to see them here."
                action={
                  <button onClick={openNew}
                    className="btn-primary h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
                    <Plus size={14} /> Add first task
                  </button>
                } />
            </Card>
          ) : (
            <>
              {/* Pending tasks — single unified list */}
              {allPending.length > 0 && (
                <Card className="overflow-hidden">
                  <CardHeader icon={ListChecks} title="To do" meta={allPending.length} />
                  <ul className="pb-1.5">{renderRows(allPending)}</ul>
                </Card>
              )}

              {/* Completed */}
              {completedTasks.length > 0 && (
                <Card className="overflow-hidden">
                  <CardHeader icon={CheckCheck} title="Completed" meta={completedTasks.length} />
                  <ul className="pb-1.5">{renderRows(completedTasks)}</ul>
                </Card>
              )}

              {/* Cancelled Today */}
              {cancelledToday.length > 0 && (
                <Card className="overflow-hidden">
                  <CardHeader icon={EyeOff} title="Cancelled today" meta={cancelledToday.length} />
                  <ul className="pb-1.5">
                    {cancelledToday.map(task => (
                      <li key={task.id} className="flex items-center justify-between gap-3 px-4 h-11 hover:bg-white/[0.02] transition-colors">
                        <span className="text-[13px] text-slate-500 line-through truncate min-w-0">{task.title}</span>
                        <button
                          onClick={() => handleUncancel(task.id)}
                          className="btn-ghost h-7 px-2.5 rounded-md text-[12px] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                          title="Restore task"
                        >
                          <RotateCcw size={11} />
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <TaskFormModal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTask(null); }}
        onSave={handleSave}
        editingTask={editingTask}
        defaultDate={selectedDate}
        showToast={showToast}
        applications={applications}
      />
      <DeleteModal
        task={deleteTarget}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
