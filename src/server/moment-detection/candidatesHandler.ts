import { Request, Response } from 'express';
import { getSupabaseServerClient } from '../discovery/pipeline';

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
    // 1. Fetch total candidate rows in database for dev diagnostics
    const { data: allDbCandidates, error: allDbErr } = await supabase
      .from('clip_candidates')
      .select('id, workspace_id, source_video_id, status, score, created_at');

    const totalAllDb = allDbCandidates || [];

    // 2. Fetch source videos for the target workspace
    let sourcesForWorkspace: any[] = [];
    if (workspaceId) {
      const { data: srcRows } = await supabase
        .from('source_videos')
        .select('*')
        .eq('workspace_id', workspaceId);
      sourcesForWorkspace = srcRows || [];
    }

    const sourceMap = new Map<string, any>();
    const sourceIds: string[] = [];
    for (const s of sourcesForWorkspace) {
      sourceMap.set(s.id, s);
      sourceIds.push(s.id);
    }

    // 3. Fetch candidates matching workspace_id
    let workspaceCandidates: any[] = [];
    if (workspaceId) {
      const { data: cands, error: candsErr } = await supabase
        .from('clip_candidates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('score', { ascending: false });

      if (candsErr) {
        console.error('[CandidatesHandler] Error querying clip_candidates:', candsErr);
        res.status(500).json({
          success: false,
          error: candsErr.code || 'QUERY_FAILED',
          message: candsErr.message,
        });
        return;
      }
      workspaceCandidates = cands || [];
    }

    // 4. Also check if candidates exist linked through source_videos.workspace_id
    const seenIds = new Set(workspaceCandidates.map((c) => c.id));
    if (sourceIds.length > 0) {
      const { data: linkedCands } = await supabase
        .from('clip_candidates')
        .select('*')
        .in('source_video_id', sourceIds);

      if (linkedCands) {
        for (const lc of linkedCands) {
          if (!seenIds.has(lc.id)) {
            workspaceCandidates.push(lc);
            seenIds.add(lc.id);
          }
        }
      }
    }

    // 5. If any candidate references a source not yet in sourceMap, fetch that source
    const missingSourceIds = workspaceCandidates
      .map((c) => c.source_video_id)
      .filter((id) => id && !sourceMap.has(id));

    if (missingSourceIds.length > 0) {
      const { data: extraSources } = await supabase
        .from('source_videos')
        .select('*')
        .in('id', missingSourceIds);
      if (extraSources) {
        for (const es of extraSources) {
          sourceMap.set(es.id, es);
          sourcesForWorkspace.push(es);
        }
      }
    }

    console.log(`[CandidatesHandler] Workspace: ${workspaceId} -> ${workspaceCandidates.length} candidates, total DB: ${totalAllDb.length}`);

    res.status(200).json({
      success: true,
      workspaceId,
      candidates: workspaceCandidates,
      sources: sourcesForWorkspace,
      totalDatabaseCandidatesCount: totalAllDb.length,
      allCandidatesSummary: totalAllDb.map((c) => ({
        id: c.id,
        workspaceId: c.workspace_id,
        sourceVideoId: c.source_video_id,
        status: c.status,
        score: c.score,
        createdAt: c.created_at,
      })),
      count: workspaceCandidates.length,
    });
  } catch (err: any) {
    console.error('[CandidatesHandler] Unexpected error:', err);
    res.status(500).json({
      success: false,
      error: 'FETCH_CANDIDATES_FAILED',
      message: err.message || 'An unexpected error occurred while querying candidates.',
    });
  }
}
