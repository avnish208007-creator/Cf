import 'dotenv/config';
import { supabase } from '../../lib/supabase';
import {
  DiscoveredVideo,
  DiscoveryPipelineOptions,
  DiscoveryPipelineResult,
  IDiscoveryProvider,
  ProviderUnavailableError,
} from '../providers/types';
import { RealDiscoveryProvider } from '../providers/RealDiscoveryProvider';
import { generateFocusedSearchQueries } from './queryGenerator';
import { RankingEngine } from '../analysis/RankingEngine';
import crypto from 'crypto';

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
    workspaceName,
  } = options;

  if (!workspaceId || !workspaceId.trim()) {
    throw new Error('Workspace ID is required to run discovery and persist records to Supabase.');
  }

  const authenticatedWorkspaceId = workspaceId.trim();
  console.log(`[ClipFlow] DISCOVERY started for workspace: ${authenticatedWorkspaceId}`);

  // 1. Authenticate / ensure workspace in Supabase
  const { data: wsData } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', authenticatedWorkspaceId)
    .maybeSingle();

  if (!wsData) {
    const ownerId = '791454a8-e110-430e-8a5d-c1b343a140c9';
    await supabase.from('workspaces').upsert({
      id: authenticatedWorkspaceId,
      name: workspaceName || 'Apex Media Lab',
      owner_id: ownerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
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

  // Gather existing discovered videos in this workspace to track history
  const knownSet = new Set<string>();
  for (const id of knownVideoIds) {
    const extracted = extractYouTubeId(id);
    if (extracted) knownSet.add(extracted);
  }

  let totalExistingCount = 0;
  try {
    const { data: sourcesData } = await supabase
      .from('source_videos')
      .select('youtube_url')
      .eq('workspace_id', authenticatedWorkspaceId);

    totalExistingCount = sourcesData?.length || 0;
    (sourcesData || []).forEach((data) => {
      if (data.youtube_url) {
        const extracted = extractYouTubeId(data.youtube_url);
        if (extracted) knownSet.add(extracted);
      }
    });
  } catch (err) {
    console.warn('[Discovery] Notice querying existing records for deduplication:', err);
  }

  // 3. Strategy Rotation Index
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
  const provider: IDiscoveryProvider = providerOverride || new RealDiscoveryProvider();

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

  // 6. Multi-Factor Analysis & Ranking
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

  const topSourcesToSave = qualifiedVideos.slice(0, 10);
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

    const newSourceId = crypto.randomUUID();
    const now = new Date().toISOString();

    const insertPayload = {
      id: newSourceId,
      workspace_id: authenticatedWorkspaceId,
      title: v.title,
      channel_title: v.channelTitle,
      duration: v.duration,
      view_count: v.viewCount,
      published_at: v.publishedAt,
      youtube_url: v.youtubeUrl,
      status: 'new',
      relevance_score: v.overallScore,
      freshness_tag: `Overall: ${v.overallScore}% · Short-Form: ${v.shortFormScore}%`,
      candidates_count: 0,
      summary: formattedSummary,
      niche: v.niche || activeNiche,
      thumbnail_gradient: v.thumbnailGradient || 'from-slate-900 via-indigo-950 to-slate-900',
      created_at: now,
      updated_at: now,
    };

    const { error: insertErr } = await supabase.from('source_videos').insert(insertPayload);

    if (insertErr) {
      console.error(`[ClipFlow] SOURCE INSERT FAILED for "${v.title}":`, insertErr.message);
    } else {
      console.log(`[ClipFlow] SOURCE INSERT SUCCESS in Supabase: ${newSourceId} - "${v.title}"`);

      insertedVideos.push({
        ...v,
        id: newSourceId,
        description: v.description,
        publishedAt: v.publishedAt,
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
  }

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
