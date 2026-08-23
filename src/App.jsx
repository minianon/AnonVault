import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import TimelineView from './components/TimelineView';
import IdeaVaultView from './components/IdeaVaultView';
import TasksView from './components/TasksView';
import ProjectIdeasView from './components/ProjectIdeasView';
import QuotesView from './components/QuotesView';
import DashboardView from './components/DashboardView';
import ReviewView from './components/ReviewView';
import CommandPalette from './components/CommandPalette';
import { ToastProvider, useToast } from './components/Toast';
import { Lock, ShieldAlert, Cpu, Delete } from 'lucide-react';
import { 
  fetchApplications, 
  addApplication, 
  updateApplication, 
  deleteApplication,
  fetchIdeas,
  addIdea,
  updateIdea,
  deleteIdea,
  fetchProjectIdeas,
  addProjectIdea,
  updateProjectIdea,
  deleteProjectIdea
} from './services/supabase';
import { fetchQuotes, addQuote, updateQuote, deleteQuote } from './services/quotes';
import { getTasksForDateSync, loadAllTasks, addTask } from './services/tasks';
import { syncNotes } from './services/journal';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-xl p-8 rounded-2xl glass-panel border border-rose-500/20 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-white tracking-wide">Section Render Crash</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              An error occurred while compiling or rendering this view. This is usually due to missing database relations or mismatched properties.
            </p>
            <pre className="p-4 text-[10px] font-mono text-rose-350 bg-rose-950/40 rounded-xl overflow-x-auto text-left border border-rose-500/10 whitespace-pre-wrap leading-normal">
              {this.state.error ? this.state.error.toString() + "\n" + this.state.error.stack : 'Unknown crash'}
            </pre>
            <button 
              onClick={() => window.location.reload()} 
              className="py-2.5 px-6 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-all cursor-pointer shadow-lg shadow-rose-600/10"
            >
              Restart Session
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
   before isAuthorized flips and therefore before loadData() has fetched
   anything. Hackathons have no service-level cache of their own, so
   loadData writes APPS_CACHE_KEY for the next unlock to read; the very
   first unlock on a device shows 0 there.                            */
const APPS_CACHE_KEY = 'anonvault_applications_cache';
const CONCEPTS_CACHE_KEY = 'anonvault_concepts_cache';

