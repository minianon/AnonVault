-- --------------------------------------------------------------------
-- 001 — Hackathon-linked tasks, and a lifecycle for project ideas
-- --------------------------------------------------------------------
-- Run this once against an existing AnonVault database. Fresh installs
-- get both columns from supabase/schema.sql already.
--
-- Both columns are optional and nullable, and the app only sends them
-- when they hold a value, so the client keeps working against a database
-- that has not had this applied yet — you just cannot link a task to a
-- hackathon or move a concept along its pipeline until you do.
-- --------------------------------------------------------------------

-- Lets a Timeline entry own a checklist: register, form team, record the
-- demo, submit. ON DELETE SET NULL so removing a hackathon leaves its
-- tasks behind as ordinary ones rather than destroying them.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS hackathon_id UUID
  REFERENCES public.applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_hackathon_id_idx
  ON public.tasks (hackathon_id);

-- Turns Project Ideas from a pile into a funnel.
-- backlog | building | shipped | parked
ALTER TABLE public.project_ideas
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'backlog';

UPDATE public.project_ideas SET status = 'backlog' WHERE status IS NULL;

-- Records which Idea Vault entry a concept was promoted from, so the
-- funnel is traceable end to end.
ALTER TABLE public.project_ideas
  ADD COLUMN IF NOT EXISTS promoted_from UUID
  REFERENCES public.ideas(id) ON DELETE SET NULL;
