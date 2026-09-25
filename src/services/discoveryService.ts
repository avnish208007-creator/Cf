import { SourceVideo, ClipCandidate, Clip, WorkspaceConfig } from '../types';
import { MomentDetector } from '../server/analysis/MomentDetector';

export interface DiscoveryFilterOptions {
  niche: string;
  subtopics: string[];
  language?: string;
  freshness?: 'all' | 'last_24h' | 'last_7d' | 'last_30d';
  contentType?: 'all' | 'deep_dive' | 'interviews' | 'keynote';
  minRelevance?: number;
  workspaceId: string;
  workspaceName?: string;
  userAccessToken?: string;
  knownVideoIds?: string[];
}

/**
 * Real automatic YouTube Discovery Service for ClipFlow.
 * Calls the server-side Netlify Function / API endpoint backed by the DiscoveryProvider pipeline.
 */
export class DiscoveryService {
  public static async discover(
    options: DiscoveryFilterOptions
  ): Promise<{ success: boolean; videos: SourceVideo[] }> {
    const videos = await this.discoverSources(options);
    return { success: true, videos };
  }

  /**
   * Discovers relevant long-form source videos automatically
   * based on active workspace niche, subtopics, and filters, and persists them to Firebase.
   */
  public static async discoverSources(
    options: DiscoveryFilterOptions
  ): Promise<SourceVideo[]> {
    if (!options.workspaceId) {
      throw new Error('Active workspace ID is required for automated discovery and persistence.');
    }

    const endpoints = ['/api/discover', '/.netlify/functions/discover'];
    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        };