function computeBriefing() {
  const out = { tasksToday: 0, dueThisWeek: 0, concepts: 0, doneToday: 0, totalToday: 0 };

  try {
    const stats = computeTaskStats();
    out.tasksToday = stats.pending;
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
    // Its own cache rather than 'anonvault_project_ideas': that key is only
    // written on the localStorage fallback path, so a cloud-synced session
    // never populates it and the tile would read 0 forever.
    const raw = localStorage.getItem(CONCEPTS_CACHE_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    out.concepts = Number.isFinite(n) ? n : 0;
  } catch { /* leave at 0 */ }

  return out;
}

/* Counts run up to their value rather than snapping, so the tiles read as
   being tallied while the ring sweeps. */
function useCountUp(target, duration, delay) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = null;
    let start = null;
    const tick = ts => {
      if (start === null) start = ts;
      const progress = Math.min(1, (ts - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
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

function BriefingTile({ value, label, accent, delay, dimmed, onJump }) {
  const shown = useCountUp(value, 1500, delay);
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onJump(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Open this section"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        padding: '4px 18px', minWidth: 76,
        background: hover ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
        border: 'none', borderRadius: 10,
        cursor: 'pointer', font: 'inherit',
        transform: hover ? 'translateY(-1px)' : 'none',
        transition: 'background 0.18s ease, transform 0.18s ease',
      }}>
      <span style={{
        fontSize: 24, fontWeight: 800, lineHeight: 1,
        fontFamily: "'JetBrains Mono', monospace",
        fontVariantNumeric: 'tabular-nums',
        color: dimmed ? 'rgba(148, 163, 184, 0.45)' : accent,
        textShadow: dimmed ? 'none' : '0 0 18px ' + accent + '66',
      }}>
        {String(shown).padStart(2, '0')}
      </span>
      <span style={{
        fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em',
        textTransform: 'uppercase', textAlign: 'center',
        color: hover ? 'rgba(203, 213, 225, 0.85)' : 'rgba(148, 163, 184, 0.55)',
        fontFamily: "'JetBrains Mono', monospace",
        whiteSpace: 'pre-line',
        transition: 'color 0.18s ease',
      }}>
        {label}
      </span>
    </button>
  );
}

/* ================= access-granted overlay ================= */
function AccessGranted({ onComplete }) {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState('welcome'); // 'welcome' -> 'fadeOut'
  // Snapshot once so the tiles cannot change value mid-count.
  const [brief] = useState(computeBriefing);
  const [session] = useState(() => {
    const now = new Date();
    const h = now.getHours();
    return {
      greeting:
        h < 5  ? 'Good night'
      : h < 12 ? 'Good morning'
      : h < 18 ? 'Good afternoon'
      : h < 22 ? 'Good evening'
      :          'Good night',
      day: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
      at: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  });

  // Ring reads today's completion rather than sweeping decoratively. With
  // nothing scheduled there is no ratio to show, so it reads as a full,
  // muted ring labelled CLEAR instead of an empty one that looks broken.
  const dialClear = brief.totalToday === 0;
  const dialRatio = dialClear ? 1 : brief.doneToday / brief.totalToday;
  const dialDone = !dialClear && brief.doneToday === brief.totalToday;
  const dialColor = dialClear ? 'rgba(148, 163, 184, 0.35)' : dialDone ? '#34d399' : '#38bdf8';

  const summary =
    brief.dueThisWeek > 0
      ? brief.dueThisWeek + ' deadline' + (brief.dueThisWeek > 1 ? 's' : '') + ' closing this week.'
      : brief.tasksToday > 0
        ? brief.tasksToday + ' task' + (brief.tasksToday > 1 ? 's' : '') + ' waiting today.'
        : 'Nothing pressing. Your vault is ready.';

  // Everything that ends the screen goes through here, so the natural
  // timeline and a skip cannot both fire. `targetTab` routes the handover
  // when a briefing tile was the thing that dismissed it.
  const exitedRef = useRef(false);
  const timersRef = useRef([]);

  // onComplete is an inline arrow in LockScreen's render, so it is a new
  // function every render. Held in a ref to keep `finish` stable: otherwise
  // the effect below re-runs on any LockScreen re-render and restarts the
  // dwell timer. LockScreen does re-render during the dwell -- its
  // "don't know Mini Anon?" popup fires on a 3s timer -- so this is not
  // hypothetical.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const finish = useCallback(targetTab => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    timersRef.current.forEach(clearTimeout);
    setPhase('fadeOut');
    timersRef.current = [setTimeout(() => onCompleteRef.current(targetTab), 250)];
  }, []);

  useEffect(() => {
    // Start active phase immediately after mount to trigger animations
    const raf = requestAnimationFrame(() => setActive(true));

    // Dial, tile counts and progress bar all land together at 1.85s; exit
    // just after, so the dwell is exactly as long as the briefing it shows
    // and there is time to actually read three numbers. Any key or click
    // cuts straight to the handover — this runs on every unlock, and a
    // splash you cannot dismiss stops being a nice touch fairly quickly.
    timersRef.current = [setTimeout(() => finish(), 1900)];

    const onKey = () => finish();
    window.addEventListener('keydown', onKey);
        
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      timersRef.current.forEach(clearTimeout);
    };
  }, [finish]);

  return (
    <div
      onClick={() => finish()}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at center, rgba(6, 10, 20, 0.98) 0%, rgba(2, 4, 8, 1) 100%)',
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        opacity: phase === 'fadeOut' ? 0 : active ? 1 : 0,
        transform: phase === 'fadeOut' ? 'scale(1.06)' : 'scale(1)',
        transition: 'opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
      }}
    >
      {/* Premium background cyber grid floor */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(56, 189, 248, 0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(56, 189, 248, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        backgroundPosition: 'center',
        opacity: active ? 0.75 : 0,
        transition: 'opacity 1s ease',
        pointerEvents: 'none',
      }} />

      <div style={{ 
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32,
        transform: active ? 'translateY(0)' : 'translateY(10px)',
        transition: 'transform 0.55s cubic-bezier(0.16, 1, 0.3, 1)',
        textAlign: 'center',
        maxWidth: 620,
        padding: '0 24px',
        position: 'relative',
        zIndex: 62,
      }}>
        
        {/* Animated Badge Header */}
        <div style={{ 
          position: 'relative', width: 140, height: 140, 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Precision bezel — fine ticks with every fifth emphasised. Reads
              as an instrument dial; the old dashed ring read as clip-art. */}
          <svg
            width="140" height="140" viewBox="0 0 140 140"
            className="vault-bezel-spin"
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              animation: phase === 'fadeOut'
                ? 'vaultBezelSpinOut 0.62s cubic-bezier(0.4, 0, 0.3, 1) forwards'
                : 'lockRingRotate 20s linear infinite',
            }}
          >
            {Array.from({ length: 60 }).map((_, i) => {
              const major = i % 5 === 0;
              return (
                <line
                  key={i}
                  x1="70" y1={major ? 3 : 4.5}
                  x2="70" y2={major ? 10 : 9}
                  stroke={major ? 'rgba(125, 211, 252, 0.34)' : 'rgba(125, 211, 252, 0.13)'}
                  strokeWidth={major ? 1.4 : 1}
                  strokeLinecap="round"
                  transform={`rotate(${i * 6} 70 70)`}
                />
              );
            })}
          </svg>

          {/* Orbiting scanner arc — gives the dwell visible rotation while
              leaving the mark upright. */}
          <svg
            width="140" height="140" viewBox="0 0 140 140"
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              opacity: phase === 'fadeOut' ? 0 : 1,
              transition: 'opacity 0.2s ease',
              animation: 'lockRingRotate 1.9s linear infinite',
            }}
          >
            <defs>
              <linearGradient id="agOrbit" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
                <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.9" />
              </linearGradient>
            </defs>
            <circle cx="70" cy="70" r="47" fill="none"
              stroke="url(#agOrbit)" strokeWidth="1.4" strokeLinecap="round"
              strokeDasharray="34 262" />
          </svg>

          {/* Progress dial — fills to today's actual completion over the
              dwell, so the ring is the fourth stat rather than decoration.
              Driven by a transition off `active` instead of a keyframe,
              because the end value is data and cannot be baked into CSS. */}
          <svg
            width="140" height="140" viewBox="0 0 140 140"
            style={{
              position: 'absolute', inset: 0,
              transform: 'rotate(-90deg)',
              opacity: phase === 'fadeOut' ? 0 : 1,
              transition: 'opacity 0.2s ease',
              pointerEvents: 'none',
            }}
          >
            <circle cx="70" cy="70" r="54" fill="none"
              stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1.6" />
            <circle cx="70" cy="70" r="54" fill="none"
              stroke={dialColor} strokeWidth="1.6" strokeLinecap="round"
              strokeDasharray="339.29"
              strokeDashoffset={active ? 339.29 * (1 - dialRatio) : 339.29}
              style={{
                transition: 'stroke-dashoffset 1.85s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s ease',
                filter: dialClear ? 'none' : 'drop-shadow(0 0 5px ' + dialColor + '88)',
              }}
            />
          </svg>

          {/* Release shockwave, fired as the aperture opens */}
          {phase === 'fadeOut' && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '1px solid ' + dialColor + '8c',
              animation: 'vaultShock 0.62s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              pointerEvents: 'none',
            }} />
          )}

          {/* Central emblem */}
          <div className="vault-mark-flip" style={{
            width: 84, height: 84, borderRadius: '50%',
            background: 'radial-gradient(120% 120% at 32% 22%, rgba(255, 255, 255, 0.10) 0%, rgba(56, 189, 248, 0.10) 38%, rgba(6, 14, 26, 0.94) 100%)',
            border: '1px solid ' + (dialClear ? 'rgba(148, 163, 184, 0.24)' : dialColor + '5c'),
            boxShadow: [
              '0 0 26px ' + (dialClear ? 'rgba(148, 163, 184, 0.10)' : dialColor + '2e'),
              'inset 0 1px 0 rgba(255, 255, 255, 0.16)',
              'inset 0 -10px 22px rgba(0, 0, 0, 0.5)',
            ].join(', '),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2,
            transform: active ? 'scale(1) rotate(0deg)' : 'scale(0.3) rotate(-90deg)',
            transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
            animation: phase === 'fadeOut'
              ? 'vaultMarkFlip 0.62s cubic-bezier(0.45, 0, 0.25, 1) forwards'
              : undefined,
          }}>
            {/* The AnonVault mark, not a padlock. The lock spoke about the
                door; by this screen you are already through it, and
                everything below is about the day's work. Gradient and
                filter ids are prefixed so they cannot collide with the
                sidebar's copy of this mark, which is mounted behind. */}
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"
                width="30" height="30">
                <defs>
                  <linearGradient id="agGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#0ea5e9" />
                    <stop offset="50%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#7dd3fc" />
                  </linearGradient>
                  <filter id="agGlow">
                    <feGaussianBlur stdDeviation="1.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <path d="M38 6C38 9.5 39.5 11 43 11C39.5 11 38 12.5 38 16C38 12.5 36.5 11 33 11C36.5 11 38 9.5 38 6Z" fill="url(#agGrad)" filter="url(#agGlow)" />
                <rect x="8" y="38" width="10" height="3" rx="1.5" fill="url(#agGrad)" opacity={0.4} />
                <rect x="15" y="31" width="12" height="3" rx="1.5" fill="url(#agGrad)" opacity={0.6} />
                <rect x="22" y="24" width="14" height="3" rx="1.5" fill="url(#agGrad)" opacity={0.8} />
                <rect x="29" y="17" width="16" height="3" rx="1.5" fill="url(#agGrad)" filter="url(#agGlow)" />
                <path d="M28 11.5C31.5 10.5 34.5 9 37.5 7.5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" filter="url(#agGlow)" />
                <path d="M19 28C21 21 24 16 27.5 12" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" filter="url(#agGlow)" />
                <path d="M19 28C17.5 30.5 15.5 32 14.5 32.5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity={0.8} />
                <path d="M22 21C24.5 21.5 27 22.5 28.5 23.5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" filter="url(#agGlow)" />
                <circle cx="28" cy="8.5" r="3.5" fill="#ffffff" filter="url(#agGlow)" />
              </svg>

              {/* What the ring is measuring, spelled out */}
              <span style={{
                fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em',
                fontFamily: "'JetBrains Mono', monospace",
                fontVariantNumeric: 'tabular-nums',
                color: dialClear ? 'rgba(148, 163, 184, 0.5)' : dialColor,
              }}>
                {dialClear ? 'CLEAR' : brief.doneToday + '/' + brief.totalToday}
              </span>
            </div>
          </div>
        </div>

        {/* Text Area — lifts away just before the aperture opens */}
        <div style={{
          position: 'relative', width: '100%', minHeight: 90,
          opacity: phase === 'fadeOut' ? 0 : 1,
          transform: phase === 'fadeOut' ? 'translateY(-14px)' : 'translateY(0)',
          transition: 'opacity 0.22s ease-out, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center',
          }}>
            <h2 style={{
              margin: 0,
              // clamped: 'Good afternoon Mini Anon' is far wider than
              // 'Welcome Mini Anon' was, and must not overflow on narrow
              // viewports.
              fontSize: 'clamp(17px, 3.1vw, 26px)',
              fontWeight: 900,
              letterSpacing: '0.22em', 
              textTransform: 'uppercase',
              color: '#e2e8f0',
              textShadow: '0 0 30px rgba(56, 189, 248, 0.45)',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              animation: 'popupSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}>
              {/* inline-block + nowrap so a wrap lands between the greeting
                  and the name rather than inside either of them */}
              <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>{session.greeting}</span>{' '}
              <span style={{
                display: 'inline-block', whiteSpace: 'nowrap',
                color: '#38bdf8', textShadow: '0 0 35px rgba(56, 189, 248, 0.85)',
              }}>Mini Anon</span>
            </h2>

            <p style={{
              margin: 0, 
              fontSize: 13, 
              fontWeight: 500,
              color: 'rgba(148, 163, 184, 0.85)',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              animation: 'popupSlideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards',
              opacity: 0,
            }}>
              {summary}
            </p>

            {/* Pre-flight briefing — makes the dwell a useful glance rather
                than pure ceremony. */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 14,
              padding: '14px 6px',
              borderRadius: 16,
              background: 'rgba(255, 255, 255, 0.022)',
              border: '1px solid rgba(255, 255, 255, 0.055)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
              animation: 'popupSlideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.18s forwards',
              opacity: 0,
            }}>
              <BriefingTile
                value={brief.tasksToday}
                label={'tasks\ntoday'}
                accent="#38bdf8"
                delay={180}
                dimmed={brief.tasksToday === 0}
                onJump={() => finish('tasks')}
              />
              <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.06)' }} />
              <BriefingTile
                value={brief.dueThisWeek}
                label={'hackathons\nthis week'}
                accent="#fbbf24"
                delay={260}
                dimmed={brief.dueThisWeek === 0}
                onJump={() => finish('timeline')}
              />
              <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.06)' }} />
              <BriefingTile
                value={brief.concepts}
                label={'project\nideas'}
                accent="#34d399"
                delay={340}
                dimmed={brief.concepts === 0}
                onJump={() => finish('project-ideas')}
              />
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
              width: '100%', maxWidth: 250, marginTop: 16,
              animation: 'popupSlideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.34s forwards',
              opacity: 0,
            }}>
              <span className="vault-sheen-text" style={{
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                Entering Workspace
              </span>

              {/* Fills in step with the dial — one clock, two read-outs,
                  instead of a cursor blinking out of time. Sky rather than
                  emerald so it belongs to the same accent as the mark. */}
              <div style={{
                position: 'relative',
                width: '100%', height: 3, borderRadius: 99,
                background: 'rgba(255, 255, 255, 0.055)',
                boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.03)',
              }}>
                <div className="vault-bar-fill" style={{
                  position: 'absolute', inset: 0, borderRadius: 99,
                  transformOrigin: 'left center',
                  background: 'linear-gradient(90deg, rgba(14, 165, 233, 0.3) 0%, #0ea5e9 45%, #7dd3fc 100%)',
                  boxShadow: '0 0 10px rgba(56, 189, 248, 0.45)',
                  animation: 'vaultHairline 1.51s cubic-bezier(0.4, 0, 0.2, 1) 0.34s both',
                }} />
                {/* Leading head, kept in sync with the fill by sharing its
                    duration, delay and easing. */}
                <div className="vault-bar-head" style={{
                  position: 'absolute', top: '50%',
                  width: 7, height: 7, marginTop: -3.5, marginLeft: -3.5,
                  borderRadius: '50%',
                  background: '#e0f2fe',
                  boxShadow: '0 0 10px 2px rgba(56, 189, 248, 0.7)',
                  animation: 'vaultHairlineHead 1.51s cubic-bezier(0.4, 0, 0.2, 1) 0.34s both',
                }} />
              </div>

              <span style={{
                fontSize: 8.5,
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
                color: 'rgba(148, 163, 184, 0.36)',
              }}>
                {session.day} &middot; {session.at}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ================= lock screen component ================= */
const STREAM_LEFT  = ['0x8F3A','auth::','[ENC]','0xB21C','SHA512','vault::','0xD4F1','priv::','[LOCK]','0x2A7E','HMAC✓','0xF93B','RSA::','[SIG]'];
const STREAM_RIGHT = ['RSA-4096','0x1C9F','[SEALED]','TLS-1.3','0xA83D','ECDSA','0x7E2A','SECURE','[AUTH]','0x5F14','CRYPT::','0xE6C2','AES::','[OK]'];

function LockScreen({ onAuthorize }) {
  const [pin, setPin]               = useState('');
  const [error, setError]           = useState(false);
  const [errorFlash, setErrorFlash] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [resisting, setResisting]   = useState(false);
  const [unlocking, setUnlocking]   = useState(false);
  const [showPopup, setShowPopup]   = useState(false);
  const [ripples, setRipples]       = useState([]);
  const [activeKey, setActiveKey]   = useState(null);
  const [mounted, setMounted]       = useState(false);
  const [crtGlitch, setCrtGlitch]   = useState(false);
  const [laserActive, setLaserActive] = useState(false);

  // Responsive state for the daily quote widget
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Extensive tech, logic, and philosophy daily quotes pool (stable for 24 hours)
  const QUOTES = [
    { text: "Privacy is not a luxury, it is a fundamental prerequisite.", author: "Mini Anon" },
    { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
    { text: "Complexity is the enemy of execution.", author: "Tony Robbins" },
    { text: "Control is an illusion, but order is a deliberate choice.", author: "SecOps" },
    { text: "Logic will get you from A to B. Imagination will take you everywhere.", author: "Albert Einstein" },
    { text: "The present is theirs; the future, for which I worked, is mine.", author: "Nikola Tesla" },
    { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
    { text: "The only true wisdom is in knowing you know nothing.", author: "Socrates" },
    { text: "Excellence is not an act, but a habit.", author: "Aristotle" },
    { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
    { text: "An unexamined life is not worth living.", author: "Socrates" },
    { text: "Make it simple, but significant.", author: "Don Draper" },
    { text: "Focus is a matter of deciding what things you're not going to do.", author: "John Carmack" },
    { text: "Code is like humor. When you have to explain it, it's bad.", author: "Cory House" },
    { text: "Clean code always looks like it was written by someone who cares.", author: "Michael Feathers" },
    { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
    { text: "The structure of a software system reflects the structure of its builders.", author: "Melvin Conway" },
    { text: "Mastery is not about learning more, but about eliminating noise.", author: "Philosophy" },
    { text: "The art of simplicity is a puzzle of complexity.", author: "Anonymous" },
    { text: "Logical thinking is the gateway to precise solutions.", author: "Tech Node" },
    { text: "Do not seek to follow in the footsteps of the wise. Seek what they sought.", author: "Basho" },
    { text: "Knowing is not enough; we must apply. Willing is not enough; we must do.", author: "J. W. von Goethe" },
    { text: "One man's constant is another man's variable.", author: "Alan Perlis" },
    { text: "Programs must be written for people to read, and only incidentally for machines to execute.", author: "Harold Abelson" },
    { text: "Before software can be reusable it first has to be usable.", author: "Ralph Johnson" },
    { text: "The mind is not a vessel to be filled, but a fire to be kindled.", author: "Plutarch" },
    { text: "Truth is ever to be found in simplicity, and not in the multiplicity and confusion of things.", author: "Isaac Newton" },
    { text: "If you cannot explain it simply, you do not understand it well enough.", author: "Albert Einstein" },
    { text: "Quality is free, but only to those who are willing to pay for it in discipline.", author: "Anonymous" },
    { text: "We shape our tools, and thereafter our tools shape us.", author: "Marshall McLuhan" },
    { text: "A clear path is built by removing one obstacle at a time.", author: "Logic Gate" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "Everything has beauty, but not everyone sees it.", author: "Confucius" },
    { text: "To understand recursion, one must first understand recursion.", author: "Stephen Hawking" },
    { text: "The computer was born to solve problems that did not exist before.", author: "Bill Gates" },
    { text: "Optimism is an occupational hazard of programming; feedback is the treatment.", author: "Kent Beck" },
    { text: "Software is a great combination between artistry and engineering.", author: "Bill Gates" },
    { text: "There are only two hard things in Computer Science: cache invalidation and naming things.", author: "Phil Karlton" },
    { text: "Computers are useless. They can only give you answers.", author: "Pablo Picasso" },
    { text: "It's not a bug – it's an undocumented feature.", author: "Anonymous" },
    { text: "Good design adds value faster than it adds cost.", author: "Thomas C. Gale" },
    { text: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", author: "Martin Fowler" },
    { text: "Deleted code is debugged code.", author: "Jeff Sickel" },
    { text: "Simplicity is prerequisite for reliability.", author: "Edsger W. Dijkstra" },
    { text: "The function of good software is to make the complex appear simple.", author: "Grady Booch" },
    { text: "The advance of technology is based on making it fit in so that you don't even notice it.", author: "Bill Gates" },
    { text: "Security is not a product, but a process.", author: "Bruce Schneier" },
    { text: "The price of reliability is the pursuit of the utmost simplicity.", author: "C. A. R. Hoare" },
    { text: "Computers are like Old Testament gods; lots of rules and no mercy.", author: "Joseph Campbell" },
    { text: "Measuring programming progress by lines of code is like measuring aircraft building progress by weight.", author: "Bill Gates" },
    { text: "If debugging is the process of removing software bugs, then programming must be the process of putting them in.", author: "Edsger W. Dijkstra" },
    { text: "There are two ways of constructing a software design: One way is to make it so simple that there are obviously no deficiencies, and the other way is to make it so complicated that there are no obvious deficiencies.", author: "C. A. R. Hoare" },
    { text: "A primary cause of complexity is that software vendors uncritically adopt hardware solutions.", author: "Niklaus Wirth" },
    { text: "Design is not just what it looks like and feels like. Design is how it works.", author: "Steve Jobs" },
    { text: "Information is harder to protect than hardware: it can be in more than one place at the same time.", author: "Securitas" },
    { text: "The only secure system is one that is powered off, unplugged, locked in a titanium safe, and buried in concrete.", author: "Gene Spafford" },
    { text: "In the face of ambiguity, refuse the temptation to guess.", author: "The Zen of Python" },
    { text: "Errors should never pass silently. Unless explicitly silenced.", author: "The Zen of Python" },
    { text: "Beautiful is better than ugly. Explicit is better than implicit. Simple is better than complex.", author: "Tim Peters" },
    { text: "If the implementation is hard to explain, it's a bad idea. If the implementation is easy to explain, it may be a good idea.", author: "The Zen of Python" }
  ];

  // Daily stable index calculation (changes every 24 hours at midnight)
  const getDailyIndex = () => {
    const d = new Date();
    const dayHash = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    return dayHash % QUOTES.length;
  };
  
  const dailyQuote = QUOTES[getDailyIndex()];

  const correctPin = import.meta.env.VITE_APP_PIN;

  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);
  
  useEffect(() => {
    const t = setTimeout(() => setShowPopup(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // Resize listener for responsive widget hiding
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const addRipple = (label, x = 50, y = 33) => {
    const id = Date.now() + Math.random();
    setRipples(p => [...p, { id, x, y, label }]);
    setTimeout(() => setRipples(p => p.filter(r => r.id !== id)), 700);
  };

  const handleKeyPress = (digit, e) => {
    if (unlocking || resisting) return;
    if (!correctPin) return;
    if (e) {
      const rect = e.currentTarget.getBoundingClientRect();
      addRipple(digit, e.clientX - rect.left, e.clientY - rect.top);
    } else { addRipple(digit); }
    setActiveKey(digit);
    setTimeout(() => setActiveKey(null), 160);
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      setError(false);
      if (next.length === 4) {
        if (next === correctPin) {
          setUnlocking(true);
        } else {
          setTimeout(() => {
            setResisting(true);
            setError(true);
            setErrorFlash(true);
            setCrtGlitch(true);
            setLaserActive(true);
            setErrorCount(c => {
              const nextErr = c + 1;
              if (nextErr >= 2) {
                setShowPopup(true);
              }
              return nextErr;
            });
            setPin('');
            setTimeout(() => setResisting(false), 720);
            setTimeout(() => {
              setErrorFlash(false);
              setCrtGlitch(false);
              setLaserActive(false);
            }, 1000);
          }, 90);
        }
      }
    }
  };

  const handleBackspace = (fromKb = false) => {
    if (unlocking || resisting) return;
    if (fromKb) { addRipple('⌫'); setActiveKey('⌫'); setTimeout(() => setActiveKey(null), 160); }
    setPin(p => p.slice(0, -1)); setError(false);
  };
  const handleClear = (fromKb = false) => {
    if (unlocking) return;
    if (fromKb) { addRipple('C'); setActiveKey('C'); setTimeout(() => setActiveKey(null), 160); }
    setPin(''); setError(false);
  };

  useEffect(() => {
    const onKey = e => {
      if (unlocking || resisting) return;
      if (e.key >= '0' && e.key <= '9') handleKeyPress(e.key);
      else if (e.key === 'Backspace') handleBackspace(true);
      else if (e.key === 'Escape') handleClear(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pin, unlocking, resisting]);

  const statusColor = error ? '#f87171' : 'rgba(148,163,184,0.45)';
  const statusText  = !correctPin ? 'PIN NOT CONFIGURED'
                    : error       ? `ACCESS DENIED  [${errorCount}]`
                    :               'Enter passcode';

  /* ── Keypad button ── */
  const KeypadBtn = ({ label, sub, onClick, variant = 'digit' }) => {
    const isActive  = activeKey === label;
    const myRipples = ripples.filter(r => r.label === label);
    const isGhost   = variant === 'ghost';
    const isDanger  = variant === 'danger';

    return (
      <button onClick={onClick} disabled={unlocking}
        className="pin-key relative overflow-hidden focus:outline-none cursor-pointer select-none"
        data-active={isActive ? 'true' : undefined}
        data-variant={variant}
        style={{
          height: 68, borderRadius: 20,
          transition: 'transform 0.12s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.15s ease, background 0.15s ease',
          transform: isActive ? 'scale(0.88)' : 'scale(1)',
          background: isGhost || isDanger
            ? isActive ? (isDanger ? 'rgba(239,68,68,0.12)' : 'rgba(56,189,248,0.10)') : 'rgba(255,255,255,0.02)'
            : isActive
              ? 'linear-gradient(145deg,rgba(56,189,248,0.22) 0%,rgba(14,165,233,0.16) 100%)'
              : 'linear-gradient(160deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.025) 100%)',
          border: isGhost || isDanger
            ? `1px solid ${isActive ? (isDanger ? 'rgba(239,68,68,0.35)' : 'rgba(56,189,248,0.35)') : 'rgba(255,255,255,0.05)'}`
            : `1px solid ${isActive ? 'rgba(56,189,248,0.50)' : 'rgba(255,255,255,0.08)'}`,
          boxShadow: isActive
            ? (isGhost || isDanger ? 'none' : '0 0 0 1px rgba(56,189,248,0.25), 0 0 28px rgba(56,189,248,0.20), inset 0 1px 0 rgba(255,255,255,0.14)')
            : (isGhost || isDanger ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 8px rgba(0,0,0,0.5)'),
        }}>
        {myRipples.map(r => (
          <span key={r.id} className="absolute rounded-full pointer-events-none"
            style={{ width: 100, height: 100, left: r.x - 50, top: r.y - 50,
              background: isDanger ? 'rgba(239,68,68,0.2)' : 'rgba(56,189,248,0.18)',
              animation: 'keyRipple 0.6s ease-out forwards' }} />
        ))}
        {variant === 'digit' ? (
          <div className="flex flex-col items-center justify-center" style={{ gap: 3 }}>
            <span style={{ fontSize: 24, fontWeight: 200, color: isActive ? '#fff' : 'rgba(226,232,240,0.9)', lineHeight: 1, letterSpacing: '-0.02em', fontFamily: "'Inter',sans-serif" }}>{label}</span>
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.2em', color: isActive ? 'rgba(125,211,252,0.9)' : 'rgba(148,163,184,0.28)', textTransform: 'uppercase' }}>{sub}</span>
          </div>
        ) : variant === 'ghost' ? (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: isActive ? '#7dd3fc' : 'rgba(100,116,139,0.55)' }}>CLR</span>
        ) : (
          <Delete size={16} style={{ color: isActive ? '#f87171' : 'rgba(100,116,139,0.6)', margin: 'auto' }} />
        )}
      </button>
    );
  };

  const keyDefs = ['1','2','3','4','5','6','7','8','9'];

  const mainPanelContent = (
    <div className={`w-full flex flex-col items-center ${resisting ? 'animate-slam-back' : ''}`}
      style={{
        maxWidth: 348, padding: '0 20px',
        gap: 32,
        pointerEvents: unlocking ? 'none' : 'auto',
      }}>

      {/* ── BRAND HEADER ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
        opacity: unlocking ? 0 : mounted ? 1 : 0,
        transform: unlocking ? 'scale(0.92) translateY(-10px)' : mounted ? 'scale(1)' : 'scale(0.8)',
        transition: 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s',
      }}>
        {/* Logo badge */}
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Outer animated ring */}
          <div className="lock-ring-outer" style={{
            position: 'absolute', inset: -28, borderRadius: 52,
            border: '1px solid rgba(56,189,248,0.14)',
          }} />
          {/* Mid ring */}
          <div style={{
            position: 'absolute', inset: -16, borderRadius: 42,
            border: '1px solid rgba(56,189,248,0.07)',
            background: 'radial-gradient(ellipse,rgba(56,189,248,0.03) 0%,transparent 70%)',
          }} />
          {/* Badge */}
          <div style={{
            width: 96, height: 96, borderRadius: 30,
            background: 'linear-gradient(145deg,rgba(10,18,34,0.95) 0%,rgba(6,11,22,0.98) 100%)',
            border: `1px solid ${error ? 'rgba(239,68,68,0.35)' : 'rgba(56,189,248,0.25)'}`,
            boxShadow: [
              '0 28px 56px rgba(0,0,0,0.8)',
              '0 0 0 1px rgba(255,255,255,0.04)',
              'inset 0 1px 0 rgba(255,255,255,0.07)',
              error ? '0 0 48px rgba(239,68,68,0.2)' : '0 0 40px rgba(56,189,248,0.15)',
            ].join(','),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 30,
              background: 'linear-gradient(145deg,rgba(255,255,255,0.05) 0%,transparent 55%)',
              pointerEvents: 'none',
            }} />
            <div style={{ width: 54, height: 54, filter: 'drop-shadow(0 4px 16px rgba(56,189,248,0.4))' }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" width="100%" height="100%">
                <defs>
                  <linearGradient id="lg1" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#0ea5e9" />
                    <stop offset="50%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#7dd3fc" />
                  </linearGradient>
                  <filter id="glow1"><feGaussianBlur stdDeviation="1.4" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
                </defs>
                <path d="M38 6C38 9.5 39.5 11 43 11C39.5 11 38 12.5 38 16C38 12.5 36.5 11 33 11C36.5 11 38 9.5 38 6Z" fill="url(#lg1)" filter="url(#glow1)"/>
                <rect x="8" y="38" width="10" height="3" rx="1.5" fill="url(#lg1)" opacity="0.4"/>
                <rect x="15" y="31" width="12" height="3" rx="1.5" fill="url(#lg1)" opacity="0.6"/>
                <rect x="22" y="24" width="14" height="3" rx="1.5" fill="url(#lg1)" opacity="0.8"/>
                <rect x="29" y="17" width="16" height="3" rx="1.5" fill="url(#lg1)" filter="url(#glow1)"/>
                <path d="M28 11.5C31.5 10.5 34.5 9 37.5 7.5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" filter="url(#glow1)"/>
                <path d="M19 28C21 21 24 16 27.5 12" stroke="#fff" strokeWidth="3" strokeLinecap="round" filter="url(#glow1)"/>
                <path d="M19 28C17.5 30.5 15.5 32 14.5 32.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
                <path d="M22 21C24.5 21.5 27 22.5 28.5 23.5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" filter="url(#glow1)"/>
                <circle cx="28" cy="8.5" r="3.5" fill="#fff" filter="url(#glow1)"/>
              </svg>
            </div>
          </div>
          {/* Halo glow */}
          <div style={{
            position: 'absolute', inset: -6, borderRadius: 36,
            background: error ? 'rgba(239,68,68,0.12)' : 'rgba(56,189,248,0.10)',
            filter: 'blur(22px)', zIndex: -1,
            transition: 'background 0.4s ease',
          }} />
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontSize: 28, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', margin: 0,
            background: 'linear-gradient(135deg,#ffffff 0%,#e0f2fe 35%,#7dd3fc 65%,#38bdf8 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            textShadow: '0 0 40px rgba(56,189,248,0.15)',
          }}>AnonVault</h1>
          <p style={{
            margin: '7px 0 0',
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.26em',
            textTransform: 'uppercase',
            color: 'rgba(56, 189, 248, 0.75)',
            textShadow: '0 0 16px rgba(56, 189, 248, 0.3)',
            fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          }}>AUTHORIZED GATEWAY FOR MINI ANON</p>
        </div>
      </div>

      {/* ── PIN DOTS ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        opacity: unlocking ? 0 : mounted ? 1 : 0,
        transform: unlocking ? 'scale(0.92) translateY(-10px)' : mounted ? 'translateY(0)' : 'translateY(15px)',
        transition: 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.22s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.22s',
      }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'center' }}>
          {[0,1,2,3].map(i => {
            const filled = i < pin.length;
            return (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: filled
                  ? (error ? 'linear-gradient(135deg,#f87171,#ef4444)' : 'linear-gradient(135deg,#38bdf8,#0ea5e9)')
                  : 'rgba(255,255,255,0.07)',
                border: `1px solid ${filled ? 'transparent' : 'rgba(255,255,255,0.12)'}`,
                boxShadow: filled
                  ? (error ? '0 0 12px rgba(248,113,113,0.75)' : '0 0 12px rgba(56,189,248,0.70)')
                  : 'none',
                transform: filled ? 'scale(1.2)' : 'scale(1)',
                transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)',
              }} />
            );
          })}
        </div>
        {/* Status */}
        <div style={{ minHeight: 14, textAlign: 'center' }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: statusColor, transition: 'color 0.3s ease',
            fontFamily: error ? "'JetBrains Mono','Courier New',monospace" : 'inherit',
          }}>{statusText}</span>
        </div>
      </div>

      {/* ── KEYPAD ── */}
      <div style={{
        width: '100%',
        background: 'linear-gradient(170deg,rgba(10,12,28,0.92) 0%,rgba(6,8,20,0.96) 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 32,
        padding: '22px 18px 18px',
        backdropFilter: 'blur(40px) saturate(160%)',
        WebkitBackdropFilter: 'blur(40px) saturate(160%)',
        boxShadow: '0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.06)',
        position: 'relative', overflow: 'hidden',
        opacity: unlocking ? 0 : mounted ? 1 : 0,
        transform: unlocking ? 'scale(0.9) translateY(15px)' : mounted ? 'translateY(0)' : 'translateY(35px)',
        transition: 'opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.35s, transform 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.35s',
      }}>
        {/* Inner top sheen */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 60,
          background: 'linear-gradient(to bottom,rgba(56,189,248,0.03) 0%,transparent 100%)',
          borderRadius: '32px 32px 0 0', pointerEvents: 'none',
        }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 11, marginBottom: 11 }}>
          {keyDefs.map(d => <KeypadBtn key={d} label={d} onClick={e => handleKeyPress(d, e)} variant="digit" />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 11 }}>
          <KeypadBtn label="C" variant="ghost" onClick={() => handleClear()} />
          <KeypadBtn label="0" onClick={e => handleKeyPress('0', e)} variant="digit" />
          <KeypadBtn label="⌫" variant="danger" onClick={() => handleBackspace()} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center select-none relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 120% 120% at 50% -10%, #08101e 0%, #05080f 55%, #020408 100%)',
               fontFamily: "'Plus Jakarta Sans',system-ui,-apple-system,sans-serif" }}>

      {/* ── TODAY'S QUOTE WIDGET (Top Right, Desktop Only) ── */}
      {windowWidth >= 1200 && (
        <div style={{
          position: 'absolute', top: 32, right: 32, zIndex: 20, width: 340,
          display: 'flex', flexDirection: 'column', gap: 14,
          padding: '20px', borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(10, 15, 30, 0.6) 0%, rgba(5, 8, 16, 0.8) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.15)',
          boxShadow: '0 20px 45px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          opacity: unlocking ? 0 : mounted ? 1 : 0,
          transform: unlocking ? 'scale(0.9) translateY(-10px)' : mounted ? 'scale(1)' : 'scale(0.85)',
          transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.25s',
        }}>
          {/* Widget Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
            <span style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: 'rgba(148, 163, 184, 0.65)',
              textTransform: 'uppercase',
              fontFamily: "'Plus Jakarta Sans', sans-serif"
            }}>
              TODAY'S QUOTE
            </span>
          </div>

          {/* Quote Body */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60, justifyContent: 'center' }}>
            <p style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.6,
              fontWeight: 400,
              fontStyle: 'italic',
              color: 'rgba(255, 255, 255, 0.95)',
              fontFamily: "'Lora', Georgia, serif"
            }}>
              "{dailyQuote.text}"
            </p>
            <span style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: 'rgba(255, 255, 255, 0.65)',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              alignSelf: 'flex-end',
              marginTop: 4
            }}>
              — {dailyQuote.author}
            </span>
          </div>
        </div>
      )}

      {/* ═══ CINEMATIC BACKGROUND ═══ */}
      <div className="absolute inset-0 pointer-events-none" style={{ overflow: 'hidden' }}>

        {/* Aurora orbs — sky blue */}
        <div className="lock-orb" style={{
          top: '-15%', left: '-10%', width: '75%', height: '75%',
          background: 'radial-gradient(ellipse,rgba(14,116,194,0.35) 0%,rgba(7,89,133,0.15) 45%,transparent 70%)',
          filter: 'blur(90px)',
        }} />
        <div className="lock-orb lock-orb--slow" style={{
          bottom: '-18%', right: '-12%', width: '70%', height: '70%',
          background: 'radial-gradient(ellipse,rgba(56,189,248,0.22) 0%,rgba(14,165,233,0.10) 45%,transparent 70%)',
          filter: 'blur(100px)',
        }} />
        <div className="lock-orb" style={{
          top: '30%', right: '-8%', width: '45%', height: '55%',
          background: 'radial-gradient(ellipse,rgba(99,102,241,0.12) 0%,rgba(56,189,248,0.05) 55%,transparent 75%)',
          filter: 'blur(70px)', animationDelay: '-5s',
        }} />

        {/* Perspective grid floor — sky blue */}
        <div style={{
          position: 'absolute', bottom: 0, left: '50%',
          width: '260%', height: '50%',
          backgroundImage: `
            repeating-linear-gradient(90deg, rgba(56,189,248,0.07) 0px, transparent 1px, transparent 80px, rgba(56,189,248,0.07) 81px),
            repeating-linear-gradient(0deg,  rgba(56,189,248,0.05) 0px, transparent 1px, transparent 60px, rgba(56,189,248,0.05) 61px)
          `,
          transformOrigin: 'bottom center',
          transform: 'translateX(-50%) perspective(500px) rotateX(58deg)',
          maskImage: 'linear-gradient(to top, rgba(0,0,0,0.15) 0%, transparent 80%)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.15) 0%, transparent 80%)',
          opacity: 0.55,
        }} />


        {/* Left data stream — sky blue tones */}
        <div style={{
          position: 'absolute', left: 20, top: 0, bottom: 0, width: 72,
          display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 40,
          maskImage: 'linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.5) 18%,rgba(0,0,0,0.5) 82%,transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.5) 18%,rgba(0,0,0,0.5) 82%,transparent 100%)',
          opacity: unlocking ? 0 : 1,
          transform: unlocking ? 'translateX(-24px)' : 'translateX(0)',
          transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          {STREAM_LEFT.map((t, i) => (
            <div key={i} style={{
              fontSize: 8, fontFamily: "'JetBrains Mono','Courier New',monospace",
              color: i % 3 === 0 ? 'rgba(56,189,248,0.22)' : 'rgba(56,189,248,0.11)',
              letterSpacing: '0.05em',
              animation: `lockStream ${12 + i * 0.5}s linear infinite`,
              animationDelay: `${-(i * 0.9)}s`,
            }}>{t}</div>
          ))}
        </div>

        {/* Right data stream */}
        <div style={{
          position: 'absolute', right: 20, top: 0, bottom: 0, width: 72,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 9, paddingTop: 80,
          maskImage: 'linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.5) 18%,rgba(0,0,0,0.5) 82%,transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.5) 18%,rgba(0,0,0,0.5) 82%,transparent 100%)',
          opacity: unlocking ? 0 : 1,
          transform: unlocking ? 'translateX(24px)' : 'translateX(0)',
          transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          {STREAM_RIGHT.map((t, i) => (
            <div key={i} style={{
              fontSize: 8, fontFamily: "'JetBrains Mono','Courier New',monospace",
              color: i % 3 === 0 ? 'rgba(125,211,252,0.22)' : 'rgba(125,211,252,0.11)',
              letterSpacing: '0.05em',
              animation: `lockStream ${14 + i * 0.45}s linear infinite`,
              animationDelay: `${-(i * 1.1)}s`,
            }}>{t}</div>
          ))}
        </div>

        {/* Dot grid */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.05) 1px,transparent 1px)',
          backgroundSize: '30px 30px', opacity: 0.8,
        }} />
        {/* Vignette */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse 75% 75% at 50% 50%,transparent 28%,rgba(2,3,8,0.88) 100%)',
        }} />
        <div className="absolute inset-x-0 top-0 h-44"
          style={{ background: 'linear-gradient(to bottom,rgba(2,3,8,0.95) 0%,transparent 100%)' }} />
        <div className="absolute inset-x-0 bottom-0 h-44"
          style={{ background: 'linear-gradient(to top,rgba(2,3,8,0.95) 0%,transparent 100%)' }} />
      </div>

      {/* ═══ WRONG PIN EFFECTS (CRT, LASER, VIGNETTE) ═══ */}
      {crtGlitch && <div className="crt-noise-overlay animate-crt-flicker" />}
      {laserActive && <div className="lock-laser-line" />}
      {errorFlash && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          <div className="lock-error-vignette absolute inset-0" style={{
            background: 'radial-gradient(ellipse 110% 110% at 50% 50%,transparent 25%,rgba(239,68,68,0.32) 100%)',
          }} />
          <div className="lock-error-border absolute inset-0" style={{
            boxShadow: 'inset 0 0 0 2px rgba(239,68,68,0.6), inset 0 0 60px rgba(239,68,68,0.12)',
          }} />
          <div className="lock-denied-badge" style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)', textAlign: 'center',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 22px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.5)',
              borderRadius: 6,
              backdropFilter: 'blur(12px)',
            }}>
              <span style={{ fontSize: 14, color: '#f87171' }}>✕</span>
              <span className="lock-warning-glitch" style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.4em',
                color: '#f87171', textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono','Courier New',monospace",
                textShadow: '0 0 16px rgba(239,68,68,0.8),0 0 40px rgba(239,68,68,0.3)',
              }}>Access Denied</span>
            </div>
          </div>
        </div>
      )}
      {/* ═══ ACCESS GRANTED OVERLAY ═══ */}
      {unlocking && (
        <AccessGranted onComplete={targetTab => { sessionStorage.setItem('minianon_authorized','true'); onAuthorize(targetTab); }} />
      )}

      {/* ═══ MAIN CONTENT (no vault door split) ═══ */}
      <div className="relative z-10" style={{ pointerEvents: unlocking ? 'none' : 'auto' }}>
        {mainPanelContent}
      </div>

      {/* ── FOOTER ── */}
      <div className="absolute bottom-6 z-10 text-center"
        style={{ opacity: unlocking ? 0 : mounted ? 1 : 0, transition: 'opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.6s' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 20px',
          borderRadius: 99,
          background: 'linear-gradient(135deg, rgba(10, 15, 30, 0.55) 0%, rgba(5, 7, 14, 0.75) 100%)',
          border: errorCount >= 2 ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(56, 189, 248, 0.12)',
          boxShadow: errorCount >= 2
            ? '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 16px rgba(245, 158, 11, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.02)'
            : '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.02)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = errorCount >= 2 ? 'rgba(245, 158, 11, 0.5)' : 'rgba(56, 189, 248, 0.28)';
          e.currentTarget.style.boxShadow = errorCount >= 2
            ? '0 12px 40px rgba(0, 0, 0, 0.5), 0 0 24px rgba(245, 158, 11, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.04)'
            : '0 12px 40px rgba(56, 189, 248, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.04)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = errorCount >= 2 ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.12)';
          e.currentTarget.style.boxShadow = errorCount >= 2
            ? '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 16px rgba(245, 158, 11, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.02)'
            : '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.02)';
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: errorCount >= 2 ? '#f59e0b' : '#38bdf8',
            boxShadow: errorCount >= 2 ? '0 0 8px #f59e0b' : '0 0 8px #38bdf8',
            animation: 'lockSweep 3s infinite ease-in-out',
          }} />
          <p style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'rgba(148, 163, 184, 0.8)',
            margin: 0,
            letterSpacing: '0.02em',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontFamily: "'Plus Jakarta Sans', sans-serif"
          }}>
            Need the lock status passcode?
            <a href="https://link.minianon.in/tusharbhardwaj" target="_blank" rel="noopener noreferrer"
              style={{
                color: errorCount >= 2 ? '#f59e0b' : '#38bdf8',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                marginLeft: 2,
                borderBottom: '1px solid transparent',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.borderBottomColor = 'rgba(255, 255, 255, 0.4)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = errorCount >= 2 ? '#f59e0b' : '#38bdf8';
                e.currentTarget.style.borderBottomColor = 'transparent';
              }}>
              Contact Mini Anon <span style={{ fontSize: 10 }}>→</span>
            </a>
          </p>
        </div>
      </div>

      {/* ── MINI ANON POPUP ── */}
      {showPopup && !unlocking && (
        <div className="fixed bottom-6 right-6 z-30 animate-popup"
             style={{ width: 288, transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          <div style={{
            position: 'relative', display: 'flex', flexDirection: 'column', gap: 12,
            padding: '18px 18px', borderRadius: 24,
            background: 'linear-gradient(135deg, rgba(10,15,30,0.92) 0%, rgba(6,10,20,0.96) 100%)',
            border: errorCount >= 2 ? '1px solid rgba(245,158,11,0.28)' : '1px solid rgba(56,189,248,0.18)',
            boxShadow: errorCount >= 2
              ? '0 24px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 30px rgba(245,158,11,0.05)'
              : '0 24px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 30px rgba(56,189,248,0.03)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = errorCount >= 2 ? 'rgba(245,158,11,0.45)' : 'rgba(56,189,248,0.35)';
            e.currentTarget.style.boxShadow = errorCount >= 2
              ? '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 40px rgba(245,158,11,0.12)'
              : '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 40px rgba(56,189,248,0.08)';
            e.currentTarget.style.transform = 'translateY(-4px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = errorCount >= 2 ? 'rgba(245,158,11,0.28)' : 'rgba(56,189,248,0.18)';
            e.currentTarget.style.boxShadow = errorCount >= 2
              ? '0 24px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 30px rgba(245,158,11,0.05)'
              : '0 24px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 30px rgba(56,189,248,0.03)';
            e.currentTarget.style.transform = 'none';
          }}>
            <div style={{
              position: 'absolute', top: -10, left: 10, width: 60, height: 60,
              background: errorCount >= 2 
                ? 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(56,189,248,0.18) 0%, transparent 70%)',
              filter: 'blur(10px)', pointerEvents: 'none'
            }} />
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: errorCount >= 2
                    ? 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0.05) 100%)'
                    : 'linear-gradient(135deg, rgba(56,189,248,0.15) 0%, rgba(14,165,233,0.05) 100%)',
                  border: errorCount >= 2 ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(56,189,248,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: errorCount >= 2 ? '0 0 12px rgba(245,158,11,0.1)' : '0 0 12px rgba(56,189,248,0.1)',
                  transition: 'all 0.3s ease'
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke={errorCount >= 2 ? '#f59e0b' : '#38bdf8'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                    {errorCount >= 2 ? (
                      <>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 16v-4"></path>
                        <path d="M12 8h.01"></path>
                      </>
                    )}
                  </svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: errorCount >= 2 ? '#f59e0b' : '#38bdf8', textTransform: 'uppercase', fontFamily: "'JetBrains Mono',monospace", transition: 'color 0.3s ease' }}>
                    {errorCount >= 2 ? 'RESTRICTED' : 'VAULT NODE'}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                    {errorCount >= 2 ? 'Key Requested' : 'Secure Environment'}
                  </span>
                </div>
              </div>
              
              <button onClick={() => setShowPopup(false)}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  color: 'rgba(148,163,184,0.6)',
                  cursor: 'pointer',
                  width: 24, height: 24, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.12)';
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)';
                  e.currentTarget.style.color = '#ef4444';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = 'rgba(148,163,184,0.6)';
                }}>✕</button>
            </div>

            <p style={{ margin: '4px 0 4px', fontSize: 11.5, color: 'rgba(148,163,184,0.85)', lineHeight: 1.5, fontWeight: 400 }}>
              {errorCount >= 2 ? (
                <>
                  It looks like you've entered the wrong passcode. Contact the <strong style={{ color: '#fff', fontWeight: 600 }}>Orchestrator</strong> to obtain a custom credentials token.
                </>
              ) : (
                <>
                  Don't know <strong style={{ color: '#fff', fontWeight: 600 }}>Mini Anon</strong>? This workspace is secure, sandboxed, and optimized for private task orchestration.
                </>
              )}
            </p>

            <a href={errorCount >= 2 ? 'https://link.minianon.in/tusharbhardwaj' : 'https://minianon.in'} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 12px', borderRadius: 12,
                background: errorCount >= 2
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(217,119,6,0.05) 100%)'
                  : 'linear-gradient(135deg, rgba(56,189,248,0.1) 0%, rgba(14,165,233,0.05) 100%)',
                border: errorCount >= 2 ? '1px solid rgba(245,158,11,0.22)' : '1px solid rgba(56,189,248,0.22)',
                fontSize: 11, fontWeight: 600, color: errorCount >= 2 ? '#f59e0b' : '#38bdf8', textDecoration: 'none',
                transition: 'all 0.2s ease',
                boxShadow: errorCount >= 2 ? '0 4px 12px rgba(245,158,11,0.03)' : '0 4px 12px rgba(56,189,248,0.03)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = errorCount >= 2
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(217,119,6,0.1) 100%)'
                  : 'linear-gradient(135deg, rgba(56,189,248,0.2) 0%, rgba(14,165,233,0.1) 100%)';
                e.currentTarget.style.borderColor = errorCount >= 2 ? 'rgba(245,158,11,0.45)' : 'rgba(56,189,248,0.4)';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.boxShadow = errorCount >= 2 ? '0 4px 16px rgba(245,158,11,0.15)' : '0 4px 16px rgba(56,189,248,0.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = errorCount >= 2
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(217,119,6,0.05) 100%)'
                  : 'linear-gradient(135deg, rgba(56,189,248,0.1) 0%, rgba(14,165,233,0.05) 100%)';
                e.currentTarget.style.borderColor = errorCount >= 2 ? 'rgba(245,158,11,0.22)' : 'rgba(56,189,248,0.22)';
                e.currentTarget.style.color = errorCount >= 2 ? '#f59e0b' : '#38bdf8';
                e.currentTarget.style.boxShadow = errorCount >= 2 ? '0 4px 12px rgba(245,158,11,0.03)' : '0 4px 12px rgba(56,189,248,0.03)';
              }}>
              {errorCount >= 2 ? 'Contact Mini Anon' : 'Discover Mini Anon'} <span style={{ transition: 'transform 0.2s ease' }}>→</span>
            </a>
          </div>
        </div>
      )}
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
  const [initProjectId, setInitProjectId] = useState(null);
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
      setTimeout(() => setShowLockScreen(false), 700),
      // drop the reveal class once the cascade is done, so the settled
      // transform stops acting as a containing block for the fixed sidebar
      setTimeout(() => setRevealing(false), 1700),
    ];
  };

  // Data states
  const [applications, setApplications] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [projectIdeas, setProjectIdeas] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [usingLocalProjectIdeas, setUsingLocalProjectIdeas] = useState(false);
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
      const [appsData, ideasData, quotesData] = await Promise.all([
        fetchApplications().catch(err => {
          console.error('Error fetching applications:', err);
          return [];
        }),
        fetchIdeas().catch(err => {
          console.error('Error fetching ideas:', err);
          return [];
        }),
        fetchQuotes().catch(err => {
          console.error('Error fetching quotes:', err);
          return [];
        }),
        // Eagerly populate the tasks cache so the sidebar count is correct immediately
        loadAllTasks().catch(err => {
          console.warn('Could not pre-fetch tasks for sidebar count:', err);
        }),
        // Daily notes are local-first; this just refreshes the local cache
        // from any other device. Never rejects.
        syncNotes(),
      ]);

      setApplications(appsData);
      setIdeas(ideasData);
      setQuotes(quotesData);

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
        setUsingLocalProjectIdeas(false);
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
        if (!stored || stored.length === 0) {
          stored = [
            {
              id: '1',
              title: "AnonVault E2E Sync",
              content: "Implement local-first offline synchronization for secure document vaults with encrypted cloud backup tunnels.",
              tags: ["security", "indexeddb", "aesgcm", "supabase"],
              images: [],
              links: [{ url: "https://supabase.com", label: "Supabase Core" }],
              created_at: new Date().toISOString()
            },
            {
              id: '2',
              title: "Localized AI Agent Workspace",
              content: "A fast, privacy-focused browser extension running dynamic Llama3 completions via local Ollama services.",
              tags: ["aiml", "webgpu", "react", "ollama"],
              images: [],
              links: [],
              created_at: new Date(Date.now() - 86400000).toISOString()
            },
            {
              id: '3',
              title: "P2P Ephemeral Share Link",
              content: "Create anonymous peer-to-peer file transfer links that establish direct WebRTC tunnels for large file shares.",
              tags: ["webapp", "webrtc", "socketio", "vite"],
              images: [],
              links: [],
              created_at: new Date(Date.now() - 172800000).toISOString()
            }
          ];
          localStorage.setItem('anonvault_project_ideas', JSON.stringify(stored));
          try {
            localStorage.setItem(CONCEPTS_CACHE_KEY, String(stored.length));
          } catch { /* briefing tile just stays at its last value */ }
        }
        setProjectIdeas(stored);
        setProjectIdeasCount(stored.length);
        setUsingLocalProjectIdeas(true);
      }

      // Refresh pending task count now that the cache is warm
      setTaskStats(computeTaskStats());
      
      if (!didSyncRef.current) {
        showToast('success', 'Vault Synced', 'All data loaded successfully.');
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
    try {
      const added = await addIdea(newIdea);
      setIdeas(prev => [added, ...prev]);
      showToast('success', 'Idea Captured', `"${added.title}" has been saved to the vault.`);
      return added;
    } catch (err) {
      console.error('Failed to add idea:', err);
      showToast('error', 'Capture Failed', 'Could not save idea. Check your Supabase table.');
    }
  };

  const handleUpdateIdea = async (id, updates) => {
    try {
      const updated = await updateIdea(id, updates);
      setIdeas(prev => prev.map(idea => idea.id === id ? updated : idea));
      showToast('success', 'Idea Updated', `"${updated.title}" has been saved.`);
    } catch (err) {
      console.error('Failed to update idea:', err);
      showToast('error', 'Update Failed', 'Could not update the idea.');
    }
  };

  const handleDeleteIdea = async (id) => {
    try {
      const target = ideas.find(i => i.id === id);
      await deleteIdea(id);
      setIdeas(prev => prev.filter(idea => idea.id !== id));
      withUndo('Idea Deleted', target?.title || 'Idea', () => handleAddIdea({
        title: target?.title, content: target?.content || '',
        images: target?.images || [], links: target?.links || [],
        tags: target?.tags || [],
      }));
    } catch (err) {
      console.error('Failed to delete idea:', err);
      showToast('error', 'Delete Failed', 'Could not remove the idea.');
    }
  };

  // --- Project Ideas Handlers ---

  // Which vault ideas already became concepts. Derived rather than stored:
  // promoted_from on the concept is the single source of truth.
  const promotedMap = (projectIdeas || []).reduce((acc, p) => {
    if (p && p.promoted_from) acc[p.promoted_from] = p.id;
    return acc;
  }, {});

  // Returns whether the concept was actually created. The vault uses that to
  // decide whether to clear the idea out of its active list — a failed
  // promotion must not make the idea disappear.
  const handlePromoteToProject = async idea => {
    if (!idea) return false;
    try {
      await handleAddProjectIdea({
        title: idea.title,
        content: idea.content || '',
        images: idea.images || [],
        links: idea.links || [],
        tags: idea.tags || [],
        status: 'backlog',
        promoted_from: idea.id,
      });
      setActiveTab('project-ideas');
      showToast('success', 'Promoted', `"${idea.title}" moved to Project Ideas.`);
      return true;
    } catch (err) {
      console.error('Failed to promote idea:', err);
      showToast('error', 'Promote Failed', 'Could not create the concept.');
      return false;
    }
  };

  const handleAddProjectIdea = async (newIdea) => {
    if (usingLocalProjectIdeas) {
      const added = {
        id: Date.now().toString(),
        ...newIdea,
        created_at: new Date().toISOString()
      };
      setProjectIdeas(prev => {
        const updated = [added, ...prev];
        localStorage.setItem('anonvault_project_ideas', JSON.stringify(updated));
        setProjectIdeasCount(updated.length);
        return updated;
      });
      showToast('success', 'Concept Created (Local)', `"${newIdea.title}" added to local workspace.`);
      return added;
    }

    try {
      const added = await addProjectIdea(newIdea);
      setProjectIdeas(prev => [added, ...prev]);
      setProjectIdeasCount(prev => prev + 1);
      showToast('success', 'Concept Created', `"${added.title}" added to workspace.`);
      return added;
    } catch (err) {
      console.error('Failed to add project idea:', err);
      showToast('error', 'Capture Failed', 'Could not save concept to Supabase.');
    }
  };

  const handleUpdateProjectIdea = async (id, updates) => {
    if (usingLocalProjectIdeas) {
      setProjectIdeas(prev => {
        const updated = prev.map(item => item.id === id ? { ...item, ...updates } : item);
        localStorage.setItem('anonvault_project_ideas', JSON.stringify(updated));
        return updated;
      });
      showToast('success', 'Concept Saved (Local)', `"${updates.title}" has been updated locally.`);
      return;
    }

    try {
      const updated = await updateProjectIdea(id, updates);
      setProjectIdeas(prev => prev.map(item => item.id === id ? updated : item));
      showToast('success', 'Concept Saved', `"${updated.title}" has been updated.`);
    } catch (err) {
      console.error('Failed to update project idea:', err);
      showToast('error', 'Update Failed', 'Could not save changes. Check your connection.');
    }
  };

  const handleDeleteProjectIdea = async (id) => {
    const target = projectIdeas.find(item => item.id === id);
    const title = target ? target.title : 'Concept';

    if (usingLocalProjectIdeas) {
      setProjectIdeas(prev => {
        const updated = prev.filter(item => item.id !== id);
        localStorage.setItem('anonvault_project_ideas', JSON.stringify(updated));
        setProjectIdeasCount(updated.length);
        return updated;
      });
      showToast('warning', 'Concept Removed (Local)', `"${title}" has been deleted locally.`);
      return;
    }

    try {
      await deleteProjectIdea(id);
      setProjectIdeas(prev => prev.filter(item => item.id !== id));
      setProjectIdeasCount(prev => prev - 1);
      showToast('warning', 'Concept Removed', `"${title}" has been deleted.`);
    } catch (err) {
      console.error('Failed to delete project idea:', err);
      showToast('error', 'Delete Failed', 'Could not delete concept.');
    }
  };

  const handleReorderProjectIdeas = (reordered) => {
    setProjectIdeas(reordered);
    if (usingLocalProjectIdeas) {
      localStorage.setItem('anonvault_project_ideas', JSON.stringify(reordered));
    } else {
      const idOrder = reordered.map(item => item.id);
      localStorage.setItem('anonvault_project_ideas_order', JSON.stringify(idOrder));
    }
  };

  // --- Quote Handlers ---

  const handleAddQuote = async (newQuote) => {
    try {
      const added = await addQuote(newQuote);
      setQuotes(prev => [added, ...prev]);
      return added;
    } catch (err) {
      console.error('Failed to add quote:', err);
      showToast('error', 'Add Failed', 'Could not save the quote.');
      throw err;
    }
  };

  const handleUpdateQuote = async (id, updates) => {
    try {
      const updated = await updateQuote(id, updates);
      setQuotes(prev => prev.map(q => q.id === id ? updated : q));
      return updated;
    } catch (err) {
      console.error('Failed to update quote:', err);
      showToast('error', 'Update Failed', 'Could not update the quote.');
      throw err;
    }
  };

  const handleDeleteQuote = async (id) => {
    try {
      const target = quotes.find(q => q.id === id);
      await deleteQuote(id);
      setQuotes(prev => prev.filter(q => q.id !== id));
      withUndo('Quote Removed', (target?.text || 'Quote').slice(0, 40), () => handleAddQuote({
        text: target?.text, author: target?.author, category: target?.category,
        tags: target?.tags || [], source: target?.source || '',
      }));
    } catch (err) {
      console.error('Failed to delete quote:', err);
      showToast('error', 'Delete Failed', 'Could not delete the quote.');
    }
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

    const TABS = ['dashboard', 'tasks', 'timeline', 'ideas', 'project-ideas', 'review', 'quotes'];

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

      if (e.key >= '1' && e.key <= '7') {
        e.preventDefault();
        setActiveTab(TABS[Number(e.key) - 1]);
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

  const handleQuickAddTask = async title => {
    if (!title) return;
    try {
      await addTask({
        title,
        is_recurring: false,
        date: todayDateStr(),
        priority: 'medium',
        subtasks: [],
      });
      refreshPendingTasks();
      showToast('success', 'Task Added', `"${title}" added to today.`);
    } catch (err) {
      console.error('Quick add task failed:', err);
      showToast('error', 'Add Failed', 'Could not create the task.');
    }
  };

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
    totalQuotes: (quotes || []).length,
  };


  return (
    <div className="flex w-screen h-screen overflow-hidden bg-slate-950 font-sans relative">
      
      {/* Dashboard wrapper — .app-reveal stages the post-unlock entrance */}
      <div className={`flex w-full h-full overflow-hidden ${revealing ? 'app-reveal' : ''}`}
        style={{
          // While revealing, the .app-reveal cascade drives opacity and
          // transform; this only keeps the dashboard hidden until handover.
          opacity: lockFadeOut || !showLockScreen ? 1 : 0,
          transition: revealing ? 'none' : 'opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: showLockScreen && !lockFadeOut ? 'none' : 'auto',
        }}>
        
        {/* Sidebar Navigation Panel */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab} 
          stats={stats}
          mobileOpen={mobileMenuOpen}
          setMobileOpen={setMobileMenuOpen}
        />

        {/* Main View Container */}
        <main className="flex-1 h-full overflow-hidden flex flex-col relative">
          {errorMsg && (
            <div className="px-8 py-3 bg-rose-500/10 border-b border-rose-500/20 text-xs font-semibold text-rose-400 flex items-center justify-between shrink-0">
              <span>{errorMsg}</span>
              <button 
                onClick={() => { didSyncRef.current = false; loadData(); }}
                className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-350 border border-rose-500/20 rounded font-medium transition-colors"
              >
                Retry Sync
              </button>
            </div>
          )}

          <ErrorBoundary>
            <div className="relative flex-1 h-full w-full overflow-hidden">
              {/* Summary Dashboard Workspace */}
              <div
                data-tabreveal={activeTab === 'dashboard' && tabRevealOn ? 'on' : undefined}
                className={`absolute inset-0 transition-all duration-300 ease-out ${
                activeTab === 'dashboard'
                  ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                  : 'opacity-0 translate-y-4 scale-[0.985] pointer-events-none'
              }`}>
                <DashboardView 
                  applications={applications}
                  ideas={ideas}
                  projectIdeas={projectIdeas}
                  quotes={quotes}
                  onTasksChange={refreshPendingTasks}
                  tasksVersion={tasksVersion}
                  setActiveTab={setActiveTab}
                  onMenuToggle={() => setMobileMenuOpen(true)}
                  onSelectIdea={(id) => { setInitIdeaId(id); setActiveTab('ideas'); }}
                  onSelectProject={(id) => { setInitProjectId(id); setActiveTab('project-ideas'); }}
                  onSelectHackathon={(id) => { setInitHackathonId(id); setActiveTab('timeline'); }}
                />
              </div>

              {/* Hackathon Timeline Workspace */}
              <div
                data-tabreveal={activeTab === 'timeline' && tabRevealOn ? 'on' : undefined}
                className={`absolute inset-0 transition-all duration-300 ease-out ${
                activeTab === 'timeline'
                  ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                  : 'opacity-0 translate-y-4 scale-[0.985] pointer-events-none'
              }`}>
                <TimelineView 
                  applications={applications}
                  onAdd={handleAddApplication}
                  onUpdate={handleUpdateApplication}
                  onDelete={handleDeleteApplication}
                  loading={loading}
                  onLock={handleLock}
                  showToast={showToast}
                  onMenuToggle={() => setMobileMenuOpen(true)}
                  tasksVersion={tasksVersion}
                  setActiveTab={setActiveTab}
                  onCreateChecklist={handleCreateChecklist}
                  initialSelectedAppId={initHackathonId}
                  onClearInitialSelectedApp={() => setInitHackathonId(null)}
                />
              </div>

              {/* Idea Vault Workspace */}
              <div
                data-tabreveal={activeTab === 'ideas' && tabRevealOn ? 'on' : undefined}
                className={`absolute inset-0 transition-all duration-300 ease-out ${
                activeTab === 'ideas'
                  ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                  : 'opacity-0 translate-y-4 scale-[0.985] pointer-events-none'
              }`}>
                <IdeaVaultView 
                  ideas={ideas}
                  onAdd={handleAddIdea}
                  onUpdate={handleUpdateIdea}
                  onDelete={handleDeleteIdea}
                  loading={loading}
                  onLock={handleLock}
                  showToast={showToast}
                  onMenuToggle={() => setMobileMenuOpen(true)}
                  onPromoteToProject={handlePromoteToProject}
                  promotedMap={promotedMap}
                  onOpenConcept={id => { setInitProjectId(id); setActiveTab('project-ideas'); }}
                  initialSelectedIdeaId={initIdeaId}
                  onClearInitialSelectedIdea={() => setInitIdeaId(null)}
                />
              </div>

              {/* Daily Checklist Workspace */}
              <div
                data-tabreveal={activeTab === 'tasks' && tabRevealOn ? 'on' : undefined}
                className={`absolute inset-0 transition-all duration-300 ease-out ${
                activeTab === 'tasks'
                  ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                  : 'opacity-0 translate-y-4 scale-[0.985] pointer-events-none'
              }`}>
                <TasksView
                  applications={applications}
                  initialDate={initTaskDate}
                  onClearInitialDate={() => setInitTaskDate(null)}
                  showToast={showToast}
                  onTasksChange={refreshPendingTasks}
                  tasksVersion={tasksVersion}
                  onLock={handleLock}
                  onMenuToggle={() => setMobileMenuOpen(true)}
                />
              </div>

              {/* Project Ideas Workspace */}
              <div
                data-tabreveal={activeTab === 'project-ideas' && tabRevealOn ? 'on' : undefined}
                className={`absolute inset-0 transition-all duration-300 ease-out ${
                activeTab === 'project-ideas'
                  ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                  : 'opacity-0 translate-y-4 scale-[0.985] pointer-events-none'
              }`}>
                <ProjectIdeasView
                  ideas={projectIdeas}
                  onAdd={handleAddProjectIdea}
                  onUpdate={handleUpdateProjectIdea}
                  onDelete={handleDeleteProjectIdea}
                  onReorder={handleReorderProjectIdeas}
                  loading={loading}
                  onLock={handleLock}
                  showToast={showToast}
                  onMenuToggle={() => setMobileMenuOpen(true)}
                  initialSelectedIdeaId={initProjectId}
                  onClearInitialSelectedIdea={() => setInitProjectId(null)}
                />
              </div>

              {/* Review Workspace */}
              <div
                data-tabreveal={activeTab === 'review' && tabRevealOn ? 'on' : undefined}
                className={`absolute inset-0 transition-all duration-300 ease-out ${
                activeTab === 'review'
                  ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                  : 'opacity-0 translate-y-4 scale-[0.985] pointer-events-none'
              }`}>
                <ReviewView
                  applications={applications}
                  projectIdeas={projectIdeas}
                  onLock={handleLock}
                  onMenuToggle={() => setMobileMenuOpen(true)}
                  setActiveTab={setActiveTab}
                  onPickDate={date => { setInitTaskDate(date); setActiveTab('tasks'); }}
                />
              </div>

              {/* Quotes Vault Workspace */}
              <div
                data-tabreveal={activeTab === 'quotes' && tabRevealOn ? 'on' : undefined}
                className={`absolute inset-0 transition-all duration-300 ease-out ${
                activeTab === 'quotes'
                  ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                  : 'opacity-0 translate-y-4 scale-[0.985] pointer-events-none'
              }`}>
                <QuotesView
                  ideas={quotes}
                  onAdd={handleAddQuote}
                  onUpdate={handleUpdateQuote}
                  onDelete={handleDeleteQuote}
                  loading={loading}
                  onLock={handleLock}
                  showToast={showToast}
                  onMenuToggle={() => setMobileMenuOpen(true)}
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
        quotes={quotes}
        setActiveTab={setActiveTab}
        onSelectIdea={id => { setInitIdeaId(id); setActiveTab('ideas'); }}
        onSelectProject={id => { setInitProjectId(id); setActiveTab('project-ideas'); }}
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
          // Collapses onto the lock emblem (~41% down) so the dashboard is
          // uncovered from the edges inward and the emblem is the last thing
          // to go — the two screens share a pivot instead of cross-fading.
          clipPath: lockFadeOut
            ? 'circle(0% at 50% 41%)'
            : 'circle(150% at 50% 41%)',
          transform: lockFadeOut ? 'scale(1.03)' : 'scale(1)',
          filter: lockFadeOut ? 'blur(6px)' : 'blur(0px)',
          // The opacity leg is a late fallback for browsers that skip the
          // clip-path animation; by then the aperture has already closed.
          transition: 'clip-path 0.66s cubic-bezier(0.7, 0, 0.3, 1), transform 0.66s cubic-bezier(0.7, 0, 0.3, 1), filter 0.5s ease-out, opacity 0.2s ease-out 0.5s',
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
      <AppInner />
    </ToastProvider>
  );
}

export default App;
