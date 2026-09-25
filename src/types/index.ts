export type PageRoute =
  | 'login'
  | 'onboarding'
  | 'dashboard'
  | 'discover'
  | 'candidates'
  | 'clips'
  | 'queue'
  | 'settings';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
}

export interface WorkspaceConfig {
  workspaceName: string;
  mainNiche: string;
  subtopics: string[];
  contentLanguage: string;
  contentStyle: string;
  brandName?: string;
  brandingWatermark?: boolean;
  aspectRatio: '9:16';
  targetPlatforms: string[];
  minCandidateScore: number;
  targetDuration: string;
}

export interface SourceVideo {
  id: string;
  title: string;
  description?: string;
  channelTitle: string;
  duration: string;
  durationSeconds?: number;
  viewCount: number;
  likeCount?: number;
  commentCount?: number;
  publishedAt: string;
  youtubeUrl: string;
  status: 'analyzed' | 'processing' | 'queued' | 'new' | 'failed';
  relevanceScore?: number;
  contentQualityScore?: number;
  engagementScore?: number;
  shortFormScore?: number;
  overallScore?: number;
  rejectionReason?: string;
  scoreExplanation?: string;
  matchedSubtopics?: string[];
  freshnessTag?: string;
  candidatesCount: number;
  summary: string;
  niche: string;
  thumbnailGradient: string;
  thumbnailUrl?: string;
  mediaStatus?: 'unavailable' | 'available' | 'processing' | 'failed';
  mediaProvider?: string;
  mediaReference?: string;
  mediaPath?: string;
  mediaUrl?: string;
  mediaError?: string;
  mediaUpdatedAt?: string;
  isSyntheticData?: boolean;
  is_development_source?: boolean;
  isDevelopmentSource?: boolean;
}

export interface CandidateFactors {
  hookStrength: number;
  hookScore?: number;
  standaloneContext: number;
  contextScore?: number;
  pacing: number;
  contextCompleteness?: number;
  curiosityScore?: number;
  curiosity?: number;
  payoffScore?: number;
  payoffStrength?: number;
  standaloneScore?: number;
  standaloneClarity?: number;
  clarityScore?: number;
  shortFormScore?: number;
  overallScore?: number;
  qualityTier?: 'Excellent' | 'Strong' | 'Potential' | 'Weak';
  scoreReason?: string;
  transcriptText?: string;
  hook?: string;
  payoff?: string;
  contextSummary?: string;
  emotionalFactor?: number;
  sourceYoutubeUrl?: string;
  sourceThumbnailUrl?: string;
  mediaStatus?: 'unavailable' | 'available' | 'processing' | 'failed';
  mediaPath?: string;
  rank?: number;
  selectionStatus?: 'selected' | 'candidate' | 'rejected';
  selectionReason?: string;
}

export interface ClipCandidate {
  id: string;
  workspaceId?: string;
  sourceVideoId: string;
  sourceTitle: string;
  channelTitle: string;
  startTime: string;
  endTime: string;
  duration: string;
  estimatedDuration?: string;
  hook: string;
  summary: string;
  score: number;
  qualityTier?: 'Excellent' | 'Strong' | 'Potential' | 'Weak';
  factors: CandidateFactors;
  explanation?: string;
  scoreReason?: string;
  transcriptText?: string;
  payoff?: string;
  contextSummary?: string;
  sourceThumbnailUrl?: string;
  sourceYoutubeUrl?: string;
  rank?: number;
  selectionStatus?: 'selected' | 'candidate' | 'rejected';
  selectionReason?: string;
  mediaStatus?: 'unavailable' | 'available' | 'processing' | 'failed';
  mediaUrl?: string;
  mediaPath?: string;
  renderedClipId?: string;
  status: 'new' | 'in_review' | 'generating' | 'approved' | 'rejected' | 'selected' | 'detected' | 'rendered' | 'failed';
  createdAt: string;
}

export interface Clip {
  id: string;
  candidateId?: string;
  workspaceId?: string;
  sourceVideoId?: string;
  title: string;
  hookText?: string;
  hook?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  thumbnailBg?: string;
  durationFormatted?: string;
  durationSeconds?: number;
  duration?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  score?: number;
  platform?: string;
  sourceTitle?: string;
  channelTitle?: string;
  style?: string;
  captionsSample?: string[];
  hashtags?: string[];
  progress?: number;
  status?: string;
  createdAt?: string;
  publishedUrl?: string;
  inQueue?: boolean;
  queueStatus?: string;
  scheduledSlot?: string;
}

export interface PlatformQueueItem {
  id: string;
  clipId: string;
  title: string;
  platform: 'TikTok' | 'YouTube Shorts' | 'Instagram Reels';
  scheduledTime: string;
  status: 'scheduled' | 'publishing' | 'published' | 'failed';
  hook: string;
  thumbnailUrl: string;
}

export interface QueueItem {
  id: string;
  clipId: string;
  clipTitle?: string;
  platform?: 'YouTube Shorts' | 'TikTok' | 'Instagram Reels' | string;
  platforms?: string[];
  scheduledTime?: string;
  scheduledSlot?: string;
  status?: 'scheduled' | 'publishing' | 'published' | 'failed' | 'approved' | 'needs_review' | 'exported' | string;
  title?: string;
  hook?: string;
  thumbnailUrl?: string;
  caption?: string;
  captionText?: string;
  hashtags?: string[];
  duration?: string;
  addedAt?: string;
  style?: string;
}

export interface ActiveJob {
  id: string;
  type?: 'discovery' | 'candidate_mining' | 'rendering' | 'publishing' | 'caption_generation' | 'moment_detection' | 'vertical_render' | string;
  title?: string;
  targetTitle?: string;
  progress: number;
  stage?: string;
  status?: 'running' | 'completed' | 'failed' | 'pending' | string;
  startTime?: string;
  startedAt?: string;
  details?: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  subtitle?: string;
  timestamp: string;
  type?: 'success' | 'info' | 'warning' | 'error' | 'moment_selected' | 'clip_rendered' | 'queue_approved' | string;
  category?: string;
}
