import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import { NAV } from './nav';
import TimelineView from './components/TimelineView';
import IdeasSection from './components/IdeasSection';
import TasksView from './components/TasksView';
import BoardView from './components/BoardView';
import QuotesView from './components/QuotesView';
import CalendarView from './components/CalendarView';
import DashboardView from './components/DashboardView';
import ReviewView from './components/ReviewView';
import CommandPalette from './components/CommandPalette';
import FocusView from './components/FocusView';
import MoneyView from './components/MoneyView';
import Logo from './components/Logo';
import { ToastProvider, useToast } from './components/Toast';
import GlobalTooltip from './components/GlobalTooltip';
import { Lock, LockOpen, Delete } from 'lucide-react';
import { 
  fetchApplications, 
  addApplication, 
  updateApplication, 
  deleteApplication,
  fetchProjectIdeas,
  getSupabaseClient
} from './services/supabase';
import { getTasksForDateSync, loadAllTasks, addTask } from './services/tasks';
import { syncNotes } from './services/journal';
import { transactions as moneyStore, incomeSources, investments, loans, incomeIdeas, emis, summarizeMonth, monthKey, formatMoney } from './services/money';
import { companies } from './services/work';
import { board, addItem as addBoardItem } from './services/board';
import { ideas as ideaStore, stepsIn } from './services/ideas';
import { quotes as quoteStore } from './services/quotes';
import { sessions as focusStore } from './services/focus';
import { meetings as meetingStore, meetingsOn } from './services/meetings';
import { syncPrefs } from './services/prefs';
import { onSyncIssue } from './services/syncStatus';

/**
 * Pull every other-device change into the local caches and push anything
 * that is still waiting. Each part is local-first and never rejects, so one
 * missing table can't stop the rest from syncing.
 */
function syncLocalFirstStores() {
  return Promise.all([
    ideaStore.sync(),
    loadAllTasks().catch(err => console.warn('Could not sync tasks:', err)),
    syncNotes(),
    syncPrefs(),
    moneyStore.sync(),
    focusStore.sync(),
    incomeSources.sync(),
    investments.sync(),
    loans.sync(),
    emis.sync(),
    incomeIdeas.sync(),
    companies.sync(),
    board.sync(),
    quoteStore.sync(),
    meetingStore.sync(),
  ]);
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 h-full flex items-center justify-center p-6">
          <div className="panel max-w-lg w-full p-6 space-y-4">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-100">This view hit an error</h2>
              <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
                Usually a missing table or column. Your data is safe — reload to try again.
              </p>
            </div>
            <pre className="p-3 text-[11.5px] font-mono text-rose-300 bg-black/30 rounded-lg overflow-x-auto border border-white/[0.06] whitespace-pre-wrap max-h-48">
              {this.state.error ? this.state.error.toString() : 'Unknown error'}
            </pre>
            <button onClick={() => window.location.reload()} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── access-granted briefing ────────────────────────────────────────
   Read straight from the localStorage caches, because the overlay runs
   before loadData() has fetched anything. Hackathons have no service-level
   cache of their own, so loadData writes APPS_CACHE_KEY for the next unlock
   to read; the very first unlock on a device shows 0 there.            */
const APPS_CACHE_KEY = 'anonvault_applications_cache';
const CONCEPTS_CACHE_KEY = 'anonvault_concepts_cache';

function computeBriefing() {
  const out = { tasksLeft: 0, doneToday: 0, totalToday: 0, dueThisWeek: 0, spentMonth: 0 };

  try {
    const stats = computeTaskStats();
    out.tasksLeft = stats.pending;
    out.doneToday = stats.completed;
    out.totalToday = stats.total;
  } catch { /* leave at 0 */ }

  try {
    const raw = localStorage.getItem(APPS_CACHE_KEY);
    const apps = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const weekOut = now + 7 * 86400000;
    out.dueThisWeek = apps.filter(a => {
      if (!a || !a.deadline || a.status === 'rejected') return false;
      const t = new Date(a.deadline).getTime();
      return t >= now && t <= weekOut;
    }).length;
  } catch { /* leave at 0 */ }

  try {
    out.spentMonth = summarizeMonth(moneyStore.getAll(), monthKey()).expense;
  } catch { /* leave at 0 */ }

  return out;
}

/* Counts run up to their value rather than snapping. */
function useCountUp(target, duration, delay) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = null;
    let start = null;
    const tick = ts => {
      if (start === null) start = ts;
      const progress = Math.min(1, (ts - start) / duration);
      setValue(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    const t = setTimeout(() => { raf = requestAnimationFrame(tick); }, delay);
    return () => {
      clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target, duration, delay]);
  return value;
}

function BriefingTile({ value, format = v => Math.round(v), label, delay, onJump }) {
  const shown = useCountUp(value, 900, delay);
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onJump(); }}
      className="group flex-1 min-w-0 px-4 py-3 text-left rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer fade-up"
      style={{ animationDelay: delay + 'ms' }}>
      <span className="block text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-slate-100">{format(shown)}</span>
      <span className="block text-[12px] text-slate-500 group-hover:text-slate-300 transition-colors mt-0.5">{label}</span>
    </button>
  );
}

