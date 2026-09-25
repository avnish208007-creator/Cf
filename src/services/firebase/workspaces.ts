import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { WorkspaceConfig } from '../../types';

export const FirebaseWorkspaceService = {
  async getWorkspace(workspaceId: string = DEFAULT_WORKSPACE_ID) {
    try {
      const docRef = doc(db, 'workspaces', workspaceId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        const defaultConfig: WorkspaceConfig = {
          workspaceName: 'ClipFlow Workspace',
          mainNiche: 'AI & Technology',
          subtopics: ['AI Agents', 'Automation', 'LLMs'],
          contentLanguage: 'English',
          contentStyle: 'Kinetic typography with high-contrast highlighted keywords',
          aspectRatio: '9:16',
          targetPlatforms: ['YouTube Shorts', 'TikTok', 'Instagram Reels'],
          minCandidateScore: 75,
          targetDuration: '30-60s',
        };

        const initialData = {
          id: workspaceId,
          name: defaultConfig.workspaceName,
          mainNiche: defaultConfig.mainNiche,
          config: defaultConfig,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await setDoc(docRef, initialData);
        return { workspace: initialData, config: defaultConfig };
      }

      const data = snapshot.data();
      const config: WorkspaceConfig = {
        workspaceName: data.name || data.config?.workspaceName || 'ClipFlow Workspace',
        mainNiche: data.mainNiche || data.config?.mainNiche || 'AI & Technology',
        subtopics: Array.isArray(data.config?.subtopics)
          ? data.config.subtopics
          : ['AI Agents', 'Automation'],
        contentLanguage: data.config?.contentLanguage || 'English',
        contentStyle: data.config?.contentStyle || 'Kinetic typography',
        brandName: data.config?.brandName || undefined,
        aspectRatio: data.config?.aspectRatio || '9:16',
        targetPlatforms: Array.isArray(data.config?.targetPlatforms)
          ? data.config.targetPlatforms
          : ['YouTube Shorts', 'TikTok', 'Instagram Reels'],
        minCandidateScore: data.config?.minCandidateScore || 75,
        targetDuration: data.config?.targetDuration || '30-60s',
      };

      return { workspace: data, config };
    } catch (err) {
      console.error('[FirebaseWorkspaceService] Error in getWorkspace:', err);
      const defaultConfig: WorkspaceConfig = {
        workspaceName: 'ClipFlow Workspace',
        mainNiche: 'AI & Technology',
        subtopics: ['AI Agents', 'Automation'],
        contentLanguage: 'English',
        contentStyle: 'Kinetic typography',
        aspectRatio: '9:16',
        targetPlatforms: ['YouTube Shorts'],
        minCandidateScore: 75,
        targetDuration: '30-60s',
      };
      return { workspace: null, config: defaultConfig };
    }
  },

  async updateWorkspace(workspaceId: string = DEFAULT_WORKSPACE_ID, updates: Partial<WorkspaceConfig>) {
    try {
      const docRef = doc(db, 'workspaces', workspaceId);
      const snapshot = await getDoc(docRef);

      const existingConfig = snapshot.exists() ? snapshot.data().config || {} : {};
      const newConfig = { ...existingConfig, ...updates };

      const updateData: any = {
        config: newConfig,
        updatedAt: new Date().toISOString(),
      };

      if (updates.workspaceName) {
        updateData.name = updates.workspaceName;
      }
      if (updates.mainNiche) {
        updateData.mainNiche = updates.mainNiche;
      }

      await setDoc(docRef, updateData, { merge: true });
      return true;
    } catch (err) {
      console.error('[FirebaseWorkspaceService] Error in updateWorkspace:', err);
      return false;
    }
  },
};
