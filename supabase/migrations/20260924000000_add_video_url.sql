-- Migration: Add video_url column to public.clips and safely migrate legacy video URLs stored in scheduled_slot
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS video_url text;

-- Safely migrate legacy values from scheduled_slot to video_url if video_url is null
UPDATE public.clips 
SET video_url = scheduled_slot 
WHERE video_url IS NULL 
  AND scheduled_slot IS NOT NULL 
  AND (scheduled_slot LIKE 'http%' OR scheduled_slot LIKE '/%');

-- Clear scheduled_slot ONLY where it was being misused to store the video URL
UPDATE public.clips 
SET scheduled_slot = NULL 
WHERE scheduled_slot = video_url;
