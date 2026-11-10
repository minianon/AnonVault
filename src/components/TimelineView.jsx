import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus, Search, ArrowUpDown, ExternalLink,
  Edit3, Trash2, Calendar, Link as LinkIcon,
  ChevronDown, ChevronRight, ListCollapse,
  Flame, Briefcase, CheckCircle2, ShieldCheck, MapPin, Globe, Star, History,
  ListChecks, Gift
} from 'lucide-react';
import { formatDate, getStatusStyles, sortApplicationsByDeadline, groupApplicationsByMonth } from '../utils/helpers';
import { getHackathonProgress } from '../services/tasks';
import { useShortcutHooks } from '../utils/useShortcutHooks';
import { ymdLocal, hostOf } from '../utils/links';
import { PageHeader, Empty, Progress, Select, Combo, Modal } from './ui';
import { EditorLayout, PropRow, TitleInput, DescriptionInput, DueField, LinksEditor, SectionTitle } from './editor';

/* Quiet status dot per hackathon status (labels come from getStatusStyles). */
const STATUS_DOT = {
  pending: 'bg-slate-500',
  applied: 'bg-accent-400',
  interviewing: 'bg-amber-400',
  offered: 'bg-emerald-400',
  rejected: 'bg-slate-600',
};

/* Same statuses for the form's Select, with matching dot colours. */
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: '#6c6c75' },
  { value: 'applied', label: 'Registered', color: '#4f7bff' },
  { value: 'interviewing', label: 'Building', color: '#f0b445' },
  { value: 'offered', label: 'Winner', color: '#4fd1a0' },
  { value: 'rejected', label: 'Completed', color: '#4a4a52' },
];

/* priority is stored as 'high' (starred) or 'medium'. */
const PRIORITY_OPTIONS = [
  { value: 'medium', label: 'Normal', color: '#6c6c75' },
  { value: 'high', label: 'Starred', color: '#f0b445' },
];

