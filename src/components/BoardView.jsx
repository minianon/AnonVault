import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Calendar, Trash2, ChevronLeft, ChevronRight, Check, AlignLeft, Download,
  KanbanSquare,
} from 'lucide-react';
import { board, COLUMNS, PRIORITIES, addItem, moveItem, dueInfo } from '../services/board';
import { PageHeader, Modal, Field, Select, Combo, Empty, inputCls } from './ui';

const TONE = { bad: 'text-rose-400', warn: 'text-amber-400', neutral: 'text-slate-500' };

function ItemModal({ item, labels, onClose, showToast }) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description || '');
  const [status, setStatus] = useState(item.status);
  const [priority, setPriority] = useState(item.priority || 'medium');
  const [label, setLabel] = useState(item.label || '');
  const [due, setDue] = useState(item.due_date || '');

  const save = e => {
    e?.preventDefault();
    if (!title.trim()) return;
    board.update(item.id, { title: title.trim(), description: description.trim(), priority, label: label.trim(), due_date: due || null });
    if (status !== item.status) moveItem(item.id, status);
    onClose();
  };
  const remove = () => {
    board.remove(item.id);
    showToast?.('warning', 'Card deleted', item.title, 6000, { label: 'Undo', onClick: () => board.restore(item) });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Edit card" width={520}
      footer={<>
        <button onClick={remove} className="btn-danger h-8 px-3 rounded-lg text-[13px] cursor-pointer mr-auto inline-flex items-center gap-1.5"><Trash2 size={13} /> Delete</button>
        <button onClick={onClose} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Cancel</button>
        <button onClick={save} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">Save</button>
      </>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Title">
          <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Notes">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            placeholder="Details, links, steps…" className="input-premium w-full px-3 py-2 rounded-lg text-[13px] resize-y min-h-[88px]" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select className="w-full" value={status} onChange={setStatus} ariaLabel="Status"
              options={COLUMNS.map(c => ({ value: c.id, label: c.label, color: c.color }))} />
          </Field>
          <Field label="Priority">
            <Select className="w-full" value={priority} onChange={setPriority} ariaLabel="Priority"
              options={PRIORITIES.map(p => ({ value: p.id, label: p.label, color: p.color }))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Label" hint="Project, company, personal…">
            <Combo value={label} onChange={setLabel} suggestions={labels} placeholder="e.g. Acme, Personal" inputClassName="h-9" ariaLabel="Label" />
          </Field>
          <Field label="Due / remind on">
            <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function Card({ item, onOpen, onDragStart, dragging }) {
  const pr = PRIORITIES.find(p => p.id === item.priority);
  const due = dueInfo(item);
  const idx = COLUMNS.findIndex(c => c.id === item.status);
  const done = item.status === 'done';
  return (
    <div draggable onDragStart={e => onDragStart(e, item)} onClick={() => onOpen(item)}
      data-card={item.id}
      className={`group relative panel p-3 cursor-pointer select-none transition-[opacity,border-color,background-color] duration-150 hover:border-white/[0.14] hover:bg-[var(--surface-2)] ${dragging ? 'opacity-40' : ''}`}>
      <div className="flex items-start gap-2.5">
        <button type="button" aria-label={done ? 'Mark not done' : 'Mark done'}
          onClick={e => { e.stopPropagation(); moveItem(item.id, done ? 'todo' : 'done'); }}
          className={`mt-[1px] w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
            done ? 'bg-emerald-400 border-emerald-400 text-slate-950' : 'border-white/[0.25] hover:border-emerald-400/70'}`}>
          {done && <Check size={10} strokeWidth={3} />}
        </button>
        <p className={`flex-1 text-[13px] leading-snug pr-1 ${done ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{item.title}</p>
      </div>
      {(item.label || due || item.description || item.priority === 'high') && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 pl-[26px]">
          {item.priority === 'high' && !done && <span className="text-[11.5px] text-rose-400 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: pr.color }} />High</span>}
          {item.label && <span className="text-[11.5px] text-slate-400 px-1.5 h-5 leading-5 rounded-md bg-white/[0.04] border border-white/[0.06] truncate max-w-[140px]">{item.label}</span>}
          {due && <span className={`text-[11.5px] inline-flex items-center gap-1 ${TONE[due.tone]}`}><Calendar size={11} />{due.text}</span>}
          {item.description && <AlignLeft size={11} className="text-slate-600" />}
        </div>
      )}
      {/* tap-friendly move controls */}
      <div className="absolute right-1.5 bottom-1.5 flex gap-0.5 rounded-md bg-[var(--surface-2)] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        {idx > 0 && (
          <button onClick={e => { e.stopPropagation(); moveItem(item.id, COLUMNS[idx - 1].id); }}
            className="icon-btn !w-6 !h-6" title={`Move to ${COLUMNS[idx - 1].label}`}><ChevronLeft size={13} /></button>
        )}
        {idx < COLUMNS.length - 1 && (
          <button onClick={e => { e.stopPropagation(); moveItem(item.id, COLUMNS[idx + 1].id); }}
            className="icon-btn !w-6 !h-6" title={`Move to ${COLUMNS[idx + 1].label}`}><ChevronRight size={13} /></button>
        )}
      </div>
    </div>
  );
}

export default function BoardView({ onLock, onMenuToggle, showToast, legacyProjects = [] }) {
  const all = board.useAll();
  const [query, setQuery] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ todo: '', doing: '', done: '' });
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { col, before }
  const [showAllDone, setShowAllDone] = useState(false);
  const todoInput = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const onNew = () => todoInput.current?.focus();
    const onSearch = () => searchRef.current?.focus();
    window.addEventListener('anonvault:new', onNew);
    window.addEventListener('anonvault:focus-search', onSearch);
    return () => {
      window.removeEventListener('anonvault:new', onNew);
      window.removeEventListener('anonvault:focus-search', onSearch);
    };
  }, []);

  const labels = useMemo(() => [...new Set(all.map(i => i.label).filter(Boolean))].sort(), [all]);
  const filtered = all.filter(i =>
    (!labelFilter || i.label === labelFilter) &&
    (!query.trim() || (i.title + ' ' + (i.description || '') + ' ' + (i.label || '')).toLowerCase().includes(query.toLowerCase())));

  const openCount = all.filter(i => i.status !== 'done').length;
  const overdue = all.filter(i => dueInfo(i)?.tone === 'bad').length;

  const add = (status, e) => {
    e.preventDefault();
    const it = addItem({ title: draft[status], status, label: labelFilter || '' });
    if (it) setDraft(d => ({ ...d, [status]: '' }));
  };

  /* drag & drop */
  const onDragStart = (e, item) => {
    setDragId(item.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id);
  };
  const onDragOverCol = (e, col) => {
    e.preventDefault();
    const cards = [...e.currentTarget.querySelectorAll('[data-card]')].filter(el => el.dataset.card !== dragId);
    const before = cards.find(el => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    const next = { col, before: before?.dataset.card || null };
    if (!over || over.col !== next.col || over.before !== next.before) setOver(next);
  };
  const onDrop = (e, col) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (id) moveItem(id, col, over?.col === col ? over.before : null);
    setDragId(null); setOver(null);
  };

  /* one-time import of the old Projects board */
  const imported = new Set(all.map(i => i.promoted_from).filter(Boolean));
  const toImport = legacyProjects.filter(p => p && !imported.has('project:' + p.id));
  const importLegacy = () => {
    const map = { backlog: 'todo', building: 'doing', shipped: 'done', parked: 'todo' };
    for (const p of toImport) {
      addItem({
        title: p.title, description: p.content || '', status: map[p.status] || 'todo',
        label: 'Project', promoted_from: 'project:' + p.id,
      });
    }
    showToast?.('success', 'Imported', `${toImport.length} project${toImport.length === 1 ? '' : 's'} added to the board`);
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Board" subtitle={`${openCount} open${overdue ? ` · ${overdue} overdue` : ''}`}
        onMenuToggle={onMenuToggle} onLock={onLock}
        actions={
          <button onClick={() => todoInput.current?.focus()} className="btn-primary h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
            <Plus size={14} /><span className="hidden sm:inline">New card</span>
          </button>
        } />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-5 space-y-4">
          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search cards"
                className="input-premium w-full h-8 pl-8 pr-3 rounded-lg text-[13px]" />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button onClick={() => setLabelFilter('')}
                className={`h-7 px-2.5 rounded-md text-[12px] border cursor-pointer transition-colors shrink-0 ${!labelFilter ? 'bg-white/[0.09] border-white/[0.14] text-slate-100' : 'border-white/[0.06] text-slate-400 hover:text-slate-200'}`}>
                All
              </button>
              {labels.map(l => (
                <button key={l} onClick={() => setLabelFilter(f => (f === l ? '' : l))}
                  className={`h-7 px-2.5 rounded-md text-[12px] border cursor-pointer transition-colors shrink-0 ${labelFilter === l ? 'bg-white/[0.09] border-white/[0.14] text-slate-100' : 'border-white/[0.06] text-slate-400 hover:text-slate-200'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {toImport.length > 0 && (
            <div className="panel px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
              <p className="text-[13px] text-slate-300">
                You have {toImport.length} item{toImport.length === 1 ? '' : 's'} from the old Projects board.
              </p>
              <button onClick={importLegacy} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
                <Download size={13} /> Import to board
              </button>
            </div>
          )}

          {/* columns */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-start">
            {COLUMNS.map(col => {
              let items = filtered.filter(i => i.status === col.id);
              if (col.id === 'done') items = [...items].sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
              const hidden = col.id === 'done' && !showAllDone ? Math.max(0, items.length - 8) : 0;
              const shown = hidden ? items.slice(0, 8) : items;
              const isOver = over?.col === col.id && dragId;
              return (
                <section key={col.id}
                  onDragOver={e => onDragOverCol(e, col.id)}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
                  onDrop={e => onDrop(e, col.id)}
                  className={`rounded-xl border p-2 transition-colors min-h-[160px] ${isOver ? 'bg-white/[0.035] border-white/[0.12]' : 'bg-white/[0.015] border-white/[0.05]'}`}>
                  <header className="flex items-center gap-2 px-1.5 h-8">
                    <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <h3 className="text-[13px] font-medium text-slate-200">{col.label}</h3>
                    <span className="text-[12px] text-slate-500 tabular-nums">{items.length}</span>
                  </header>

                  <form onSubmit={e => add(col.id, e)} className="mb-2">
                    <input ref={col.id === 'todo' ? todoInput : undefined}
                      value={draft[col.id]} onChange={e => setDraft(d => ({ ...d, [col.id]: e.target.value }))}
                      placeholder="+ Add a card"
                      className="w-full h-8 px-2.5 rounded-lg bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 border border-transparent hover:border-white/[0.06] focus:border-white/[0.12] focus:bg-white/[0.02] outline-none transition-colors" />
                  </form>

                  <div className="space-y-2">
                    {shown.map(item => (
                      <div key={item.id}>
                        {isOver && over.before === item.id && <div className="h-0.5 rounded-full bg-[var(--accent)] mb-2" />}
                        <Card item={item} onOpen={setEditing} onDragStart={onDragStart} dragging={dragId === item.id} />
                      </div>
                    ))}
                    {isOver && !over.before && <div className="h-0.5 rounded-full bg-[var(--accent)]" />}
                    {items.length === 0 && !isOver && (
                      <p className="text-[12px] text-slate-600 text-center py-6">
                        {col.id === 'todo' ? 'Nothing to do. Nice.' : col.id === 'doing' ? 'Drag a card here when you start it' : 'Finished cards land here'}
                      </p>
                    )}
                    {hidden > 0 && (
                      <button onClick={() => setShowAllDone(true)} className="w-full h-8 text-[12px] text-slate-500 hover:text-slate-200 cursor-pointer">
                        Show {hidden} more
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {all.length === 0 && (
            <Empty icon={KanbanSquare} title="Your board is empty"
              body="Add anything you need to do — an issue for a project, a task for a company, or a reminder for yourself. Give it a due date and it shows up on Today." />
          )}
        </div>
      </div>

      {editing && <ItemModal item={editing} labels={labels} showToast={showToast} onClose={() => setEditing(null)} />}
    </div>
  );
}
