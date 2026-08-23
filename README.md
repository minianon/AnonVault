<p align="center">
  <img src="public/favicon.svg" alt="AnonVault Logo" width="100" height="100" />
</p>

<h1 align="center">AnonVault</h1>

<p align="center">
  <strong>A Premium Private Workspace & Personal Productivity Dashboard</strong>
</p>

<p align="center">
  <a href="README.hi.md">हिन्दी (Hindi)</a>
</p>

---

## Overview

AnonVault is a privacy-first personal workspace that centralizes hackathon tracking, daily checklists, project pipelines, and creative capture — all behind a 4-digit PIN lock screen.

The workspace uses a **glassmorphic dark UI** with per-section colour accents, a staged unlock animation, a command palette, and a Review section that reads back the history everything else has been writing.

> **Please read [Security posture](#security-posture) before deploying this anywhere public.** The PIN is a UI gate, not an access control.

---

## Core Modules

| Module | Description |
| :--- | :--- |
| **Workspace Dashboard** | The pinned home view. A pulse strip (streak, 7-day completion rate, concepts building, link into Review), today's rotating quote, a live checklist snapshot with progress, the closest/starred hackathon with its checklist progress, pinned concepts, and pinned drafts with their pipeline stage. Includes a live `HH:MM:SS` clock. |
| **Daily Checklist** | Recurring (daily / weekdays / weekends / custom weekly) and one-off tasks with subtasks and priorities. Per-date completion, cancel-for-today, **Mark All Done**, an optional link to a hackathon, and a one-line **daily log** for the selected date. |
| **Hackathon Timeline** | Deadlines, onsite/remote, PPI, travel, reference links and notes. Upcoming events are shown by default with expired ones behind a **Past** toggle. Each entry can own a **checklist** (with a one-click six-step template) and gains a **retrospective** field once it resolves. |
| **Idea Vault** | Visual concept cards with tags, links and image uploads. Ideas can be **promoted** into Project Ideas, which moves them out of the active vault. Supports archiving. |
| **Project Ideas** | A four-column **Kanban board** — `backlog → building → shipped → parked` — with drag between columns, plus a grid view. Tags, links, image attachments, archiving. |
| **Review** | The only section that is output rather than input. Completion rate and streaks over 7/30/90 days, a clickable per-day chart, **consistently skipped** recurring tasks, the hackathon funnel with a win rate, and editable **targets** to measure against. |
| **Quotes Vault** | A personal quote library. One rotates daily on the dashboard via a deterministic date-hash. Lives in the sidebar's secondary **More** group. |

---

## Workspace Features

### Command palette — <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>K</kbd>
Searches tasks, hackathons, ideas, concepts and quotes at once, jumps to any of them, or creates a task or idea straight from the query. Create actions are ranked last so a search term never steals <kbd>Enter</kbd> from a real match.

### Keyboard shortcuts
| Key | Action |
| :--- | :--- |
| <kbd>1</kbd>–<kbd>7</kbd> | Jump to a section |
| <kbd>n</kbd> | New item in the current section |
| <kbd>/</kbd> | Focus the current section's search |
| <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd> | Command palette |

All are ignored while typing and while a modal or the palette is open.

### Unlock sequence
Correct PIN → an **access-granted briefing** showing a progress dial of today's completion, a count-up of tasks due / hackathon deadlines this week / project ideas, and an adaptive summary line. Any key or click skips it; clicking a tile skips *and* lands you in that section. The lock layer then leaves as an aperture collapsing onto the emblem while the dashboard stages in — sidebar, then main, then panels.

### Undo
Deleting a hackathon, idea or quote offers **Undo** for 7 seconds in the toast. Restoring re-inserts the record, so it returns with a new id.

### Archiving
The two capture sections (Idea Vault, Project Ideas) support archiving — a per-card action plus a toolbar toggle, with a banner while you are inside the archive. Stored locally as a view preference, the same way pinning already works.

---

## Getting Started

### 1. Database & Storage

Create a free [Supabase](https://supabase.com) project, then:

1. Open the **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
2. Run the migrations in order — these add hackathon-linked tasks, the project pipeline, the daily log and hackathon retros:
   - [`supabase/migrations/001_hackathon_tasks_and_project_status.sql`](supabase/migrations/001_hackathon_tasks_and_project_status.sql)
   - [`supabase/migrations/002_journal_retro.sql`](supabase/migrations/002_journal_retro.sql)
3. Go to **Storage** and create a public bucket named exactly `idea-images`.

> Existing installs only need the migrations. The app degrades gracefully without them — the new columns are only sent when they hold a value — so unmigrated databases keep working, minus the features that depend on them.

### 2. Environment

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_public_anon_api_key
VITE_APP_PIN=your_four_digit_pin_here
```

### 3. Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Security posture

Be clear-eyed about what the lock screen does and does not do:

- **`VITE_*` variables are inlined into the client bundle at build time.** `VITE_APP_PIN` and `VITE_SUPABASE_ANON_KEY` are both readable in the deployed JavaScript.
- **The gate is `sessionStorage`.** Authorization is a `minianon_authorized` flag, settable from devtools.
- **`schema.sql` disables Row Level Security on every table.** With RLS off, anyone holding the URL and anon key can read and write all rows directly through the Supabase REST API, without ever loading the app.

Treat the PIN as a privacy screen against casual shoulder-surfing, not as security. If you deploy this publicly and care about the data, enable RLS, create a Supabase Auth user, and scope every policy to `auth.uid()` — or put the whole app behind host-level access control.

---

## Documentation

| Document | Description | Link |
| :--- | :--- | :--- |
| High-Level Design (HLD) | System architecture, navigation, and data flow. | [View HLD](docs/hld.md) |
| Low-Level Design (LLD) | Database schemas, component props, services, and logic routines. | [View LLD](docs/lld.md) |
| Project License | MIT License terms of use. | [View License](LICENSE) |

---

## Contact

Built and maintained by **[Mini Anon](https://minianon.in)**.

| Where | Link |
| :--- | :--- |
| Website | [minianon.in](https://minianon.in) |
| All links | [link.minianon.in/tusharbhardwaj](https://link.minianon.in/tusharbhardwaj) |
| X | [@minianondev](https://x.com/minianondev) |
| GitHub | [@minianon](https://github.com/minianon) |
| LinkedIn | [in/minianon](https://www.linkedin.com/in/minianon/) |

Questions, ideas or bugs — open an [issue](https://github.com/minianon/AnonVault/issues) or reach out to [Mini Anon](https://minianon.in).
