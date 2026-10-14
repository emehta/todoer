-- Todoer's database.
--
-- Paste this whole file into your Supabase project's SQL Editor and press Run.
-- It is safe to run again: it only adds what is missing, and it never drops
-- anything. CronCal's schema.sql can go into the same project.

BEGIN;

-- ─── Shared with CronCal ─────────────────────────────────────────────
-- Created by whichever app is set up first, and never replaced by the other.

-- One owner per project. The server claims this row before it makes the
-- account, so two tabs can never both make one.
CREATE TABLE IF NOT EXISTS public.app_owner (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keys and settings the server keeps for the owner (a Groq key, a Google
-- client). Nothing in the browser can read this table.
CREATE TABLE IF NOT EXISTS public.app_settings (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Which version of each app's schema this project has. Written last, inside
-- the same transaction, so a row here means everything above it ran.
CREATE TABLE IF NOT EXISTS public.schema_versions (
  app TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_owner, public.app_settings, public.schema_versions FROM anon, authenticated;
GRANT ALL ON public.app_owner, public.app_settings, public.schema_versions TO service_role;

-- ─── Goals ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#808080',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT,
  deadline DATE,
  goal_type TEXT CONSTRAINT categories_goal_type_check
    CHECK (goal_type IS NULL OR goal_type IN ('short-term', 'long-term'))
);

CREATE INDEX IF NOT EXISTS categories_user_order_idx
  ON public.categories (user_id, display_order);

-- ─── Tasks ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  due_time TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CONSTRAINT tasks_priority_check
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 1024
);

CREATE INDEX IF NOT EXISTS tasks_user_due_order_idx
  ON public.tasks (user_id, due_date, display_order);

-- ─── Who may touch them ──────────────────────────────────────────────
-- Only the owner, and only their own rows. A stranger who signs up through
-- Supabase's own API is signed in but not the owner, so they see and write
-- nothing. The owner flag is in app_metadata, which only the server can set.
-- A later version adds columns with ALTER TABLE ... ADD COLUMN IF NOT EXISTS,
-- since CREATE TABLE IF NOT EXISTS leaves an existing table as it was.

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Created when missing, and brought up to date when present (ALTER POLICY,
-- never DROP), so running a newer schema.sql changes an older project's rule.
DO $$
DECLARE
  target TEXT;
  owner_rule CONSTANT TEXT :=
    '(SELECT auth.uid()) = user_id AND coalesce(((SELECT auth.jwt()) -> ''app_metadata'' ->> ''self_host_owner'')::boolean, false)';
BEGIN
  FOREACH target IN ARRAY ARRAY['categories', 'tasks'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target AND policyname = 'Owner manages own rows'
    ) THEN
      EXECUTE format('ALTER POLICY "Owner manages own rows" ON public.%I TO authenticated USING (%s) WITH CHECK (%s)', target, owner_rule, owner_rule);
    ELSE
      EXECUTE format('CREATE POLICY "Owner manages own rows" ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)', target, owner_rule, owner_rule);
    END IF;
  END LOOP;
END $$;

-- Spelled out both ways. Newer Supabase projects grant nothing on a new
-- table, while others grant every privilege, TRUNCATE included, which row
-- level security does not cover.
REVOKE ALL ON public.categories, public.tasks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories, public.tasks TO authenticated;
GRANT ALL ON public.categories, public.tasks TO service_role;

-- ─── Done ────────────────────────────────────────────────────────────

INSERT INTO public.schema_versions (app, version)
VALUES ('todoer', 1)
ON CONFLICT (app) DO UPDATE
  SET version = GREATEST(public.schema_versions.version, EXCLUDED.version),
      applied_at = now();

COMMIT;
