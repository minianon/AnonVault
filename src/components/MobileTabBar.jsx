import { LayoutDashboard, CalendarDays, CheckSquare, Wallet, Menu } from 'lucide-react';

/* Bottom tab bar on phones: the sections you open most, one thumb away.
   "More" opens the full sidebar for the rest. Hidden from tablet width up. */
const TABS = [
  { id: 'dashboard', label: 'Today', icon: LayoutDashboard },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, countKey: 'meetingsToday' },
  { id: 'tasks', label: 'Checklist', icon: CheckSquare, countKey: 'pendingTasks' },
  { id: 'money', label: 'Money', icon: Wallet },
];

export const MOBILE_TAB_BAR_HEIGHT = 58;

export default function MobileTabBar({ activeTab, setActiveTab, stats, onMore }) {
  const inBar = TABS.some(t => t.id === activeTab);
  return (
    <nav aria-label="Sections"
      className="md:hidden fixed left-0 right-0 bottom-0 z-30 border-t border-white/[0.07] backdrop-blur-xl"
      style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="grid grid-cols-5" style={{ height: MOBILE_TAB_BAR_HEIGHT }}>
        {TABS.map(t => {
          const on = activeTab === t.id;
          const count = t.countKey ? stats?.[t.countKey] : 0;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} aria-current={on ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${on ? 'text-slate-50' : 'text-slate-500 active:text-slate-300'}`}>
              {on && <span className="absolute top-0 h-[2px] w-8 rounded-full bg-[var(--accent)]" />}
              <span className="relative">
                <t.icon size={19} strokeWidth={on ? 2.3 : 1.9} />
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-semibold leading-4 text-center tabular-nums">
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </span>
              <span className="text-[10.5px] font-medium">{t.label}</span>
            </button>
          );
        })}
        <button onClick={onMore} className={`flex flex-col items-center justify-center gap-1 cursor-pointer ${!inBar ? 'text-slate-50' : 'text-slate-500 active:text-slate-300'}`}>
          <Menu size={19} strokeWidth={!inBar ? 2.3 : 1.9} />
          <span className="text-[10.5px] font-medium">More</span>
        </button>
      </div>
    </nav>
  );
}
