import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Calendar, Trash2, ChevronLeft, ChevronRight, Check, AlignLeft, Download,
  KanbanSquare, Link2, Image as ImageIcon, Play, Square, Timer, X, Loader2, Sparkles, Flag, Tag, Maximize2, ListPlus,
} from 'lucide-react';
import { addToChecklist } from '../utils/jump';
import { board, COLUMNS, PRIORITIES, addItem, moveItem, dueInfo } from '../services/board';
import { sessions, startSession, stopSession, boardTime, formatDuration, useNow } from '../services/focus';
import { parseCapture, formatWhen } from '../services/nlp';
import { uploadImage } from '../services/images';
import { PageHeader, Modal, Select, Combo, Empty } from './ui';
import { EditorLayout, PropRow, TitleInput, DescriptionInput, DueField, LinksEditor, ImagesEditor } from './editor';
import { useImageUpload } from '../utils/useImageUpload';
import { withProtocol, hostOf } from '../utils/links';

const TONE = { bad: 'text-rose-400', warn: 'text-amber-400', neutral: 'text-slate-500' };


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

/* ═══════════════════════ card editor ═══════════════════════
   Built from the shared editor kit (editor.jsx) so it matches the other
   sections: content on the left, properties on the right. */
function ItemModal({ item, isNew = false, labels, onClose, showToast, time, now }) {
  const [title, setTitle] = useState(item.title || '');
  const [description, setDescription] = useState(item.description || '');
  const [status, setStatus] = useState(item.status || 'todo');
  const [priority, setPriority] = useState(item.priority || 'medium');
  const [label, setLabel] = useState(item.label || '');
  const [due, setDue] = useState(item.due_date || '');
  const [dueTime, setDueTime] = useState(item.due_time || '');
  const [links, setLinks] = useState(Array.isArray(item.links) ? item.links : []);
  const [images, setImages] = useState(Array.isArray(item.images) ? item.images : []);
  const [uploading, addFiles, onPaste] = useImageUpload(setImages, showToast);

  const save = e => {
    e?.preventDefault();
    if (!title.trim() || uploading) return;
    const fields = {
      title: title.trim(), description: description.trim(), priority, label: label.trim(),
      due_date: due || null, due_time: due && dueTime ? dueTime : null, links, images,
    };
    if (isNew) {
      const it = addItem({ ...fields, status });
      showToast?.('success', 'Card added', it.title);
    } else {
      board.update(item.id, fields);
      if (status !== item.status) moveItem(item.id, status);
    }
    onClose();
  };
  const remove = () => {
    board.remove(item.id);
    showToast?.('warning', 'Card deleted', item.title, 6000, { label: 'Undo', onClick: () => board.restore(item) });
    onClose();
  };

  const running = time?.running;
  const toggleTimer = () => {
    if (running) stopSession(running.id);
    else startSession({ label: title.trim() || item.title, project: label.trim() || null, board_id: item.id });
  };
  const created = item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <Modal open onClose={onClose} title={isNew ? 'New card' : 'Card'} width={780}
      footer={<>
        {!isNew && <button onClick={remove} className="btn-danger h-8 px-3 rounded-lg text-[13px] cursor-pointer mr-auto inline-flex items-center gap-1.5"><Trash2 size={13} /><span className="hidden sm:inline">Delete</span></button>}
        {!isNew && (
          <button type="button" onClick={() => addToChecklist(title.trim() || item.title)} title="Add this to today's checklist"
            className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
            <ListPlus size={13} /><span className="hidden sm:inline">Today's checklist</span>
          </button>
        )}
        <span className="hidden sm:flex items-center gap-1 text-[11.5px] text-slate-600 mr-1"><span className="kbd">Ctrl</span><span className="kbd">↵</span> save</span>
        <button onClick={onClose} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Cancel</button>
        <button onClick={save} disabled={!title.trim() || uploading > 0}
          className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
          {isNew ? 'Add card' : 'Save'}
        </button>
      </>}>
      <form onSubmit={save} onPaste={onPaste}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(e); }}>
        <EditorLayout aside={<>
          <PropRow icon={KanbanSquare} label="Status">
            <Select className="w-full" size="sm" value={status} onChange={setStatus} ariaLabel="Status"
              options={COLUMNS.map(c => ({ value: c.id, label: c.label, color: c.color }))} />
          </PropRow>
          <PropRow icon={Flag} label="Priority">
            <Select className="w-full" size="sm" value={priority} onChange={setPriority} ariaLabel="Priority"
              options={PRIORITIES.map(p => ({ value: p.id, label: p.label, color: p.color }))} />
          </PropRow>
          <PropRow icon={Tag} label="Label">
            <Combo value={label} onChange={setLabel} suggestions={labels} placeholder="None" inputClassName="h-8" ariaLabel="Label" />
          </PropRow>
          <PropRow icon={Calendar} label="Due" top>
            <DueField date={due} time={dueTime} onDate={setDue} onTime={setDueTime} />
          </PropRow>
          {!isNew && (
            <div className="pt-3 mt-2 border-t border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-slate-500 inline-flex items-center gap-1.5"><Timer size={13} className="text-slate-600" />Time</span>
                <span className="text-[12.5px] tabular-nums text-slate-300">
                  {running
                    ? <span className="font-mono text-emerald-400">{formatDuration(now - new Date(running.started_at).getTime(), { seconds: true })}</span>
                    : time?.ms ? formatDuration(time.ms) : '—'}
                </span>
              </div>
              <button type="button" onClick={toggleTimer}
                className={`w-full h-8 rounded-lg text-[13px] cursor-pointer inline-flex items-center justify-center gap-1.5 border transition-colors ${
                  running ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/[0.06] hover:bg-emerald-400/[0.1]' : 'text-slate-300 border-white/[0.1] hover:bg-white/[0.05]'}`}>
                {running ? <><Square size={11} fill="currentColor" /> Stop timer</> : <><Play size={11} fill="currentColor" /> Start timer</>}
              </button>
              {time?.count > 0 && <p className="text-[11.5px] text-slate-600 text-center">{time.count} session{time.count === 1 ? '' : 's'} tracked</p>}
              {created && <p className="text-[11.5px] text-slate-600 pt-1">Created {created}</p>}
            </div>
          )}
        </>}>
          <TitleInput value={title} onChange={setTitle} placeholder="Card title" />
          <DescriptionInput value={description} onChange={setDescription} placeholder="Add a description — context, steps, what done looks like…" />
          <LinksEditor links={links} onChange={setLinks} />
          <ImagesEditor images={images} onChange={setImages} uploading={uploading} onAddFiles={addFiles} />
        </EditorLayout>
        <button type="submit" className="hidden" />
      </form>
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

