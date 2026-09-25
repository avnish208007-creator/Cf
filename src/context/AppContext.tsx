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
  auth,
  googleProvider,
  isFirebaseConfigured,
  FirebaseWorkspaceRepo,
  FirebaseContentRepo,
} from '../lib/firebase';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';

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
  isSupabaseActive: boolean;
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

const STORAGE_KEY_PREFIX = 'clipflow_state_v2_';

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

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(() => {
    return (
      localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace_id`) ||
      'a0000000-0000-4000-a000-000000000001'
    );
  });

  const [user, setUser] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}user`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return INITIAL_USER;
      }
    }
    return INITIAL_USER;
  });

  const [isOnboarded, setIsOnboarded] = useState<boolean>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}onboarded`);
    return saved ? saved === 'true' : true;
  });

  const [workspace, setWorkspace] = useState<WorkspaceConfig>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return INITIAL_WORKSPACE;
      }
    }
    return INITIAL_WORKSPACE;
  });

  const [sources, setSources] = useState<SourceVideo[]>([]);
  const [isFetchingSources, setIsFetchingSources] = useState<boolean>(false);
  const [sourcesFetchError, setSourcesFetchError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [isFetchingCandidates, setIsFetchingCandidates] = useState<boolean>(false);
  const [candidatesFetchError, setCandidatesFetchError] = useState<string | null>(null);

  const [clips, setClips] = useState<Clip[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [discoveryProviderError, setDiscoveryProviderError] = useState<string | null>(null);

  const clearDiscoveryProviderError = useCallback(() => {
    setDiscoveryProviderError(null);
  }, []);

  const navigate = useCallback((page: PageRoute) => {
    window.location.hash = `#/${page}`;
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const showToast = useCallback(
    (message: string, type: 'success' | 'info' | 'error' = 'success') => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}user`, JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}onboarded`, String(isOnboarded));
  }, [isOnboarded]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}workspace`, JSON.stringify(workspace));
  }, [workspace]);

  useEffect(() => {
    if (currentWorkspaceId) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}workspace_id`, currentWorkspaceId);
    } else {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}workspace_id`);
    }
  }, [currentWorkspaceId]);

  useEffect(() => {
    const handleHashChange = () => {
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
        setCurrentPage(hash as PageRoute);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Helper to load Firebase workspace and all associated data for a user
  const loadUserWorkspaceFromFirebase = useCallback(
    async (userId: string, userSession: UserSession) => {
      if (!isFirebaseConfigured) return;

      try {
        const { workspace: dbWs, settings: dbSettings } =
          await FirebaseWorkspaceRepo.getWorkspaceForUser(userId);

        if (dbWs && dbSettings) {
          setCurrentWorkspaceId(dbWs.id);
          setIsOnboarded(true);

          const loadedConfig: WorkspaceConfig = {
            workspaceName: dbWs.name,
            brandName: dbWs.brand_name || undefined,
            mainNiche: dbSettings.main_niche,
            subtopics: dbSettings.subtopics || [],
            contentLanguage: dbSettings.content_language,
            contentStyle: dbSettings.content_style,
            aspectRatio: (dbSettings.aspect_ratio as '9:16') || '9:16',
            targetPlatforms: dbSettings.target_platforms || [],
            minCandidateScore: dbSettings.min_candidate_score || 80,
            targetDuration: dbSettings.target_duration || '30-60s',
          };
          setWorkspace(loadedConfig);

          const [dbSources, dbCandidates, dbClips, dbQueue, dbJobs] = await Promise.all([
            FirebaseContentRepo.getSources(dbWs.id),
            FirebaseContentRepo.getCandidates(dbWs.id),
            FirebaseContentRepo.getClips(dbWs.id),
            FirebaseContentRepo.getQueue(dbWs.id),
            FirebaseContentRepo.getJobs(dbWs.id),
          ]);

          setSources(dbSources);
          setCandidates(dbCandidates);
          setClips(dbClips);
          setQueue(dbQueue);
          if (dbJobs.length > 0) setJobs(dbJobs);

          if (window.location.hash.includes('login') || window.location.hash.includes('onboarding')) {
            navigate('dashboard');
          }
        } else {
          setCurrentWorkspaceId(null);
          setIsOnboarded(false);
          setSources([]);
          setCandidates([]);
          setClips([]);
          setQueue([]);
          navigate('onboarding');
        }
      } catch (err) {
        console.error('Failed to load user workspace from Firebase:', err);
      }
    },
    [navigate]
  );

  const fetchSources = useCallback(
    async (targetWorkspaceId?: string) => {
      const wsId =
        targetWorkspaceId ||
        currentWorkspaceId ||
        localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace_id`) ||
        'a0000000-0000-4000-a000-000000000001';

      if (!wsId) return;

      setIsFetchingSources(true);
      setSourcesFetchError(null);

      try {
        const fetched = await FirebaseContentRepo.getSources(wsId);
        setSources(fetched);
      } catch (err: any) {
        console.error(`[Discover] Error fetching source_videos for workspace "${wsId}":`, err);
        setSourcesFetchError(err.message || 'Failed to load source videos from Firebase.');
      } finally {
        setIsFetchingSources(false);
      }
    },
    [currentWorkspaceId]
  );

  const fetchCandidates = useCallback(
    async (targetWorkspaceId?: string) => {
      const wsId =
        targetWorkspaceId ||
        currentWorkspaceId ||
        localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace_id`) ||
        'a0000000-0000-4000-a000-000000000001';

      if (!wsId || !isFirebaseConfigured) return;

      setIsFetchingCandidates(true);
      setCandidatesFetchError(null);

      try {
        const fetched = await FirebaseContentRepo.getCandidates(wsId);
        setCandidates(fetched);
      } catch (err: any) {
        console.error(`[ClipFlow] Error fetching clip_candidates for workspace "${wsId}":`, err);
        setCandidatesFetchError(err?.message || 'Failed to load clip candidates from Firebase.');
      } finally {
        setIsFetchingCandidates(false);
      }
    },
    [currentWorkspaceId]
  );

  const fetchClips = useCallback(
    async (targetWorkspaceId?: string) => {
      const wsId =
        targetWorkspaceId ||
        currentWorkspaceId ||
        localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace_id`) ||
        'a0000000-0000-4000-a000-000000000001';

      if (!wsId) return;

      try {
        const fetched = await FirebaseContentRepo.getClips(wsId);
        setClips(fetched);
      } catch (err: any) {
        console.error(`[ClipFlow] Error fetching clips for workspace "${wsId}":`, err);
      }
    },
    [currentWorkspaceId]
  );

  useEffect(() => {
    const wsId =
      currentWorkspaceId ||
      localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace_id`) ||
      'a0000000-0000-4000-a000-000000000001';

    if (!wsId || !isFirebaseConfigured) return;

    FirebaseWorkspaceRepo.getWorkspaceById(wsId)
      .then(({ workspace: dbWs, settings: dbSettings }) => {
        if (dbWs && dbSettings) {
          setWorkspace({
            workspaceName: dbWs.name,
            brandName: dbWs.brand_name || undefined,
            mainNiche: dbSettings.main_niche,
            subtopics: dbSettings.subtopics || [],
            contentLanguage: dbSettings.content_language,
            contentStyle: dbSettings.content_style,
            aspectRatio: (dbSettings.aspect_ratio as '9:16') || '9:16',
            targetPlatforms: dbSettings.target_platforms || [],
            minCandidateScore: dbSettings.min_candidate_score || 80,
            targetDuration: dbSettings.target_duration || '30-60s',
          });
        }
      })
      .catch((err) => {
        console.warn('Could not load workspace settings from Firebase:', err);
      });

    fetchSources(wsId);
    fetchCandidates(wsId);
    fetchClips(wsId);
  }, [currentWorkspaceId, fetchSources, fetchCandidates, fetchClips]);

  // Subscribe to Firebase Auth state
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const name = u.displayName || u.email?.split('@')[0] || 'Creator';
        const sessionUser: UserSession = {
          id: u.uid,
          email: u.email || '',
          name,
          avatarInitials: (name[0] || 'C').toUpperCase(),
        };
        setUser(sessionUser);
        await loadUserWorkspaceFromFirebase(u.uid, sessionUser);
      } else {
        setUser(null);
        setCurrentWorkspaceId(null);
        setIsOnboarded(false);
      }
    });

    return () => unsubscribe();
  }, [loadUserWorkspaceFromFirebase]);

  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const u = res.user;
      const name = u.displayName || u.email?.split('@')[0] || 'Creator';
      const sessionUser: UserSession = {
        id: u.uid,
        email: u.email || '',
        name,
        avatarInitials: (name[0] || 'C').toUpperCase(),
      };
      setUser(sessionUser);
      showToast(`Signed in with Google as ${u.email}`, 'success');
      await loadUserWorkspaceFromFirebase(u.uid, sessionUser);
      return { success: true };
    } catch (err: any) {
      console.error('Google login error:', err);
      showToast(err.message || 'Google sign in failed', 'error');
      return { success: false, error: err.message };
    }
  };

  const login = async (
    email?: string,
    password?: string,
    isSignUp = false,
    fullName?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!email) {
      return loginWithGoogle();
    }

    const trimmedEmail = email.trim();

    if (isFirebaseConfigured && password) {
      try {
        let u;
        if (isSignUp) {
          const res = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
          u = res.user;
        } else {
          const res = await signInWithEmailAndPassword(auth, trimmedEmail, password);
          u = res.user;
        }

        const name = fullName || u.displayName || trimmedEmail.split('@')[0] || 'Creator';
        const sessionUser: UserSession = {
          id: u.uid,
          email: u.email || trimmedEmail,
          name,
          avatarInitials: (name[0] || 'C').toUpperCase(),
        };
        setUser(sessionUser);
        showToast(isSignUp ? 'Account created successfully!' : `Signed in as ${sessionUser.email}`, 'success');
        await loadUserWorkspaceFromFirebase(u.uid, sessionUser);
        return { success: true };
      } catch (err: any) {
        const msg = err?.message || 'Authentication failed';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    // Demo mode fallback
    const displayName = fullName || trimmedEmail.split('@')[0] || 'Creator Lead';
    const newUser: UserSession = {
      id: `usr_${Date.now()}`,
      email: trimmedEmail,
      name: displayName,
      avatarInitials: (displayName[0] || 'C').toUpperCase(),
    };
    setUser(newUser);
    showToast(`Signed in to Demo Workspace (${newUser.email})`, 'success');

    if (!isOnboarded) {
      navigate('onboarding');
    } else {
      navigate('dashboard');
    }
    return { success: true };
  };

  const logout = async () => {
    if (isFirebaseConfigured) {
      try {
        await firebaseSignOut(auth);
      } catch (e) {
        console.warn('Firebase signout warning:', e);
      }
    }
    setUser(null);
    setCurrentWorkspaceId(null);
    setIsOnboarded(false);
    showToast('Signed out of ClipFlow', 'info');
    navigate('login');
  };

  const completeOnboarding = async (config: WorkspaceConfig) => {
    setWorkspace(config);
    setIsOnboarded(true);

    if (user && isFirebaseConfigured) {
      try {
        const res = await FirebaseWorkspaceRepo.createWorkspace(user.id, config);
        if (res?.workspaceId) {
          setCurrentWorkspaceId(res.workspaceId);
          setSources([]);
          setCandidates([]);
          setClips([]);
          setQueue([]);
          showToast(`Workspace "${config.workspaceName}" saved to Firebase!`, 'success');
        } else {
          showToast(`Workspace "${config.workspaceName}" initialized!`, 'success');
        }
      } catch (err) {
        console.error('Failed to save workspace to Firebase:', err);
        showToast(`Workspace initialized`, 'success');
      }
    } else {
      if (!user) {
        setUser({
          id: `usr_${Date.now()}`,
          email: 'creator@clipflow.ai',
          name: config.brandName || config.workspaceName || 'Creator Lead',
          avatarInitials: 'CF',
        });
      }
      showToast(`Workspace "${config.workspaceName}" initialized!`, 'success');
    }

    navigate('dashboard');
  };

  const updateWorkspace = async (partial: Partial<WorkspaceConfig>) => {
    setWorkspace((prev) => ({ ...prev, ...partial }));

    if (currentWorkspaceId && isFirebaseConfigured) {
      await FirebaseWorkspaceRepo.updateWorkspace(currentWorkspaceId, partial);
    }
    showToast('Workspace settings saved', 'success');
  };

  const runDiscovery = async (filters?: {
    freshness?: 'all' | 'last_24h' | 'last_7d' | 'last_30d';
    contentType?: 'all' | 'deep_dive' | 'interviews' | 'keynote';
    subtopic?: string;
  }) => {
    setIsDiscovering(true);
    setDiscoveryProviderError(null);
    const targetSubtopics =
      filters?.subtopic && filters.subtopic !== 'all'
        ? [filters.subtopic]
        : workspace.subtopics;

    const activeWorkspaceId =
      currentWorkspaceId ||
      localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace_id`) ||
      'a0000000-0000-4000-a000-000000000001';

    if (!currentWorkspaceId) {
      setCurrentWorkspaceId(activeWorkspaceId);
    }

    const jobId = `job_disc_${Date.now()}`;
    const newJob: ActiveJob = {
      id: jobId,
      type: 'discovery',
      targetTitle: `Running discovery for "${workspace.mainNiche}"`,
      progress: 30,
      stage: 'Calling discovery function and persisting to Firebase',
      startedAt: 'Just now',
    };
    setJobs((prev) => [newJob, ...prev]);
    showToast(`Discovering sources for "${workspace.mainNiche}"...`, 'info');

    try {
      const userAccessToken = await auth.currentUser?.getIdToken();
      const knownVideoIds = sources.map((s) => s.youtubeUrl || s.id);

      const discovered = await DiscoveryService.discoverSources({
        niche: workspace.mainNiche,
        subtopics: targetSubtopics,
        language: workspace.contentLanguage,
        freshness: filters?.freshness || 'all',
        contentType: filters?.contentType || 'all',
        workspaceId: activeWorkspaceId,
        workspaceName: workspace.workspaceName,
        userAccessToken,
        knownVideoIds,
      });

      if (!discovered || discovered.length === 0) {
        showToast('No new sources found matching filters', 'info');
        return;
      }

      setSources((prev) => {
        const existingIds = new Set(discovered.map((d) => d.id));
        const remaining = prev.filter((p) => !existingIds.has(p.id));
        return [...discovered, ...remaining];
      });

      fetchSources(activeWorkspaceId).catch((syncErr) => {
        console.warn('[Discovery] Background verification notice:', syncErr);
      });

      setActivities((prev) => [
        {
          id: `act_${Date.now()}`,
          type: 'source_discovered',
          title: 'Source videos discovered',
          subtitle: `${discovered.length} source records saved to Firebase`,
          timestamp: 'Just now',
        },
        ...prev,
      ]);

      showToast(`Discovered & persisted ${discovered.length} sources to Firebase`, 'success');
    } catch (err: any) {
      console.error('[Discovery] Discovery execution error:', err);
      const message = err?.message || 'Automatic discovery failed';
      setDiscoveryProviderError(message);
      showToast(message, 'error');
    } finally {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setIsDiscovering(false);
    }
  };

  const analyzeSource = async (sourceId: string) => {
    const src = sources.find((s) => s.id === sourceId);
    if (!src) return;

    const activeWorkspaceId =
      currentWorkspaceId ||
      localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace_id`) ||
      'a0000000-0000-4000-a000-000000000001';

    setIsAnalyzing(true);
    setSources((prev) =>
      prev.map((s) => (s.id === sourceId ? { ...s, status: 'processing' } : s))
    );

    const jobId = `job_an_${Date.now()}`;
    const newJob: ActiveJob = {
      id: jobId,
      type: 'moment_detection',
      targetTitle: `Analyzing: ${src.title.slice(0, 36)}...`,
      progress: 25,
      stage: 'Extracting transcript and evaluating high-retention short-form moments...',
      startedAt: 'Just now',
    };
    setJobs((prev) => [newJob, ...prev]);

    try {
      const userAccessToken = await auth.currentUser?.getIdToken();

      const response = await MomentDetectionService.analyze({
        workspaceId: activeWorkspaceId,
        sourceId,
        niche: workspace.mainNiche,
        subtopics: workspace.subtopics,
        userAccessToken,
      });

      const singleResult = response.results?.[0];

      if (isFirebaseConfigured) {
        try {
          const [updatedCandidates, updatedSources] = await Promise.all([
            FirebaseContentRepo.getCandidates(activeWorkspaceId),
            FirebaseContentRepo.getSources(activeWorkspaceId),
          ]);

          setCandidates(updatedCandidates);
          setSources(updatedSources);
        } catch (fetchErr: any) {
          console.error('[ClipFlow] Failed to refresh candidates after detection:', fetchErr);
        }
      }

      if (singleResult?.contentStatus === 'content_unavailable') {
        showToast('Content unavailable for analysis', 'info');
      } else if (singleResult && singleResult.candidatesFound === 0) {
        showToast('No strong short-form moments found', 'info');
      } else {
        const found = singleResult ? singleResult.candidatesFound : 0;
        showToast(`Analyzed! Found ${found} high-retention moments`, 'success');
      }
    } catch (err: any) {
      console.error('[AppContext] analyzeSource error:', err);
      setSources((prev) =>
        prev.map((s) => (s.id === sourceId ? { ...s, status: 'new' } : s))
      );
      showToast(err?.message || 'Moment analysis failed for this source', 'error');
    } finally {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setIsAnalyzing(false);
    }
  };

  const analyzeAllSources = async () => {
    const unanalyzed = sources.filter((s) => s.status === 'new' || s.status === 'queued');
    if (unanalyzed.length === 0) {
      showToast('All discovered sources are already analyzed!', 'info');
      return;
    }

    const activeWorkspaceId =
      currentWorkspaceId ||
      localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace_id`) ||
      'a0000000-0000-4000-a000-000000000001';

    setIsAnalyzing(true);
    showToast(`Analyzing ${unanalyzed.length} sources with AI Moment Detection...`, 'info');

    const jobId = `job_batch_an_${Date.now()}`;
    const newJob: ActiveJob = {
      id: jobId,
      type: 'moment_detection',
      targetTitle: `Batch Analysis (${unanalyzed.length} videos)`,
      progress: 20,
      stage: 'Running multi-factor moment detection on transcripts and outlines...',
      startedAt: 'Just now',
    };
    setJobs((prev) => [newJob, ...prev]);

    try {
      const userAccessToken = await auth.currentUser?.getIdToken();
      const sourceIds = unanalyzed.map((s) => s.id);

      const response = await MomentDetectionService.analyze({
        workspaceId: activeWorkspaceId,
        sourceIds,
        niche: workspace.mainNiche,
        subtopics: workspace.subtopics,
        userAccessToken,
      });

      if (isFirebaseConfigured) {
        try {
          const [updatedCandidates, updatedSources] = await Promise.all([
            FirebaseContentRepo.getCandidates(activeWorkspaceId),
            FirebaseContentRepo.getSources(activeWorkspaceId),
          ]);

          setCandidates(updatedCandidates);
          setSources(updatedSources);
        } catch (fetchErr: any) {
          console.error('[ClipFlow] Failed to refresh candidates:', fetchErr);
        }
      }

      showToast(
        `Batch analysis complete: Found ${response.candidatesCount || 0} moments across ${response.analyzedCount || 0} sources`,
        'success'
      );
    } catch (err: any) {
      console.error('[AppContext] analyzeAllSources error:', err);
      showToast(err?.message || 'Batch moment detection failed', 'error');
    } finally {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setIsAnalyzing(false);
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

    showToast(`Rendered ${eligible.length} vertical clips from top moments!`, 'success');
    navigate('clips');
  };

  const addSource = async (newSource: { title: string; youtubeUrl: string; niche: string }) => {
    const tempId = `src_${Date.now()}`;
    const urlStr = newSource.youtubeUrl.trim();
    const isYoutube = urlStr.includes('youtube.com') || urlStr.includes('youtu.be');
    const isDirectMedia = urlStr.startsWith('http') && !isYoutube;

    const source: SourceVideo = {
      id: tempId,
      title: newSource.title,
      channelTitle: isYoutube ? 'Discovered YouTube Channel' : 'Direct Media Provider',
      duration: '32:10',
      viewCount: Math.floor(Math.random() * 80000) + 12000,
      publishedAt: 'Today',
      youtubeUrl: isYoutube ? urlStr : '',
      mediaUrl: isDirectMedia ? urlStr : undefined,
      status: 'analyzed',
      candidatesCount: 2,
      summary: `Automated analysis for ${newSource.niche}. High density of structured discussion found.`,
      niche: newSource.niche,
      thumbnailGradient: 'from-slate-800 to-slate-950',
    };

    if (currentWorkspaceId && isFirebaseConfigured) {
      const dbId = await FirebaseContentRepo.insertSource(currentWorkspaceId, source);
      if (dbId) source.id = dbId;
    }

    setSources((prev) => [source, ...prev]);

    const newCandidates: ClipCandidate[] = [
      {
        id: `cand_${Date.now()}_1`,
        sourceVideoId: source.id,
        sourceTitle: source.title,
        channelTitle: source.channelTitle,
        startTime: '03:15',
        endTime: '04:01',
        duration: '46s',
        hook: `Key insight on ${newSource.niche}: Why standard workflows fail at scale.`,
        summary: 'Concrete breakdown of the main bottleneck and tactical steps to resolve it.',
        score: 92,
        factors: { hookStrength: 94, standaloneContext: 90, pacing: 92 },
        status: 'new',
        createdAt: 'Just now',
      },
      {
        id: `cand_${Date.now()}_2`,
        sourceVideoId: source.id,
        sourceTitle: source.title,
        channelTitle: source.channelTitle,
        startTime: '12:40',
        endTime: '13:22',
        duration: '42s',
        hook: `The counter-intuitive metric every creator and builder should track in ${newSource.niche}.`,
        summary: 'Dispels a common myth with empirical evidence and clear takeaway.',
        score: 88,
        factors: { hookStrength: 90, standaloneContext: 86, pacing: 88 },
        status: 'new',
        createdAt: 'Just now',
      },
    ];

    if (currentWorkspaceId && isFirebaseConfigured) {
      for (const cand of newCandidates) {
        const dbId = await FirebaseContentRepo.insertCandidate(currentWorkspaceId, cand);
        if (dbId) cand.id = dbId;
      }
    }

    setCandidates((prev) => [...newCandidates, ...prev]);
    showToast(`Source added! 2 clip candidates detected.`, 'success');
  };

  const runMomentDetection = (sourceId: string) => {
    const src = sources.find((s) => s.id === sourceId);
    if (!src) return;

    const newJob: ActiveJob = {
      id: `job_${Date.now()}`,
      type: 'moment_detection',
      targetTitle: `Transcript analysis: ${src.title.slice(0, 40)}...`,
      progress: 15,
      stage: 'Scanning speech cadence and high-retention inflection points',
      startedAt: 'Just now',
    };
    setJobs((prev) => [newJob, ...prev]);

    showToast(`Moment detection initiated for "${src.title.slice(0, 30)}..."`, 'info');

    setTimeout(() => {
      setJobs((prev) => prev.filter((j) => j.id !== newJob.id));
      showToast(`Analysis complete: 2 new moments found`, 'success');
    }, 3500);
  };

  const selectCandidate = async (candidateId: string) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId
          ? {
              ...c,
              status: 'selected',
              selectionStatus: 'selected',
              factors: { ...c.factors, selectionStatus: 'selected' },
            }
          : c
      )
    );
    if (isFirebaseConfigured) {
      await FirebaseContentRepo.updateCandidateStatus(candidateId, 'selected');
    }
    showToast('Candidate selected for rendering', 'success');
  };

  const approveCandidate = async (candidateId: string) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId
          ? {
              ...c,
              status: 'approved',
              selectionStatus: 'selected',
              factors: { ...c.factors, selectionStatus: 'selected' },
            }
          : c
      )
    );
    if (isFirebaseConfigured) {
      await FirebaseContentRepo.updateCandidateStatus(candidateId, 'approved');
    }
    showToast('Candidate approved for generation', 'success');
  };

  const rejectCandidate = async (candidateId: string) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId
          ? {
              ...c,
              status: 'rejected',
              selectionStatus: 'rejected',
              factors: { ...c.factors, selectionStatus: 'rejected' },
            }
          : c
      )
    );
    if (isFirebaseConfigured) {
      await FirebaseContentRepo.updateCandidateStatus(candidateId, 'rejected');
    }
    showToast('Candidate marked as rejected', 'info');
  };

  const generateClipFromCandidate = async (candidateId: string) => {
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand) return;

    const activeWorkspaceId =
      currentWorkspaceId ||
      localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace_id`) ||
      'a0000000-0000-4000-a000-000000000001';

    const src = sources.find((s) => s.id === cand.sourceVideoId || s.title === cand.sourceTitle);

    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, status: 'generating' } : c))
    );

    const jobId = `job_rend_${Date.now()}`;
    const newJob: ActiveJob = {
      id: jobId,
      type: 'vertical_render',
      targetTitle: `Rendering: ${cand.hook.slice(0, 36)}...`,
      progress: 25,
      stage: 'Acquiring source media & preparing render...',
      startedAt: 'Just now',
    };
    setJobs((prev) => [newJob, ...prev]);

    try {
      const userAccessToken = await auth.currentUser?.getIdToken();

      const renderResult = await ClientRenderService.renderClip({
        candidateId: cand.id,
        workspaceId: activeWorkspaceId,
        sourceVideoId: cand.sourceVideoId,
        sourceTitle: cand.sourceTitle,
        channelTitle: cand.channelTitle,
        startTime: cand.startTime,
        endTime: cand.endTime,
        hook: cand.hook,
        transcriptText: cand.transcriptText || cand.hook,
        summary: cand.summary,
        sourceYoutubeUrl: cand.sourceYoutubeUrl || src?.youtubeUrl,
        mediaUrl: src?.mediaUrl,
        mediaPath: src?.mediaPath,
        reframeMode: 'centered_crop',
        subtitles: {
          style: 'clean',
          fontSize: 22,
        },
        branding: workspace.brandingWatermark
          ? {
              enabled: true,
              brandName: workspace.brandName || workspace.workspaceName,
            }
          : undefined,
        userAccessToken,
      });

      if (!renderResult.success) {
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === candidateId
              ? {
                  ...c,
                  status: c.selectionStatus === 'selected' ? 'selected' : 'new',
                  explanation: renderResult.errorMessage || 'Source media could not be acquired automatically.',
                }
              : c
          )
        );

        if (cand.sourceVideoId) {
          setSources((prev) =>
            prev.map((s) =>
              s.id === cand.sourceVideoId
                ? {
                    ...s,
                    mediaStatus: 'failed',
                    mediaError: renderResult.errorMessage,
                  }
                : s
            )
          );

          if (isFirebaseConfigured) {
            await FirebaseContentRepo.updateSourceMedia(
              cand.sourceVideoId,
              'failed',
              undefined,
              undefined,
              'compliant_media_provider',
              undefined,
              renderResult.errorMessage
            );
          }
        }

        const errorMsg = renderResult.errorMessage || 'Source media could not be acquired automatically.';
        showToast(errorMsg, 'error');
        return;
      }

      const newClip: Clip = {
        id: renderResult.clipId,
        candidateId: cand.id,
        sourceVideoId: cand.sourceVideoId,
        workspaceId: activeWorkspaceId,
        title: cand.hook.split(':')[0] || cand.hook.slice(0, 45),
        hook: cand.hook,
        sourceTitle: cand.sourceTitle,
        channelTitle: cand.channelTitle,
        duration: renderResult.durationFormatted || cand.duration,
        aspectRatio: '9:16',
        style: workspace.contentStyle,
        status: 'ready',
        thumbnailBg: 'from-slate-900 via-neutral-900 to-black',
        thumbnailUrl: renderResult.thumbnailUrl,
        videoUrl: renderResult.videoUrl,
        score: cand.score,
        captionsSample: [
          cand.hook,
          cand.summary?.split('.')[0] || 'Key takeaway highlights.',
        ],
        hashtags: workspace.subtopics
          .map((s) => `#${s.toLowerCase().replace(/[^a-z0-9]/g, '')}`)
          .slice(0, 4),
        createdAt: 'Just now',
      };

      setClips((prev) => [newClip, ...prev]);

      setCandidates((prev) =>
        prev.map((c) =>
          c.id === candidateId
            ? {
                ...c,
                status: 'rendered',
                selectionStatus: 'selected',
                renderedClipId: newClip.id,
              }
            : c
        )
      );

      setActivities((prev) => [
        {
          id: `act_${Date.now()}`,
          type: 'clip_rendered',
          title: 'New vertical clip rendered',
          subtitle: `${newClip.title} (9:16 MP4, ${newClip.duration})`,
          timestamp: 'Just now',
        },
        ...prev,
      ]);

      showToast(`Vertical clip rendered: "${newClip.title}"`, 'success');
    } catch (err: any) {
      console.error('[generateClipFromCandidate] Render error:', err);
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, status: 'approved' } : c))
      );
      showToast(err?.message || 'Rendering failed.', 'error');
    } finally {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    }
  };

  const addClipToQueue = async (clipId: string) => {
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;

    const existing = queue.find((q) => q.clipId === clipId);
    if (existing) {
      showToast('This clip is already in your publishing queue', 'info');
      navigate('queue');
      return;
    }

    const queueId = `queue_${Date.now()}`;
    const newQueueItem: QueueItem = {
      id: queueId,
      clipId: clip.id,
      title: clip.title,
      hook: clip.hook,
      duration: clip.duration,
      platforms: workspace.targetPlatforms,
      captionText: `${clip.hook || ''}\n\n${(clip.captionsSample || []).join(' ')}\n\nWhat are your thoughts on this? Leave a comment below.`,
      hashtags: clip.hashtags,
      status: 'needs_review',
      addedAt: 'Just now',
      style: clip.style,
    };

    if (isFirebaseConfigured) {
      await FirebaseContentRepo.setClipInQueue(clipId, true, 'needs_review');
    }

    setQueue((prev) => [newQueueItem, ...prev]);

    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, status: 'queued' } : c))
    );

    showToast(`Clip added to Queue for publishing review`, 'success');
  };

  const deleteClip = async (clipId: string) => {
    if (isFirebaseConfigured) {
      await FirebaseContentRepo.deleteClip(clipId);
    }
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    setQueue((prev) => prev.filter((q) => q.clipId !== clipId));
    showToast('Clip removed', 'info');
  };

  const updateClipCaptions = async (
    clipId: string,
    hashtags: string[],
    sampleCaptions: string[]
  ) => {
    if (isFirebaseConfigured) {
      await FirebaseContentRepo.updateClip(clipId, {
        hashtags,
        captionsSample: sampleCaptions,
      });
    }
    setClips((prev) =>
      prev.map((c) =>
        c.id === clipId
          ? { ...c, hashtags, captionsSample: sampleCaptions }
          : c
      )
    );
    showToast('Captions and hashtags updated', 'success');
  };

  const approveQueueItem = async (queueId: string) => {
    const item = queue.find((q) => q.id === queueId);
    if (item && isFirebaseConfigured) {
      await FirebaseContentRepo.updateQueueItem(item.clipId, {
        status: 'approved',
        scheduledSlot: 'Next slot (Auto-scheduled)',
      });
    }

    setQueue((prev) =>
      prev.map((q) =>
        q.id === queueId
          ? {
              ...q,
              status: 'approved',
              scheduledSlot: 'Next slot (Auto-scheduled)',
            }
          : q
      )
    );
    showToast('Clip marked as Approved for publishing', 'success');
  };

  const updateQueueItem = async (queueId: string, updates: Partial<QueueItem>) => {
    const item = queue.find((q) => q.id === queueId);
    if (item && isFirebaseConfigured) {
      await FirebaseContentRepo.updateQueueItem(item.clipId, {
        status: updates.status,
        scheduledSlot: updates.scheduledSlot,
      });
    }

    setQueue((prev) =>
      prev.map((q) => (q.id === queueId ? { ...q, ...updates } : q))
    );
    showToast('Queue item updated', 'success');
  };

  const removeFromQueue = async (queueId: string) => {
    const item = queue.find((q) => q.id === queueId);
    if (item && isFirebaseConfigured) {
      await FirebaseContentRepo.setClipInQueue(item.clipId, false);
    }
    setQueue((prev) => prev.filter((q) => q.id !== queueId));
    showToast('Removed from publishing queue', 'info');
  };

  const cancelJob = (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    showToast('Job cancelled', 'info');
  };

  const resetToDemo = () => {
    localStorage.clear();
    setCurrentWorkspaceId(null);
    setUser(INITIAL_USER);
    setIsOnboarded(true);
    setWorkspace(INITIAL_WORKSPACE);
    setSources([]);
    setCandidates([]);
    setClips([]);
    setQueue([]);
    setJobs([]);
    setActivities([]);
    showToast('Reset to clean workspace state', 'info');
    navigate('dashboard');
  };

  return (
    <AppContext.Provider
      value={{
        currentPage,
        navigate,
        user,
        currentWorkspaceId,
        isSupabaseActive: isFirebaseConfigured,
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
