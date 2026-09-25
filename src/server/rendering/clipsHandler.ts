import { Request, Response } from 'express';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
    let q;
    if (workspaceId) {
      q = query(collection(db, 'clips'), where('workspace_id', '==', workspaceId));
    } else {
      q = query(collection(db, 'clips'));
    }

    const querySnap = await getDocs(q);
    const records = querySnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

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
      message: err.message || 'An unexpected error occurred while querying clips from Firebase.',
    });
  }
}
