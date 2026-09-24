export interface RelevanceTarget {
  niche: string;
  subtopics: string[];
  language?: string;
  minScore?: number;
}

export interface CandidateSourceData {
  title: string;
  summary: string;
  channelTitle: string;
  niche?: string;
  durationSeconds?: number;
}

export interface RelevanceResult {
  score: number;
  isRelevant: boolean;
  matchedSubtopics: string[];
  explanation: string;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'or', 'how', 'why', 'what', 'your', 'you', 'this', 'their',
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
 * Analyzes the semantic relevance of a candidate video against the active workspace niche & subtopics.
 * Compares discovered source against niche/subtopics, produces 0-100 score, and explains the match.
 * Rejects obviously irrelevant sources.
 */
export function analyzeRelevance(
  candidate: CandidateSourceData,
  target: RelevanceTarget
): RelevanceResult {
  const rejectionThreshold = 65;
  const nicheKeywords = extractKeywords(target.niche);
  const candidateText = `${candidate.title} ${candidate.summary} ${candidate.channelTitle} ${candidate.niche || ''}`.toLowerCase();

  // 1. Check primary niche keywords
  const matchedNicheKeywords: string[] = [];
  for (const kw of nicheKeywords) {
    if (candidateText.includes(kw)) {
      matchedNicheKeywords.push(kw);
    }
  }

  // 2. Check matched subtopics
  const matchedSubtopics: string[] = [];
  for (const sub of target.subtopics) {
    const subKeywords = extractKeywords(sub);
    const hasWordMatch = subKeywords.some((kw) => candidateText.includes(kw));
    if (hasWordMatch || candidateText.includes(sub.toLowerCase().trim())) {
      matchedSubtopics.push(sub);
    }
  }

  // 3. Scoring
  let calculatedScore = 20;

  const hasNicheMatch = matchedNicheKeywords.length > 0;
  const hasSubtopicMatch = matchedSubtopics.length > 0;

  if (hasNicheMatch && hasSubtopicMatch) {
    // Top-tier match: matches both overarching niche and specific subtopic
    const nicheRatio = matchedNicheKeywords.length / Math.max(1, nicheKeywords.length);
    calculatedScore = 75 + Math.round(nicheRatio * 15) + Math.min(6, matchedSubtopics.length * 3);
  } else if (hasSubtopicMatch) {
    // Direct subtopic match: monitored topic in the workspace
    calculatedScore = 72 + Math.min(18, matchedSubtopics.length * 8);
  } else if (hasNicheMatch) {
    // Primary niche match without specific subtopic match
    const nicheRatio = matchedNicheKeywords.length / Math.max(1, nicheKeywords.length);
    calculatedScore = 68 + Math.round(nicheRatio * 20);
  } else {
    // Completely off-topic (e.g. cute animals, unrelated entertainment)
    calculatedScore = 15;
  }

  // Educational depth modifiers
  const depthKeywords = [
    'deep dive', 'masterclass', 'science', 'breakdown', 'blueprint', 'architecture',
    'framework', 'guide', 'biomechanics', 'methodology', 'protocol', 'systems',
    'principles', 'case study', 'analysis', 'investing', 'strategy', 'engineering',
    'recovery', 'stoic', 'epistemology', 'optimal', 'foundations',
  ];
  const depthMatches = depthKeywords.filter((dk) => candidateText.includes(dk)).length;
  if (hasNicheMatch || hasSubtopicMatch) {
    calculatedScore += Math.min(6, depthMatches * 2);
  }

  const score = Math.max(10, Math.min(99, Math.round(calculatedScore)));
  const isRelevant = score >= rejectionThreshold;

  // 4. Detailed explanation
  let explanation = '';
  if (isRelevant) {
    if (hasNicheMatch && hasSubtopicMatch) {
      explanation = `Directly matches active niche "${target.niche}" and monitored subtopic "${matchedSubtopics[0]}". Comprehensive subject depth optimal for high-retention clips.`;
    } else if (hasSubtopicMatch) {
      explanation = `Matches monitored subtopic "${matchedSubtopics[0]}". Strong domain relevance for ${target.niche} workspace.`;
    } else {
      explanation = `Strongly aligns with active workspace niche "${target.niche}" (found: ${matchedNicheKeywords.join(', ')}). Actionable framework for clip extraction.`;
    }
  } else {
    explanation = `Rejected (Score: ${score}/100): Content does not align with active niche "${target.niche}" or monitored subtopics (${target.subtopics.join(', ') || 'none'}).`;
  }

  return {
    score,
    isRelevant,
    matchedSubtopics,
    explanation,
  };
}
