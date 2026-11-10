-- ====================================================================
-- AnonVault — complete database setup
-- ====================================================================
-- One script for everything. Paste it into the Supabase SQL Editor and
-- run it. It is idempotent: safe on a brand-new project AND on an
-- existing AnonVault database (tables/columns/policies that already
-- exist are left alone), and safe to run more than once.
--
-- It replaces running schema.sql + migrations 001, 002 and 003 by hand.
--
-- After running it, also make sure Storage has a public bucket named
-- `idea-images` (this script creates it if your role is allowed to).
--
-- SECURITY: like the rest of the app, Row Level Security is disabled so
-- the browser can read and write with the anon key. Anyone with your
-- project URL + anon key can read this data. See "Security posture" in
-- the README before deploying publicly.
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════════════════
-- 1. CORE TABLES (checklist, hackathons, ideas, projects, quotes, log)
-- ════════════════════════════════════════════════════════════════════

-- Hackathons
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    company TEXT DEFAULT '',
    link TEXT DEFAULT '',
    links JSONB DEFAULT '[]'::jsonb,
    deadline TIMESTAMP WITH TIME ZONE,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    notes TEXT DEFAULT '',
    ppi BOOLEAN DEFAULT false,
    travel BOOLEAN DEFAULT false,
    onsite BOOLEAN DEFAULT false,
    remote BOOLEAN DEFAULT false,
    retro TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS links JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS retro TEXT DEFAULT '';

-- Ideas
CREATE TABLE IF NOT EXISTS public.ideas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    images JSONB DEFAULT '[]'::jsonb,
    links JSONB DEFAULT '[]'::jsonb,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Daily checklist
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    priority TEXT DEFAULT 'medium',
    is_recurring BOOLEAN DEFAULT false,
    recurrence TEXT DEFAULT 'daily',
    recurrence_days TEXT[] DEFAULT '{}',
    date TEXT,
    subtasks JSONB DEFAULT '[]'::jsonb,
    completed BOOLEAN DEFAULT false,
    hackathon_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS hackathon_id UUID REFERENCES public.applications(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_hackathon_id_idx ON public.tasks (hackathon_id);

CREATE TABLE IF NOT EXISTS public.task_completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    completed BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT task_completions_task_id_date_key UNIQUE (task_id, date)
);

CREATE TABLE IF NOT EXISTS public.subtask_completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    subtask_id TEXT NOT NULL,
    date TEXT NOT NULL,
    completed BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT subtask_completions_task_id_subtask_id_date_key UNIQUE (task_id, subtask_id, date)
);

-- Old "Projects" board. The new Board can import these in one click.
CREATE TABLE IF NOT EXISTS public.project_ideas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    images JSONB DEFAULT '[]'::jsonb,
    links JSONB DEFAULT '[]'::jsonb,
    tags TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'backlog',
    promoted_from UUID REFERENCES public.ideas(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.project_ideas ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'backlog';
ALTER TABLE public.project_ideas ADD COLUMN IF NOT EXISTS promoted_from UUID REFERENCES public.ideas(id) ON DELETE SET NULL;
UPDATE public.project_ideas SET status = 'backlog' WHERE status IS NULL;

-- Quotes (shown in turn on Today)
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    author TEXT DEFAULT 'Unknown',
    category TEXT DEFAULT 'Inspiration',
    tags TEXT[] DEFAULT '{}',
    source TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- One-line daily log
CREATE TABLE IF NOT EXISTS public.daily_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT daily_notes_date_key UNIQUE (date)
);

-- ════════════════════════════════════════════════════════════════════
-- 2. NEW IN v2 — Board, Focus, Sources, Money
--    ids come from the browser (crypto.randomUUID) so rows can be saved
--    locally first and synced after; that is why there is no default.
-- ════════════════════════════════════════════════════════════════════

