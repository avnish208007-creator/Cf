import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { SourceVideo } from '../../types';

export const FirebaseSourcesService = {
  async getSources(workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<SourceVideo[]> {
    try {
      const colRef = collection(db, 'workspaces', workspaceId, 'sources');
      const q = query(colRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || 'Untitled Video',
          channelTitle: data.channelTitle || 'YouTube Channel',
          duration: data.duration || '00:00',
          viewCount: data.viewCount || 0,
          publishedAt: data.publishedAt || 'Recently',
          youtubeUrl: data.youtubeUrl || '',
          status: data.status || 'new',
          relevanceScore: data.relevanceScore || 80,
          freshnessTag: data.freshnessTag || '',
          candidatesCount: data.candidatesCount || 0,
          summary: data.summary || '',
          niche: data.niche || 'General',
          thumbnailGradient: data.thumbnailGradient || 'from-slate-900 via-indigo-950 to-slate-900',
        };
      });
    } catch (err) {
      console.error('[FirebaseSourcesService] Error in getSources:', err);
      return [];
    }
  },

  async addSource(workspaceId: string = DEFAULT_WORKSPACE_ID, sourceData: Partial<SourceVideo> & { id: string }): Promise<boolean> {
    try {
      const docRef = doc(db, 'workspaces', workspaceId, 'sources', sourceData.id);
      const now = new Date().toISOString();

      const payload = {
        id: sourceData.id,
        title: sourceData.title || '',
        channelTitle: sourceData.channelTitle || 'YouTube Channel',
        duration: sourceData.duration || '00:00',
        viewCount: sourceData.viewCount || 0,
        publishedAt: sourceData.publishedAt || 'Recently',
        youtubeUrl: sourceData.youtubeUrl || '',
        status: sourceData.status || 'new',
        relevanceScore: sourceData.relevanceScore || 80,
        freshnessTag: sourceData.freshnessTag || '',
        candidatesCount: sourceData.candidatesCount || 0,
        summary: sourceData.summary || '',
        niche: sourceData.niche || 'General',
        thumbnailGradient: sourceData.thumbnailGradient || 'from-slate-900 via-indigo-950 to-slate-900',
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(docRef, payload, { merge: true });
      return true;
    } catch (err) {
      console.error('[FirebaseSourcesService] Error in addSource:', err);
      return false;
    }
  },

  async updateSource(workspaceId: string = DEFAULT_WORKSPACE_ID, sourceId: string, updates: Partial<SourceVideo>): Promise<boolean> {
    try {
      const docRef = doc(db, 'workspaces', workspaceId, 'sources', sourceId);
      await setDoc(docRef, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    } catch (err) {
      console.error('[FirebaseSourcesService] Error in updateSource:', err);
      return false;
    }
  },

  async deleteSource(sourceId: string, workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<boolean> {
    try {
      // 1. Find candidates associated with this source
      const candsRef = collection(db, 'workspaces', workspaceId, 'candidates');
      const candsQuery = query(candsRef, where('sourceVideoId', '==', sourceId));
      const candsSnapshot = await getDocs(candsQuery);

      const candidateIds = candsSnapshot.docs.map((d) => d.id);

      // 2. Delete clips associated with these candidates
      if (candidateIds.length > 0) {
        const clipsRef = collection(db, 'workspaces', workspaceId, 'clips');
        const clipsSnapshot = await getDocs(clipsRef);
        const clipDeletes = clipsSnapshot.docs
          .filter((d) => candidateIds.includes(d.data().candidateId) || d.data().sourceVideoId === sourceId)
          .map((d) => deleteDoc(d.ref));
        await Promise.all(clipDeletes);
      }

      // 3. Delete candidate documents
      const candidateDeletes = candsSnapshot.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(candidateDeletes);

      // 4. Delete source document
      const docRef = doc(db, 'workspaces', workspaceId, 'sources', sourceId);
      await deleteDoc(docRef);

      return true;
    } catch (err) {
      console.error('[FirebaseSourcesService] Error in deleteSource:', err);
      return false;
    }
  },

  async bulkDeleteSources(sourceIds: string[], workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<boolean> {
    if (!sourceIds.length) return true;
    try {
      for (const id of sourceIds) {
        await this.deleteSource(id, workspaceId);
      }
      return true;
    } catch (err) {
      console.error('[FirebaseSourcesService] Error in bulkDeleteSources:', err);
      return false;
    }
  },
};
