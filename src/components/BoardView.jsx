import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Calendar, Trash2, ChevronLeft, ChevronRight, Check, AlignLeft, Download,
  KanbanSquare, Link2, Image as ImageIcon, Play, Square, Timer, X, ExternalLink, Loader2, Sparkles,
} from 'lucide-react';
import { board, COLUMNS, PRIORITIES, addItem, moveItem, dueInfo } from '../services/board';
import { sessions, startSession, stopSession, boardTime, formatDuration, useNow } from '../services/focus';
import { parseCapture, formatWhen } from '../services/nlp';
import { uploadImage } from '../services/images';
import { PageHeader, Modal, Field, Select, Combo, Empty, inputCls } from './ui';

const TONE = { bad: 'text-rose-400', warn: 'text-amber-400', neutral: 'text-slate-500' };

const withProtocol = u => (/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`);
const hostOf = u => { try { return new URL(withProtocol(u)).hostname.replace(/^www\./, ''); } catch { return u; } };

/* What the smart quick-add understood, shown under the input as you type. */
function ParsePreview({ text }) {
  const p = text.trim() ? parseCapture(text) : null;
  if (!p || (!p.date && !p.label && !p.priority)) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-1.5 text-[11.5px] fade-up">
      <Sparkles size={11} className="text-accent-400" />
      {p.date && <span className="text-slate-300 inline-flex items-center gap-1"><Calendar size={11} className="text-slate-500" />{formatWhen(p.date, p.time)}</span>}
      {p.label && <span className="text-slate-400 px-1.5 h-[18px] leading-[18px] rounded bg-white/[0.05]">{p.label}</span>}
      {p.priority && <span className={p.priority === 'high' ? 'text-rose-400' : 'text-slate-400'}>{p.priority}</span>}
    </div>
  );
}

/* ═══════════════════════ card editor ═══════════════════════ */
function ItemModal({ item, labels, onClose, showToast, time, now }) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description || '');
  const [status, setStatus] = useState(item.status);
  const [priority, setPriority] = useState(item.priority || 'medium');
  const [label, setLabel] = useState(item.label || '');
  const [due, setDue] = useState(item.due_date || '');
  const [dueTime, setDueTime] = useState(item.due_time || '');
  const [links, setLinks] = useState(Array.isArray(item.links) ? item.links : []);
  const [linkDraft, setLinkDraft] = useState('');
  const [images, setImages] = useState(Array.isArray(item.images) ? item.images : []);
  const [uploading, setUploading] = useState(0);
  const [viewer, setViewer] = useState(null);
  const fileRef = useRef(null);

  const save = e => {
    e?.preventDefault();
    if (!title.trim()) return;
    const extra = linkDraft.trim() ? [{ url: withProtocol(linkDraft.trim()), label: '' }] : [];
    board.update(item.id, {
      title: title.trim(), description: description.trim(), priority, label: label.trim(),
      due_date: due || null, due_time: due && dueTime ? dueTime : null,
      links: [...links, ...extra].filter(l => l.url), images,
    });
    if (status !== item.status) moveItem(item.id, status);
    onClose();
  };
  const remove = () => {
    board.remove(item.id);
    showToast?.('warning', 'Card deleted', item.title, 6000, { label: 'Undo', onClick: () => board.restore(item) });
    onClose();
  };

  const addLink = () => {
    const u = linkDraft.trim();
    if (!u) return;
    setLinks(ls => [...ls, { url: withProtocol(u), label: '' }]);
    setLinkDraft('');
  };

  const addFiles = async files => {
    const list = [...(files || [])].filter(f => f.type?.startsWith('image/'));
    if (!list.length) return;
    setUploading(n => n + list.length);
    for (const f of list) {
      try {
        const url = await uploadImage(f);
        setImages(im => [...im, url]);
      } catch (err) {
        showToast?.('error', 'Image not added', err?.message || 'Upload failed');
      } finally {
        setUploading(n => n - 1);
      }
    }
  };

  const running = time?.running;
  const toggleTimer = () => {
    if (running) stopSession(running.id);
    else startSession({ label: title.trim() || item.title, project: label.trim() || null, board_id: item.id });
  };

  return (
    <Modal open onClose={onClose} title="Card" width={620}
      footer={<>
        <button onClick={remove} className="btn-danger h-8 px-3 rounded-lg text-[13px] cursor-pointer mr-auto inline-flex items-center gap-1.5"><Trash2 size={13} /><span className="hidden sm:inline">Delete</span></button>
        <button onClick={onClose} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Cancel</button>
        <button onClick={save} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">Save</button>
      </>}>
      <form onSubmit={save} className="space-y-4"
        onPaste={e => { const imgs = [...e.clipboardData.files].filter(f => f.type.startsWith('image/')); if (imgs.length) { e.preventDefault(); addFiles(imgs); } }}>
        <input value={title} onChange={e => setTitle(e.target.value)} aria-label="Title"
          className="w-full bg-transparent text-[18px] font-semibold tracking-[-0.01em] text-slate-50 outline-none placeholder:text-slate-600 border-b border-transparent focus:border-white/[0.1] pb-1" />

        {/* status strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Select className="w-full" size="sm" value={status} onChange={setStatus} ariaLabel="Status"
            options={COLUMNS.map(c => ({ value: c.id, label: c.label, color: c.color }))} />
          <Select className="w-full" size="sm" value={priority} onChange={setPriority} ariaLabel="Priority"
            options={PRIORITIES.map(p => ({ value: p.id, label: `${p.label} priority`, color: p.color }))} />
          <Combo value={label} onChange={setLabel} suggestions={labels} placeholder="Label" inputClassName="h-8" ariaLabel="Label" className="col-span-2 sm:col-span-2" />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <Field label="Due / remind on">
            <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Time">
            <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} disabled={!due}
              className={`${inputCls} !w-[120px] disabled:opacity-40`} />
          </Field>
        </div>

        <Field label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5}
            placeholder="What needs doing, context, steps, acceptance criteria…"
            className="input-premium w-full px-3 py-2 rounded-lg text-[13.5px] leading-relaxed resize-y min-h-[110px]" />
        </Field>

        {/* links */}
        <div>
          <span className="block text-[12px] font-medium text-slate-400 mb-1.5">Links</span>
          <div className="space-y-1.5">
            {links.map((l, i) => (
              <div key={i} className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <Link2 size={13} className="text-slate-500 shrink-0" />
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-[13px] text-slate-200 hover:text-white truncate">
                  {l.label || hostOf(l.url)} <span className="text-slate-500">{l.label ? '' : l.url.replace(/^https?:\/\/(www\.)?/, '').slice(hostOf(l.url).length)}</span>
                </a>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="icon-btn !w-7 !h-7" title="Open"><ExternalLink size={12} /></a>
                <button type="button" onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))} className="icon-btn !w-7 !h-7 hover:!text-rose-400" title="Remove"><X size={12} /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={linkDraft} onChange={e => setLinkDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                placeholder="Paste a link (GitHub issue, doc, Figma…)" className={inputCls} />
              <button type="button" onClick={addLink} className="btn-ghost h-9 px-3 rounded-lg text-[13px] cursor-pointer shrink-0">Add</button>
            </div>
          </div>
        </div>

        {/* images */}
        <div>
          <span className="block text-[12px] font-medium text-slate-400 mb-1.5">Images <span className="text-slate-600 font-normal">· paste with Ctrl+V</span></span>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.map((src, i) => (
              <div key={src.slice(0, 64) + i} className="group/img relative aspect-[4/3] rounded-lg overflow-hidden border border-white/[0.06] bg-black/30">
                <img src={src} alt="" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setViewer(src)} />
                {i === 0 && <span className="absolute left-1.5 top-1.5 text-[10.5px] px-1.5 rounded bg-black/60 text-slate-200">Cover</span>}
                <button type="button" onClick={() => setImages(im => im.filter((_, j) => j !== i))}
                  className="absolute right-1.5 top-1.5 w-6 h-6 rounded-md bg-black/60 text-slate-200 hover:text-rose-300 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover/img:opacity-100 transition-opacity cursor-pointer" title="Remove">
                  <X size={12} />
                </button>
              </div>
            ))}
            {Array.from({ length: uploading }).map((_, i) => (
              <div key={'up' + i} className="aspect-[4/3] rounded-lg border border-white/[0.06] skeleton flex items-center justify-center">
                <Loader2 size={16} className="animate-spin text-slate-500" />
              </div>
            ))}
            <button type="button" onClick={() => fileRef.current?.click()}
              className="aspect-[4/3] rounded-lg border border-dashed border-white/[0.12] hover:border-white/[0.25] hover:bg-white/[0.02] text-slate-500 hover:text-slate-300 flex flex-col items-center justify-center gap-1 text-[12px] cursor-pointer transition-colors">
              <ImageIcon size={16} /> Add image
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>
        </div>

        {/* time */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <span className="text-[13px] text-slate-400 inline-flex items-center gap-2">
            <Timer size={14} className="text-slate-500" />
            {time?.ms ? <>Tracked <span className="text-slate-100 tabular-nums">{formatDuration(time.ms)}</span> in {time.count} session{time.count === 1 ? '' : 's'}</> : 'No time tracked yet'}
            {running && <span className="font-mono text-emerald-400 tabular-nums">· {formatDuration(now - new Date(running.started_at).getTime(), { seconds: true })}</span>}
          </span>
          <button type="button" onClick={toggleTimer}
            className={`h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5 ${running ? 'btn-ghost !text-emerald-300' : 'btn-ghost'}`}>
            {running ? <><Square size={11} fill="currentColor" /> Stop timer</> : <><Play size={11} fill="currentColor" /> Start timer</>}
          </button>
        </div>
        <button type="submit" className="hidden" />
      </form>

      {viewer && (
        <div className="fixed inset-0 z-[150] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out fade-up" onClick={() => setViewer(null)}>
          <img src={viewer} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}
    </Modal>
  );
}

/* ═══════════════════════ card ═══════════════════════ */
function Card({ item, onOpen, onDragStart, dragging, time }) {
  const pr = PRIORITIES.find(p => p.id === item.priority);
  const due = dueInfo(item);
  const idx = COLUMNS.findIndex(c => c.id === item.status);
  const done = item.status === 'done';
  const links = Array.isArray(item.links) ? item.links.length : 0;
  const images = Array.isArray(item.images) ? item.images : [];
  const running = time?.running;
  const tracked = time ? time.ms : 0;
  const hasMeta = item.label || due || item.description || item.priority === 'high' || links || images.length || tracked;

  const toggleTimer = e => {
    e.stopPropagation();
    if (running) stopSession(running.id);
    else startSession({ label: item.title, project: item.label || null, board_id: item.id });
  };

  return (
    <div draggable onDragStart={e => onDragStart(e, item)} onClick={() => onOpen(item)}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(item); }} tabIndex={0} role="button"
      data-card={item.id}
      className={`group relative panel overflow-hidden cursor-pointer select-none transition-[opacity,border-color,background-color] duration-150 hover:border-white/[0.14] hover:bg-[var(--surface-2)] ${
        dragging ? 'opacity-40' : ''} ${running ? '!border-emerald-400/30' : ''}`}>
      {images[0] && (
        <div className="h-28 bg-black/30 border-b border-white/[0.05]">
          <img src={images[0]} alt="" className="w-full h-full object-cover" draggable={false} />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          <button type="button" aria-label={done ? 'Mark not done' : 'Mark done'}
            onClick={e => { e.stopPropagation(); moveItem(item.id, done ? 'todo' : 'done'); }}
            className={`mt-[1px] w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
              done ? 'bg-emerald-400 border-emerald-400 text-slate-950' : 'border-white/[0.25] hover:border-emerald-400/70'}`}>
            {done && <Check size={10} strokeWidth={3} />}
          </button>
          <p className={`flex-1 text-[13px] leading-snug pr-1 ${done ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{item.title}</p>
        </div>
        {item.description && !done && (
          <p className="text-[12px] text-slate-500 leading-snug mt-1.5 pl-[26px] line-clamp-2">{item.description}</p>
        )}
        {hasMeta && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 pl-[26px] pr-14">
            {item.priority === 'high' && !done && <span className="text-[11.5px] text-rose-400 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: pr.color }} />High</span>}
            {item.label && <span className="text-[11.5px] text-slate-400 px-1.5 h-5 leading-5 rounded-md bg-white/[0.04] border border-white/[0.06] truncate max-w-[140px]">{item.label}</span>}
            {due && <span className={`text-[11.5px] inline-flex items-center gap-1 ${TONE[due.tone]}`}><Calendar size={11} />{due.text}</span>}
            {(tracked > 0 || running) && (
              <span className={`text-[11.5px] inline-flex items-center gap-1 tabular-nums ${running ? 'text-emerald-400' : 'text-slate-500'}`}>
                <Timer size={11} />{running ? formatDuration(tracked, { seconds: true }) : formatDuration(tracked)}
              </span>
            )}
            {links > 0 && <span className="text-[11.5px] text-slate-500 inline-flex items-center gap-0.5"><Link2 size={11} />{links}</span>}
            {images.length > 1 && <span className="text-[11.5px] text-slate-500 inline-flex items-center gap-0.5"><ImageIcon size={11} />{images.length}</span>}
            {item.description && done && <AlignLeft size={11} className="text-slate-600" />}
          </div>
        )}
      </div>
      {/* hover controls: timer + move */}
      <div className="absolute right-1.5 bottom-1.5 flex gap-0.5 rounded-md bg-[var(--surface-2)] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {!done && (
          <button onClick={toggleTimer} className={`icon-btn !w-6 !h-6 ${running ? '!text-emerald-400' : ''}`} title={running ? 'Stop timer' : 'Start a timer on this card'}>
            {running ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
          </button>
        )}
        {idx > 0 && (
          <button onClick={e => { e.stopPropagation(); moveItem(item.id, COLUMNS[idx - 1].id); }}
            className="icon-btn !w-6 !h-6" title={`Move to ${COLUMNS[idx - 1].label}`}><ChevronLeft size={13} /></button>
        )}
        {idx < COLUMNS.length - 1 && (
          <button onClick={e => { e.stopPropagation(); moveItem(item.id, COLUMNS[idx + 1].id); }}
            className="icon-btn !w-6 !h-6" title={`Move to ${COLUMNS[idx + 1].label}`}><ChevronRight size={13} /></button>
        )}
      </div>
      {running && <span className="absolute right-2 top-2 live-dot" />}
    </div>
  );
}

