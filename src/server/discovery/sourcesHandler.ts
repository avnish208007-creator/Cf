import { Request, Response } from 'express';
import { supabase } from '../../lib/supabase';

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

  try {
    const { data: records, error } = await supabase
      .from('source_videos')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    console.log(`[SourcesHandler] Fetched ${(records || []).length} source records for workspace "${workspaceId}"`);

    res.status(200).json({
      success: true,
      sources: records || [],
      workspaceId,
      count: (records || []).length,
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