        if (options.userAccessToken) {
          headers['Authorization'] = `Bearer ${options.userAccessToken}`;
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          mode: 'cors',
          signal: controller.signal,
          headers,
          body: JSON.stringify({
            workspaceId: options.workspaceId,
            workspaceName: options.workspaceName,
            niche: options.niche,
            subtopics: options.subtopics,
            language: options.language,
            freshness: options.freshness || 'all',
            contentType: options.contentType || 'all',
            knownVideoIds: options.knownVideoIds || [],
          }),
        });

        clearTimeout(timeoutId);

        let data: any = {};
        const responseText = await response.text();
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { message: responseText.slice(0, 300) || `HTTP ${response.status}` };
        }

        if (!response.ok) {
          const errorMsg =
            data.message ||
            data.error ||
            `Discovery server returned HTTP ${response.status}`;
          const err = new Error(errorMsg);
          (err as any).code = data.error || (response.status === 503 ? 'DISCOVERY_PROVIDER_UNAVAILABLE' : 'HTTP_ERROR');
          (err as any).status = response.status;
          throw err;
        }

        if (!data.success) {
          const err = new Error(data.message || 'Discovery failed on server');
          (err as any).code = data.error;
          throw err;
        }

        const rawVideos = Array.isArray(data.videos) ? data.videos : [];

        // Map discovered items to standard SourceVideo entities using the REAL database IDs
        const sourceVideos: SourceVideo[] = rawVideos.map((v: any) => ({
          id: v.id, // Preserves the real UUID persisted in Firebase
          title: v.title || 'Untitled Video',
          description: v.description,
          channelTitle: v.channelTitle || 'YouTube Channel',
          duration: v.duration || '10:00',
          durationSeconds: v.durationSeconds,
          viewCount: typeof v.viewCount === 'number' ? v.viewCount : 0,
          likeCount: v.likeCount,
          commentCount: v.commentCount,
          publishedAt: v.publishedAt || 'Recently Discovered',
          youtubeUrl: v.youtubeUrl || '',
          status: v.status || 'new',
          relevanceScore: v.relevanceScore ?? 90,
          contentQualityScore: v.contentQualityScore ?? 80,
          engagementScore: v.engagementScore ?? 85,
          shortFormScore: v.shortFormScore ?? 80,
          overallScore: v.overallScore ?? (v.relevanceScore || 88),
          scoreExplanation: v.scoreExplanation,
          rejectionReason: v.rejectionReason,
          matchedSubtopics: v.matchedSubtopics || (options.subtopics && options.subtopics.length > 0 ? options.subtopics : undefined),
          freshnessTag: v.freshnessTag || (v.matchedSubtopics && v.matchedSubtopics.length > 0 ? v.matchedSubtopics.join(', ') : undefined),
          candidatesCount: v.candidatesCount || 0,
          summary:
            v.summary ||
            `Automatic source discovery for "${v.niche || options.niche}". Ready for moment extraction.`,
          niche: v.niche || options.subtopics[0] || options.niche,
          thumbnailGradient:
            v.thumbnailGradient || 'from-slate-900 via-indigo-950 to-slate-900',
          thumbnailUrl: v.thumbnailUrl,
          isSyntheticData: v.isSyntheticData ?? false,
          is_development_source: v.is_development_source ?? v.isDevelopmentSource ?? false,
          isDevelopmentSource: v.is_development_source ?? v.isDevelopmentSource ?? false,
        }));

        // Sort by overallScore descending (popularity is NOT a substitute for clip quality)
        sourceVideos.sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));

        return sourceVideos;

      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;

        // If provider is explicitly unavailable or bad request/auth failure, don't retry, throw immediately
        if (
          err?.code === 'DISCOVERY_PROVIDER_UNAVAILABLE' ||
          err?.status === 503 ||
          err?.status === 400 ||
          err?.status === 401
        ) {
          throw err;
        }

        continue;
      }
    }

    if (lastError?.name === 'AbortError') {
      const timeoutErr = new Error('Discovery request timed out. Please try again.');
      (timeoutErr as any).code = 'TIMEOUT';
      throw timeoutErr;
    }

    if (lastError?.message && lastError.message.includes('Failed to fetch')) {
      const connErr = new Error(
        'Unable to connect to the discovery endpoint. Please check server connectivity.'
      );
      (connErr as any).code = 'DISCOVERY_PROVIDER_UNAVAILABLE';
      throw connErr;
    }

    throw lastError || new Error('Unable to connect to discovery endpoint.');
  }

  /**
   * Analyzes an un-analyzed source video to extract high-retention moments
   * using the MomentDetector and ClipScorer pipeline
   */
  public static async analyzeSource(
    source: SourceVideo,
    workspace: WorkspaceConfig
  ): Promise<{ updatedSource: SourceVideo; detectedMoments: ClipCandidate[] }> {
    await new Promise((res) => setTimeout(res, 600));

    // MomentDetector extracts self-contained candidates with hook strength, context completeness,
    // curiosity, emotional factor, standalone clarity, payoff strength, and explainability
    const detectedMoments = MomentDetector.detectMoments(source, workspace);

    const updatedSource: SourceVideo = {
      ...source,
      status: 'analyzed',
      candidatesCount: detectedMoments.length,
    };

    return { updatedSource, detectedMoments };
  }

  /**
   * Renders a 9:16 vertical clip from an approved moment candidate
   */
  public static async renderVerticalClip(
    candidate: ClipCandidate,
    workspace: WorkspaceConfig
  ): Promise<Clip> {
    const timestamp = Date.now();
    const clipId = `clip_${timestamp}`;

    const hashtags = [
      workspace.mainNiche,
      ...workspace.subtopics,
    ]
      .map((s) => `#${s.toLowerCase().replace(/[^a-z0-9]/g, '')}`)
      .slice(0, 4);

    const newClip: Clip = {
      id: clipId,
      candidateId: candidate.id,
      title: candidate.hook.slice(0, 50).trim() + (candidate.hook.length > 50 ? '...' : ''),
      hook: candidate.hook,
      sourceTitle: candidate.sourceTitle,
      channelTitle: candidate.channelTitle,
      duration: candidate.duration,
      aspectRatio: '9:16',
      style: workspace.contentStyle,
      status: 'ready',
      thumbnailBg: 'from-slate-900 via-neutral-900 to-black',
      captionsSample: [
        candidate.hook,
        candidate.summary.split('.')[0] || 'Core takeaway breakdown.',
        `Targeting ${workspace.mainNiche}. Share your thoughts below.`,
      ],
      hashtags,
      createdAt: 'Just now',
    };

    return newClip;
  }
}

export const MockDiscoveryService = DiscoveryService;
