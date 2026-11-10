import {
  LayoutDashboard, CheckSquare, Timer, Wallet, KanbanSquare, Lightbulb, CalendarRange, BarChart3, Quote,
} from 'lucide-react';

/* Primary sections, in sidebar order. Number keys 1–9 follow this order.
   `countKey` reads from the stats object App passes to the sidebar. */
export const NAV = [
  { id: 'dashboard', label: 'Today',      icon: LayoutDashboard },
  { id: 'tasks',     label: 'Checklist',  icon: CheckSquare, countKey: 'pendingTasks' },
  { id: 'board',     label: 'Board',      icon: KanbanSquare, countKey: 'boardOpen' },
  { id: 'focus',     label: 'Focus',      icon: Timer },
  { id: 'money',     label: 'Money',      icon: Wallet },
  { id: 'ideas',     label: 'Ideas',      icon: Lightbulb, countKey: 'totalIdeas' },
  { id: 'timeline',  label: 'Hackathons', icon: CalendarRange, countKey: 'upcomingApplications' },
  { id: 'review',    label: 'Review',     icon: BarChart3 },
  { id: 'quotes',    label: 'Quotes',     icon: Quote },
];
