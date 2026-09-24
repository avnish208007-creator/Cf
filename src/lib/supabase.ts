import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import {
  WorkspaceConfig,
  SourceVideo,
  ClipCandidate,
  Clip,
  ActiveJob,
  QueueItem,
} from '../types';

// Safely access environment variables in both Vite and Node.js environments
const getEnvVar = (name: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta?.env && import.meta.env[name]) {
    return String(import.meta.env[name]);
  }
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return String(process.env[name]);
  }
  return '';
};

const envUrl = getEnvVar('VITE_SUPABASE_URL').trim();
const envKey = (
  getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  getEnvVar('VITE_SUPABASE_ANON_KEY') ||
  getEnvVar('SUPABASE_SERVICE_ROLE_KEY')
).trim();

// Check if valid credentials are provided (not default placeholder)
export const isSupabaseConfigured = Boolean(
  envUrl &&
    envKey &&
    envUrl.startsWith('http') &&
    !envUrl.includes('your-project.supabase.co') &&
    !envKey.includes('your-anon-publishable-key')
);

// Fallback dummy URL and key to prevent instantiation crash if not yet configured
const safeUrl = isSupabaseConfigured ? envUrl : 'https://placeholder.supabase.co';
const safeKey = isSupabaseConfigured ? envKey : 'placeholder-anon-key';

