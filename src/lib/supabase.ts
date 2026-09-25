import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  WorkspaceConfig,
  SourceVideo,
  ClipCandidate,
  Clip,
  QueueItem,
} from '../types';

const supabaseUrl =
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  'https://qrmigdcylrbqinaofcqo.supabase.co';

const supabaseKey =
  (typeof process !== 'undefined' && (process.env?.SUPABASE_SERVICE_ROLE_KEY || process.env?.VITE_SUPABASE_PUBLISHABLE_KEY)) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  '';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const DEFAULT_WORKSPACE_ID = 'a0000000-0000-4000-a000-000000000001';

// --- Workspace Repository ---
export const SupabaseWorkspaceRepo = {
  async getWorkspace(workspaceId: string = DEFAULT_WORKSPACE_ID) {
    try {
      const { data: ws, error: wsErr } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .maybeSingle();

      if (wsErr) console.warn('[SupabaseRepo] getWorkspace error:', wsErr.message);

      const { data: settings, error: setErr } = await supabase
        .from('workspace_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (setErr) console.warn('[SupabaseRepo] getWorkspaceSettings error:', setErr.message);

      let config: WorkspaceConfig | null = null;
      if (ws) {
        config = {
          workspaceName: ws.name || 'Apex Media Lab',
          mainNiche: settings?.main_niche || 'Fitness & Strength Training',
          subtopics: Array.isArray(settings?.subtopics) ? settings.subtopics : ['Workout Science', 'Hypertrophy Mechanics'],
          contentLanguage: settings?.content_language || 'English (US)',
          contentStyle: settings?.content_style || 'Kinetic typography with high-contrast highlighted keywords',
          brandName: ws.brand_name || undefined,
          brandingWatermark: settings?.branding_settings?.watermark ?? true,
          aspectRatio: settings?.aspect_ratio || '9:16',
          targetPlatforms: Array.isArray(settings?.target_platforms) ? settings.target_platforms : ['Instagram Reels', 'YouTube Shorts'],
          minCandidateScore: settings?.min_candidate_score || 80,
          targetDuration: settings?.target_duration || '30-60s',
        };
      }

      return { workspace: ws, settings, config };
    } catch (err) {
      console.error('[SupabaseRepo] Unexpected error in getWorkspace:', err);
      return { workspace: null, settings: null, config: null };
    }
  },

  async updateWorkspace(workspaceId: string, updates: Partial<WorkspaceConfig>) {
    try {
      if (updates.workspaceName || updates.brandName !== undefined) {
        await supabase
          .from('workspaces')
          .update({
            name: updates.workspaceName,
            brand_name: updates.brandName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', workspaceId);
      }

      const settingsUpdate: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.mainNiche) settingsUpdate.main_niche = updates.mainNiche;
      if (updates.subtopics) settingsUpdate.subtopics = updates.subtopics;
      if (updates.contentLanguage) settingsUpdate.content_language = updates.contentLanguage;
      if (updates.contentStyle) settingsUpdate.content_style = updates.contentStyle;
      if (updates.aspectRatio) settingsUpdate.aspect_ratio = updates.aspectRatio;
      if (updates.targetPlatforms) settingsUpdate.target_platforms = updates.targetPlatforms;
      if (updates.minCandidateScore !== undefined) settingsUpdate.min_candidate_score = updates.minCandidateScore;
      if (updates.targetDuration) settingsUpdate.target_duration = updates.targetDuration;
      if (updates.brandingWatermark !== undefined) {
        settingsUpdate.branding_settings = {
          watermark: updates.brandingWatermark,
          showCaptions: true,
        };
      }

      await supabase
        .from('workspace_settings')
        .update(settingsUpdate)
        .eq('workspace_id', workspaceId);

      return true;
    } catch (err) {
      console.error('[SupabaseRepo] updateWorkspace error:', err);
      return false;
    }
  },
};

// --- Sources Repository ---
export const SupabaseSourcesRepo = {
  async getSources(workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<SourceVideo[]> {
    try {
      const { data, error } = await supabase
        .from('source_videos')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[SupabaseRepo] getSources error:', error.message);
        return [];
      }

      return (data || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        channelTitle: s.channel_title || 'YouTube Channel',
        duration: s.duration || '00:00',
        viewCount: s.view_count || 0,
        publishedAt: s.published_at || 'Recently',
        youtubeUrl: s.youtube_url || '',
        status: s.status || 'new',
        relevanceScore: s.relevance_score || 80,
        freshnessTag: s.freshness_tag || '',
        candidatesCount: s.candidates_count || 0,
        summary: s.summary || '',
        niche: s.niche || 'General',
        thumbnailGradient: s.thumbnail_gradient || 'from-slate-900 via-indigo-950 to-slate-900',
      }));
    } catch (err) {
      console.error('[SupabaseRepo] getSources failed:', err);
      return [];
    }
  },

  async deleteSource(sourceId: string, workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<boolean> {
    try {
      // 1. Get associated candidates
      const { data: candidates } = await supabase
        .from('clip_candidates')
        .select('id')
        .eq('source_video_id', sourceId)
        .eq('workspace_id', workspaceId);

      const candidateIds = (candidates || []).map((c) => c.id);

      // 2. Delete clips associated with candidates
      if (candidateIds.length > 0) {
        await supabase
          .from('clips')
          .delete()
          .in('candidate_id', candidateIds)
          .eq('workspace_id', workspaceId);
      }

      // 3. Delete candidates
      await supabase
        .from('clip_candidates')
        .delete()
        .eq('source_video_id', sourceId)
        .eq('workspace_id', workspaceId);

      // 4. Delete source video
      const { error } = await supabase
        .from('source_videos')
        .delete()
        .eq('id', sourceId)
        .eq('workspace_id', workspaceId);

      if (error) {
        console.error('[SupabaseRepo] deleteSource error:', error.message);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[SupabaseRepo] deleteSource failed:', err);
      return false;
    }
  },

  async bulkDeleteSources(sourceIds: string[], workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<boolean> {
    if (!sourceIds.length) return true;
    try {
      // 1. Get associated candidates
      const { data: candidates } = await supabase
        .from('clip_candidates')
        .select('id')
        .in('source_video_id', sourceIds)
        .eq('workspace_id', workspaceId);

      const candidateIds = (candidates || []).map((c) => c.id);

      // 2. Delete clips associated
      if (candidateIds.length > 0) {
        await supabase
          .from('clips')
          .delete()
          .in('candidate_id', candidateIds)
          .eq('workspace_id', workspaceId);
      }

      // 3. Delete candidates
      await supabase
        .from('clip_candidates')
        .delete()
        .in('source_video_id', sourceIds)
        .eq('workspace_id', workspaceId);

      // 4. Delete source videos
      const { error } = await supabase
        .from('source_videos')
        .delete()
        .in('id', sourceIds)
        .eq('workspace_id', workspaceId);

      if (error) {
        console.error('[SupabaseRepo] bulkDeleteSources error:', error.message);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[SupabaseRepo] bulkDeleteSources failed:', err);
      return false;
    }
  },
};

// --- Candidates Repository ---
export const SupabaseCandidatesRepo = {
  async getCandidates(workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<ClipCandidate[]> {
    try {
      const { data, error } = await supabase
        .from('clip_candidates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('score', { ascending: false });

      if (error) {
        console.error('[SupabaseRepo] getCandidates error:', error.message);
        return [];
      }

      return (data || []).map((c: any) => ({
        id: c.id,
        workspaceId: c.workspace_id,
        sourceVideoId: c.source_video_id,
        sourceTitle: c.source_title,
        channelTitle: c.channel_title,
        startTime: c.start_time,
        endTime: c.end_time,
        duration: c.duration,
        hook: c.hook,
        summary: c.summary,
        score: c.score,
        factors: typeof c.factors === 'object' && c.factors ? c.factors : {},
        status: c.status || 'new',
        createdAt: c.created_at,
      }));
    } catch (err) {
      console.error('[SupabaseRepo] getCandidates failed:', err);
      return [];
    }
  },

  async updateCandidateStatus(candidateId: string, status: string, workspaceId: string = DEFAULT_WORKSPACE_ID) {
    try {
      const { error } = await supabase
        .from('clip_candidates')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', candidateId)
        .eq('workspace_id', workspaceId);

      if (error) console.error('[SupabaseRepo] updateCandidateStatus error:', error.message);
      return !error;
    } catch (err) {
      console.error('[SupabaseRepo] updateCandidateStatus failed:', err);
      return false;
    }
  },

  async deleteCandidate(candidateId: string, workspaceId: string = DEFAULT_WORKSPACE_ID) {
    try {
      // Clean up clips generated from this candidate
      await supabase
        .from('clips')
        .delete()
        .eq('candidate_id', candidateId)
        .eq('workspace_id', workspaceId);

      const { error } = await supabase
        .from('clip_candidates')
        .delete()
        .eq('id', candidateId)
        .eq('workspace_id', workspaceId);

      if (error) console.error('[SupabaseRepo] deleteCandidate error:', error.message);
      return !error;
    } catch (err) {
      console.error('[SupabaseRepo] deleteCandidate failed:', err);
      return false;
    }
  },
};

// --- Clips Repository ---
export const SupabaseClipsRepo = {
  async getClips(workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<Clip[]> {
    try {
      const { data, error } = await supabase
        .from('clips')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[SupabaseRepo] getClips error:', error.message);
        return [];
      }

      return (data || []).map((c: any) => ({
        id: c.id,
        candidateId: c.candidate_id,
        workspaceId: c.workspace_id,
        title: c.title,
        hook: c.hook,
        sourceTitle: c.source_title,
        channelTitle: c.channel_title,
        duration: c.duration,
        aspectRatio: c.aspect_ratio || '9:16',
        style: c.style || 'clean_mobile',
        status: c.status || 'ready',
        thumbnailBg: c.thumbnail_bg,
        thumbnailUrl: c.thumbnail_bg,
        captionsSample: Array.isArray(c.captions_sample) ? c.captions_sample : [],
        hashtags: Array.isArray(c.hashtags) ? c.hashtags : [],
        progress: c.progress ?? 100,
        inQueue: Boolean(c.in_queue),
        queueStatus: c.queue_status || 'needs_review',
        scheduledSlot: c.scheduled_slot,
        videoUrl: c.video_url || '',
        createdAt: c.created_at,
      }));
    } catch (err) {
      console.error('[SupabaseRepo] getClips failed:', err);
      return [];
    }
  },

  async deleteClip(clipId: string, workspaceId: string = DEFAULT_WORKSPACE_ID) {
    try {
      const { error } = await supabase
        .from('clips')
        .delete()
        .eq('id', clipId)
        .eq('workspace_id', workspaceId);

      if (error) console.error('[SupabaseRepo] deleteClip error:', error.message);
      return !error;
    } catch (err) {
      console.error('[SupabaseRepo] deleteClip failed:', err);
      return false;
    }
  },

  async setClipInQueue(clipId: string, inQueue: boolean, queueStatus: string = 'needs_review', workspaceId: string = DEFAULT_WORKSPACE_ID) {
    try {
      const { error } = await supabase
        .from('clips')
        .update({
          in_queue: inQueue,
          queue_status: queueStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clipId)
        .eq('workspace_id', workspaceId);

      if (error) console.error('[SupabaseRepo] setClipInQueue error:', error.message);
      return !error;
    } catch (err) {
      console.error('[SupabaseRepo] setClipInQueue failed:', err);
      return false;
    }
  },

  async updateQueueItem(clipId: string, updates: Partial<{ queueStatus: string; scheduledSlot: string }>, workspaceId: string = DEFAULT_WORKSPACE_ID) {
    try {
      const dbUpdates: any = { updated_at: new Date().toISOString() };
      if (updates.queueStatus) dbUpdates.queue_status = updates.queueStatus;
      if (updates.scheduledSlot !== undefined) dbUpdates.scheduled_slot = updates.scheduledSlot;

      const { error } = await supabase
        .from('clips')
        .update(dbUpdates)
        .eq('id', clipId)
        .eq('workspace_id', workspaceId);

      if (error) console.error('[SupabaseRepo] updateQueueItem error:', error.message);
      return !error;
    } catch (err) {
      console.error('[SupabaseRepo] updateQueueItem failed:', err);
      return false;
    }
  },
};
