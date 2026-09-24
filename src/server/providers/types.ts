export interface DiscoveredVideo {
  id: string; // YouTube video ID or identifier
  title: string;
  description?: string;
  channelTitle: string;
  duration: string; // "MM:SS" or "HH:MM:SS"
  durationSeconds: number;
  viewCount: number;
  likeCount?: number;
  commentCount?: number;
  publishedAt: string;
  youtubeUrl: string;
  summary: string;
  niche: string;
  thumbnailGradient: string;
  thumbnailUrl?: string;
  relevanceScore: number;
  contentQualityScore?: number;
  engagementScore?: number;
  shortFormScore?: number;
  overallScore?: number;
  rejectionReason?: string;
  scoreExplanation?: string;
  relevanceExplanation?: string;
  matchedSubtopics?: string[];
  isSyntheticData?: boolean;
  is_development_source?: boolean;
  isDevelopmentSource?: boolean;
}

export interface DiscoveryQueryContext {
  query: string;
  niche: string;
  subtopics: string[];
  language?: string;
  contentType?: 'all' | 'deep_dive' | 'interviews' | 'keynote';
  freshness?: 'all' | 'last_24h' | 'last_7d' | 'last_30d';
  maxResults?: number;
  subtopic?: string;
}

export type SearchQueryOptions = DiscoveryQueryContext;

export interface IDiscoveryProvider {
  readonly name: string;
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  search(context: DiscoveryQueryContext): Promise<DiscoveredVideo[]>;
}

export interface DiscoveryPipelineOptions {
  workspaceId?: string;
  workspaceName?: string;
  niche?: string;
  subtopics?: string[];
  language?: string;
  freshness?: 'all' | 'last_24h' | 'last_7d' | 'last_30d';
  contentType?: 'all' | 'deep_dive' | 'interviews' | 'keynote';
  knownVideoIds?: string[];
  maxQueries?: number;
  maxResultsPerQuery?: number;
  minDurationSeconds?: number;
}

export interface DiscoveryPipelineResult {
  success: boolean;
  videos: DiscoveredVideo[];
  workspaceId?: string;
  totalDiscovered: number;
  totalRejected: number;
  totalInserted: number;
  returnedRecordIds?: string[];
  queriesRun: string[];
  provider: string;
  activeNiche: string;
  activeSubtopics: string[];
  error?: string;
  code?: string;
}

export class ProviderUnavailableError extends Error {
  public readonly code = 'DISCOVERY_PROVIDER_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export class ProviderExecutionError extends Error {
  public readonly code = 'DISCOVERY_PROVIDER_EXECUTION_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'ProviderExecutionError';
  }
}

