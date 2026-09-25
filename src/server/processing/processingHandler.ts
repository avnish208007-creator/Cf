import { Request, Response } from 'express';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { PipelineWorker } from './pipelineWorker';
import crypto from 'crypto';

const worker = new PipelineWorker();

export async function handleStartProcessing(req: Request, res: Response) {
  try {
    const {
      workspaceId = DEFAULT_WORKSPACE_ID,
      sourceVideoId,
      candidateId,
      startTime,
      endTime,
    } = req.body || {};

    const effectiveWsId = (workspaceId || DEFAULT_WORKSPACE_ID).trim();

    if (!sourceVideoId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SOURCE_ID',
        message: 'sourceVideoId is required to start processing.',
      });
    }

    const sourceRef = doc(db, 'workspaces', effectiveWsId, 'sources', sourceVideoId);
    const sourceSnap = await getDoc(sourceRef);

    if (!sourceSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'SOURCE_NOT_FOUND',
        message: `Source video '${sourceVideoId}' was not found in Firestore.`,
      });
    }

    // Check duplicate active jobs for this specific target
    try {
      const jobsRef = collection(db, 'workspaces', effectiveWsId, 'jobs');
      const q = query(jobsRef, where('sourceVideoId', '==', sourceVideoId));
      const existingSnap = await getDocs(q);
      const activeJob = existingSnap.docs
        .map((d) => d.data())
        .find(
          (j: any) =>
            (j.status === 'queued' || j.status === 'processing') &&
            (!candidateId || j.candidateId === candidateId)
        );

      if (activeJob) {
        return res.status(200).json({
          success: true,
          jobId: activeJob.id,
          status: activeJob.status,
          message: 'A processing job is already active for this video.',
        });
      }
    } catch (dupErr) {
      console.warn('[handleStartProcessing] Duplicate job check warning:', dupErr);
    }

    const jobId = 'job_' + crypto.randomUUID();
    const now = new Date().toISOString();

    const isCandidateRender = Boolean(candidateId);

    const jobRef = doc(db, 'workspaces', effectiveWsId, 'jobs', jobId);
    await setDoc(jobRef, {
      id: jobId,
      workspaceId: effectiveWsId,
      type: isCandidateRender ? 'candidate_render' : 'video_processing',
      status: 'queued',
      stage: 'queued',
      progress: 0,
      sourceVideoId,
      ...(candidateId ? { candidateId, startTime, endTime } : {}),
      createdAt: now,
      updatedAt: now,
    });

    if (isCandidateRender) {
      worker
        .renderCandidate(effectiveWsId, sourceVideoId, candidateId, startTime, endTime, jobId)
        .catch((err) => {
          console.error(`[handleStartProcessing] Candidate worker exception for job ${jobId}:`, err);
        });
    } else {
      worker.processSource(effectiveWsId, sourceVideoId, jobId).catch((err) => {
        console.error(`[handleStartProcessing] Pipeline worker exception for job ${jobId}:`, err);
      });
    }

    return res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: isCandidateRender ? 'Candidate render job started.' : 'Video processing job started.',
    });
  } catch (err: any) {
    console.error('[handleStartProcessing] Error starting processing:', err);
    return res.status(500).json({
      success: false,
      error: 'PROCESSING_START_FAILED',
      message: err.message || 'Failed to start video processing job.',
    });
  }
}

export async function handleGetJobStatus(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    const { workspaceId = DEFAULT_WORKSPACE_ID } = req.query || {};
    const effectiveWsId = String(workspaceId).trim() || DEFAULT_WORKSPACE_ID;

    if (!jobId) {
      return res.status(400).json({ success: false, message: 'jobId parameter is required.' });
    }

    const jobRef = doc(db, 'workspaces', effectiveWsId, 'jobs', jobId);
    const jobSnap = await getDoc(jobRef);

    if (!jobSnap.exists()) {
      return res.status(404).json({ success: false, message: `Job '${jobId}' not found.` });
    }

    return res.json({
      success: true,
      job: jobSnap.data(),
    });
  } catch (err: any) {
    console.error('[handleGetJobStatus] Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to retrieve job status.' });
  }
}

export async function handleCancelJob(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    const { workspaceId = DEFAULT_WORKSPACE_ID } = req.body || req.query || {};
    const effectiveWsId = String(workspaceId).trim() || DEFAULT_WORKSPACE_ID;

    if (!jobId) {
      return res.status(400).json({ success: false, message: 'jobId is required.' });
    }

    // Signal active worker instance to abort
    worker.cancelJob(jobId);

    const jobRef = doc(db, 'workspaces', effectiveWsId, 'jobs', jobId);
    const jobSnap = await getDoc(jobRef);
    if (!jobSnap.exists()) {
      return res.status(404).json({ success: false, message: `Job '${jobId}' not found.` });
    }

    await updateDoc(jobRef, {
      status: 'cancelled',
      stage: 'failed',
      error: 'Job cancelled by user request.',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: `Job ${jobId} successfully cancelled.` });
  } catch (err: any) {
    console.error('[handleCancelJob] Error cancelling job:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to cancel job.' });
  }
}

export async function handleRetryJob(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    const { workspaceId = DEFAULT_WORKSPACE_ID } = req.body || req.query || {};
    const effectiveWsId = String(workspaceId).trim() || DEFAULT_WORKSPACE_ID;

    if (!jobId) {
      return res.status(400).json({ success: false, message: 'jobId is required.' });
    }

    const jobRef = doc(db, 'workspaces', effectiveWsId, 'jobs', jobId);
    const jobSnap = await getDoc(jobRef);

    if (!jobSnap.exists()) {
      return res.status(404).json({ success: false, message: `Job '${jobId}' not found.` });
    }

    const jobData = jobSnap.data();
    const sourceVideoId = jobData.sourceVideoId;

    if (!sourceVideoId) {
      return res.status(400).json({ success: false, message: 'Job does not contain sourceVideoId to retry.' });
    }

    await updateDoc(jobRef, {
      status: 'queued',
      stage: 'queued',
      progress: 0,
      error: null,
      errorCode: null,
      updatedAt: new Date().toISOString(),
    });

    if (jobData.type === 'candidate_render' && jobData.candidateId) {
      worker
        .renderCandidate(
          effectiveWsId,
          sourceVideoId,
          jobData.candidateId,
          jobData.startTime,
          jobData.endTime,
          jobId
        )
        .catch((err) => {
          console.error(`[handleRetryJob] Candidate retry error for job ${jobId}:`, err);
        });
    } else {
      worker.processSource(effectiveWsId, sourceVideoId, jobId).catch((err) => {
        console.error(`[handleRetryJob] Source processing retry error for job ${jobId}:`, err);
      });
    }

    return res.json({
      success: true,
      jobId,
      status: 'queued',
      message: `Job ${jobId} restarted.`,
    });
  } catch (err: any) {
    console.error('[handleRetryJob] Error retrying job:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to retry job.' });
  }
}
