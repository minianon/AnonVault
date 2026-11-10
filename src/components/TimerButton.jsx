/* One-click focus timer for anything with a name (a hackathon, an idea…).
   Shows a play button; while running it shows the elapsed time and stops
   on click. Sessions land in Focus like any other. */

import { Play, Square } from 'lucide-react';
import { sessions, startSession, stopSession, durationMs, formatDuration, useNow } from '../services/focus';

function Elapsed({ run }) {
  const now = useNow(1000, true);
  return formatDuration(durationMs(run, now), { seconds: true });
}

export default function TimerButton({ label, project = null, board_id = null, task_id = null, onStarted, className = '' }) {
  const all = sessions.useAll();
  const run = all.find(s => !s.ended_at && (
    board_id ? s.board_id === board_id
      : task_id ? s.task_id === task_id
        : s.label === label && (s.project || null) === (project || null)));

  if (run) {
    return (
      <button onClick={e => { e.stopPropagation(); stopSession(run.id); }} title="Stop timer"
        className={`h-7 px-2 rounded-md inline-flex items-center gap-1.5 text-[11.5px] font-mono tabular-nums text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 hover:bg-emerald-400/15 cursor-pointer shrink-0 ${className}`}>
        <Square size={8} fill="currentColor" /> <Elapsed run={run} />
      </button>
    );
  }
  return (
    <button onClick={e => { e.stopPropagation(); const s = startSession({ label, project, board_id, task_id }); if (s) onStarted?.(s); }}
      title="Start a focus timer" aria-label="Start a focus timer"
      className={`icon-btn !w-7 !h-7 hover:!text-emerald-400 cursor-pointer ${className}`}>
      <Play size={12} />
    </button>
  );
}
