import {
  CandidateRawInput,
  ComprehensiveSourceEvaluation,
  SourceTargetConfig,
} from './types';
import { SourceAnalyzer } from './SourceAnalyzer';
import { EngagementScorer } from './EngagementScorer';
import { ShortFormScorer } from './ShortFormScorer';

/**
 * RANKING ENGINE
 * Combines modular scorers using a transparent weighted scoring model:
 * - Relevance: 30%
 * - Engagement Potential: 30%
 * - Short-Form Potential: 25%
 * - Content Quality: 15%
 *
 * Enforces source-level rejection for:
 * - Generic/promotional videos
 * - Low-information or repetitive content
 * - Videos with no identifiable short-form angle
 *
 * Produces crisp, explainable rationales (e.g. "Strong because the speaker challenges a common belief and reaches a surprising conclusion.")
 */
export class RankingEngine {
  public static evaluateSource(
    candidate: CandidateRawInput,
    target: SourceTargetConfig
  ): ComprehensiveSourceEvaluation {
    const relAndQuality = SourceAnalyzer.analyze(candidate, target);
    const engagement = EngagementScorer.score(candidate);
    const shortForm = ShortFormScorer.score(candidate);

    const relevanceScore = relAndQuality.relevanceScore;
    const contentQualityScore = relAndQuality.contentQualityScore;
    const engagementScore = engagement.engagementScore;
    const shortFormScore = shortForm.shortFormScore;

    // Weighted Overall Score Formula:
    // Relevance (30%) + Engagement (30%) + ShortForm (25%) + ContentQuality (15%)
    const weightedScore =
      relevanceScore * 0.30 +
      engagementScore * 0.30 +
      shortFormScore * 0.25 +
      contentQualityScore * 0.15;

    const overallScore = Math.max(10, Math.min(99, Math.round(weightedScore)));

    // Rejection Criteria
    let isRejected = false;
    let rejectionReason: string | undefined;

    if (relAndQuality.isOffTopic || relevanceScore < 45) {
      isRejected = true;
      rejectionReason = `Rejected: Content does not align with active niche "${target.niche}" or monitored subtopics.`;
    } else if (relAndQuality.isLowQualityOrPromo || contentQualityScore < 35) {
      isRejected = true;
      rejectionReason = 'Rejected: Promotional announcement or low informational density with repetitive filler.';
    } else if (shortFormScore < 32 && overallScore < 50) {
      isRejected = true;
      rejectionReason = 'Rejected: Diffuse rambling structure with zero identifiable standalone short-form moments.';
    }

    // Explainability Rationale Generation (Concise, specific, non-vague)
    let scoreExplanation = '';

    if (isRejected) {
      scoreExplanation = rejectionReason || 'Candidate fell below minimum quality and relevance thresholds.';
    } else if (overallScore >= 90) {
      if (engagement.signals.hasSurpriseOrContrarian && shortForm.signals.hasConcisePayoff) {
        scoreExplanation = 'Strong because the speaker challenges a common consensus belief and reaches a surprising, empirical conclusion.';
      } else if (engagement.signals.hasCuriosity && shortForm.signals.hasStrongOpeningHook) {
        scoreExplanation = 'Strong short-form candidate: clear hook setup → counter-intuitive discovery → concise actionable payoff.';
      } else {
        scoreExplanation = 'High-scoring source: high niche relevance with dense standalone moments and brisk pacing.';
      }
    } else if (overallScore >= 78) {
      if (candidate.viewCount && candidate.viewCount > 1000000 && shortFormScore < 70) {
        scoreExplanation = 'High raw view count, but moderate short-form density: broad appeal but requires tighter clip segmentation.';
      } else {
        scoreExplanation = 'Solid educational source: strong fundamental accuracy with dependable structure, though less provocative in opening hook.';
      }
    } else if (overallScore >= 60) {
      if (relevanceScore > 85 && (shortFormScore < 55 || engagementScore < 55)) {
        scoreExplanation = 'Niche-relevant but dry presentation: accurate technical subject matter lacking punchy hook inflection or viral pacing.';
      } else if (candidate.viewCount && candidate.viewCount > 1500000) {
        scoreExplanation = 'Popular stream format: high view metrics do not translate to standalone short-form potential due to diffuse stream chatter.';
      } else {
        scoreExplanation = 'Acceptable baseline relevance, but low short-form potential and diffuse conversational pacing.';
      }
    } else {
      scoreExplanation = 'Marginal ranking: weak opening tension and low density of self-contained insights.';
    }

    return {
      relevanceScore,
      contentQualityScore,
      engagementScore,
      shortFormScore,
      overallScore,
      isRejected,
      rejectionReason,
      scoreExplanation,
      matchedSubtopics: relAndQuality.matchedSubtopics,
    };
  }

  /**
   * Evaluates, filters, ranks, and sorts a batch of raw candidate inputs by overall score descending.
   */
  public static rankSources<T extends CandidateRawInput>(
    sources: T[],
    target: SourceTargetConfig
  ): {
    ranked: Array<T & ComprehensiveSourceEvaluation>;
    rejected: Array<T & ComprehensiveSourceEvaluation>;
  } {
    const evaluated = sources.map((source) => {
      const evalResult = RankingEngine.evaluateSource(source, target);
      return {
        ...source,
        ...evalResult,
      };
    });

    const qualified = evaluated.filter((s) => !s.isRejected);
    const rejected = evaluated.filter((s) => s.isRejected);

    // Sort strictly by overallScore descending (popularity is NOT a substitute for clip quality!)
    qualified.sort((a, b) => b.overallScore - a.overallScore);

    return {
      ranked: qualified,
      rejected,
    };
  }
}
