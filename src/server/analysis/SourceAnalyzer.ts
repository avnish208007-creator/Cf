import {
  CandidateRawInput,
  RelevanceAndQualityResult,
  SourceTargetConfig,
} from './types';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'could', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having',
  'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most',
  'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same',
  'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your',
  'yours', 'yourself', 'yourselves', 'video', 'watch', 'full', 'episode',
]);

function extractKeywords(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * SOURCE ANALYZER
 * Evaluates:
 * 1. Deep Niche Relevance (Title, Description, Channel, Audience, Language)
 *    Enforces STRICT niche alignment:
 *    - A video mentioning one keyword is NOT automatically considered relevant.
 *    - Rejects peripheral or tangential videos (e.g., "Best Camera Settings for Gym Videos" or "Funny Moments at Gym" in Fitness/Workout Science).
 *    - Requires genuine topical value to the niche's audience.
 * 2. Content Quality (Substantive value vs promotional, buzzword-heavy, low-information content).
 */
export class SourceAnalyzer {
  public static analyze(
    candidate: CandidateRawInput,
    target: SourceTargetConfig
  ): RelevanceAndQualityResult {
    const fullText = [
      candidate.title || '',
      candidate.description || '',
      candidate.summary || '',
      candidate.channelTitle || '',
      candidate.niche || '',
    ].join(' ').toLowerCase();

    const titleLower = (candidate.title || '').toLowerCase();
    const nicheKeywords = extractKeywords(target.niche);

    // ------------------------------------------------------------------------
    // 1. Genuine Niche & Subtopic Relevance (Strict multi-factor analysis)
    // ------------------------------------------------------------------------
    let nicheMatches = 0;
    const matchedNicheTerms: string[] = [];

    for (const kw of nicheKeywords) {
      if (titleLower.includes(kw)) {
        nicheMatches += 2; // Extra weight for title presence
        matchedNicheTerms.push(kw);
      } else if (fullText.includes(kw)) {
        nicheMatches += 1;
        matchedNicheTerms.push(kw);
      }
    }

    // Match monitored subtopics with strict semantic criteria
    const matchedSubtopics: string[] = [];
    for (const sub of target.subtopics) {
      const subLower = sub.toLowerCase().trim();
      const subKeywords = extractKeywords(sub);
      
      const titleMatchesSub = titleLower.includes(subLower);
      const allSubWordsMatch =
        subKeywords.length > 0 &&
        subKeywords.every((kw) => fullText.includes(kw));
      const titleMatchesSubWords =
        subKeywords.length > 0 &&
        subKeywords.some((kw) => titleLower.includes(kw));

      if (titleMatchesSub || (allSubWordsMatch && titleMatchesSubWords)) {
        matchedSubtopics.push(sub);
      } else if (fullText.includes(subLower) && nicheMatches > 0) {
        matchedSubtopics.push(sub);
      }
    }

    // Peripheral / Tangential penalties
    // Example: "camera settings for gym videos" in Fitness (creator gear != fitness)
    // Example: "funny moments / memes / compilation" (entertainment != educational niche value)
    const peripheralPatterns = [
      'funny moments', 'comedy sketches', 'meme compilation', 'bloopers',
      'prank', 'camera settings for', 'lens review', 'gear review',
      'how to edit', 'vlog daily life', 'reacting to', 'try not to laugh',
    ];
    let isPeripheral = false;
    for (const p of peripheralPatterns) {
      if (titleLower.includes(p)) {
        isPeripheral = true;
        break;
      }
    }

    const titleMatchesNiche = nicheKeywords.some((kw) => titleLower.includes(kw));
    const titleMatchesSubtopic = matchedSubtopics.some((sub) =>
      titleLower.includes(sub.toLowerCase())
    );

    // Language alignment
    let languageBonus = 0;
    if (target.language && target.language.toLowerCase().includes('english')) {
      const hasNonLatin = /[^\u0000-\u007F\u0080-\u00FF]/.test(candidate.title);
      if (!hasNonLatin) languageBonus = 3;
    }

    // Compute baseline relevance
    let baseRelevance = 20;

    if (isPeripheral) {
      // Downrank tangential content even if it contains a niche keyword (e.g. "gym camera" or "funny gym")
      baseRelevance = 30;
    } else if (matchedSubtopics.length > 0 && (titleMatchesNiche || titleMatchesSubtopic)) {
      // Top Tier: Matches subtopic and explicitly addresses niche in title
      baseRelevance = 86 + Math.min(10, matchedSubtopics.length * 3);
    } else if (matchedSubtopics.length > 0) {
      // Subtopic matched in description/text with good niche context
      baseRelevance = 76 + Math.min(8, matchedSubtopics.length * 2);
    } else if (titleMatchesNiche && nicheMatches >= 2) {
      // Broad niche match in title with multiple matching terms
      baseRelevance = 70;
    } else if (nicheMatches >= 2) {
      // Mentions multiple terms in description, but title isn't directly focused
      baseRelevance = 50;
    } else if (nicheMatches === 1) {
      // Single weak keyword mention: NOT considered relevant
      baseRelevance = 30;
    } else {
      // Off-topic completely
      baseRelevance = 15;
    }

    const relevanceScore = Math.max(10, Math.min(99, Math.round(baseRelevance + languageBonus)));
    const isOffTopic = relevanceScore < 55;

    // ------------------------------------------------------------------------
    // 2. Content Quality Scoring
    // ------------------------------------------------------------------------
    let qualityScore = 70; // baseline

    // Strong substantive quality signals
    const substantiveSignals = [
      'deep dive', 'architecture', 'breakdown', 'masterclass', 'empirical', 'benchmark',
      'case study', 'blueprint', 'first principles', 'methodology', 'framework',
      'systems', 'engineering', 'research', 'protocol', 'biomechanics', 'analysis',
      'science', 'scientific', 'guide', 'explained', 'study',
    ];
    let substantiveCount = 0;
    for (const sig of substantiveSignals) {
      if (fullText.includes(sig)) substantiveCount++;
    }
    qualityScore += Math.min(18, substantiveCount * 4);

    // Negative / Downrank signals for low-information, promo, or repetitive videos
    const promotionalOrWeakSignals = [
      'giveaway', 'merch', 'q&a celebration', 'sponsor announcement', 'unboxing vlog',
      'reaction video', 'reacting to', 'channel update', 'livestream replay',
      'daily vlog', 'hangout stream', 'special announcement', 'behind the scenes vlog',
      'top 10 tiktok', 'compilation 202',
    ];

    let promoCount = 0;
    for (const sig of promotionalOrWeakSignals) {
      if (titleLower.includes(sig) || fullText.includes(sig)) {
        promoCount++;
      }
    }

    if (promoCount > 0) {
      qualityScore -= Math.min(35, promoCount * 14);
    }

    // Penalize extremely short titles (< 4 words)
    const titleWords = titleLower.split(/\s+/).filter(Boolean);
    if (titleWords.length < 4) {
      qualityScore -= 18;
    }

    const contentQualityScore = Math.max(15, Math.min(98, Math.round(qualityScore)));
    const isLowQualityOrPromo = contentQualityScore < 35 || promoCount >= 3;

    // ------------------------------------------------------------------------
    // Explanations
    // ------------------------------------------------------------------------
    let relevanceExplanation = '';
    if (isOffTopic) {
      relevanceExplanation = isPeripheral
        ? `Filtered: Peripheral or entertainment-focused topic that does not deliver core educational value for "${target.niche}".`
        : `Filtered: Insufficient topical alignment with "${target.niche}" or monitored subtopics (${target.subtopics.join(', ')}).`;
    } else if (matchedSubtopics.length > 0) {
      relevanceExplanation = `Directly matches monitored subtopic "${matchedSubtopics[0]}" within "${target.niche}". High topical precision.`;
    } else {
      relevanceExplanation = `Aligns with "${target.niche}" across key domain concepts (${matchedNicheTerms.slice(0, 3).join(', ')}).`;
    }

    let qualityExplanation = '';
    if (isLowQualityOrPromo) {
      qualityExplanation = 'Low substantive content: exhibits promotional, stream-filler, or low-information characteristics.';
    } else if (contentQualityScore >= 85) {
      qualityExplanation = 'High-density substantive breakdown: structured, empirical, and rich in educational value.';
    } else {
      qualityExplanation = 'Solid informational baseline with standard explanatory structure.';
    }

    return {
      relevanceScore,
      contentQualityScore,
      matchedSubtopics,
      relevanceExplanation,
      qualityExplanation,
      isOffTopic,
      isLowQualityOrPromo,
    };
  }
}
