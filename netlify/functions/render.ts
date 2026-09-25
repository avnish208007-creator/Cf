import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { db, DEFAULT_WORKSPACE_ID } from '../../src/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
    const { candidateId, workspaceId = DEFAULT_WORKSPACE_ID } = payload;
    const effectiveWsId = workspaceId.trim() || DEFAULT_WORKSPACE_ID;

    if (!candidateId) {
      return {
        statusCode: 400,
        headers: defaultHeaders,
        body: JSON.stringify({
          success: false,
          error: 'MISSING_PARAMETERS',
          message: 'candidateId is required to render.',
        }),
      };
    }

    const candRef = doc(db, 'workspaces', effectiveWsId, 'candidates', candidateId);
    const candSnap = await getDoc(candRef);
    const candidate = candSnap.exists() ? candSnap.data() : null;

    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    const jobRef = doc(db, 'workspaces', effectiveWsId, 'jobs', jobId);
    try {
      await setDoc(jobRef, {
        id: jobId,
        workspaceId: effectiveWsId,
        type: 'vertical_render',
        targetTitle: `Render Clip: ${candidateId}`,
        progress: 0,
        stage: 'queued',
        status: 'queued',
        createdAt: now,
      });
    } catch (_) {}

    if (candidate) {
      const existingFactors = (candidate.factors || {}) as any;
      await setDoc(
        candRef,
        {
          status: 'generating',
          factors: {
            ...existingFactors,
            renderStatus: 'rendering',
            activeJobId: jobId,
          },
          updatedAt: now,
        },
        { merge: true }
      );
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
