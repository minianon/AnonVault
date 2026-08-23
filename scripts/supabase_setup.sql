-- ====================================================================
-- AnonVault Database Schema & Migration Script
-- ====================================================================
-- This file contains the complete SQL statements to set up all tables,
-- constraints, RLS policies, and storage configurations required for
-- the Daily Checklist, Hackathon Timeline, Idea Vault, and Project Ideas.
--
-- Copy and paste this script directly into your Supabase SQL Editor.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. EXTENSIONS
-- --------------------------------------------------------------------
-- Enable uuid-ossp for gen_random_uuid() functionality if not active
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------
-- 2. TABLES CREATION
-- --------------------------------------------------------------------

-- --- Applications (Hackathon Timeline) ---
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- --- Ideas (Idea Vault) ---
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

-- --- Tasks (Daily Checklist) ---
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
    -- Optional owner: lets a hackathon carry its own checklist.
    hackathon_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- --- Task Completions (Log for Checklist) ---
CREATE TABLE IF NOT EXISTS public.task_completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    completed BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT task_completions_task_id_date_key UNIQUE (task_id, date)
);

-- --- Subtask Completions (Log for Checklist subtasks) ---
CREATE TABLE IF NOT EXISTS public.subtask_completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    subtask_id TEXT NOT NULL,
    date TEXT NOT NULL,
    completed BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT subtask_completions_task_id_subtask_id_date_key UNIQUE (task_id, subtask_id, date)
);

-- --- Project Ideas (Brainstorming concepts) ---
CREATE TABLE IF NOT EXISTS public.project_ideas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    images JSONB DEFAULT '[]'::jsonb,
    links JSONB DEFAULT '[]'::jsonb,
    tags TEXT[] DEFAULT '{}',
    -- backlog | building | shipped | parked
    status TEXT DEFAULT 'backlog',
    promoted_from UUID REFERENCES public.ideas(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- --- Quotes Vault (Inspiring thoughts & personal lines) ---
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

-- --------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------------------------
-- Depending on your deployment, select Option A or Option B.

-- ====================================================================
-- OPTION A: Disable RLS (Recommended for personal/single-user vaults)
-- ====================================================================
-- This completely opens up table access for direct client-side CRUD
-- operations when running local development without authenticated user logins.

ALTER TABLE public.applications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtask_completions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ideas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes DISABLE ROW LEVEL SECURITY;

-- ====================================================================
-- OPTION B: Alternatively, Enable RLS & Configure Public Rules
-- ====================================================================
-- Uncomment the block below if you wish to enforce open read/write access:
--
-- ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Open Access" ON public.applications FOR ALL USING (true) WITH CHECK (true);
--
-- ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Open Access" ON public.ideas FOR ALL USING (true) WITH CHECK (true);
--
-- ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Open Access" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
--
-- ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Open Access" ON public.task_completions FOR ALL USING (true) WITH CHECK (true);
--
-- ALTER TABLE public.subtask_completions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Open Access" ON public.subtask_completions FOR ALL USING (true) WITH CHECK (true);
--
-- ALTER TABLE public.project_ideas ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Open Access" ON public.project_ideas FOR ALL USING (true) WITH CHECK (true);


-- --------------------------------------------------------------------
-- 4. STORAGE BUCKET CONFIGURATION
-- --------------------------------------------------------------------
-- Setup the 'idea-images' storage bucket for attachment uploads.
-- Note: Run these statements to register the public bucket and create RLS policies for it.

-- Insert bucket entry
INSERT INTO storage.buckets (id, name, public)
VALUES ('idea-images', 'idea-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies to enable all operations for public uploads:
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'idea-images');

CREATE POLICY "Public Write Access"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'idea-images');

CREATE POLICY "Public Update Access"
ON storage.objects FOR UPDATE
USING (bucket_id = 'idea-images');

CREATE POLICY "Public Delete Access"
ON storage.objects FOR DELETE
USING (bucket_id = 'idea-images');

-- --- Daily Log (one line per day, read back in Review) ---
CREATE TABLE IF NOT EXISTS public.daily_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT daily_notes_date_key UNIQUE (date)
);

ALTER TABLE public.daily_notes DISABLE ROW LEVEL SECURITY;

-- Hackathon retrospective, surfaced once an entry resolves.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS retro TEXT DEFAULT '';
