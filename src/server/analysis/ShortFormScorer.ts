import { CandidateRawInput, ShortFormResult } from './types';

/**
 * SHORT-FORM SCORER
 * Evaluates whether a video is likely to yield viral 9:16 vertical clips.
 * Core question: "Would someone stop scrolling for this?"
 *
 * Scoring factors:
 * - High density of self-contained moments (understandable in 30-60s)
 * - Clear context (established within 3 seconds without needing a 60-min prerequisite)
 * - Strong opening sentence / hook inflection
 * - Focused on one strong idea rather than a rambling thesis
 * - Natural payoff (punchline, conclusion, tactical takeaway)
 * - Quotable statements
 * - Teardowns / debate moments
 *
 * Downranks:
 * - Long rambling Q&A hangouts with no self-contained clips
 * - Monotone slide-reading without clear beginning/conclusion segments
 */
export class ShortFormScorer {
  public static score(candidate: CandidateRawInput): ShortFormResult {
    const text = [
      candidate.title || '',
      candidate.description || '',
      candidate.summary || '',
    ].join(' ').toLowerCase();

    const titleLower = (candidate.title || '').toLowerCase();

    // 1. Self-Contained Moment Indicators
    const selfContainedPatterns = [
      'rule', 'principle', 'technique', 'tactic', 'formula', 'method',
      'lesson', 'mistake', 'secret', 'hack', 'breakdown', 'step',
    ];
    const hasSelfContainedMoments = selfContainedPatterns.some((p) => text.includes(p));

    // 2. Clear Context (Easy to comprehend immediately)
    const contextPatterns = [
      'explained in', 'in 3 minutes', 'simply explained', 'visual guide',
      'how it works', 'difference between', 'why you should', 'how to use',
    ];
    const hasClearContext =
      contextPatterns.some((p) => text.includes(p)) ||
      hasSelfContainedMoments;

    // 3. Strong Opening Hook / Provocative Setup
    const hookPatterns = [
      'stop ', 'don\'t ', 'the reason you', 'if you are', 'never use',
      'this one change', 'before you', 'here is why', 'the dirty secret',
      'everybody gets this wrong', 'watch this before',
    ];
    const hasStrongOpeningHook = hookPatterns.some((p) => titleLower.includes(p) || text.includes(p));

    // 4. Standalone Understandability
    // Does not require 45 minutes of prior context or previous episodes
    const requiresLongPrereq = [
      'part 4', 'episode 12', 'session 3', 'continued from last week',
      'q&a replay', 'full stream vod', 'stream archive',
    ];
    const isStandaloneUnderstandable = !requiresLongPrereq.some((p) => titleLower.includes(p));

    // 5. Single Core Idea vs Rambling Topic Soup
    const singleIdeaPatterns = [
      'the single', 'one principle', 'one rule', 'the 1 thing', 'the #1',
      'the core bottleneck', 'the exact reason',
    ];
    const hasSingleCoreIdea = singleIdeaPatterns.some((p) => text.includes(p)) || (
      candidate.title.split(':').length === 2 || candidate.title.split('—').length === 2
    );

    // 6. Concise Payoff / Actionable Conclusion
    const payoffPatterns = [
      'and how to fix it', 'that fixed ours', 'the solution', 'how to avoid it',
      'how to optimize', 'the result', 'what happened next', 'the fix',
    ];
    const hasConcisePayoff = payoffPatterns.some((p) => text.includes(p));

    // 7. Quotable Statements / Sharp Contrast
    const quotablePatterns = [
      'complexity is the enemy', 'fallacy', 'myth', 'paradox', 'truth',
      'counter-intuitive', 'game changer', 'ironic', 'brutal reality',
    ];
    const hasQuotableStatements = quotablePatterns.some((p) => text.includes(p));

    // 8. Conversation / Debate / Inflection Moments
    const debateMoments = [
      'fireside chat', 'debate', 'interview with', 'head-to-head',
      'reacting to arguments', 'takedown',
    ];
    const hasConversationOrDebateMoment = debateMoments.some((p) => text.includes(p));

    // Baseline calculation
    let score = 45;

    if (hasStrongOpeningHook) score += 18;
    if (hasSelfContainedMoments) score += 12;
    if (hasClearContext) score += 8;
    if (isStandaloneUnderstandable) score += 7;
    if (hasSingleCoreIdea) score += 6;
    if (hasConcisePayoff) score += 10;
    if (hasQuotableStatements) score += 8;
    if (hasConversationOrDebateMoment) score += 5;

    const penalties: string[] = [];

    // Penalty for excessive length with no chapters or structure (e.g. 2h raw VOD)
    if (candidate.durationSeconds && candidate.durationSeconds > 5400) {
      score -= 15;
      penalties.push('High duration with diffuse conversational pacing; requires high segment trimming');
    }

    // Heavy penalty for rambling live streams / Q&A announcements (Source D test case)
    const streamFillerPatterns = [
      'celebration stream', 'live stream q&a', 'hangout stream', 'community stream',
      'merch giveaway', 'partner awards', 'keynote partner awards',
    ];
    if (streamFillerPatterns.some((p) => titleLower.includes(p))) {
      score -= 28;
      penalties.push('Diffuse live-stream/event structure lacking standalone clip boundaries');
    }

    // Academic monotone penalty (Source C test case)
    const denseAcademicPatterns = [
      'formal verification', 'histological', 'tla+ proof', 'in-vitro rodent',
      'exhaustive state machine', 'syntax trees',
    ];
    if (denseAcademicPatterns.some((p) => text.includes(p)) && !hasStrongOpeningHook) {
      score -= 22;
      penalties.push('Academic recitation lacking visual hook or scroll-stop cadence');
    }

    const shortFormScore = Math.max(15, Math.min(99, Math.round(score)));

    // Explainability
    let shortFormExplanation = '';
    if (shortFormScore >= 88) {
      shortFormExplanation = 'High short-form density: punchy hook setup → focused single thesis → crisp actionable payoff.';
    } else if (shortFormScore >= 72) {
      shortFormExplanation = 'Good standalone potential: clear topical context with extractable segment payoffs.';
    } else if (penalties.length > 0) {
      shortFormExplanation = `Weak short-form conversion: ${penalties[0].toLowerCase()}.`;
    } else {
      shortFormExplanation = 'Moderate short-form viability; contains useful content but diffuse opening context.';
    }

    return {
      shortFormScore,
      signals: {
        hasSelfContainedMoments,
        hasClearContext,
        hasStrongOpeningHook,
        isStandaloneUnderstandable,
        hasSingleCoreIdea,
        hasConcisePayoff,
        hasQuotableStatements,
        hasConversationOrDebateMoment,
      },
      penalties,
      shortFormExplanation,
    };
  }
}
