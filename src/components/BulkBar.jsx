import { X } from 'lucide-react';

/**
 * Floating action bar for a multi-selection. Sits above the toast stack's
 * corner rather than beside it, so the two never overlap.
 *
 * Destructive actions are marked `danger` and pushed to the right, away from
 * the ones you would reach for by default.
 */
export default function BulkBar({ count, actions, onClear, noun = 'item' }) {
  if (!count) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] pointer-events-none max-w-[calc(100vw-24px)]">
      <div className="pointer-events-auto flex items-center gap-1.5 h-11 px-2 rounded-xl toast-animate bg-[var(--surface-2)] border border-white/[0.1] shadow-[var(--shadow-lg)]">
        <span className="pl-1.5 pr-1 text-[13px] text-slate-200 tabular-nums whitespace-nowrap">
          {count} {noun}{count === 1 ? '' : 's'}
        </span>

        <span className="w-px h-4 bg-white/[0.08] shrink-0" />

        {actions.map(action => (
          <button
            key={action.label}
            onClick={action.onClick}
            title={action.label}
            aria-label={action.label}
            className={`${action.danger ? 'btn-danger' : 'btn-ghost'} h-8 px-2.5 rounded-lg text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0`}
          >
            {action.icon && <action.icon size={13} />}
            {/* Icon-only on phones so four actions still fit in 360px. */}
            <span className={action.icon ? 'hidden sm:inline' : ''}>{action.label}</span>
          </button>
        ))}

        <span className="w-px h-4 bg-white/[0.08] shrink-0" />

        <button
          onClick={onClear}
          title="Clear selection (Esc)"
          aria-label="Clear selection"
          className="icon-btn cursor-pointer shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
