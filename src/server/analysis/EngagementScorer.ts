import { CandidateRawInput, EngagementResult } from './types';

/**
 * ENGAGEMENT SCORER
 * Evaluates whether a source contains compelling, scroll-stopping hooks and ideas:
 * - Curiosity & surprising conclusions
 * - Strong, contrarian claims
 * - Actionable frameworks vs vague theory
 * - Disagreement/debate, mistakes/failures
 * - Myth vs reality
 * Heavily downranks generic introductions, repetitive explanations, announcements, and ads.
 */
export class EngagementScorer {
  public static score(candidate: CandidateRawInput): EngagementResult {
    const text = [
      candidate.title || '',
      candidate.description || '',
      candidate.summary || '',
    ].join(' ').toLowerCase();

    const titleLower = (candidate.title || '').toLowerCase();

    // 1. Curiosity Signals
    const curiosityPatterns = [
      'why ', 'the truth about', 'what happens when', 'the hidden', 'the secret',
      'nobody talks about', 'unspoken', 'the cost of', 'the dark side', 'real reason',
      'surprising', 'counter-intuitive', 'counterintuitive', 'unusual', 'curious',
    ];
    const hasCuriosity = curiosityPatterns.some((p) => text.includes(p));

    // 2. Surprising / Contrarian Claims
    const contrarianPatterns = [
      'myth', 'lie', 'stop doing', 'is dead', 'waste of time', 'doesn\'t work',
      'wrong way', 'fallacy', 'blunder', 'actually', 'instead of', 'paradox',
      'biggest mistake', 'costly mistake', 'overrated',
    ];
    const hasSurpriseOrContrarian = contrarianPatterns.some((p) => text.includes(p));

    // 3. Strong Claims & Conviction
    const strongClaimPatterns = [
      'will replace', 'never do this', 'the only way', 'breaks everything',
      'proven rule', 'guaranteed', '10x', '100x', 'game changer', 'definitive',
      'unbreakable', 'must adopt', 'fundamental shift',
    ];
    const hasStrongClaims = strongClaimPatterns.some((p) => text.includes(p));

    // 4. Actionable Frameworks & Tangible Utility
    const actionablePatterns = [
      'step-by-step', 'blueprint', 'framework', 'how to', 'protocol', 'rules for',
      'playbook', 'system', 'exact steps', 'actionable', 'guide to', 'how i',
      'how we', 'implementation', 'production-ready',
    ];
    const hasActionableFramework = actionablePatterns.some((p) => text.includes(p));

    // 5. Debate, Disagreement & Trade-Offs
    const debatePatterns = [
      ' vs ', ' versus ', 'debate', 'argument', 'trade-offs', 'tradeoffs',
      'why i disagree', 'the case against', 'critique', 'comparison', 'which is better',
    ];
    const hasDebateOrDisagreement = debatePatterns.some((p) => text.includes(p));

    // 6. Failures, Mistakes & War Stories
    const failurePatterns = [
      'failed', 'failure', 'post-mortem', 'what broke', 'disaster', 'how we ruined',
      'lost money', 'burned out', 'outage', 'catastrophe', 'rebuilding after',
    ];
    const hasFailureOrWarStory = failurePatterns.some((p) => text.includes(p));

    // 7. Demonstrations, Teardowns & Benchmarks
    const demonstrationPatterns = [
      'breakdown', 'benchmark', 'teardown', 'tested', 'measuring', 'experiment',
      'live demo', 'proof', 'empirical test', 'stress test', 'in action',
    ];
    const hasDemonstrationOrComparison = demonstrationPatterns.some((p) => text.includes(p));

    // 8. Myth vs Reality
    const mythPatterns = [
      'myth vs reality', 'expectation vs reality', 'theory vs practice',
      'what they tell you vs', 'science vs bro-science', 'hype vs reality',
    ];
    const hasMythVsReality = mythPatterns.some((p) => text.includes(p));

    // 9. Unexpected Conclusion & "I didn't know that"
    const conclusionPatterns = [
      'surprising result', 'turns out', 'discovered that', 'unforeseen',
      'unexpected', 'shocker', 'what i learned', 'the real bottleneck',
    ];
    const hasUnexpectedConclusion = conclusionPatterns.some((p) => text.includes(p));

    // Compute Engagement Baseline
    let score = 50;

    if (hasCuriosity) score += 10;
    if (hasSurpriseOrContrarian) score += 12;
    if (hasStrongClaims) score += 8;
    if (hasActionableFramework) score += 9;
    if (hasDebateOrDisagreement) score += 8;
    if (hasFailureOrWarStory) score += 10;
    if (hasDemonstrationOrComparison) score += 8;
    if (hasMythVsReality) score += 11;
    if (hasUnexpectedConclusion) score += 9;

    // Detect Penalties (Announcements, generic stream banter, advertisements)
    const penalties: string[] = [];

    const genericIntroPatterns = [
      'welcome back to my channel', 'hit subscribe', 'make sure to like',
      'before we get into it', 'sponsored by', 'in today\'s video i will talk about',
      'random thoughts', 'casual hangout',
    ];
    if (genericIntroPatterns.some((p) => text.includes(p))) {
      score -= 15;
      penalties.push('Generic introduction / sponsor boilerplate detected');
    }

    const promoPatterns = [
      'merch drop', 'annual sale', 'special discount', 'q&a stream',
      'anniversary stream', 'giveaway winner', 'stream replay',
    ];
    if (promoPatterns.some((p) => titleLower.includes(p) || text.includes(p))) {
      score -= 25;
      penalties.push('Promotional or stream-filler content angle');
    }

    // Monotone / Low-Information Academic Title penalty
    // Titles that are purely descriptive nouns without any curiosity, stakes, or tension
    const isPureMonotoneNouns =
      /^(the )?(overview|introduction|basics|lecture \d+|part \d+|chapter \d+) of/i.test(titleLower) &&
      !hasCuriosity &&
      !hasSurpriseOrContrarian;
    if (isPureMonotoneNouns) {
      score -= 18;
      penalties.push('Dry descriptive overview lacking tension or hook inflection');
    }

    const engagementScore = Math.max(15, Math.min(99, Math.round(score)));

    // Generate concise explanation
    let engagementExplanation = '';
    if (hasSurpriseOrContrarian && (hasCuriosity || hasMythVsReality)) {
      engagementExplanation = 'Challenges a widely held belief with counter-intuitive evidence and high curiosity.';
    } else if (hasFailureOrWarStory || hasDebateOrDisagreement) {
      engagementExplanation = 'Contains high-stakes conflict, lessons from failure, and direct trade-off analysis.';
    } else if (hasActionableFramework && hasDemonstrationOrComparison) {
      engagementExplanation = 'High practical utility: hands-on demonstration with concrete benchmark comparison.';
    } else if (penalties.length > 0) {
      engagementExplanation = `Low engagement pull: ${penalties[0].toLowerCase()}.`;
    } else {
      engagementExplanation = 'Standard educational narrative with moderate conversational momentum.';
    }

    return {
      engagementScore,
      signals: {
        hasCuriosity,
        hasSurpriseOrContrarian,
        hasStrongClaims,
        hasActionableFramework,
        hasDebateOrDisagreement,
        hasFailureOrWarStory,
        hasDemonstrationOrComparison,
        hasMythVsReality,
        hasUnexpectedConclusion,
      },
      penalties,
      engagementExplanation,
    };
  }
}
