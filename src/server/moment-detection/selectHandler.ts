import { Request, Response } from 'express';
import { getSupabaseServerClient } from '../discovery/pipeline';
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

  const authHeader = req.headers.authorization || '';
  const userAccessToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined;

  const supabase = getSupabaseServerClient(userAccessToken);
  if (!supabase) {
    res.status(500).json({
      success: false,
      error: 'SERVER_CONFIG_ERROR',
      message: 'Supabase server client could not be initialized.',
    });
    return;
  }

  try {
    // 1. Fetch Candidate from Supabase
    const { data: candidate, error: candErr } = await supabase
      .from('clip_candidates')
      .select('*')
      .eq('id', candidateId)
      .maybeSingle();

    if (candErr || !candidate) {
      console.error(`[Render] candidate not found: ${candidateId}`, candErr);
      res.status(404).json({
        success: false,
        error: 'CANDIDATE_NOT_FOUND',
        message: `Candidate ${candidateId} not found.`,
      });
      return;
    }

    const effectiveWsId = candidate.workspace_id || workspaceId;
    const factors = (candidate.factors || {}) as any;

    // 2. Fetch Parent Source Video
    let sourceVideo: any = null;
    if (candidate.source_video_id) {
      const { data: srcData, error: srcErr } = await supabase
        .from('source_videos')
        .select('*')
        .eq('id', candidate.source_video_id)
        .maybeSingle();

      if (srcData && !srcErr) {
        sourceVideo = srcData;
      }
    }

    console.log(`[Render] source loaded: ${sourceVideo ? sourceVideo.id : 'N/A'} (title: "${sourceVideo?.title || candidate.source_title || 'Unknown'}")`);

    // 3. Update candidate selection status to 'approved' and renderStatus to 'acquiring_media'
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
      })
      .eq('id', candidateId);

    // 4. Automatic Source Media Acquisition
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
      // Update source video if media path newly acquired
      if (sourceVideo?.id) {
        await supabase
          .from('source_videos')
          .update({
            media_status: 'available',
            media_path: mediaResult.mediaPath,
            media_url: mediaResult.mediaUrl,
            media_updated_at: new Date().toISOString(),
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
            media_updated_at: new Date().toISOString(),
          })
          .eq('id', sourceVideo.id);
      }
    }

    // 5. Persist final candidate factors
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
