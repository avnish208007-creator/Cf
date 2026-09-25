import { Request, Response } from 'express';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
    const sourceMap = new Map<string, any>();
    const sourceIds: string[] = [];

    if (workspaceId) {
      const srcQuery = query(
        collection(db, 'source_videos'),
        where('workspace_id', '==', workspaceId)
      );
      const srcSnap = await getDocs(srcQuery);
      sourcesForWorkspace = srcSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

      for (const s of sourcesForWorkspace) {
        sourceMap.set(s.id, s);
        sourceIds.push(s.id);
      }
    }

    let workspaceCandidates: any[] = [];
    if (workspaceId) {
      const candQuery = query(
        collection(db, 'clip_candidates'),
        where('workspace_id', '==', workspaceId)
      );
      const candSnap = await getDocs(candQuery);
      workspaceCandidates = candSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    }

    workspaceCandidates.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

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
      message: err.message || 'An unexpected error occurred while querying candidates from Firebase.',
    });
  }
}
