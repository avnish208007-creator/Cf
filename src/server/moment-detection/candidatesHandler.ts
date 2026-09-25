import { Request, Response } from 'express';
import { supabase } from '../../lib/supabase';

export async function handleCandidatesRequest(req: Request, res: Response): Promise<void> {
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
    let sourcesForWorkspace: any[] = [];
    if (workspaceId) {
      const { data: srcData } = await supabase
        .from('source_videos')
        .select('*')
        .eq('workspace_id', workspaceId);
      sourcesForWorkspace = srcData || [];
    }

    let workspaceCandidates: any[] = [];
    if (workspaceId) {
      const { data: candData, error } = await supabase
        .from('clip_candidates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('score', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }
      workspaceCandidates = candData || [];
    }

    console.log(`[CandidatesHandler] Workspace: ${workspaceId} -> ${workspaceCandidates.length} candidates`);

    res.status(200).json({
      success: true,
      workspaceId,
      candidates: workspaceCandidates,
      sources: sourcesForWorkspace,
      count: workspaceCandidates.length,
    });
  } catch (err: any) {
    console.error('[CandidatesHandler] Unexpected error:', err);
    res.status(500).json({
      success: false,
      error: 'FETCH_CANDIDATES_FAILED',
      message: err.message || 'An unexpected error occurred while querying candidates from Supabase.',
    });
  }
}
