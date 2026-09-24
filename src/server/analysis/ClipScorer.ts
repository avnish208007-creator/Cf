import { CandidateFactors } from '../../types';

export interface EvaluatedMomentData {
  hook: string;
  summary: string;
  startTime: string;
  endTime: string;
  duration: string;
  estimatedDuration: string;
  score: number;
  factors: CandidateFactors;
  explanation: string;
}

/**
 * CLIP SCORER
 * Evaluates individual short-form moment candidates extracted from long-form video transcripts.
 * Calculates transparent clip score based on:
 * - hookStrength: 25%
 * - standaloneClarity: 20%
 * - payoffStrength: 20%
 * - curiosity: 15%
 * - emotionalFactor: 10%
 * - pacing / contextCompleteness: 10%
 */
export class ClipScorer {
  public static calculateClipScore(factors: {
    hookStrength: number;
    standaloneClarity: number;
    payoffStrength: number;
    curiosity: number;
    emotionalFactor: number;
    pacing: number;
    contextCompleteness: number;
  }): number {
    const raw =
      factors.hookStrength * 0.25 +
      factors.standaloneClarity * 0.20 +
      factors.payoffStrength * 0.20 +
      factors.curiosity * 0.15 +
      factors.emotionalFactor * 0.10 +
      ((factors.pacing + factors.contextCompleteness) / 2) * 0.10;

    return Math.max(50, Math.min(99, Math.round(raw)));
  }

  public static generateExplanation(factors: {
    hookStrength: number;
    curiosity: number;
    payoffStrength: number;
    standaloneClarity: number;
  }): string {
    if (factors.hookStrength >= 92 && factors.payoffStrength >= 90) {
      return 'Strong short-form candidate: clear setup → surprising result → concise payoff.';
    }
    if (factors.curiosity >= 90 && factors.standaloneClarity >= 88) {
      return 'High scroll-stop impact: speaker challenges consensus with empirical proof and zero dead air.';
    }
    if (factors.standaloneClarity >= 90) {
      return 'Self-contained masterclass moment: fully understandable in under 45 seconds without prior context.';
    }
    return 'Actionable insight: clear initial setup followed by a direct, demonstrable conclusion.';
  }
}
