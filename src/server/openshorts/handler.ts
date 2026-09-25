import { Request, Response } from 'express';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { OpenShortsClient } from './client';

export async function handleOpenShortsProcess(req: Request, res: Response): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { sourceVideoId, youtubeUrl, workspaceId = DEFAULT_WORKSPACE_ID, niche } = req.body || {};

  if (!youtubeUrl || !sourceVideoId) {
    res.status(400).json({
      success: false,
      error: 'MISSING_PARAMETERS',
      message: 'youtubeUrl and sourceVideoId are required to process a video with OpenShorts.',
    });
    return;
  }

  try {
    const wsId = (workspaceId || DEFAULT_WORKSPACE_ID).trim();
    const serverUrl = process.env.APP_URL || 'http://localhost:3000';
    const webhookUrl = `${serverUrl}/api/webhooks/openshorts`;

    console.log(`[OpenShortsProcess] Sending video to OpenShorts for source ${sourceVideoId} (${youtubeUrl})`);

    // Call OpenShorts API
    const processResult = await OpenShortsClient.processVideo({
      videoUrl: youtubeUrl,
      workspaceId: wsId,
      sourceVideoId,
      niche,
      webhookUrl,
      options: {
        aspectRatio: '9:16',
        captions: true,
        autoHook: true,
      },
    });

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const jobRef = doc(db, 'workspaces', wsId, 'jobs', jobId);
    const nowISO = new Date().toISOString();

    const jobData = {
      id: jobId,
      type: 'openshorts',
      status: 'processing',
      sourceVideoId,
      openShortsJobId: processResult.jobId,
      progress: 15,
      stage: 'Processing video with OpenShorts AI',
      createdAt: nowISO,
      updatedAt: nowISO,
    };

    await setDoc(jobRef, jobData);

    // Update source status to processing
    const sourceRef = doc(db, 'workspaces', wsId, 'sources', sourceVideoId);
    await updateDoc(sourceRef, {
      status: 'processing',
      updatedAt: nowISO,
    }).catch(() => {
      // If source doc doesn't exist yet, create or ignore
    });

    res.status(200).json({
      success: true,
      jobId,
      openShortsJobId: processResult.jobId,
      status: 'processing',
      message: 'Video processing started successfully via OpenShorts.',
    });
  } catch (err: any) {
    console.error('[OpenShortsProcess] Error starting OpenShorts job:', err);
    res.status(500).json({
      success: false,
      error: 'OPENSHORTS_PROCESS_FAILED',
      message: err.message || 'Failed to start OpenShorts processing job.',
    });
  }
}

