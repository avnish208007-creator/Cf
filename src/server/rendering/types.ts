export interface SubtitleCue {
  startTimeSec: number;
  endTimeSec: number;
  text: string;
  isHook?: boolean;
}

export interface SubtitleConfig {
  style?: 'clean' | 'minimal' | 'bold_highlight' | 'karaoke';
  fontSize?: number;
  primaryColor?: string;
  secondaryColor?: string;
  outlineColor?: string;
  position?: 'bottom' | 'middle';
  maxWordsPerLine?: number;
}

export interface BrandingConfig {
  enabled: boolean;
  brandName?: string;
  logoUrl?: string;
  watermarkText?: string;
  primaryColor?: string;
}

export interface RenderRequest {
  candidateId: string;
  workspaceId: string;
  sourceVideoId?: string;
  sourceTitle: string;
  channelTitle: string;
  startTime: string; // e.g. "01:15" or "00:01:15"
  endTime: string;   // e.g. "01:55" or "00:01:55"
  durationSeconds?: number;
  hook: string;
  transcriptText?: string;
  summary?: string;
  sourceYoutubeUrl?: string;
  mediaUrl?: string;
  mediaPath?: string;
  reframeMode?: 'centered_crop' | 'blurred_stack' | 'contain_pad';
  subtitles?: SubtitleConfig;
  branding?: BrandingConfig;
  isDevTest?: boolean;
}

export interface MediaSourceInfo {
  available: boolean;
  filePath?: string;
  mimeType?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  isAuthorized: boolean;
  sourceType: 'local_file' | 'direct_url' | 'compliant_stream' | 'unavailable';
  errorCode?: string;
  errorMessage?: string;
  technicalDetails?: string;
}

export interface RenderResult {
  success: boolean;
  clipId: string;
  jobId: string;
  status: 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  outputFilePath?: string;
  durationSeconds: number;
  durationFormatted: string;
  aspectRatio: '9:16';
  width: number;
  height: number;
  fileSizeBytes?: number;
  errorCode?: string;
  errorMessage?: string;
  technicalDetails?: string;
}

export interface RenderJobState {
  id: string;
  workspaceId: string;
  candidateId: string;
  status: 'queued' | 'acquiring_media' | 'media_acquired' | 'validating_media' | 'rendering' | 'validating_output' | 'uploading' | 'persisting' | 'completed' | 'failed' | 'processing';
  stage: string;
  progress?: number;
  errorCode?: string;
  errorMessage?: string;
  technicalDetails?: string;
  outputUrl?: string;
  createdAt: string;
  updatedAt: string;
}