export const supabase: SupabaseClient = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Database record interfaces matching V1 schema
export interface DbWorkspace {
  id: string;
  owner_id: string;
  name: string;
  brand_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbWorkspaceSettings {
  id: string;
  workspace_id: string;
  main_niche: string;
  subtopics: string[];
  content_language: string;
  content_style: string;
  aspect_ratio: string;
  target_platforms: string[];
  min_candidate_score: number;
  target_duration: string;
  branding_settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DbSourceVideo {
  id: string;
  workspace_id: string;
  title: string;
  channel_title: string;
  duration: string;
  view_count: number;
  published_at: string;
  youtube_url: string;
  status: 'new' | 'queued' | 'processing' | 'analyzed';
  relevance_score: number | null;
  freshness_tag: string | null;
  candidates_count: number;
  summary: string;
  niche: string;
  thumbnail_gradient: string;
  media_status?: 'unavailable' | 'available' | 'processing' | 'failed' | null;
  media_provider?: string | null;
  media_reference?: string | null;
  media_path?: string | null;
  media_url?: string | null;
  media_error?: string | null;
  media_updated_at?: string | null;
  created_at: string;
}

export interface DbClipCandidate {
  id: string;
  workspace_id: string;
  source_video_id: string | null;
  source_title: string;
  channel_title: string;
  start_time: string;
  end_time: string;
  duration: string;
  hook: string;
  summary: string;
  score: number;
  factors: Record<string, any>;
  status: 'new' | 'in_review' | 'generating' | 'approved' | 'rejected' | 'selected' | 'detected' | 'rendered';
  created_at: string;
}

export interface DbClip {
  id: string;
  workspace_id: string;
  candidate_id: string | null;
  title: string;
  hook: string;
  source_title: string;
  channel_title: string;
  duration: string;
  aspect_ratio: '9:16';
  style: string;
  status: 'ready' | 'rendering' | 'draft' | 'queued' | 'published';
  thumbnail_bg: string;
  captions_sample: string[];
  hashtags: string[];
  progress: number;
  in_queue: boolean;
  queue_status: 'needs_review' | 'approved' | 'scheduled' | 'exported';
  scheduled_slot: string | null;
  created_at: string;
}

export interface DbJob {
  id: string;
  workspace_id: string;
  type: 'discovery' | 'moment_detection' | 'vertical_render' | 'caption_generation';
  target_title: string;
  progress: number;
  stage: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at: string | null;
}

// ============================================================================
// SUPABASE REPOSITORY SERVICES
// ============================================================================

export const SupabaseWorkspaceRepo = {
  /**
   * Fetch the workspace and settings for a user
   */
  async getWorkspaceForUser(userId: string): Promise<{
    workspace: DbWorkspace | null;
    settings: DbWorkspaceSettings | null;
  }> {
    if (!isSupabaseConfigured) return { workspace: null, settings: null };

    try {
      const { data: workspaces, error: wsError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (wsError || !workspaces || workspaces.length === 0) {
        return { workspace: null, settings: null };
      }

      const ws = workspaces[0] as DbWorkspace;

      const { data: settingsData, error: setError } = await supabase
        .from('workspace_settings')
        .select('*')
        .eq('workspace_id', ws.id)
        .maybeSingle();

      if (setError) {
        console.warn('Error fetching workspace settings:', setError);
      }

      return {
        workspace: ws,
        settings: (settingsData as DbWorkspaceSettings) || null,
      };
    } catch (err) {
      console.error('getWorkspaceForUser error:', err);
      return { workspace: null, settings: null };
    }
  },

  /**
   * Create a workspace and its corresponding settings
   */
  async createWorkspace(
    userId: string,
    config: WorkspaceConfig
  ): Promise<{ workspaceId: string } | null> {
    if (!isSupabaseConfigured) return null;

    try {
      // 1. Insert Workspace
      const { data: wsData, error: wsError } = await supabase
        .from('workspaces')
        .insert({
          owner_id: userId,
          name: config.workspaceName || 'My Workspace',
          brand_name: config.brandName || null,
        })
        .select('id')
        .single();

      if (wsError || !wsData) {
        console.error('Error inserting workspace:', wsError);
        return null;
      }

      const workspaceId = wsData.id;

      // 2. Insert Settings
      const { error: setError } = await supabase.from('workspace_settings').insert({
        workspace_id: workspaceId,
        main_niche: config.mainNiche,
        subtopics: config.subtopics,
        content_language: config.contentLanguage,
        content_style: config.contentStyle,
        aspect_ratio: config.aspectRatio || '9:16',
        target_platforms: config.targetPlatforms,
        min_candidate_score: config.minCandidateScore,
        target_duration: config.targetDuration,
        branding_settings: {
          brandName: config.brandName || '',
          aspectRatio: config.aspectRatio,
        },
      });

      if (setError) {
        console.error('Error inserting workspace settings:', setError);
      }

      return { workspaceId };
    } catch (err) {
      console.error('createWorkspace error:', err);
      return null;
    }
  },

  /**
   * Fetch workspace and settings by workspaceId
   */
  async getWorkspaceById(workspaceId: string): Promise<{
    workspace: DbWorkspace | null;
    settings: DbWorkspaceSettings | null;
  }> {
    if (!isSupabaseConfigured || !workspaceId) return { workspace: null, settings: null };

    try {
      const { data: ws, error: wsError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .maybeSingle();

      if (wsError || !ws) {
        return { workspace: null, settings: null };
      }

      const { data: settingsData, error: setError } = await supabase
        .from('workspace_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (setError) {
        console.warn('Error fetching workspace settings by id:', setError);
      }

      return {
        workspace: ws as DbWorkspace,
        settings: (settingsData as DbWorkspaceSettings) || null,
      };
    } catch (err) {
      console.error('getWorkspaceById error:', err);
      return { workspace: null, settings: null };
    }
  },

  /**
   * Update workspace & settings
   */
  async updateWorkspace(
    workspaceId: string,
    partial: Partial<WorkspaceConfig>
  ): Promise<boolean> {
    if (!isSupabaseConfigured) return false;

    try {
      if (partial.workspaceName || partial.brandName !== undefined) {
        await supabase
          .from('workspaces')
          .update({
            ...(partial.workspaceName ? { name: partial.workspaceName } : {}),
            ...(partial.brandName !== undefined ? { brand_name: partial.brandName } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', workspaceId);
      }

      const settingsUpdate: Record<string, any> = {
        workspace_id: workspaceId,
        updated_at: new Date().toISOString(),
      };
      if (partial.mainNiche) settingsUpdate.main_niche = partial.mainNiche;
      if (partial.subtopics) settingsUpdate.subtopics = partial.subtopics;
      if (partial.contentLanguage) settingsUpdate.content_language = partial.contentLanguage;
      if (partial.contentStyle) settingsUpdate.content_style = partial.contentStyle;
      if (partial.aspectRatio) settingsUpdate.aspect_ratio = partial.aspectRatio;
      if (partial.targetPlatforms) settingsUpdate.target_platforms = partial.targetPlatforms;
      if (partial.minCandidateScore !== undefined)
        settingsUpdate.min_candidate_score = partial.minCandidateScore;
      if (partial.targetDuration) settingsUpdate.target_duration = partial.targetDuration;

      const { error } = await supabase
        .from('workspace_settings')
        .upsert(settingsUpdate, { onConflict: 'workspace_id' });

      return !error;
    } catch (err) {
      console.error('updateWorkspace error:', err);
      return false;
    }
  },
};

export const SupabaseContentRepo = {
  // --- Sources ---
  async getSources(workspaceId: string): Promise<SourceVideo[]> {
    const targetWsId = (workspaceId || '').trim();
    if (!targetWsId) return [];

    let rawData: any[] = [];
    let queryError: any = null;

    // 1. First attempt: Direct Supabase client query
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('source_videos')
          .select('*')
          .eq('workspace_id', targetWsId)
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('[SupabaseContentRepo] Direct client query error:', error.message);
          queryError = error;
        } else if (data && data.length > 0) {
          rawData = data;
        }
      } catch (err: any) {
        console.warn('[SupabaseContentRepo] Direct client query exception:', err);
        queryError = err;
      }
    }

    // 2. Resilient API route fallback (/api/sources or /.netlify/functions/sources)
    if (rawData.length === 0) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resp = await fetch(`/api/sources?workspaceId=${encodeURIComponent(targetWsId)}`, { headers });
        if (resp.ok) {
          const json = await resp.json();
          if (json.success && Array.isArray(json.sources)) {
            rawData = json.sources;
            queryError = null;
          }
        } else {
          const netlifyResp = await fetch(`/.netlify/functions/sources?workspaceId=${encodeURIComponent(targetWsId)}`, { headers });
          if (netlifyResp.ok) {
            const json = await netlifyResp.json();
            if (json.success && Array.isArray(json.sources)) {
              rawData = json.sources;
              queryError = null;
            }
          }
        }
      } catch (proxyErr) {
        console.warn('[SupabaseContentRepo] API proxy fetch error:', proxyErr);
      }
    }

    if (queryError && rawData.length === 0) {
      throw new Error(`Failed to load source videos from Supabase: ${queryError.message || queryError}`);
    }

    return rawData.map((d: DbSourceVideo) => {
      // Decode structured meta if saved via [CLIPFLOW_META:...]
      let meta: any = null;
      if (d.summary && d.summary.startsWith('[CLIPFLOW_META:')) {
        try {
          const endIdx = d.summary.indexOf(']');
          if (endIdx > 15) {
            meta = JSON.parse(d.summary.slice(15, endIdx));
          }
        } catch {
          // ignore parsing error
        }
      }

      const scoreMatch = d.summary?.match(/Scores: Rel (\d+)% · Eng (\d+)% · Short-Form (\d+)% · Quality (\d+)%/);
      const relScore = meta?.rel ?? (scoreMatch ? Number(scoreMatch[1]) : (d.relevance_score ?? 88));
      const engScore = meta?.eng ?? (scoreMatch ? Number(scoreMatch[2]) : 85);
      const sfScore = meta?.sf ?? (scoreMatch ? Number(scoreMatch[3]) : 80);
      const qualScore = meta?.qual ?? (scoreMatch ? Number(scoreMatch[4]) : 80);
      const overall = meta?.overall ?? (d.relevance_score ?? Math.round(relScore * 0.3 + engScore * 0.3 + sfScore * 0.25 + qualScore * 0.15));

      let explanation = meta?.exp || meta?.rationale;
      if (!explanation && d.summary?.includes('(Scores:')) {
        explanation = d.summary.split('(Scores:')[0].replace(/^\[CLIPFLOW_META:[^\]]+\]\s*/, '').trim();
      }

      let description = meta?.desc;
      if (!description && d.summary?.includes(') — ')) {
        description = d.summary.split(') — ')[1].trim();
      } else if (!description) {
        description = d.summary?.replace(/^\[CLIPFLOW_META:[^\]]+\]\s*/, '');
      }

      const isDev =
        meta?.isDev ??
        (d.youtube_url?.startsWith('dev://') ||
          d.youtube_url?.includes('test-source') ||
          d.youtube_url?.includes('dev_fit_') ||
          d.youtube_url?.includes('dev_tech_'));

      return {
        id: d.id,
        title: d.title,
        description,
        channelTitle: d.channel_title,
        duration: d.duration,
        viewCount: Number(d.view_count),
        publishedAt: d.published_at,
        youtubeUrl: d.youtube_url,
        status: d.status,
        relevanceScore: relScore,
        contentQualityScore: qualScore,
        engagementScore: engScore,
        shortFormScore: sfScore,
        overallScore: overall,
        scoreExplanation: explanation,
        freshnessTag: d.freshness_tag ?? undefined,
        candidatesCount: d.candidates_count,
        summary: description || d.summary,
        niche: d.niche,
        thumbnailGradient: d.thumbnail_gradient,
        mediaStatus: (d.media_status as any) || 'unavailable',
        mediaProvider: d.media_provider ?? undefined,
        mediaReference: d.media_reference ?? undefined,
        mediaPath: d.media_path ?? undefined,
        mediaUrl: d.media_url ?? undefined,
        mediaError: d.media_error ?? undefined,
        mediaUpdatedAt: d.media_updated_at ?? undefined,
        isDevelopmentSource: isDev,
        isSyntheticData: isDev,
      };
    });
  },

