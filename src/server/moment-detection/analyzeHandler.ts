import { Request, Response } from 'express';
import { MomentPipeline } from './MomentPipeline';
import { getSupabaseServerClient } from '../discovery/pipeline';

export async function handleAnalyzeRequest(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    let userAccessToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      userAccessToken = authHeader.slice(7).trim();
    }

    const {
      workspaceId,
      sourceId,
      sourceIds: passedSourceIds,
      niche: passedNiche,
      subtopics: passedSubtopics,
    } = req.body || {};

    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_WORKSPACE_ID',
        message: 'Active workspace ID is required for moment analysis.',
      });
    }

    const supabase = getSupabaseServerClient(userAccessToken);
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'DATABASE_UNAVAILABLE',
        message: 'Supabase database is not configured.',
      });
    }

    // Retrieve workspace settings for niche and subtopics if not passed
    let activeNiche = passedNiche || 'Fitness & Hypertrophy';
    let activeSubtopics: string[] = passedSubtopics || [];

    if (!passedNiche || activeSubtopics.length === 0) {
      const { data: settings } = await supabase
        .from('workspace_settings')
        .select('main_niche, subtopics')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (settings) {
        activeNiche = passedNiche || settings.main_niche || activeNiche;
        activeSubtopics = activeSubtopics.length > 0 ? activeSubtopics : settings.subtopics || [];
      }
    }

    // Determine target sources to analyze
    let targetSourceIds: string[] = [];
    if (sourceId) {
      targetSourceIds = [sourceId];
    } else if (Array.isArray(passedSourceIds) && passedSourceIds.length > 0) {
      targetSourceIds = passedSourceIds;
    } else {
      // Analyze all 'new' or 'queued' sources in this workspace
      const { data: sources } = await supabase
        .from('source_videos')
        .select('id')
        .eq('workspace_id', workspaceId)
        .in('status', ['new', 'queued'])
        .limit(5);

      if (sources && sources.length > 0) {
        targetSourceIds = sources.map((s) => s.id);
      }
    }

    if (targetSourceIds.length === 0) {
      return res.json({
        success: true,
        analyzedCount: 0,
        candidatesCount: 0,
        results: [],
        message: 'No unanalyzed source videos found for analysis.',
      });
    }

    const pipeline = new MomentPipeline(undefined, undefined, undefined, supabase);

    const results = await pipeline.analyzeSources(targetSourceIds, {
      workspaceId,
      niche: activeNiche,
      subtopics: activeSubtopics,
    });

    const totalCandidates = results.reduce((acc, r) => acc + r.candidatesFound, 0);

    return res.json({
      success: true,
      analyzedCount: results.length,
      candidatesCount: totalCandidates,
      results,
    });
  } catch (err: any) {
    console.error('[handleAnalyzeRequest] Unhandled error:', err);
    return res.status(500).json({
      success: false,
      error: 'ANALYSIS_ERROR',
      message: err.message || 'An unexpected error occurred during moment detection.',
    });
  }
}
