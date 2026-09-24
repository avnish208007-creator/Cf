-- Migration: Enhance jobs table to support detailed async render fields
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS candidate_id uuid REFERENCES public.clip_candidates(id) ON DELETE SET NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Ensure indexes exist for common render queries
CREATE INDEX IF NOT EXISTS idx_jobs_candidate_id ON public.jobs(candidate_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at);
