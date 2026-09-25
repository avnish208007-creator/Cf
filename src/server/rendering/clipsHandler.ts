import { Request, Response } from 'express';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

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
    DEFAULT_WORKSPACE_ID
  ).trim();

  try {
    const clipsColRef = collection(db, 'workspaces', workspaceId, 'clips');
    const q = query(clipsColRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    const records = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

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
      message: err.message || 'An unexpected error occurred while querying clips from Firestore.',
    });
  }
}
