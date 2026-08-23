import { useState, useCallback } from 'react';

/**
 * Archiving for the two capture sections, which otherwise grow forever.
 *
 * Stored locally, matching how pinning already works in these views
 * (anonvault_ideas_pinned). It is a view-level preference, not content, so
 * it deliberately does not go through Supabase or need a migration.
 */
export function useArchive(storageKey) {
  const [archivedIds, setArchivedIds] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const persist = next => {
    setArchivedIds(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { /* not critical */ }
  };

  const toggleArchived = useCallback(id => {
    setArchivedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try { localStorage.setItem(storageKey, JSON.stringify(next)); }
      catch { /* not critical */ }
      return next;
    });
  }, [storageKey]);

  const isArchived = useCallback(id => archivedIds.includes(id), [archivedIds]);

  return { archivedIds, isArchived, toggleArchived, persist };
}
