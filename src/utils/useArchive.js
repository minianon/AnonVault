import { useCallback, useMemo } from 'react';
import { usePref } from '../services/prefs';

/**
 * Archiving for the two capture sections, which otherwise grow forever.
 *
 * A list of ids kept in prefs.js: saved locally and synced to your other
 * devices through the app_settings table.
 */
export function useArchive(storageKey) {
  const [stored, setArchivedIds] = usePref(storageKey, []);
  const archivedIds = useMemo(() => (Array.isArray(stored) ? stored : []), [stored]);

  const persist = next => setArchivedIds(next);

  const toggleArchived = useCallback(id => {
    setArchivedIds(prev => {
      const list = Array.isArray(prev) ? prev : [];
      return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    });
  }, [setArchivedIds]);

  const isArchived = useCallback(id => archivedIds.includes(id), [archivedIds]);

  return { archivedIds, isArchived, toggleArchived, persist };
}
