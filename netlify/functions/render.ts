import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { RenderService } from '../../src/server/rendering/RenderService';
import { getSupabaseServerClient } from '../../src/server/discovery/pipeline';
import { RenderRequest } from '../../src/server/rendering/types';

const defaultHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: defaultHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: defaultHeaders,
      body: JSON.stringify({
        success: false,
        error: 'METHOD_NOT_ALLOWED',
        message: 'Only POST requests are supported for rendering.',
      }),
    };
  }

  try {
    const payload = event.body ? JSON.parse(event.body) : {};
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

    const authHeader =
      event.headers.authorization ||
      event.headers.Authorization ||
      '';
    const userAccessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

    if (!candidateId || !workspaceId) {
      return {
        statusCode: 400,
        headers: defaultHeaders,
        body: JSON.stringify({
          success: false,
          error: 'MISSING_PARAMETERS',
          message: 'candidateId and workspaceId are required to render.',
        }),
      };
    }

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
    };

    const result = await renderService.renderCandidateToVerticalClip(renderRequest);

    return {
      statusCode: result.success ? 200 : 422,
      headers: defaultHeaders,
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    console.error('[netlify/functions/render] error:', err);
    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({
        success: false,
        error: 'RENDER_ERROR',
        message: err.message || 'An error occurred during rendering.',
      }),
    };
  }
};
