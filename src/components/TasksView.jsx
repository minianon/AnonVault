import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Edit3, X, ChevronDown,
  Check, Sun, Moon, RotateCcw,
  ChevronLeft, ChevronRight as ChevronRightIcon, Repeat2,
  ListChecks, Sparkles, Minus, ArrowDown, EyeOff, Lock, Menu, CheckCheck
} from 'lucide-react';
import {
  getTasksForDate, addTask, updateTask, deleteTask,
  toggleTaskCompletion, toggleSubtaskCompletion
} from '../services/tasks';

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
  high:   { label: 'High',   color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/25',  dot: 'bg-rose-400',   cardBorder: 'border-rose-500/35', glowClass: 'glow-high'   },
  medium: { label: 'Medium', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/25', dot: 'bg-amber-400',  cardBorder: 'border-amber-500/30', glowClass: 'glow-medium' },
  low:    { label: 'Low',    color: 'text-slate-400',  bg: 'bg-white/[0.04]',  border: 'border-white/[0.08]', dot: 'bg-slate-500',  cardBorder: 'border-white/[0.08]', glowClass: ''  },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RECUR_OPTS = [
  { value: 'daily',    label: 'Every Day'         },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekends', label: 'Weekends (Sat–Sun)' },
  { value: 'weekly',   label: 'Weekly (Custom)'   }
];

/* ── Checkbox ────────────────────────────────────────────── */
function Checkbox({ checked, onChange, size = 'md', disabled = false }) {
  const sz = size === 'sm' ? 'w-[18px] h-[18px]' : 'w-[22px] h-[22px]';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={e => { e.stopPropagation(); if (!disabled) onChange(); }}
      className={`${sz} rounded-lg flex items-center justify-center flex-shrink-0
        transition-all duration-300 select-none focus:outline-none relative overflow-hidden
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
        ${checked
          ? 'text-emerald-400'
          : disabled ? '' : 'hover:border-violet-500/50 hover:bg-violet-500/[0.05]'
        }`}
      style={{
        background: checked
          ? 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.1) 100%)'
          : 'rgba(255,255,255,0.025)',
        border: checked
          ? '1px solid rgba(16,185,129,0.5)'
          : '1px solid rgba(100,116,139,0.35)',
        boxShadow: checked ? '0 0 14px rgba(16,185,129,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
      }}
    >
      {/* Fill shimmer on check */}
      {checked && (
        <span className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)' }}
        />
      )}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-[58%] h-[58%]"
        style={{
          opacity: checked ? 1 : 0,
          transform: checked ? 'scale(1)' : 'scale(0.5)',
          transition: 'opacity 0.25s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          filter: checked ? 'drop-shadow(0 0 3px rgba(16,185,129,0.6))' : 'none',
        }}
      >
        <polyline
          points="20 6 9 17 4 12"
          className="checkbox-draw-path"
          style={{ strokeDashoffset: checked ? 0 : 20 }}
        />
      </svg>
    </button>
  );
}

