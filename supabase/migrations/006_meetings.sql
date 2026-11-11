-- 006: meetings on the Calendar (src/services/meetings.js).
-- Already included in setup_full.sql; run this only if you apply
-- migrations one by one. Safe to run more than once.

-- Meetings: one-off or repeating, shown on Calendar and Today
CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    recurrence TEXT NOT NULL DEFAULT 'none',
    recurrence_days JSONB NOT NULL DEFAULT '[]'::jsonb,
    ends_on TEXT,
    skipped JSONB NOT NULL DEFAULT '[]'::jsonb,
    link TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.meetings DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO anon, authenticated;

-- Live updates across devices (see 005_realtime.sql)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meetings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
