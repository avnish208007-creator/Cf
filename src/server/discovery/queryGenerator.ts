import { DiscoveryQueryContext } from '../providers/types';

export type DiscoveryStrategy =
  | 'educational_expert'
  | 'debates_myths'
  | 'stories_experiments'
  | 'interviews_podcasts'
  | 'recent_trends';

export interface QueryGenerationOptions {
  niche: string;
  subtopics: string[];
  language?: string;
  contentType?: 'all' | 'deep_dive' | 'interviews' | 'keynote';
  freshness?: 'all' | 'last_24h' | 'last_7d' | 'last_30d';
  maxQueries?: number;
  maxResultsPerQuery?: number;
  runIndex?: number; // Used for strategy rotation across successive runs
}

/**
 * Normalizes query string by stripping extra spaces, special characters, and ensuring clean keywords
 */
export function normalizeQueryString(raw: string): string {
  return raw
    .trim()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Discovery angle templates that explore distinct content vectors rather than simply repeating keywords.
 */
const STRATEGY_ANGLES: Record<
  DiscoveryStrategy,
  Array<(niche: string, subtopic: string) => string>
> = {
  educational_expert: [
    (n, s) => `${n} ${s} science explained breakdown`.trim(),
    (n, s) => `${n} ${s} expert masterclass guide`.trim(),
    (n, s) => `${n} ${s} things I wish I knew`.trim(),
    (n, s) => `${n} ${s} how it works deep dive`.trim(),
  ],
  debates_myths: [
    (n, s) => `${n} ${s} biggest mistakes to avoid`.trim(),
    (n, s) => `${n} ${s} myths exposed truth about`.trim(),
    (n, s) => `${n} ${s} why most fail controversy`.trim(),
    (n, s) => `${n} ${s} common belief vs reality`.trim(),
  ],
  stories_experiments: [
    (n, s) => `${n} ${s} experiment results case study`.trim(),
    (n, s) => `${n} ${s} transformation what happened`.trim(),
    (n, s) => `${n} ${s} surprising discoveries tested`.trim(),
    (n, s) => `${n} ${s} what happens when breakdown`.trim(),
  ],
  interviews_podcasts: [
    (n, s) => `${n} ${s} podcast interview full discussion`.trim(),
    (n, s) => `${n} ${s} in-depth conversation roundtable`.trim(),
    (n, s) => `${n} ${s} insider perspective debate`.trim(),
    (n, s) => `${n} ${s} deep dive presentation`.trim(),
  ],
  recent_trends: [
    (n, s) => `${n} ${s} breakthrough insights update`.trim(),
    (n, s) => `${n} ${s} future developments analysis`.trim(),
    (n, s) => `${n} ${s} new rules and frameworks`.trim(),
    (n, s) => `${n} ${s} advanced strategies`.trim(),
  ],
};

const STRATEGY_KEYS: DiscoveryStrategy[] = [
  'educational_expert',
  'debates_myths',
  'stories_experiments',
  'interviews_podcasts',
  'recent_trends',
];

/**
 * Generates a multi-angle, rotated set of discovery query contexts.
 * Guarantees that successive runs explore different query angles (Run 1 != Run 2 != Run 3).
 */
export function generateFocusedSearchQueries(
  options: QueryGenerationOptions
): DiscoveryQueryContext[] {
  const {
    niche,
    subtopics = [],
    language = 'English (US)',
    contentType = 'all',
    freshness = 'all',
    maxQueries = 4,
    maxResultsPerQuery = 12,
    runIndex = 0,
  } = options;

  const normalizedNiche = normalizeQueryString(niche || 'Technology');
  const validSubtopics = subtopics
    .map((s) => normalizeQueryString(s))
    .filter((s) => s.length > 0);

  // If no subtopics provided, generate generic variations
  const targetSubtopics =
    validSubtopics.length > 0 ? validSubtopics : [normalizedNiche, 'principles'];

  // Select primary and secondary strategies based on runIndex rotation
  const primaryStrategyIndex = Math.abs(runIndex) % STRATEGY_KEYS.length;
  const secondaryStrategyIndex = (primaryStrategyIndex + 1) % STRATEGY_KEYS.length;

  const primaryStrategy = STRATEGY_KEYS[primaryStrategyIndex];
  const secondaryStrategy = STRATEGY_KEYS[secondaryStrategyIndex];

  const queries: DiscoveryQueryContext[] = [];
  const seenQueryTexts = new Set<string>();

  const addQuery = (queryText: string, subtopic: string, strategy: DiscoveryStrategy) => {
    const cleaned = normalizeQueryString(queryText).toLowerCase();
    if (!cleaned || seenQueryTexts.has(cleaned)) return;
    seenQueryTexts.add(cleaned);

    queries.push({
      query: queryText,
      niche: normalizedNiche,
      subtopics: validSubtopics,
      language,
      contentType,
      freshness,
      maxResults: maxResultsPerQuery,
      subtopic,
    });
  };

  // 1. Angle 1 & 2 from Primary Strategy
  const primaryTemplates = STRATEGY_ANGLES[primaryStrategy];
  for (let i = 0; i < primaryTemplates.length && queries.length < maxQueries; i++) {
    const subtopic = targetSubtopics[i % targetSubtopics.length];
    const queryText = primaryTemplates[i](normalizedNiche, subtopic);
    addQuery(queryText, subtopic, primaryStrategy);
  }

  // 2. Angle 3 & 4 from Secondary Strategy for cross-angle breadth
  const secondaryTemplates = STRATEGY_ANGLES[secondaryStrategy];
  for (let i = 0; i < secondaryTemplates.length && queries.length < maxQueries; i++) {
    const subtopic = targetSubtopics[(i + 1) % targetSubtopics.length];
    const queryText = secondaryTemplates[i](normalizedNiche, subtopic);
    addQuery(queryText, subtopic, secondaryStrategy);
  }

  // 3. Fallback: Direct subtopic search if more queries requested
  if (queries.length < maxQueries) {
    for (const subtopic of targetSubtopics) {
      if (queries.length >= maxQueries) break;
      const queryText = `${normalizedNiche} ${subtopic} full guide`.trim();
      addQuery(queryText, subtopic, 'educational_expert');
    }
  }

  return queries.slice(0, maxQueries);
}
