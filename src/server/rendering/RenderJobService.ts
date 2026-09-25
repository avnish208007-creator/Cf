import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export type JobStatus =
  | 'queued'
  | 'acquiring_media'
  | 'validating_source'
  | 'rendering'
  | 'validating_output'
  | 'uploading'
  | 'completed'
  | 'failed';

export class RenderJobService {
  public async transition(
    jobId: string,
    status: JobStatus,
    progress: number,
    stage: string,
    errorDetails?: { code: string; message: string },
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    console.log(`[RenderJobService] Transitioning job ${jobId} to state "${status}" [${progress}%] - ${stage}`);

    const updateData: any = {
      status: status === 'completed' || status === 'failed' ? status : 'running',
      stage: status,
      progress,
      updatedAt: new Date().toISOString(),
      completedAt: status === 'completed' || status === 'failed' ? new Date().toISOString() : null,
    };

    if (errorDetails) {
      updateData.errorCode = errorDetails.code;
      updateData.errorMessage = errorDetails.message;
      updateData.status = 'failed';
      updateData.stage = 'failed';
    }

    try {
      const jobRef = doc(db, 'workspaces', workspaceId, 'jobs', jobId);
      await setDoc(jobRef, updateData, { merge: true });
    } catch (error: any) {
      console.error(`[RenderJobService] Exception updating job ${jobId}:`, error.message);
    }
  }
}
