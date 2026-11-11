import { useState } from 'react';
import { Trash2, CalendarX2 } from 'lucide-react';
import { Modal, Field, Select, inputCls } from './ui';
import { DateInput, TimeSelect } from './DatePicker';
import { meetings, REPEATS, daysOf, saveMeeting, skipOccurrence } from '../services/meetings';

const DAY_TOGGLES = [[1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [0, 'S']];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const btnGhost = 'btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer';

/** One hour after `t` ('HH:MM'), capped at 23:30. */
function plusHour(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const mins = Math.min(h * 60 + m + 60, 23 * 60 + 30);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * Create or edit a meeting.
 * @param initial    existing meeting, or null for a new one
 * @param date       the day it was opened from (default date for new ones,
 *                   and the occurrence "Skip this one" cancels)
 * @param draft      { title, time } prefilled from a quick-add line
 */
export default function MeetingModal({ initial, date, draft, onClose, showToast }) {
  const [title, setTitle] = useState(initial?.title ?? draft?.title ?? '');
  const [startDate, setStartDate] = useState(initial?.start_date || date);
  const [start, setStart] = useState(initial ? initial.start_time || '' : draft?.time || '10:00');
  const [end, setEnd] = useState(initial ? initial.end_time || '' : plusHour(draft?.time || '10:00'));
  const [recurrence, setRecurrence] = useState(initial?.recurrence || 'none');
  const [days, setDays] = useState(() => (initial ? daysOf(initial) : [new Date((date) + 'T00:00:00').getDay()]));
  const [endsOn, setEndsOn] = useState(initial?.ends_on || '');
  const [link, setLink] = useState(initial?.link || '');
  const [note, setNote] = useState(initial?.note || '');
  const [error, setError] = useState('');

  const repeating = recurrence !== 'none';
  const weekly = recurrence === 'weekly' || recurrence === 'biweekly';

  const changeStart = v => {
    // Keep the meeting's length when the start moves.
    if (v && start && end) {
      const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const len = toMin(end) - toMin(start);
      const e = Math.min(toMin(v) + Math.max(len, 15), 23 * 60 + 59);
      setEnd(`${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`);
    } else if (v && !end) setEnd(plusHour(v));
    setStart(v);
  };

  const changeDate = v => {
    if (!v) return;
    // A weekly meeting moved to a new first day keeps running on that weekday.
    if (weekly && days.length === 1 && days[0] === new Date(startDate + 'T00:00:00').getDay()) {
      setDays([new Date(v + 'T00:00:00').getDay()]);
    }
    setStartDate(v);
  };

  const toggleDay = d => setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));

  const save = e => {
    e?.preventDefault();
    if (!title.trim()) return setError('Give the meeting a name.');
    if (!startDate) return setError('Pick a date.');
    if (start && end && end <= start) return setError('It has to end after it starts.');
    if (weekly && !days.length) return setError('Pick at least one day.');
    if (repeating && endsOn && endsOn < startDate) return setError('The end date is before the first meeting.');
    const saved = saveMeeting(initial?.id, {
      title, start_date: startDate, start_time: start, end_time: end,
      recurrence, recurrence_days: days, ends_on: endsOn, link, note,
    });
    if (saved) showToast?.('success', initial ? 'Meeting updated' : 'Meeting added', saved.title);
    onClose();
  };

  const remove = () => {
    meetings.remove(initial.id);
    showToast?.('warning', repeating ? 'Meeting series deleted' : 'Meeting deleted', initial.title, 6000,
      { label: 'Undo', onClick: () => meetings.restore(initial) });
    onClose();
  };

  const skip = () => {
    const undo = skipOccurrence(initial, date);
    showToast?.('warning', 'Skipped this one',
      `${initial.title} · ${new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`,
      6000, { label: 'Undo', onClick: undo });
    onClose();
  };

  const footer = (
    <>
      {initial && (
        <div className="mr-auto flex items-center gap-1">
          {initial.recurrence && initial.recurrence !== 'none' && date && (
            <button type="button" onClick={skip} className={`${btnGhost} inline-flex items-center gap-1.5`} title="Cancel only this date; the rest stay">
              <CalendarX2 size={13} /> <span className="hidden sm:inline">Skip this one</span><span className="sm:hidden">Skip</span>
            </button>
          )}
          <button type="button" onClick={remove} className="icon-btn hover:!text-rose-400" title={repeating ? 'Delete the whole series' : 'Delete'} aria-label="Delete meeting">
            <Trash2 size={14} />
          </button>
        </div>
      )}
      <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
      <button type="button" onClick={save} className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">Save</button>
    </>
  );

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit meeting' : 'New meeting'} width={460} footer={footer}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Meeting">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Standup, Client call, 1:1 with Riya" className={inputCls} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <Field label={repeating ? 'Starts' : 'Date'}>
            <DateInput value={startDate} onChange={changeDate} className="w-full" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From"><TimeSelect size="md" value={start} onChange={changeStart} className="w-full sm:w-[110px]" /></Field>
            <Field label="To">
              {start ? <TimeSelect size="md" value={end} onChange={setEnd} className="w-full sm:w-[110px]" />
                : <div className="h-9 flex items-center text-[12.5px] text-slate-500">All day</div>}
            </Field>
          </div>
        </div>

        <Field label="Repeats">
          <Select value={recurrence} onChange={setRecurrence} options={REPEATS} ariaLabel="Repeats" className="w-full" />
        </Field>

        {weekly && (
          <div>
            <span className="block text-[12px] font-medium text-slate-400 mb-1.5">On</span>
            <div className="flex gap-1.5" role="group" aria-label="Days of the week">
              {DAY_TOGGLES.map(([d, l]) => {
                const on = days.includes(d);
                return (
                  <button key={d} type="button" onClick={() => toggleDay(d)} aria-pressed={on} title={DAY_NAMES[d]}
                    className={`w-9 h-9 rounded-lg text-[12.5px] font-medium border cursor-pointer transition-colors ${
                      on ? 'bg-[var(--accent)]/20 border-[var(--accent)]/50 text-slate-50' : 'border-white/[0.08] text-slate-500 hover:text-slate-200'}`}>
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {repeating && (
          <Field label="Ends" hint="Leave empty if it keeps going.">
            <DateInput value={endsOn} onChange={setEndsOn} placeholder="Never" clearable className="w-full" />
          </Field>
        )}

        <Field label="Link">
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="Meet / Zoom / Teams link" className={inputCls} inputMode="url" />
        </Field>

        <Field label="Notes">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Agenda, who's in it, what to prepare…"
            className="input-premium w-full px-3 py-2 rounded-lg text-[13px] resize-y min-h-[72px]" />
        </Field>

        {error && <p className="text-[12.5px] text-rose-400">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
