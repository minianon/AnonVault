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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] pointer-events-none">
      <div
        className="pointer-events-auto flex items-center gap-2 px-3 py-2.5 rounded-2xl toast-animate"
        style={{
          background: 'linear-gradient(135deg, rgba(12,14,28,0.97) 0%, rgba(9,11,22,0.98) 100%)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 16px 48px -12px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <span className="px-1.5 text-[12px] font-bold text-white tabular-nums whitespace-nowrap">
          {count} {noun}{count === 1 ? '' : 's'}
        </span>

        <span className="w-[1px] h-4 bg-white/[0.1]" />

        {actions.map(action => (
          <button
            key={action.label}
            onClick={action.onClick}
            title={action.label}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold cursor-pointer transition-all whitespace-nowrap ${
              action.danger
                ? 'text-rose-300 bg-rose-500/[0.1] border border-rose-500/25 hover:bg-rose-500/[0.18]'
                : 'text-slate-300 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.09] hover:text-white'
            }`}
          >
            {action.icon && <action.icon size={11} />}
            {action.label}
          </button>
        ))}

        <span className="w-[1px] h-4 bg-white/[0.1]" />

        <button
          onClick={onClear}
          title="Clear selection (Esc)"
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-200 hover:bg-white/[0.06] transition-all cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
