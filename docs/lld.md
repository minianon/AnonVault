# Low-Level Design (LLD): AnonVault

Component configurations, database schemas, service interfaces, and logic routines.

---

## Component Layout & Props

| Component | Key Props | Purpose |
| :--- | :--- | :--- |
| **`App.jsx`** | *(root)* | Owns `applications`, `ideas`, `projectIdeas`, `quotes`, `taskStats`, `tasksVersion`, tab state, and the deep-link seeds (`initIdeaId`, `initProjectId`, `initHackathonId`, `initTaskDate`). Hosts the palette, the keyboard shortcuts, undo, and the lock/reveal sequence. |
| **`Sidebar.jsx`** | `activeTab`, `setActiveTab`, `stats`, `mobileOpen`, `setMobileOpen` | Brand, primary nav with colour accents, a secondary **More** group (Quotes), collapse state in localStorage, and social links. Badges show attention counts — `pendingTasks`, `upcomingApplications` — never totals. |
| **`DashboardView.jsx`** | `applications`, `ideas`, `projectIdeas`, `quotes`, `onTasksChange`, `tasksVersion`, `setActiveTab`, `onSelect*` | Pulse strip, daily quote, checklist widget, closest hackathon with checklist progress, pinned concepts, pinned drafts with stage. |
| **`TasksView.jsx`** | `applications`, `showToast`, `onTasksChange`, `tasksVersion`, `initialDate`, `onClearInitialDate`, `onLock`, `onMenuToggle` | Date-navigated checklist, daily log field, Mark All Done, hackathon link select, subtasks, cancel-for-today. |
| **`TimelineView.jsx`** | `applications`, `onAdd`, `onUpdate`, `onDelete`, `tasksVersion`, `setActiveTab`, `onCreateChecklist`, `initialSelectedAppId` | Upcoming/past split, filters, checklist progress row or template offer, retro field on resolved entries. |
| **`IdeaVaultView.jsx`** | `ideas`, `onAdd`, `onUpdate`, `onDelete`, `onPromoteToProject`, `promotedMap`, `onOpenConcept`, `initialSelectedIdeaId` | Masonry cards, image uploader (max 1.5MB), promotion, archiving. |
| **`ProjectIdeasView.jsx`** | `ideas`, `onAdd`, `onUpdate`, `onDelete`, `onReorder`, `showToast`, `initialSelectedIdeaId` | Kanban board + grid, stage badge, stage filter, archiving. |
| **`ReviewView.jsx`** | `applications`, `projectIdeas`, `setActiveTab`, `onPickDate`, `onLock`, `onMenuToggle` | Stat cards with targets, clickable per-day chart, reliability tables, hackathon funnel. |
| **`QuotesView.jsx`** | `quotes`, `onAdd`, `onUpdate`, `onDelete` | CRUD for the quote library, consumed by the dashboard. |
| **`CommandPalette.jsx`** | `open`, `onClose`, `tasks`, `applications`, `ideas`, `projectIdeas`, `quotes`, `setActiveTab`, `onSelect*`, `onQuickAdd*` | Cross-section search, navigation and capture. |
| **`Toast.jsx`** | `showToast(type, title, message, duration, action)` | `action` is `{ label, onClick }` and powers undo. |

### Shared hooks

| Hook | File | Purpose |
| :--- | :--- | :--- |
| `useShortcutHooks({ onNew, searchRef, rootRef })` | `src/utils/useShortcutHooks.js` | Listens for the `anonvault:new` / `anonvault:focus-search` window events. Because all tabs stay mounted, it checks its own panel is visible first — otherwise one keypress would open the add form in every view. |
| `useArchive(storageKey)` | `src/utils/useArchive.js` | localStorage-backed archive ids. A view preference, like pinning — deliberately not synced. |

---

## Key Logic Routines

### Reveal orchestration (`App.jsx` + `index.css`)

Panel content is owned by **exactly one** rule set — `[data-tabreveal]` — for both the unlock and tab switches. Two rule sets with different `animation-name`s targeting the same elements caused a double reveal: dropping `.app-reveal` at the end of the unlock changed the computed `animation-name`, which starts a fresh animation run.

`data-tabreveal` is gated on `revealing || !showLockScreen`:
- absent while locked, so a panel does not burn its animation behind the lock screen;
- applied at the handover itself, not when the lock layer unmounts 700ms later, or the aperture would reveal a fully-formed dashboard that then animated in.

### Progress dial (`AccessGranted`)

