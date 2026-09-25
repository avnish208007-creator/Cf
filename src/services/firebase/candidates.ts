import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { ClipCandidate } from '../../types';

export const FirebaseCandidatesService = {
  async getCandidates(workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<ClipCandidate[]> {
    try {
      const colRef = collection(db, 'workspaces', workspaceId, 'candidates');
      const q = query(colRef, orderBy('score', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          workspaceId: data.workspaceId || workspaceId,
          sourceVideoId: data.sourceVideoId,
          sourceTitle: data.sourceTitle,
          channelTitle: data.channelTitle,
          startTime: data.startTime || data.start_time || '00:00',
          endTime: data.endTime || data.end_time || '00:30',
          duration: data.duration || '30s',
          hook: data.hook || '',
          summary: data.summary || '',
          score: data.score || 0,
          factors: data.factors || {},
          status: data.status || 'new',
          createdAt: data.createdAt || new Date().toISOString(),
        };
      });
    } catch (err) {
      console.error('[FirebaseCandidatesService] Error in getCandidates:', err);
      return [];
    }
  },

  async addCandidate(workspaceId: string = DEFAULT_WORKSPACE_ID, candidateData: any): Promise<boolean> {
    try {
      const docRef = doc(db, 'workspaces', workspaceId, 'candidates', candidateData.id);
      const now = new Date().toISOString();

      const payload = {
        ...candidateData,
        workspaceId,
        createdAt: candidateData.createdAt || now,
        updatedAt: now,
      };

      await setDoc(docRef, payload, { merge: true });
      return true;
    } catch (err) {
      console.error('[FirebaseCandidatesService] Error in addCandidate:', err);
      return false;
    }
  },

  async updateCandidateStatus(candidateId: string, status: string, workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<boolean> {
    try {
      const docRef = doc(db, 'workspaces', workspaceId, 'candidates', candidateId);
      await setDoc(docRef, { status, updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    } catch (err) {
      console.error('[FirebaseCandidatesService] Error in updateCandidateStatus:', err);
      return false;
    }
  },

  async updateCandidate(candidateId: string, updates: any, workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<boolean> {
    try {
      const docRef = doc(db, 'workspaces', workspaceId, 'candidates', candidateId);
      await setDoc(docRef, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    } catch (err) {
      console.error('[FirebaseCandidatesService] Error in updateCandidate:', err);
      return false;
    }
  },

  async deleteCandidate(candidateId: string, workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<boolean> {
    try {
      // 1. Clean up associated clips
      const clipsRef = collection(db, 'workspaces', workspaceId, 'clips');
      const q = query(clipsRef, where('candidateId', '==', candidateId));
      const snapshot = await getDocs(q);
      const clipDeletes = snapshot.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(clipDeletes);

      // 2. Delete candidate document
      const docRef = doc(db, 'workspaces', workspaceId, 'candidates', candidateId);
      await deleteDoc(docRef);

      return true;
    } catch (err) {
      console.error('[FirebaseCandidatesService] Error in deleteCandidate:', err);
      return false;
    }
  },
};
