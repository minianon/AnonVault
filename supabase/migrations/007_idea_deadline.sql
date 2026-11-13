-- 007: an optional deadline on ideas, shown on the Calendar.
-- Already included in setup_full.sql. Safe to run more than once.

ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS due_date TEXT;

NOTIFY pgrst, 'reload schema';
