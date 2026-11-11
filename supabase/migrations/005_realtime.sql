-- 005: live updates across devices.
-- Adds the app's tables to Supabase Realtime, so an open device is told
-- the moment something changes elsewhere and re-syncs that table (App.jsx).
-- Already included in setup_full.sql. Safe to run more than once.

DO $$
DECLARE
  t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'applications', 'ideas', 'tasks', 'task_completions', 'subtask_completions',
    'project_ideas', 'quotes', 'daily_notes', 'board_items', 'companies',
    'focus_sessions', 'transactions', 'income_sources', 'emis', 'investments',
    'loans', 'income_ideas', 'app_settings'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
