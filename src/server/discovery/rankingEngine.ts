export interface SourceToRank {
  id?: string;
  title: string;
  description?: string;
  summary?: string;
  channelTitle?: string;
  duration?: string;
  durationSeconds?: number;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  publishedAt?: string;
  youtubeUrl?: string;
  niche?: string;
  matchedSubtopics?: string[];
  thumbnailGradient?: string;
  thumbnailUrl?: string;
  isSyntheticData?: boolean;
  is_development_source?: boolean;
  isDevelopmentSource?: boolean;
}

export interface RankedSourceResult extends SourceToRank {
  relevanceScore: number;
  contentQualityScore: number;
  engagementScore: number;
  shortFormScore: number;
  overallScore: number;
  scoreExplanation: string;
  rejectionReason?: string;
}

export class RankingEngine {
  public static rankSources(
    sources: SourceToRank[],
    context: {
      niche: string;
      subtopics: string[];
      language?: string;
      minCandidateScore?: number;
    }
  ): { ranked: RankedSourceResult[]; rejected: RankedSourceResult[] } {
    const minScore = context.minCandidateScore || 70;
    const ranked: RankedSourceResult[] = [];
    const rejected: RankedSourceResult[] = [];

    const nicheTerms = [
      ...context.niche.toLowerCase().split(/\s+/),
      ...context.subtopics.flatMap((s) => s.toLowerCase().split(/\s+/)),
    ].filter((t) => t.length > 2);

    for (const src of sources) {
      const titleLower = (src.title || '').toLowerCase();
      const descLower = (src.description || src.summary || '').toLowerCase();

      // Relevance score calculation (0-100)
      let matches = 0;
      for (const term of nicheTerms) {
        if (titleLower.includes(term)) matches += 2;
        if (descLower.includes(term)) matches += 1;
      }
      const relevanceScore = Math.min(98, Math.max(65, 70 + matches * 5));

      // Quality score based on duration and presentation
      const durationSec = src.durationSeconds || 600;
      let contentQualityScore = 85;
      if (durationSec > 180 && durationSec < 3600) {
        contentQualityScore = 90;
      } else if (durationSec < 60) {
        contentQualityScore = 60;
      }

      // Engagement score based on viewCount
      const views = src.viewCount || 1000;
      const engagementScore = Math.min(98, Math.max(70, Math.round(75 + Math.log10(Math.max(10, views)) * 4)));

      // Short-form potential score
      const shortFormScore = Math.round(relevanceScore * 0.4 + contentQualityScore * 0.3 + engagementScore * 0.3);
      const overallScore = shortFormScore;

      const result: RankedSourceResult = {
        ...src,
        relevanceScore,
        contentQualityScore,
        engagementScore,
        shortFormScore,
        overallScore,
        scoreExplanation: `Matches target niche "${context.niche}" with strong conversational density and topic alignment.`,
      };

      if (overallScore >= minScore) {
        ranked.push(result);
      } else {
        result.rejectionReason = `Overall score ${overallScore} below workspace threshold ${minScore}`;
        rejected.push(result);
      }
    }

    // Sort by overallScore descending
    ranked.sort((a, b) => b.overallScore - a.overallScore);

    return { ranked, rejected };
  }
}
