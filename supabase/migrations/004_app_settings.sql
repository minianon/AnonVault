-- 004: settings that sync across devices (src/services/prefs.js).
-- Already included in setup_full.sql; run this only if you apply
-- migrations one by one.

CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
