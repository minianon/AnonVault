<p align="center">
  <img src="public/favicon.svg" alt="AnonVault Logo" width="100" height="100" />
</p>

<h1 align="center">AnonVault</h1>

<p align="center">
  <strong>Your private daily workspace — tasks, focus, money and deadlines in one place.</strong>
</p>

<p align="center">
  <a href="README.hi.md">हिन्दी (Hindi)</a>
</p>

---

## Overview

AnonVault is a private, keyboard-first workspace for running your day: what you have to do, what you are doing right now, where your money went, and what is due next — behind a passcode screen.

Version 2 is a ground-up redesign: a calm neutral interface (Geist type, hairline borders, one accent, no glow), short purposeful motion, and two new sections built for daily use — **Focus** and **Money**.

> **Please read [Security posture](#security-posture) before deploying this anywhere public.** The passcode is a UI gate, not an access control.

---

## Sections

| # | Section | What it is for |
| :--- | :--- | :--- |
| 1 | **Today** | The home screen: a hero with quick actions (task, timer, expense, card, quote) and a progress ring; today's checklist, Board cards in progress or due, running timers, spending against budget, the next deadlines, and your quotes shown one after another. |
| 2 | **Checklist** | Recurring (daily / weekdays / weekends / custom weekly) and one-off daily tasks with subtasks and priorities, per-day completion and a one-line daily log. |
| 3 | **Board** | Issues, to-dos and reminders for anything — a project, a company, yourself. To do → In progress → Done; drag or click to move. Cards carry a description, links, images (upload or paste), a label, priority, and a due date + time. **Type naturally** — `call bank tomorrow 5pm #personal !high` fills all of that in. Start a **timer on any card** and see time tracked per card. |
| 4 | **Calendar** | One month view of everything dated: hackathon deadlines, Board due dates, EMIs, income received and dated checklist tasks. Filter by type, pick a day for its agenda (with focus time and spend), tick cards/EMIs off, or add a card on that day. |
| 5 | **Focus** | "What am I doing right now." Start a timer with a label, a free-text **source** (company, client…) and a project. Several can run at once; the day timeline shows parallel work in lanes. Hours per source next to the income it brought in. |
| 6 | **Money** | **Overview:** log an expense or *extra income* (money that isn't one of your monthly sources) in seconds, budget bar with even-pace marker, category and daily charts, CSV export. **Income sources:** fixed amount or min–max range, linked to a company — tick off "Nov received", "Dec received"; click a tick to undo. **EMIs:** monthly amount and optional number of months (empty = no end); "Nov paid" ticks log the expense and undo on click. **Investments:** trading accounts, SIPs, stocks, FDs, gold, crypto — money put in, withdrawn and the balance now, profit that counts withdrawals, full history with undo. **Lending:** lent/borrowed, repayments, due dates, per-person balance. |
| 7 | **Ideas** | Two tabs. **Project:** idea capture with tags, links and images; send one to the Board when it's time. **Income:** side-income ideas with rough monthly potential, from idea → testing → earning. |
| 8 | **Hackathons** | Deadlines, onsite/remote, travel, links and notes; a per-event checklist and a retrospective. |
| 9 | **Review** | Completion rate and streaks over 7/30/90 days, skipped tasks, the hackathon funnel and targets. |
| 10 | **Quotes** | Your quote collection. Today rotates through them. |

---

## Keyboard

| Key | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> | Command palette — search everything, jump anywhere, or act |
| <kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd> | Jump to a section |
| <kbd>[</kbd> | Collapse / expand the sidebar |
| <kbd>n</kbd> | New item in the current section (in Money it focuses the amount; in Focus, the timer label) |
| <kbd>/</kbd> | Focus the current section's search |

In the palette, typing an amount logs an expense (`250 lunch`); text with a date (`renew passport in 2 weeks`) becomes a dated Board card; any other text can start a timer, add a task or save an idea. Shortcuts are ignored while typing and while a dialog is open.

---

## Data model

Tasks, hackathons, ideas and projects live in Supabase as before. **Money**, **Focus**, **Board**, **Quotes**, companies and income ideas are local-first: every write lands in `localStorage` instantly and is mirrored to Supabase when the tables from migration `003` exist, so they work offline and on an unmigrated database. On unlock, local rows are pushed up and remote rows pulled down.

---

## Getting Started

### 1. Database & Storage

Create a free [Supabase](https://supabase.com) project, then:

1. Open the **SQL Editor**, paste [`supabase/setup_full.sql`](supabase/setup_full.sql) and run it. That's the whole database: every table, the image bucket and its policies.
2. That's it. The script is safe to run on an existing AnonVault database too (it only adds what's missing) and safe to run again.

> The individual files in `supabase/migrations/` are kept for history; `setup_full.sql` already includes all of them.

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
