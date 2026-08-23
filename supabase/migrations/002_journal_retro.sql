-- --------------------------------------------------------------------
-- 002 — Daily log, and hackathon retrospectives
-- --------------------------------------------------------------------
-- Run after 001. Both are optional: the app writes the daily log to
-- localStorage first and only mirrors to Supabase when this table
-- exists, so an unmigrated database keeps working with local-only notes.
-- --------------------------------------------------------------------

-- One free-text line per day. Review could say how much you did but
-- never what happened; this is the "what happened".
CREATE TABLE IF NOT EXISTS public.daily_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT daily_notes_date_key UNIQUE (date)
);

ALTER TABLE public.daily_notes DISABLE ROW LEVEL SECURITY;

-- The funnel counted outcomes but recorded nothing about them.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS retro TEXT DEFAULT '';