Driven by a `stroke-dashoffset` **transition** rather than a keyframe, because the end value is task data and cannot be baked into CSS. With nothing scheduled it renders a full muted ring labelled `CLEAR` rather than an empty ring, which would read as failure.

### Emblem release flip

A keyframe, not a transition: transitions interpolate transforms by matrix decomposition, and `rotateY(360deg)` decomposes identically to `0deg` — a transition would not rotate at all.

### History aggregates (`src/services/tasks.js`)

```js
getCompletionHistory(days)  // per-day { date, scheduled, completed, rate }
getTaskReliability(days)    // per recurring task, least reliable first
getStreaks(days)            // { current, longest } of clean days
getDayCount()               // days since the earliest task
getHackathonProgress()      // { [hackathonId]: { total, done, steps[] } }
getAllTasksSync()           // raw local tasks, unfiltered by date
```

Two rules keep these honest:

1. A task counts on a date only if its recurrence covers it **and** it existed then (`created_at <= date`). Without the second check, adding a task today would appear as months of retroactively missed days.
2. A day with nothing scheduled is **skipped**, not counted as a failure — a weekends-only schedule must not lose its streak every Monday.

### Daily quote selection

```js
const dayHash = d.getFullYear() * 1000 + (d.getMonth() + 1) * 32 + d.getDate();
return quotes[dayHash % quotes.length];
```
Deterministic: same quote all day, different each day.

### Daily log (`src/services/journal.js`)

localStorage is the source of truth; Supabase is a mirror. The note is typed a character at a time, so it must never wait on the network, and it must work against a database without migration 002. Writes are debounced 600ms and never throw — a failed mirror is logged, not surfaced.

---

## Database Schema

Base tables live in [`supabase/schema.sql`](../supabase/schema.sql). Columns marked **(001)** or **(002)** come from the matching migration.

### `applications`
| Field | Type | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `gen_random_uuid()` | Primary key. |
| `user_id` | `uuid` | — | FK to `auth.users`. |
| `name` | `text` | — | Event name (required). |
| `company` | `text` | `''` | Organiser. |
| `link` / `links` | `text` / `jsonb` | `''` / `[]` | Primary and additional links. |
| `deadline` | `timestamptz` | — | Drives upcoming/past split and urgency. |
| `priority` | `text` | `'medium'` | `low` \| `medium` \| `high` (high = starred). |
| `status` | `text` | `'pending'` | `pending` \| `applied` \| `interviewing` \| `offered` \| `rejected`, shown as Tracked / Registered / Building / Won / Completed. |
| `notes` | `text` | `''` | Prep notes. |
| `ppi`, `travel`, `onsite`, `remote` | `boolean` | `false` | Perk and mode flags. |
| **`retro`** **(002)** | `text` | `''` | Retrospective, surfaced once status is `offered` or `rejected`. |
| `created_at` | `timestamptz` | `now()` | — |

### `ideas`
`id`, `user_id`, `title` (required), `content`, `image_url`, `images` (`jsonb`), `links` (`jsonb`), `tags` (`text[]`), `created_at`.
Pin and archive state are **localStorage-only** (`anonvault_ideas_pinned`, `anonvault_ideas_archived`).

### `tasks`
| Field | Type | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `gen_random_uuid()` | Primary key. |
| `user_id` | `uuid` | — | FK to `auth.users`. |
| `title` | `text` | — | Required. |
| `priority` | `text` | `'medium'` | `low` \| `medium` \| `high`. |
| `is_recurring` | `boolean` | `false` | — |
| `recurrence` | `text` | `'daily'` | `daily` \| `weekdays` \| `weekends` \| `weekly`. |
| `recurrence_days` | `text[]` | `'{}'` | Weekday indices for `weekly`. |
| `date` | `text` | — | `YYYY-MM-DD` for one-off tasks; `null` when recurring. |
| `subtasks` | `jsonb` | `[]` | `{ id, title, completed }[]`. |
| `completed` | `boolean` | `false` | One-off tasks only; recurring use `task_completions`. |
| **`hackathon_id`** **(001)** | `uuid` | `null` | FK to `applications`, `ON DELETE SET NULL` so removing a hackathon leaves its tasks intact. |
| `created_at` | `timestamptz` | `now()` | Also used to bound history aggregates. |

### `task_completions` / `subtask_completions`
`(task_id, date)` and `(task_id, subtask_id, date)` unique. This is the log Review reads across dates — the only historical dataset in the app.

