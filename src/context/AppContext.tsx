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
import { DiscoveryService, MockDiscoveryService } from '../services/discoveryService';
import { MomentDetectionService } from '../services/momentDetectionService';
import { ClientRenderService } from '../services/renderService';
import {
  INITIAL_USER,
  INITIAL_WORKSPACE,
  INITIAL_QUEUE,
  INITIAL_JOBS,
  INITIAL_ACTIVITY,
} from '../services/mockData';
import {
  supabase,
  isSupabaseConfigured,
  SupabaseWorkspaceRepo,
  SupabaseContentRepo,
} from '../lib/supabase';

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
    email: string,
    password?: string,
    isSignUp?: boolean,
    fullName?: string
  ) => Promise<{ success: boolean; error?: string }>;
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
  // Page route state
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

  // Current active workspace id in Supabase
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(() => {
    return (
      localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace_id`) ||
      'a0000000-0000-4000-a000-000000000001'
    );
  });

  // User auth state
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

  // Onboarding completion flag
  const [isOnboarded, setIsOnboarded] = useState<boolean>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}onboarded`);
    return saved ? saved === 'true' : true;
  });

  // Workspace configuration
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

  // Core entities: Supabase is the single source of truth (no stale mock or dummy localStorage data)
  const [sources, setSources] = useState<SourceVideo[]>(() => {
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}sources`);
    } catch {
      // ignore
    }
    return [];
  });
  const [isFetchingSources, setIsFetchingSources] = useState<boolean>(false);
  const [sourcesFetchError, setSourcesFetchError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [isFetchingCandidates, setIsFetchingCandidates] = useState<boolean>(false);
  const [candidatesFetchError, setCandidatesFetchError] = useState<string | null>(null);

  const [clips, setClips] = useState<Clip[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}clips`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !parsed.some((c: any) => c.id === 'clip_01' || c.id === 'clip_02')) {
          return parsed;
        }
      } catch {
        // fallback
      }
    }
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}clips`);
    } catch {}
    return [];
  });

  const [queue, setQueue] = useState<QueueItem[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}queue`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !parsed.some((q: any) => q.id === 'queue_01' || q.id === 'queue_02')) {
          return parsed;
        }
      } catch {
        // fallback
      }
    }
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}queue`);
    } catch {}
    return [];
  });

  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [discoveryProviderError, setDiscoveryProviderError] = useState<string | null>(null);

  const clearDiscoveryProviderError = useCallback(() => {
    setDiscoveryProviderError(null);
  }, []);

  // Sync route with window hash
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

  // Sync to localStorage
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
    localStorage.setItem(`${STORAGE_KEY_PREFIX}candidates`, JSON.stringify(candidates));
  }, [candidates]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}clips`, JSON.stringify(clips));
  }, [clips]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}queue`, JSON.stringify(queue));
  }, [queue]);

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

  // Helper to load Supabase workspace and all associated data for a user
  const loadUserWorkspaceFromSupabase = useCallback(
    async (userId: string, userSession: UserSession) => {
      if (!isSupabaseConfigured) return;

      try {
        const { workspace: dbWs, settings: dbSettings } =
          await SupabaseWorkspaceRepo.getWorkspaceForUser(userId);

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

          // Fetch all workspace entities from Supabase in parallel
          const [dbSources, dbCandidates, dbClips, dbQueue, dbJobs] = await Promise.all([
            SupabaseContentRepo.getSources(dbWs.id),
            SupabaseContentRepo.getCandidates(dbWs.id),
            SupabaseContentRepo.getClips(dbWs.id),
            SupabaseContentRepo.getQueue(dbWs.id),
            SupabaseContentRepo.getJobs(dbWs.id),
          ]);

          console.log(`[Discover] Active workspace ID: ${dbWs.id}`);
          console.log(`[Discover] Number of records fetched: ${dbSources.length}`);
          console.log(`[Discover] Number of records displayed: ${dbSources.length}`);

          setSources(dbSources);
          setCandidates(dbCandidates);
          setClips(dbClips);
          setQueue(dbQueue);
          if (dbJobs.length > 0) setJobs(dbJobs);

          // If on login or onboarding, navigate to dashboard
          if (window.location.hash.includes('login') || window.location.hash.includes('onboarding')) {
            navigate('dashboard');
          }
        } else {
          // User exists in Supabase Auth but has no workspace yet -> Needs onboarding!
          setCurrentWorkspaceId(null);
          setIsOnboarded(false);
          setSources([]);
          setCandidates([]);
          setClips([]);
          setQueue([]);
          navigate('onboarding');
        }
      } catch (err) {
        console.error('Failed to load user workspace from Supabase:', err);
      }
    },
    [navigate]
  );

  // Dedicated single-source-of-truth fetcher for source_videos from Supabase
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
        console.log(`[Discover] Active workspace ID: ${wsId}`);
        const fetched = await SupabaseContentRepo.getSources(wsId);
        console.log(`[Discover] Number of records fetched: ${fetched.length}`);
        console.log(`[Discover] Number of records displayed: ${fetched.length}`);
        setSources(fetched);
      } catch (err: any) {
        console.error(`[Discover] Error fetching source_videos for workspace "${wsId}":`, err);
        setSourcesFetchError(err.message || 'Failed to load source videos from Supabase.');
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

      if (!wsId || !isSupabaseConfigured) return;

      setIsFetchingCandidates(true);
      setCandidatesFetchError(null);

      try {
        const fetched = await SupabaseContentRepo.getCandidates(wsId);
        console.log(`[ClipFlow] Current authenticated user ID: ${user?.id || 'anonymous/unauthenticated'}`);
        console.log(`[ClipFlow] Current workspace ID: ${wsId}`);
        console.log(`[ClipFlow] Number of source_videos returned: ${sources.length}`);
        console.log(`[ClipFlow] Number of clip_candidates returned: ${fetched.length}`);
        console.log(`[ClipFlow] Candidate statuses:`, fetched.map((c) => `${c.id}: status=${c.status}, selection=${c.selectionStatus}, score=${c.score}`));

        setCandidates(fetched);
      } catch (err: any) {
        console.error(`[ClipFlow] Error fetching clip_candidates for workspace "${wsId}":`, err);
        setCandidatesFetchError(err?.message || 'Failed to load clip candidates from Supabase.');
      } finally {
        setIsFetchingCandidates(false);
      }
    },
    [currentWorkspaceId, user?.id, sources.length]
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
        const fetched = await SupabaseContentRepo.getClips(wsId);
        console.log(`[ClipFlow] Fetched ${fetched.length} clips from Supabase for workspace "${wsId}"`);
        setClips(fetched);
      } catch (err: any) {
        console.error(`[ClipFlow] Error fetching clips for workspace "${wsId}":`, err);
      }
    },
    [currentWorkspaceId]
  );

  // Load real source_videos, clip_candidates, clips, and workspace settings from Supabase on mount or workspace change
  useEffect(() => {
    const wsId =
      currentWorkspaceId ||
      localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace_id`) ||
      'a0000000-0000-4000-a000-000000000001';

    if (!wsId || !isSupabaseConfigured) return;

    // 1. Load active workspace configuration from Supabase
    SupabaseWorkspaceRepo.getWorkspaceById(wsId)
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
        console.warn('Could not load workspace settings from Supabase:', err);
      });

    // 2. Load persisted source videos, candidates & clips from Supabase
    fetchSources(wsId);
    fetchCandidates(wsId);
    fetchClips(wsId);
  }, [currentWorkspaceId, fetchSources, fetchCandidates, fetchClips]);

  // Initialize Supabase Auth listener on mount
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        const name = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Creator';
        const sessionUser: UserSession = {
          id: u.id,
          email: u.email || '',
          name,
          avatarInitials: (name[0] || 'C').toUpperCase(),
        };
        setUser(sessionUser);
        loadUserWorkspaceFromSupabase(u.id, sessionUser);
      }
    });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const u = session.user;
        const name = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Creator';
        const sessionUser: UserSession = {
          id: u.id,
          email: u.email || '',
          name,
          avatarInitials: (name[0] || 'C').toUpperCase(),
        };
        setUser(sessionUser);

        if (event === 'SIGNED_IN') {
          await loadUserWorkspaceFromSupabase(u.id, sessionUser);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setCurrentWorkspaceId(null);
        setIsOnboarded(false);
        navigate('login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadUserWorkspaceFromSupabase, navigate]);

  // Auth: Login / Signup
  const login = async (
    email: string,
    password?: string,
    isSignUp = false,
    fullName?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const trimmedEmail = email.trim();

    // 1. If Supabase is configured, use real Supabase Auth
    if (isSupabaseConfigured && password) {
      try {
        if (isSignUp) {
          const { data, error } = await supabase.auth.signUp({
            email: trimmedEmail,
            password,
            options: {
              data: {
                full_name: fullName || trimmedEmail.split('@')[0],
              },
            },
          });

          if (error) {
            showToast(error.message, 'error');
            return { success: false, error: error.message };
          }

          if (data.user) {
            const u = data.user;
            const name = fullName || u.email?.split('@')[0] || 'Creator';
            const sessionUser: UserSession = {
              id: u.id,
              email: u.email || trimmedEmail,
              name,
              avatarInitials: (name[0] || 'C').toUpperCase(),
            };
            setUser(sessionUser);
            showToast('Account created successfully!', 'success');
            await loadUserWorkspaceFromSupabase(u.id, sessionUser);
            return { success: true };
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          });

          if (error) {
            showToast(error.message, 'error');
            return { success: false, error: error.message };
          }

          if (data.user) {
            const u = data.user;
            const name = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Creator';
            const sessionUser: UserSession = {
              id: u.id,
              email: u.email || trimmedEmail,
              name,
              avatarInitials: (name[0] || 'C').toUpperCase(),
            };
            setUser(sessionUser);
            showToast(`Signed in as ${sessionUser.email}`, 'success');
            await loadUserWorkspaceFromSupabase(u.id, sessionUser);
            return { success: true };
          }
        }
      } catch (err: any) {
        const msg = err?.message || 'Authentication failed';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    // 2. Demo / Fallback Mode (e.g. Instant Demo Access or when Supabase keys not set)
    const displayName = fullName || trimmedEmail.split('@')[0] || 'Creator Lead';
    const initials = displayName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const newUser: UserSession = {
      id: `usr_${Date.now()}`,
      email: trimmedEmail,
      name: displayName,
      avatarInitials: initials,
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
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Supabase signout warning:', e);
      }
    }
    setUser(null);
    setCurrentWorkspaceId(null);
    setIsOnboarded(false);
    showToast('Signed out of ClipFlow', 'info');
    navigate('login');
  };

  // Complete Onboarding: persists workspace & settings to Supabase
  const completeOnboarding = async (config: WorkspaceConfig) => {
    setWorkspace(config);
    setIsOnboarded(true);

    if (user && isSupabaseConfigured) {
      try {
        const res = await SupabaseWorkspaceRepo.createWorkspace(user.id, config);
        if (res?.workspaceId) {
          setCurrentWorkspaceId(res.workspaceId);
          // Fresh workspace has realistic empty states
          setSources([]);
          setCandidates([]);
          setClips([]);
          setQueue([]);
          showToast(`Workspace "${config.workspaceName}" saved to Supabase!`, 'success');
        } else {
          showToast(`Workspace "${config.workspaceName}" initialized!`, 'success');
        }
      } catch (err) {
        console.error('Failed to save workspace to Supabase:', err);
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

    if (currentWorkspaceId && isSupabaseConfigured) {
      await SupabaseWorkspaceRepo.updateWorkspace(currentWorkspaceId, partial);
    }
    showToast('Workspace settings saved', 'success');
  };

  // Run automated discovery
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

    setDiscoveryProviderError(null);
    const jobId = `job_disc_${Date.now()}`;
    const newJob: ActiveJob = {
      id: jobId,
      type: 'discovery',
      targetTitle: `Running discovery for "${workspace.mainNiche}"`,
      progress: 30,
      stage: 'Calling Netlify discovery function and persisting to Supabase',
      startedAt: 'Just now',
    };
    setJobs((prev) => [newJob, ...prev]);
    showToast(`Discovering sources for "${workspace.mainNiche}"...`, 'info');

    try {
      // Get current user access token if session exists
      const { data: sessionData } = await supabase.auth.getSession();
      const userAccessToken = sessionData?.session?.access_token;

      // Collect known video IDs to avoid repeated searches
      const knownVideoIds = sources.map((s) => s.youtubeUrl || s.id);

      // Call the backend discovery function (Netlify Function / API)
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
        showToast('No new sources found matching filters (already discovered or filtered)', 'info');
        return;
      }

      // Immediately update Discover page state with the records returned by the function
      setSources((prev) => {
        const existingIds = new Set(discovered.map((d) => d.id));
        const remaining = prev.filter((p) => !existingIds.has(p.id));
        const merged = [...discovered, ...remaining];
        console.log(`[Discover] Active workspace ID: ${activeWorkspaceId}`);
        console.log(`[Discover] Number of records fetched: ${discovered.length}`);
        console.log(`[Discover] Number of records displayed: ${merged.length}`);
        return merged;
      });

      // Synchronize persistence with Supabase
      fetchSources(activeWorkspaceId).catch((syncErr) => {
        console.warn('[Discovery] Background verification notice:', syncErr);
      });

      setActivities((prev) => [
        {
          id: `act_${Date.now()}`,
          type: 'source_discovered',
          title: 'Source videos discovered',
          subtitle: `${discovered.length} source records saved to Supabase`,
          timestamp: 'Just now',
        },
        ...prev,
      ]);

      showToast(
        `Discovered & persisted ${discovered.length} sources to Supabase`,
        'success'
      );
    } catch (err: any) {
      console.error('[Discovery] Discovery execution error:', err);
      const isProviderUnavailable =
        err?.code === 'DISCOVERY_PROVIDER_UNAVAILABLE' ||
        err?.status === 503;

      const message = err?.message || 'Automatic discovery failed';
      setDiscoveryProviderError(message);
      if (isProviderUnavailable) {
        showToast('Discovery provider unavailable in current environment', 'error');
      } else {
        showToast(message, 'error');
      }
    } finally {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setIsDiscovering(false);
    }
  };

  // Analyze single source video with real moment-detection pipeline
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
      const { data: sessionData } = await supabase.auth.getSession();
      const userAccessToken = sessionData?.session?.access_token;

      // Call the real moment-detection pipeline backend
      const response = await MomentDetectionService.analyze({
        workspaceId: activeWorkspaceId,
        sourceId,
        niche: workspace.mainNiche,
        subtopics: workspace.subtopics,
        userAccessToken,
      });

      const singleResult = response.results?.[0];

      // Refresh candidates and sources from Supabase
      if (isSupabaseConfigured) {
        try {
          const [updatedCandidates, updatedSources] = await Promise.all([
            SupabaseContentRepo.getCandidates(activeWorkspaceId),
            SupabaseContentRepo.getSources(activeWorkspaceId),
          ]);

          setCandidates(updatedCandidates);
          setSources(updatedSources);
          console.log(`[ClipFlow] Detection complete. Supabase refreshed candidates: ${updatedCandidates.length}, sources: ${updatedSources.length}`);
        } catch (fetchErr: any) {
          console.error('[ClipFlow] Failed to refresh candidates after detection:', fetchErr);
        }
      } else {
        // Fallback local update
        setSources((prev) =>
          prev.map((s) =>
            s.id === sourceId
              ? {
                  ...s,
                  status: 'analyzed',
                  candidatesCount: singleResult ? singleResult.candidatesFound : s.candidatesCount,
                  summary: singleResult?.message ? `${singleResult.message} · ${s.summary}` : s.summary,
                }
              : s
          )
        );
      }

      if (singleResult?.contentStatus === 'content_unavailable') {
        showToast('Content unavailable for analysis: No transcript or chapters found', 'info');
      } else if (singleResult && singleResult.candidatesFound === 0) {
        showToast('No strong short-form moments found in this video', 'info');
      } else {
        const found = singleResult ? singleResult.candidatesFound : 0;
        showToast(`Analyzed! Found ${found} high-retention moments`, 'success');
      }

      setActivities((prev) => [
        {
          id: `act_${Date.now()}`,
          type: 'candidate_detected',
          title: 'Source analyzed for short-form clips',
          subtitle: `Analysis finished for "${src.title.slice(0, 36)}..."`,
          timestamp: 'Just now',
        },
        ...prev,
      ]);
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

  // Analyze all un-indexed sources
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
      const { data: sessionData } = await supabase.auth.getSession();
      const userAccessToken = sessionData?.session?.access_token;

      const sourceIds = unanalyzed.map((s) => s.id);

      const response = await MomentDetectionService.analyze({
        workspaceId: activeWorkspaceId,
        sourceIds,
        niche: workspace.mainNiche,
        subtopics: workspace.subtopics,
        userAccessToken,
      });

      // Synchronize state directly from Supabase
      if (isSupabaseConfigured) {
        try {
          const [updatedCandidates, updatedSources] = await Promise.all([
            SupabaseContentRepo.getCandidates(activeWorkspaceId),
            SupabaseContentRepo.getSources(activeWorkspaceId),
          ]);

          setCandidates(updatedCandidates);
          setSources(updatedSources);
          console.log(`[ClipFlow] Batch detection complete. Supabase refreshed candidates: ${updatedCandidates.length}, sources: ${updatedSources.length}`);
        } catch (fetchErr: any) {
          console.error('[ClipFlow] Failed to refresh candidates after batch detection:', fetchErr);
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

  // Batch approve and render top moments
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

  // Manual source override
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

    if (currentWorkspaceId && isSupabaseConfigured) {
      const dbId = await SupabaseContentRepo.insertSource(currentWorkspaceId, source);
      if (dbId) source.id = dbId;
    }

    setSources((prev) => [source, ...prev]);

    // Create 2 candidate moments automatically
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

    if (currentWorkspaceId && isSupabaseConfigured) {
      for (const cand of newCandidates) {
        const dbId = await SupabaseContentRepo.insertCandidate(currentWorkspaceId, cand);
        if (dbId) cand.id = dbId;
      }
    }

    setCandidates((prev) => [...newCandidates, ...prev]);

    setActivities((prev) => [
      {
        id: `act_${Date.now()}`,
        type: 'source_discovered',
        title: 'New source analyzed',
        subtitle: `${source.title.slice(0, 48)}... (2 moments detected)`,
        timestamp: 'Just now',
      },
      ...prev,
    ]);

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
    console.log(`[ClipFlow] Candidate selected: ${candidateId}`);
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
    if (isSupabaseConfigured) {
      await SupabaseContentRepo.updateCandidateStatus(candidateId, 'selected');
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
    if (isSupabaseConfigured) {
      await SupabaseContentRepo.updateCandidateStatus(candidateId, 'approved');
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
    if (isSupabaseConfigured) {
      await SupabaseContentRepo.updateCandidateStatus(candidateId, 'rejected');
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

    // Find linked source video
    const src = sources.find((s) => s.id === cand.sourceVideoId || s.title === cand.sourceTitle);
    const hasSourceUrl = Boolean(cand.sourceYoutubeUrl || src?.youtubeUrl);

    console.log(`[ClipFlow] Candidate selected: ${cand.id}`);
    console.log(`[ClipFlow] Source video: ${cand.sourceVideoId || src?.id || 'N/A'}`);
    console.log(`[ClipFlow] Source URL available: ${hasSourceUrl}`);
    console.log(`[ClipFlow] Media acquisition: started`);

    // Update candidate status to generating
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
      const { data: sessionData } = await supabase.auth.getSession();
      const userAccessToken = sessionData?.session?.access_token;

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
        // Update candidate status and error info
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

        // Update source video media state
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

          if (isSupabaseConfigured) {
            await SupabaseContentRepo.updateSourceMedia(
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

      // Real rendered clip generated
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

    // Check if already in queue
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

    if (isSupabaseConfigured) {
      await SupabaseContentRepo.setClipInQueue(clipId, true, 'needs_review');
    }

    setQueue((prev) => [newQueueItem, ...prev]);

    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, status: 'queued' } : c))
    );

    setActivities((prev) => [
      {
        id: `act_${Date.now()}`,
        type: 'queue_approved',
        title: 'Clip added to queue',
        subtitle: `${clip.title} ready for final review`,
        timestamp: 'Just now',
      },
      ...prev,
    ]);

    showToast(`Clip added to Queue for publishing review`, 'success');
  };

  const deleteClip = async (clipId: string) => {
    if (isSupabaseConfigured) {
      await SupabaseContentRepo.deleteClip(clipId);
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
    if (isSupabaseConfigured) {
      await SupabaseContentRepo.updateClip(clipId, {
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
    if (item && isSupabaseConfigured) {
      await SupabaseContentRepo.updateQueueItem(item.clipId, {
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
    if (item && isSupabaseConfigured) {
      await SupabaseContentRepo.updateQueueItem(item.clipId, {
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
    if (item && isSupabaseConfigured) {
      await SupabaseContentRepo.setClipInQueue(item.clipId, false);
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
        isSupabaseActive: isSupabaseConfigured,
        login,
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
