import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Cursor + multi-select for a list view, driven from the keyboard.
 *
 * These two live together on purpose: `j`/`k` needs an ordered list and a
 * focused index, and bulk actions need a set of ids — and the natural way to
 * build a selection is to move the cursor and mark as you go.
 *
 * Every tab stays mounted, so the key handler checks that its own panel is
 * the visible one before acting. Without that, one `j` would move the cursor
 * in all six list views at once.
 *
 * @param ids     ordered ids currently rendered, in display order
 * @param onOpen  called with an id on Enter
 * @param rootRef ref on the view's root element, for the visibility check
 */
export function useListNav({ ids, onOpen, rootRef }) {
  const [cursor, setCursor] = useState(-1);
  const [selected, setSelected] = useState(() => new Set());

  // Kept in a ref so the key handler never needs re-binding as the list or the
  // cursor changes — otherwise every keystroke would tear down the listener.
  // Written in an effect rather than during render: mutating a ref mid-render
  // is unsafe under concurrent rendering, and the effect still lands long
  // before the next keypress.
  const stateRef = useRef({ ids, cursor, onOpen });
  useEffect(() => { stateRef.current = { ids, cursor, onOpen }; });

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const toggleSelect = useCallback(id => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(list => setSelected(new Set(list)), []);

  // Drop ids that have left the list (deleted, archived, filtered out), so a
  // bulk action can never target something no longer on screen.
  useEffect(() => {
    // Functional update that returns the same Set when nothing changed, so it
    // cannot cascade — pruning stale ids is the whole job of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(prev => {
      if (prev.size === 0) return prev;
      const live = new Set(ids);
      const next = new Set([...prev].filter(id => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [ids]);

  useEffect(() => {
    const isVisible = () => {
      const el = rootRef?.current;
      if (!el) return false;
      const panel = el.closest('.absolute.inset-0');
      return !panel || !panel.className.includes('pointer-events-none');
    };

    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
                 el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (document.querySelector('.modal-overlay')) return;
      if (!isVisible()) return;

      const { ids: list, cursor: cur, onOpen: open } = stateRef.current;
      if (!list.length) return;

      if (e.key === 'j') {
        e.preventDefault();
        setCursor(c => Math.min(list.length - 1, c + 1));
      } else if (e.key === 'k') {
        e.preventDefault();
        setCursor(c => Math.max(0, (c < 0 ? 0 : c) - 1));
      } else if (e.key === 'x') {
        e.preventDefault();
        if (cur >= 0 && list[cur]) toggleSelect(list[cur]);
      } else if (e.key === 'Enter') {
        if (cur >= 0 && list[cur]) { e.preventDefault(); open?.(list[cur]); }
      } else if (e.key === 'Escape') {
        setSelected(prev => (prev.size ? new Set() : prev));
        setCursor(-1);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rootRef, toggleSelect]);

  // Keep the focused row on screen when moving past the fold.
  useEffect(() => {
    if (cursor < 0) return;
    const id = stateRef.current.ids[cursor];
    if (!id) return;
    rootRef?.current
      ?.querySelector(`[data-nav-id="${id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor, rootRef]);

  const cursorId = cursor >= 0 ? ids[cursor] : null;

  return {
    cursorId,
    selected,
    selectedIds: [...selected],
    isSelected: id => selected.has(id),
    toggleSelect,
    selectAll,
    clearSelection,
  };
}
