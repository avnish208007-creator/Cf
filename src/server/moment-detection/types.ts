export interface TranscriptSegment {
  start: number; // in seconds
  duration: number; // in seconds
  text: string;
}

export interface TranscriptResult {
  available: boolean;
  source: 'captions' | 'timedtext' | 'author_transcript' | 'none';
  segments?: TranscriptSegment[];
  rawText?: string;
  reason?: string;
}

export interface VideoChapter {
  title: string;
  startTimeStr: string;
  startSeconds: number;
}

export interface ExtractedContent {
  hasContent: boolean;
  contentType: 'transcript' | 'textual_metadata' | 'none';
  videoId: string;
  videoTitle: string;
  channelTitle: string;
  description: string;
  fullText: string;
  transcriptSegments?: TranscriptSegment[];
  chapters?: VideoChapter[];
  reason?: string;
}

export interface RawMomentCandidate {
  startTime: string; // e.g. "01:24"
  endTime: string;   // e.g. "02:08"
  duration: string;  // e.g. "44s"
  durationSeconds: number;
  transcriptText: string;
  hook: string;
  contextSummary: string;
  payoff: string;
  preliminaryReason?: string;
}

export type CandidateQualityTier = 'Excellent' | 'Strong' | 'Potential' | 'Weak';

export interface ScoredMoment {
  candidate: RawMomentCandidate;
  hookScore: number;         // 0-100
  contextScore: number;      // 0-100
  curiosityScore: number;    // 0-100
  payoffScore: number;       // 0-100
  standaloneScore: number;   // 0-100
  clarityScore: number;      // 0-100
  shortFormScore: number;    // 0-100
  overallScore: number;      // 0-100
  qualityTier: CandidateQualityTier;
  scoreReason: string;
  rank?: number;
  selectionStatus?: 'selected' | 'candidate' | 'rejected';
  selectionReason?: string;
}

export interface MomentDetectionPipelineOptions {
  workspaceId: string;
  niche: string;
  subtopics: string[];
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  minCandidateScore?: number;
  targetDuration?: string;
}

export interface MomentDetectionSourceResult {
  sourceId: string;
  videoTitle: string;
  youtubeUrl: string;
  status: 'analyzed' | 'failed';
  contentStatus: 'transcript_analyzed' | 'metadata_analyzed' | 'content_unavailable';
  candidatesFound: number;
  candidates: ScoredMoment[];
  message?: string;
}
