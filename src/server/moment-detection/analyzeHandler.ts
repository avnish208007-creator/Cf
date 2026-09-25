import { Request, Response } from 'express';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, limit } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import { MomentPipeline } from './MomentPipeline';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export async function handleAnalyzeRequest(req: Request, res: Response) {
  try {
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

    let activeNiche = passedNiche || 'Fitness & Hypertrophy';
    let activeSubtopics: string[] = passedSubtopics || [];

    if (!passedNiche || activeSubtopics.length === 0) {
      const settingsQuery = query(
        collection(db, 'workspace_settings'),
        where('workspace_id', '==', workspaceId),
        limit(1)
      );
      const settingsSnap = await getDocs(settingsQuery);

      if (!settingsSnap.empty) {
        const settings = settingsSnap.docs[0].data();
        activeNiche = passedNiche || settings.main_niche || activeNiche;
        activeSubtopics = activeSubtopics.length > 0 ? activeSubtopics : settings.subtopics || [];
      }
    }

    let targetSourceIds: string[] = [];
    if (sourceId) {
      targetSourceIds = [sourceId];
    } else if (Array.isArray(passedSourceIds) && passedSourceIds.length > 0) {
      targetSourceIds = passedSourceIds;
    } else {
      const sourcesQuery = query(
        collection(db, 'source_videos'),
        where('workspace_id', '==', workspaceId),
        where('status', 'in', ['new', 'queued']),
        limit(5)
      );
      const sourcesSnap = await getDocs(sourcesQuery);
      targetSourceIds = sourcesSnap.docs.map((d) => d.id);
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
