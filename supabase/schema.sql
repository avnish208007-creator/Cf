-- ==============================================================================
-- ClipFlow Database Schema V1
-- Covers: profiles, workspaces, workspace_settings, source_videos, clip_candidates, clips, jobs
-- Row Level Security (RLS) enabled on all tables
-- ==============================================================================

-- 1. PROFILES (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 2. WORKSPACES
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Workspace',
  brand_name text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 3. WORKSPACE SETTINGS
CREATE TABLE IF NOT EXISTS public.workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  main_niche text NOT NULL DEFAULT 'Tech & Engineering Innovations',
  subtopics text[] NOT NULL DEFAULT ARRAY['Autonomous AI Agents', 'Developer Tools']::text[],
  content_language text NOT NULL DEFAULT 'English (US)',
  content_style text NOT NULL DEFAULT 'Kinetic typography with high-contrast highlighted keywords',
  aspect_ratio text NOT NULL DEFAULT '9:16',
  target_platforms text[] NOT NULL DEFAULT ARRAY['Instagram Reels', 'YouTube Shorts', 'TikTok']::text[],
  min_candidate_score integer NOT NULL DEFAULT 80,
  target_duration text NOT NULL DEFAULT '30-60s',
  branding_settings jsonb NOT NULL DEFAULT '{"watermark": true, "showCaptions": true}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 4. SOURCE VIDEOS
CREATE TABLE IF NOT EXISTS public.source_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  channel_title text NOT NULL DEFAULT '',
  duration text NOT NULL DEFAULT '00:00',
  view_count bigint NOT NULL DEFAULT 0,
  published_at text NOT NULL DEFAULT 'Recent',
  youtube_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'queued', 'processing', 'analyzed')),
  relevance_score integer DEFAULT 90,
  freshness_tag text,
  candidates_count integer NOT NULL DEFAULT 0,
  summary text NOT NULL DEFAULT '',
  niche text NOT NULL DEFAULT '',
  thumbnail_gradient text NOT NULL DEFAULT 'from-slate-800 to-slate-950',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 5. CLIP CANDIDATES
CREATE TABLE IF NOT EXISTS public.clip_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_video_id uuid REFERENCES public.source_videos(id) ON DELETE SET NULL,
  source_title text NOT NULL,
  channel_title text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  duration text NOT NULL,
  hook text NOT NULL,
  summary text NOT NULL,
  score integer NOT NULL DEFAULT 85,
  factors jsonb NOT NULL DEFAULT '{"hookStrength": 85, "standaloneContext": 85, "pacing": 85}'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'generating', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 6. CLIPS (Rendered vertical shorts)
CREATE TABLE IF NOT EXISTS public.clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.clip_candidates(id) ON DELETE SET NULL,
  title text NOT NULL,
  hook text NOT NULL,
  source_title text NOT NULL,
  channel_title text NOT NULL,
  duration text NOT NULL,
  aspect_ratio text NOT NULL DEFAULT '9:16',
  style text NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'rendering', 'draft', 'queued', 'published')),
  thumbnail_bg text NOT NULL DEFAULT 'from-blue-900 to-slate-950',
  captions_sample text[] NOT NULL DEFAULT ARRAY[]::text[],
  hashtags text[] NOT NULL DEFAULT ARRAY[]::text[],
  progress integer DEFAULT 100,
  in_queue boolean NOT NULL DEFAULT false,
  queue_status text DEFAULT 'needs_review' CHECK (queue_status IN ('needs_review', 'approved', 'scheduled', 'exported')),
  scheduled_slot text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 7. JOBS (Background pipeline tasks)
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('discovery', 'moment_detection', 'vertical_render', 'caption_generation')),
  target_title text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

-- ==============================================================================
-- INDEXES FOR FAST COMMON QUERIES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON public.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_settings_workspace ON public.workspace_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_source_videos_workspace ON public.source_videos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_source_videos_status ON public.source_videos(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_clip_candidates_workspace ON public.clip_candidates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_clip_candidates_score ON public.clip_candidates(workspace_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_clips_workspace ON public.clips(workspace_id);
CREATE INDEX IF NOT EXISTS idx_clips_queue ON public.clips(workspace_id, in_queue);
CREATE INDEX IF NOT EXISTS idx_jobs_workspace ON public.jobs(workspace_id, status);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Users can only query & modify data belonging to workspaces they own
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- 1. PROFILES RLS
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 2. WORKSPACES RLS
CREATE POLICY "Users can view own workspaces"
  ON public.workspaces FOR SELECT
  USING (auth.uid() = owner_id OR auth.uid() IS NULL);

CREATE POLICY "Users can insert own workspaces"
  ON public.workspaces FOR INSERT
  WITH CHECK (auth.uid() = owner_id OR auth.uid() IS NULL);

CREATE POLICY "Users can update own workspaces"
  ON public.workspaces FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own workspaces"
  ON public.workspaces FOR DELETE
  USING (auth.uid() = owner_id);

-- 3. WORKSPACE SETTINGS RLS
CREATE POLICY "Users can view own workspace settings"
  ON public.workspace_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = workspace_settings.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own workspace settings"
  ON public.workspace_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = workspace_settings.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own workspace settings"
  ON public.workspace_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = workspace_settings.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own workspace settings"
  ON public.workspace_settings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = workspace_settings.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- 4. SOURCE VIDEOS RLS
CREATE POLICY "Users can view own workspace source videos"
  ON public.source_videos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = source_videos.workspace_id
      AND (workspaces.owner_id = auth.uid() OR auth.uid() IS NULL)
    )
  );

CREATE POLICY "Users can insert source videos in own workspace"
  ON public.source_videos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = source_videos.workspace_id
      AND (workspaces.owner_id = auth.uid() OR auth.uid() IS NULL)
    )
  );

CREATE POLICY "Users can update source videos in own workspace"
  ON public.source_videos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = source_videos.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete source videos in own workspace"
  ON public.source_videos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = source_videos.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- 5. CLIP CANDIDATES RLS
CREATE POLICY "Users can view own clip candidates"
  ON public.clip_candidates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = clip_candidates.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert clip candidates in own workspace"
  ON public.clip_candidates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = clip_candidates.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update clip candidates in own workspace"
  ON public.clip_candidates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = clip_candidates.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete clip candidates in own workspace"
  ON public.clip_candidates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = clip_candidates.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- 6. CLIPS RLS
CREATE POLICY "Users can view own clips"
  ON public.clips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = clips.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert clips in own workspace"
  ON public.clips FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = clips.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update clips in own workspace"
  ON public.clips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = clips.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete clips in own workspace"
  ON public.clips FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = clips.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- 7. JOBS RLS
CREATE POLICY "Users can view own jobs"
  ON public.jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = jobs.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert jobs in own workspace"
  ON public.jobs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = jobs.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update jobs in own workspace"
  ON public.jobs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = jobs.workspace_id
      AND workspaces.owner_id = auth.uid()
    )
  );

-- Helper trigger for auto-creating public.profiles on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger definition
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
