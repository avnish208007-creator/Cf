import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { Clip } from '../../types';

export const FirebaseClipsService = {
  async getClips(workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<Clip[]> {
    try {
      const colRef = collection(db, 'workspaces', workspaceId, 'clips');
      const q = query(colRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          candidateId: data.candidateId || data.candidate_id,
          workspaceId: data.workspaceId || workspaceId,
          title: data.title || 'Vertical Short',
          hook: data.hook || '',
          sourceTitle: data.sourceTitle || data.source_title,
          channelTitle: data.channelTitle || data.channel_title,
          duration: data.duration || '30s',
          aspectRatio: data.aspectRatio || data.aspect_ratio || '9:16',
          style: data.style || 'kinetic',
          status: data.status || 'ready',
          thumbnailBg: data.thumbnailBg || data.thumbnail_bg || 'from-slate-900 via-indigo-950 to-slate-900',
          thumbnailUrl: data.thumbnailUrl || data.thumbnail_bg,
          captionsSample: Array.isArray(data.captionsSample)
            ? data.captionsSample
            : Array.isArray(data.captions_sample)
            ? data.captions_sample
            : [],
          hashtags: Array.isArray(data.hashtags) ? data.hashtags : ['#shorts', '#viral'],
          progress: data.progress ?? 100,
          inQueue: Boolean(data.inQueue ?? data.in_queue),
          queueStatus: data.queueStatus || data.queue_status || 'needs_review',
          scheduledSlot: data.scheduledSlot || data.scheduled_slot,
          videoUrl: data.videoUrl || data.video_url || '',
          createdAt: data.createdAt || data.created_at || new Date().toISOString(),
        };
      });
    } catch (err) {
      console.error('[FirebaseClipsService] Error in getClips:', err);
      return [];
    }
  },

  async addClip(workspaceId: string = DEFAULT_WORKSPACE_ID, clipData: any): Promise<boolean> {
    try {
      const docRef = doc(db, 'workspaces', workspaceId, 'clips', clipData.id);
      const now = new Date().toISOString();

      const payload = {
        ...clipData,
        workspaceId,
        createdAt: clipData.createdAt || now,
        updatedAt: now,
      };

      await setDoc(docRef, payload, { merge: true });
      return true;
    } catch (err) {
      console.error('[FirebaseClipsService] Error in addClip:', err);
      return false;
    }
  },

  async deleteClip(clipId: string, workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<boolean> {
    try {
      const docRef = doc(db, 'workspaces', workspaceId, 'clips', clipId);
      await deleteDoc(docRef);
      return true;
    } catch (err) {
      console.error('[FirebaseClipsService] Error in deleteClip:', err);
      return false;
    }
  },

  async setClipInQueue(
    clipId: string,
    inQueue: boolean,
    queueStatus: string = 'needs_review',
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): Promise<boolean> {
    try {
      const docRef = doc(db, 'workspaces', workspaceId, 'clips', clipId);
      await setDoc(
        docRef,
        {
          inQueue,
          queueStatus,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return true;
    } catch (err) {
      console.error('[FirebaseClipsService] Error in setClipInQueue:', err);
      return false;
    }
  },

  async updateQueueItem(
    clipId: string,
    updates: Partial<{ queueStatus: string; scheduledSlot: string }>,
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): Promise<boolean> {
    try {
      const docRef = doc(db, 'workspaces', workspaceId, 'clips', clipId);
      await setDoc(
        docRef,
        {
          ...updates,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return true;
    } catch (err) {
      console.error('[FirebaseClipsService] Error in updateQueueItem:', err);
      return false;
    }
  },
};
