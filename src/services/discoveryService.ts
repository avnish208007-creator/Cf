import { SourceVideo } from '../types';

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
 * Calls the server-side /api/discover endpoint backed by the DiscoveryProvider pipeline.
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

    const endpoint = '/api/discover';
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
        id: v.id,
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

      sourceVideos.sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));

      return sourceVideos;

    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        const timeoutErr = new Error('Discovery request timed out. Please try again.');
        (timeoutErr as any).code = 'TIMEOUT';
        throw timeoutErr;
      }
      throw err;
    }
  }
}