/* ═══════════════════════ inline composer ═══════════════════════
   Same feel as Ideas' quick capture: one line until you click in, then it
   opens up in place for everything a card can hold. Typing a date, #label
   or !priority in the title fills those in; anything set by hand wins. */
function BoardComposer({ inputRef, labels, defaultLabel, showToast, onExpand }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('todo');
  const [priority, setPriority] = useState(null); // null = take from text / medium
  const [label, setLabel] = useState('');
  const [due, setDue] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [links, setLinks] = useState([]);
  const [linkDraft, setLinkDraft] = useState('');
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(0);
  const wrapRef = useRef(null);
  const fileRef = useRef(null);

  const parsed = title.trim() ? parseCapture(title) : null;
  const effDate = due || parsed?.date || '';
  const effTime = due ? dueTime : dueTime || parsed?.time || '';
  const effLabelRaw = label || parsed?.label || '';
  const effLabel = effLabelRaw ? labels.find(l => l.toLowerCase() === effLabelRaw.toLowerCase()) || effLabelRaw : '';
  const effPriority = priority || parsed?.priority || 'medium';

  const reset = () => {
    setTitle(''); setDescription(''); setStatus('todo'); setPriority(null); setLabel(defaultLabel || '');
    setDue(''); setDueTime(''); setLinks([]); setLinkDraft(''); setImages([]);
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
    setOpen(true);
    setUploading(n => n + list.length);
    for (const f of list) {
      try { const url = await uploadImage(f); setImages(im => [...im, url]); }
      catch (err) { showToast?.('error', 'Image not added', err?.message || 'Upload failed'); }
      finally { setUploading(n => n - 1); }
    }
  };

  const submit = e => {
    e?.preventDefault();
    if (!title.trim() || uploading) return;
    const extra = linkDraft.trim() ? [{ url: withProtocol(linkDraft.trim()), label: '' }] : [];
    const it = addItem({
      title: parsed?.title || title.trim(), description: description.trim(), status,
      priority: effPriority, label: effLabel, due_date: effDate || null, due_time: effDate && effTime ? effTime : null,
      links: [...links, ...extra], images,
    });
    if (it) {
      showToast?.('success', 'Card added', effDate ? `${it.title} · ${formatWhen(effDate, effTime || null)}` : it.title);
      reset();
      inputRef.current?.focus();
    }
  };

  const onFocus = () => { if (!open) { setOpen(true); if (!label && defaultLabel) setLabel(defaultLabel); } };
  const onBlur = e => {
    if (wrapRef.current?.contains(e.relatedTarget)) return;
    // stay open while a themed dropdown (rendered outside) is in use
    if (e.relatedTarget?.closest?.('[role=listbox]')) return;
    const empty = !title.trim() && !description.trim() && !links.length && !images.length && !linkDraft.trim();
    if (empty && !uploading) setOpen(false);
  };
  const keep = e => e.preventDefault();

  return (
    <form ref={wrapRef} onSubmit={submit} onFocus={onFocus} onBlur={onBlur}
      onPaste={e => { const imgs = [...e.clipboardData.files].filter(f => f.type.startsWith('image/')); if (imgs.length) { e.preventDefault(); addFiles(imgs); } }}
      className={`panel transition-[border-color,box-shadow] duration-200 ${open ? '!border-white/[0.14] shadow-[var(--shadow-md)]' : ''}`}>
      <div className="flex items-center gap-2.5 px-3.5">
        <KanbanSquare size={15} className={`shrink-0 transition-colors ${open ? 'text-slate-300' : 'text-slate-500'}`} />
        <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
            else if (e.key === 'Escape') e.currentTarget.blur();
          }}
          placeholder='Add a card… try "call bank tomorrow 5pm #personal !high"'
          aria-label="New card title"
          className="flex-1 min-w-0 h-11 bg-transparent text-[14px] text-slate-100 placeholder:text-slate-500 outline-none" />
        {!open && <span className="kbd hidden sm:inline-flex shrink-0" title="Press N to add a card">N</span>}
      </div>

      {open && (
        <div className="px-3.5 pb-3 fade-up">
          {parsed && (parsed.date || parsed.label || parsed.priority) && (
            <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500 -mt-1 mb-1.5">
              <Sparkles size={11} className="text-accent-400" /> Understood:
              {parsed.date && !due && <span className="text-slate-300">{formatWhen(parsed.date, parsed.time)}</span>}
              {parsed.label && !label && <span className="text-slate-300">#{parsed.label}</span>}
              {parsed.priority && !priority && <span className="text-slate-300">{parsed.priority} priority</span>}
            </p>
          )}
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }}
            rows={2} placeholder="Add a description…" aria-label="Description"
            className="w-full bg-transparent py-1 text-[13px] leading-relaxed text-slate-300 placeholder:text-slate-600 outline-none resize-none [field-sizing:content] min-h-[44px] max-h-48" />

          {/* links + images */}
          {(links.length > 0 || images.length > 0 || uploading > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {images.map((src, i) => (
                <span key={src.slice(0, 48) + i} className="relative w-14 h-10 rounded-md overflow-hidden border border-white/[0.08] group/th">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button type="button" onMouseDown={keep} onClick={() => setImages(im => im.filter((_, j) => j !== i))}
                    className="absolute inset-0 bg-black/60 text-slate-100 flex items-center justify-center opacity-0 group-hover/th:opacity-100 transition-opacity cursor-pointer" title="Remove">
                    <X size={12} />
                  </button>
                </span>
              ))}
              {Array.from({ length: uploading }).map((_, i) => (
                <span key={'u' + i} className="w-14 h-10 rounded-md border border-white/[0.08] skeleton flex items-center justify-center"><Loader2 size={12} className="animate-spin text-slate-500" /></span>
              ))}
              {links.map((l, i) => (
                <span key={l.url + i} className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-md text-[12px] text-slate-300 bg-white/[0.04] border border-white/[0.07] max-w-[220px]">
                  <Link2 size={11} className="text-slate-500 shrink-0" /><span className="truncate">{hostOf(l.url)}</span>
                  <button type="button" onMouseDown={keep} onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))}
                    className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-slate-100 cursor-pointer" title="Remove"><X size={11} /></button>
                </span>
              ))}
            </div>
          )}

          {/* fields */}
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-2.5 mt-2">
            <Select size="sm" className="w-[128px]" value={status} onChange={setStatus} ariaLabel="Column"
              options={COLUMNS.map(c => ({ value: c.id, label: c.label, color: c.color }))} />
            <Select size="sm" className="w-[112px]" value={effPriority} onChange={setPriority} ariaLabel="Priority"
              options={PRIORITIES.map(p => ({ value: p.id, label: p.label, color: p.color }))} />
            <Combo value={label || (parsed?.label ?? '')} onChange={setLabel} suggestions={labels} placeholder="# Label"
              inputClassName="h-8 w-[130px]" ariaLabel="Label" />
            <DueField compact date={effDate} time={effTime} placeholder="Due"
              onDate={d => { setDue(d); if (!d) setDueTime(''); }} onTime={t => { setDue(effDate); setDueTime(t); }} />
            <div className="flex items-center gap-1 flex-1 min-w-[180px]">
              <Link2 size={13} className="text-slate-500 shrink-0" />
              <input value={linkDraft} onChange={e => setLinkDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addLink(); } }}
                placeholder="Paste a link, Enter to add" aria-label="Link"
                className="flex-1 min-w-0 h-8 bg-transparent text-[12.5px] text-slate-200 placeholder:text-slate-600 outline-none" />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2.5">
            <button type="button" onMouseDown={keep} onClick={() => fileRef.current?.click()}
              className="btn-ghost h-8 px-2.5 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
              <ImageIcon size={13} /> Image
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            <span className="hidden md:flex items-center gap-1 text-[11.5px] text-slate-600 ml-1">
              or paste one · <span className="kbd">↵</span> add
            </span>
            <button type="button" onMouseDown={keep}
              onClick={() => {
                onExpand?.({
                  title: parsed?.title || title.trim(), description, status, priority: effPriority, label: effLabel,
                  due_date: effDate || null, due_time: effDate && effTime ? effTime : null,
                  links: [...links, ...(linkDraft.trim() ? [{ url: withProtocol(linkDraft.trim()), label: '' }] : [])], images,
                });
                reset(); setOpen(false);
              }}
              className="ml-auto btn-ghost h-8 px-2.5 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5" title="Open the full editor">
              <Maximize2 size={12} /><span className="hidden sm:inline">Full editor</span>
            </button>
            <button type="button" onMouseDown={keep} onClick={() => { reset(); setOpen(false); inputRef.current?.blur(); }}
              className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Cancel</button>
            <button type="submit" onMouseDown={keep} disabled={!title.trim() || uploading > 0}
              className="btn-primary h-8 px-3.5 rounded-lg text-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              Add card
            </button>
          </div>
        </div>
      )}
    </form>
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
  const composerRef = useRef(null);
  const searchRef = useRef(null);
  const editing = editingId ? all.find(i => i.id === editingId) : null;
  const [creating, setCreating] = useState(null); // draft for the full "New card" editor

  useEffect(() => {
    const onNew = () => { if (composerRef.current?.closest('[aria-hidden="false"]')) composerRef.current.focus(); };
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
          <button onClick={() => setCreating({ id: 'new', status: 'todo', label: labelFilter || '' })} className="btn-primary h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
            <Plus size={14} /><span className="hidden sm:inline">New card</span>
          </button>
        } />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-5 space-y-4">
          <BoardComposer inputRef={composerRef} labels={labels} defaultLabel={labelFilter} showToast={showToast}
            onExpand={draft => setCreating({ id: 'new', ...draft })} />

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
                    <div className="group/add relative flex items-center rounded-lg border border-transparent hover:border-white/[0.06] focus-within:border-white/[0.12] focus-within:bg-white/[0.02] transition-colors">
                      <input ref={col.id === 'todo' ? todoInput : undefined}
                        value={draft[col.id]} onChange={e => setDraft(d => ({ ...d, [col.id]: e.target.value }))}
                        placeholder="+ Quick add"
                        className="flex-1 min-w-0 h-8 px-2.5 bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 outline-none" />
                    </div>
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

      {creating && <ItemModal key="new" isNew item={creating} labels={labels} showToast={showToast} onClose={() => setCreating(null)} />}
      {editing && <ItemModal key={editing.id} item={editing} labels={labels} showToast={showToast} onClose={() => setEditingId(null)}
        time={times.get(editing.id)} now={now} />}
    </div>
  );
}
