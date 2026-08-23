import { useEffect } from 'react';

/**
 * Responds to the app-level `n` (new) and `/` (focus search) shortcuts.
 *
 * App broadcasts window events rather than threading a callback through every
 * view. All tabs stay mounted, so each listener must check that its own panel
 * is the visible one first — otherwise a single `n` would open the add form in
 * all six views at once.
 */
export function useShortcutHooks({ onNew, searchRef, rootRef }) {
  useEffect(() => {
    const isVisible = () => {
      const el = rootRef?.current;
      if (!el) return false;
      // The active panel is the only one without pointer-events-none.
      const panel = el.closest('.absolute.inset-0');
      return !panel || !panel.className.includes('pointer-events-none');
    };

    const handleNew = () => { if (isVisible()) onNew?.(); };
    const handleFocus = () => { if (isVisible()) searchRef?.current?.focus(); };

    window.addEventListener('anonvault:new', handleNew);
    window.addEventListener('anonvault:focus-search', handleFocus);
    return () => {
      window.removeEventListener('anonvault:new', handleNew);
      window.removeEventListener('anonvault:focus-search', handleFocus);
    };
  }, [onNew, searchRef, rootRef]);
}
