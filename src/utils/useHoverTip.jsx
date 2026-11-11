import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Themed hover tooltip, instead of the browser's white title box.
 *   const tip = useHoverTip();
 *   <button {...tip.bind('Wed, 11 Nov', '3 of 4 done')} />   …   {tip.node}
 * Anchored above the element (below it near the top of the screen),
 * kept on screen, and hidden on scroll.
 */
export function useHoverTip() {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [tip]);
  const show = (el, title, sub) => {
    const r = el.getBoundingClientRect();
    const below = r.top < 64;
    setTip({ x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below, title, sub });
  };
  const hide = () => setTip(null);
  const bind = (title, sub) => ({
    onMouseEnter: e => show(e.currentTarget, title, sub),
    onMouseLeave: hide,
    onFocus: e => show(e.currentTarget, title, sub),
    onBlur: hide,
  });
  const node = tip && createPortal(
    <div role="tooltip" className="fixed z-[300] pointer-events-none"
      style={{
        left: Math.min(Math.max(tip.x, 90), window.innerWidth - 90),
        top: tip.y,
        transform: `translate(-50%, ${tip.below ? '0' : '-100%'})`,
      }}>
      {/* The pop-in animation moves this inner box, so it can't fight the positioning above. */}
      <div className="px-2.5 py-1.5 rounded-lg border border-white/[0.1] whitespace-nowrap"
        style={{ background: 'var(--surface-3)', boxShadow: 'var(--shadow-md)', animation: 'selectIn 0.12s var(--ease) both' }}>
        <p className="text-[12px] font-semibold text-slate-100 leading-tight">{tip.title}</p>
        {tip.sub && <p className="text-[11px] text-slate-400 leading-tight mt-0.5">{tip.sub}</p>}
      </div>
    </div>,
    document.body,
  );
  return { bind, hide, node };
}
