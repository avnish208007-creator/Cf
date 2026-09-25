import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { supabase } from '../../src/lib/supabase';
import crypto from 'crypto';

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
    const { candidateId, workspaceId } = payload;

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

    const { data: candidate } = await supabase
      .from('clip_candidates')
      .select('*')
      .eq('id', candidateId)
      .maybeSingle();

    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      await supabase.from('render_jobs').insert({
        id: jobId,
        workspace_id: workspaceId,
        type: 'vertical_render',
        target_title: `Render Clip: ${candidateId}`,
        progress: 0,
        stage: 'queued',
        status: 'queued',
        created_at: now,
      });
    } catch (_) {}

    if (candidate) {
      const existingFactors = (candidate.factors || {}) as any;
      await supabase
        .from('clip_candidates')
        .update({
          status: 'generating',
          factors: {
            ...existingFactors,
            renderStatus: 'rendering',
            activeJobId: jobId,
          },
          updated_at: now,
        })
        .eq('id', candidateId);
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
