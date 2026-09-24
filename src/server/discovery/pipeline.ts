import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  DiscoveredVideo,
  DiscoveryPipelineOptions,
  DiscoveryPipelineResult,
  IDiscoveryProvider,
  ProviderUnavailableError,
} from '../providers/types';
import { DevelopmentDiscoveryProvider } from '../providers/DevelopmentDiscoveryProvider';
import { RealDiscoveryProvider } from '../providers/RealDiscoveryProvider';
import { generateFocusedSearchQueries } from './queryGenerator';
import { RankingEngine } from '../analysis/RankingEngine';

/**
 * Extracts standard 11-character YouTube video ID from various URL formats
 */
export function extractYouTubeId(urlOrId: string): string {
  if (!urlOrId) return '';
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  return match ? match[1] : trimmed;
}

/**
 * Initializes a Supabase client for server-side persistence.
 */
export function getSupabaseServerClient(userAccessToken?: string): SupabaseClient | null {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim();

  const serviceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();

  const key = serviceKey || (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();

  if (!url || !key || !url.startsWith('http') || url.includes('placeholder.supabase.co')) {
    return null;
  }

  const clientOptions: any = {
    auth: { persistSession: false },
  };

  if (userAccessToken && !serviceKey) {
    clientOptions.global = {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    };
  }

  try {
    return createClient(url, key, clientOptions);
  } catch (err) {
    console.error('[Discovery] Error creating Supabase client:', err);
    return null;
  }
}

/**
 * Executes the multi-query, rotated automated discovery pipeline:
 * 1. Read active workspace configuration and history from Supabase
 * 2. Calculate runIndex to rotate search angles across consecutive runs (Run 1 != Run 2 != Run 3)
 * 3. Generate 4 distinct query angles exploring different content vectors
 * 4. Execute DiscoveryProvider across all query vectors to build a broad candidate pool (25–50+ videos)
 * 5. Deduplicate across queries and filter out already-discovered videos in Supabase for this workspace
 * 6. Multi-Factor Evaluation & Ranking (Relevance, Quality, Engagement, Short-Form Potential)
 * 7. Persist top-ranked sources into Supabase `public.source_videos`
 */
export async function runDiscoveryPipeline(
  options: DiscoveryPipelineOptions & {
    userAccessToken?: string;
    workspaceName?: string;
  },
  providerOverride?: IDiscoveryProvider
): Promise<DiscoveryPipelineResult> {
  const {
    workspaceId,
    niche: optionNiche,
    subtopics: optionSubtopics,
    language: optionLanguage,
    freshness = 'all',
    contentType = 'all',
    knownVideoIds = [],
    maxQueries = 4,
    maxResultsPerQuery = 12,
    minDurationSeconds = 120,
    userAccessToken,
    workspaceName,
  } = options;

  if (!workspaceId || !workspaceId.trim()) {
    throw new Error('Workspace ID is required to run discovery and persist records to Supabase.');
  }

  const supabase = getSupabaseServerClient(userAccessToken);
  if (!supabase) {
    throw new Error(
      'Supabase server client could not be initialized. Verify VITE_SUPABASE_URL and API keys.'
    );
  }

  // 1. Authenticate the workspace in Supabase
  let authenticatedWorkspaceId = workspaceId;
  let activeUserId: string | undefined;

  console.log(`[ClipFlow] DISCOVERY started for workspace: ${workspaceId}`);

  if (userAccessToken) {
    try {
      const { data: userData } = await supabase.auth.getUser(userAccessToken);
      if (userData?.user?.id) {
        activeUserId = userData.user.id;
      }
    } catch (authErr) {
      console.warn('[Discovery] Notice extracting user from token:', authErr);
    }
  }

  const { data: existingWorkspace, error: wsError } = await supabase
    .from('workspaces')
    .select('id, name, owner_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (wsError) {
    console.error('[Discovery] Supabase workspace verification error:', wsError);
    throw new Error(`Failed to query workspace in Supabase: ${wsError.message} (code: ${wsError.code})`);
  }

  if (existingWorkspace) {
    if (activeUserId && existingWorkspace.owner_id !== activeUserId) {
      await supabase
        .from('workspaces')
        .update({ owner_id: activeUserId })
        .eq('id', workspaceId);
    }
  } else {
    const ownerId = activeUserId || '791454a8-e110-430e-8a5d-c1b343a140c9';
    const { data: createdWs, error: createWsError } = await supabase
      .from('workspaces')
      .upsert({
        id: workspaceId,
        name: workspaceName || 'Apex Media Lab',
        owner_id: ownerId,
      })
      .select('id, name')
      .single();

    if (createWsError) {
      throw new Error(
        `Workspace authentication failed: workspace "${workspaceId}" could not be authenticated in Supabase: ${createWsError.message}.`
      );
    }

    authenticatedWorkspaceId = createdWs.id;
  }

  // 2. Read active workspace configuration and history
  const { data: dbSettings } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', authenticatedWorkspaceId)
    .maybeSingle();

  const activeNiche = (optionNiche && optionNiche.trim()) || dbSettings?.main_niche || 'Fitness & Strength Training';
  const activeSubtopics = (optionSubtopics && optionSubtopics.length > 0)
    ? optionSubtopics
    : (dbSettings?.subtopics && dbSettings.subtopics.length > 0)
    ? dbSettings.subtopics
    : ['Workout Science', 'Hypertrophy Mechanics', 'Nutrition'];
  const activeLanguage = optionLanguage || dbSettings?.content_language || 'English (US)';
  const minScoreThreshold = dbSettings?.min_candidate_score || 60;

  // Gather existing discovered videos in this workspace to track history and avoid duplicate results
  const knownSet = new Set<string>();
  for (const id of knownVideoIds) {
    const extracted = extractYouTubeId(id);
    if (extracted) knownSet.add(extracted);
  }

  let totalExistingCount = 0;
  try {
    const { data: existingRecords } = await supabase
      .from('source_videos')
      .select('youtube_url')
      .eq('workspace_id', authenticatedWorkspaceId);

    if (existingRecords) {
      totalExistingCount = existingRecords.length;
      for (const row of existingRecords) {
        const extracted = extractYouTubeId(row.youtube_url);
        if (extracted) knownSet.add(extracted);
      }
    }
  } catch (err) {
    console.warn('[Discovery] Notice querying existing records for deduplication:', err);
  }

  // 3. Strategy Rotation Index: Derived from existing source count and run timestamp
  // Ensures Run 1, Run 2, Run 3 explore distinct angles
  const runIndex = totalExistingCount + Math.floor(Date.now() / 60000);

  const queryContexts = generateFocusedSearchQueries({
    niche: activeNiche,
    subtopics: activeSubtopics,
    language: activeLanguage,
    contentType,
    freshness,
    maxQueries,
    maxResultsPerQuery,
    runIndex,
  });

  const queryStrings = queryContexts.map((qc) => qc.query);
  console.log(`[Discovery] Executing multi-angle search (${queryContexts.length} angles):`, queryStrings);

  // 4. Initialize DiscoveryProvider
  const provider: IDiscoveryProvider =
    providerOverride || new RealDiscoveryProvider();

  const availability = await provider.isAvailable();
  if (!availability.available) {
    throw new ProviderUnavailableError(
      availability.reason || 'Real discovery provider is not configured.'
    );
  }

  // 5. Gather raw candidate pool across all query angles
  const candidatePool: DiscoveredVideo[] = [];
  const seenThisRun = new Set<string>();

  for (const qc of queryContexts) {
    try {
      const results = await provider.search(qc);

      for (const video of results) {
        const videoId = extractYouTubeId(video.id || video.youtubeUrl);
        if (!videoId) continue;

        // Skip if already in database for this workspace (ensures genuine discovery of new videos)
        if (provider.name !== 'development') {
          if (knownSet.has(videoId)) {
            continue;
          }
        }

        if (seenThisRun.has(videoId)) {
          continue;
        }

        if (video.durationSeconds > 0 && video.durationSeconds < minDurationSeconds) {
          continue;
        }

        seenThisRun.add(videoId);
        candidatePool.push(video);
      }
    } catch (queryErr) {
      console.warn(`[Discovery] Query failed for "${qc.query}":`, queryErr);
    }
  }

  console.log(`[Discovery] Raw candidates collected before ranking: ${candidatePool.length}`);

  // 6. Multi-Factor Analysis, Ranking & Quality Filtering
  const { ranked: qualifiedVideos, rejected } = RankingEngine.rankSources(
    candidatePool.map((c) => ({
      ...c,
      title: c.title,
      description: c.description || c.summary,
      summary: c.summary,
      channelTitle: c.channelTitle,
      durationSeconds: c.durationSeconds,
      viewCount: c.viewCount,
      likeCount: c.likeCount,
      commentCount: c.commentCount,
      publishedAt: c.publishedAt,
      youtubeUrl: c.youtubeUrl,
      niche: c.niche,
      matchedSubtopics: c.matchedSubtopics,
      isSyntheticData: c.isSyntheticData,
      is_development_source: c.is_development_source ?? c.isDevelopmentSource ?? false,
      isDevelopmentSource: c.is_development_source ?? c.isDevelopmentSource ?? false,
    })),
    {
      niche: activeNiche,
      subtopics: activeSubtopics,
      language: activeLanguage,
      minCandidateScore: minScoreThreshold,
    }
  );

  // Take top 8-12 best sources to persist
  const topSourcesToSave = qualifiedVideos.slice(0, 10);

  // 7. Persist ranked records into Supabase `public.source_videos`
  const insertedVideos: DiscoveredVideo[] = [];

  for (const v of topSourcesToSave) {
    const isDevSource = Boolean(
      v.is_development_source ||
      v.isDevelopmentSource ||
      v.youtubeUrl?.startsWith('dev://')
    );

    const metaPayload = {
      rel: v.relevanceScore,
      eng: v.engagementScore,
      sf: v.shortFormScore,
      qual: v.contentQualityScore,
      overall: v.overallScore,
      exp: v.scoreExplanation,
      desc: v.description,
      isDev: isDevSource,
    };
    const formattedSummary = `[CLIPFLOW_META:${JSON.stringify(metaPayload)}] ${v.scoreExplanation || ''} (Scores: Rel ${v.relevanceScore}% · Eng ${v.engagementScore}% · Short-Form ${v.shortFormScore}% · Quality ${v.contentQualityScore}%) — ${v.description || v.summary || ''}`;

    const insertPayload = {
      workspace_id: authenticatedWorkspaceId,
      title: v.title,
      channel_title: v.channelTitle,
      duration: v.duration,
      view_count: v.viewCount,
      published_at: v.publishedAt,
      youtube_url: v.youtubeUrl,
      status: 'new' as const,
      relevance_score: v.overallScore,
      freshness_tag: `Overall: ${v.overallScore}% · Short-Form: ${v.shortFormScore}%`,
      candidates_count: 0,
      summary: formattedSummary,
      niche: v.niche || activeNiche,
      thumbnail_gradient: v.thumbnailGradient,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('source_videos')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError) {
      console.error('[Discovery] Supabase insert error details:', insertError);
      throw new Error(
        `Failed to persist discovered source video "${v.title}" to Supabase: ${insertError.message} (code: ${insertError.code}).`
      );
    }

    console.log(`[ClipFlow] SOURCE INSERT: ${inserted.id} - "${v.title}"`);

    insertedVideos.push({
      ...v,
      id: inserted.id,
      description: v.description,
      publishedAt: inserted.published_at || v.publishedAt,
      relevanceScore: v.relevanceScore,
      contentQualityScore: v.contentQualityScore,
      engagementScore: v.engagementScore,
      shortFormScore: v.shortFormScore,
      overallScore: v.overallScore,
      scoreExplanation: v.scoreExplanation,
      matchedSubtopics: v.matchedSubtopics,
      isSyntheticData: false,
      is_development_source: isDevSource,
      isDevelopmentSource: isDevSource,
    });
  }

  console.log('=====================================================');
  console.log('[ClipFlow Discovery Summary]');
  console.log(`- Workspace ID: ${authenticatedWorkspaceId}`);
  console.log(`- Niche: "${activeNiche}"`);
  console.log(`- Subtopics: [${activeSubtopics.join(', ')}]`);
  console.log(`- Angles Run (${queryStrings.length}): ${queryStrings.join(' | ')}`);
  console.log(`- Raw Candidates Discovered: ${candidatePool.length}`);
  console.log(`- Filtered / Rejected: ${rejected.length}`);
  console.log(`- Top Sources Persisted: ${insertedVideos.length}`);
  console.log('=====================================================');

  return {
    success: true,
    videos: insertedVideos,
    workspaceId: authenticatedWorkspaceId,
    totalDiscovered: candidatePool.length,
    totalRejected: rejected.length,
    totalInserted: insertedVideos.length,
    returnedRecordIds: insertedVideos.map((v) => v.id),
    queriesRun: queryStrings,
    provider: provider.name,
    activeNiche,
    activeSubtopics,
  };
}
