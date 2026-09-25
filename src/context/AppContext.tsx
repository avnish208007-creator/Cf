import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  PageRoute,
  UserSession,
  WorkspaceConfig,
  SourceVideo,
  ClipCandidate,
  Clip,
  QueueItem,
  ActiveJob,
  ActivityItem,
} from '../types';
import { DiscoveryService } from '../services/discoveryService';
import { MomentDetectionService } from '../services/momentDetectionService';
import { ClientRenderService } from '../services/renderService';
import {
  INITIAL_USER,
  INITIAL_WORKSPACE,
} from '../services/mockData';
import {
  db,
  DEFAULT_WORKSPACE_ID,
} from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { FirebaseWorkspaceService } from '../services/firebase/workspaces';
import { FirebaseSourcesService } from '../services/firebase/sources';
import { FirebaseCandidatesService } from '../services/firebase/candidates';
import { FirebaseClipsService } from '../services/firebase/clips';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error';
}

interface AppContextType {
  currentPage: PageRoute;
  navigate: (page: PageRoute) => void;
  user: UserSession | null;
  currentWorkspaceId: string | null;
  isFirebaseActive: boolean;
  login: (
    email?: string,
    password?: string,
    isSignUp?: boolean,
    fullName?: string
  ) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  workspace: WorkspaceConfig;
  isOnboarded: boolean;
  completeOnboarding: (config: WorkspaceConfig) => Promise<void>;
  updateWorkspace: (partial: Partial<WorkspaceConfig>) => Promise<void>;
  sources: SourceVideo[];
  isFetchingSources: boolean;
  sourcesFetchError: string | null;
  fetchSources: (workspaceId?: string) => Promise<void>;
  deleteSource: (sourceId: string) => Promise<void>;
  bulkDeleteSources: (sourceIds: string[]) => Promise<void>;
  isDiscovering: boolean;
  isAnalyzing: boolean;
  discoveryProviderError: string | null;
  clearDiscoveryProviderError: () => void;
  runDiscovery: (filters?: {
    freshness?: 'all' | 'last_24h' | 'last_7d' | 'last_30d';
    contentType?: 'all' | 'deep_dive' | 'interviews' | 'keynote';
    subtopic?: string;
  }) => Promise<void>;
  analyzeSource: (sourceId: string) => Promise<void>;
  analyzeAllSources: () => Promise<void>;
  addSource: (newSource: { title: string; youtubeUrl: string; niche: string }) => Promise<void>;
  runMomentDetection: (sourceId: string) => void;
  candidates: ClipCandidate[];
  isFetchingCandidates: boolean;
  candidatesFetchError: string | null;
  fetchCandidates: (workspaceId?: string) => Promise<void>;
  deleteCandidate: (candidateId: string) => Promise<void>;
  selectCandidate: (candidateId: string) => Promise<void>;
  approveCandidate: (candidateId: string) => void;
  rejectCandidate: (candidateId: string) => void;
  generateClipFromCandidate: (candidateId: string) => Promise<void>;
  batchApproveAndRenderClips: (minScoreThreshold?: number) => Promise<void>;
  clips: Clip[];
  fetchClips: (workspaceId?: string) => Promise<void>;
  addClipToQueue: (clipId: string) => Promise<void>;
  deleteClip: (clipId: string) => Promise<void>;
  updateClipCaptions: (clipId: string, hashtags: string[], sampleCaptions: string[]) => Promise<void>;
  queue: QueueItem[];
  approveQueueItem: (queueId: string) => Promise<void>;
  updateQueueItem: (queueId: string, updates: Partial<QueueItem>) => Promise<void>;
  removeFromQueue: (queueId: string) => Promise<void>;
  jobs: ActiveJob[];
  cancelJob: (jobId: string) => void;
  activities: ActivityItem[];
  toasts: ToastState[];
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  dismissToast: (id: number) => void;
  resetToDemo: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPage, setCurrentPage] = useState<PageRoute>(() => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const validPages: PageRoute[] = [
      'login',
      'onboarding',
      'dashboard',
      'discover',
      'candidates',
      'clips',
      'queue',
      'settings',
    ];
    if (hash && validPages.includes(hash as PageRoute)) {
      return hash as PageRoute;
    }
    return 'dashboard';
  });

  const [user, setUser] = useState<UserSession | null>(INITIAL_USER);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(DEFAULT_WORKSPACE_ID);
  const [workspace, setWorkspace] = useState<WorkspaceConfig>(INITIAL_WORKSPACE);
  const [isOnboarded, setIsOnboarded] = useState<boolean>(true);

  const [sources, setSources] = useState<SourceVideo[]>([]);
  const [isFetchingSources, setIsFetchingSources] = useState(false);
  const [sourcesFetchError, setSourcesFetchError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [isFetchingCandidates, setIsFetchingCandidates] = useState(false);
  const [candidatesFetchError, setCandidatesFetchError] = useState<string | null>(null);

  const [clips, setClips] = useState<Clip[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [discoveryProviderError, setDiscoveryProviderError] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastState[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const navigate = (page: PageRoute) => {
    setCurrentPage(page);
    window.location.hash = `#/${page}`;
  };

  // --- Initial Data Load from Firestore ---
  const loadWorkspaceData = useCallback(async (wsId: string) => {
    try {
      const { config } = await FirebaseWorkspaceService.getWorkspace(wsId);
      if (config) {
        setWorkspace(config);
      }

      const [srcs, cands, clps] = await Promise.all([
        FirebaseSourcesService.getSources(wsId),
        FirebaseCandidatesService.getCandidates(wsId),
        FirebaseClipsService.getClips(wsId),
      ]);

      setSources(srcs);
      setCandidates(cands);
      setClips(clps);

      // Derive queue items from clips
      const queueItems: QueueItem[] = clps
        .filter((c) => c.inQueue || c.queueStatus === 'approved' || c.queueStatus === 'scheduled')
        .map((c) => ({
          id: `queue_${c.id}`,
          clipId: c.id,
          title: c.title,
          hook: c.hook,
          duration: c.duration,
          platforms: ['YouTube Shorts', 'Instagram Reels', 'TikTok'],
          captionText: `${c.hook || ''}\n\n${(c.captionsSample || []).join(' ')}`,
          hashtags: c.hashtags || ['#shorts', '#viral'],
          status: c.queueStatus || 'needs_review',
          scheduledSlot: c.scheduledSlot || undefined,
          addedAt: 'Recently',
          style: c.style,
        }));
      setQueue(queueItems);

    } catch (err) {
      console.error('[AppContext] Failed to load workspace data from Firestore:', err);
    }
  }, []);

  useEffect(() => {
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    loadWorkspaceData(wsId);
  }, [currentWorkspaceId, loadWorkspaceData]);

  // Auth Operations (No-op / Demo session)
  const login = async (email?: string, password?: string, isSignUp?: boolean, fullName?: string) => {
    setUser(INITIAL_USER);
    showToast('Session active', 'info');
    return { success: true };
  };

  const loginWithGoogle = async () => {
    return { success: true };
  };

  const logout = async () => {
    setUser(INITIAL_USER);
    showToast('Session reset', 'info');
  };

  const completeOnboarding = async (config: WorkspaceConfig) => {
    setWorkspace(config);
    setIsOnboarded(true);
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    await FirebaseWorkspaceService.updateWorkspace(wsId, config);
    showToast('Workspace onboarding complete!', 'success');
    navigate('dashboard');
  };

  const updateWorkspace = async (partial: Partial<WorkspaceConfig>) => {
    setWorkspace((prev) => ({ ...prev, ...partial }));
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    await FirebaseWorkspaceService.updateWorkspace(wsId, partial);
    showToast('Workspace settings saved', 'success');
  };

  const fetchSources = async (workspaceId?: string) => {
    const wsId = workspaceId || currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    setIsFetchingSources(true);
    setSourcesFetchError(null);
    try {
      const data = await FirebaseSourcesService.getSources(wsId);
      setSources(data);
    } catch (err: any) {
      setSourcesFetchError(err.message || 'Failed to fetch sources');
    } finally {
      setIsFetchingSources(false);
    }
  };

  const deleteSource = async (sourceId: string) => {
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    const ok = await FirebaseSourcesService.deleteSource(sourceId, wsId);
    if (ok) {
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      setCandidates((prev) => prev.filter((c) => c.sourceVideoId !== sourceId));
      showToast('Source video removed from discoveries', 'success');
    } else {
      showToast('Failed to remove source video', 'error');
    }
  };

  const bulkDeleteSources = async (sourceIds: string[]) => {
    if (!sourceIds.length) return;
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    const ok = await FirebaseSourcesService.bulkDeleteSources(sourceIds, wsId);
    if (ok) {
      const idSet = new Set(sourceIds);
      setSources((prev) => prev.filter((s) => !idSet.has(s.id)));
      setCandidates((prev) => prev.filter((c) => !idSet.has(c.sourceVideoId)));
      showToast(`Removed ${sourceIds.length} videos from discoveries`, 'success');
    } else {
      showToast('Failed to delete selected sources', 'error');
    }
  };

  const clearDiscoveryProviderError = () => setDiscoveryProviderError(null);

  const runDiscovery = async (filters?: {
    freshness?: 'all' | 'last_24h' | 'last_7d' | 'last_30d';
    contentType?: 'all' | 'deep_dive' | 'interviews' | 'keynote';
    subtopic?: string;
  }) => {
    setIsDiscovering(true);
    setDiscoveryProviderError(null);
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;

    const jobId = `job_disc_${Date.now()}`;
    const newJob: ActiveJob = {
      id: jobId,
      type: 'discovery',
      targetTitle: `Discovery: ${workspace.mainNiche}`,
      progress: 30,
      stage: 'Searching YouTube RSS and public sources...',
      startedAt: 'Just now',
    };
    setJobs((prev) => [newJob, ...prev]);

    try {
      const knownVideoIds = sources.map((s) => s.youtubeUrl).filter(Boolean);
      const res = await DiscoveryService.discover({
        workspaceId: wsId,
        workspaceName: workspace.workspaceName,
        niche: workspace.mainNiche,
        subtopics: filters?.subtopic ? [filters.subtopic] : workspace.subtopics,
        freshness: filters?.freshness || 'all',
        contentType: filters?.contentType || 'all',
        knownVideoIds,
      });

      if (res.videos && res.videos.length > 0) {
        await fetchSources(wsId);
        showToast(`Discovered & persisted ${res.videos.length} new sources to Firestore!`, 'success');
      } else {
        showToast('Discovery completed, no new videos found.', 'info');
      }
    } catch (err: any) {
      console.error('[AppContext] Discovery failed:', err);
      setDiscoveryProviderError(err.message || 'Discovery execution failed.');
      showToast(err.message || 'Discovery failed', 'error');
    } finally {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setIsDiscovering(false);
    }
  };

  const fetchCandidates = async (workspaceId?: string) => {
    const wsId = workspaceId || currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    setIsFetchingCandidates(true);
    setCandidatesFetchError(null);
    try {
      const cands = await FirebaseCandidatesService.getCandidates(wsId);
      setCandidates(cands);
    } catch (err: any) {
      setCandidatesFetchError(err.message || 'Failed to fetch candidates');
    } finally {
      setIsFetchingCandidates(false);
    }
  };

  const deleteCandidate = async (candidateId: string) => {
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    const ok = await FirebaseCandidatesService.deleteCandidate(candidateId, wsId);
    if (ok) {
      setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
      setClips((prev) => prev.filter((cl) => cl.candidateId !== candidateId));
      showToast('Candidate deleted', 'success');
    } else {
      showToast('Failed to delete candidate', 'error');
    }
  };

  const analyzeSource = async (sourceId: string) => {
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    setIsAnalyzing(true);
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, status: 'processing' } : s)));

    try {
      const res = await MomentDetectionService.analyze({
        workspaceId: wsId,
        sourceId,
        niche: workspace.mainNiche,
        subtopics: workspace.subtopics,
      });

      await Promise.all([fetchSources(wsId), fetchCandidates(wsId)]);

      const found = res.results?.[0]?.candidatesFound || 0;
      showToast(`Analyzed! Found ${found} moments`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Moment analysis failed', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeAllSources = async () => {
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    const unanalyzed = sources.filter((s) => s.status === 'new' || s.status === 'queued');
    if (unanalyzed.length === 0) {
      showToast('All sources are already analyzed!', 'info');
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await MomentDetectionService.analyze({
        workspaceId: wsId,
        sourceIds: unanalyzed.map((s) => s.id),
        niche: workspace.mainNiche,
        subtopics: workspace.subtopics,
      });

      await Promise.all([fetchSources(wsId), fetchCandidates(wsId)]);
      showToast(`Batch analysis complete: ${res.candidatesCount || 0} moments found`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Batch analysis failed', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runMomentDetection = (sourceId: string) => {
    analyzeSource(sourceId);
  };

  const addSource = async (newSource: { title: string; youtubeUrl: string; niche: string }) => {
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    const newId = crypto.randomUUID ? crypto.randomUUID() : 'src_' + Date.now();
    const ok = await FirebaseSourcesService.addSource(wsId, {
      id: newId,
      title: newSource.title,
      channelTitle: 'Manual Addition',
      duration: '15:00',
      viewCount: 50000,
      publishedAt: 'Just now',
      youtubeUrl: newSource.youtubeUrl,
      status: 'new',
      relevanceScore: 85,
      freshnessTag: 'Added Manually',
      candidatesCount: 0,
      summary: `Manual video added for ${newSource.niche}`,
      niche: newSource.niche,
      thumbnailGradient: 'from-slate-900 via-indigo-950 to-slate-900',
    });

    if (ok) {
      await fetchSources(wsId);
      showToast('Source video added', 'success');
    } else {
      showToast('Failed to add source video', 'error');
    }
  };

  const selectCandidate = async (candidateId: string) => {
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    await FirebaseCandidatesService.updateCandidateStatus(candidateId, 'approved', wsId);
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, status: 'approved', selectionStatus: 'selected' } : c))
    );
    showToast('Candidate selected for clip generation', 'success');
  };

  const approveCandidate = (candidateId: string) => {
    selectCandidate(candidateId);
  };

  const rejectCandidate = async (candidateId: string) => {
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    await FirebaseCandidatesService.updateCandidateStatus(candidateId, 'rejected', wsId);
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, status: 'rejected', selectionStatus: 'rejected' } : c))
    );
    showToast('Candidate rejected', 'info');
  };

  const fetchClips = async (workspaceId?: string) => {
    const wsId = workspaceId || currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    const clps = await FirebaseClipsService.getClips(wsId);
    setClips(clps);
  };

  const generateClipFromCandidate = async (candidateId: string) => {
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand) return;

    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    showToast(`Queued render for "${cand.hook.slice(0, 30)}..."`, 'info');

    try {
      const res = await ClientRenderService.renderClip({ candidateId, workspaceId: wsId });
      if (res.success) {
        await fetchClips(wsId);
        await fetchCandidates(wsId);
        showToast('Vertical clip rendered successfully!', 'success');
      } else {
        showToast(res.message || 'Clip rendering failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Render request error', 'error');
    }
  };

  const batchApproveAndRenderClips = async (minScoreThreshold = workspace.minCandidateScore) => {
    const eligible = candidates.filter(
      (c) => (c.status === 'new' || c.status === 'in_review') && c.score >= minScoreThreshold
    );

    if (eligible.length === 0) {
      showToast(`No candidates found with score ≥ ${minScoreThreshold}`, 'info');
      return;
    }

    for (const cand of eligible) {
      await generateClipFromCandidate(cand.id);
    }

    showToast(`Triggered clip rendering for ${eligible.length} moments`, 'success');
    navigate('clips');
  };

  const addClipToQueue = async (clipId: string) => {
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    const ok = await FirebaseClipsService.setClipInQueue(clipId, true, 'needs_review', wsId);
    if (ok) {
      await fetchClips(wsId);
      showToast('Clip added to Queue for publishing review', 'success');
    }
  };

  const deleteClip = async (clipId: string) => {
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    const ok = await FirebaseClipsService.deleteClip(clipId, wsId);
    if (ok) {
      setClips((prev) => prev.filter((c) => c.id !== clipId));
      setQueue((prev) => prev.filter((q) => q.clipId !== clipId));
      showToast('Clip deleted', 'info');
    } else {
      showToast('Failed to delete clip', 'error');
    }
  };

  const updateClipCaptions = async (clipId: string, hashtags: string[], sampleCaptions: string[]) => {
    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    const clipRef = doc(db, 'workspaces', wsId, 'clips', clipId);
    await setDoc(clipRef, { hashtags, captionsSample: sampleCaptions, updatedAt: new Date().toISOString() }, { merge: true });

    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, hashtags, captionsSample: sampleCaptions } : c))
    );
    showToast('Captions and hashtags updated', 'success');
  };

  const approveQueueItem = async (queueId: string) => {
    const item = queue.find((q) => q.id === queueId);
    if (!item) return;

    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    const ok = await FirebaseClipsService.updateQueueItem(item.clipId, {
      queueStatus: 'approved',
      scheduledSlot: 'Next slot (Auto-scheduled)',
    }, wsId);

    if (ok) {
      setQueue((prev) =>
        prev.map((q) => (q.id === queueId ? { ...q, status: 'approved', scheduledSlot: 'Next slot' } : q))
      );
      showToast('Approved for publishing', 'success');
    }
  };

  const updateQueueItem = async (queueId: string, updates: Partial<QueueItem>) => {
    const item = queue.find((q) => q.id === queueId);
    if (!item) return;

    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    await FirebaseClipsService.updateQueueItem(item.clipId, {
      queueStatus: updates.status,
      scheduledSlot: updates.scheduledSlot,
    }, wsId);

    setQueue((prev) => prev.map((q) => (q.id === queueId ? { ...q, ...updates } : q)));
    showToast('Queue item updated', 'success');
  };

  const removeFromQueue = async (queueId: string) => {
    const item = queue.find((q) => q.id === queueId);
    if (!item) return;

    const wsId = currentWorkspaceId || DEFAULT_WORKSPACE_ID;
    const ok = await FirebaseClipsService.setClipInQueue(item.clipId, false, 'needs_review', wsId);
    if (ok) {
      setQueue((prev) => prev.filter((q) => q.id !== queueId));
      showToast('Removed from queue', 'info');
    }
  };

  const cancelJob = (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    showToast('Job cancelled', 'info');
  };

  const resetToDemo = () => {
    setCurrentWorkspaceId(DEFAULT_WORKSPACE_ID);
    setUser(INITIAL_USER);
    setIsOnboarded(true);
    setWorkspace(INITIAL_WORKSPACE);
    loadWorkspaceData(DEFAULT_WORKSPACE_ID);
    showToast('Reset workspace state', 'info');
    navigate('dashboard');
  };

  return (
    <AppContext.Provider
      value={{
        currentPage,
        navigate,
        user,
        currentWorkspaceId,
        isFirebaseActive: true,
        login,
        loginWithGoogle,
        logout,
        workspace,
        isOnboarded,
        completeOnboarding,
        updateWorkspace,
        sources,
        isFetchingSources,
        sourcesFetchError,
        fetchSources,
        deleteSource,
        bulkDeleteSources,
        isDiscovering,
        isAnalyzing,
        discoveryProviderError,
        clearDiscoveryProviderError,
        runDiscovery,
        analyzeSource,
        analyzeAllSources,
        addSource,
        runMomentDetection,
        candidates,
        isFetchingCandidates,
        candidatesFetchError,
        fetchCandidates,
        deleteCandidate,
        selectCandidate,
        approveCandidate,
        rejectCandidate,
        generateClipFromCandidate,
        batchApproveAndRenderClips,
        clips,
        fetchClips,
        addClipToQueue,
        deleteClip,
        updateClipCaptions,
        queue,
        approveQueueItem,
        updateQueueItem,
        removeFromQueue,
        jobs,
        cancelJob,
        activities,
        toasts,
        showToast,
        dismissToast,
        resetToDemo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