export async function handleOpenShortsWebhook(req: Request, res: Response): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const signature = req.headers['x-openshorts-signature'] || req.headers['authorization'];
  const expectedSecret = process.env.OPENSHORTS_WEBHOOK_SECRET;

  if (expectedSecret && signature !== expectedSecret && signature !== `Bearer ${expectedSecret}`) {
    console.warn('[OpenShortsWebhook] Unauthorized webhook request with invalid signature.');
    res.status(401).json({ success: false, error: 'UNAUTHORIZED_WEBHOOK' });
    return;
  }

  const { job_id, jobId, status, clips, error, metadata } = req.body || {};
  const osJobId = job_id || jobId;

  if (!osJobId) {
    res.status(400).json({ success: false, error: 'MISSING_JOB_ID' });
    return;
  }

  try {
    const workspaceId = (metadata?.workspaceId || DEFAULT_WORKSPACE_ID).trim();
    const sourceVideoId = metadata?.sourceVideoId;

    // Find job in Firestore by openShortsJobId
    const jobsRef = collection(db, 'workspaces', workspaceId, 'jobs');
    const q = query(jobsRef, where('openShortsJobId', '==', osJobId));
    const snapshot = await getDocs(q);

    let jobId = `job_${osJobId}`;
    let jobDocRef = doc(db, 'workspaces', workspaceId, 'jobs', jobId);

    if (!snapshot.empty) {
      const existingJobDoc = snapshot.docs[0];
      jobId = existingJobDoc.id;
      jobDocRef = existingJobDoc.ref;
    }

    const nowISO = new Date().toISOString();

    if (status === 'completed' || clips) {
      console.log(`[OpenShortsWebhook] Job ${osJobId} completed with ${clips?.length || 0} clips.`);

      // Update job to completed
      await setDoc(jobDocRef, {
        status: 'completed',
        progress: 100,
        stage: 'Completed',
        completedAt: nowISO,
        updatedAt: nowISO,
      }, { merge: true });

      // Save generated clips to Firestore
      if (Array.isArray(clips)) {
        for (const [idx, clipData] of clips.entries()) {
          const clipId = `clip_${osJobId}_${idx}`;
          const clipRef = doc(db, 'workspaces', workspaceId, 'clips', clipId);

          const clipRecord = {
            id: clipId,
            candidateId: `cand_${osJobId}_${idx}`,
            sourceVideoId: sourceVideoId || 'src_unknown',
            workspaceId,
            title: clipData.title || `Short Clip #${idx + 1}`,
            hookText: clipData.hook || clipData.title || 'High-impact moment',
            videoUrl: clipData.download_url || clipData.video_url || '',
            thumbnailUrl: clipData.thumbnail_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60',
            duration: `${clipData.duration || 45}s`,
            durationSeconds: clipData.duration || 45,
            width: 1080,
            height: 1920,
            aspectRatio: '9:16',
            status: 'ready',
            score: clipData.score || 90,
            caption: clipData.caption || '',
            hashtags: clipData.hashtags || ['Shorts', 'AI'],
            openShortsJobId: osJobId,
            openShortsClipIndex: clipData.index ?? idx,
            createdAt: nowISO,
            updatedAt: nowISO,
          };

          await setDoc(clipRef, clipRecord, { merge: true });
        }
      }

      // Update source status to completed
      if (sourceVideoId) {
        const sourceRef = doc(db, 'workspaces', workspaceId, 'sources', sourceVideoId);
        await updateDoc(sourceRef, {
          status: 'analyzed',
          updatedAt: nowISO,
        }).catch(() => {});
      }
    } else if (status === 'failed') {
      await setDoc(jobDocRef, {
        status: 'failed',
        error: error || 'OpenShorts processing failed',
        updatedAt: nowISO,
      }, { merge: true });

      if (sourceVideoId) {
        const sourceRef = doc(db, 'workspaces', workspaceId, 'sources', sourceVideoId);
        await updateDoc(sourceRef, {
          status: 'failed',
          updatedAt: nowISO,
        }).catch(() => {});
      }
    }

    res.status(200).json({ success: true, received: true });
  } catch (err: any) {
    console.error('[OpenShortsWebhook] Error processing webhook:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function handleOpenShortsJobStatus(req: Request, res: Response): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const jobId = req.params.jobId;
  const workspaceId = (req.query.workspaceId as string || DEFAULT_WORKSPACE_ID).trim();

  try {
    const jobRef = doc(db, 'workspaces', workspaceId, 'jobs', jobId);
    const jobSnap = await getDoc(jobRef);

    if (!jobSnap.exists()) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    const jobData = jobSnap.data();

    // If job has openShortsJobId and is still processing, check status from OpenShorts API
    if (jobData.status === 'processing' && jobData.openShortsJobId) {
      const osStatus = await OpenShortsClient.getJobStatus(jobData.openShortsJobId);
      if (osStatus.success && osStatus.job) {
        const nowISO = new Date().toISOString();
        if (osStatus.job.status === 'completed' && osStatus.job.clips) {
          // Save clips to Firestore
          for (const [idx, clipData] of osStatus.job.clips.entries()) {
            const clipId = `clip_${jobData.openShortsJobId}_${idx}`;
            const clipRef = doc(db, 'workspaces', workspaceId, 'clips', clipId);
            const clipRecord = {
              id: clipId,
              candidateId: `cand_${jobData.openShortsJobId}_${idx}`,
              sourceVideoId: jobData.sourceVideoId || 'src_unknown',
              workspaceId,
              title: clipData.title || `Short Clip #${idx + 1}`,
              hookText: clipData.hook || clipData.title || 'High-impact moment',
              videoUrl: clipData.download_url || clipData.video_url || '',
              thumbnailUrl: clipData.thumbnail_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60',
              duration: `${clipData.duration || 45}s`,
              durationSeconds: clipData.duration || 45,
              width: 1080,
              height: 1920,
              aspectRatio: '9:16',
              status: 'ready',
              score: clipData.score || 90,
              caption: clipData.caption || '',
              hashtags: clipData.hashtags || ['Shorts', 'AI'],
              openShortsJobId: jobData.openShortsJobId,
              openShortsClipIndex: clipData.index ?? idx,
              createdAt: nowISO,
              updatedAt: nowISO,
            };
            await setDoc(clipRef, clipRecord, { merge: true });
          }

          await updateDoc(jobRef, {
            status: 'completed',
            progress: 100,
            stage: 'Completed',
            completedAt: nowISO,
            updatedAt: nowISO,
          });

          if (jobData.sourceVideoId) {
            const sourceRef = doc(db, 'workspaces', workspaceId, 'sources', jobData.sourceVideoId);
            await updateDoc(sourceRef, { status: 'analyzed', updatedAt: nowISO }).catch(() => {});
          }

          jobData.status = 'completed';
          jobData.progress = 100;
        }
      }
    }

    res.status(200).json({ success: true, job: jobData });
  } catch (err: any) {
    console.error('[OpenShortsJobStatus] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
