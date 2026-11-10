import {
  LayoutDashboard, CheckSquare, Timer, Wallet, KanbanSquare, Lightbulb, CalendarRange, BarChart3, Quote, CalendarDays,
} from 'lucide-react';

/* Primary sections, in sidebar order. Number keys 1–9 and 0 follow this order.
   `countKey` reads from the stats object App passes to the sidebar. */
export const NAV = [
  { id: 'dashboard', label: 'Today',      icon: LayoutDashboard, group: 'Plan' },
  { id: 'tasks',     label: 'Checklist',  icon: CheckSquare, countKey: 'pendingTasks', group: 'Plan' },
  { id: 'board',     label: 'Board',      icon: KanbanSquare, countKey: 'boardOpen', group: 'Plan' },
  { id: 'calendar',  label: 'Calendar',   icon: CalendarDays, group: 'Plan' },
  { id: 'focus',     label: 'Focus',      icon: Timer, group: 'Track' },
  { id: 'money',     label: 'Money',      icon: Wallet, group: 'Track' },
  { id: 'ideas',     label: 'Ideas',      icon: Lightbulb, countKey: 'totalIdeas', group: 'Collect' },
  { id: 'timeline',  label: 'Hackathons', icon: CalendarRange, countKey: 'upcomingApplications', group: 'Collect' },
  { id: 'review',    label: 'Review',     icon: BarChart3, group: 'Reflect' },
  { id: 'quotes',    label: 'Quotes',     icon: Quote, group: 'Reflect' },
];