/* ═══════════════════════ board ═══════════════════════ */
export default function BoardView({ onLock, onMenuToggle, showToast, legacyProjects = [] }) {
  const all = board.useAll();
  const allSessions = sessions.useAll();
  const anyRunning = allSessions.some(s => s.board_id && !s.ended_at);
  const now = useNow(1000, anyRunning);
  const times = useMemo(() => boardTime(allSessions, now), [allSessions, now]);

  const [query, setQuery] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ todo: '', doing: '', done: '' });
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { col, before }
  const [showAllDone, setShowAllDone] = useState(false);
  const todoInput = useRef(null);
  const searchRef = useRef(null);
  const editing = editingId ? all.find(i => i.id === editingId) : null;

  useEffect(() => {
    const onNew = () => { if (todoInput.current?.closest('[aria-hidden="false"]')) todoInput.current.focus(); };
    const onSearch = () => { if (searchRef.current?.closest('[aria-hidden="false"]')) searchRef.current.focus(); };
    const onOpen = e => { if (e.detail) setEditingId(e.detail); };
    window.addEventListener('anonvault:new', onNew);
    window.addEventListener('anonvault:focus-search', onSearch);
    window.addEventListener('anonvault:open-card', onOpen);
    return () => {
      window.removeEventListener('anonvault:new', onNew);
      window.removeEventListener('anonvault:focus-search', onSearch);
      window.removeEventListener('anonvault:open-card', onOpen);
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
    const text = draft[status];
    if (!text.trim()) return;
    const p = parseCapture(text);
    // "#acme" should land on the existing "Acme" label, not start a new one.
    const label = p.label ? labels.find(l => l.toLowerCase() === p.label.toLowerCase()) || p.label : labelFilter || '';
    const it = addItem({
      title: p.title, status, label, priority: p.priority || 'medium',
      due_date: p.date, due_time: p.time,
    });
    if (it) {
      setDraft(d => ({ ...d, [status]: '' }));
      if (p.date) showToast?.('success', 'Card added', `${it.title} · ${formatWhen(p.date, p.time)}`);
    }
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
        links: (p.links || []).map(l => (typeof l === 'string' ? { url: l, label: '' } : { url: l.url, label: l.label || '' })).filter(l => l.url),
        images: (p.images || []).map(im => (typeof im === 'string' ? im : im?.url)).filter(Boolean),
      });
    }
    showToast?.('success', 'Imported', `${toImport.length} project${toImport.length === 1 ? '' : 's'} added to the board`);
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Board"
        stats={[
          { value: openCount, label: 'open', always: true },
          { value: all.filter(i => i.status === 'doing').length, label: 'in progress', tone: 'warn' },
          { value: overdue, label: 'overdue', tone: 'bad' },
        ]}
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
                  className={`rounded-xl border p-2 transition-colors min-h-[160px] min-w-0 ${isOver ? 'bg-white/[0.035] border-white/[0.12]' : 'bg-white/[0.015] border-white/[0.05]'}`}>
                  <header className="flex items-center gap-2 px-1.5 h-8">
                    <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <h3 className="text-[13px] font-medium text-slate-200">{col.label}</h3>
                    <span className="text-[12px] text-slate-500 tabular-nums">{items.length}</span>
                  </header>

                  <form onSubmit={e => add(col.id, e)} className="mb-2">
                    <input ref={col.id === 'todo' ? todoInput : undefined}
                      value={draft[col.id]} onChange={e => setDraft(d => ({ ...d, [col.id]: e.target.value }))}
                      placeholder={col.id === 'todo' ? '+ Add a card — try "call bank tomorrow 5pm #personal"' : '+ Add a card'}
                      className="w-full h-8 px-2.5 rounded-lg bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 border border-transparent hover:border-white/[0.06] focus:border-white/[0.12] focus:bg-white/[0.02] outline-none transition-colors" />
                    <ParsePreview text={draft[col.id]} />
                  </form>

                  <div className="space-y-2">
                    {shown.map(item => (
                      <div key={item.id}>
                        {isOver && over.before === item.id && <div className="h-0.5 rounded-full bg-[var(--accent)] mb-2" />}
                        <Card item={item} onOpen={i => setEditingId(i.id)} onDragStart={onDragStart} dragging={dragId === item.id}
                          time={times.get(item.id)} />
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
              body='Type naturally: "renew passport in 2 weeks", "submit demo friday #hackindia !high". Dates, #labels and !priority are picked up for you.' />
          )}
        </div>
      </div>

      {editing && <ItemModal key={editing.id} item={editing} labels={labels} showToast={showToast} onClose={() => setEditingId(null)}
        time={times.get(editing.id)} now={now} />}
    </div>
  );
}
