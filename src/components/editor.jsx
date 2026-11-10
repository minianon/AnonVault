/* Shared editor kit — the "issue view" layout used for editing anything:
   content on the left (title, description, links, images), a compact
   properties panel on the right. Every section's editor is built from
   these so they look and behave the same. */

import { useRef, useState } from 'react';
import { Calendar, X, Link2, ExternalLink, Plus, Image as ImageIcon, Loader2 } from 'lucide-react';
import { ymdLocal, withProtocol, hostOf } from '../utils/links';

/** Two-pane body: children on the left, `aside` (properties) on the right. */
export function EditorLayout({ children, aside, asideWidth = 280 }) {
  return (
    <div className="grid gap-6 md:[grid-template-columns:1fr_var(--aside)]" style={{ '--aside': asideWidth + 'px' }}>
      <div className="min-w-0 space-y-4">{children}</div>
      <aside className="min-w-0 border-t border-white/[0.06] pt-4 md:border-t-0 md:pt-0 md:border-l md:pl-5 space-y-1">{aside}</aside>
    </div>
  );
}

/** One property in the side panel: small icon + label, control on the right. */
export function PropRow({ icon: Icon, label, children, top = false }) {
  return (
    <div className={`flex gap-3 min-h-[36px] ${top ? 'items-start pt-1.5' : 'items-center'}`}>
      <span className={`w-[76px] shrink-0 inline-flex items-center gap-1.5 text-[12px] text-slate-500 ${top ? 'pt-1' : ''}`}>
        {Icon && <Icon size={13} className="text-slate-600" />}{label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/** Big borderless title that grows with its text. */
export function TitleInput({ value, onChange, placeholder = 'Title', autoFocus }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} aria-label="Title" placeholder={placeholder} rows={1} autoFocus={autoFocus}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) e.preventDefault(); }}
      className="w-full bg-transparent text-[20px] font-semibold leading-snug tracking-[-0.015em] text-slate-50 outline-none placeholder:text-slate-600 resize-none [field-sizing:content]" />
  );
}

/** Borderless description that grows with its text. */
export function DescriptionInput({ value, onChange, placeholder = 'Add a description…', minH = 96, ariaLabel = 'Description' }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} aria-label={ariaLabel} placeholder={placeholder}
      className="w-full bg-transparent text-[14px] leading-relaxed text-slate-300 placeholder:text-slate-600 outline-none resize-none [field-sizing:content] rounded-lg -mx-2 px-2 py-1.5 hover:bg-white/[0.02] focus:bg-white/[0.025] transition-colors"
      style={{ minHeight: minH }} />
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <h4 className="text-[12px] font-medium text-slate-500">{children}</h4>
      {right && <span className="text-[11.5px] text-slate-600">{right}</span>}
    </div>
  );
}

/** Due/deadline as quick choices instead of a bare dd-mm-yyyy box.
    `compact` renders just a chip (for toolbars and composers). */
