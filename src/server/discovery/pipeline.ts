import 'dotenv/config';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import {
  DiscoveredVideo,
  DiscoveryPipelineOptions,
  DiscoveryPipelineResult,
  IDiscoveryProvider,
  ProviderUnavailableError,
} from '../providers/types';
import { RealDiscoveryProvider } from '../providers/RealDiscoveryProvider';
import { RssDiscoveryProvider } from '../providers/RssDiscoveryProvider';
import { generateFocusedSearchQueries } from './queryGenerator';
import { RankingEngine } from './rankingEngine';
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
    workspaceId = DEFAULT_WORKSPACE_ID,
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

  const authenticatedWorkspaceId = workspaceId.trim() || DEFAULT_WORKSPACE_ID;
  console.log(`[ClipFlow] DISCOVERY started for workspace: ${authenticatedWorkspaceId}`);

  // 1. Get or create workspace document in Firestore with fallback
  let wsData: any = null;
  try {
    const wsRef = doc(db, 'workspaces', authenticatedWorkspaceId);
    const wsSnap = await getDoc(wsRef);

    if (!wsSnap.exists()) {
      wsData = {
        id: authenticatedWorkspaceId,
        name: workspaceName || 'ClipFlow Workspace',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(wsRef, wsData, { merge: true });
    } else {
      wsData = wsSnap.data();
    }
  } catch (fsErr) {
    console.warn('[Discovery] Firestore workspace fetch warning (continuing with default settings):', fsErr);
    wsData = {
      id: authenticatedWorkspaceId,
      name: workspaceName || 'ClipFlow Workspace',
    };
  }

  const activeNiche = (optionNiche && optionNiche.trim()) || wsData?.config?.mainNiche || wsData?.mainNiche || 'AI & Technology';
  const activeSubtopics = (optionSubtopics && optionSubtopics.length > 0)
    ? optionSubtopics
    : (wsData?.config?.subtopics && wsData.config.subtopics.length > 0)
    ? wsData.config.subtopics
    : ['AI Agents', 'Automation', 'LLMs'];
  const activeLanguage = optionLanguage || wsData?.config?.contentLanguage || 'English';
  const minScoreThreshold = wsData?.config?.minCandidateScore || 70;

  // Gather existing discovered videos in this workspace to track history
  const knownSet = new Set<string>();
  for (const id of knownVideoIds) {
    const extracted = extractYouTubeId(id);
    if (extracted) knownSet.add(extracted);
  }

  let totalExistingCount = 0;
  try {
    const sourcesColRef = collection(db, 'workspaces', authenticatedWorkspaceId, 'sources');
    const sourcesSnapshot = await getDocs(sourcesColRef);
    totalExistingCount = sourcesSnapshot.docs.length;
    sourcesSnapshot.docs.forEach((d) => {
      const data = d.data();
      if (data.youtubeUrl) {
        const extracted = extractYouTubeId(data.youtubeUrl);
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

  // 4. Initialize DiscoveryProviders (Real YouTube search + RSS Channel Feeds)
  const provider: IDiscoveryProvider = providerOverride || new RealDiscoveryProvider();
  const rssProvider = new RssDiscoveryProvider();

  const availability = await provider.isAvailable();
  if (!availability.available) {
    throw new ProviderUnavailableError(
      availability.reason || 'Real discovery provider is not configured.'
    );
  }

  // 5. Gather raw candidate pool across query angles and RSS feeds
  const candidatePool: DiscoveredVideo[] = [];
  const seenThisRun = new Set<string>();

  // Run RSS Discovery first
  try {
    const rssResults = await rssProvider.search({ niche: activeNiche, maxResults: 10 } as any);
    for (const video of rssResults) {
      const videoId = extractYouTubeId(video.id || video.youtubeUrl);
      if (!videoId) continue;
      if (knownSet.has(videoId) || seenThisRun.has(videoId)) continue;
      seenThisRun.add(videoId);
      candidatePool.push(video);
    }
    console.log(`[Discovery] RSS Channel Feed collected ${rssResults.length} videos.`);
  } catch (rssErr) {
    console.warn('[Discovery] RSS channel feed discovery warning:', rssErr);
  }

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
      workspaceId: authenticatedWorkspaceId,
      title: v.title,
      channelTitle: v.channelTitle || 'YouTube Creator',
      duration: v.duration || '10:00',
      viewCount: v.viewCount || 0,
      publishedAt: v.publishedAt || 'Recently Published',
      youtubeUrl: v.youtubeUrl || '',
      status: 'new',
      relevanceScore: v.overallScore,
      freshnessTag: `Overall: ${v.overallScore}% · Short-Form: ${v.shortFormScore}%`,
      candidatesCount: 0,
      summary: formattedSummary,
      niche: v.niche || activeNiche,
      thumbnailGradient: v.thumbnailGradient || 'from-slate-900 via-indigo-950 to-slate-900',
      createdAt: now,
      updatedAt: now,
    };

    try {
      const sourceDocRef = doc(db, 'workspaces', authenticatedWorkspaceId, 'sources', newSourceId);
      await setDoc(sourceDocRef, insertPayload);
      console.log(`[ClipFlow] SOURCE INSERT SUCCESS in Firestore: ${newSourceId} - "${v.title}"`);

      insertedVideos.push({
        ...v,
        id: newSourceId,
        title: v.title,
        channelTitle: v.channelTitle || 'YouTube Creator',
        duration: v.duration || '10:00',
        durationSeconds: v.durationSeconds || 600,
        viewCount: v.viewCount || 0,
        youtubeUrl: v.youtubeUrl || '',
        summary: v.summary || '',
        niche: v.niche || activeNiche,
        thumbnailGradient: v.thumbnailGradient || 'from-slate-900 via-indigo-950 to-slate-900',
        description: v.description,
        publishedAt: v.publishedAt || 'Recently Published',
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
    } catch (insertErr: any) {
      console.error(`[ClipFlow] SOURCE INSERT FAILED for "${v.title}":`, insertErr.message);
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