/* ── Task card with linktree thread ─────────────────────── */
function TaskCard({ task, onToggle, onToggleSub, onEdit, onDelete, onCancel, index = 0 }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasSubtasks  = task.subtasks && task.subtasks.length > 0;
  const completedSubs = hasSubtasks ? task.subtasks.filter(s => s.completed).length : 0;
  const allSubsDone  = hasSubtasks && completedSubs === task.subtasks.length;
  const p            = PRIORITY_META[task.priority] || PRIORITY_META.low;
  const showThread   = hasSubtasks && !collapsed;

  return (
    <div
      className={`relative rounded-2xl overflow-hidden group
        glass-card border ${p.cardBorder} ${
          task.completed ? 'opacity-50 scale-[0.99] border-white/[0.04]' : (
            task.priority === 'high' ? p.glowClass : ''
          )
        }`}
      style={{ animationDelay: `${index * 55}ms` }}
    >

      {/* ── Main task row ── */}
      <div className="flex items-start gap-0 p-4 pb-0">

        {/* Left: checkbox */}
        <div className="mr-3 shrink-0 mt-0.5">
          <Checkbox
            checked={task.completed}
            onChange={() => onToggle(task)}
            disabled={false}
          />
        </div>

        {/* Right: task title + meta + actions */}
        <div className="flex-1 min-w-0 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <span className={`inline-block text-[14px] font-semibold leading-snug strikethrough-draw transition-all ${
                task.completed ? 'strikethrough-completed text-slate-500' : 'text-white'
              }`}>
                {task.title}
              </span>
              {/* Subtask progress summary */}
              {hasSubtasks && (
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="w-20 h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        allSubsDone ? 'bg-emerald-500' : p.dot.replace('bg-', 'bg-')
                      }`}
                      style={{ width: `${(completedSubs / task.subtasks.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-600 font-medium tabular-nums">
                    {completedSubs}/{task.subtasks.length} subtasks
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); setCollapsed(c => !c); }}
                    className="text-slate-700 hover:text-slate-400 transition-colors cursor-pointer"
                    title={collapsed ? 'Expand' : 'Collapse'}
                  >
                    <ChevronDown size={11} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                  </button>
                </div>
              )}
            </div>

            {/* Badges + Action buttons — always show badges, actions appear on hover */}
            <div className="flex items-center gap-1 shrink-0 mt-0.5">
              {/* Priority badge */}
              {task.priority !== 'low' && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full
                  text-[9px] font-bold border ${p.bg} ${p.border} ${p.color}`}>

                  {p.label}
                </span>
              )}
              {/* Recurring badge */}
              {task.is_recurring && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full
                  text-[9px] font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Repeat2 size={8} />
                  {task.recurrence === 'daily'    ? 'Daily'    :
                   task.recurrence === 'weekdays' ? 'Weekdays' :
                   task.recurrence === 'weekends' ? 'Weekends' : 'Weekly'}
                </span>
              )}
              {/* Edit / Delete — visible on hover */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); onCancel(task); }}
                  className="p-1.5 text-slate-650 hover:text-amber-400 rounded-lg hover:bg-amber-500/[0.08] transition-all cursor-pointer"
                  title="Cancel for today"
                >
                  <EyeOff size={12} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onEdit(task); }}
                  className="p-1.5 text-slate-600 hover:text-indigo-400 rounded-lg hover:bg-indigo-500/[0.08] transition-all cursor-pointer"
                  title="Edit"
                >
                  <Edit3 size={12} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(task); }}
                  className="p-1.5 text-slate-600 hover:text-rose-400 rounded-lg hover:bg-rose-500/[0.08] transition-all cursor-pointer"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Subtask list ── */}
      {showThread && (
        <div className="pb-3 pl-9 pr-4 space-y-1.5">
          {task.subtasks.map(st => (
            <div key={st.id} className="flex items-center gap-2">
              <Checkbox
                checked={st.completed}
                onChange={() => onToggleSub(task, st.id)}
                size="sm"
              />
              <span className={`inline-block text-[12.5px] leading-snug strikethrough-draw transition-all ${
                st.completed ? 'strikethrough-completed text-slate-500' : 'text-slate-300'
              }`}>
                {st.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Priority selector ───────────────────────────────────── */
function PrioritySelector({ value, onChange }) {
  const opts = [
    { value: 'high',   label: 'High',   icon: null,                active: 'bg-rose-500/15 border-rose-500/40 text-rose-300',   base: 'text-slate-500 border-white/[0.07] hover:border-rose-500/25 hover:text-rose-400'   },
    { value: 'medium', label: 'Medium', icon: <Minus size={11} />,    active: 'bg-amber-500/15 border-amber-500/40 text-amber-300', base: 'text-slate-500 border-white/[0.07] hover:border-amber-500/25 hover:text-amber-400' },
    { value: 'low',    label: 'Low',    icon: <ArrowDown size={11} />, active: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300', base: 'text-slate-500 border-white/[0.07] hover:border-indigo-500/25 hover:text-indigo-400' },
  ];
  return (
    <div className="flex gap-2">
      {opts.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl
            text-[12px] font-semibold transition-all cursor-pointer border
            ${value === o.value ? o.active : `bg-white/[0.025] ${o.base}`}`}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Task Form Modal ─────────────────────────────────────── */
function TaskFormModal({ isOpen, onClose, onSave, editingTask, defaultDate, showToast }) {
  const [title,         setTitle]         = useState('');
  const [priority,      setPriority]      = useState('medium');
  const [isRecurring,   setIsRecurring]   = useState(false);
  const [recurrence,    setRecurrence]    = useState('daily');
  const [recurrenceDays, setRecurrenceDays] = useState([]);
  const [taskDate,      setTaskDate]      = useState(defaultDate || todayStr());
  const [subtasks,      setSubtasks]      = useState([]);
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
    } else {
      setTitle(''); setPriority('medium'); setIsRecurring(false);
      setRecurrence('daily'); setRecurrenceDays([]);
      setTaskDate(defaultDate || todayStr()); setSubtasks([]);
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
             date: isRecurring ? null : taskDate, subtasks: subtasks.filter(s => s.title.trim()) });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-surface w-full max-w-lg rounded-2xl flex flex-col overflow-hidden max-h-[92vh]"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[15px] font-bold text-white">{editingTask ? 'Edit Task' : 'New Task'}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{editingTask ? 'Update task details' : 'Add to your checklist'}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2 rounded-lg cursor-pointer"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Task Title <span className="text-rose-400">*</span>
            </label>
            <input autoFocus type="text" placeholder="e.g. Review pull requests"
              value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="input-premium w-full px-4 py-2.5 text-[13px] rounded-xl font-semibold placeholder:text-slate-700" />
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Priority</label>
            <PrioritySelector value={priority} onChange={setPriority} />
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.025] border border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Repeat2 size={14} className="text-indigo-400" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">Recurring Task</p>
                <p className="text-[11px] text-slate-500">Repeats on a schedule</p>
              </div>
            </div>
            <button type="button" onClick={() => setIsRecurring(p => !p)}
              className={`w-11 h-6 rounded-full transition-all cursor-pointer relative ${isRecurring ? 'bg-indigo-500' : 'bg-slate-700'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isRecurring ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          {/* Recurring / date options */}
          {isRecurring ? (
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Frequency</label>
              <div className="grid grid-cols-2 gap-2">
                {RECUR_OPTS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setRecurrence(opt.value)}
                    className={`px-3 py-2.5 rounded-xl text-[12px] font-semibold text-left transition-all cursor-pointer border ${
                      recurrence === opt.value
                        ? 'bg-indigo-500/15 border-indigo-500/35 text-indigo-300'
                        : 'bg-white/[0.025] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:border-white/[0.1]'
                    }`}>{opt.label}
                  </button>
                ))}
              </div>
              {recurrence === 'weekly' && (
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">On these days</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAY_LABELS.map((label, i) => (
                      <button key={i} type="button" onClick={() => toggleDay(i)}
                        className={`w-10 h-10 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                          recurrenceDays.includes(i)
                            ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                            : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300'
                        }`}>{label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Date <span className="text-rose-400">*</span>
              </label>
              <input type="date" value={taskDate} onChange={e => setTaskDate(e.target.value)}
                className="input-premium w-full px-4 py-2.5 text-[13px] rounded-xl font-semibold placeholder:text-slate-700 cursor-pointer" />
            </div>
          )}

          {/* Subtasks */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Subtasks</label>
            <div className="space-y-1.5">
              {subtasks.map((st, i) => (
                <div key={st.id || i} className="flex items-center gap-2 px-3 py-2 bg-white/[0.025]
                  border border-white/[0.06] rounded-xl group/strow">
                  {/* mini thread dot */}
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
                  <span className="text-[12.5px] text-slate-300 flex-1 min-w-0 truncate">{st.title}</span>
                  <button type="button"
                    onClick={() => setSubtasks(prev => prev.filter((_, idx) => idx !== i))}
                    className="p-1 text-slate-700 hover:text-rose-400 rounded-lg hover:bg-rose-500/[0.08] transition-all cursor-pointer shrink-0"
                    title="Delete subtask">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input ref={stInputRef} type="text" placeholder="Add subtask… (press Enter)"
                value={stInput} onChange={e => setStInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubtask())}
                className="input-premium flex-1 px-4 py-2.5 text-[13px] rounded-xl font-medium placeholder:text-slate-700" />
              <button type="button" onClick={addSubtask}
                className="btn-ghost px-3 py-2 rounded-xl text-[12px] font-semibold cursor-pointer shrink-0">
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.04] flex gap-3 shrink-0">
          <button type="button" onClick={onClose}
            className="btn-ghost flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Cancel</button>
          <button type="button" onClick={handleSave}
            className="btn-primary flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">
            {editingTask ? 'Save Changes' : 'Add Task'}
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
      <div className="modal-surface w-full max-w-sm rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <Trash2 size={16} className="text-rose-400" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-white">Delete Task</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">This cannot be undone</p>
          </div>
        </div>
        <p className="text-[13px] text-slate-400 leading-relaxed">
          Delete <span className="text-white font-semibold">"{task.title}"</span>?
          {task.is_recurring && ' This removes the recurring task and all its history.'}
        </p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="btn-ghost flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Keep It</button>
          <button onClick={onConfirm}
            className="btn-danger flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ── Section heading ─────────────────────────────────────── */
function SectionLabel({ label, count, color = 'text-slate-500', accentColor }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="flex items-center gap-2 shrink-0">
        {accentColor && (
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }} />
        )}
        <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${color}`}>
          {label}
        </p>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/[0.05] text-slate-500 tabular-nums">
          {count}
        </span>
      </div>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, transparent 100%)' }} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN VIEW
══════════════════════════════════════════════════════════ */
export default function TasksView({ theme, toggleTheme, showToast, onTasksChange, onLock, onMenuToggle }) {
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

  const refresh = useCallback(async () => {
    const fetched = await getTasksForDate(selectedDate);
    setTasks(fetched);
    onTasksChange?.();
  }, [selectedDate, onTasksChange]);


  useEffect(() => { refresh(); }, [refresh]);


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

  const activeTasks    = tasks.filter(t => !cancelledMap[t.id]?.[selectedDate]);
  const cancelledToday = tasks.filter(t => !!cancelledMap[t.id]?.[selectedDate]);

  const allPending     = sortByPriority(activeTasks.filter(t => !t.completed));
  const completedTasks = activeTasks.filter(t => t.completed);
  const totalCount     = activeTasks.length;
  const doneCount      = completedTasks.length;
  const progress       = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const isToday        = selectedDate === todayStr();

  return (
    <div className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ background: '#07060f' }}>
      <div className="workspace-aurora-glow workspace-glow-1" />
      <div className="workspace-aurora-glow workspace-glow-2" />

      {/* Header */}
      <header className="glass-header px-4 lg:px-7 py-4 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <button onClick={onMenuToggle}
            className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-white rounded-xl cursor-pointer flex items-center justify-center shrink-0 bg-white/[0.04] border border-white/[0.06] transition-all hover:bg-white/[0.07]">
            <Menu size={16} />
          </button>
          <div>
            <h2 className="text-[15px] lg:text-[17px] font-extrabold text-white tracking-tight leading-tight">Daily Checklist</h2>
            <p className="text-[10px] lg:text-[11px] text-slate-600 mt-0.5 font-medium">{formatDayFull(selectedDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onLock}
            className="btn-ghost p-2.5 rounded-xl cursor-pointer flex items-center justify-center"
            title="Lock workspace">
            <Lock size={13} className="text-slate-500 hover:text-rose-400 transition-colors" />
          </button>
          <button
            onClick={() => { setEditingTask(null); setIsFormOpen(true); }}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-[13px] font-bold rounded-xl cursor-pointer">
            <Plus size={14} />
            <span className="hidden sm:inline">New Task</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </header>

      {/* Date nav + progress */}
      <div className="px-4 lg:px-7 py-3 border-b border-white/[0.04] flex items-center justify-between gap-4 shrink-0 relative z-10"
        style={{ background: 'rgba(7,6,15,0.6)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-1.5">
          <button onClick={() => shiftDate(-1)}
            className="btn-ghost p-2 rounded-lg cursor-pointer transition-all">
            <ChevronLeft size={13} />
          </button>

          <div className="px-3 py-1.5 rounded-xl"
            style={{
              background: isToday ? 'rgba(56,189,248,0.10)' : 'rgba(255,255,255,0.05)',
              border: isToday ? '1px solid rgba(56,189,248,0.25)' : '1px solid rgba(255,255,255,0.07)',
            }}>
            <span className={`text-[13px] font-bold tracking-tight ${
              isToday ? 'text-sky-300' : 'text-slate-200'
            }`}>
              {formatDisplayDate(selectedDate)}
            </span>
          </div>

          <button onClick={() => shiftDate(1)}
            className="btn-ghost p-2 rounded-lg cursor-pointer transition-all">
            <ChevronRightIcon size={13} />
          </button>

          {!isToday && (
            <button onClick={() => setSelectedDate(todayStr())}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold
                text-sky-400 border border-sky-500/25 bg-sky-500/[0.07]
                hover:bg-sky-500/[0.12] rounded-xl transition-all cursor-pointer">
              <RotateCcw size={10} /> Today
            </button>
          )}
        </div>

        {totalCount > 0 && (
          <div className="flex items-center gap-3 shrink-0">
            {allPending.length > 0 && (
              <button
                onClick={handleMarkAllComplete}
                disabled={markingAll}
                title={`Mark all ${allPending.length} remaining task${allPending.length > 1 ? 's' : ''} as completed`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold
                  text-emerald-400 border border-emerald-500/25 bg-emerald-500/[0.07]
                  hover:bg-emerald-500/[0.13] hover:text-emerald-300 rounded-xl transition-all
                  cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                <CheckCheck size={11} />
                <span className="hidden sm:inline">{markingAll ? 'Marking…' : 'Mark All Done'}</span>
                <span className="sm:hidden">{markingAll ? '…' : 'All Done'}</span>
              </button>
            )}
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-20 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${progress}%`,
                    background: progress === 100
                      ? 'linear-gradient(90deg, #10b981, #34d399)'
                      : 'linear-gradient(90deg, #0ea5e9, #38bdf8)',
                    boxShadow: progress === 100
                      ? '0 0 8px rgba(16,185,129,0.5)'
                      : '0 0 8px rgba(56,189,248,0.4)',
                  }}
                />
              </div>
              <span className={`text-[11px] font-bold tabular-nums ${
                progress === 100 ? 'text-emerald-400' : 'text-slate-500'
              }`}>
                {doneCount}/{totalCount}
              </span>
            </div>
            {progress === 100 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400"
                style={{ animation: 'pulse 2s ease-in-out infinite' }}>
                <Sparkles size={10} /> All done!
              </span>
            )}
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-7 py-6 space-y-6 relative z-10">
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24 max-w-sm mx-auto">
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(56,189,248,0.10) 0%, rgba(14,165,233,0.06) 100%)',
                  border: '1px solid rgba(56,189,248,0.16)',
                  boxShadow: '0 0 28px rgba(56,189,248,0.06)',
                }}>
                <ListChecks size={26} className="text-sky-500/60" />
              </div>
              <div className="absolute inset-0 rounded-3xl"
                style={{ boxShadow: '0 0 0 8px rgba(124,58,237,0.04)', animation: 'pulse 3s ease-in-out infinite' }} />
            </div>
            <h3 className="text-[15px] font-bold text-slate-300 tracking-tight">No tasks for this day</h3>
            <p className="text-[12px] text-slate-600 mt-2 leading-relaxed font-medium">
              Add a one-off task or set up recurring ones to see them here.
            </p>
            <button
              onClick={() => { setEditingTask(null); setIsFormOpen(true); }}
              className="btn-primary mt-6 px-6 py-2.5 text-[13px] font-bold rounded-xl cursor-pointer">
              <Plus size={13} className="inline mr-1.5" />
              Add First Task
            </button>
          </div>
        ) : (
          <>
            {/* Pending tasks — single unified list */}
            {allPending.length > 0 && (
              <div className="space-y-3">
                <SectionLabel
                  label="To Do"
                  count={allPending.length}
                  color="text-slate-400"
                  accentColor="#38bdf8"
                />
                {allPending.map((task, idx) => (
                  <div key={task.id} className="card-animate-in" style={{ animationDelay: `${idx * 45}ms` }}>
                    <TaskCard task={task} index={idx}
                      onToggle={handleToggle} onToggleSub={handleToggleSub}
                      onEdit={t => { setEditingTask(t); setIsFormOpen(true); }}
                      onDelete={setDeleteTarget}
                      onCancel={handleCancel}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Completed */}
            {completedTasks.length > 0 && (
              <div className="space-y-3">
                <SectionLabel
                  label="Completed"
                  count={completedTasks.length}
                  color="text-emerald-600"
                  accentColor="#10b981"
                />
                {completedTasks.map((task, idx) => (
                  <div key={task.id} className="card-animate-in" style={{ animationDelay: `${idx * 35}ms` }}>
                    <TaskCard task={task} index={idx}
                      onToggle={handleToggle} onToggleSub={handleToggleSub}
                      onEdit={t => { setEditingTask(t); setIsFormOpen(true); }}
                      onDelete={setDeleteTarget}
                      onCancel={handleCancel}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Cancelled Today */}
            {cancelledToday.length > 0 && (
              <div className="space-y-3 opacity-40 hover:opacity-75 transition-opacity">
                <SectionLabel label="Cancelled Today" count={cancelledToday.length} />
                {cancelledToday.map(task => (
                  <div key={task.id} className="flex items-center justify-between p-4 bg-white/[0.015] border border-white/[0.04] rounded-2xl">
                    <span className="text-[13px] text-slate-500 line-through truncate font-medium">{task.title}</span>
                    <button
                      onClick={() => handleUncancel(task.id)}
                      className="px-3 py-1.5 text-indigo-400 hover:text-indigo-300 border border-indigo-500/15 bg-indigo-500/[0.04] hover:bg-indigo-500/[0.08] rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-bold"
                      title="Restore Task"
                    >
                      <RotateCcw size={10} />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Fix the high priority edit handler missing setIsFormOpen */}
      <TaskFormModal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTask(null); }}
        onSave={handleSave}
        editingTask={editingTask}
        defaultDate={selectedDate}
        showToast={showToast}
      />
      <DeleteModal
        task={deleteTarget}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
