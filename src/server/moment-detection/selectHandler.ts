import { Request, Response } from 'express';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { SourceMediaProvider } from '../rendering/SourceMediaProvider';

export async function handleCandidateSelectRequest(req: Request, res: Response): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { candidateId, workspaceId = DEFAULT_WORKSPACE_ID } = req.body || {};

  if (!candidateId) {
    res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'candidateId is required.',
    });
    return;
  }

  console.log(`[Render] candidate selected: ${candidateId}`);

  try {
    const effectiveWsId = workspaceId.trim() || DEFAULT_WORKSPACE_ID;
    const candRef = doc(db, 'workspaces', effectiveWsId, 'candidates', candidateId);
    const candSnap = await getDoc(candRef);

    if (!candSnap.exists()) {
      res.status(404).json({
        success: false,
        error: 'CANDIDATE_NOT_FOUND',
        message: `Candidate ${candidateId} not found.`,
      });
      return;
    }

    const candidate = candSnap.data();
    const factors = (candidate.factors || {}) as any;

    let sourceVideo: any = null;
    if (candidate.sourceVideoId) {
      const srcRef = doc(db, 'workspaces', effectiveWsId, 'sources', candidate.sourceVideoId);
      const srcSnap = await getDoc(srcRef);
      if (srcSnap.exists()) {
        sourceVideo = srcSnap.data();
      }
    }

    const updatedFactorsInitial = {
      ...factors,
      selectionStatus: 'selected',
      renderStatus: 'acquiring_media',
      selectedAt: new Date().toISOString(),
    };

    await setDoc(
      candRef,
      {
        status: 'approved',
        factors: updatedFactorsInitial,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    const mediaProvider = new SourceMediaProvider();
    let mediaResult: any;

    try {
      const sourceInfo = await mediaProvider.acquire({
        id: sourceVideo?.id || candidate.sourceVideoId || candidateId,
        youtube_url: sourceVideo?.youtubeUrl || factors.sourceYoutubeUrl || '',
        mediaUrl: sourceVideo?.mediaUrl || candidate.mediaUrl,
        mediaPath: sourceVideo?.mediaPath || candidate.mediaPath,
        title: sourceVideo?.title || candidate.sourceTitle || '',
      });

      mediaResult = {
        success: true,
        status: 'available',
        mediaPath: sourceInfo.localPath,
        mediaUrl: sourceInfo.sourceUrl,
      };
    } catch (err: any) {
      mediaResult = {
        success: false,
        status: 'failed',
        errorCode: 'MEDIA_ACQUISITION_FAILED',
        errorMessage: err.message || 'Source media could not be acquired.',
      };
    }

    let finalRenderStatus: 'media_ready' | 'failed' | 'unavailable' = 'failed';
    let mediaErrorMessage = mediaResult.errorMessage;
    let mediaErrorCode = mediaResult.errorCode;

    if (mediaResult.success && mediaResult.status === 'available' && mediaResult.mediaPath) {
      finalRenderStatus = 'media_ready';
      if (sourceVideo?.id) {
        const srcRef = doc(db, 'workspaces', effectiveWsId, 'sources', sourceVideo.id);
        await setDoc(
          srcRef,
          {
            mediaStatus: 'available',
            mediaPath: mediaResult.mediaPath,
            mediaUrl: mediaResult.mediaUrl,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } else {
      finalRenderStatus = 'failed';
      if (sourceVideo?.id) {
        const srcRef = doc(db, 'workspaces', effectiveWsId, 'sources', sourceVideo.id);
        await setDoc(
          srcRef,
          {
            mediaStatus: 'unavailable',
            mediaError: mediaResult.errorMessage || mediaResult.errorCode,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    }

    const finalFactors = {
      ...updatedFactorsInitial,
      renderStatus: finalRenderStatus,
      mediaStatus: mediaResult.status,
      mediaErrorCode,
      mediaErrorMessage,
      mediaTechnicalDetails: mediaResult.technicalDetails,
      mediaPath: mediaResult.mediaPath,
      mediaUrl: mediaResult.mediaUrl,
    };

    await setDoc(
      candRef,
      {
        factors: finalFactors,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    res.status(200).json({
      success: true,
      candidateId,
      workspaceId: effectiveWsId,
      status: 'approved',
      selectionStatus: 'selected',
      renderStatus: finalRenderStatus,
      mediaResult,
      candidate: {
        id: candidateId,
        ...candidate,
        status: 'approved',
        factors: finalFactors,
      },
    });
  } catch (err: any) {
    console.error(`[Render] candidate selection error for ${candidateId}:`, err);
    res.status(500).json({
      success: false,
      error: 'SELECT_FAILED',
      message: err.message || 'Failed to select candidate and acquire source media.',
    });
  }
}
