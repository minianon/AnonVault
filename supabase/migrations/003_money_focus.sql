-- --------------------------------------------------------------------
-- 003 — Money (transactions, income sources, investments, loans) and Focus
-- --------------------------------------------------------------------
-- Run after 002. Both tables are optional: Money and Focus write to
-- localStorage first and only mirror to Supabase when these exist, so an
-- unmigrated database keeps working with local-only data. Running this
-- later pulls nothing down by itself — the next unlock syncs local rows up.
--
-- ids are generated client-side (crypto.randomUUID) so a row can be
-- written locally before the network round-trip, then upserted.
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income')),
    amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    category TEXT NOT NULL DEFAULT 'other',
    note TEXT DEFAULT '',
    method TEXT DEFAULT 'upi',
    date TEXT NOT NULL,               -- 'YYYY-MM-DD', matching tasks/daily_notes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON public.transactions (date);

CREATE TABLE IF NOT EXISTS public.focus_sessions (
    id UUID PRIMARY KEY,
    label TEXT NOT NULL,
    project TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,  -- NULL while the timer is running
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS focus_sessions_started_idx ON public.focus_sessions (started_at);

-- Matches the rest of the schema. See "Security posture" in the README
-- before deploying publicly: with RLS off, the anon key can read these.
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions DISABLE ROW LEVEL SECURITY;

-- Income sources: what you expect to earn, as a fixed amount or a range.
CREATE TABLE IF NOT EXISTS public.income_sources (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'fixed' CHECK (kind IN ('fixed', 'range')),
    amount NUMERIC(14, 2),
    min NUMERIC(14, 2),
    max NUMERIC(14, 2),
    frequency TEXT NOT NULL DEFAULT 'monthly',
    active BOOLEAN NOT NULL DEFAULT true,
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Income rows can say which source they came from.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source_id UUID;

CREATE TABLE IF NOT EXISTS public.investments (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'other',
    invested NUMERIC(14, 2) NOT NULL DEFAULT 0,
    current_value NUMERIC(14, 2),
    date TEXT,
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Money lent to (or borrowed from) people, and what has come back.
CREATE TABLE IF NOT EXISTS public.loans (
    id UUID PRIMARY KEY,
    person TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'lent' CHECK (direction IN ('lent', 'borrowed')),
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    repaid NUMERIC(14, 2) NOT NULL DEFAULT 0,
    date TEXT,
    due_date TEXT,
    note TEXT DEFAULT '',
    settled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.income_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans DISABLE ROW LEVEL SECURITY;

-- Companies / clients you work for, shared by Focus and Money.
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    color TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.focus_sessions ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.income_sources ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.income_sources ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'salary';

-- Side-income ideas, from "maybe" to "earning".
CREATE TABLE IF NOT EXISTS public.income_ideas (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    potential_min NUMERIC(14, 2),
    potential_max NUMERIC(14, 2),
    effort TEXT DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'idea',
    note TEXT DEFAULT '',
    source_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_ideas DISABLE ROW LEVEL SECURITY;

-- EMIs: monthly instalments with a fixed tenure. `payments` holds the
-- months ('YYYY-MM') that have been paid.
CREATE TABLE IF NOT EXISTS public.emis (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    lender TEXT DEFAULT '',
    emi_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_months INTEGER NOT NULL DEFAULT 0,
    start_month TEXT,
    due_day INTEGER DEFAULT 5,
    paid_before INTEGER NOT NULL DEFAULT 0,
    payments JSONB NOT NULL DEFAULT '[]'::jsonb,
    interest_rate NUMERIC(6, 2),
    note TEXT DEFAULT '',
    closed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS emi_id UUID;
ALTER TABLE public.emis DISABLE ROW LEVEL SECURITY;

-- Board: issues, to-dos and reminders, not tied to a project.
CREATE TABLE IF NOT EXISTS public.board_items (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
    priority TEXT DEFAULT 'medium',
    label TEXT DEFAULT '',
    due_date TEXT,
    rank DOUBLE PRECISION DEFAULT 0,
    done_at TIMESTAMP WITH TIME ZONE,
    promoted_from TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.board_items DISABLE ROW LEVEL SECURITY;
-- EMIs can now run with no end date.
ALTER TABLE public.emis ALTER COLUMN total_months DROP NOT NULL;
ALTER TABLE public.emis ALTER COLUMN total_months DROP DEFAULT;