-- Board: issues, to-dos and reminders
CREATE TABLE IF NOT EXISTS public.board_items (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT DEFAULT 'medium',
    label TEXT DEFAULT '',
    due_date TEXT,
    rank DOUBLE PRECISION DEFAULT 0,
    done_at TIMESTAMP WITH TIME ZONE,
    promoted_from TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Sources: the companies / clients you work for
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    color TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Focus: timed sessions (ended_at is NULL while a timer runs)
CREATE TABLE IF NOT EXISTS public.focus_sessions (
    id UUID PRIMARY KEY,
    label TEXT NOT NULL,
    project TEXT,
    company_id UUID,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.focus_sessions ADD COLUMN IF NOT EXISTS company_id UUID;
CREATE INDEX IF NOT EXISTS focus_sessions_started_idx ON public.focus_sessions (started_at);

-- Money: expenses and income
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'expense',
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'other',
    note TEXT DEFAULT '',
    method TEXT DEFAULT 'upi',
    date TEXT NOT NULL,
    source_id UUID,
    emi_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS emi_id UUID;
CREATE INDEX IF NOT EXISTS transactions_date_idx ON public.transactions (date);

-- Money: income sources (fixed amount or a min–max range)
CREATE TABLE IF NOT EXISTS public.income_sources (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'fixed',
    amount NUMERIC(14, 2),
    min NUMERIC(14, 2),
    max NUMERIC(14, 2),
    frequency TEXT NOT NULL DEFAULT 'monthly',
    category TEXT DEFAULT 'salary',
    company_id UUID,
    active BOOLEAN NOT NULL DEFAULT true,
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.income_sources ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'salary';
ALTER TABLE public.income_sources ADD COLUMN IF NOT EXISTS company_id UUID;

-- Money: EMIs (total_months NULL = no end date)
CREATE TABLE IF NOT EXISTS public.emis (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    lender TEXT DEFAULT '',
    emi_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_months INTEGER,
    start_month TEXT,
    due_day INTEGER DEFAULT 1,
    paid_before INTEGER NOT NULL DEFAULT 0,
    payments JSONB NOT NULL DEFAULT '[]'::jsonb,
    interest_rate NUMERIC(6, 2),
    note TEXT DEFAULT '',
    closed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.emis ALTER COLUMN total_months DROP NOT NULL;
ALTER TABLE public.emis ALTER COLUMN total_months DROP DEFAULT;

-- Money: investments
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

-- Money: lending / borrowing
CREATE TABLE IF NOT EXISTS public.loans (
    id UUID PRIMARY KEY,
    person TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'lent',
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    repaid NUMERIC(14, 2) NOT NULL DEFAULT 0,
    date TEXT,
    due_date TEXT,
    note TEXT DEFAULT '',
    settled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ideas → Income tab
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

-- ════════════════════════════════════════════════════════════════════
-- 3. ACCESS (single-user vault: RLS off, like the original schema)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.applications        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtask_completions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ideas       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_notes         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_items         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_sources      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emis                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_ideas        DISABLE ROW LEVEL SECURITY;

-- Make sure the API roles can use the new tables (Supabase usually grants
-- this automatically; harmless if it already did).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 4. STORAGE — public bucket for idea images
-- ════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('idea-images', 'idea-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Read Access') THEN
    CREATE POLICY "Public Read Access" ON storage.objects FOR SELECT USING (bucket_id = 'idea-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Write Access') THEN
    CREATE POLICY "Public Write Access" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'idea-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Update Access') THEN
    CREATE POLICY "Public Update Access" ON storage.objects FOR UPDATE USING (bucket_id = 'idea-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Delete Access') THEN
    CREATE POLICY "Public Delete Access" ON storage.objects FOR DELETE USING (bucket_id = 'idea-images');
  END IF;
END $$;

-- Refresh the API's schema cache so the new tables are usable right away.
NOTIFY pgrst, 'reload schema';

-- Done. Unlock the app and your local Money / Focus / Board / Quotes data
-- will sync up on the next unlock.
