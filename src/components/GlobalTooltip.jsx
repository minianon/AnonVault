import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/*
 * One themed tooltip for the whole app.
 *
 * Components keep writing plain `title="…"` hints. On first hover this moves
 * the text to `data-tip` (so the browser's white tooltip never appears) and
 * shows it in the app's own dark style instead: after a short delay, then
 * instantly while moving between neighbours, like the native one.
 * Elements can also use `data-tip` directly.
 *
 * Only on devices with a real pointer — touch screens have no hover.
 */
const SHOW_DELAY = 350;

export default function GlobalTooltip() {
  const [tip, setTip] = useState(null);
  const visible = useRef(false);

  useEffect(() => {
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return undefined;

    let timer = null;
    let current = null;

    const hide = () => {
      clearTimeout(timer);
      current = null;
      visible.current = false;
      setTip(null);
    };

    const target = el => (el && el.closest ? el.closest('[title], [data-tip]') : null);

    const onOver = e => {
      const el = target(e.target);
      if (!el) return;
      // Take the text over from the browser.
      const raw = el.getAttribute('title');
      if (raw != null) {
        el.removeAttribute('title');
        const text = raw.trim();
        if (text) {
          el.setAttribute('data-tip', text);
          // Icon-only buttons relied on title for their accessible name.
          if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', text);
        }
      }
      if (el === current) return;
      const text = el.getAttribute('data-tip');
      clearTimeout(timer);
      current = el;
      if (!text) { visible.current = false; setTip(null); return; }
      timer = setTimeout(() => {
        if (current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 56;
        visible.current = true;
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
      }, visible.current ? 0 : SHOW_DELAY);
    };

    const onOut = e => {
      const el = target(e.target);
      if (!el || el !== current) return;
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      clearTimeout(timer);
      current = null;
      setTip(null);
      // Stay "warm" briefly so the next hint shows straight away.
      setTimeout(() => { if (!current) visible.current = false; }, 250);
    };

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      document.removeEventListener('mousedown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!tip) return null;
  return createPortal(
    <div role="tooltip" className="fixed z-[400] pointer-events-none"
      style={{
        left: Math.min(Math.max(tip.x, 24), window.innerWidth - 24),
        top: tip.y,
        transform: `translate(${tip.x < 150 ? '-12px' : tip.x > window.innerWidth - 150 ? 'calc(-100% + 12px)' : '-50%'}, ${tip.below ? '0' : '-100%'})`,
      }}>
      <div className="max-w-[280px] px-2.5 py-1.5 rounded-lg border border-white/[0.1] text-[12px] leading-snug text-slate-100 whitespace-pre-line break-words"
        style={{ background: 'var(--surface-3)', boxShadow: 'var(--shadow-md)', animation: 'selectIn 0.12s var(--ease) both' }}>
        {tip.text}
      </div>
    </div>,
    document.body,
  );
}
