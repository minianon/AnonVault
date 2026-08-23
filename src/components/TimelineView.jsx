import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, Search, ArrowUpDown, ExternalLink, 
  Edit3, Trash2, Calendar, Link as LinkIcon, AlertTriangle, 
  Clock, ChevronDown, ChevronUp, ChevronRight, ListCollapse,
  Lock, X, Flame, Briefcase, CheckCircle2, ShieldCheck, MapPin, Globe, Star, Menu, History,
  ListChecks
} from 'lucide-react';
import { formatDate, getPriorityStyles, getStatusStyles, sortApplicationsByDeadline, groupApplicationsByMonth } from '../utils/helpers';
import { getHackathonProgress } from '../services/tasks';

/* ─── Premium Custom Dropdown ─────────────────────────── */
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
        className="select-premium pl-8 pr-10 py-2 text-[13px] rounded-xl cursor-pointer font-medium flex items-center gap-1.5 min-w-[130px] justify-between relative group/btn"
      >
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {icon}
        </span>
        <span className="truncate pr-1">{activeOption.label}</span>
        <ChevronDown 
          size={12} 
          className={`text-slate-500 transition-transform duration-200 group-hover/btn:text-slate-350 ${isOpen ? 'rotate-180 text-indigo-400' : ''}`} 
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 min-w-[180px] bg-slate-950/98 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-[0_12px_30px_rgba(0,0,0,0.6)] py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 text-[12.5px] transition-all flex items-center justify-between border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.04] cursor-pointer ${
                value === opt.value 
                  ? 'text-indigo-300 font-semibold bg-indigo-500/[0.04]' 
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>{opt.label}</span>
              {value === opt.value && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
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
  setActiveTab
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [groupByMonthMode, setGroupByMonthMode] = useState(true);
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [formName, setFormName] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formDaysLeft, setFormDaysLeft] = useState('1');
  const [formLinks, setFormLinks] = useState([]);
  const [formStarred, setFormStarred] = useState(false);
  const [formStatus, setFormStatus] = useState('pending');
  const [formNotes, setFormNotes] = useState('');
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
    setFormDaysLeft('1');
    setFormStarred(false); setFormStatus('pending');
    setFormNotes(''); 
    setFormCompany('');
    setFormPpi(false);
    setFormTravel(false);
    setFormOnsite(false);
    setFormRemote(false);
    setEditingApp(null);
  };

  const handleOpenAdd = () => { resetForm(); setIsFormOpen(true); };

  const handleOpenEdit = (app) => {
    setEditingApp(app);
    setFormName(app.name); setFormLink(app.link || '');
    setFormLinks(app.links || []);
    if (app.deadline) {
      const targetDate = new Date(app.deadline);
      targetDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = targetDate - today;
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      setFormDaysLeft(String(Math.max(0, diffDays)));
    } else { setFormDaysLeft('1'); }
    setFormStarred(app.priority === 'high');
    setFormStatus(app.status || 'pending');
    setFormNotes(app.notes || '');
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
    const days = parseInt(formDaysLeft, 10);
    if (isNaN(days) || days < 0) {
      showToast?.('error', 'Invalid Days', 'Please enter a valid non-negative number of days.');
      return;
    }

    const calculatedDeadline = new Date();
    calculatedDeadline.setDate(calculatedDeadline.getDate() + days);
    calculatedDeadline.setHours(12, 0, 0, 0); // Standardize to noon for even tracking

    const appPayload = {
      name: formName.trim(), link: formLink.trim(),
      links: formLinks.filter(l => l.url.trim()),
      deadline: calculatedDeadline.toISOString(),
      priority: formStarred ? 'high' : 'medium',
      status: formStatus, notes: formNotes.trim(),
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

  const addLinkRow = () => {
    setFormLinks([...formLinks, { url: '', label: '' }]);
  };

  const removeLinkRow = (idx) => {
    setFormLinks(formLinks.filter((_, i) => i !== idx));
  };

  const changeLinkRow = (idx, link) => {
    const updated = [...formLinks];
    updated[idx] = link;
    setFormLinks(updated);
  };

  const moveLink = (index, direction) => {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= formLinks.length) return;
    const updated = [...formLinks];
    const temp = updated[index];
    updated[index] = updated[nextIdx];
    updated[nextIdx] = temp;
    setFormLinks(updated);
  };

  const handleDeleteClick = (id) => setDeleteConfirmId(id);
  const handleConfirmDelete = async () => {
    if (deleteConfirmId) { await onDelete(deleteConfirmId); setDeleteConfirmId(null); }
  };

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

  const selectClass = "px-3 py-1.5 text-xs text-slate-300 rounded-lg cursor-pointer transition-all focus:outline-none input-premium";

  const TimelineNodeDot = ({ app }) => {
    const isStarred = app.priority === 'high';
    return (
      <div className={`absolute -left-[27px] top-5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center z-10 transition-all ${
        isStarred
          ? 'border-amber-400 bg-amber-400/20 shadow-[0_0_10px_rgba(245,158,11,0.4)]'
          : 'border-slate-700 bg-slate-900'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${
          isStarred ? 'bg-amber-400' : 'bg-slate-600'
        }`} />
      </div>
    );
  };

  return (
    <div className="flex-1 h-screen flex flex-col overflow-hidden relative" style={{ background: '#07060f' }}>
      <div className="workspace-aurora-glow workspace-glow-1" />
      <div className="workspace-aurora-glow workspace-glow-2" />

      {/* Header */}
      <header className="glass-header px-4 lg:px-7 py-4 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <button onClick={onMenuToggle}
            className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-white rounded-xl cursor-pointer flex items-center justify-center shrink-0 bg-white/[0.04] border border-white/[0.06] transition-all hover:bg-white/[0.07]">
            <Menu size={16} />
          </button>
          <div>
            <h2 className="text-[15px] lg:text-[17px] font-extrabold text-white tracking-tight leading-tight">Hackathon Timeline</h2>
            <p className="text-[10px] lg:text-[11px] text-slate-600 mt-0.5 font-medium">{(applications||[]).length} events tracked</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onLock}
            className="btn-ghost p-2.5 rounded-xl cursor-pointer flex items-center justify-center"
            title="Lock workspace"
          >
            <Lock size={13} className="text-slate-500 hover:text-rose-400 transition-colors" />
          </button>
          <button onClick={handleOpenAdd} className="btn-primary flex items-center gap-2 px-4 py-2 text-[13px] font-bold rounded-xl cursor-pointer">
            <Plus size={14} />
            <span className="hidden sm:inline">Add Hackathon</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="px-4 lg:px-7 py-3 border-b border-white/[0.04] flex flex-wrap gap-3 items-center justify-between shrink-0 relative z-10"
        style={{ background: 'rgba(7,6,15,0.6)', backdropFilter: 'blur(16px)' }}>
        <div className="relative min-w-[220px] max-w-xs flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search hackathons…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input-premium w-full pl-9 pr-4 py-2.5 text-[13px] rounded-xl font-medium placeholder:text-slate-700"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Custom Star Filter Button */}
          <button
            onClick={() => setSelectedPriority(p => p === 'high' ? 'all' : 'high')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-xl border transition-all cursor-pointer ${
              selectedPriority === 'high'
                ? 'bg-amber-400/10 border-amber-400/35 text-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.06)]'
                : 'bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-slate-300'
            }`}
            title="Filter by featured events"
          >
            <Star size={13} className={selectedPriority === 'high' ? 'fill-amber-300 text-amber-300' : 'text-slate-500'} />
            <span>Starred Only</span>
          </button>

          {/* Premium Status Custom Dropdown */}
          <CustomDropdown
            value={selectedStatus}
            onChange={setSelectedStatus}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'applied', label: 'Registered' },
              { value: 'interviewing', label: 'Building' },
              { value: 'offered', label: 'Winner' },
              { value: 'rejected', label: 'Completed' }
            ]}
            icon={<CheckCircle2 size={11} className="text-indigo-400/80" />}
            placeholder="All Statuses"
          />

          <button
            onClick={() => setSortOrder(p => p === 'asc' ? 'desc' : 'asc')}
            className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-xl cursor-pointer"
          >
            <ArrowUpDown size={12} />
            {sortOrder === 'asc' ? 'Soonest' : 'Furthest'}
          </button>

          <button
            onClick={() => setGroupByMonthMode(p => !p)}
            className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-xl cursor-pointer"
          >
            <ListCollapse size={12} />
            {groupByMonthMode ? 'By Month' : 'Linear'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-7 py-6 reveal-stagger">
        {loading ? (
          <div className="h-48 flex items-center justify-center gap-3 text-slate-500 text-sm">
            <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
              <Calendar size={24} className="text-slate-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-300">No hackathons found</h3>
            <p className="text-[12px] text-slate-600 mt-1.5 leading-relaxed">
              {searchTerm || selectedPriority !== 'all' || selectedStatus !== 'all'
                ? 'Try adjusting your filters.'
                : 'Start tracking your first hackathon.'}
            </p>
            {!searchTerm && selectedPriority === 'all' && selectedStatus === 'all' && (
              <button onClick={handleOpenAdd} className="btn-primary mt-5 px-5 py-2 text-[13px] font-semibold rounded-xl cursor-pointer">
                Add Hackathon
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Starred / Pinned Section */}
            {starredApps.length > 0 && selectedPriority !== 'high' && !showPast && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pinned Hackathons</h3>
                  <span className="px-2 py-0.5 text-[10px] bg-amber-400/10 text-amber-300 rounded-full font-bold border border-amber-400/20">{starredApps.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
                      onOpenChecklist={() => setActiveTab && setActiveTab('tasks')}
                    />
                  ))}
                </div>
                {mainApps.length > 0 && <div className="h-px bg-white/[0.04] my-8" />}
              </div>
            )}

            {mainApps.length > 0 && (
              <>
                {/* Timeline header + past/upcoming switch */}
                <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    {showPast
                      ? <History size={14} className="text-slate-500" />
                      : <Calendar size={14} className="text-slate-500" />}
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      {showPast ? 'Past Hackathons' : 'Upcoming Timeline'}
                    </h3>
                    <span className="px-2 py-0.5 text-[10px] bg-white/[0.06] text-slate-500 rounded-full font-bold">
                      {timelineApps.length}
                    </span>
                  </div>

                  {pastApps.length > 0 && (
                    <button
                      onClick={() => setShowPast(p => !p)}
                      title={showPast
                        ? 'Back to upcoming hackathons'
                        : 'Show hackathons whose deadline has already passed'}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                        showPast
                          ? 'bg-indigo-500/[0.12] border-indigo-500/30 text-indigo-300'
                          : 'bg-white/[0.02] border-white/[0.06] text-slate-500 hover:bg-white/[0.05] hover:text-slate-300'
                      }`}
                    >
                      {showPast ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <History size={12} />
                      <span>Past</span>
                      <span className="px-1.5 py-0.5 text-[9.5px] rounded-full bg-white/[0.07] text-slate-400 font-bold">
                        {pastApps.length}
                      </span>
                    </button>
                  )}
                </div>

                {timelineApps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-16 max-w-sm mx-auto">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3.5">
                      <Calendar size={20} className="text-slate-600" />
                    </div>
                    <h3 className="text-[13px] font-semibold text-slate-300">No upcoming hackathons</h3>
                    <p className="text-[12px] text-slate-600 mt-1.5 leading-relaxed">
                      {pastApps.length > 0
                        ? `Every tracked event has passed. Open Past (${pastApps.length}) to look back.`
                        : 'Add an event to start building your timeline.'}
                    </p>
                  </div>
                ) : groupByMonthMode ? (
                  <div className="relative pl-5 ml-1" style={{ borderLeft: '1px solid rgba(99,102,241,0.12)' }}>
                    <div className="space-y-10">
                      {monthKeys.map(monthYear => {
                        const isExpanded = expandedMonths[monthYear] !== false;
                        const monthApps = groupedApps[monthYear];
                        return (
                          <div key={monthYear} className="relative">
                            {/* Month marker */}
                            <div className="absolute -left-[27px] top-1 w-4 h-4 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            </div>
                            <button
                              onClick={() => toggleMonth(monthYear)}
                              className="flex items-center gap-2 text-[13px] font-semibold text-slate-300 hover:text-white transition-colors mb-4 cursor-pointer"
                            >
                              {isExpanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                              {monthYear}
                              <span className="px-2 py-0.5 text-[10px] bg-white/[0.06] text-slate-500 rounded-full font-medium">{monthApps.length}</span>
                            </button>
                            {isExpanded && (
                              <div className="relative pl-5 space-y-4" style={{ borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
                                {monthApps.map(app => (
                                  <div key={app.id} className="relative">
                                    <TimelineNodeDot app={app} />
                                    <HackathonCard app={app} isNearest={app.id===nearestAppId} onEdit={handleOpenEdit} onDelete={handleDeleteClick} onViewDetails={setSelectedAppDetails} onUpdate={onUpdate} progress={hackathonProgress[app.id]} onOpenChecklist={() => setActiveTab && setActiveTab('tasks')} />
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
                  <div className="relative pl-5 ml-1 space-y-4" style={{ borderLeft: '1px solid rgba(99,102,241,0.12)' }}>
                    {sortedApps.map(app => (
                      <div key={app.id} className="relative">
                        <TimelineNodeDot app={app} />
                        <HackathonCard app={app} isNearest={app.id===nearestAppId} onEdit={handleOpenEdit} onDelete={handleDeleteClick} onViewDetails={setSelectedAppDetails} onUpdate={onUpdate} progress={hackathonProgress[app.id]} onOpenChecklist={() => setActiveTab && setActiveTab('tasks')} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── ADD / EDIT MODAL ── */}
      {isFormOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setIsFormOpen(false)}>
          <div className="modal-surface w-full max-w-lg max-h-[90vh] rounded-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-bold text-white">{editingApp ? 'Edit Hackathon' : 'New Hackathon'}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{editingApp ? 'Update the details below' : 'Track a new event or deadline'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormStarred(s => !s)}
                  className={`p-2 rounded-lg cursor-pointer transition-all duration-200 ${
                    formStarred
                      ? 'bg-amber-400/10 border border-amber-400/35 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.06)]'
                      : 'btn-ghost text-slate-550 hover:text-amber-400'
                  }`}
                  title={formStarred ? 'Featured (Starred)' : 'Mark as Featured'}
                >
                  <Star size={15} className={formStarred ? 'fill-amber-300' : ''} />
                </button>
                <button onClick={() => setIsFormOpen(false)} className="btn-ghost p-2 rounded-lg cursor-pointer"><X size={15} /></button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              <Field label="Event Name" required>
                <input type="text" required placeholder="e.g. HackMIT 2025" value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="input-premium w-full px-4 py-2.5 text-[13px] rounded-xl font-semibold placeholder:text-slate-700" />
              </Field>

              <Field label="Company / Host Organization">
                <input type="text" placeholder="e.g. Google, Major League Hacking" value={formCompany}
                  onChange={e => setFormCompany(e.target.value)}
                  className="input-premium w-full px-4 py-2.5 text-[13px] rounded-xl font-semibold placeholder:text-slate-700" />
              </Field>

              <Field label="Event Link">
                <div className="relative">
                  <LinkIcon size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input type="url" placeholder="https://…" value={formLink}
                    onChange={e => setFormLink(e.target.value)}
                    className="input-premium w-full pl-9 pr-4 py-2.5 text-[13px] rounded-xl font-medium placeholder:text-slate-700" />
                </div>
              </Field>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Days Remaining until Deadline <span className="text-rose-400">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFormDaysLeft(prev => String(Math.max(0, parseInt(prev, 10) - 1)))}
                    className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] active:scale-95 transition-all text-slate-300 font-bold flex items-center justify-center cursor-pointer text-lg select-none"
                  >
                    −
                  </button>
                  
                  <div className="relative flex-1">
                    <input
                      type="text"
                      pattern="[0-9]*"
                      required
                      value={formDaysLeft}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setFormDaysLeft(val || '0');
                      }}
                      className="input-premium w-full text-center py-2.5 font-bold text-white text-base rounded-xl select-all"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 pointer-events-none select-none">
                      {parseInt(formDaysLeft, 10) === 1 ? 'day' : 'days'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFormDaysLeft(prev => String(parseInt(prev, 10) + 1))}
                    className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] active:scale-95 transition-all text-slate-300 font-bold flex items-center justify-center cursor-pointer text-lg select-none"
                  >
                    +
                  </button>

                  {/* Hidden date picker triggered by Calendar Icon */}
                  <div 
                    onClick={(e) => {
                      const input = e.currentTarget.querySelector('input[type="date"]');
                      if (input) {
                        if (typeof input.showPicker === 'function') {
                          input.showPicker();
                        } else {
                          input.click();
                        }
                      }
                    }}
                    className="relative w-11 h-11 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] active:scale-95 transition-all flex items-center justify-center cursor-pointer text-slate-300"
                  >
                    <Calendar size={16} />
                    <input
                      type="date"
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        if (e.target.value) {
                          const selected = new Date(e.target.value + 'T00:00:00');
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const diffTime = selected - today;
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                          setFormDaysLeft(String(Math.max(0, diffDays)));
                        }
                      }}
                      className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <Field label="Status">
                  <select value={formStatus} onChange={e => setFormStatus(e.target.value)}
                    className="input-premium w-full px-4 py-2.5 text-[13px] rounded-xl cursor-pointer font-semibold">
                    <option value="pending">Pending</option>
                    <option value="applied">Registered</option>
                    <option value="interviewing">Building</option>
                    <option value="offered">Winner</option>
                    <option value="rejected">Completed</option>
                  </select>
                </Field>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Event details / Perks</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormPpi(p => !p)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer select-none active:scale-[0.98] ${
                      formPpi
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.06)]'
                        : 'bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-slate-300'
                    }`}
                  >
                    <ShieldCheck size={16} className={formPpi ? 'text-emerald-400' : 'text-slate-500'} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold leading-none">Offers PPI</p>
                      <p className="text-[10px] text-slate-550 mt-1 leading-none">Placement Interview</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormTravel(t => !t)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer select-none active:scale-[0.98] ${
                      formTravel
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.06)]'
                        : 'bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-slate-300'
                    }`}
                  >
                    <Flame size={16} className={formTravel ? 'text-amber-400' : 'text-slate-500'} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold leading-none">Travel Covered</p>
                      <p className="text-[10px] text-slate-550 mt-1 leading-none">Reimbursements</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormOnsite(o => !o)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer select-none active:scale-[0.98] ${
                      formOnsite
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.06)]'
                        : 'bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-slate-300'
                    }`}
                  >
                    <MapPin size={16} className={formOnsite ? 'text-indigo-400' : 'text-slate-500'} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold leading-none">Onsite Event</p>
                      <p className="text-[10px] text-slate-550 mt-1 leading-none">In-person experience</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormRemote(r => !r)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer select-none active:scale-[0.98] ${
                      formRemote
                        ? 'bg-slate-500/15 border-slate-500/30 text-slate-300 shadow-[0_0_15px_rgba(100,116,139,0.06)]'
                        : 'bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-slate-300'
                    }`}
                  >
                    <Globe size={16} className={formRemote ? 'text-slate-300' : 'text-slate-500'} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold leading-none">Remote / Online</p>
                      <p className="text-[10px] text-slate-550 mt-1 leading-none">Join from anywhere</p>
                    </div>
                  </button>
                </div>
              </div>

              <Field label="Notes">
                <textarea rows={4} placeholder="Project ideas, team, requirements…" value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="input-premium w-full px-4 py-3 text-[13px] rounded-xl resize-none leading-relaxed font-medium placeholder:text-slate-700" />
              </Field>

              {/* Links Section */}
              <Field label="Additional Links">
                <div className="space-y-2">
                  {formLinks.map((link, i) => (
                    <LinkRow
                      key={i}
                      link={link}
                      index={i}
                      total={formLinks.length}
                      onRemove={removeLinkRow}
                      onChange={changeLinkRow}
                      onMoveUp={idx => moveLink(idx, -1)}
                      onMoveDown={idx => moveLink(idx, 1)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={addLinkRow}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-[12px] font-semibold
                               text-indigo-400 border border-dashed border-indigo-500/25 rounded-xl
                               hover:border-indigo-500/50 hover:bg-indigo-500/[0.05] transition-all cursor-pointer"
                  >
                    <Plus size={13} /> Add Link Reference
                  </button>
                </div>
              </Field>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsFormOpen(false)} className="btn-ghost flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" className="btn-primary flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">
                  {editingApp ? 'Save Changes' : 'Add Hackathon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ── */}
      {deleteConfirmId && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-surface w-full max-w-sm rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <Trash2 size={16} className="text-rose-400" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-white">Delete Hackathon</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">This cannot be undone</p>
              </div>
            </div>
            <p className="text-[13px] text-slate-400 leading-relaxed">
              Are you sure you want to delete this hackathon? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="btn-ghost flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Keep It</button>
              <button onClick={handleConfirmDelete} className="btn-danger flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DETAILS MODAL ── */}
      {selectedAppDetails && (
        <AppDetailModal 
          app={selectedAppDetails} 
          onClose={() => setSelectedAppDetails(null)} 
          onEdit={handleOpenEdit} 
          nearestAppId={nearestAppId} 
        />
      )}
    </div>
  );
}

/* ── Utility sub-components ── */
function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function InfoRow({ icon, label, children }) {
  return (
    <div className="flex items-start gap-3 text-[13px]">
      <span className="mt-0.5">{icon}</span>
      <span className="text-slate-500 shrink-0 w-16">{label}</span>
      <span className="text-slate-200 font-medium flex-1">{children}</span>
    </div>
  );
}

/* ── HACKATHON CARD ── */
function HackathonCard({ app, isNearest, onEdit, onDelete, onViewDetails, onUpdate, progress, onOpenChecklist }) {
  const priority = getPriorityStyles(app.priority);
  const status = getStatusStyles(app.status);

  const getTimeRemaining = (deadlineStr) => {
    const targetDate = new Date(deadlineStr);
    targetDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = targetDate - today;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: `Expired ${Math.abs(diffDays)}d ago`, isUrgent: false, isExpired: true };
    if (diffDays === 0) return { text: 'Due today', isUrgent: true, isExpired: false };
    if (diffDays === 1) return { text: 'Due tomorrow', isUrgent: true, isExpired: false };
    if (diffDays <= 4) return { text: `${diffDays}d left`, isUrgent: true, isExpired: false };
    return { text: `${diffDays}d left`, isUrgent: false, isExpired: false };
  };

  const remaining = getTimeRemaining(app.deadline);

  const isStarred = app.priority === 'high';

  return (
    <article
      onClick={() => onViewDetails && onViewDetails(app)}
      className={`glass-card rounded-2xl cursor-pointer select-none group transition-all duration-300 tactile-item ${
        isStarred ? 'premium-starred-card' : ''
      }`}
    >
      <div className="p-5">
        {/* Top Date & Days Left Strip */}
        <div className="flex items-center justify-between text-[11px] mb-3 pb-2.5 border-b border-white/[0.04]">
          <span className="flex items-center gap-1.5 text-slate-400 font-medium">
            <Calendar size={11} className="text-indigo-400/80" />
            {formatDate(app.deadline)}
          </span>
          <span className={`flex items-center gap-1 font-semibold tabular-nums ${
            remaining.isExpired ? 'text-slate-600' :
            remaining.isUrgent ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            <Clock size={11} />
            {remaining.text}
          </span>
        </div>

        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {isNearest && <span className="beacon-amber" />}
              {isStarred && !isNearest && <span className="beacon-amber" />}
              <h4 className="text-[14px] font-bold text-white leading-tight truncate">{app.name}</h4>
            </div>
            {app.company && (
              <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate flex items-center gap-1">
                <Briefcase size={10} className="text-slate-500" />
                {app.company}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {isNearest && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full
                                 bg-amber-400/10 text-amber-300 border border-amber-400/20 animate-pulse">
                  ⚡ Soonest
                </span>
              )}
              <span className={`inline-flex px-2 py-0.5 text-[9px] font-bold rounded-full border ${status.bg} ${status.text} ${status.border}`}>
                {status.label}
              </span>
              {app.ppi && (
                <span className="inline-flex px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  PPI
                </span>
              )}
              {app.travel && (
                <span className="inline-flex px-2 py-0.5 text-[9px] font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Travel
                </span>
              )}
              {app.onsite && (
                <span className="inline-flex px-2 py-0.5 text-[9px] font-bold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Onsite
                </span>
              )}
              {app.remote && (
                <span className="inline-flex px-2 py-0.5 text-[9px] font-bold rounded-full bg-slate-500/10 text-slate-400 border border-white/[0.06]">
                  Remote
                </span>
              )}
            </div>

            {/* Checklist this hackathon owns. Only shown once steps exist, so
                cards for untouched entries are unchanged. */}
            {progress && progress.total > 0 && (
              <button
                onClick={e => { e.stopPropagation(); onOpenChecklist && onOpenChecklist(); }}
                title="Open in the Daily Checklist"
                className="mt-3 w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer
                  bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] transition-all">
                <ListChecks size={11} className="text-sky-400/80 shrink-0" />
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div style={{
                    width: `${Math.round((progress.done / progress.total) * 100)}%`,
                    height: '100%', borderRadius: 99,
                    background: progress.done === progress.total
                      ? 'linear-gradient(90deg, #10b981, #34d399)'
                      : 'linear-gradient(90deg, #0ea5e9, #38bdf8)',
                  }} />
                </div>
                <span className={`text-[10px] font-bold tabular-nums shrink-0 ${
                  progress.done === progress.total ? 'text-emerald-400' : 'text-slate-500'
                }`}>
                  {progress.done}/{progress.total}
                </span>
              </button>
            )}
          </div>

          {/* Actions — hidden by default, visible on hover */}
          <div className="flex items-center gap-0.5 bg-white/[0.02] border border-white/[0.07] rounded-xl p-0.5 shrink-0 select-none
                          opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100
                          transition-all duration-200 ease-out"
               onClick={e => e.stopPropagation()}>
            {/* star/pin toggle button */}
            <button onClick={() => onUpdate(app.id, { priority: isStarred ? 'medium' : 'high' })}
              className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center border border-transparent ${
                isStarred 
                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/[0.08] hover:border-amber-400/20' 
                  : 'text-slate-400 hover:text-amber-400 hover:bg-amber-400/[0.08] hover:border-amber-400/20'
              }`}
              title={isStarred ? "Unstar hackathon" : "Star hackathon"}>
              <Star size={11} className={isStarred ? 'fill-amber-400' : ''} />
            </button>

            <div className="w-[1px] h-3 bg-white/[0.08] self-center" />

            {app.link && (
              <>
                <a href={app.link} target="_blank" rel="noreferrer"
                   className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-indigo-500/[0.08] transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-indigo-500/20"
                   title="Open link">
                  <ExternalLink size={11} />
                </a>
                <div className="w-[1px] h-3 bg-white/[0.08] self-center" />
              </>
            )}

            <button onClick={() => onEdit(app)}
              className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-indigo-500/[0.08] transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-indigo-500/20"
              title="Edit">
              <Edit3 size={11} />
            </button>

            <button onClick={() => onDelete(app.id)}
              className="p-1.5 text-slate-455 hover:text-rose-455 rounded-lg hover:bg-rose-500/[0.08] transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-rose-500/20"
              title="Delete">
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {/* Notes preview */}
        {app.notes && (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-2.5 line-clamp-2 whitespace-pre-line">
            {app.notes}
          </p>
        )}

        {/* Additional links */}
        {app.links && app.links.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-3 pt-2.5 border-t border-white/[0.04] text-[11px]" onClick={e => e.stopPropagation()}>
            <span className="text-slate-550 font-bold select-none flex items-center gap-1 shrink-0">
              <LinkIcon size={10} className="text-slate-600" />
              Links:
            </span>
            {app.links.map((lnk, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-600 select-none mx-0.5">•</span>}
                <a
                  href={lnk.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-indigo-400 hover:text-indigo-300 transition-colors underline decoration-indigo-500/25 hover:decoration-indigo-300/80 font-semibold"
                >
                  <span>{lnk.label || 'Link'}</span>
                  <ExternalLink size={8} className="opacity-60" />
                </a>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/* ── App Detail Modal with smooth transitions ──────────────── */
function AppDetailModal({ app, onClose, onEdit, nearestAppId }) {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  };

  return (
    <div className={`modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`modal-surface w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[90vh] ${isClosing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-start justify-between">
          <div className="flex-1 pr-4">
            <h3 className="text-[15px] font-bold text-white leading-snug">{app.name}</h3>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {app.id === nearestAppId && (
                <span className="tag-pill text-amber-300 border-amber-500/25 bg-amber-500/10">⚡ Soonest</span>
              )}
              {app.priority === 'high' && (
                <span className="tag-pill text-amber-300 border-amber-500/25 bg-amber-500/10 flex items-center gap-1">
                  <Star size={10} className="fill-amber-300 text-amber-300" /> Featured
                </span>
              )}
              <span className={`tag-pill ${getStatusStyles(app.status).text}`}>
                {getStatusStyles(app.status).label}
              </span>
            </div>
          </div>
          <button onClick={handleClose} className="btn-ghost p-2 rounded-lg cursor-pointer"><X size={15} /></button>
        </div>

        <div className="p-6 space-y-4 flex-1 overflow-y-auto">
          {app.company && (
            <InfoRow icon={<Briefcase size={13} className="text-indigo-400" />} label="Company">
              <span className="font-semibold text-white">{app.company}</span>
            </InfoRow>
          )}
          {app.deadline && (
            <InfoRow icon={<Calendar size={13} className="text-indigo-400" />} label="Deadline">
              {formatDate(app.deadline)}
            </InfoRow>
          )}
          {app.link && (
            <InfoRow icon={<LinkIcon size={13} className="text-indigo-400" />} label="Link">
              <a href={app.link} target="_blank" rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 break-all">
                {app.link}
                <ExternalLink size={10} />
              </a>
            </InfoRow>
          )}

          {(app.ppi || app.travel || app.onsite || app.remote) && (
            <div className="pt-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Event Highlights</p>
              <div className="flex flex-wrap gap-2">
                {app.ppi && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                    <ShieldCheck size={11} /> Offers PPI
                  </span>
                )}
                {app.travel && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium">
                    <Flame size={11} /> Travel Covered
                  </span>
                )}
                {app.onsite && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-medium">
                    <MapPin size={11} /> Onsite
                  </span>
                )}
                {app.remote && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-400 font-medium">
                    <Globe size={11} /> Remote / Online
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Multiple links */}
          {app.links && app.links.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Additional Links</p>
              <div className="space-y-1.5">
                {app.links.map((link, i) => (
                  <a key={i} href={link.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]
                               hover:bg-indigo-500/[0.07] hover:border-indigo-500/20 transition-all group/link">
                    <Globe size={13} className="text-indigo-400 shrink-0" />
                    <span className="text-[13px] text-slate-300 truncate flex-1 group-hover/link:text-indigo-300">
                      {link.label || link.url}
                    </span>
                    <ExternalLink size={11} className="text-slate-600 group-hover/link:text-indigo-400 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="divider" />
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Notes</p>
            <div className="glass-panel rounded-xl p-4 text-[13px] text-slate-300 whitespace-pre-line leading-relaxed min-h-[80px]">
              {app.notes || <span className="text-slate-650 italic">No notes added.</span>}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/[0.04] flex gap-3">
          <button onClick={() => { onEdit(app); onClose(); }}
            className="btn-primary flex-1 py-2.5 text-[13px] font-semibold rounded-xl cursor-pointer">Edit Details</button>
          <button onClick={handleClose}
            className="btn-ghost py-2.5 px-5 text-[13px] font-semibold rounded-xl cursor-pointer">Close</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Single link row inside form ─────────────────────── */
function LinkRow({ link, index, total, onRemove, onChange, onMoveUp, onMoveDown }) {
  return (
    <div className="flex items-center gap-2 p-2.5 bg-white/[0.025] border border-white/[0.06] rounded-xl">
      {/* Up/Down buttons for ordering */}
      <div className="flex flex-col gap-1 shrink-0">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMoveUp(index)}
          className={`p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/[0.08] hover:border-indigo-500/20 active:scale-95 transition-all cursor-pointer ${
            index === 0 ? 'opacity-20 cursor-not-allowed pointer-events-none' : ''
          }`}
          title="Move link up"
        >
          <ChevronUp size={11} />
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onMoveDown(index)}
          className={`p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/[0.08] hover:border-indigo-500/20 active:scale-95 transition-all cursor-pointer ${
            index === total - 1 ? 'opacity-20 cursor-not-allowed pointer-events-none' : ''
          }`}
          title="Move link down"
        >
          <ChevronDown size={11} />
        </button>
      </div>

      <Globe size={12} className="text-indigo-400 shrink-0" />
      <div className="flex-1 grid grid-cols-2 gap-2">
        <input
          type="url"
          placeholder="https://…"
          value={link.url}
          onChange={e => onChange(index, { ...link, url: e.target.value })}
          className="input-premium px-3.5 py-2 text-[12px] rounded-lg w-full font-medium placeholder:text-slate-700"
        />
        <input
          type="text"
          placeholder="Label (e.g. GitHub)"
          value={link.label}
          onChange={e => onChange(index, { ...link, label: e.target.value })}
          className="input-premium px-3.5 py-2 text-[12px] rounded-lg w-full font-medium placeholder:text-slate-700"
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="p-1.5 text-slate-550 hover:text-rose-455 transition-colors cursor-pointer shrink-0"
        title="Remove link"
      >
        <X size={13} />
      </button>
    </div>
  );
}
