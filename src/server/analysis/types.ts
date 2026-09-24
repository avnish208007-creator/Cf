export interface SourceTargetConfig {
  niche: string;
  subtopics: string[];
  language?: string;
  intendedAudience?: string;
  minCandidateScore?: number;
}

export interface CandidateRawInput {
  title: string;
  description?: string;
  summary?: string;
  channelTitle: string;
  durationSeconds?: number;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  niche?: string;
  matchedSubtopics?: string[];
  isSyntheticData?: boolean;
}

export interface RelevanceAndQualityResult {
  relevanceScore: number;       // 0-100 (30% overall weight)
  contentQualityScore: number;  // 0-100 (15% overall weight)
  matchedSubtopics: string[];
  relevanceExplanation: string;
  qualityExplanation: string;
  isOffTopic: boolean;
  isLowQualityOrPromo: boolean;
}

export interface EngagementResult {
  engagementScore: number;      // 0-100 (30% overall weight)
  signals: {
    hasCuriosity: boolean;
    hasSurpriseOrContrarian: boolean;
    hasStrongClaims: boolean;
    hasActionableFramework: boolean;
    hasDebateOrDisagreement: boolean;
    hasFailureOrWarStory: boolean;
    hasDemonstrationOrComparison: boolean;
    hasMythVsReality: boolean;
    hasUnexpectedConclusion: boolean;
  };
  penalties: string[];
  engagementExplanation: string;
}

export interface ShortFormResult {
  shortFormScore: number;       // 0-100 (25% overall weight)
  signals: {
    hasSelfContainedMoments: boolean;
    hasClearContext: boolean;
    hasStrongOpeningHook: boolean;
    isStandaloneUnderstandable: boolean;
    hasSingleCoreIdea: boolean;
    hasConcisePayoff: boolean;
    hasQuotableStatements: boolean;
    hasConversationOrDebateMoment: boolean;
  };
  penalties: string[];
  shortFormExplanation: string;
}

export interface ComprehensiveSourceEvaluation {
  relevanceScore: number;
  contentQualityScore: number;
  engagementScore: number;
  shortFormScore: number;
  overallScore: number;
  isRejected: boolean;
  rejectionReason?: string;
  scoreExplanation: string;
  matchedSubtopics: string[];
}
