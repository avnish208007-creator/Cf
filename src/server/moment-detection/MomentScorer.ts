import { CandidateQualityTier, RawMomentCandidate, ScoredMoment } from './types';

export interface IMomentScorer {
  scoreMoment(
    moment: RawMomentCandidate,
    context: {
      niche: string;
      subtopics: string[];
      videoTitle: string;
    }
  ): ScoredMoment;

  deduplicateAndRank(
    moments: ScoredMoment[],
    options?: { minSelectionScore?: number }
  ): ScoredMoment[];
}

export class MultiFactorMomentScorer implements IMomentScorer {
  public scoreMoment(
    moment: RawMomentCandidate,
    context: {
      niche: string;
      subtopics: string[];
      videoTitle: string;
    }
  ): ScoredMoment {
    const hook = moment.hook.trim();
    const payoff = moment.payoff.trim();
    const transcript = moment.transcriptText.trim();
    const summary = (moment.contextSummary || '').trim();
    const durSec = moment.durationSeconds;
    const lowerHook = hook.toLowerCase();
    const lowerTranscript = transcript.toLowerCase();
    const lowerPayoff = payoff.toLowerCase();
    const lowerSummary = summary.toLowerCase();

    // ==========================================
    // 1. HOOK SCORE (0-100)
    // Evaluates opening seconds: compelling statement, surprising fact,
    // question, strong opinion, unusual claim vs downranking greetings & filler.
    // ==========================================
    let hookScore = 70;
    let hookType: 'surprising_claim' | 'question' | 'strong_opinion' | 'useful_formula' | 'story_setup' | 'standard' = 'standard';

    // A. Positive Opening Patterns
    if (/^(what if|why do|how do|how can|is it really|did you know|have you ever)/i.test(hook)) {
      hookScore += 16;
      hookType = 'question';
    } else if (/^(the biggest mistake|stop doing|never do|the secret to|the truth about|the real reason|nobody tells you|most people get this wrong|don't make this)/i.test(hook)) {
      hookScore += 18;
      hookType = 'surprising_claim';
    } else if (/^(here are \d+|here is the|here's the \d+|this \d+-step|the rule of|the single best)/i.test(hook)) {
      hookScore += 15;
      hookType = 'useful_formula';
    } else if (/^(i used to think|when we tested|we analyzed|in our experiment|after \d+ years)/i.test(hook)) {
      hookScore += 14;
      hookType = 'story_setup';
    } else if (/^(this is why|this completely changes|everyone is wrong about|you should never)/i.test(hook)) {
      hookScore += 14;
      hookType = 'strong_opinion';
    }

    // Vocabulary signals in hook
    if (lowerHook.includes('mistake') || lowerHook.includes('wrong') || lowerHook.includes('myth') || lowerHook.includes('secret') || lowerHook.includes('revealed') || lowerHook.includes('unexpected') || lowerHook.includes('crucial')) {
      hookScore += 7;
    }
    if (/\d+/.test(hook)) {
      hookScore += 5; // Concrete numbers increase hook CTR
    }
    if (hook.length >= 24 && hook.length <= 110) {
      hookScore += 5; // Ideal concise length
    }

    // B. Negative Downranking Signals
    if (
      lowerHook.includes('welcome back') ||
      lowerHook.includes('hey guys') ||
      lowerHook.includes('hello everyone') ||
      lowerHook.includes("what's up guys") ||
      lowerHook.includes('hi everyone') ||
      lowerHook.includes('in this video') ||
      lowerHook.includes('today we are going to') ||
      lowerHook.includes("today we're going to") ||
      lowerHook.includes('today we will')
    ) {
      hookScore -= 38; // Heavy penalty for intro/greeting filler
    }
    if (/^(so basically|um yeah|you know what i mean|like i said|and so then)/i.test(lowerHook)) {
      hookScore -= 24; // Penalty for conversational throat-clearing
    }
    if (hook.length < 15) {
      hookScore -= 18;
    }

    hookScore = Math.max(15, Math.min(99, hookScore));

    // ==========================================
    // 2. STANDALONE SCORE (0-100)
    // "Would someone who has never seen the original video understand what is happening?"
    // ==========================================
    let standaloneScore = 74;

    // Positive self-contained indicators
    if (transcript.length >= 90) standaloneScore += 6;
    if (summary.length >= 35) standaloneScore += 6;
    if (context.subtopics.some((st) => lowerTranscript.includes(st.toLowerCase()) || lowerSummary.includes(st.toLowerCase()))) {
      standaloneScore += 8;
    }

    // Negative indicators: dangling external references
    if (/^(and then|also he said|like i mentioned before|as we saw earlier|in chapter \d+|referring back)/i.test(transcript)) {
      standaloneScore -= 28;
    }
    if (/\b(this guy|that thing we saw|earlier in the podcast|part one)\b/i.test(lowerTranscript)) {
      standaloneScore -= 15;
    }

    standaloneScore = Math.max(15, Math.min(98, standaloneScore));

    // ==========================================
    // 3. CONTEXT SCORE (0-100)
    // Evaluates subject richness, depth, and clarity of the premise.
    // ==========================================
    let contextScore = 72;
    if (summary.length >= 40) contextScore += 8;
    if (lowerSummary.includes('because') || lowerSummary.includes('explains') || lowerSummary.includes('focuses on') || lowerSummary.includes('discusses')) {
      contextScore += 7;
    }
    if (transcript.length >= 120) contextScore += 6;
    contextScore = Math.max(20, Math.min(96, contextScore));

    // ==========================================
    // 4. CURIOSITY SCORE (0-100)
    // Tension, cognitive dissonance, unexpected turns.
    // ==========================================
    let curiosityScore = 70;
    if (lowerHook.includes('?') || lowerHook.includes('why') || lowerHook.includes('actually') || lowerHook.includes('surprising') || lowerHook.includes('turns out') || lowerHook.includes('counter-intuitive')) {
      curiosityScore += 15;
    }
    if (/instead of|rather than|contrary to|opposite|the twist is|shocker/i.test(lowerTranscript)) {
      curiosityScore += 10;
    }
    curiosityScore = Math.max(25, Math.min(97, curiosityScore));

    // ==========================================
    // 5. PAYOFF SCORE (0-100)
    // Setup → Development → Payoff:
    // (question → answer, problem → solution, claim → explanation, mistake → lesson)
    // ==========================================
    let payoffScore = 72;
    let payoffType: 'clear_takeaway' | 'actionable_solution' | 'key_lesson' | 'insightful_conclusion' | 'standard' = 'standard';

    if (lowerPayoff.includes('solution') || lowerPayoff.includes('fix') || lowerPayoff.includes('how to solve')) {
      payoffScore += 16;
      payoffType = 'actionable_solution';
    } else if (lowerPayoff.includes('lesson') || lowerPayoff.includes('takeaway') || lowerPayoff.includes('rule')) {
      payoffScore += 15;
      payoffType = 'key_lesson';
    } else if (lowerPayoff.includes('takeaway') || lowerPayoff.includes('result') || lowerPayoff.includes('proves')) {
      payoffScore += 14;
      payoffType = 'clear_takeaway';
    } else if (lowerPayoff.includes('reason') || lowerPayoff.includes('explains why') || lowerPayoff.includes('clarifies')) {
      payoffScore += 12;
      payoffType = 'insightful_conclusion';
    }

    if (lowerTranscript.includes('therefore') || lowerTranscript.includes('which means') || lowerTranscript.includes('so the key is') || lowerTranscript.includes('bottom line is')) {
      payoffScore += 8;
    }

    // Downrank trailing or incomplete endings
    if (/^(and so\.\.\.|but yeah\.\.\.|anyway\.\.\.)$/i.test(payoff) || payoff.length < 15) {
      payoffScore -= 22;
    }

    payoffScore = Math.max(20, Math.min(98, payoffScore));

    // ==========================================
    // 6. CLARITY SCORE (0-100)
    // Sentence completeness and dialogue structure.
    // ==========================================
    let clarityScore = 75;
    if (transcript.endsWith('.') || transcript.endsWith('!') || transcript.endsWith('?')) {
      clarityScore += 8;
    }
    if (transcript.length >= 80 && transcript.length <= 450) {
      clarityScore += 8;
    }
    if (/(\.\.\.|\band\s*$|\bbut\s*$|\bso\s*$)/i.test(transcript)) {
      clarityScore -= 18; // Mid-sentence cutoff penalty
    }
    clarityScore = Math.max(20, Math.min(98, clarityScore));

    // ==========================================
    // 7. SHORT-FORM DURATION SCORE (0-100)
    // Natural sweet spot: 15–60 seconds (sweetest 22–50s).
    // ==========================================
    let shortFormScore = 75;
    if (durSec >= 22 && durSec <= 48) {
      shortFormScore += 18;
    } else if (durSec >= 15 && durSec <= 60) {
      shortFormScore += 10;
    } else if (durSec > 60 && durSec <= 75) {
      shortFormScore += 2;
    } else {
      shortFormScore -= 20; // Out of bounds
    }
    shortFormScore = Math.max(20, Math.min(99, shortFormScore));

    // ==========================================
    // 8. OVERALL COMPOSITE SCORE (0-100)
    // Balanced multi-factor evaluation:
    // Hook (25%), Payoff (25%), Standalone (20%), Clarity (10%), Short-Form (10%), Curiosity (10%)
    // ==========================================
    const overallScore = Math.round(
      hookScore * 0.25 +
      payoffScore * 0.25 +
      standaloneScore * 0.20 +
      clarityScore * 0.10 +
      shortFormScore * 0.10 +
      curiosityScore * 0.10
    );

    // ==========================================
    // 9. QUALITY TIER DETERMINATION
    // 90–100 → Excellent | 75–89 → Strong | 60–74 → Potential | below 60 → Weak
    // ==========================================
    let qualityTier: CandidateQualityTier = 'Potential';
    if (overallScore >= 90) {
      qualityTier = 'Excellent';
    } else if (overallScore >= 75) {
      qualityTier = 'Strong';
    } else if (overallScore >= 60) {
      qualityTier = 'Potential';
    } else {
      qualityTier = 'Weak';
    }

    // ==========================================
    // 10. NON-GENERIC CONTENT-GROUNDED SCORE REASON
    // ==========================================
    const scoreReason = this.buildScoreReason({
      hookScore,
      payoffScore,
      standaloneScore,
      shortFormScore,
      curiosityScore,
      overallScore,
      duration: durSec,
      hook,
      payoff,
      qualityTier,
      hookType,
      payoffType,
    });

    return {
      candidate: moment,
      hookScore,
      contextScore,
      curiosityScore,
      payoffScore,
      standaloneScore,
      clarityScore,
      shortFormScore,
      overallScore,
      qualityTier,
      scoreReason,
    };
  }

  /**
   * Deduplicate overlapping candidates, rank by overall_score DESC,
   * automatically select the strongest ones (>= 75 score), and attach selection reasons.
   */
  public deduplicateAndRank(
    moments: ScoredMoment[],
    options?: { minSelectionScore?: number }
  ): ScoredMoment[] {
    if (moments.length === 0) return [];

    const minSelectionThreshold = options?.minSelectionScore ?? 75;

    // 1. Initial sort by overallScore DESC
    const sorted = [...moments].sort((a, b) => b.overallScore - a.overallScore);

    // 2. Remove heavily overlapping duplicates (Non-Maximum Suppression)
    const deduplicated: ScoredMoment[] = [];

    for (const moment of sorted) {
      const startSec = this.parseSeconds(moment.candidate.startTime);
      const endSec = this.parseSeconds(moment.candidate.endTime);
      const durSec = Math.max(1, endSec - startSec);

      let isDuplicate = false;
      for (const accepted of deduplicated) {
        const accStart = this.parseSeconds(accepted.candidate.startTime);
        const accEnd = this.parseSeconds(accepted.candidate.endTime);
        const accDur = Math.max(1, accEnd - accStart);

        const overlapStart = Math.max(startSec, accStart);
        const overlapEnd = Math.min(endSec, accEnd);
        const overlapDur = Math.max(0, overlapEnd - overlapStart);

        // Check relative overlap against shorter segment or raw overlap seconds
        const overlapRatio = overlapDur / Math.min(durSec, accDur);
        if (overlapRatio >= 0.40 || overlapDur >= 12) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        deduplicated.push(moment);
      }
    }

    // 3. Final ranking and automatic selection assignment
    return deduplicated.map((moment, index) => {
      const rank = index + 1;
      const score = moment.overallScore;
      const dur = moment.candidate.duration;

      let selectionStatus: 'selected' | 'candidate' | 'rejected' = 'candidate';
      let selectionReason = '';

      if (score >= minSelectionThreshold) {
        // Excellent & Strong candidates are automatically selected
        selectionStatus = 'selected';
        selectionReason = `Selected (#${rank}) because it opens with a compelling hook, delivers self-contained standalone context within ${dur}, and concludes with a clear payoff.`;
      } else if (score >= 60) {
        // Potential candidates are kept as candidate for manual review
        selectionStatus = 'candidate';
        selectionReason = `Kept for review: Contains valuable insights but has a milder hook or requires minor background context.`;
      } else {
        // Weak candidates are marked rejected / downranked
        selectionStatus = 'rejected';
        selectionReason = `Downranked: Low standalone clarity, introductory filler, or lacks a self-contained payoff.`;
      }

      return {
        ...moment,
        rank,
        selectionStatus,
        selectionReason,
      };
    });
  }

  private parseSeconds(timeStr: string): number {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':').map((p) => parseInt(p, 10));
    if (parts.some((p) => isNaN(p))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  private buildScoreReason(params: {
    hookScore: number;
    payoffScore: number;
    standaloneScore: number;
    shortFormScore: number;
    curiosityScore: number;
    overallScore: number;
    duration: number;
    hook: string;
    payoff: string;
    qualityTier: CandidateQualityTier;
    hookType: string;
    payoffType: string;
  }): string {
    const { hookScore, payoffScore, standaloneScore, qualityTier, hookType, payoffType, duration } = params;

    if (qualityTier === 'Excellent') {
      const hookDesc = hookType === 'surprising_claim' ? 'surprising claim' : hookType === 'question' ? 'provocative question' : 'punchy opening hook';
      const payoffDesc = payoffType === 'actionable_solution' ? 'actionable solution' : 'clear takeaway';
      return `Top-tier vertical moment: Opens with a ${hookDesc}, provides complete context within ${duration}s, and ends with a ${payoffDesc}.`;
    }

    if (qualityTier === 'Strong') {
      if (hookScore >= 80) {
        return `Strong candidate: High-retention conversational hook with self-contained pacing and a solid conclusion.`;
      }
      return `Strong candidate: Dependable educational insight with clear standalone clarity and concise delivery (${duration}s).`;
    }

    if (qualityTier === 'Potential') {
      if (standaloneScore < 65) {
        return 'Potential moment: Interesting subject matter but benefits from additional standalone context.';
      }
      if (hookScore < 68) {
        return 'Potential moment: Solid informative insight, though the opening statement is milder.';
      }
      return 'Potential moment: Good standalone clarity with moderate hook inflection.';
    }

    return 'Weak candidate: Contains intro filler or lacks a self-contained payoff.';
  }
}
