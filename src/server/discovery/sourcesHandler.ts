import { Request, Response } from 'express';
import { getSupabaseServerClient } from './pipeline';

export async function handleSourcesRequest(req: Request, res: Response): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const workspaceId = (req.query.workspaceId as string || (req.body && req.body.workspaceId) || '').trim();
  if (!workspaceId) {
    res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'A valid workspaceId query parameter is required to fetch sources.',
    });
    return;
  }

  // Extract Bearer token if user is authenticated
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
    const { data, error } = await supabase
      .from('source_videos')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[SourcesHandler] Supabase source_videos query error:', error);
      res.status(500).json({
        success: false,
        error: error.code || 'QUERY_FAILED',
        message: error.message,
      });
      return;
    }

    const records = data || [];
    console.log(`[SourcesHandler] Fetched ${records.length} source records for workspace "${workspaceId}"`);

    res.status(200).json({
      success: true,
      sources: records,
      workspaceId,
      count: records.length,
    });
  } catch (err: any) {
    console.error('[SourcesHandler] Unexpected error:', err);
    res.status(500).json({
      success: false,
      error: 'FETCH_SOURCES_FAILED',
      message: err.message || 'An unexpected error occurred while querying sources from Supabase.',
    });
  }
}
