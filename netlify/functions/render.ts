import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { getSupabaseServerClient } from '../../src/server/discovery/pipeline';

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
    if (!supabase) {
      return {
        statusCode: 500,
        headers: defaultHeaders,
        body: JSON.stringify({
          success: false,
          error: 'DATABASE_UNAVAILABLE',
          message: 'Could not connect to database.',
        }),
      };
    }

    // 1. PREVENT DUPLICATE RENDERS Check
    const { data: candidate } = await supabase
      .from('clip_candidates')
      .select('*')
      .eq('id', candidateId)
      .maybeSingle();

    if (candidate && candidate.factors && candidate.factors.activeJobId) {
      const activeJobId = candidate.factors.activeJobId;
      const { data: job } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', activeJobId)
        .maybeSingle();

      if (job && (job.status === 'queued' || job.status === 'running')) {
        console.log(`[netlify/functions/render] Active job already exists: ${activeJobId}`);
        return {
          statusCode: 202,
          headers: defaultHeaders,
          body: JSON.stringify({
            success: true,
            jobId: activeJobId,
            status: 'queued',
            message: 'An active render is already in progress for this candidate. Reusing job.'
          }),
        };
      }
    }

    // 2. CREATE A NEW JOB ROW
    const jobId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    const { error: jobInsertErr } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        workspace_id: workspaceId,
        type: 'vertical_render',
        target_title: `Render Clip: ${candidateId}`,
        progress: 0,
        stage: 'queued',
        status: 'queued',
      });

    if (jobInsertErr) {
      return {
        statusCode: 500,
        headers: defaultHeaders,
        body: JSON.stringify({
          success: false,
          error: 'DATABASE_FAILURE',
          message: 'Could not create rendering job: ' + jobInsertErr.message,
        }),
      };
    }

    // Update candidate to 'generating'
    const existingFactors = (candidate?.factors || {}) as any;
    await supabase
      .from('clip_candidates')
      .update({
        status: 'generating',
        factors: {
          ...existingFactors,
          renderStatus: 'rendering',
          activeJobId: jobId,
        }
      })
      .eq('id', candidateId);

    // 3. TRIGGER NETLIFY BACKGROUND FUNCTION
    const protocol = event.headers['x-forwarded-proto'] || 'https';
    const host = event.headers.host;
    const triggerUrl = `${protocol}://${host}/.netlify/functions/render-background`;

    console.log(`[netlify/functions/render] Triggering background function at: ${triggerUrl} with jobId ${jobId}`);

    // Call the background function asynchronously
    try {
      await fetch(triggerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          payload,
          jobId,
          userAccessToken,
        }),
      });
    } catch (triggerErr: any) {
      console.error('[netlify/functions/render] Warning triggering background function:', triggerErr?.message);
    }

    return {
      statusCode: 202,
      headers: defaultHeaders,
      body: JSON.stringify({
        success: true,
        jobId,
        status: 'queued',
        message: 'Render job accepted and executing in background.',
      }),
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