/* Whole days from today to a local YYYY-MM-DD (negative = past). */
function daysUntil(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

function daysLeftText(days) {
  if (days == null) return '';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `${days} days left`;
  return `${Math.abs(days)} day${days === -1 ? '' : 's'} ago`;
}

/* Small neutral badge used for status / perks. */
const BADGE = 'inline-flex items-center gap-1 text-[11.5px] px-1.5 h-5 rounded-md bg-white/[0.04] border border-white/[0.06] text-slate-400 whitespace-nowrap';

/* ─── Custom Dropdown ─────────────────────────── */
function CustomDropdown({ value, onChange, options, icon, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeOption = options.find(o => o.value === value) || { label: placeholder || value };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="select-premium h-8 pl-8 pr-2.5 text-[12.5px] rounded-lg cursor-pointer flex items-center gap-1.5 min-w-[132px] justify-between relative group/btn"
      >
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none flex">
          {icon}
        </span>
        <span className="truncate">{activeOption.label}</span>
        <ChevronDown
          size={13}
          className={`text-slate-500 shrink-0 transition-transform duration-200 group-hover/btn:text-slate-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-full whitespace-nowrap bg-[var(--surface-2)] border border-white/[0.1] rounded-lg shadow-[var(--shadow-lg)] p-1 z-50 fade-up">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left h-8 px-2.5 rounded-md text-[13px] transition-colors flex items-center justify-between gap-3 hover:bg-white/[0.05] cursor-pointer ${
                value === opt.value
                  ? 'text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{opt.label}</span>
              {value === opt.value && <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TimelineView({ 
  applications, 
  onAdd, 
  onUpdate, 
  onDelete, 
  loading,
  theme,
  onLock,
  showToast,
  onMenuToggle,
  initialSelectedAppId,
  onClearInitialSelectedApp,
  tasksVersion,
  setActiveTab,
  onCreateChecklist
}) {
  // Taken once per mount: a header count doesn't need to tick past midnight live.
  const [mountedAt] = useState(() => Date.now());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [groupByMonthMode, setGroupByMonthMode] = useState(true);
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [formName, setFormName] = useState('');
  const [formLink, setFormLink] = useState('');
  // Deadline as a local YYYY-MM-DD for DueField; saved as before (noon ISO).
  const [formDate, setFormDate] = useState('');
  const [formLinks, setFormLinks] = useState([]);
  const [formStarred, setFormStarred] = useState(false);
  const [formStatus, setFormStatus] = useState('pending');
  const [formNotes, setFormNotes] = useState('');
  const [formRetro, setFormRetro] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formPpi, setFormPpi] = useState(false);
  const [formTravel, setFormTravel] = useState(false);
  const [formOnsite, setFormOnsite] = useState(false);
  const [formRemote, setFormRemote] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [selectedAppDetails, setSelectedAppDetails] = useState(null);
  const [expandedMonths, setExpandedMonths] = useState({});
  const [showPast, setShowPast] = useState(false);

  // Read from the local task cache, recomputed whenever tasks change anywhere.
  const hackathonProgress = useMemo(
    () => getHackathonProgress(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasksVersion]
  );

  useEffect(() => {
    if (initialSelectedAppId && applications) {
      const found = applications.find(a => String(a.id) === String(initialSelectedAppId));
      if (found) {
        setSelectedAppDetails(found);
        onClearInitialSelectedApp?.();
      }
    }
  }, [initialSelectedAppId, applications, onClearInitialSelectedApp]);

  const resetForm = () => {
    setFormName(''); setFormLink('');
    setFormLinks([]);
    // New events default to tomorrow, as the old "1 day" stepper did.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setFormDate(ymdLocal(tomorrow));
    setFormStarred(false); setFormStatus('pending');
    setFormNotes(''); setFormRetro(''); 
    setFormCompany('');
    setFormPpi(false);
    setFormTravel(false);
    setFormOnsite(false);
    setFormRemote(false);
    setEditingApp(null);
  };

  const handleOpenAdd = () => { resetForm(); setIsFormOpen(true); };

  const rootRef = useRef(null);
  const searchRef = useRef(null);
  useShortcutHooks({ onNew: handleOpenAdd, searchRef, rootRef });

  const handleOpenEdit = (app) => {
    setEditingApp(app);
    setFormName(app.name); setFormLink(app.link || '');
    setFormLinks(app.links || []);
    if (app.deadline && !isNaN(new Date(app.deadline))) {
      setFormDate(ymdLocal(new Date(app.deadline)));
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setFormDate(ymdLocal(tomorrow));
    }
    setFormStarred(app.priority === 'high');
    setFormStatus(app.status || 'pending');
    setFormNotes(app.notes || ''); setFormRetro(app.retro || '');
    setFormCompany(app.company || '');
    setFormPpi(!!app.ppi);
    setFormTravel(!!app.travel);
    setFormOnsite(!!app.onsite);
    setFormRemote(!!app.remote);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast?.('error', 'Name Required', 'Please enter the hackathon or event name.');
      return;
    }
    if (!formDate) {
      showToast?.('error', 'Deadline Required', 'Pick a deadline for this hackathon.');
      return;
    }
    // Same rule as the old "days left" stepper (no negative days), except an
    // event that has already passed can still be edited without its date
    // being forced forward to today.
    const unchangedDate = editingApp?.deadline && !isNaN(new Date(editingApp.deadline))
      && ymdLocal(new Date(editingApp.deadline)) === formDate;
    if (daysUntil(formDate) < 0 && !unchangedDate) {
      showToast?.('error', 'Invalid Date', 'Please pick today or a later date.');
      return;
    }

    const [dy, dm, dd] = formDate.split('-').map(Number);
    const calculatedDeadline = new Date(dy, dm - 1, dd);
    calculatedDeadline.setHours(12, 0, 0, 0); // Standardize to noon for even tracking

    const appPayload = {
      name: formName.trim(), link: formLink.trim(),
      links: formLinks.filter(l => l.url.trim()),
      deadline: calculatedDeadline.toISOString(),
      priority: formStarred ? 'high' : 'medium',
      status: formStatus, notes: formNotes.trim(),
      // Only sent once the event has actually resolved, so an unmigrated
      // database is untouched until there is something to record.
      ...(formRetro.trim() ? { retro: formRetro.trim() } : {}),
      company: formCompany.trim(),
      ppi: formPpi,
      travel: formTravel,
      onsite: formOnsite,
      remote: formRemote
    };
    if (editingApp) await onUpdate(editingApp.id, appPayload);
    else await onAdd(appPayload);
    setIsFormOpen(false); resetForm();
  };

  // Ctrl/Cmd+Enter saves. requestSubmit keeps native checks (URL field).
  const formRef = useRef(null);
  const onFormKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const handleDeleteClick = (id) => setDeleteConfirmId(id);
  const handleConfirmDelete = async () => {
    if (deleteConfirmId) { await onDelete(deleteConfirmId); setDeleteConfirmId(null); }
  };
  // Delete from inside the edit dialog: close it and hand over to the confirm.
  const handleDeleteFromForm = () => {
    if (!editingApp) return;
    const id = editingApp.id;
    setIsFormOpen(false);
    setDeleteConfirmId(id);
  };

  // Stable close handlers: Modal re-runs its focus effect whenever onClose
  // changes, so inline arrows would steal focus on every keystroke.
  const closeForm = useCallback(() => setIsFormOpen(false), []);
  const closeDelete = useCallback(() => setDeleteConfirmId(null), []);
  const closeDetails = useCallback(() => setSelectedAppDetails(null), []);

  const deleteTarget = deleteConfirmId
    ? (applications || []).find(a => a && a.id === deleteConfirmId)
    : null;

  const companySuggestions = useMemo(
    () => [...new Set((applications || []).map(a => (a?.company || '').trim()).filter(Boolean))],
    [applications]
  );

  const formDaysLeft = daysUntil(formDate);

  const toggleMonth = (month) =>
    setExpandedMonths(prev => ({ ...prev, [month]: prev[month] === false ? true : false }));

  const filteredApps = (applications || []).filter(app => {
    if (!app) return false;
    const matchesSearch = (app.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (app.notes && app.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch &&
      (selectedPriority === 'all' || app.priority === selectedPriority) &&
      (selectedStatus === 'all' || app.status === selectedStatus);
  });

  const starredApps = filteredApps.filter(app => app.priority === 'high' && !(app.deadline && new Date(app.deadline) < new Date()));
  const mainApps = selectedPriority === 'all' 
    ? filteredApps.filter(app => app.priority !== 'high' || (app.deadline && new Date(app.deadline) < new Date()))
    : filteredApps;

  // Expired events used to sit at the top of a single deadline-ascending list,
  // pushing everything still upcoming below the fold. Split them out: the
  // timeline shows upcoming by default, and the Past toggle swaps it over.
  const isExpired = app => !!(app.deadline && new Date(app.deadline) < new Date());
  const upcomingApps = mainApps.filter(app => !isExpired(app));
  const pastApps     = mainApps.filter(isExpired);

  const timelineApps = showPast ? pastApps : upcomingApps;

  // "Soonest" means nearest to now, which for past events is the most recently
  // passed — so the order flips when viewing them.
  const timelineOrder = showPast
    ? (sortOrder === 'asc' ? 'desc' : 'asc')
    : sortOrder;

  const sortedApps = sortApplicationsByDeadline(timelineApps, timelineOrder);
  const groupedApps = groupApplicationsByMonth(sortedApps);
  // groupApplicationsByMonth always orders months oldest-first; reverse for the
  // past view so the most recent month leads.
  const monthKeys = showPast
    ? Object.keys(groupedApps).reverse()
    : Object.keys(groupedApps);

  const nearestAppId = (() => {
    const active = (applications || []).filter(a => a?.deadline && new Date(a.deadline) > new Date() && a.status !== 'rejected');
    if (!active.length) return null;
    return [...active].sort((a,b) => new Date(a.deadline)-new Date(b.deadline))[0].id;
  })();

  const TimelineNodeDot = ({ app }) => {
    const isStarred = app.priority === 'high';
    return (
      <span className={`absolute -left-[24px] top-[19px] w-[7px] h-[7px] rounded-full z-10 ${
        isStarred
          ? 'bg-amber-400'
          : 'bg-[var(--bg)] border border-slate-600'
      }`} />
    );
  };

  const openChecklist = () => setActiveTab && setActiveTab('tasks');
  const ctaCls = 'btn-primary h-8 px-3 rounded-lg text-[13px] inline-flex items-center gap-1.5 cursor-pointer';
  const toolBtn = 'h-8 px-2.5 rounded-lg text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap';
  const toggleOn = 'bg-white/[0.06] border border-white/[0.14] text-slate-100 transition-colors';
  const btnGhost = 'btn-ghost h-8 px-3 rounded-lg text-[13px] cursor-pointer';

  return (
    <div ref={rootRef} className="flex-1 h-full flex flex-col overflow-hidden relative bg-[var(--bg)]">
      <PageHeader
        title="Hackathons"
        stats={(() => {
          const now = mountedAt;
          const list = (applications || []).filter(Boolean);
          const upcoming = list.filter(x => x.deadline && new Date(x.deadline).getTime() >= now);
          const week = upcoming.filter(x => new Date(x.deadline).getTime() - now <= 7 * 86400000);
          return [
            { value: upcoming.length, label: 'upcoming', always: true },
            { value: week.length, label: 'this week', tone: 'warn' },
            { value: list.filter(x => x.status === 'offered').length, label: 'won', tone: 'good' },
          ];
        })()}
        onMenuToggle={onMenuToggle}
        onLock={onLock}
        actions={
          <button onClick={handleOpenAdd} className={ctaCls}>
            <Plus size={14} />
            <span className="hidden sm:inline">New hackathon</span>
            <span className="sm:hidden">New</span>
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-6 space-y-6 reveal-stagger">

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <div className="relative flex-1 min-w-0 sm:max-w-[280px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                ref={searchRef}
                placeholder="Search hackathons…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="input-premium w-full h-8 pl-8 pr-3 text-[13px] rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedPriority(p => p === 'high' ? 'all' : 'high')}
                className={`${toolBtn} ${selectedPriority === 'high' ? toggleOn : 'btn-ghost'}`}
                title="Filter by featured events"
                aria-pressed={selectedPriority === 'high'}
              >
                <Star size={13} className={selectedPriority === 'high' ? 'fill-amber-400 text-amber-400' : 'text-slate-500'} />
                <span>Starred</span>
              </button>

              <CustomDropdown
                value={selectedStatus}
                onChange={setSelectedStatus}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'applied', label: 'Registered' },
                  { value: 'interviewing', label: 'Building' },
                  { value: 'offered', label: 'Winner' },
                  { value: 'rejected', label: 'Completed' }
                ]}
                icon={<CheckCircle2 size={13} className="text-slate-500" />}
                placeholder="All statuses"
              />

              <button
                onClick={() => setSortOrder(p => p === 'asc' ? 'desc' : 'asc')}
                className={`btn-ghost ${toolBtn}`}
              >
                <ArrowUpDown size={13} />
                {sortOrder === 'asc' ? 'Soonest' : 'Furthest'}
              </button>

              <button
                onClick={() => setGroupByMonthMode(p => !p)}
                className={`btn-ghost ${toolBtn}`}
              >
                <ListCollapse size={13} />
                {groupByMonthMode ? 'By month' : 'Linear'}
              </button>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="h-48 flex items-center justify-center gap-2.5 text-slate-500 text-[13px]">
              <span className="w-3.5 h-3.5 border-2 border-white/15 border-t-slate-300 rounded-full animate-spin" />
              Loading…
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="panel">
              <Empty
                icon={Calendar}
                title="No hackathons found"
                body={searchTerm || selectedPriority !== 'all' || selectedStatus !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Start tracking your first hackathon.'}
                action={!searchTerm && selectedPriority === 'all' && selectedStatus === 'all' && (
                  <button onClick={handleOpenAdd} className={ctaCls}>
                    <Plus size={14} /> New hackathon
                  </button>
                )}
              />
            </div>
          ) : (
            <div>
              {/* Starred / Pinned Section */}
              {starredApps.length > 0 && selectedPriority !== 'high' && !showPast && (
                <section className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Star size={13} className="fill-amber-400 text-amber-400" />
                    <h3 className="text-[13px] font-medium text-slate-200">Pinned</h3>
                    <span className="text-[12px] text-slate-500 tabular-nums">{starredApps.length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {starredApps.map(app => (
                      <HackathonCard
                        key={app.id}
                        app={app}
                        isNearest={app.id === nearestAppId}
                        onEdit={handleOpenEdit}
                        onDelete={handleDeleteClick}
                        onViewDetails={setSelectedAppDetails}
                        onUpdate={onUpdate}
                        progress={hackathonProgress[app.id]}
                        onOpenChecklist={openChecklist}
                        onCreateChecklist={onCreateChecklist}
                      />
                    ))}
                  </div>
                  {mainApps.length > 0 && <div className="h-px bg-white/[0.06] mt-6" />}
                </section>
              )}

              {mainApps.length > 0 && (
                <section>
                  {/* Timeline header + past/upcoming switch */}
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      {showPast
                        ? <History size={14} className="text-slate-500" />
                        : <Calendar size={14} className="text-slate-500" />}
                      <h3 className="text-[13px] font-medium text-slate-200">
                        {showPast ? 'Past hackathons' : 'Upcoming'}
                      </h3>
                      <span className="text-[12px] text-slate-500 tabular-nums">
                        {timelineApps.length}
                      </span>
                    </div>

                    {pastApps.length > 0 && (
                      <button
                        onClick={() => setShowPast(p => !p)}
                        title={showPast
                          ? 'Back to upcoming hackathons'
                          : 'Show hackathons whose deadline has already passed'}
                        aria-pressed={showPast}
                        className={`${toolBtn} ${showPast ? toggleOn : 'btn-ghost'}`}
                      >
                        <History size={13} />
                        <span>Past</span>
                        <span className="text-slate-500 tabular-nums">{pastApps.length}</span>
                      </button>
                    )}
                  </div>

                  {timelineApps.length === 0 ? (
                    <div className="panel">
                      <Empty
                        icon={Calendar}
                        title="No upcoming hackathons"
                        body={pastApps.length > 0
                          ? `Every tracked event has passed. Open Past (${pastApps.length}) to look back.`
                          : 'Add an event to start building your timeline.'}
                      />
                    </div>
                  ) : groupByMonthMode ? (
                    <div className="relative pl-5 ml-1 timeline-track">
                      <div className="space-y-6">
                        {monthKeys.map(monthYear => {
                          const isExpanded = expandedMonths[monthYear] !== false;
                          const monthApps = groupedApps[monthYear];
                          return (
                            <div key={monthYear} className="relative">
                              {/* Month marker */}
                              <span className="absolute -left-[25px] top-[7.5px] w-[9px] h-[9px] rounded-full bg-[var(--bg)] border border-slate-400" />
                              <button
                                onClick={() => toggleMonth(monthYear)}
                                className="flex items-center gap-1.5 h-6 text-[12px] font-medium text-slate-400 hover:text-slate-200 transition-colors mb-2 cursor-pointer"
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? <ChevronDown size={13} className="text-slate-600" /> : <ChevronRight size={13} className="text-slate-600" />}
                                {monthYear}
                                <span className="text-slate-600 tabular-nums font-normal">{monthApps.length}</span>
                              </button>
                              {isExpanded && (
                                <div className="space-y-2">
                                  {monthApps.map(app => (
                                    <div key={app.id} className="relative">
                                      <TimelineNodeDot app={app} />
                                      <HackathonCard app={app} isNearest={app.id===nearestAppId} onEdit={handleOpenEdit} onDelete={handleDeleteClick} onViewDetails={setSelectedAppDetails} onUpdate={onUpdate} progress={hackathonProgress[app.id]} onOpenChecklist={openChecklist} onCreateChecklist={onCreateChecklist} />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="relative pl-5 ml-1 space-y-2 timeline-track">
                      {sortedApps.map(app => (
                        <div key={app.id} className="relative">
                          <TimelineNodeDot app={app} />
                          <HackathonCard app={app} isNearest={app.id===nearestAppId} onEdit={handleOpenEdit} onDelete={handleDeleteClick} onViewDetails={setSelectedAppDetails} onUpdate={onUpdate} progress={hackathonProgress[app.id]} onOpenChecklist={openChecklist} onCreateChecklist={onCreateChecklist} />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── ADD / EDIT MODAL ──
          Issue-view layout from the shared editor kit: content on the left,
          properties on the right (stacked, content first, on phones). */}
      <Modal
        open={isFormOpen}
        onClose={closeForm}
        title={editingApp ? 'Edit hackathon' : 'New hackathon'}
        width={780}
        footer={<>
          {editingApp && (
            <button type="button" onClick={handleDeleteFromForm}
              className="btn-danger h-8 px-3 rounded-lg text-[13px] cursor-pointer mr-auto inline-flex items-center gap-1.5">
              <Trash2 size={13} /><span className="hidden sm:inline">Delete</span>
            </button>
          )}
          <span className="hidden sm:flex items-center gap-1 text-[11.5px] text-slate-600 mr-1"><span className="kbd">Ctrl</span><span className="kbd">↵</span> save</span>
          <button type="button" onClick={closeForm} className={btnGhost}>Cancel</button>
          <button type="submit" form="hackathon-form"
            className="btn-primary h-8 px-4 rounded-lg text-[13px] cursor-pointer">
            {editingApp ? 'Save' : 'Add hackathon'}
          </button>
        </>}
      >
        <form id="hackathon-form" ref={formRef} onSubmit={handleSubmit} onKeyDown={onFormKeyDown}>
          <EditorLayout aside={<>
            <PropRow icon={Briefcase} label="Organiser">
              <Combo value={formCompany} onChange={setFormCompany} placeholder="e.g. Google, MLH"
                suggestions={companySuggestions} inputClassName="h-8" ariaLabel="Organiser" />
            </PropRow>
            <PropRow icon={Calendar} label="Deadline" top>
              <DueField date={formDate} onDate={setFormDate} withTime={false} placeholder="Deadline" />
              {formDate && (
                <p className={`text-[11.5px] mt-1 ${
                  formDaysLeft < 0 ? 'text-rose-400' : formDaysLeft <= 2 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {daysLeftText(formDaysLeft)}
                </p>
              )}
            </PropRow>
            <PropRow icon={CheckCircle2} label="Status">
              <Select className="w-full" size="sm" value={formStatus} onChange={setFormStatus} ariaLabel="Status"
                options={STATUS_OPTIONS} />
            </PropRow>
            <PropRow icon={Star} label="Priority">
              <Select className="w-full" size="sm" value={formStarred ? 'high' : 'medium'}
                onChange={v => setFormStarred(v === 'high')} ariaLabel="Priority"
                options={PRIORITY_OPTIONS} />
            </PropRow>
            <PropRow icon={Gift} label="Perks" top>
              <div role="group" aria-label="Perks" className="flex flex-wrap gap-1">
                <PerkChip on={formPpi} onClick={() => setFormPpi(p => !p)}
                  icon={ShieldCheck} tone="text-emerald-400" label="PPI" title="Offers a pre-placement interview" />
                <PerkChip on={formTravel} onClick={() => setFormTravel(t => !t)}
                  icon={Flame} tone="text-amber-400" label="Travel covered" title="Travel is reimbursed" />
                <PerkChip on={formOnsite} onClick={() => setFormOnsite(o => !o)}
                  icon={MapPin} tone="text-accent-400" label="Onsite" title="In-person event" />
                <PerkChip on={formRemote} onClick={() => setFormRemote(r => !r)}
                  icon={Globe} tone="text-slate-200" label="Remote" title="Join from anywhere" />
              </div>
            </PropRow>
          </>}>
            <TitleInput value={formName} onChange={setFormName} placeholder="Event name, e.g. HackMIT 2025" />
            <DescriptionInput value={formNotes} onChange={setFormNotes} ariaLabel="Notes"
              placeholder="Notes — project ideas, team, requirements…" />

            <section>
              <SectionTitle>Event link</SectionTitle>
              <div className="relative">
                <LinkIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input type="url" placeholder="https://…" value={formLink} aria-label="Event link"
                  onChange={e => setFormLink(e.target.value)}
                  className="input-premium w-full h-9 pl-8 pr-3 rounded-lg text-[13px]" />
              </div>
            </section>

            <LinksEditor links={formLinks} onChange={setFormLinks} />

            {/* Retro, only once the event has resolved. The funnel counted
                outcomes but recorded nothing about them. */}
            {(formStatus === 'offered' || formStatus === 'rejected') && (
              <section role="group" aria-label="Retrospective">
                <SectionTitle>Retrospective</SectionTitle>
                <DescriptionInput value={formRetro} onChange={setFormRetro} minH={72} ariaLabel="Retrospective"
                  placeholder="What worked, what did not, what to do differently…" />
              </section>
            )}
          </EditorLayout>

          <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
        </form>
      </Modal>

      {/* ── DELETE CONFIRM ── */}
      <Modal
        open={!!deleteConfirmId}
        onClose={closeDelete}
        title="Delete hackathon"
        width={400}
        footer={<>
          <button type="button" onClick={closeDelete} className={btnGhost}>Keep it</button>
          <button type="button" onClick={handleConfirmDelete}
            className="btn-danger h-8 px-3 rounded-lg text-[13px] cursor-pointer inline-flex items-center gap-1.5">
            <Trash2 size={13} /> Delete
          </button>
        </>}
      >
        <p className="text-[13px] text-slate-400 leading-relaxed">
          {deleteTarget?.name
            ? <>Delete <span className="text-slate-100 font-medium break-words">{deleteTarget.name}</span>? </>
            : 'Delete this hackathon? '}
          This action cannot be undone.
        </p>
      </Modal>

      {/* ── DETAILS MODAL ── */}
      {selectedAppDetails && (
        <AppDetailModal
          app={selectedAppDetails}
          onClose={closeDetails}
          onEdit={handleOpenEdit}
          nearestAppId={nearestAppId}
        />
      )}
    </div>
  );
}

