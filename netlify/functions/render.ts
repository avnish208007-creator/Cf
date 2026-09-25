import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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

    const authHeader =
      event.headers.authorization ||
      event.headers.Authorization ||
      '';

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

    const candRef = doc(db, 'clip_candidates', candidateId);
    const candSnap = await getDoc(candRef);
    const candidate = candSnap.exists() ? candSnap.data() : null;

    if (candidate && candidate.factors && candidate.factors.activeJobId) {
      const activeJobId = candidate.factors.activeJobId;
      const jobSnap = await getDoc(doc(db, 'render_jobs', activeJobId));

      if (jobSnap.exists()) {
        const job = jobSnap.data();
        if (job.status === 'queued' || job.status === 'running') {
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
    }

    const jobId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    const now = new Date().toISOString();

    await setDoc(doc(db, 'render_jobs', jobId), {
      id: jobId,
      workspace_id: workspaceId,
      type: 'vertical_render',
      target_title: `Render Clip: ${candidateId}`,
      progress: 0,
      stage: 'queued',
      status: 'queued',
      created_at: now,
    });

    const existingFactors = (candidate?.factors || {}) as any;
    if (candSnap.exists()) {
      await updateDoc(candRef, {
        status: 'generating',
        factors: {
          ...existingFactors,
          renderStatus: 'rendering',
          activeJobId: jobId,
        }
      });
    }

    const protocol = event.headers['x-forwarded-proto'] || 'https';
    const host = event.headers.host;
    const triggerUrl = `${protocol}://${host}/.netlify/functions/render-background`;

    console.log(`[netlify/functions/render] Triggering background function at: ${triggerUrl} with jobId ${jobId}`);

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