/* ================= access-granted overlay ================= */
function AccessGranted({ onComplete }) {
  const [leaving, setLeaving] = useState(false);
  const [brief] = useState(computeBriefing);
  const [session] = useState(() => {
    const now = new Date();
    const h = now.getHours();
    return {
      greeting: h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night',
      day: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    };
  });

  const summary =
    brief.dueThisWeek > 0
      ? `${brief.dueThisWeek} deadline${brief.dueThisWeek > 1 ? 's' : ''} this week.`
      : brief.tasksLeft > 0
        ? `${brief.tasksLeft} task${brief.tasksLeft > 1 ? 's' : ''} left today.`
        : 'Nothing pressing. A clean slate.';

  const exitedRef = useRef(false);
  const timersRef = useRef([]);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const finish = useCallback(targetTab => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    timersRef.current.forEach(clearTimeout);
    setLeaving(true);
    timersRef.current = [setTimeout(() => onCompleteRef.current(targetTab), 180)];
  }, []);

  useEffect(() => {
    timersRef.current = [setTimeout(() => finish(), 1700)];
    const onKey = () => finish();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      timersRef.current.forEach(clearTimeout);
    };
  }, [finish]);

  const money = v => formatMoney(v, undefined, { compact: v >= 100000 });

  return (
    <div onClick={() => finish()}
      className="lock-bg absolute inset-0 z-[60] flex items-center justify-center cursor-pointer px-6"
      style={{ opacity: leaving ? 0 : 1, transition: 'opacity 0.18s ease-out', animation: 'fadeIn 0.25s ease-out both' }}>
      <div className="lock-grid" />
      <div className="relative w-full max-w-[440px]"
        style={{ transform: leaving ? 'translateY(-6px) scale(0.99)' : 'none', transition: 'transform 0.2s var(--ease)' }}>
        <p className="text-[13px] text-slate-500 fade-up">{session.day}</p>
        <h2 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.03em] text-slate-50 mt-1 fade-up" style={{ animationDelay: '40ms' }}>
          {session.greeting}.
        </h2>
        <p className="text-[15px] text-slate-400 mt-1 fade-up" style={{ animationDelay: '80ms' }}>{summary}</p>

        <div className="panel mt-7 p-1 flex divide-x divide-white/[0.06]">
          <BriefingTile value={brief.tasksLeft} label="Tasks left" delay={140} onJump={() => finish('tasks')} />
          <BriefingTile value={brief.dueThisWeek} label="Deadlines · 7d" delay={190} onJump={() => finish('timeline')} />
          <BriefingTile value={brief.spentMonth} format={money} label="Spent this month" delay={240} onJump={() => finish('money')} />
        </div>

        <div className="mt-6 h-px bg-white/[0.06] overflow-hidden rounded-full">
          <div className="h-full bg-slate-300 origin-left"
            style={{ animation: 'progressFill 1.5s cubic-bezier(0.65,0,0.35,1) 0.15s both' }} />
        </div>
        <p className="text-[12px] text-slate-600 mt-3">Press any key to skip</p>
      </div>
      <style>{'@keyframes progressFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }'}</style>
    </div>
  );
}

/* ================= lock screen ================= */
const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ']];

