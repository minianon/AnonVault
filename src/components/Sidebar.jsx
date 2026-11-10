import { useEffect, useState } from 'react';
import { NAV } from '../nav';
import { Search, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react';
import Logo from './Logo';
import { sessions, isRunning, durationMs, formatDuration, useNow, stopSession } from '../services/focus';
import { board, dueInfo } from '../services/board';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/* Collapsing animates only the width. Every icon sits at the same x in both
   states (the rail is 60px and every row keeps the same left padding), so
   nothing slides sideways; labels just fade and get clipped by the edge.
   Blocks that only exist when expanded collapse their height with a
   grid-rows transition instead of popping in and out. */
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function Fade({ show, children, className = '' }) {
  return (
    <span className={`whitespace-nowrap transition-opacity ${className}`}
      style={{ opacity: show ? 1 : 0, transitionDuration: show ? '220ms' : '120ms', transitionDelay: show ? '80ms' : '0ms' }}>
      {children}
    </span>
  );
}

function Collapse({ open, children }) {
  return (
    <div className="grid transition-[grid-template-rows,opacity] duration-300"
      style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0, transitionTimingFunction: EASE }}>
      <div className="overflow-hidden min-h-0">{children}</div>
    </div>
  );
}

export default function Sidebar({ activeTab, setActiveTab, stats, mobileOpen, setMobileOpen, onOpenPalette }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('anonvault_sidebar_collapsed') === 'true');
  const toggle = () => {
    setCollapsed(c => {
      localStorage.setItem('anonvault_sidebar_collapsed', String(!c));
      return !c;
    });
  };

  // "[" toggles the sidebar, like most desktop tools.
  useEffect(() => {
    const onKey = e => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (document.querySelector('.modal-overlay')) return;
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const boardOverdue = board.useAll().filter(i => dueInfo(i)?.tone === 'bad').length;
  const all = sessions.useAll();
  const running = all.filter(isRunning);
  const now = useNow(1000, running.length > 0);

  const total = stats.totalTasks || 0;
  const done = stats.completedTasks || 0;

  // Tablets (768–1023px) get a permanent icon rail; phones get a drawer.
  const [rail, setRail] = useState(() => window.matchMedia('(min-width: 768px) and (max-width: 1023.98px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (max-width: 1023.98px)');
    const on = () => { setRail(mq.matches); if (window.innerWidth >= 768) setMobileOpen(false); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const go = id => { setActiveTab(id); setMobileOpen(false); };
  // The phone drawer is always full width; collapse applies to the rail and desktop.
  const open = mobileOpen || (!collapsed && !rail);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 md:hidden transition-opacity duration-200 ${mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={`glass-sidebar h-full flex flex-col shrink-0 select-none overflow-hidden
          fixed md:static inset-y-0 left-0 z-50 w-[260px] md:w-[60px] ${open ? 'lg:w-[232px]' : 'lg:w-[60px]'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{ transition: `width 300ms ${EASE}, transform 300ms ${EASE}` }}>

        {/* Brand */}
        <div className="h-14 flex items-center shrink-0 pl-[19px] pr-2">
          <button onClick={() => go('dashboard')} className="flex items-center gap-2.5 min-w-0 cursor-pointer" title="AnonVault">
            <Logo size={22} className="shrink-0" />
            <Fade show={open} className="text-[14px] font-semibold tracking-[-0.01em] text-slate-100">AnonVault</Fade>
          </button>
          <button onClick={() => setMobileOpen(false)} className="icon-btn md:hidden ml-auto" aria-label="Close navigation">
            <X size={15} />
          </button>
        </div>

        {/* Search */}
        <div className="px-2.5 pb-3">
          <button onClick={onOpenPalette}
            className="w-full h-8 rounded-lg border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.1] transition-colors cursor-pointer flex items-center gap-2 pl-[12px] pr-2 text-slate-500 overflow-hidden"
            title="Search and commands">
            <Search size={14} className="shrink-0" />
            <Fade show={open} className="text-[12.5px] flex-1 text-left">Search…</Fade>
            <Fade show={open} className="flex items-center gap-0.5">
              <span className="kbd">{isMac ? '⌘' : 'Ctrl'}</span><span className="kbd">K</span>
            </Fade>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-2.5 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon, countKey }, i) => {
            const active = activeTab === id;
            const count = countKey ? stats[countKey] : 0;
            const alert = id === 'board' && boardOverdue > 0;
            const live = id === 'focus' && running.length > 0;
            return (
              <button key={id} onClick={() => go(id)}
                className={`nav-item group !pl-[12px] ${active ? 'active' : ''}`}
                title={!open ? label : undefined}
                aria-current={active ? 'page' : undefined}>
                <span className="relative shrink-0">
                  <Icon size={15} className="nav-icon" strokeWidth={active ? 2.1 : 1.8} />
                  {live && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 transition-opacity"
                    style={{ opacity: open ? 0 : 1 }} />}
                </span>
                <Fade show={open} className="flex-1 text-left">{label}</Fade>
                <Fade show={open} className="flex items-center">
                  {live ? (
                    <span className="live-dot" />
                  ) : (
                    <>
                      {count > 0 && (
                        <span title={alert ? `${boardOverdue} overdue` : undefined}
                          className={`group-hover:hidden min-w-[20px] h-[18px] px-1.5 rounded-full text-[11px] font-medium tabular-nums leading-[18px] text-center ${
                            alert ? 'bg-rose-400/15 text-rose-300'
                              : active ? 'bg-white/[0.12] text-slate-100' : 'bg-white/[0.06] text-slate-400'}`}>
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                      <span className="kbd hidden group-hover:inline-flex">{i === 9 ? 0 : i + 1}</span>
                    </>
                  )}
                </Fade>
              </button>
            );
          })}
        </nav>

        {/* Now tracking */}
        <Collapse open={open && running.length > 0}>
          <div className="mx-3 mb-3 w-[208px] rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <span className="text-[11.5px] font-medium text-emerald-400 whitespace-nowrap">
                {running.length > 1 ? `${running.length} timers running` : 'Tracking'}
              </span>
            </div>
            {running.slice(0, 3).map(s => (
              <div key={s.id} className="flex items-center gap-2">
                <button onClick={() => go('focus')} className="flex-1 min-w-0 text-left cursor-pointer">
                  <p className="text-[12.5px] text-slate-200 truncate leading-tight">{s.label}</p>
                </button>
                <span className="font-mono text-[11.5px] text-slate-400 tabular-nums">{formatDuration(durationMs(s, now), { seconds: true })}</span>
                <button onClick={() => stopSession(s.id)} className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-slate-100 hover:bg-white/[0.08] cursor-pointer" title="Stop">
                  <Square size={9} fill="currentColor" />
                </button>
              </div>
            ))}
          </div>
        </Collapse>

        {/* Footer */}
        <div className="border-t border-white/[0.06] shrink-0">
          <Collapse open={open}>
            <div className="w-[232px] px-4 pt-3 space-y-3">
              <button onClick={() => go('tasks')} className="w-full text-left cursor-pointer group">
                <div className="flex items-center justify-between text-[12px] mb-1.5">
                  <span className="text-slate-500 group-hover:text-slate-300 transition-colors">Today's checklist</span>
                  <span className="text-slate-400 tabular-nums">{done}/{total}</span>
                </div>
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-slate-200 transition-[width] duration-700"
                    style={{ width: total ? (done / total) * 100 + '%' : '0%' }} />
                </div>
              </button>
              <div className="flex items-center gap-0.5 -ml-1.5">
                <a href="https://github.com/minianon" target="_blank" rel="noopener noreferrer" className="icon-btn !w-7 !h-7" title="GitHub">
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
                </a>
                <a href="https://x.com/minianondev" target="_blank" rel="noopener noreferrer" className="icon-btn !w-7 !h-7" title="X">
                  <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
                <a href="https://www.linkedin.com/in/tusharbhardwaj2004ab/" target="_blank" rel="noopener noreferrer" className="icon-btn !w-7 !h-7" title="LinkedIn">
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                </a>
                <span className="ml-auto text-[11px] text-slate-600">v2.0</span>
              </div>
            </div>
          </Collapse>
          <div className="hidden lg:block px-2.5 py-2">
            <button onClick={toggle} className="nav-item !pl-[12px] !h-8" title={open ? 'Collapse sidebar  [' : 'Expand sidebar  ['}
              aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}>
              <span className="relative w-[15px] h-[15px] shrink-0">
                <PanelLeftClose size={15} className="nav-icon absolute inset-0 transition-[opacity,transform] duration-300"
                  style={{ opacity: open ? 1 : 0, transform: open ? 'none' : 'scale(0.8)' }} />
                <PanelLeftOpen size={15} className="nav-icon absolute inset-0 transition-[opacity,transform] duration-300"
                  style={{ opacity: open ? 0 : 1, transform: open ? 'scale(0.8)' : 'none' }} />
              </span>
              <Fade show={open} className="flex-1 text-left text-[12.5px]">Collapse</Fade>
              <Fade show={open}><span className="kbd">[</span></Fade>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
