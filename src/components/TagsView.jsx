import { useMemo, useState, useRef } from 'react';
import {
  Menu, Lock, Hash, Lightbulb, Rocket, Search, ChevronRight, Tag as TagIcon
} from 'lucide-react';
import { useShortcutHooks } from '../utils/useShortcutHooks';

/**
 * Tags existed on ideas and concepts and nothing aggregated them. The palette
 * searches text; this is the structured view — one place that answers
 * "everything I have ever thought about #ai", across both sections.
 */
export default function TagsView({
  ideas, projectIdeas, onSelectIdea, onSelectProject, onLock, onMenuToggle, setActiveTab,
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);

  const rootRef = useRef(null);
  const searchRef = useRef(null);
  useShortcutHooks({ searchRef, rootRef });

  // One pass over both sections, so a tag used in each is counted once with
  // both sides recorded rather than appearing twice.
  const tags = useMemo(() => {
    const map = new Map();
    const add = (tag, kind, item) => {
      if (!tag) return;
      if (!map.has(tag)) map.set(tag, { tag, ideas: [], concepts: [] });
      map.get(tag)[kind].push(item);
    };
    for (const i of ideas || []) (i?.tags || []).forEach(t => add(t, 'ideas', i));
    for (const p of projectIdeas || []) (p?.tags || []).forEach(t => add(t, 'concepts', p));

    return [...map.values()]
      .map(t => ({ ...t, total: t.ideas.length + t.concepts.length }))
      .sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag));
  }, [ideas, projectIdeas]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tags.filter(t => t.tag.toLowerCase().includes(q)) : tags;
  }, [tags, query]);

  const selected = active ? tags.find(t => t.tag === active) : null;

  return (
    <div ref={rootRef} className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ background: '#07060f' }}>
      <div className="workspace-aurora-glow workspace-glow-1" />
      <div className="workspace-aurora-glow workspace-glow-2" />

      <header className="glass-header px-4 lg:px-7 py-4 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <button onClick={onMenuToggle}
            className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-white rounded-xl cursor-pointer flex items-center justify-center shrink-0 bg-white/[0.04] border border-white/[0.06] transition-all hover:bg-white/[0.07]">
            <Menu size={16} />
          </button>
          <div>
            <h2 className="text-[15px] lg:text-[17px] font-extrabold text-white tracking-tight leading-tight">Tags</h2>
            <p className="text-[10px] lg:text-[11px] text-slate-600 mt-0.5 font-medium">
              {tags.length} {tags.length === 1 ? 'tag' : 'tags'} across ideas and concepts
            </p>
          </div>
        </div>
        <button onClick={onLock}
          className="btn-ghost p-2.5 rounded-xl cursor-pointer flex items-center justify-center"
          title="Lock workspace">
          <Lock size={13} className="text-slate-500 hover:text-rose-400 transition-colors" />
        </button>
      </header>

      <div className="px-4 lg:px-7 py-3 border-b border-white/[0.04] shrink-0 relative z-10"
        style={{ background: 'rgba(7,6,15,0.6)', backdropFilter: 'blur(16px)' }}>
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter tags…"
            className="input-premium w-full pl-9 pr-4 py-2.5 text-[13px] rounded-xl font-medium placeholder:text-slate-700"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 lg:px-7 py-6 relative z-10 reveal-stagger custom-scrollbar">
        {tags.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
              <TagIcon size={22} className="text-slate-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-300">No tags yet</h3>
            <p className="text-[12px] text-slate-600 mt-1.5 leading-relaxed">
              Tag an idea or a concept and it will show up here, grouped across both.
            </p>
            <button onClick={() => setActiveTab('ideas')}
              className="btn-primary mt-5 px-5 py-2 text-[13px] font-semibold rounded-xl cursor-pointer">
              Open Idea Vault
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-5 items-start">

            {/* Every tag, most used first */}
            <div className="rounded-2xl p-2"
              style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              {visible.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-slate-600 font-medium">
                  No tag matches “{query}”.
                </p>
              ) : visible.map(t => {
                const isActive = active === t.tag;
                return (
                  <button key={t.tag}
                    onClick={() => setActive(isActive ? null : t.tag)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                      isActive ? 'bg-indigo-500/[0.12]' : 'hover:bg-white/[0.03]'
                    }`}>
                    <Hash size={11} className={isActive ? 'text-indigo-300 shrink-0' : 'text-slate-600 shrink-0'} />
                    <span className={`flex-1 min-w-0 truncate text-left text-[12.5px] font-semibold ${
                      isActive ? 'text-indigo-200' : 'text-slate-300'
                    }`}>
                      {t.tag}
                    </span>
                    {t.ideas.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-bold tabular-nums text-amber-400/80 shrink-0">
                        <Lightbulb size={9} />{t.ideas.length}
                      </span>
                    )}
                    {t.concepts.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-bold tabular-nums text-indigo-400/80 shrink-0">
                        <Rocket size={9} />{t.concepts.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* What carries the selected tag */}
            <div className="rounded-2xl p-4 min-h-[200px]"
              style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              {!selected ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                  <Hash size={20} className="text-slate-700 mb-2.5" />
                  <p className="text-[12.5px] font-semibold text-slate-400">Pick a tag</p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Everything filed under it shows here, from both sections.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.05]">
                    <Hash size={13} className="text-indigo-300" />
                    <h3 className="text-[13px] font-bold text-white tracking-tight">{selected.tag}</h3>
                    <span className="text-[10px] font-bold text-slate-600">
                      {selected.total} {selected.total === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {[
                    { key: 'ideas', label: 'Ideas', icon: Lightbulb, accent: '#fbbf24', pick: onSelectIdea },
                    { key: 'concepts', label: 'Concepts', icon: Rocket, accent: '#818cf8', pick: onSelectProject },
                  ].map(group => selected[group.key].length > 0 && (
                    <div key={group.key} className="mb-4 last:mb-0">
                      <div className="flex items-center gap-1.5 mb-2">
                        <group.icon size={10} style={{ color: group.accent }} />
                        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-600">
                          {group.label} · {selected[group.key].length}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {selected[group.key].map(item => (
                          <button key={item.id}
                            onClick={() => group.pick && group.pick(item.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.035] text-left group/row">
                            <span className="flex-1 min-w-0 truncate text-[12.5px] font-semibold text-slate-300 group-hover/row:text-white transition-colors">
                              {item.title}
                            </span>
                            {item.status && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 shrink-0">
                                {item.status}
                              </span>
                            )}
                            <ChevronRight size={11} className="text-slate-700 group-hover/row:text-indigo-400 transition-colors shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
