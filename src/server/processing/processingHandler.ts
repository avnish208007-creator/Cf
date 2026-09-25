import { Request, Response } from 'express';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { PipelineWorker } from './pipelineWorker';
import crypto from 'crypto';

const worker = new PipelineWorker();

export async function handleStartProcessing(req: Request, res: Response) {
  try {
    const { workspaceId = DEFAULT_WORKSPACE_ID, sourceVideoId } = req.body || {};
    const effectiveWsId = workspaceId.trim() || DEFAULT_WORKSPACE_ID;

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
        message: 'Source video not found in database.',
      });
    }

    const jobId = 'job_' + crypto.randomUUID();
    const now = new Date().toISOString();

    const jobRef = doc(db, 'workspaces', effectiveWsId, 'jobs', jobId);
    await setDoc(jobRef, {
      id: jobId,
      workspaceId: effectiveWsId,
      type: 'video_processing',
      status: 'queued',
      stage: 'queued',
      progress: 0,
      sourceVideoId,
      createdAt: now,
      updatedAt: now,
    });

    // Run worker in background
    worker.processSource(effectiveWsId, sourceVideoId, jobId).catch((err) => {
      console.error(`[handleStartProcessing] Background worker exception for job ${jobId}:`, err);
    });

    return res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: 'Video processing job started in background.',
    });
  } catch (err: any) {
    console.error('[handleStartProcessing] Error:', err);
    return res.status(500).json({
      success: false,
      error: 'PROCESSING_START_FAILED',
      message: err.message || 'Failed to start video processing.',
    });
  }
}

export async function handleGetJobStatus(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    const { workspaceId = DEFAULT_WORKSPACE_ID } = req.query || {};
    const effectiveWsId = String(workspaceId).trim() || DEFAULT_WORKSPACE_ID;

    if (!jobId) {
      return res.status(400).json({ success: false, message: 'jobId is required.' });
    }

    const jobRef = doc(db, 'workspaces', effectiveWsId, 'jobs', jobId);
    const jobSnap = await getDoc(jobRef);

    if (!jobSnap.exists()) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
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
    const { workspaceId = DEFAULT_WORKSPACE_ID } = req.body || {};
    const effectiveWsId = String(workspaceId).trim() || DEFAULT_WORKSPACE_ID;

    const jobRef = doc(db, 'workspaces', effectiveWsId, 'jobs', jobId);
    await updateDoc(jobRef, {
      status: 'cancelled',
      stage: 'failed',
      error: 'Job cancelled by user.',
      updatedAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: 'Job cancelled.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to cancel job.' });
  }
}
