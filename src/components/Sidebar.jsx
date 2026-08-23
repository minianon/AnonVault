import React, { useState, useEffect, useRef } from 'react';
import { CalendarRange, Lightbulb, TrendingUp, CheckSquare, X, Zap, ChevronLeft, ChevronRight, Rocket, Quote, LayoutDashboard, Pin, BarChart3, Hash } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, stats, mobileOpen, setMobileOpen }) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('anonvault_sidebar_collapsed') === 'true';
  });

  const toggleCollapse = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem('anonvault_sidebar_collapsed', String(nextState));
  };

  const pending = stats.pendingTasks || 0;
  const total = stats.totalTasks || 0;
  const completed = stats.completedTasks || 0;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      desc: 'Summary Workspace',
      accent: '#0ea5e9',
    },
    {
      id: 'tasks',
      label: 'Daily Checklist',
      icon: CheckSquare,
      count: stats.pendingTasks,
      desc: 'Tasks & subtasks',
      accent: '#38bdf8',
    },
    {
      id: 'timeline',
      label: 'Hackathon Timeline',
      icon: CalendarRange,
      count: stats.upcomingApplications,
      desc: 'Track deadlines',
      accent: '#34d399',
    },
    {
      id: 'ideas',
      label: 'Idea Vault',
      icon: Lightbulb,
      count: stats.totalIdeas,
      desc: 'Capture thoughts',
      accent: '#fbbf24',
    },
    {
      id: 'project-ideas',
      label: 'Project Ideas',
      icon: Rocket,
      count: stats.totalProjectIdeas,
      desc: 'Brainstorm concepts',
      accent: '#818cf8',
    },
    {
      id: 'review',
      label: 'Review',
      icon: BarChart3,
      desc: 'What actually happened',
      accent: '#a78bfa',
    },
  ];

  // Quotes feeds a single dashboard card. That is not worth a primary slot
  // beside five sections you work in daily, so it sits in a quieter group
  // rather than being removed -- the section and its data are untouched.
  const secondaryItems = [
    {
      id: 'tags',
      label: 'Tags',
      icon: Hash,
      accent: '#818cf8',
    },
    {
      id: 'quotes',
      label: 'Quotes Vault',
      icon: Quote,
      count: stats.totalQuotes,
      accent: '#f43f5e',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 lg:hidden"
          style={{ animation: 'fadeIn 0.2s ease forwards' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`glass-sidebar h-screen flex flex-col shrink-0 select-none
        fixed lg:static top-0 bottom-0 left-0 z-50 transition-all duration-300
        ${isCollapsed ? 'w-[72px]' : 'w-[268px]'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>

        {/* ── Brand header ── */}
        <div className={`px-4 pt-7 pb-5 flex items-center justify-between relative group/brandheader shrink-0`}>
          <div className="flex items-center gap-3">
            {/* Animated logo badge */}
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center relative overflow-hidden"
                style={{
                  background: 'linear-gradient(145deg, rgba(56,189,248,0.15) 0%, rgba(14,165,233,0.08) 100%)',
                  border: '1px solid rgba(56,189,248,0.25)',
                  boxShadow: '0 0 18px rgba(56,189,248,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                {/* Shimmer sweep */}
                <div className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)',
                    animation: 'shimmerSweep 3s ease-in-out infinite',
                  }}
                />
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" className="w-6 h-6">
                  <defs>
                    <linearGradient id="sbGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#0ea5e9" />
                      <stop offset="50%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#7dd3fc" />
                    </linearGradient>
                    <filter id="sbGlow">
                      <feGaussianBlur stdDeviation="1.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                  <path d="M38 6C38 9.5 39.5 11 43 11C39.5 11 38 12.5 38 16C38 12.5 36.5 11 33 11C36.5 11 38 9.5 38 6Z" fill="url(#sbGrad)" filter="url(#sbGlow)" />
                  <rect x="8" y="38" width="10" height="3" rx="1.5" fill="url(#sbGrad)" opacity={0.4} />
                  <rect x="15" y="31" width="12" height="3" rx="1.5" fill="url(#sbGrad)" opacity={0.6} />
                  <rect x="22" y="24" width="14" height="3" rx="1.5" fill="url(#sbGrad)" opacity={0.8} />
                  <rect x="29" y="17" width="16" height="3" rx="1.5" fill="url(#sbGrad)" filter="url(#sbGlow)" />
                  <path d="M28 11.5C31.5 10.5 34.5 9 37.5 7.5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" filter="url(#sbGlow)" />
                  <path d="M19 28C21 21 24 16 27.5 12" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" filter="url(#sbGlow)" />
                  <path d="M19 28C17.5 30.5 15.5 32 14.5 32.5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity={0.8} />
                  <path d="M22 21C24.5 21.5 27 22.5 28.5 23.5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" filter="url(#sbGlow)" />
                  <circle cx="28" cy="8.5" r="3.5" fill="#ffffff" filter="url(#sbGlow)" />
                </svg>
              </div>
              {/* Outer glow ring */}
              <div className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{
                  boxShadow: '0 0 14px rgba(56,189,248,0.25)',
                  animation: 'pulseRing 3s ease-in-out infinite',
                }}
              />
            </div>

            {!isCollapsed && (
              <div className="transition-all duration-300 animate-in fade-in zoom-in-95 duration-200">
                <h1 className="text-[15px] font-extrabold tracking-tight leading-none"
                  style={{
                    background: 'linear-gradient(135deg, #fff 0%, #e0f2fe 60%, #7dd3fc 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  AnonVault
                </h1>
                <p className="text-[10px] font-semibold mt-0.5 tracking-[0.2em] uppercase"
                  style={{ color: 'rgba(125,211,252,0.5)' }}>
                  Private Space
                </p>
              </div>
            )}
          </div>

          {/* Toggle Button */}
          <button
            onClick={toggleCollapse}
            className={`w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.09] text-slate-550 hover:text-white cursor-pointer transition-all ${
              isCollapsed 
                ? 'absolute left-1/2 -translate-x-1/2 top-20 border-white/[0.09]' 
                : 'hover:scale-105'
            }`}
            title={isCollapsed ? "Maximize Sidebar" : "Minimize Sidebar"}
          >
            {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </div>

        <div className={`divider ${isCollapsed ? 'mx-2 mt-9' : 'mx-4'}`} />

        {/* ── Navigation ── */}
        <div className={`pt-5 flex-1 overflow-y-auto min-h-0 ${isCollapsed ? 'px-1.5' : 'px-3'}`}>
          


          {!isCollapsed && (
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.18em] px-3 mb-3 animate-in fade-in duration-200">
              Workspace
            </p>
          )}

          <nav className="flex flex-col gap-1.5">
            {navItems.map(({ id, label, icon: Icon, count, desc, accent }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => { setActiveTab(id); setMobileOpen(false); }}
                  className={`nav-item ${isActive ? 'active' : ''} ${isCollapsed ? 'justify-center px-0' : ''}`}
                  title={isCollapsed ? label : ''}
                >
                  <div className="flex items-center gap-3">
                    {/* Icon badge */}
                    <div className="relative shrink-0">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300"
                        style={{
                          background: isActive
                            ? `linear-gradient(135deg, ${accent}22 0%, ${accent}14 100%)`
                            : 'rgba(255,255,255,0.04)',
                          border: isActive
                            ? `1px solid ${accent}40`
                            : id === 'dashboard' ? '1px solid rgba(56,189,248,0.15)' : '1px solid rgba(255,255,255,0.05)',
                          color: isActive ? accent : '#64748b',
                          boxShadow: isActive ? `0 0 12px ${accent}30` : id === 'dashboard' ? '0 0 8px rgba(56,189,248,0.1)' : 'none',
                        }}
                      >
                        <Icon size={14} />
                      </div>
                      {/* Pin badge — only on dashboard */}
                      {id === 'dashboard' && (
                        <div
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                          style={{
                            background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
                            boxShadow: '0 0 6px rgba(56,189,248,0.7)',
                          }}
                        >
                          <Pin size={7} className="text-white" style={{ transform: 'rotate(45deg)' }} />
                        </div>
                      )}
                    </div>
                    {!isCollapsed && (
                      <div className="text-left animate-in fade-in duration-200">
                        <span
                          className="block text-[13px] font-semibold leading-snug"
                          style={{ color: isActive ? '#bae6fd' : '#cbd5e1' }}
                        >
                          {label}
                        </span>
                        <span className="block text-[10px] text-slate-600 mt-0.5 font-medium">{desc}</span>
                      </div>
                    )}
                  </div>
                  {!isCollapsed && count > 0 && (
                    <span
                      className="px-2 py-0.5 text-[10px] font-bold rounded-full tabular-nums shrink-0"
                      style={{
                        background: isActive ? `${accent}28` : 'rgba(255,255,255,0.05)',
                        color: isActive ? accent : '#475569',
                        border: `1px solid ${isActive ? `${accent}38` : 'transparent'}`,
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Secondary group — reachable, just not competing for attention */}
          <div className="mt-5">
            <div className="divider mb-3" />
            {!isCollapsed && (
              <p className="text-[10px] font-bold text-slate-700 uppercase tracking-[0.18em] px-3 mb-2.5">
                More
              </p>
            )}
            <nav className="flex flex-col gap-1.5">
              {secondaryItems.map(({ id, label, icon: Icon, count, accent }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setActiveTab(id); setMobileOpen(false); }}
                    className={`flex items-center gap-2.5 rounded-xl transition-all cursor-pointer ${
                      isCollapsed ? 'justify-center py-2' : 'px-3 py-2'
                    } ${isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
                    title={isCollapsed ? label : ''}
                  >
                    <Icon size={13} style={{ color: isActive ? accent : '#475569' }} className="shrink-0" />
                    {!isCollapsed && (
                      <>
                        <span className="flex-1 text-left text-[12px] font-semibold"
                          style={{ color: isActive ? '#cbd5e1' : '#64748b' }}>
                          {label}
                        </span>
                        {count > 0 && (
                          <span className="text-[10px] font-bold tabular-nums text-slate-700 shrink-0">
                            {count}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* ── Footer ── */}
        {!isCollapsed ? (
          <div className="px-5 py-4 flex flex-col items-center justify-center shrink-0 animate-in fade-in duration-200 w-full">
            <div className="divider w-full mb-3" />
            
            {/* Social Links Row */}
            <div className="flex items-center gap-3 mb-3.5">
              <a
                href="https://x.com/minianondev"
                target="_blank"
                rel="noopener noreferrer"
                title="X (formerly Twitter)"
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] text-slate-400 hover:text-white transition-all duration-200 relative group/x"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="absolute -top-7 px-2 py-0.5 bg-slate-900 border border-white/10 text-[9px] text-slate-350 rounded-md opacity-0 group-hover/x:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">X / Twitter</span>
              </a>
              <a
                href="https://github.com/minianon"
                target="_blank"
                rel="noopener noreferrer"
                title="GitHub"
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] text-slate-400 hover:text-white transition-all duration-200 relative group/gh"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                </svg>
                <span className="absolute -top-7 px-2 py-0.5 bg-slate-900 border border-white/10 text-[9px] text-slate-350 rounded-md opacity-0 group-hover/gh:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">GitHub</span>
              </a>
              <a
                href="https://www.linkedin.com/in/minianon/"
                target="_blank"
                rel="noopener noreferrer"
                title="LinkedIn (Bhardwaj Tushar)"
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06] hover:bg-indigo-500/10 hover:border-indigo-500/30 text-slate-400 hover:text-indigo-300 transition-all duration-200 relative group/ln1"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
                <span className="absolute -top-7 px-2 py-0.5 bg-slate-900 border border-white/10 text-[9px] text-slate-350 rounded-md opacity-0 group-hover/ln1:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">LinkedIn (Tushar)</span>
              </a>
              <a
                href="https://www.linkedin.com/in/tusharbhardwaj2004ab/"
                target="_blank"
                rel="noopener noreferrer"
                title="LinkedIn (Tushar Bhardwaj)"
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06] hover:bg-indigo-500/10 hover:border-indigo-500/30 text-slate-400 hover:text-indigo-300 transition-all duration-200 relative group/ln2"
              >
                <svg className="w-3.5 h-3.5 fill-current scale-95" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
                <span className="absolute -top-7 px-2 py-0.5 bg-slate-900 border border-white/10 text-[9px] text-slate-355 rounded-md opacity-0 group-hover/ln2:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">LinkedIn (Mini Anon)</span>
              </a>
            </div>
          </div>
        ) : (
          <div className="py-4 flex flex-col items-center justify-center shrink-0 w-full gap-2.5">
            <div className="divider w-full px-2 mb-1" />
            <a
              href="https://x.com/minianondev"
              target="_blank"
              rel="noopener noreferrer"
              title="X"
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all duration-200"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://github.com/minianon"
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub"
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all duration-200"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/in/minianon/"
              target="_blank"
              rel="noopener noreferrer"
              title="LinkedIn"
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all duration-200"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
              </svg>
            </a>
          </div>
        )}

        {/* CSS-in-JSX keyframes needed for sidebar-specific effects */}
        <style>{`
          @keyframes shimmerSweep {
            0%   { transform: translateX(-200%); }
            100% { transform: translateX(200%); }
          }
          @keyframes pulseRing {
            0%, 100% { opacity: 0.5; }
            50%       { opacity: 1; }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes rotateGlow {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </aside>
    </>
  );
}