/* ── Utility sub-components ── */
function PerkChip({ on, onClick, icon: Icon, tone, label, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`h-8 sm:h-7 px-2 rounded-md border text-[12.5px] sm:text-[12px] inline-flex items-center gap-1.5 transition-colors cursor-pointer select-none whitespace-nowrap ${
        on
          ? 'bg-white/[0.09] border-white/[0.16] text-slate-100'
          : 'border-white/[0.06] text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
      }`}
    >
      <Icon size={12} className={`shrink-0 ${on ? tone : 'text-slate-500'}`} />
      {label}
    </button>
  );
}

/* ── HACKATHON CARD ── */
function HackathonCard({ app, isNearest, onEdit, onDelete, onViewDetails, onUpdate, progress, onOpenChecklist, onCreateChecklist }) {
  const status = getStatusStyles(app.status);

  const getTimeRemaining = (deadlineStr) => {
    const targetDate = new Date(deadlineStr);
    targetDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = targetDate - today;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { short: `${Math.abs(diffDays)}d ago`, text: `Expired ${Math.abs(diffDays)}d ago`, days: diffDays, isExpired: true };
    if (diffDays === 0) return { short: 'Today', text: 'Due today', days: 0, isExpired: false };
    if (diffDays === 1) return { short: '1d', text: 'Due tomorrow', days: 1, isExpired: false };
    return { short: `${diffDays}d`, text: `${diffDays}d left`, days: diffDays, isExpired: false };
  };

  const remaining = getTimeRemaining(app.deadline);
  const daysTone = remaining.isExpired ? 'text-slate-600'
    : remaining.days <= 2 ? 'text-rose-400'
    : remaining.days <= 7 ? 'text-amber-400'
    : 'text-slate-400';

  const isStarred = app.priority === 'high';
  const allDone = progress && progress.total > 0 && progress.done === progress.total;

  return (
    <article
      onClick={() => onViewDetails && onViewDetails(app)}
      className="panel panel-hover group cursor-pointer select-none px-3.5 py-3 min-w-0"
    >
      <div className="flex items-start gap-3">
        {/* Days left */}
        <div className={`w-12 shrink-0 pt-px text-[12px] font-medium tabular-nums ${daysTone}`} title={remaining.text}>
          {remaining.short}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                {isNearest && <span className="beacon-amber" title="Soonest deadline" />}
                <h4 className="text-[13.5px] font-medium text-slate-100 leading-5 truncate">{app.name}</h4>
                {isStarred && <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" aria-label="Starred" />}
              </div>
              <p className="text-[12px] text-slate-500 leading-5 truncate">
                {formatDate(app.deadline)}
                {app.company && <> · <Briefcase size={10} className="inline -mt-px mr-0.5" />{app.company}</>}
              </p>
            </div>

            {/* Actions — always shown on touch widths, revealed on hover from sm up */}
            <div className="flex items-center shrink-0 -mr-1.5 -mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity"
                 onClick={e => e.stopPropagation()}>
              <button onClick={() => onUpdate(app.id, { priority: isStarred ? 'medium' : 'high' })}
                className={`icon-btn !w-7 !h-7 cursor-pointer ${isStarred ? '!text-amber-400' : 'hover:!text-amber-400'}`}
                title={isStarred ? "Unstar hackathon" : "Star hackathon"}>
                <Star size={13} className={isStarred ? 'fill-amber-400' : ''} />
              </button>

              {app.link && (
                <a href={app.link} target="_blank" rel="noreferrer"
                   className="icon-btn !w-7 !h-7 cursor-pointer"
                   title="Open link">
                  <ExternalLink size={13} />
                </a>
              )}

              <button onClick={() => onEdit(app)}
                className="icon-btn !w-7 !h-7 cursor-pointer"
                title="Edit">
                <Edit3 size={13} />
              </button>

              <button onClick={() => onDelete(app.id)}
                className="icon-btn !w-7 !h-7 cursor-pointer hover:!text-rose-400"
                title="Delete">
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {isNearest && (
              <span className={`${BADGE} !text-amber-400`}>Soonest</span>
            )}
            <span className={BADGE}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[app.status] || STATUS_DOT.pending}`} />
              {status.label}
            </span>
            {app.ppi && <span className={BADGE}>PPI</span>}
            {app.travel && <span className={BADGE}>Travel</span>}
            {app.onsite && <span className={BADGE}>Onsite</span>}
            {app.remote && <span className={BADGE}>Remote</span>}
          </div>

          {/* No steps yet — offer the template. Without this you would
              retype the same six steps per hackathon, and after the second
              one you would stop bothering. */}
          {(!progress || progress.total === 0) && (
            <button
              onClick={e => { e.stopPropagation(); onCreateChecklist && onCreateChecklist(app); }}
              title="Create the standard hackathon checklist"
              className="mt-2.5 inline-flex items-center gap-1.5 h-7 px-2 rounded-md cursor-pointer
                text-[12px] text-slate-500 hover:text-slate-200
                border border-dashed border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.02] transition-colors">
              <ListChecks size={12} />
              Add checklist
            </button>
          )}

          {/* Checklist this hackathon owns. */}
          {progress && progress.total > 0 && (
            <button
              onClick={e => { e.stopPropagation(); onOpenChecklist && onOpenChecklist(); }}
              title="Open in the Daily Checklist"
              className="mt-2.5 w-full flex items-center gap-2.5 h-7 cursor-pointer text-left group/check">
              <ListChecks size={12} className="text-slate-500 group-hover/check:text-slate-300 shrink-0 transition-colors" />
              <Progress className="flex-1" value={progress.done / progress.total} tone={allDone ? 'good' : 'accent'} height={3} />
              <span className={`text-[11.5px] tabular-nums shrink-0 ${allDone ? 'text-emerald-400' : 'text-slate-500 group-hover/check:text-slate-300'}`}>
                {progress.done}/{progress.total} steps
              </span>
            </button>
          )}

          {/* Notes preview */}
          {app.notes && (
            <p className="text-[12.5px] text-slate-500 leading-relaxed mt-2 line-clamp-2 whitespace-pre-line">
              {app.notes}
            </p>
          )}

          {/* Additional links */}
          {app.links && app.links.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 pt-2.5 border-t border-white/[0.05] text-[12px]" onClick={e => e.stopPropagation()}>
              <LinkIcon size={11} className="text-slate-600 shrink-0" />
              {app.links.map((lnk, idx) => (
                <a
                  key={idx}
                  href={lnk.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-100 transition-colors min-w-0 max-w-full"
                >
                  <span className="truncate">{lnk.label || hostOf(lnk.url)}</span>
                  <ExternalLink size={10} className="opacity-60 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ── App Detail Modal with smooth transitions ──────────────────
   Read-only twin of the editor: content left, properties right. */
function AppDetailModal({ app, onClose, onEdit, nearestAppId }) {
  // Modal renders in place (no portal), so the wrapper can reach its overlay
  // and surface to play the existing .closing animation before unmounting.
  const wrapRef = useRef(null);
  const closingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    wrapRef.current?.querySelectorAll('.modal-overlay, .modal-surface')
      .forEach(el => el.classList.add('closing'));
    setTimeout(onClose, 200);
  }, [onClose]);

  const status = getStatusStyles(app.status);
  const statusColor = (STATUS_OPTIONS.find(o => o.value === app.status) || STATUS_OPTIONS[0]).color;
  const name = app.name || 'Hackathon';
  const isStarred = app.priority === 'high';
  const deadlineValid = app.deadline && !isNaN(new Date(app.deadline));
  const days = deadlineValid ? daysUntil(ymdLocal(new Date(app.deadline))) : null;
  const perks = [
    app.ppi && { icon: ShieldCheck, tone: 'text-emerald-400', label: 'Offers PPI' },
    app.travel && { icon: Flame, tone: 'text-amber-400', label: 'Travel covered' },
    app.onsite && { icon: MapPin, tone: 'text-accent-400', label: 'Onsite' },
    app.remote && { icon: Globe, tone: 'text-slate-300', label: 'Remote / online' },
  ].filter(Boolean);
  const valueCls = 'text-[13px] text-slate-200 min-w-0 break-words';

  return (
    <div ref={wrapRef} className="contents">
    <Modal
      open
      onClose={handleClose}
      title="Hackathon"
      width={780}
      footer={<>
        <button type="button" onClick={handleClose}
          className="btn-ghost h-8 px-3 text-[13px] rounded-lg cursor-pointer">Close</button>
        <button type="button" onClick={() => { onEdit(app); onClose(); }}
          className="btn-primary h-8 px-4 text-[13px] rounded-lg cursor-pointer inline-flex items-center gap-1.5">
          <Edit3 size={13} /> Edit
        </button>
      </>}
    >
      <EditorLayout aside={<>
        <PropRow icon={Briefcase} label="Organiser">
          <span className={app.company ? valueCls : 'text-[13px] text-slate-600'}>{app.company || 'None'}</span>
        </PropRow>
        <PropRow icon={Calendar} label="Deadline" top>
          {deadlineValid ? (
            <div className="pt-1">
              <p className={valueCls}>{formatDate(app.deadline)}</p>
              <p className={`text-[11.5px] mt-0.5 ${
                days < 0 ? 'text-slate-500' : days <= 2 ? 'text-rose-400' : days <= 7 ? 'text-amber-400' : 'text-slate-500'}`}>
                {days < 0 ? `Ended ${daysLeftText(days)}` : daysLeftText(days)}
              </p>
            </div>
          ) : <span className="text-[13px] text-slate-600">None</span>}
        </PropRow>
        <PropRow icon={CheckCircle2} label="Status">
          <span className={`${valueCls} inline-flex items-center gap-1.5`}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor }} />
            {status.label}
          </span>
        </PropRow>
        <PropRow icon={Star} label="Priority">
          <span className={`${valueCls} inline-flex items-center gap-1.5`}>
            {isStarred
              ? <><Star size={12} className="fill-amber-400 text-amber-400" /> Starred</>
              : 'Normal'}
          </span>
        </PropRow>
        <PropRow icon={Gift} label="Perks" top>
          {perks.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {perks.map(p => (
                <span key={p.label} className={BADGE}><p.icon size={11} className={p.tone} /> {p.label}</span>
              ))}
            </div>
          ) : <span className="text-[13px] text-slate-600 inline-block pt-1">None</span>}
        </PropRow>
        {app.id === nearestAppId && (
          <div className="pt-2">
            <span className={`${BADGE} !text-amber-400`}><span className="beacon-amber" /> Soonest deadline</span>
          </div>
        )}
      </>}>
        <h3 className="text-[20px] font-semibold leading-snug tracking-[-0.015em] text-slate-50 break-words">{name}</h3>

        <div className="text-[14px] leading-relaxed text-slate-300 whitespace-pre-line break-words min-h-[48px]">
          {app.notes || <span className="text-slate-600">No notes added.</span>}
        </div>

        {app.link && (
          <section>
            <SectionTitle>Event link</SectionTitle>
            <a href={app.link} target="_blank" rel="noreferrer"
              className="text-[13px] text-accent-300 hover:text-accent-200 hover:underline inline-flex items-start gap-1 break-all">
              {app.link}
              <ExternalLink size={11} className="shrink-0 mt-[3px]" />
            </a>
          </section>
        )}

        {app.links && app.links.length > 0 && (
          <section>
            <SectionTitle>Links</SectionTitle>
            <div className="space-y-1">
              {app.links.map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2.5 h-9 px-3 rounded-lg border border-white/[0.06]
                             hover:bg-white/[0.03] hover:border-white/[0.12] transition-colors group/link">
                  <Globe size={13} className="text-slate-500 shrink-0" />
                  <span className="text-[13px] text-slate-300 truncate flex-1 group-hover/link:text-slate-100">
                    {link.label || link.url}
                  </span>
                  <ExternalLink size={11} className="text-slate-600 group-hover/link:text-slate-300 shrink-0" />
                </a>
              ))}
            </div>
          </section>
        )}

        {app.retro && (
          <section>
            <SectionTitle>Retrospective</SectionTitle>
            <p className="text-[13.5px] leading-relaxed text-slate-300 whitespace-pre-line break-words">{app.retro}</p>
          </section>
        )}
      </EditorLayout>
    </Modal>
    </div>
  );
}
