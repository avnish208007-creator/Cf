-- Migration: Add video_url to public.clips and update scheduled_slot to remain as scheduling data
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS video_url text;

-- Optional: Copy existing video URLs from scheduled_slot to video_url to preserve existing data without destruction
UPDATE public.clips 
SET video_url = scheduled_slot 
WHERE video_url IS NULL 
  AND scheduled_slot IS NOT NULL 
  AND (scheduled_slot LIKE 'http%' OR scheduled_slot LIKE '/%');

-- Optional: Clear the scheduling slot if it only contained the video URL
UPDATE public.clips 
SET scheduled_slot = NULL 
WHERE scheduled_slot = video_url;
