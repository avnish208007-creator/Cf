import type { Handler, HandlerEvent } from '@netlify/functions';
import { RenderService } from '../../src/server/rendering/RenderService';
import { getSupabaseServerClient } from '../../src/server/discovery/pipeline';
import { RenderRequest } from '../../src/server/rendering/types';

export const handler: Handler = async (event: HandlerEvent) => {
  console.log('[render-background] Starting background rendering job...');

  try {
    if (event.httpMethod !== 'POST') {
      console.error('[render-background] Only POST requests are supported.');
      return { statusCode: 405 };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { payload, jobId, userAccessToken } = body;

    if (!payload || !jobId) {
      console.error('[render-background] Missing payload or jobId in request body.');
      return { statusCode: 400 };
    }

    const {
      candidateId,
      workspaceId,
      sourceVideoId,
      sourceTitle,
      channelTitle,
      startTime,
      endTime,
      durationSeconds,
      hook,
      transcriptText,
      summary,
      sourceYoutubeUrl,
      mediaUrl,
      mediaPath,
      reframeMode,
      subtitles,
      branding,
    } = payload;

    const supabase = getSupabaseServerClient(userAccessToken);
    const renderService = new RenderService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      supabase
    );

    const renderRequest: RenderRequest = {
      candidateId,
      workspaceId,
      sourceVideoId,
      sourceTitle: sourceTitle || 'Discovered Video',
      channelTitle: channelTitle || 'Creator Channel',
      startTime: startTime || '00:00',
      endTime: endTime || '00:30',
      durationSeconds: Number(durationSeconds) || undefined,
      hook: hook || 'Key takeaway insight.',
      transcriptText: transcriptText || hook || '',
      summary: summary || '',
      sourceYoutubeUrl,
      mediaUrl,
      mediaPath,
      reframeMode,
      subtitles,
      branding,
      isDevTest: false,
      jobId,
    };

    console.log(`[render-background] Executing RenderService for jobId: ${jobId}`);
    const result = await renderService.renderCandidateToVerticalClip(renderRequest);
    console.log(`[render-background] Render completed for jobId: ${jobId}. Success: ${result.success}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: result.success }),
    };
  } catch (err: any) {
    console.error('[render-background] Fatal execution exception:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
