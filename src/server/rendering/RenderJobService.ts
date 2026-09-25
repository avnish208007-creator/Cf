import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
    errorDetails?: { code: string; message: string }
  ): Promise<void> {
    console.log(`[RenderJobService] Transitioning job ${jobId} to state "${status}" [${progress}%] - ${stage}`);

    const updateData: any = {
      status: status === 'completed' || status === 'failed' ? status : 'running',
      stage: status,
      progress,
      completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null,
    };

    if (errorDetails) {
      updateData.error_code = errorDetails.code;
      updateData.error_message = errorDetails.message;
      updateData.status = 'failed';
      updateData.stage = 'failed';
    }

    try {
      await updateDoc(doc(db, 'render_jobs', jobId), updateData);
    } catch (error: any) {
      console.error(`[RenderJobService] Failed to update job ${jobId} in Firestore:`, error.message);
    }
  }
}
