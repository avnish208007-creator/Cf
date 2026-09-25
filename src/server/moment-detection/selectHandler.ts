import { Request, Response } from 'express';
import { supabase } from '../../lib/supabase';
import { SourceMediaProvider } from '../rendering/SourceMediaProvider';

export async function handleCandidateSelectRequest(req: Request, res: Response): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { candidateId, workspaceId } = req.body || {};

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
    const { data: candidate } = await supabase
      .from('clip_candidates')
      .select('*')
      .eq('id', candidateId)
      .maybeSingle();

    if (!candidate) {
      res.status(404).json({
        success: false,
        error: 'CANDIDATE_NOT_FOUND',
        message: `Candidate ${candidateId} not found.`,
      });
      return;
    }

    const effectiveWsId = candidate.workspace_id || workspaceId;
    const factors = (candidate.factors || {}) as any;

    let sourceVideo: any = null;
    if (candidate.source_video_id) {
      const { data: srcData } = await supabase
        .from('source_videos')
        .select('*')
        .eq('id', candidate.source_video_id)
        .maybeSingle();
      sourceVideo = srcData;
    }

    const updatedFactorsInitial = {
      ...factors,
      selectionStatus: 'selected',
      renderStatus: 'acquiring_media',
      selectedAt: new Date().toISOString(),
    };

    await supabase
      .from('clip_candidates')
      .update({
        status: 'approved',
        factors: updatedFactorsInitial,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId);

    const mediaProvider = new SourceMediaProvider();
    let mediaResult: any;

    try {
      const sourceInfo = await mediaProvider.acquire({
        id: sourceVideo?.id || candidate.source_video_id || candidateId,
        youtube_url: sourceVideo?.youtube_url || factors.sourceYoutubeUrl || '',
        mediaUrl: sourceVideo?.media_url || candidate.mediaUrl,
        mediaPath: sourceVideo?.media_path || candidate.mediaPath,
        title: sourceVideo?.title || candidate.source_title || '',
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
        await supabase
          .from('source_videos')
          .update({
            media_status: 'available',
            media_path: mediaResult.mediaPath,
            media_url: mediaResult.mediaUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sourceVideo.id);
      }
    } else {
      finalRenderStatus = 'failed';
      if (sourceVideo?.id) {
        await supabase
          .from('source_videos')
          .update({
            media_status: 'unavailable',
            media_error: mediaResult.errorMessage || mediaResult.errorCode,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sourceVideo.id);
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

    await supabase
      .from('clip_candidates')
      .update({
        factors: finalFactors,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId);

    res.status(200).json({
      success: true,
      candidateId,
      workspaceId: effectiveWsId,
      status: 'approved',
      selectionStatus: 'selected',
      renderStatus: finalRenderStatus,
      mediaResult,
      candidate: {
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
