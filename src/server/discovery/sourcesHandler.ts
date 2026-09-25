import { Request, Response } from 'express';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

export async function handleSourcesRequest(req: Request, res: Response): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const workspaceId = ((req.query.workspaceId as string) || (req.body && req.body.workspaceId) || DEFAULT_WORKSPACE_ID).trim();

  try {
    const sourcesColRef = collection(db, 'workspaces', workspaceId, 'sources');
    const q = query(sourcesColRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    const records = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

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
      message: err.message || 'An unexpected error occurred while querying sources from Firestore.',
    });
  }
}
