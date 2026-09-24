import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { getSupabaseServerClient } from '../../src/server/discovery/pipeline';

const defaultHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: defaultHeaders,
      body: '',
    };
  }

  const workspaceId =
    event.queryStringParameters?.workspaceId ||
    (event.body ? JSON.parse(event.body).workspaceId : '');

  if (!workspaceId || typeof workspaceId !== 'string' || !workspaceId.trim()) {
    return {
      statusCode: 400,
      headers: defaultHeaders,
      body: JSON.stringify({
        success: false,
        error: 'BAD_REQUEST',
        message: 'A valid workspaceId parameter is required to fetch sources.',
      }),
    };
  }

  const authHeader =
    event.headers.authorization ||
    event.headers.Authorization ||
    '';
  const userAccessToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined;

  const supabase = getSupabaseServerClient(userAccessToken);
  if (!supabase) {
    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({
        success: false,
        error: 'SERVER_CONFIG_ERROR',
        message: 'Supabase server client could not be initialized.',
      }),
    };
  }

  try {
    const { data, error } = await supabase
      .from('source_videos')
      .select('*')
      .eq('workspace_id', workspaceId.trim())
      .order('created_at', { ascending: false });

    if (error) {
      return {
        statusCode: 500,
        headers: defaultHeaders,
        body: JSON.stringify({
          success: false,
          error: error.code || 'QUERY_FAILED',
          message: error.message,
        }),
      };
    }

    const records = data || [];
    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: JSON.stringify({
        success: true,
        sources: records,
        workspaceId: workspaceId.trim(),
        count: records.length,
      }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({
        success: false,
        error: 'FETCH_SOURCES_FAILED',
        message: err.message || 'An unexpected error occurred while fetching sources.',
      }),
    };
  }
};
