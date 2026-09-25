export type JobStatus = 'queued' | 'dispatching' | 'resolving' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type JobStage =
  | 'queued'
  | 'dispatching'
  | 'resolving'
  | 'downloading'
  | 'extracting_media'
  | 'transcribing'
  | 'finding_moments'
  | 'rendering'
  | 'subtitles'
  | 'uploading'
  | 'completed'
  | 'failed';

export interface ProcessingJob {
  id: string;
  workspaceId: string;
  type: string;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  sourceVideoId?: string;
  candidateId?: string;
  clipId?: string;
  error?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
