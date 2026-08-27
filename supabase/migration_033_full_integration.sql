-- ============================================================
-- VSI Migration 033 — Full Supabase Integration & RLS Polish
-- ============================================================

-- ─────────────────────────────────────────
-- 1. SEARCH RESULTS — Add ai_engine column
-- ─────────────────────────────────────────
ALTER TABLE public.search_results
  ADD COLUMN IF NOT EXISTS ai_engine text
  CHECK (ai_engine IS NULL OR ai_engine IN ('chatgpt', 'gemini', 'claude', 'perplexity'));

CREATE INDEX IF NOT EXISTS idx_sr_ai_engine ON public.search_results (ai_engine, created_at DESC);

-- ─────────────────────────────────────────
-- 2. FEEDBACK TABLE — Ensure complete schema
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category      text NOT NULL CHECK (category IN ('bug', 'idea', 'question', 'praise', 'general')),
  rating        text,
  subject       text,
  message       text NOT NULL,
  attachment_url text,
  page_url      text,
  user_agent    text,
  context_data  jsonb,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'in_progress', 'done', 'archived')),
  admin_notes   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Ensure rating column exists if feedback was created earlier
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS rating text;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS attachment_url text;

CREATE INDEX IF NOT EXISTS idx_feedback_agency_id  ON public.feedback(agency_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id    ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at DESC);

-- ─────────────────────────────────────────
-- 3. ENABLE RLS ON ALL TABLES
-- ─────────────────────────────────────────
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'client_keyword_analyses') THEN
    EXECUTE 'ALTER TABLE public.client_keyword_analyses ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invites') THEN
    EXECUTE 'ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ─────────────────────────────────────────
-- 4. RLS POLICIES FOR AGENCY ISOLATION
-- ─────────────────────────────────────────

-- Tasks RLS Policies
DROP POLICY IF EXISTS "tasks_agency_all" ON public.tasks;
CREATE POLICY "tasks_agency_all"
  ON public.tasks FOR ALL
  TO authenticated
  USING (
    agency_id IN (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    OR agency_id IS NULL
  )
  WITH CHECK (
    agency_id IN (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    OR agency_id IS NULL
  );

-- Feedback RLS Policies
DROP POLICY IF EXISTS "feedback_user_insert" ON public.feedback;
CREATE POLICY "feedback_user_insert"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "feedback_agency_select" ON public.feedback;
CREATE POLICY "feedback_agency_select"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR agency_id IN (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
  );

-- Notifications RLS Policies
DROP POLICY IF EXISTS "notifications_user_all" ON public.notifications;
CREATE POLICY "notifications_user_all"
  ON public.notifications FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Messages RLS Policies
DROP POLICY IF EXISTS "messages_user_access" ON public.messages;
CREATE POLICY "messages_user_access"
  ON public.messages FOR ALL
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR receiver_id IS NULL)
  WITH CHECK (sender_id = auth.uid());

-- Client Keyword Analyses RLS Policies (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'client_keyword_analyses') THEN
    EXECUTE '
      DROP POLICY IF EXISTS "client_keyword_analyses_agency_all" ON public.client_keyword_analyses;
      CREATE POLICY "client_keyword_analyses_agency_all"
        ON public.client_keyword_analyses FOR ALL
        TO authenticated
        USING (
          client_id IN (
            SELECT id FROM public.clients 
            WHERE agency_id IN (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
          )
        );
    ';
  END IF;
END $$;
