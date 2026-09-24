import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { runDiscoveryPipeline } from '../../src/server/discovery/pipeline';
import { ProviderUnavailableError } from '../../src/server/providers/types';

const defaultHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  // Support CORS preflight
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
        message: 'Only POST requests are supported for discovery.',
      }),
    };
  }

  try {
    const payload = event.body ? JSON.parse(event.body) : {};
    const {
      workspaceId,
      workspaceName,
      niche,
      subtopics,
      language,
      freshness = 'all',
      contentType = 'all',
      knownVideoIds = [],
    } = payload;

    // Extract Bearer token if user is authenticated
    const authHeader =
      event.headers.authorization ||
      event.headers.Authorization ||
      '';
    const userAccessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

    if (!workspaceId || typeof workspaceId !== 'string' || !workspaceId.trim()) {
      return {
        statusCode: 400,
        headers: defaultHeaders,
        body: JSON.stringify({
          success: false,
          error: 'BAD_REQUEST',
          message: 'A valid workspaceId is required for discovery and database persistence.',
        }),
      };
    }

    const result = await runDiscoveryPipeline({
      workspaceId: workspaceId.trim(),
      workspaceName: workspaceName ? String(workspaceName).trim() : undefined,
      niche: niche ? String(niche).trim() : undefined,
      subtopics: Array.isArray(subtopics) ? subtopics : undefined,
      language: language ? String(language).trim() : undefined,
      freshness,
      contentType,
      knownVideoIds: Array.isArray(knownVideoIds) ? knownVideoIds : [],
      userAccessToken,
    });

    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    console.error('[Discovery] Netlify function discovery error:', err);

    if (err instanceof ProviderUnavailableError || err?.code === 'DISCOVERY_PROVIDER_UNAVAILABLE') {
      return {
        statusCode: 503,
        headers: defaultHeaders,
        body: JSON.stringify({
          success: false,
          error: 'DISCOVERY_PROVIDER_UNAVAILABLE',
          message:
            err.message ||
            'Discovery provider is unavailable in this serverless environment.',
          provider: 'development',
        }),
      };
    }

    return {
      statusCode: err?.status || (err?.message?.includes('violates') ? 403 : 500),
      headers: defaultHeaders,
      body: JSON.stringify({
        success: false,
        error: 'DISCOVERY_FAILED',
        message: err?.message || 'An unexpected error occurred during discovery.',
      }),
    };
  }
};