export function DueField({ date, time = '', onDate, onTime, withTime = true, compact = false, placeholder = 'Due date' }) {
  const pickRef = useRef(null);
  const [menu, setMenu] = useState(false);
  const now = new Date();
  const today = ymdLocal(now);
  const quick = [
    { label: 'Today', d: now },
    { label: 'Tomorrow', d: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) },
    { label: 'Next week', d: new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((8 - now.getDay()) % 7 || 7)) },
  ];
  const openPicker = () => {
    const el = pickRef.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };
  const tone = !date ? null : date < today ? 'bad' : date === today ? 'warn' : null;
  const hiddenPicker = (
    <input ref={pickRef} type="date" value={date || ''} onChange={e => { if (e.target.value) { onDate(e.target.value); setMenu(false); } }}
      className="absolute left-0 bottom-0 w-px h-px opacity-0 pointer-events-none" tabIndex={-1} aria-hidden="true" />
  );
  const chipCls = `h-7 px-2 rounded-md text-[12.5px] border inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
    tone === 'bad' ? 'text-rose-300 border-rose-400/30 bg-rose-400/[0.06]'
      : tone === 'warn' ? 'text-amber-300 border-amber-400/30 bg-amber-400/[0.06]'
      : date ? 'text-slate-200 border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08]'
      : 'text-slate-400 border-white/[0.08] hover:text-slate-100 hover:bg-white/[0.05]'}`;
  const label = date ? new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : placeholder;

  if (compact) {
    return (
      <span className="relative inline-flex items-center gap-1">
        <button type="button" onClick={() => setMenu(m => !m)} className={chipCls} aria-haspopup="menu" aria-expanded={menu}>
          <Calendar size={12} />{label}{date && time ? ` · ${time}` : ''}
        </button>
        {date && <button type="button" onClick={() => { onDate(''); onTime?.(''); }} className="icon-btn !w-6 !h-6" title="Clear date"><X size={11} /></button>}
        {menu && (
          <span className="absolute left-0 top-full mt-1 z-[60] w-[220px] p-1.5 rounded-lg border border-white/[0.1] fade-up"
            style={{ background: 'var(--surface-2)', boxShadow: 'var(--shadow-lg)' }}
            onMouseDown={e => e.preventDefault()}>
            {quick.map(q => (
              <button key={q.label} type="button" onClick={() => { onDate(ymdLocal(q.d)); setMenu(false); }}
                className="w-full flex items-center justify-between h-8 px-2 rounded-md text-[13px] text-slate-200 hover:bg-white/[0.07] cursor-pointer">
                {q.label}<span className="text-[11.5px] text-slate-500">{q.d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span>
              </button>
            ))}
            <button type="button" onClick={openPicker}
              className="w-full flex items-center gap-2 h-8 px-2 rounded-md text-[13px] text-slate-300 hover:bg-white/[0.07] cursor-pointer">
              <Calendar size={12} className="text-slate-500" /> Pick a date…
            </button>
            {withTime && date && (
              <span className="flex items-center gap-2 px-2 pt-1.5 mt-1 border-t border-white/[0.06]">
                <span className="text-[12px] text-slate-500">Time</span>
                <input type="time" value={time} onChange={e => onTime?.(e.target.value)} className="input-premium h-7 px-2 rounded-md text-[12px] flex-1" />
              </span>
            )}
          </span>
        )}
        {hiddenPicker}
      </span>
    );
  }

  if (!date) {
    return (
      <div className="relative flex flex-wrap gap-1">
        {quick.map(q => (
          <button key={q.label} type="button" onClick={() => onDate(ymdLocal(q.d))}
            className="h-7 px-2 rounded-md text-[12px] text-slate-300 bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] hover:text-slate-100 cursor-pointer transition-colors">
            {q.label}
          </button>
        ))}
        <button type="button" onClick={openPicker}
          className="h-7 px-2 rounded-md text-[12px] text-slate-400 border border-dashed border-white/[0.12] hover:text-slate-100 hover:border-white/[0.25] cursor-pointer inline-flex items-center gap-1 transition-colors">
          <Calendar size={11} /> Pick…
        </button>
        {hiddenPicker}
      </div>
    );
  }
  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={openPicker} className={chipCls}><Calendar size={12} />{label}</button>
      {withTime && (
        <input type="time" value={time} onChange={e => onTime?.(e.target.value)} aria-label="Time"
          className="input-premium h-7 px-2 rounded-md text-[12px] w-[92px]" />
      )}
      <button type="button" onClick={() => { onDate(''); onTime?.(''); }} className="icon-btn !w-7 !h-7" title="Clear date"><X size={12} /></button>
      {hiddenPicker}
    </div>
  );
}

/** Links: rows with open/remove, plus a "paste and press Enter" row.
    links: [{ url, label }] */
