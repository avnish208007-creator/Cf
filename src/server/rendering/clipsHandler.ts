import { Request, Response } from 'express';
import { getSupabaseServerClient } from '../discovery/pipeline';

export async function handleClipsRequest(req: Request, res: Response): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const workspaceId = (
    (req.query.workspaceId as string) ||
    (req.body && req.body.workspaceId) ||
    ''
  ).trim();

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
    let query = supabase.from('clips').select('*').order('created_at', { ascending: false });

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ClipsHandler] Supabase clips query error:', error);
      res.status(500).json({
        success: false,
        error: error.code || 'QUERY_FAILED',
        message: error.message,
      });
      return;
    }

    const records = data || [];
    console.log(`[ClipsHandler] Fetched ${records.length} clip records for workspace "${workspaceId}"`);

    res.status(200).json({
      success: true,
      clips: records,
      workspaceId,
      count: records.length,
    });
  } catch (err: any) {
    console.error('[ClipsHandler] Unexpected error:', err);
    res.status(500).json({
      success: false,
      error: 'FETCH_CLIPS_FAILED',
      message: err.message || 'An unexpected error occurred while querying clips from Supabase.',
    });
  }
}
