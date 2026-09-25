import { Request, Response } from 'express';
import { supabase } from '../../lib/supabase';

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

  try {
    let queryBuilder = supabase.from('clips').select('*');
    if (workspaceId) {
      queryBuilder = queryBuilder.eq('workspace_id', workspaceId);
    }
    const { data: records, error } = await queryBuilder.order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    console.log(`[ClipsHandler] Fetched ${(records || []).length} clip records for workspace "${workspaceId}"`);

    res.status(200).json({
      success: true,
      clips: records || [],
      workspaceId,
      count: (records || []).length,
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