### `project_ideas`
| Field | Type | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `id`, `user_id`, `title`, `content` | — | — | Core fields. |
| `images`, `links` | `jsonb` | `[]` | Attachments. |
| `tags` | `text[]` | `'{}'` | Categories. |
| **`status`** **(001)** | `text` | `'backlog'` | `backlog` \| `building` \| `shipped` \| `parked`. Null reads as `backlog`. |
| **`promoted_from`** **(001)** | `uuid` | `null` | FK to `ideas`, `ON DELETE SET NULL`. Drives the "Promoted" badge. |
| `created_at` | `timestamptz` | `now()` | — |

Archive state is localStorage-only (`anonvault_projects_archived`); view mode is `anonvault_projects_view`.

### `quotes`
`id`, `user_id`, `text` (required), `author`, `category`, `tags` (`text[]`), `source`, `created_at`.

### `daily_notes` **(002)**
| Field | Type | Purpose |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary key. |
| `date` | `text` | `YYYY-MM-DD`, **unique**. |
| `note` | `text` | One line about the day. |
| `created_at` | `timestamptz` | — |

---

## LocalStorage Keys

| Key | Role |
| :--- | :--- |
| `anonvault_tasks`, `anonvault_task_completions`, `anonvault_subtask_completions` | Task cache and completion log. Source for all history aggregates. |
| `anonvault_quotes`, `anonvault_project_ideas` | Section caches / fallback stores. |
| `anonvault_applications_cache`, `anonvault_concepts_cache` | Minimal caches the unlock briefing reads, written by `loadData()`. Needed because the briefing runs before any fetch. |
| `anonvault_daily_notes` | Daily log, source of truth. |
| `anonvault_task_cancelled` | Cancel-for-today, per date. |
| `anonvault_ideas_pinned`, `anonvault_ideas_archived` | Idea Vault view state. |
| `anonvault_projects_archived`, `anonvault_projects_view` | Project Ideas view state. |
| `anonvault_targets` | Review targets `{ completion, ships }`. |
| `anonvault_sidebar_collapsed` | Sidebar width. |
| `supabase_url`, `supabase_key` | Optional runtime credential override. |

`sessionStorage.minianon_authorized` holds the PIN gate — see the HLD's security section for why that is not a real boundary.

---

## Services

### `src/services/supabase.js`
- **Applications**: `fetchApplications`, `addApplication`, `updateApplication`, `deleteApplication`
- **Ideas**: `fetchIdeas`, `addIdea`, `updateIdea`, `deleteIdea`
- **Tasks**: `fetchTasks`, `addTaskToSupabase`, `updateTaskInSupabase`, `deleteTaskFromSupabase`
- **Completions**: `fetchTaskCompletions`, `upsertTaskCompletion`, `fetchSubtaskCompletions`, `upsertSubtaskCompletion`
- **Project Ideas**: `fetchProjectIdeas`, `addProjectIdea`, `updateProjectIdea`, `deleteProjectIdea`
- **Storage**: `uploadIdeaImage`
- **Client**: `getSupabaseClient`, `isConfigured`, `saveCredentials`, `clearCredentials`

> Optional columns (`hackathon_id`, `status`, `promoted_from`, `retro`) are spread into payloads **only when set**. Sending them unconditionally would break ordinary creation against an unmigrated database instead of failing only the dependent feature.

### `src/services/tasks.js`
CRUD (`addTask`, `updateTask`, `deleteTask`, `toggleTaskCompletion`, `toggleSubtaskCompletion`), reads (`getTasksForDate` async, `getTasksForDateSync` local), plus the history aggregates listed above.

### `src/services/journal.js`
`getNote(date)`, `getNotedDates()`, `setNote(date, note)`, `syncNotes()`.

### `src/services/quotes.js`
`fetchQuotes`, `addQuote`, `updateQuote`, `deleteQuote` with a localStorage fallback.

---

## Logic Routine: PIN Keypad

```
[Keydown / Click]
      |
      +-- numeric (0-9)?
      |     |
      |     +-- pin length < 4 -> append; now 4?
      |     |        |
      |     |        +-- matches VITE_APP_PIN -> setUnlocking(true)
      |     |        |      -> AccessGranted mounts -> briefing -> onComplete(targetTab)
      |     |        |      -> sessionStorage.minianon_authorized = 'true'
      |     |        +-- no match -> glitch / laser / shake, clear pin, count error
      |     +-- pin length = 4 -> ignore
      |
      +-- BACKSPACE -> drop last digit
      +-- ESCAPE    -> clear
```

`onComplete` carries an optional target tab, so clicking a briefing tile skips the dwell *and* lands in the section it described.