export function LinksEditor({ links, onChange }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const u = draft.trim();
    if (!u) return;
    onChange([...links, { url: withProtocol(u), label: '' }]);
    setDraft('');
  };
  return (
    <section>
      <SectionTitle>Links</SectionTitle>
      <div className="space-y-1">
        {links.map((l, i) => (
          <div key={i} className="group/link flex items-center gap-2 h-9 px-2.5 -mx-2.5 rounded-lg hover:bg-white/[0.03] transition-colors">
            <span className="w-6 h-6 rounded-md bg-white/[0.05] flex items-center justify-center shrink-0"><Link2 size={12} className="text-slate-400" /></span>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-[13px] text-slate-200 hover:text-white truncate">
              {l.label || hostOf(l.url)}
              {!l.label && <span className="text-slate-500"> {l.url.replace(/^https?:\/\/(www\.)?/, '').slice(hostOf(l.url).length)}</span>}
            </a>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="icon-btn !w-7 !h-7 sm:opacity-0 sm:group-hover/link:opacity-100" title="Open"><ExternalLink size={12} /></a>
            <button type="button" onClick={() => onChange(links.filter((_, j) => j !== i))} className="icon-btn !w-7 !h-7 hover:!text-rose-400 sm:opacity-0 sm:group-hover/link:opacity-100" title="Remove"><X size={12} /></button>
          </div>
        ))}
        <div className="flex items-center gap-2 h-9 px-2.5 -mx-2.5 rounded-lg border border-dashed border-white/[0.08] focus-within:border-white/[0.18] focus-within:border-solid transition-colors">
          <Plus size={13} className="text-slate-500 shrink-0" />
          <input value={draft} onChange={e => setDraft(e.target.value)} onBlur={add}
            onKeyDown={e => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); add(); } }}
            placeholder="Paste a link and press Enter" aria-label="Add link"
            className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-200 placeholder:text-slate-600 outline-none" />
        </div>
      </div>
    </section>
  );
}

/** Images: thumbnails (first = cover), upload button; paste handled by the caller via `useImagePaste`. */
export function ImagesEditor({ images, onChange, uploading = 0, onAddFiles, coverLabel = 'Cover' }) {
  const fileRef = useRef(null);
  const [viewer, setViewer] = useState(null);
  return (
    <section>
      <SectionTitle right="Paste with Ctrl+V">Images</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {images.map((src, i) => (
          <div key={src.slice(0, 64) + i} className="group/img relative w-28 h-20 rounded-lg overflow-hidden border border-white/[0.07] bg-black/30">
            <img src={src} alt="" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setViewer(src)} />
            {i === 0 && coverLabel && <span className="absolute left-1 top-1 text-[10px] px-1.5 rounded bg-black/65 text-slate-200">{coverLabel}</span>}
            <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 w-6 h-6 rounded-md bg-black/65 text-slate-200 hover:text-rose-300 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover/img:opacity-100 transition-opacity cursor-pointer" title="Remove">
              <X size={12} />
            </button>
          </div>
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={'up' + i} className="w-28 h-20 rounded-lg border border-white/[0.07] skeleton flex items-center justify-center">
            <Loader2 size={15} className="animate-spin text-slate-500" />
          </div>
        ))}
        <button type="button" onClick={() => fileRef.current?.click()}
          className={`${images.length || uploading ? 'w-28 h-20 flex-col' : 'h-9 px-3'} rounded-lg border border-dashed border-white/[0.12] hover:border-white/[0.25] hover:bg-white/[0.02] text-slate-500 hover:text-slate-200 flex items-center justify-center gap-1.5 text-[12.5px] cursor-pointer transition-colors`}>
          <ImageIcon size={14} /> Add image
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { onAddFiles(e.target.files); e.target.value = ''; }} />
      </div>
      {viewer && (
        <div className="fixed inset-0 z-[150] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out fade-up" onClick={() => setViewer(null)}>
          <img src={viewer} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}
    </section>
  );
}
