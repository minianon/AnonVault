import { useEffect, useRef, useState } from 'react';
import { Quote, Pencil, Trash2, Search } from 'lucide-react';
import { quotes, addQuote } from '../services/quotes';
import { PageHeader, Card, Empty, Modal, Field, inputCls } from './ui';

function EditModal({ item, onClose }) {
  const [text, setText] = useState(item.text);
  const [author, setAuthor] = useState(item.author === 'Unknown' ? '' : item.author || '');
  const save = e => {
    e?.preventDefault();
    if (!text.trim()) return;
    quotes.update(item.id, { text: text.trim(), author: author.trim() || 'Unknown' });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Edit quote" width={480}
      footer={<>
        <button onClick={onClose} className="btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer">Cancel</button>
        <button onClick={save} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">Save</button>
      </>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Quote">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
            className="input-premium w-full px-3 py-2 rounded-lg text-[13.5px] resize-y" />
        </Field>
        <Field label="Author">
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Optional" className={inputCls} />
        </Field>
      </form>
    </Modal>
  );
}

export default function QuotesView({ onLock, onMenuToggle, showToast }) {
  const all = quotes.useAll();
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const textRef = useRef(null);

  useEffect(() => {
    const onNew = () => textRef.current?.focus();
    window.addEventListener('anonvault:new', onNew);
    return () => window.removeEventListener('anonvault:new', onNew);
  }, []);

  const add = e => {
    e?.preventDefault();
    if (addQuote({ text, author })) { setText(''); setAuthor(''); textRef.current?.focus(); }
  };
  const remove = q => {
    quotes.remove(q.id);
    showToast?.('warning', 'Quote deleted', q.text.slice(0, 40), 6000, { label: 'Undo', onClick: () => quotes.restore(q) });
  };

  const list = all.filter(q => !query.trim() || (q.text + ' ' + (q.author || '')).toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Quotes" subtitle={`${all.length} saved · shown in turn on Today`} onMenuToggle={onMenuToggle} onLock={onLock} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[860px] mx-auto px-4 lg:px-6 py-6 space-y-5">
          <Card className="p-3">
            <form onSubmit={add} className="space-y-2">
              <textarea ref={textRef} value={text} onChange={e => setText(e.target.value)} rows={2}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(e); }}
                placeholder="Type or paste a quote…"
                className="w-full bg-transparent px-2 py-1.5 text-[14px] text-slate-100 placeholder:text-slate-500 outline-none resize-none leading-relaxed" />
              <div className="flex items-center gap-2 border-t border-white/[0.05] pt-2">
                <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author (optional)"
                  className="flex-1 min-w-0 h-8 px-2 bg-transparent text-[13px] text-slate-200 placeholder:text-slate-500 outline-none" />
                <span className="hidden sm:flex items-center gap-1 text-[11.5px] text-slate-600"><span className="kbd">Ctrl</span><span className="kbd">↵</span></span>
                <button type="submit" className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">Save quote</button>
              </div>
            </form>
          </Card>

          {all.length > 4 && (
            <div className="relative max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search quotes"
                className="input-premium w-full h-8 pl-8 pr-3 rounded-lg text-[13px]" />
            </div>
          )}

          {all.length === 0 ? (
            <Empty icon={Quote} title="No quotes yet" body="Save lines that keep you going. Today shows them one after another." />
          ) : (
            <div className="columns-1 sm:columns-2 gap-3 [&>*]:mb-3">
              {list.map(q => (
                <figure key={q.id} className="group panel panel-hover p-4 break-inside-avoid">
                  <blockquote className="text-[14px] leading-relaxed text-slate-200">“{q.text}”</blockquote>
                  <figcaption className="flex items-center justify-between mt-3">
                    <span className="text-[12.5px] text-slate-500">{q.author && q.author !== 'Unknown' ? `— ${q.author}` : ''}</span>
                    <span className="flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditing(q)} className="icon-btn !w-7 !h-7" title="Edit"><Pencil size={12} /></button>
                      <button onClick={() => remove(q)} className="icon-btn !w-7 !h-7 hover:!text-rose-400" title="Delete"><Trash2 size={12} /></button>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
      {editing && <EditModal item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
