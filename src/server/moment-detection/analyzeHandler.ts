import { Request, Response } from 'express';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { MomentPipeline } from './MomentPipeline';

export async function handleAnalyzeRequest(req: Request, res: Response) {
  try {
    const {
      workspaceId = DEFAULT_WORKSPACE_ID,
      sourceId,
      sourceIds: passedSourceIds,
      niche: passedNiche,
      subtopics: passedSubtopics,
    } = req.body || {};

    const effectiveWsId = workspaceId.trim() || DEFAULT_WORKSPACE_ID;

    let activeNiche = passedNiche || 'AI & Technology';
    let activeSubtopics: string[] = passedSubtopics || [];

    if (!passedNiche || activeSubtopics.length === 0) {
      const wsRef = doc(db, 'workspaces', effectiveWsId);
      const wsSnap = await getDoc(wsRef);
      const wsData = wsSnap.exists() ? wsSnap.data() : null;

      if (wsData) {
        activeNiche = passedNiche || wsData.mainNiche || wsData.config?.mainNiche || activeNiche;
        activeSubtopics = activeSubtopics.length > 0 ? activeSubtopics : wsData.config?.subtopics || ['AI Agents', 'Automation'];
      }
    }

    let targetSourceIds: string[] = [];
    if (sourceId) {
      targetSourceIds = [sourceId];
    } else if (Array.isArray(passedSourceIds) && passedSourceIds.length > 0) {
      targetSourceIds = passedSourceIds;
    } else {
      const sourcesColRef = collection(db, 'workspaces', effectiveWsId, 'sources');
      const sourcesSnap = await getDocs(sourcesColRef);
      const unanalyzed = sourcesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((s) => s.status === 'new' || s.status === 'queued')
        .slice(0, 5);

      targetSourceIds = unanalyzed.map((s: any) => s.id);
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

    const pipeline = new MomentPipeline();

    const results = await pipeline.analyzeSources(targetSourceIds, {
      workspaceId: effectiveWsId,
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