  async insertSource(workspaceId: string, src: Omit<SourceVideo, 'id'>): Promise<string | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabase
        .from('source_videos')
        .insert({
          workspace_id: workspaceId,
          title: src.title,
          channel_title: src.channelTitle,
          duration: src.duration,
          view_count: src.viewCount,
          published_at: src.publishedAt,
          youtube_url: src.youtubeUrl,
          status: src.status,
          relevance_score: src.relevanceScore ?? 90,
          freshness_tag: src.freshnessTag ?? null,
          candidates_count: src.candidatesCount,
          summary: src.summary,
          niche: src.niche,
          thumbnail_gradient: src.thumbnailGradient,
          media_status: src.mediaStatus || 'unavailable',
          media_provider: src.mediaProvider || null,
          media_reference: src.mediaReference || null,
          media_path: src.mediaPath || null,
          media_url: src.mediaUrl || null,
          media_error: src.mediaError || null,
        })
        .select('id')
        .single();

      if (error || !data) return null;
      return data.id;
    } catch (err) {
      console.error('insertSource error:', err);
      return null;
    }
  },

  async updateSource(sourceId: string, updates: Partial<SourceVideo>): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.candidatesCount !== undefined) dbUpdates.candidates_count = updates.candidatesCount;
      if (updates.summary) dbUpdates.summary = updates.summary;
      if (updates.mediaStatus) dbUpdates.media_status = updates.mediaStatus;
      if (updates.mediaProvider) dbUpdates.media_provider = updates.mediaProvider;
      if (updates.mediaReference) dbUpdates.media_reference = updates.mediaReference;
      if (updates.mediaPath) dbUpdates.media_path = updates.mediaPath;
      if (updates.mediaUrl) dbUpdates.media_url = updates.mediaUrl;
      if (updates.mediaError) dbUpdates.media_error = updates.mediaError;
      if (updates.mediaUpdatedAt) dbUpdates.media_updated_at = updates.mediaUpdatedAt;

      const { error } = await supabase
        .from('source_videos')
        .update(dbUpdates)
        .eq('id', sourceId);

      return !error;
    } catch (err) {
      console.error('updateSource error:', err);
      return false;
    }
  },

  async updateSourceMedia(
    sourceId: string,
    mediaStatus: 'unavailable' | 'available' | 'processing' | 'failed',
    mediaPath?: string,
    mediaUrl?: string,
    mediaProvider?: string,
    mediaReference?: string,
    mediaError?: string
  ): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const dbUpdates: Record<string, any> = {
        media_status: mediaStatus,
        media_updated_at: new Date().toISOString(),
      };
      if (mediaPath !== undefined) dbUpdates.media_path = mediaPath;
      if (mediaUrl !== undefined) dbUpdates.media_url = mediaUrl;
      if (mediaProvider !== undefined) dbUpdates.media_provider = mediaProvider;
      if (mediaReference !== undefined) dbUpdates.media_reference = mediaReference;
      if (mediaError !== undefined) dbUpdates.media_error = mediaError;

      const { error } = await supabase
        .from('source_videos')
        .update(dbUpdates)
        .eq('id', sourceId);

      return !error;
    } catch (err) {
      console.error('updateSourceMedia error:', err);
      return false;
    }
  },

  // --- Candidates ---
  async getCandidates(workspaceId: string): Promise<ClipCandidate[]> {
    if (!isSupabaseConfigured) return [];
    try {
      // 1. Fetch sources for this workspace to create a fast lookup and get all source IDs
      const { data: sourcesData, error: sourcesError } = await supabase
        .from('source_videos')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (sourcesError) {
        console.warn(`[SupabaseContentRepo] Warning fetching source_videos for workspace ${workspaceId}:`, sourcesError.message);
      }

      const sourceMap = new Map<string, DbSourceVideo>();
      const sourceIds: string[] = [];
      if (sourcesData) {
        for (const s of sourcesData) {
          sourceMap.set(s.id, s);
          sourceIds.push(s.id);
        }
      }

      // 2. Fetch candidates matching this workspace_id directly
      const { data, error } = await supabase
        .from('clip_candidates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('score', { ascending: false });

      if (error) {
        console.error(`[Candidates] Supabase error for workspace ${workspaceId}:`, error);
        throw new Error(error.message || 'Failed to query clip_candidates table');
      }

      let candidateRows: DbClipCandidate[] = data || [];

      // 2b. If direct query returned 0 rows (e.g. unauthenticated client or RLS constraint), query server proxy
      if (candidateRows.length === 0) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          const headers: Record<string, string> = { Accept: 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const resp = await fetch(`/api/candidates?workspaceId=${encodeURIComponent(workspaceId)}`, { headers });
          if (resp.ok) {
            const json = await resp.json();
            if (json.success && Array.isArray(json.candidates)) {
              candidateRows = json.candidates;
              if (Array.isArray(json.sources)) {
                for (const s of json.sources) {
                  sourceMap.set(s.id, s);
                }
              }
            }
          }
        } catch (apiErr) {
          console.warn('[SupabaseContentRepo] /api/candidates query fallback warning:', apiErr);
        }
      }

      const seenCandidateIds = new Set(candidateRows.map((r) => r.id));

      // 3. Also check if any candidates were linked through source_videos.workspace_id
      if (sourceIds.length > 0) {
        try {
          const { data: linkedData, error: linkError } = await supabase
            .from('clip_candidates')
            .select('*')
            .in('source_video_id', sourceIds)
            .order('score', { ascending: false });

          if (linkError) {
            console.warn('[Candidates] Warning on linked source_video_id lookup:', linkError.message);
          } else if (linkedData) {
            for (const r of linkedData) {
              if (!seenCandidateIds.has(r.id)) {
                candidateRows.push(r);
                seenCandidateIds.add(r.id);
              }
            }
          }
        } catch (linkErr) {
          console.warn('[SupabaseContentRepo] Non-blocking source_video_id lookup warning:', linkErr);
        }
      }

      // Re-sort all candidate rows by score DESC
      candidateRows.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

      // Log the exact raw Supabase result as required
      console.log(`[Candidates] workspace: ${workspaceId}`);
      console.log(`[Candidates] raw rows: ${candidateRows.length}`);
      console.log(`[Candidates] candidate IDs:`, candidateRows.map((r) => r.id));
      console.log(`[Candidates] statuses:`, candidateRows.map((r) => r.status));
      console.log(
        `[Candidates] selection statuses:`,
        candidateRows.map((r) => (r.factors as any)?.selectionStatus || (r as any).selection_status || 'none')
      );
      console.log(`[Candidates] source_video_id values:`, candidateRows.map((r) => r.source_video_id));

      return candidateRows.map((c: DbClipCandidate) => {
        const factors = (c.factors || {}) as any;
        const score = Number(c.score) || 0;
        const parentSource = c.source_video_id ? sourceMap.get(c.source_video_id) : undefined;

        let qualityTier: 'Excellent' | 'Strong' | 'Potential' | 'Weak' =
          factors.qualityTier ||
          (score >= 90 ? 'Excellent' : score >= 75 ? 'Strong' : score >= 60 ? 'Potential' : 'Weak');

        // Extract youtube ID if present to provide real thumbnail
        const youtubeUrl = parentSource?.youtube_url || factors.sourceYoutubeUrl || '';
        let sourceThumbnailUrl = factors.sourceThumbnailUrl || undefined;
        if (!sourceThumbnailUrl && youtubeUrl) {
          const match = youtubeUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
          if (match && match[1]) {
            sourceThumbnailUrl = `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
          }
        }

        const rank = factors.rank || 1;
        const rawStatus = (c.status || 'new').toLowerCase();
        const selectionStatus: 'selected' | 'candidate' | 'rejected' =
          factors.selectionStatus ||
          (rawStatus === 'selected' || rawStatus === 'approved' || rawStatus === 'rendered' || score >= 75
            ? 'selected'
            : rawStatus === 'rejected' || score < 60
            ? 'rejected'
            : 'candidate');

        const selectionReason =
          factors.selectionReason ||
          factors.scoreReason ||
          factors.explanation ||
          (selectionStatus === 'selected'
            ? `Selected (#${rank}) for high-hook engagement and concise standalone retention.`
            : selectionStatus === 'candidate'
            ? 'Potential candidate: Meets criteria for short-form review.'
            : 'Downranked: Lower standalone clarity or introductory filler.');

        return {
          id: c.id,
          workspaceId: c.workspace_id || workspaceId,
          sourceVideoId: c.source_video_id || parentSource?.id || '',
          sourceTitle: parentSource?.title || c.source_title || 'Discovered Source',
          channelTitle: parentSource?.channel_title || c.channel_title || 'Creator Channel',
          startTime: c.start_time || '00:00',
          endTime: c.end_time || '00:30',
          duration: c.duration || '00:30',
          estimatedDuration: c.duration || '00:30',
          hook: c.hook || c.summary || 'Insight moment',
          summary: c.summary || `${c.hook}`,
          score,
          qualityTier,
          factors: {
            ...factors,
            qualityTier,
            rank,
            selectionStatus,
            selectionReason,
          },
          rank,
          selectionStatus,
          selectionReason,
          explanation: factors.scoreReason || factors.explanation || selectionReason,
          scoreReason: factors.scoreReason || factors.explanation || selectionReason,
          transcriptText: factors.transcriptText || c.hook || '',
          payoff: factors.payoff || undefined,
          contextSummary: factors.contextSummary || undefined,
          sourceThumbnailUrl,
          sourceYoutubeUrl: youtubeUrl || undefined,
          mediaStatus: parentSource?.media_status || undefined,
          mediaUrl: parentSource?.media_url || undefined,
          mediaPath: parentSource?.media_path || undefined,
          status: c.status,
          createdAt: c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Recent',
        };
      });
    } catch (err: any) {
      console.error('[SupabaseContentRepo] getCandidates error:', err);
      throw err;
    }
  },

  async insertCandidate(workspaceId: string, cand: Omit<ClipCandidate, 'id'>): Promise<string | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabase
        .from('clip_candidates')
        .insert({
          workspace_id: workspaceId,
          source_video_id: cand.sourceVideoId || null,
          source_title: cand.sourceTitle,
          channel_title: cand.channelTitle,
          start_time: cand.startTime,
          end_time: cand.endTime,
          duration: cand.duration,
          hook: cand.hook,
          summary: cand.summary,
          score: cand.score,
          factors: cand.factors,
          status: cand.status,
        })
        .select('id')
        .single();

      if (error || !data) return null;
      return data.id;
    } catch (err) {
      console.error('insertCandidate error:', err);
      return null;
    }
  },

  async updateCandidateStatus(
    candidateId: string,
    status: ClipCandidate['status']
  ): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const dbStatus: 'new' | 'in_review' | 'generating' | 'approved' | 'rejected' =
        status === 'selected' || status === 'approved'
          ? 'approved'
          : status === 'rejected'
          ? 'rejected'
          : status === 'generating'
          ? 'generating'
          : status === 'in_review'
          ? 'in_review'
          : 'new';

      const { error } = await supabase
        .from('clip_candidates')
        .update({ status: dbStatus })
        .eq('id', candidateId);
      return !error;
    } catch (err) {
      console.error('updateCandidateStatus error:', err);
      return false;
    }
  },

  // --- Clips ---
  async getClips(workspaceId: string): Promise<Clip[]> {
    let rawClips: DbClip[] = [];

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          rawClips = data;
        }
      } catch (err) {
        console.warn('[SupabaseContentRepo] Direct client getClips error:', err);
      }
    }

    // Resilient API route fallback
    if (rawClips.length === 0) {
      try {
        const { data: sessionData } = isSupabaseConfigured ? await supabase.auth.getSession() : { data: null };
        const token = sessionData?.session?.access_token;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resp = await fetch(`/api/clips?workspaceId=${encodeURIComponent(workspaceId)}`, { headers });
        if (resp.ok) {
          const json = await resp.json();
          if (json.success && Array.isArray(json.clips)) {
            rawClips = json.clips;
          }
        }
      } catch (proxyErr) {
        console.warn('[SupabaseContentRepo] /api/clips query fallback warning:', proxyErr);
      }
    }

    return rawClips.map((cl: DbClip) => {
      const rawThumb = cl.thumbnail_bg || (cl as any).thumbnail_url;
      // Map straightforwardly to video_url, utilizing backward-compatible fallback only if video_url column doesn't exist on the db record yet
      const rawVideo = ('video_url' in cl) ? (cl as any).video_url : cl.scheduled_slot;

      const isThumbUrl = rawThumb && typeof rawThumb === 'string' && (rawThumb.startsWith('/') || rawThumb.startsWith('http'));
      const isVideoUrl = rawVideo && typeof rawVideo === 'string' && (rawVideo.startsWith('/') || rawVideo.startsWith('http'));

      return {
        id: cl.id,
        candidateId: cl.candidate_id || '',
        workspaceId: cl.workspace_id,
        title: cl.title,
        hook: cl.hook,
        sourceTitle: cl.source_title,
        channelTitle: cl.channel_title,
        duration: cl.duration,
        aspectRatio: cl.aspect_ratio,
        style: cl.style,
        status: cl.status,
        thumbnailBg: rawThumb,
        thumbnailUrl: isThumbUrl ? rawThumb : undefined,
        videoUrl: isVideoUrl ? rawVideo : undefined,
        captionsSample: cl.captions_sample,
        hashtags: cl.hashtags,
        createdAt: new Date(cl.created_at).toLocaleDateString(),
        progress: cl.progress,
      };
    });
  },

  async insertClip(workspaceId: string, clip: Omit<Clip, 'id'> & { inQueue?: boolean }): Promise<string | null> {
    if (!isSupabaseConfigured) return null;
    try {
      // Robustly check if database has video_url column
      let hasVideoUrl = false;
      try {
        const { error: testErr } = await supabase.from('clips').select('video_url').limit(1);
        hasVideoUrl = !testErr || testErr.code !== '42703';
      } catch (_) {
        hasVideoUrl = false;
      }

      const insertPayload: Record<string, any> = {
        workspace_id: workspaceId,
        candidate_id: clip.candidateId || null,
        title: clip.title,
        hook: clip.hook,
        source_title: clip.sourceTitle,
        channel_title: clip.channelTitle,
        duration: clip.duration,
        aspect_ratio: clip.aspectRatio,
        style: clip.style,
        status: clip.status,
        thumbnail_bg: clip.thumbnailUrl || clip.thumbnailBg,
        captions_sample: clip.captionsSample,
        hashtags: clip.hashtags,
        progress: clip.progress ?? 100,
        in_queue: clip.inQueue ?? false,
        queue_status: 'needs_review',
      };

      if (hasVideoUrl) {
        insertPayload.video_url = clip.videoUrl || null;
        insertPayload.scheduled_slot = null;
      } else {
        insertPayload.scheduled_slot = clip.videoUrl || null;
      }

      const { data, error } = await supabase
        .from('clips')
        .insert(insertPayload)
        .select('id')
        .single();

      if (error || !data) return null;
      return data.id;
    } catch (err) {
      console.error('insertClip error:', err);
      return null;
    }
  },

  async updateClip(clipId: string, updates: Partial<Clip>): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.hashtags) dbUpdates.hashtags = updates.hashtags;
      if (updates.captionsSample) dbUpdates.captions_sample = updates.captionsSample;

      const { error } = await supabase.from('clips').update(dbUpdates).eq('id', clipId);
      return !error;
    } catch (err) {
      console.error('updateClip error:', err);
      return false;
    }
  },

  async deleteClip(clipId: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const { error } = await supabase.from('clips').delete().eq('id', clipId);
      return !error;
    } catch (err) {
      console.error('deleteClip error:', err);
      return false;
    }
  },

  // --- Queue Items (derived from clips with in_queue = true) ---
  async getQueue(workspaceId: string): Promise<QueueItem[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('clips')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('in_queue', true)
        .order('created_at', { ascending: false });

      if (error || !data) return [];
      return data.map((cl: DbClip) => ({
        id: `q_${cl.id}`,
        clipId: cl.id,
        title: cl.title,
        hook: cl.hook,
        duration: cl.duration,
        platforms: ['Instagram Reels', 'YouTube Shorts'],
        captionText: cl.captions_sample.join(' '),
        hashtags: cl.hashtags,
        status: cl.queue_status || 'needs_review',
        scheduledSlot: cl.scheduled_slot || undefined,
        addedAt: new Date(cl.created_at).toLocaleDateString(),
        style: cl.style,
      }));
    } catch (err) {
      console.error('getQueue error:', err);
      return [];
    }
  },

  async setClipInQueue(clipId: string, inQueue: boolean, queueStatus = 'needs_review'): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const { error } = await supabase
        .from('clips')
        .update({
          in_queue: inQueue,
          queue_status: queueStatus,
        })
        .eq('id', clipId);
      return !error;
    } catch (err) {
      console.error('setClipInQueue error:', err);
      return false;
    }
  },

  async updateQueueItem(
    clipId: string,
    updates: { status?: QueueItem['status']; scheduledSlot?: string }
  ): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.status) dbUpdates.queue_status = updates.status;
      if (updates.scheduledSlot !== undefined) dbUpdates.scheduled_slot = updates.scheduledSlot;

      const { error } = await supabase.from('clips').update(dbUpdates).eq('id', clipId);
      return !error;
    } catch (err) {
      console.error('updateQueueItem error:', err);
      return false;
    }
  },

  // --- Jobs ---
  async getJobs(workspaceId: string): Promise<ActiveJob[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('status', 'running')
        .order('started_at', { ascending: false });

      if (error || !data) return [];
      return data.map((j: DbJob) => ({
        id: j.id,
        type: j.type,
        targetTitle: j.target_title,
        progress: j.progress,
        stage: j.stage,
        startedAt: 'Just now',
      }));
    } catch (err) {
      console.error('getJobs error:', err);
      return [];
    }
  },
};
