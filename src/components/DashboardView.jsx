import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, CheckSquare, Star, Quote, Calendar, AlertTriangle, 
  MapPin, Clock, ExternalLink, ChevronRight, Tag, Lightbulb, Code2, LinkIcon,
  Circle, CheckCircle2, ChevronDown, Repeat2, CheckCheck
} from 'lucide-react';
import { getTasksForDate, toggleTaskCompletion, toggleSubtaskCompletion } from '../services/tasks';
import { formatDate, getStatusStyles } from '../utils/helpers';

const PRIORITY_META = {
  high:   { label: 'High',   color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/25',  dot: 'bg-rose-450',   cardBorder: 'border-rose-500/35', glowClass: 'glow-high'   },
  medium: { label: 'Medium', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/25', dot: 'bg-amber-450',  cardBorder: 'border-amber-500/30', glowClass: 'glow-medium' },
  low:    { label: 'Low',    color: 'text-slate-450',  bg: 'bg-white/[0.04]',  border: 'border-white/[0.08]', dot: 'bg-slate-500',  cardBorder: 'border-white/[0.08]', glowClass: ''  },
};

const getDaysRemaining = (deadline) => {
  if (!deadline) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  const diffTime = target - today;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

const getDaysRemainingText = (days) => {
  if (days === 999) return 'No Deadline';
  if (days < 0) return 'Deadline Passed';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
};

function Checkbox({ checked, onChange, size = 'md', disabled = false }) {
  const sz = size === 'sm' ? 'w-[16px] h-[16px]' : 'w-[20px] h-[20px]';
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

function DashboardTaskCard({ task, onToggle, onToggleSub, index = 0 }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasSubtasks  = task.subtasks && task.subtasks.length > 0;
  const completedSubs = hasSubtasks ? task.subtasks.filter(s => s.completed).length : 0;
  const allSubsDone  = hasSubtasks && completedSubs === task.subtasks.length;
  const p            = PRIORITY_META[task.priority] || PRIORITY_META.low;
  const showThread   = hasSubtasks && !collapsed;

  return (
    <div
      className={`relative rounded-xl overflow-hidden group
        glass-card border ${p.cardBorder} ${
          task.completed 
            ? 'opacity-50 scale-[0.99] border-white/[0.04]' 
            : `hover:-translate-y-[1.5px] hover:shadow-lg hover:shadow-black/25 hover:border-white/[0.12] ${task.priority === 'high' ? p.glowClass : ''}`
        } transition-all duration-300`}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      {/* Main task row */}
      <div className="flex items-start gap-0 p-3 pb-0">
        {/* Left: checkbox */}
        <div className="mr-2.5 shrink-0 mt-0.5">
          <Checkbox
            checked={task.completed}
            onChange={() => onToggle(task)}
          />
        </div>

        {/* Right: title + metadata */}
        <div className="flex-1 min-w-0 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <span className={`inline-block text-[12.5px] font-semibold leading-snug strikethrough-draw transition-all ${
                task.completed ? 'strikethrough-completed text-slate-500' : 'text-white'
              }`}>
                {task.title}
              </span>
              {/* Subtask progress summary */}
              {hasSubtasks && (
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="w-16 h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        allSubsDone ? 'bg-emerald-500' : p.dot
                      }`}
                      style={{ width: `${(completedSubs / task.subtasks.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-650 font-medium tabular-nums">
                    {completedSubs}/{task.subtasks.length} subtasks
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); setCollapsed(c => !c); }}
                    className="text-slate-600 hover:text-slate-400 transition-colors cursor-pointer"
                    title={collapsed ? 'Expand' : 'Collapse'}
                  >
                    <ChevronDown size={10} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                  </button>
                </div>
              )}
            </div>

            {/* Badges */}
            <div className="flex items-center gap-1 shrink-0 mt-0.5">
              {task.priority !== 'low' && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full
                  text-[8px] font-bold border ${p.bg} ${p.border} ${p.color}`}>
                  {p.label}
                </span>
              )}
              {task.is_recurring && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full
                  text-[8px] font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Repeat2 size={8} />
                  {task.recurrence === 'daily'    ? 'Daily'    :
                   task.recurrence === 'weekdays' ? 'Weekdays' :
                   task.recurrence === 'weekends' ? 'Weekends' : 'Weekly'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Subtask list */}
      {showThread && (
        <div className="pb-3 pl-8.5 pr-3 space-y-1.5">
          {task.subtasks.map(st => (
            <div key={st.id} className="flex items-center gap-2">
              <Checkbox
                checked={st.completed}
                onChange={() => onToggleSub(task, st)}
                size="sm"
              />
              <span className={`inline-block text-[11.5px] leading-snug strikethrough-draw transition-all ${
                st.completed ? 'strikethrough-completed text-slate-500' : 'text-slate-350'
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

export default function DashboardView({ 
  applications, 
  ideas, 
  projectIdeas, 
  quotes,
  onTasksChange,
  tasksVersion,
  setActiveTab,
  onMenuToggle,
  onSelectIdea,
  onSelectProject,
  onSelectHackathon
}) {
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [todayStr, setTodayStr] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // 1. Get today's date string & start clock timer
  useEffect(() => {
    const d = new Date();
    const formatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setTodayStr(formatted);

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Load today's tasks
  const loadTodayTasks = useCallback(async (showSpinner = true) => {
    if (!todayStr) return;
    if (showSpinner) setTasksLoading(true);
    try {
      const list = await getTasksForDate(todayStr);
      setTasks(list);
    } catch (err) {
      console.error('Failed to load today tasks:', err);
    } finally {
      if (showSpinner) setTasksLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    loadTodayTasks();
  }, [loadTodayTasks]);

  // Refetch when tasks are mutated anywhere (e.g. the Checklist tab). Skips the
  // first run so it does not duplicate the mount fetch above, and refetches
  // without the spinner so the widget does not flash on every toggle.
  const seenVersion = useRef(tasksVersion);
  useEffect(() => {
    if (seenVersion.current === tasksVersion) return;
    seenVersion.current = tasksVersion;
    loadTodayTasks(false);
  }, [tasksVersion, loadTodayTasks]);

  // 3. Handle task toggles
  const handleToggleTask = async (task) => {
    try {
      const nextVal = await toggleTaskCompletion(task, todayStr);
      setTasks(prev => prev.map(t => t.id === task.id ? { 
        ...t, 
        completed: nextVal,
        subtasks: (t.subtasks || []).map(st => ({ ...st, completed: nextVal }))
      } : t));
      onTasksChange?.();
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleToggleSubtask = async (task, subtask) => {
    try {
      const nextVal = await toggleSubtaskCompletion(task, subtask.id, todayStr);
      setTasks(prev => prev.map(t => {
        if (t.id !== task.id) return t;
        const nextSubs = (t.subtasks || []).map(st => st.id === subtask.id ? { ...st, completed: nextVal } : st);
        const allDone = nextSubs.length > 0 && nextSubs.every(s => s.completed);
        return { ...t, subtasks: nextSubs, completed: allDone };
      }));
      onTasksChange?.();
    } catch (err) {
      console.error('Failed to toggle subtask:', err);
    }
  };

  // 3b. Mark every remaining task for today as completed
  //     (pendingCount is already derived further down, just before the return)
  const handleMarkAllComplete = async () => {
    const pending = tasks.filter(t => !t.completed);
    if (pending.length === 0) return;

    setMarkingAll(true);
    setTasks(prev => prev.map(t => t.completed ? t : {
      ...t,
      completed: true,
      subtasks: (t.subtasks || []).map(st => ({ ...st, completed: true }))
    }));

    try {
      for (const task of pending) {
        await toggleTaskCompletion(task, todayStr);
      }
      onTasksChange?.();
    } catch (err) {
      console.error('Failed to mark all tasks complete:', err);
      await loadTodayTasks(false);
    }
    setMarkingAll(false);
  };

  // 4. Deterministic Daily Quote
  const getDailyQuote = () => {
    if (!quotes || quotes.length === 0) return null;
    const d = new Date();
    const dayHash = d.getFullYear() * 1000 + (d.getMonth() + 1) * 32 + d.getDate();
    return quotes[dayHash % quotes.length];
  };
  const dailyQuote = getDailyQuote();

  // 5. Pinned / Upcoming Hackathons
  const getDashboardHackathons = () => {
    const active = (applications || []).filter(app => app.status !== 'rejected');
    const pinned = active.filter(app => app.priority === 'high');
    if (pinned.length > 0) return pinned.slice(0, 2);
    
    // Fallback: Closest upcoming deadline (non-expired)
    const upcoming = active.filter(app => getDaysRemaining(app.deadline) >= 0);
    const sorted = [...upcoming].sort((a, b) => {
      const daysA = getDaysRemaining(a.deadline);
      const daysB = getDaysRemaining(b.deadline);
      return daysA - daysB;
    });
    return sorted.slice(0, 1);
  };
  const summaryHackathons = getDashboardHackathons();

  // 6. Pinned Ideas
  const getPinnedIdeas = () => {
    const pinnedIds = JSON.parse(localStorage.getItem('anonvault_ideas_pinned') || '[]');
    return (ideas || []).filter(idea => pinnedIds.includes(idea.id)).slice(0, 3);
  };
  const pinnedIdeas = getPinnedIdeas();

  // 7. Pinned Project Ideas
  const getPinnedProjects = () => {
    const pinnedIds = JSON.parse(localStorage.getItem('anonvault_project_ideas_pinned') || '[]');
    return (projectIdeas || []).filter(proj => pinnedIds.includes(proj.id)).slice(0, 3);
  };
  const pinnedProjects = getPinnedProjects();

  // Helper date text formatter
  const getFormattedDate = () => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return currentTime.toLocaleDateString(undefined, options);
  };

  const getFormattedTime = () => {
    return currentTime.toLocaleTimeString(undefined, { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    });
  };

  const pendingCount = tasks.filter(t => !t.completed).length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(2,6,23,0.98) 0%, rgba(7,10,30,0.99) 100%)' }}>
      {/* Top Header */}
      <header className="px-8 py-4 border-b border-white/[0.04] flex items-center justify-between shrink-0" style={{ background: 'rgba(2,6,23,0.6)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center gap-3">
          <button onClick={onMenuToggle} className="lg:hidden p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/[0.05] transition-all">
            <LayoutDashboard size={20} />
          </button>
          <h1 className="text-[15px] font-extrabold tracking-tight" style={{ background: 'linear-gradient(135deg, #fff 0%, #bae6fd 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Workspace Dashboard
          </h1>
        </div>

        {/* Date + Live time */}
        <div className="flex items-center gap-3 px-5 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-semibold text-white/70 leading-none">
              {currentTime.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/25 mt-0.5">
              {currentTime.toLocaleDateString(undefined, { weekday: 'long' })}
            </span>
          </div>
          <div className="w-px h-5 bg-white/[0.06]" />
          <div className="flex items-center gap-2 font-mono tabular-nums">
            <span className="text-[14px] font-bold text-white tracking-widest leading-none">
              {currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <span className="text-[14px] font-bold leading-none" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {String(currentTime.getSeconds()).padStart(2, '0')}
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <div className="flex-1 overflow-y-auto px-8 py-7 space-y-5 custom-scrollbar">
        
        {/* Daily Quote Card */}
        <div 
          className="group/quoteview relative rounded-2xl p-[1px] transition-all duration-500 select-none overflow-hidden"
          style={{ boxShadow: '0 0 40px -8px rgba(244, 63, 94, 0.1), 0 1px 0 rgba(255,255,255,0.03) inset' }}
        >
          <div 
            className="absolute inset-[-150%] opacity-15 group-hover/quoteview:opacity-35 transition-opacity duration-500 pointer-events-none"
            style={{
              background: 'conic-gradient(from 0deg at 50% 50%, transparent 40%, #f43f5e 50%, transparent 60%)',
              animation: 'rotateGlow 8s linear infinite',
            }}
          />

          <div className="relative rounded-[15px] px-7 py-5 overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(10,14,30,0.98) 0%, rgba(5,8,20,0.99) 100%)' }}>
            {/* Large decorative quote mark */}
            <div className="absolute top-3 right-5 text-[88px] leading-none font-serif text-rose-500/[0.05] pointer-events-none select-none" style={{ fontFamily: 'Georgia, serif' }}>&ldquo;</div>
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.2)' }}>
                  <Quote size={10} className="text-rose-400" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-rose-500/60">Quote of the Day</span>
              </div>
              <button onClick={() => setActiveTab('quotes')} className="text-[10px] text-slate-600 hover:text-rose-400 font-semibold flex items-center gap-0.5 cursor-pointer transition-colors relative z-10">
                Manage <ChevronRight size={10} />
              </button>
            </div>

            {dailyQuote ? (
              <div className="relative z-10">
                <p className="text-[14.5px] font-light text-slate-200 italic leading-[1.7] tracking-[0.01em]" style={{ fontFamily: '"Georgia", "Times New Roman", serif' }}>
                  &ldquo;{dailyQuote.text}&rdquo;
                </p>
                {dailyQuote.author && dailyQuote.author.trim() !== '' && dailyQuote.author !== 'Unknown' && dailyQuote.author.toLowerCase() !== 'unknown' && (
                  <p className="text-[10.5px] font-semibold text-rose-400/70 mt-3 tracking-wide">— {dailyQuote.author}</p>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-slate-600 italic relative z-10">Add quotes in the Quotes Vault to see them rotate here daily.</p>
            )}
          </div>
        </div>

        {/* Action Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          
          {/* Left Side: Daily Checklist */}
          <div 
            className="group/checklistwidget relative rounded-2xl p-[1px] transition-all duration-500 select-none overflow-hidden flex flex-col h-[490px]"
            style={{ boxShadow: '0 0 40px -8px rgba(56, 189, 248, 0.08), 0 1px 0 rgba(255,255,255,0.03) inset' }}
          >
            <div 
              className="absolute inset-[-150%] opacity-12 group-hover/checklistwidget:opacity-28 transition-opacity duration-500 pointer-events-none"
              style={{
                background: 'conic-gradient(from 0deg at 50% 50%, transparent 40%, #38bdf8 50%, transparent 60%)',
                animation: 'rotateGlow 7s linear infinite',
              }}
            />

            {/* Inner Content Card */}
            <div className="relative rounded-[15px] flex-1 flex flex-col h-full overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(10,14,30,0.98) 0%, rgba(5,8,20,0.99) 100%)' }}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3.5 border-b" style={{ borderColor: 'rgba(56,189,248,0.06)' }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.18)' }}>
                  <CheckSquare size={12} className="text-sky-400" />
                </div>
                <h3 className="text-[13px] font-bold text-white tracking-tight">Today's Checklist</h3>
              </div>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <button
                    onClick={handleMarkAllComplete}
                    disabled={markingAll}
                    title={`Mark all ${pendingCount} remaining task${pendingCount > 1 ? 's' : ''} as completed`}
                    className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300
                      flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition-all
                      disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)' }}>
                    <CheckCheck size={10} />
                    {markingAll ? 'Marking…' : 'Mark all done'}
                  </button>
                )}
                <button onClick={() => setActiveTab('tasks')} className="text-[10px] text-slate-600 hover:text-sky-400 font-semibold flex items-center gap-0.5 cursor-pointer transition-colors">
                  Manage <ChevronRight size={10} />
                </button>
              </div>
            </div>

            {/* Checklist Progress Bar */}
            {tasks.length > 0 && (() => {
              const totalChecklist = tasks.length;
              const completedChecklist = tasks.filter(t => t.completed).length;
              const checklistPercent = totalChecklist > 0 ? Math.round((completedChecklist / totalChecklist) * 100) : 0;
              return (
                <div className="mx-4 mt-3 mb-3 rounded-xl p-3" style={{ background: 'rgba(56,189,248,0.03)', border: '1px solid rgba(56,189,248,0.07)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-600">Progress</span>
                    <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color: checklistPercent === 100 ? '#34d399' : '#38bdf8' }}>{checklistPercent}%</span>
                  </div>
                  <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div 
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${checklistPercent}%`, background: checklistPercent === 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #0ea5e9, #38bdf8)' }}
                    />
                  </div>
                </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5 custom-scrollbar">
              {tasksLoading ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  Loading checklist…
                </div>
              ) : tasks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-10">
                  <CheckSquare size={24} className="text-slate-700 animate-pulse mb-2.5" />
                  <p className="text-xs font-semibold text-slate-400">No tasks for today</p>
                  <p className="text-[10px] text-slate-600 mt-1 max-w-[200px]">Create daily schedules or one-off tasks in Checklist tab.</p>
                </div>
              ) : (
                [...tasks]
                  .sort((a, b) => {
                    if (a.completed && !b.completed) return 1;
                    if (!a.completed && b.completed) return -1;
                    return 0;
                  })
                  .map((task, index) => (
                    <DashboardTaskCard
                      key={task.id}
                      task={task}
                      onToggle={handleToggleTask}
                      onToggleSub={handleToggleSubtask}
                      index={index}
                    />
                  ))
              )}
            </div>
          </div>
        </div>

          {/* Right Side: Hackathons, Ideas, and Projects */}
          <div className="space-y-4 flex flex-col h-[490px] overflow-y-auto pr-1 custom-scrollbar">
            
            {/* Hackathons Panel */}
            <div 
              className="group/hackathonwidget relative rounded-2xl p-[1px] transition-all duration-500 select-none overflow-hidden"
              style={{ boxShadow: '0 0 30px -8px rgba(99, 102, 241, 0.08)' }}
            >
              <div 
                className="absolute inset-[-150%] opacity-10 group-hover/hackathonwidget:opacity-25 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: 'conic-gradient(from 0deg at 50% 50%, transparent 40%, #6366f1 50%, transparent 60%)',
                  animation: 'rotateGlow 9s linear infinite',
                }}
              />

              {/* Inner Content Card */}
              <div className="relative rounded-[15px] p-5 transition-all duration-300 flex flex-col" style={{ background: 'linear-gradient(160deg, rgba(10,14,30,0.98) 0%, rgba(5,8,20,0.99) 100%)' }}>
                <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: '1px solid rgba(99,102,241,0.07)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.18)' }}>
                      <Calendar size={12} className="text-indigo-400" />
                    </div>
                    <h4 className="text-[13px] font-bold text-white tracking-tight">Starred / Closest Hackathon</h4>
                  </div>
                  <button onClick={() => setActiveTab('timeline')} className="text-[10px] text-slate-600 hover:text-indigo-400 font-semibold flex items-center gap-0.5 cursor-pointer transition-colors">
                    Manage <ChevronRight size={10} />
                  </button>
                </div>

                {summaryHackathons.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">No active hackathons tracked.</p>
                ) : (
                  <div className="space-y-3">
                    {summaryHackathons.map(app => {
                      const days = getDaysRemaining(app.deadline);
                      const isExpired = days < 0;
                      const isUrgent = days >= 0 && days <= 4;
                      const remainingText = getDaysRemainingText(days);
                      const isStarred = app.priority === 'high';
                      const status = getStatusStyles(app.status);
                      
                      return (
                        <div 
                          key={app.id} 
                          onClick={() => onSelectHackathon?.(app.id)}
                          className="glass-card rounded-2xl cursor-pointer select-none group transition-all duration-300 tactile-item p-4 border border-white/[0.04] hover:border-white/[0.12] hover:bg-white/[0.03] hover:-translate-y-[1.5px] hover:shadow-lg hover:shadow-black/25"
                        >
                          {/* Top Date & Days Left Strip */}
                          <div className="flex items-center justify-between text-[11px] mb-3 pb-2.5 border-b border-white/[0.04]">
                            <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                              <Calendar size={11} className="text-indigo-400/80" />
                              {formatDate(app.deadline)}
                            </span>
                            <span className={`flex items-center gap-1 font-semibold tabular-nums ${
                              isExpired ? 'text-slate-600' :
                              isUrgent ? 'text-amber-400' : 'text-emerald-400'
                            }`}>
                              <Clock size={11} />
                              {remainingText}
                            </span>
                          </div>

                          {/* Title row */}
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                {isStarred && <span className="beacon-amber" />}
                                <h4 className="text-[14px] font-bold text-white leading-tight truncate group-hover:text-indigo-300 transition-colors">{app.name}</h4>
                              </div>
                              {app.company && (
                                <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">
                                  {app.company}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className={`inline-flex px-2 py-0.5 text-[9px] font-bold rounded-full border ${status.bg} ${status.text} ${status.border}`}>
                              {status.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Pinned Ideas Panel */}
            <div 
              className="group/ideaswidget relative rounded-2xl p-[1px] transition-all duration-500 select-none overflow-hidden"
              style={{ boxShadow: '0 0 30px -8px rgba(251,191,36,0.06)' }}
            >
              <div 
                className="absolute inset-[-150%] opacity-10 group-hover/ideaswidget:opacity-25 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: 'conic-gradient(from 0deg at 50% 50%, transparent 40%, #f59e0b 50%, transparent 60%)',
                  animation: 'rotateGlow 9s linear infinite',
                }}
              />

              {/* Inner Content Card */}
              <div className="relative rounded-[15px] p-5 transition-all duration-300 flex flex-col" style={{ background: 'linear-gradient(160deg, rgba(10,14,30,0.98) 0%, rgba(5,8,20,0.99) 100%)' }}>
                <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: '1px solid rgba(245,158,11,0.07)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.18)' }}>
                      <Lightbulb size={12} className="text-amber-400" />
                    </div>
                    <h4 className="text-[13px] font-bold text-white tracking-tight">Pinned Concepts</h4>
                  </div>
                  <button onClick={() => setActiveTab('ideas')} className="text-[10px] text-slate-600 hover:text-amber-400 font-semibold flex items-center gap-0.5 cursor-pointer transition-colors">
                    Manage <ChevronRight size={10} />
                  </button>
                </div>

                {pinnedIdeas.length === 0 ? (
                  <p className="text-[11.5px] text-slate-600 italic py-1">Pin important thoughts in the Idea Vault to display them here.</p>
                ) : (
                  <div className="divide-y divide-white/[0.03] -my-1">
                    {pinnedIdeas.map(idea => (
                      <div 
                        key={idea.id} 
                        onClick={() => onSelectIdea?.(idea.id)}
                        className="py-2.5 flex items-center justify-between gap-4 group/item cursor-pointer hover:bg-white/[0.03] px-3 -mx-2.5 rounded-xl transition-all hover:translate-x-0.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-slate-200 truncate group-hover/item:text-white transition-colors">{idea.title}</p>
                          {idea.category && <p className="text-[9.5px] text-slate-500 font-medium mt-0.5">#{idea.category}</p>}
                        </div>
                        <ChevronRight size={12} className="text-slate-655 group-hover/item:text-amber-400 transition-colors" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Pinned Projects Panel */}
            <div 
              className="group/projectswidget relative rounded-2xl p-[1px] transition-all duration-500 select-none overflow-hidden"
              style={{ boxShadow: '0 0 30px -8px rgba(56,189,248,0.06)' }}
            >
              <div 
                className="absolute inset-[-150%] opacity-10 group-hover/projectswidget:opacity-25 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: 'conic-gradient(from 0deg at 50% 50%, transparent 40%, #38bdf8 50%, transparent 60%)',
                  animation: 'rotateGlow 9s linear infinite',
                }}
              />

              {/* Inner Content Card */}
              <div className="relative rounded-[15px] p-5 transition-all duration-300 flex flex-col" style={{ background: 'linear-gradient(160deg, rgba(10,14,30,0.98) 0%, rgba(5,8,20,0.99) 100%)' }}>
                <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: '1px solid rgba(56,189,248,0.06)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.18)' }}>
                      <Code2 size={12} className="text-sky-400" />
                    </div>
                    <h4 className="text-[13px] font-bold text-white tracking-tight">Pinned Project Drafts</h4>
                  </div>
                  <button onClick={() => setActiveTab('project-ideas')} className="text-[10px] text-slate-600 hover:text-sky-400 font-semibold flex items-center gap-0.5 cursor-pointer transition-colors">
                    Manage <ChevronRight size={10} />
                  </button>
                </div>

                {pinnedProjects.length === 0 ? (
                  <p className="text-[11.5px] text-slate-600 italic py-1">Pin your active project blueprints to feature them here.</p>
                ) : (
                  <div className="divide-y divide-white/[0.03] -my-1">
                    {pinnedProjects.map(proj => (
                      <div 
                        key={proj.id} 
                        onClick={() => onSelectProject?.(proj.id)}
                        className="py-2.5 flex items-center justify-between gap-4 group/item cursor-pointer hover:bg-white/[0.03] px-3 -mx-2.5 rounded-xl transition-all hover:translate-x-0.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-slate-200 truncate group-hover/item:text-white transition-colors">{proj.title}</p>
                          {proj.category && <p className="text-[9.5px] text-slate-500 font-medium mt-0.5">#{proj.category}</p>}
                        </div>
                        <ChevronRight size={12} className="text-slate-655 group-hover/item:text-sky-400 transition-colors" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
      
      <style>{`
        @keyframes rotateGlow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        /* Custom thin scrollbars for dashboard widgets */
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.12);
        }
      `}</style>
    </div>
  );
}