function LockScreen({ onAuthorize }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [shake, setShake] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [activeKey, setActiveKey] = useState(null);
  const [clock, setClock] = useState(() => new Date());
  // One quote for the lock screen, chosen per day from your saved quotes.
  const [quote] = useState(() => {
    try {
      const all = quoteStore.getAll();
      if (!all.length) return null;
      const d = new Date();
      return all[(d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % all.length];
    } catch { return null; }
  });

  const correctPin = import.meta.env.VITE_APP_PIN;
  const pinLength = correctPin ? String(correctPin).length : 4;

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 5000);
    return () => clearInterval(t);
  }, []);

  const flash = key => {
    setActiveKey(key);
    setTimeout(() => setActiveKey(k => (k === key ? null : k)), 140);
  };

  const press = digit => {
    if (unlocking || shake || !correctPin) return;
    flash(digit);
    setError(false);
    setPin(prev => {
      if (prev.length >= pinLength) return prev;
      const next = prev + digit;
      if (next.length === pinLength) {
        if (next === String(correctPin)) {
          setUnlocking(true);
          sessionStorage.setItem('minianon_authorized', 'true');
        } else {
          setTimeout(() => {
            setError(true);
            setShake(true);
            setErrorCount(c => c + 1);
            setTimeout(() => { setShake(false); setPin(''); }, 420);
          }, 140);
        }
      }
      return next;
    });
  };

  const backspace = () => {
    if (unlocking || shake) return;
    flash('back');
    setPin(p => p.slice(0, -1));
    setError(false);
  };
  const clear = () => {
    if (unlocking) return;
    setPin('');
    setError(false);
  };

  useEffect(() => {
    const onKey = e => {
      if (unlocking) return;
      if (e.key >= '0' && e.key <= '9') press(e.key);
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Escape') clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const status = !correctPin
    ? 'No passcode set. Add VITE_APP_PIN to your .env file.'
    : error
      ? errorCount >= 3 ? 'Still not right. Take a breath and try again.' : 'Wrong passcode. Try again.'
      : unlocking ? 'Unlocked' : 'Enter your passcode';

  const time = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="lock-screen w-screen h-[100dvh] relative overflow-hidden select-none flex flex-col">
      <div className="lock-aurora" aria-hidden="true"><span /><span /></div>
      <div className="lock-noise" aria-hidden="true" />

      {/* top bar */}
      <div className="relative flex items-center justify-between px-5 sm:px-8 h-14 shrink-0 fade-up">
        <span className="flex items-center gap-2.5">
          <Logo size={20} />
          <span className="text-[14px] text-slate-200 font-semibold tracking-[-0.01em]">AnonVault</span>
        </span>
        <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] border transition-colors duration-300 ${
          unlocking ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/[0.08]' : 'text-slate-400 border-white/[0.08] bg-white/[0.03]'}`}>
          {unlocking ? <LockOpen size={12} /> : <Lock size={12} />}
          {unlocking ? 'Unlocked' : 'Locked'}
        </span>
      </div>

      {/* body */}
      <div className="relative flex-1 min-h-0 overflow-y-auto">
        <div className="min-h-full max-w-[1040px] mx-auto px-5 sm:px-8 py-3 sm:py-5 grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-16 items-center">

          {/* clock side */}
          <div className="lock-clock text-center lg:text-left fade-up" style={{ animationDelay: '40ms' }}>
            <p className="text-[64px] sm:text-[96px] lg:text-[128px] leading-[0.9] font-extralight tracking-[-0.05em] text-slate-50 tabular-nums">
              {time}
            </p>
            <p className="text-[15px] sm:text-[17px] text-slate-400 mt-3 sm:mt-4">
              {clock.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {quote && (
              <figure className="hidden lg:block mt-10 max-w-[420px] border-l border-white/[0.1] pl-4">
                <blockquote className="text-[15px] leading-relaxed text-slate-300">“{quote.text}”</blockquote>
                {quote.author && quote.author !== 'Unknown' && <figcaption className="text-[13px] text-slate-500 mt-2">— {quote.author}</figcaption>}
              </figure>
            )}
          </div>

          {/* passcode card */}
          <div className="lock-card w-full max-w-[380px] mx-auto rounded-[28px] sm:px-8 sm:py-7 fade-up" style={{ animationDelay: '100ms' }}>
            <div className="flex flex-col items-center">
              <div className={`lock-avatar mb-4 w-12 h-12 rounded-full flex items-center justify-center transition-[background-color,color,box-shadow] duration-300 ${
                unlocking ? 'bg-emerald-400/12 text-emerald-300 shadow-[0_0_0_6px_rgba(79,209,160,0.06)]'
                  : error ? 'bg-rose-400/12 text-rose-300 shadow-[0_0_0_6px_rgba(245,118,138,0.06)]'
                  : 'bg-white/[0.06] text-slate-200 shadow-[0_0_0_6px_rgba(255,255,255,0.025)]'}`}>
                <span key={unlocking ? 'open' : 'closed'} className="fade-up">
                  {unlocking ? <LockOpen size={20} strokeWidth={1.8} /> : <Lock size={20} strokeWidth={1.8} />}
                </span>
              </div>
              <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-slate-50">Welcome back</h1>
              <p aria-live="polite"
                className={`mt-1 text-[13px] text-center min-h-[20px] transition-colors ${error || !correctPin ? 'text-rose-400' : unlocking ? 'text-emerald-400' : 'text-slate-500'}`}>
                {status}
              </p>

              {/* PIN cells */}
              <div className={`flex gap-3 mt-5 mb-6 ${shake ? 'animate-shake' : ''}`}
                aria-label={`${pin.length} of ${pinLength} digits entered`}>
                {Array.from({ length: pinLength }).map((_, i) => {
                  const filled = i < pin.length;
                  const current = i === pin.length && !unlocking && !error;
                  return (
                    <span key={i} className={`pin-cell ${filled ? 'filled' : ''} ${current ? 'current' : ''} ${unlocking ? 'ok' : ''} ${error ? 'error' : ''}`}>
                      <span className="pin-cell-dot" />
                    </span>
                  );
                })}
              </div>

              {/* keypad */}
              <div className="grid grid-cols-3 gap-x-5 gap-y-3">
                {KEYS.map(([k, letters]) => (
                  <button key={k} onClick={() => press(k)} disabled={unlocking}
                    data-active={activeKey === k ? 'true' : undefined}
                    className="key-round cursor-pointer" aria-label={k}>
                    <span className="text-[26px] leading-none font-light tabular-nums">{k}</span>
                    <span className="text-[9px] tracking-[0.16em] text-slate-500 h-3 mt-0.5">{letters}</span>
                  </button>
                ))}
                <button onClick={clear} disabled={unlocking || !pin}
                  className="key-round key-round--ghost cursor-pointer text-[13px] disabled:opacity-0 transition-opacity">
                  Clear
                </button>
                <button onClick={() => press('0')} disabled={unlocking}
                  data-active={activeKey === '0' ? 'true' : undefined}
                  className="key-round cursor-pointer" aria-label="0">
                  <span className="text-[26px] leading-none font-light tabular-nums">0</span>
                  <span className="text-[9px] h-3 mt-0.5">&nbsp;</span>
                </button>
                <button onClick={backspace} disabled={unlocking || !pin} aria-label="Delete last digit"
                  data-active={activeKey === 'back' ? 'true' : undefined}
                  className="key-round key-round--ghost cursor-pointer disabled:opacity-0 transition-opacity">
                  <Delete size={20} strokeWidth={1.6} />
                </button>
              </div>

              <p className="lock-hint mt-6 text-[12px] text-slate-600 hidden sm:flex items-center gap-1.5">
                or type it <span className="kbd">0</span>–<span className="kbd">9</span> · <span className="kbd">Esc</span> clears
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* footer */}
      <div className="relative h-11 sm:h-12 flex items-center justify-center text-[12px] text-slate-600 shrink-0">
        {errorCount >= 2 ? (
          <a href="https://link.minianon.in/tusharbhardwaj" target="_blank" rel="noopener noreferrer"
            className="text-slate-400 hover:text-slate-100 transition-colors fade-up">
            Locked out? Contact the owner →
          </a>
        ) : (
          <span>Private workspace</span>
        )}
      </div>

      {unlocking && <AccessGranted onComplete={onAuthorize} />}
    </div>
  );
}


/* ── Compute pending task count (reads from localStorage cache) ── */
function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeTaskStats() {
  try {
    const allTasks = getTasksForDateSync(todayDateStr());
    const total = allTasks.length;
    const completed = allTasks.filter(t => t.completed).length;
    const pending = total - completed;
    return { total, completed, pending };
  } catch {
    return { total: 0, completed: 0, pending: 0 };
  }
}

/* ================= main app dashboard component ================= */
function AppInner() {
  const showToast = useToast();
  const [isAuthorized, setIsAuthorized] = useState(sessionStorage.getItem('minianon_authorized') === 'true');
  const [showLockScreen, setShowLockScreen] = useState(() => {
    return sessionStorage.getItem('minianon_authorized') !== 'true';
  });
  const [lockFadeOut, setLockFadeOut] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const revealTimers = useRef([]);
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard as default
  const [initIdeaId, setInitIdeaId] = useState(null);
  const [initHackathonId, setInitHackathonId] = useState(null);
  const [initTaskDate, setInitTaskDate] = useState(null);
  const didSyncRef = useRef(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleLock = () => {
    revealTimers.current.forEach(clearTimeout);
    revealTimers.current = [];
    sessionStorage.removeItem('minianon_authorized');
    setIsAuthorized(false);
    setLockFadeOut(false);
    setRevealing(false);
    setShowLockScreen(true);
  };

  const handleUnlockComplete = targetTab => {
    // A briefing tile can hand us the tab it described, so the unlock lands
    // where the user was actually headed instead of always on the dashboard.
    if (targetTab) setActiveTab(targetTab);
    setIsAuthorized(true);
    setLockFadeOut(true);
    setRevealing(true);
    revealTimers.current = [
      // unmount the lock layer once its aperture has finished closing
      setTimeout(() => setShowLockScreen(false), 450),
      // drop the reveal class once the cascade is done, so the settled
      // transform stops acting as a containing block for the fixed sidebar
      setTimeout(() => setRevealing(false), 1100),
    ];
  };

  // Data states
  const [applications, setApplications] = useState([]);
  const ideas = ideaStore.useAll();
  const meetingList = meetingStore.useAll();
  const [projectIdeas, setProjectIdeas] = useState([]);
  const [projectIdeasCount, setProjectIdeasCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load initial data if PIN authorized
  useEffect(() => {
    if (isAuthorized) {
      loadData();
    }
  }, [isAuthorized]);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [appsData] = await Promise.all([
        fetchApplications().catch(err => {
          console.error('Error fetching applications:', err);
          return [];
        }),
        // Ideas, tasks, notes, settings, Money, Focus, Board, Quotes: pull
        // other devices' changes and push anything waiting from this one.
        syncLocalFirstStores(),
      ]);

      setApplications(appsData);

      // Cache just what the unlock briefing needs — it runs before this
      // fetch has had a chance to happen.
      try {
        localStorage.setItem(APPS_CACHE_KEY, JSON.stringify(
          (appsData || []).map(a => ({ deadline: a.deadline, status: a.status }))
        ));
      } catch (err) {
        console.warn('Could not cache applications for the unlock briefing:', err);
      }

      // Fetch project ideas from Supabase with localStorage fallback
      try {
        const pIdeas = await fetchProjectIdeas();
        setProjectIdeas(pIdeas);
        setProjectIdeasCount(pIdeas.length);
        try {
          localStorage.setItem(CONCEPTS_CACHE_KEY, String(pIdeas.length));
        } catch { /* briefing tile just stays at its last value */ }
      } catch (err) {
        console.warn('Error fetching project ideas from Supabase, falling back to LocalStorage:', err);
        let stored = [];
        try {
          const raw = localStorage.getItem('anonvault_project_ideas');
          stored = raw ? JSON.parse(raw) : null;
        } catch {
          stored = null;
        }
        if (!stored) stored = [];
        setProjectIdeas(stored);
        setProjectIdeasCount(stored.length);
      }

      // Refresh pending task count now that the cache is warm
      setTaskStats(computeTaskStats());
      // Views that rendered before the sync finished re-read the fresh cache.
      setTasksVersion(v => v + 1);
      
      if (!didSyncRef.current) {
        didSyncRef.current = true;
      }
    } catch (err) {
      console.error('Fail to load data from Supabase:', err);
      setErrorMsg('Failed to synchronize data with Supabase. Check your tables, RLS policies, and console logs.');
      showToast('error', 'Sync Failed', 'Could not load data from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  // --- Application Handlers ---
  
  const handleAddApplication = async (newApp) => {
    try {
      const added = await addApplication(newApp);
      setApplications(prev => [...prev, added].sort((a, b) => new Date(a.deadline) - new Date(b.deadline)));
      showToast('success', 'Hackathon Added', `"${added.name}" has been tracked.`);
    } catch (err) {
      console.error('Failed to add application:', err);
      showToast('error', 'Add Failed', 'Could not create hackathon. Check your Supabase table.');
    }
  };

  const handleUpdateApplication = async (id, updates) => {
    try {
      const updated = await updateApplication(id, updates);
      setApplications(prev => prev.map(app => app.id === id ? updated : app).sort((a, b) => new Date(a.deadline) - new Date(b.deadline)));
      showToast('success', 'Hackathon Updated', `"${updated.name}" has been saved.`);
    } catch (err) {
      console.error('Failed to update application:', err);
      showToast('error', 'Update Failed', 'Could not save changes. Check your connection.');
    }
  };

  // Deletes are immediate and there is no backup, so the toast doubles as
  // the only safety net: it holds the removed record and puts it back on
  // demand. Restoring re-inserts rather than un-deleting, so the row comes
  // back with a new id — fine for undo, but worth knowing.
  const withUndo = (title, name, restore) =>
    showToast('warning', title, `"${name}" removed.`, 7000, {
      label: 'Undo',
      onClick: () => { restore(); },
    });

  const handleDeleteApplication = async (id) => {
    try {
      const targetApp = applications.find(app => app.id === id);
      const appName = targetApp ? targetApp.name : 'Hackathon';
      await deleteApplication(id);
      setApplications(prev => prev.filter(app => app.id !== id));
      withUndo('Hackathon Removed', appName, () => handleAddApplication({
        name: targetApp?.name, company: targetApp?.company, link: targetApp?.link,
        links: targetApp?.links || [], deadline: targetApp?.deadline,
        priority: targetApp?.priority, status: targetApp?.status,
        notes: targetApp?.notes, ppi: targetApp?.ppi, travel: targetApp?.travel,
        onsite: targetApp?.onsite, remote: targetApp?.remote,
      }));
    } catch (err) {
      console.error('Failed to delete application:', err);
      showToast('error', 'Delete Failed', 'Could not remove the hackathon.');
    }
  };

  // --- Idea Handlers ---

  const handleAddIdea = async (newIdea) => {
    const added = ideaStore.add({
      title: (newIdea.title || '').trim(),
      content: newIdea.content || '',
      image_url: newIdea.image_url || '',
      images: newIdea.images || [],
      links: newIdea.links || [],
      tags: newIdea.tags || [],
      status: newIdea.status || 'new',
    });
    showToast('success', 'Idea saved', `"${added.title}"`);
    return added;
  };

  const handleUpdateIdea = async (id, updates) => {
    ideaStore.update(id, updates);
    const updated = ideaStore.getAll().find(i => i.id === id);
    showToast('success', 'Idea updated', `"${updated?.title || ''}"`);
    return updated;
  };

  // Stage changes are small and frequent, so no toast.
  const handleSetIdeaStage = (id, status) => ideaStore.update(id, { status });

  const handleDeleteIdea = async (id) => {
    const target = ideaStore.getAll().find(i => i.id === id);
    ideaStore.remove(id);
    if (target) withUndo('Idea deleted', target.title || 'Idea', () => ideaStore.restore(target));
  };

  // --- Project Ideas Handlers ---

  // Which vault ideas already became concepts. Derived rather than stored:
  // promoted_from on the concept is the single source of truth.
  const boardItems = board.useAll();
  const promotedMap = boardItems.reduce((acc, p) => {
    if (p && p.promoted_from) acc[p.promoted_from] = p.id;
    return acc;
  }, {});

  // Returns whether the concept was actually created. The vault uses that to
  // decide whether to clear the idea out of its active list — a failed
  // promotion must not make the idea disappear.
  // "Start building": the idea becomes a card, and every "- step" line in
  // its notes becomes its own card labelled with the idea, so the first
  // steps are on the board ready to drag into In progress.
  const handlePromoteToProject = async idea => {
    if (!idea) return false;
    const steps = stepsIn(idea.content);
    // New cards go to the top of To do, so add the steps (last first) before
    // the idea's own card: it ends up on top with its steps under it in order.
    [...steps].reverse().forEach(step => addBoardItem({ title: step, label: idea.title, status: 'todo' }));
    const item = addBoardItem({
      title: idea.title,
      description: idea.content || '',
      label: (idea.tags || [])[0] || 'Idea',
      status: 'todo',
      promoted_from: idea.id,
    });
    if (!item) return false;
    ideaStore.update(idea.id, { status: 'ready' });
    setActiveTab('board');
    showToast('success', 'Started building',
      steps.length ? `"${idea.title}" and ${steps.length} step${steps.length === 1 ? '' : 's'} are now in To do.` : `"${idea.title}" is now a card in To do.`);
    return true;
  };

  // --- Dynamic Stats calculation ---
  const [taskStats, setTaskStats] = useState(computeTaskStats);

  // Bumped on every task mutation so all mounted views refetch. All tabs stay
  // mounted (only opacity toggles), so without this a view keeps stale tasks.
  const [tasksVersion, setTasksVersion] = useState(0);

  const refreshPendingTasks = useCallback(() => {
    setTaskStats(computeTaskStats());
    setTasksVersion(v => v + 1);
  }, []);

  // Keep an open device current without a refresh:
  //  - Supabase Realtime tells us the moment a table changes on any device,
  //    and only that table is re-synced (debounced, so a burst of writes is
  //    one sync);
  //  - coming back to the window re-syncs everything (at most every 5s);
  //  - a timer catches anything missed: every minute while Realtime is not
  //    connected (not enabled in Supabase yet, or offline), else every 5.
  useEffect(() => {
    if (!isAuthorized) return;

    const reloadApps = async () => {
      const apps = await fetchApplications().catch(() => null);
      if (apps) setApplications(apps);
    };
    const reloadProjectIdeas = async () => {
      const list = await fetchProjectIdeas().catch(() => null);
      if (list) { setProjectIdeas(list); setProjectIdeasCount(list.length); }
    };
    const tasksSync = () => loadAllTasks().catch(() => {});
    const SYNC_FOR_TABLE = {
      tasks: tasksSync,
      task_completions: tasksSync,
      subtask_completions: tasksSync,
      ideas: () => ideaStore.sync(),
      daily_notes: syncNotes,
      app_settings: syncPrefs,
      transactions: () => moneyStore.sync(),
      focus_sessions: () => focusStore.sync(),
      income_sources: () => incomeSources.sync(),
      investments: () => investments.sync(),
      loans: () => loans.sync(),
      emis: () => emis.sync(),
      income_ideas: () => incomeIdeas.sync(),
      companies: () => companies.sync(),
      board_items: () => board.sync(),
      quotes: () => quoteStore.sync(),
      meetings: () => meetingStore.sync(),
      applications: reloadApps,
      project_ideas: reloadProjectIdeas,
    };

    let disposed = false;
    let lastFull = Date.now();
    let fullRunning = false;
    const runFull = async (force = false) => {
      if (disposed || fullRunning || (!force && Date.now() - lastFull < 5000)) return;
      fullRunning = true;
      lastFull = Date.now();
      try {
        await Promise.all([reloadApps(), syncLocalFirstStores()]);
        if (!disposed) refreshPendingTasks();
      } finally {
        fullRunning = false;
      }
    };

    // Realtime: collect changed tables for a moment, then sync just those.
    const changed = new Set();
    let debounce = null;
    const flushChanged = async () => {
      const fns = new Set([...changed].map(t => SYNC_FOR_TABLE[t]).filter(Boolean));
      const touchedTasks = ['tasks', 'task_completions', 'subtask_completions', 'daily_notes'].some(t => changed.has(t));
      changed.clear();
      await Promise.all([...fns].map(fn => fn()));
      if (!disposed && touchedTasks) refreshPendingTasks();
    };
    let realtimeUp = false;
    const client = getSupabaseClient();
    const channel = client
      ? client
          .channel('anonvault-sync')
          .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
            if (!payload?.table || !SYNC_FOR_TABLE[payload.table]) return;
            changed.add(payload.table);
            clearTimeout(debounce);
            debounce = setTimeout(flushChanged, 700);
          })
          .subscribe(status => {
            const up = status === 'SUBSCRIBED';
            // Reconnected after a drop: catch up on whatever was missed.
            if (up && !realtimeUp) runFull(true);
            realtimeUp = up;
          })
      : null;

    const onFocus = () => runFull();
    const onVisible = () => { if (document.visibilityState === 'visible') runFull(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    let lastTick = Date.now();
    const timer = setInterval(() => {
      const every = realtimeUp ? 5 * 60 * 1000 : 60 * 1000;
      if (document.visibilityState === 'visible' && Date.now() - lastTick >= every) {
        lastTick = Date.now();
        runFull(true);
      }
    }, 15 * 1000);

    return () => {
      disposed = true;
      clearTimeout(debounce);
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) client.removeChannel(channel);
    };
  }, [isAuthorized, refreshPendingTasks]);

  // A save that didn't reach Supabase is kept locally and retried; say so
  // once per distinct problem instead of failing silently.
  useEffect(() => {
    const seen = new Set();
    return onSyncIssue(({ key, message }) => {
      if (seen.has(key)) return;
      seen.add(key);
      showToast('warning', 'Not synced yet', message, 9000);
    });
  }, [showToast]);

  // Panel reveals are owned entirely by [data-tabreveal]. Gating on this
  // rather than on activeTab alone matters twice over: while the lock screen
  // is up the attribute must be absent, or each panel would burn its
  // animation behind the lock and have none left for the handover; and it
  // must go on at the handover itself (revealing) rather than when the lock
  // layer unmounts 700ms later, or the dashboard would be revealed
  // fully-formed by the aperture and only then animate in.
  const tabRevealOn = revealing || !showLockScreen;

  // Single-key shortcuts. Ignored while typing, while any modal is open, and
  // while the lock screen is up — otherwise "n" would fire mid-sentence in
  // every text field in the app.
  useEffect(() => {
    if (showLockScreen) return;

    const TABS = NAV.map(n => n.id);

    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      const typing = el && (
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' || el.isContentEditable
      );
      if (typing) return;
      // A modal or the palette owns the keyboard while it is open.
      if (document.querySelector('.modal-overlay')) return;

      const slot = e.key === '0' ? 9 : e.key >= '1' && e.key <= '9' ? Number(e.key) - 1 : -1;
      if (slot >= 0 && TABS[slot]) {
        e.preventDefault();
        setActiveTab(TABS[slot]);
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        // Broadcast rather than threading a callback through six views.
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('anonvault:new'));
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('anonvault:focus-search'));
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showLockScreen]);

  // Cmd/Ctrl+K anywhere in the workspace. Suppressed while the lock screen
  // is up so the palette can never be opened over an unauthorised session.
  useEffect(() => {
    if (showLockScreen) return;
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showLockScreen]);

  // Today's tasks, read straight from the local cache. Only needed while the
  // palette is open, and cheap enough not to warrant caching.
  const paletteTasks = paletteOpen ? getTasksForDateSync(todayDateStr()) : [];

  // The steps every hackathon needs. Kept here rather than in the Timeline so
  // it is one list to edit, not one per call site.
  const HACKATHON_STEPS = [
    'Register / submit application',
    'Form the team',
    'Lock the idea',
    'Build the MVP',
    'Record the demo video',
    'Submit before the deadline',
  ];

  const handleCreateChecklist = async app => {
    if (!app) return;
    try {
      // Sequential rather than parallel: each addTask read-modify-writes the
      // same localStorage key, so concurrent writes would drop steps.
      for (const step of HACKATHON_STEPS) {
        await addTask({
          title: step,
          is_recurring: false,
          date: todayDateStr(),
          priority: 'medium',
          subtasks: [],
          hackathon_id: app.id,
        });
      }
      refreshPendingTasks();
      showToast('success', 'Checklist Added',
        `${HACKATHON_STEPS.length} steps created for "${app.name}".`);
    } catch (err) {
      console.error('Failed to create hackathon checklist:', err);
      showToast('error', 'Failed',
        'Could not create the checklist. If this database predates the migration, run supabase/migrations/001 first.');
    }
  };

  const handleQuickAddTask = async (title, date) => {
    if (!title) return;
    try {
      await addTask({
        title,
        is_recurring: false,
        date: date || todayDateStr(),
        priority: 'medium',
        subtasks: [],
      });
      refreshPendingTasks();
      showToast('success', 'Task Added', date && date !== todayDateStr() ? `"${title}" added for ${new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}.` : `"${title}" added to today.`);
    } catch (err) {
      console.error('Quick add task failed:', err);
      showToast('error', 'Add Failed', 'Could not create the task.');
    }
  };

  // Cross-section shortcuts (see utils/jump.js).
  const quickAddRef = useRef(handleQuickAddTask);
  useEffect(() => { quickAddRef.current = handleQuickAddTask; });
  useEffect(() => {
    const onGoto = e => { if (e.detail) setActiveTab(e.detail); };
    const onAdd = e => quickAddRef.current?.(e.detail?.title, e.detail?.date);
    window.addEventListener('anonvault:goto', onGoto);
    window.addEventListener('anonvault:add-task', onAdd);
    return () => {
      window.removeEventListener('anonvault:goto', onGoto);
      window.removeEventListener('anonvault:add-task', onAdd);
    };
  }, []);

  // Once a week, nudge toward Review: Sunday evening shows this week,
  // Monday shows last week. At most once per week, per device.
  useEffect(() => {
    if (!isAuthorized) return;
    const now = new Date();
    const dow = now.getDay();
    const sunday = dow === 0 && now.getHours() >= 17;
    const monday = dow === 1;
    if (!sunday && !monday) return;
    const monday0 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((dow + 6) % 7) - (monday ? 7 : 0));
    const key = 'anonvault_review_nudge';
    const week = monday0.toISOString().slice(0, 10);
    try { if (localStorage.getItem(key) === week) return; } catch { return; }
    const t = setTimeout(() => {
      try { localStorage.setItem(key, week); } catch { /* fine */ }
      showToast('info', monday ? 'Last week, in one page' : 'Your week, in one page',
        'Hours, money, tasks and what slipped.', 12000, {
          label: 'Open Review',
          onClick: () => {
            setActiveTab('review');
            setTimeout(() => window.dispatchEvent(new CustomEvent('anonvault:review-period', { detail: { kind: 'week', offset: monday ? -1 : 0 } })), 60);
          },
        });
    }, 2500);
    return () => clearTimeout(t);
  }, [isAuthorized, showToast]);

  const handleQuickAddIdea = async title => {
    if (!title) return;
    await handleAddIdea({ title, content: '', images: [], links: [], tags: [] });
  };

  const stats = {
    // Upcoming only — the badge is an "needs attention" count, like
    // pendingTasks below, so events whose deadline has passed do not belong.
    upcomingApplications: (applications || []).filter(
      app => app && !(app.deadline && new Date(app.deadline) < new Date())
    ).length,
    highPriorityCount: (applications || []).filter(app => app && app.priority === 'high' && app.status !== 'rejected').length,
    totalIdeas: (ideas || []).length,
    pendingTasks: taskStats.pending,
    totalTasks: taskStats.total,
    completedTasks: taskStats.completed,
    totalProjectIdeas: projectIdeasCount,
    boardOpen: boardItems.filter(i => i.status !== 'done').length,
    meetingsToday: meetingsOn(meetingList, todayDateStr()).length,
  };


  const panel = id => ({
    'data-tabreveal': activeTab === id && tabRevealOn ? 'on' : undefined,
    'aria-hidden': activeTab !== id,
    className: `absolute inset-0 transition-opacity duration-200 ease-out ${
      activeTab === id ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
    }`,
  });
  const menu = () => setMobileMenuOpen(true);

  return (
    <div className="flex w-screen h-[100dvh] overflow-hidden bg-[var(--bg)] font-sans relative">

      {/* Workspace — .app-reveal stages the post-unlock entrance */}
      <div className={`flex w-full h-full overflow-hidden ${revealing ? 'app-reveal' : ''}`}
        style={{
          opacity: lockFadeOut || !showLockScreen ? 1 : 0,
          transition: revealing ? 'none' : 'opacity 0.3s ease-out',
          pointerEvents: showLockScreen && !lockFadeOut ? 'none' : 'auto',
        }}>

        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          stats={stats}
          mobileOpen={mobileMenuOpen}
          setMobileOpen={setMobileMenuOpen}
          onOpenPalette={() => setPaletteOpen(true)}
          onLock={handleLock}
        />

        <main className="flex-1 h-full overflow-hidden flex flex-col relative min-w-0">
          {errorMsg && (
            <div className="px-6 h-10 bg-rose-500/[0.08] border-b border-rose-500/20 text-[13px] text-rose-300 flex items-center justify-between shrink-0">
              <span className="truncate">{errorMsg}</span>
              <button
                onClick={() => { didSyncRef.current = false; loadData(); }}
                className="h-7 px-2.5 text-[12px] rounded-md border border-rose-500/30 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0">
                Retry
              </button>
            </div>
          )}

          <ErrorBoundary>
            <div className="relative flex-1 h-full w-full overflow-hidden">
              <div {...panel('dashboard')}>
                <DashboardView
                  applications={applications}
                  projectIdeas={projectIdeas}
                  onTasksChange={refreshPendingTasks}
                  tasksVersion={tasksVersion}
                  setActiveTab={setActiveTab}
                  onMenuToggle={menu}
                  onLock={handleLock}
                  showToast={showToast}
                  onQuickAddTask={handleQuickAddTask}
                  onOpenBoard={() => setActiveTab('board')}
                  onSelectHackathon={(id) => { setInitHackathonId(id); setActiveTab('timeline'); }}
                />
              </div>

              <div {...panel('tasks')}>
                <TasksView
                  applications={applications}
                  initialDate={initTaskDate}
                  onClearInitialDate={() => setInitTaskDate(null)}
                  showToast={showToast}
                  onTasksChange={refreshPendingTasks}
                  tasksVersion={tasksVersion}
                  onLock={handleLock}
                  onMenuToggle={menu}
                />
              </div>

              <div {...panel('focus')}>
                <FocusView onLock={handleLock} onMenuToggle={menu} showToast={showToast} projectIdeas={projectIdeas} />
              </div>

              <div {...panel('money')}>
                <MoneyView onLock={handleLock} onMenuToggle={menu} showToast={showToast} />
              </div>

              <div {...panel('board')}>
                <BoardView onLock={handleLock} onMenuToggle={menu} showToast={showToast} legacyProjects={projectIdeas} />
              </div>

              <div {...panel('calendar')}>
                <CalendarView applications={applications} tasksVersion={tasksVersion} setActiveTab={setActiveTab}
                  onSelectHackathon={id => { setInitHackathonId(id); setActiveTab('timeline'); }}
                  onOpenChecklistDate={d => { setInitTaskDate(d); setActiveTab('tasks'); }}
                  onTasksChange={refreshPendingTasks}
                  onLock={handleLock} onMenuToggle={menu} showToast={showToast} />
              </div>

              <div {...panel('quotes')}>
                <QuotesView onLock={handleLock} onMenuToggle={menu} showToast={showToast} />
              </div>
              <div {...panel('ideas')}>
                <IdeasSection
                  setActiveTab={setActiveTab}
                  ideas={ideas}
                  onAdd={handleAddIdea}
                  onUpdate={handleUpdateIdea}
                  onDelete={handleDeleteIdea}
                  loading={loading}
                  onLock={handleLock}
                  showToast={showToast}
                  onMenuToggle={menu}
                  onPromoteToProject={handlePromoteToProject}
                  onSetStage={handleSetIdeaStage}
                  promotedMap={promotedMap}
                  onOpenConcept={() => setActiveTab('board')}
                  initialSelectedIdeaId={initIdeaId}
                  onClearInitialSelectedIdea={() => setInitIdeaId(null)}
                />
              </div>

              <div {...panel('timeline')}>
                <TimelineView
                  applications={applications}
                  onAdd={handleAddApplication}
                  onUpdate={handleUpdateApplication}
                  onDelete={handleDeleteApplication}
                  loading={loading}
                  onLock={handleLock}
                  showToast={showToast}
                  onMenuToggle={menu}
                  tasksVersion={tasksVersion}
                  setActiveTab={setActiveTab}
                  onCreateChecklist={handleCreateChecklist}
                  initialSelectedAppId={initHackathonId}
                  onClearInitialSelectedApp={() => setInitHackathonId(null)}
                />
              </div>

              <div {...panel('review')}>
                <ReviewView
                  applications={applications}
                  tasksVersion={tasksVersion}
                  onLock={handleLock}
                  onMenuToggle={menu}
                  setActiveTab={setActiveTab}
                  onPickDate={date => { setInitTaskDate(date); setActiveTab('tasks'); }}
                />
              </div>
            </div>
          </ErrorBoundary>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        tasks={paletteTasks}
        applications={applications}
        ideas={ideas}
        projectIdeas={projectIdeas}
        setActiveTab={setActiveTab}
        onSelectIdea={id => { setInitIdeaId(id); setActiveTab('ideas'); }}
        onSelectProject={() => setActiveTab('board')}
        boardItems={boardItems}
        onSelectHackathon={id => { setInitHackathonId(id); setActiveTab('timeline'); }}
        onQuickAddTask={handleQuickAddTask}
        onQuickAddIdea={handleQuickAddIdea}
      />

      {showLockScreen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          opacity: lockFadeOut ? 0 : 1,
          transform: lockFadeOut ? 'scale(1.015)' : 'scale(1)',
          filter: lockFadeOut ? 'blur(8px)' : 'blur(0px)',
          transition: 'opacity 0.4s ease-out, transform 0.45s cubic-bezier(0.22,1,0.36,1), filter 0.4s ease-out',
          pointerEvents: lockFadeOut ? 'none' : 'auto',
        }}>
          <LockScreen onAuthorize={handleUnlockComplete} />
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <GlobalTooltip />
      <AppInner />
    </ToastProvider>
  );
}

export default App;
