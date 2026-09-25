import { db } from '../../lib/firebase';
import { doc, getDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { JobStage, JobStatus } from './types';
import { triggerGitHubWorkflow } from '../providers/githubWorkflowTrigger';

export class PipelineWorker {
  private cancelledJobs: Set<string> = new Set();

  public cancelJob(jobId: string) {
    this.cancelledJobs.add(jobId);
    console.log(`[PipelineWorker] Job ${jobId} marked as cancelled.`);
  }

  private isCancelled(jobId: string): boolean {
    return this.cancelledJobs.has(jobId);
  }

  /**
   * V1 Architecture: Triggers GitHub Actions ephemeral runner to execute
   * Piped resolution → download → Whisper transcription → moment detection → FFmpeg render → Firebase storage upload.
   */
  async processSource(workspaceId: string, sourceVideoId: string, jobId: string) {
    const jobRef = doc(db, 'workspaces', workspaceId, 'jobs', jobId);
    const sourceRef = doc(db, 'workspaces', workspaceId, 'sources', sourceVideoId);

    const updateJob = async (
      stage: JobStage,
      progress: number,
      status: JobStatus = 'processing',
      error?: string,
      errorCode?: string
    ) => {
      try {
        if (this.isCancelled(jobId) && status === 'completed') {
          status = 'cancelled';
        }
        await updateDoc(jobRef, {
          stage,
          progress,
          status,
          error: error || null,
          errorCode: errorCode || null,
          updatedAt: new Date().toISOString(),
          ...(status === 'completed' || status === 'failed' || status === 'cancelled'
            ? { completedAt: new Date().toISOString() }
            : {}),
        });
      } catch (e) {
        console.error(`[PipelineWorker] Failed to update job status for ${jobId}:`, e);
      }
    };

    try {
      if (this.isCancelled(jobId)) {
        await updateJob('failed', 0, 'cancelled', 'Job was cancelled before execution.');
        return;
      }

      // Fetch Source
      const sourceSnap = await getDoc(sourceRef);
      if (!sourceSnap.exists()) {
        throw new Error(`Source video '${sourceVideoId}' not found in Firestore.`);
      }
      const sourceData = sourceSnap.data();
      const youtubeUrl =
        sourceData.youtubeUrl || `https://www.youtube.com/watch?v=${sourceData.youtubeVideoId || sourceVideoId}`;

      // Step 1: Dispatching to GitHub Actions
      await updateJob('queued', 5, 'dispatching' as any);
      await updateDoc(sourceRef, { status: 'dispatching', updatedAt: new Date().toISOString() });

      if (this.isCancelled(jobId)) {
        await updateJob('failed', 5, 'cancelled', 'Job cancelled.');
        return;
      }

      console.log(`[PipelineWorker] Dispatching GitHub Actions workflow for job ${jobId} (Video: ${youtubeUrl})...`);
      const dispatchResult = await triggerGitHubWorkflow({
        jobId,
        sourceVideoId,
        youtubeUrl,
        workspaceId,
      });

      if (!dispatchResult.success) {
        throw new Error(dispatchResult.error || 'Failed to dispatch GitHub Actions workflow.');
      }

      await updateJob('resolving', 15, 'processing');
      await updateDoc(sourceRef, { status: 'processing', updatedAt: new Date().toISOString() });

      console.log(`[PipelineWorker] GitHub Actions workflow dispatched successfully for job ${jobId}. Runner is now processing asynchronously.`);
    } catch (err: any) {
      console.error(`[PipelineWorker] Job ${jobId} dispatch failed:`, err);
      const errorMessage = err?.message || 'Unknown dispatch error';
      let errorCode = 'GITHUB_DISPATCH_FAILED';
      if (errorMessage.includes('GITHUB_TOKEN_MISSING')) errorCode = 'GITHUB_TOKEN_MISSING';
      else if (errorMessage.includes('GITHUB_REPOSITORY_MISSING')) errorCode = 'GITHUB_REPOSITORY_MISSING';

      await updateJob('failed', 100, 'failed', errorMessage, errorCode);
      try {
        await updateDoc(sourceRef, { status: 'failed', error: errorMessage, updatedAt: new Date().toISOString() });
      } catch {}
    }
  }
}

export const pipelineWorker = new PipelineWorker();
