import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  WorkspaceConfig,
  SourceVideo,
  ClipCandidate,
  Clip,
  ActiveJob,
  QueueItem,
} from '../types';

// Initialize Firebase App & Services
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const isFirebaseConfigured = Boolean(firebaseConfig.projectId && firebaseConfig.appId);

// Test connection on boot
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Error Handling Infrastructure
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Database record interfaces matching ClipFlow V1 schema
export interface DbWorkspace {
  id: string;
  owner_id: string;
  name: string;
  brand_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbWorkspaceSettings {
  id: string;
  workspace_id: string;
  main_niche: string;
  subtopics: string[];
  content_language: string;
  content_style: string;
  aspect_ratio: string;
  target_platforms: string[];
  min_candidate_score: number;
  target_duration: string;
  branding_settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DbSourceVideo {
  id: string;
  workspace_id: string;
  title: string;
  channel_title: string;
  duration: string;
  view_count: number;
  published_at: string;
  youtube_url: string;
  status: 'new' | 'queued' | 'processing' | 'analyzed' | 'failed';
  relevance_score: number | null;
  freshness_tag: string | null;
  candidates_count: number;
  summary: string;
  niche: string;
  thumbnail_gradient: string;
  media_status?: 'unavailable' | 'available' | 'processing' | 'failed' | null;
  media_provider?: string | null;
  media_reference?: string | null;
  media_path?: string | null;
  media_url?: string | null;
  media_error?: string | null;
  media_updated_at?: string | null;
  created_at: string;
}

export interface DbClipCandidate {
  id: string;
  workspace_id: string;
  source_video_id: string | null;
  source_title: string;
  channel_title: string;
  start_time: string;
  end_time: string;
  duration: string;
  hook: string;
  summary: string;
  score: number;
  factors: Record<string, any>;
  status: 'new' | 'in_review' | 'generating' | 'approved' | 'rejected' | 'selected' | 'detected' | 'rendered' | 'failed';
  created_at: string;
}

export interface DbClip {
  id: string;
  workspace_id: string;
  candidate_id: string | null;
  title: string;
  hook: string;
  source_title: string;
  channel_title: string;
  duration: string;
  aspect_ratio: '9:16';
  style: string;
  status: 'ready' | 'rendering' | 'draft' | 'queued' | 'published';
  thumbnail_bg: string;
  captions_sample: string[];
  hashtags: string[];
  progress: number;
  in_queue: boolean;
  queue_status: 'needs_review' | 'approved' | 'scheduled' | 'exported';
  video_url: string | null;
  scheduled_slot: string | null;
  created_at: string;
}

export interface DbJob {
  id: string;
  workspace_id: string;
  type: 'discovery' | 'moment_detection' | 'vertical_render' | 'caption_generation';
  target_title: string;
  progress: number;
  stage: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at: string | null;
}

// ============================================================================
// FIREBASE REPOSITORY SERVICES
// ============================================================================

export const FirebaseWorkspaceRepo = {
  /**
   * Fetch the workspace and settings for a user
   */
  async getWorkspaceForUser(userId: string): Promise<{
    workspace: DbWorkspace | null;
    settings: DbWorkspaceSettings | null;
  }> {
    if (!isFirebaseConfigured) return { workspace: null, settings: null };

    try {
      const q = query(
        collection(db, 'workspaces'),
        where('owner_id', '==', userId),
        limit(1)
      );
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        return { workspace: null, settings: null };
      }

      const docSnap = querySnap.docs[0];
      const ws = { id: docSnap.id, ...docSnap.data() } as DbWorkspace;

      const settingsQuery = query(
        collection(db, 'workspace_settings'),
        where('workspace_id', '==', ws.id),
        limit(1)
      );
      const settingsSnap = await getDocs(settingsQuery);

      const settingsData = settingsSnap.empty
        ? null
        : ({ id: settingsSnap.docs[0].id, ...settingsSnap.docs[0].data() } as DbWorkspaceSettings);

      return {
        workspace: ws,
        settings: settingsData,
      };
    } catch (err) {
      console.error('getWorkspaceForUser error:', err);
      return { workspace: null, settings: null };
    }
  },

  /**
   * Create a workspace and its corresponding settings
   */
  async createWorkspace(
    userId: string,
    config: WorkspaceConfig
  ): Promise<{ workspaceId: string } | null> {
    if (!isFirebaseConfigured) return null;

    try {
      const wsRef = doc(collection(db, 'workspaces'));
      const workspaceId = wsRef.id;
      const now = new Date().toISOString();

      const wsData: DbWorkspace = {
        id: workspaceId,
        owner_id: userId,
        name: config.workspaceName || 'My Workspace',
        brand_name: config.brandName || null,
        created_at: now,
        updated_at: now,
      };

      await setDoc(wsRef, wsData);

      const settingsRef = doc(collection(db, 'workspace_settings'));
      const settingsData: DbWorkspaceSettings = {
        id: settingsRef.id,
        workspace_id: workspaceId,
        main_niche: config.mainNiche,
        subtopics: config.subtopics || [],
        content_language: config.contentLanguage || 'English (US)',
        content_style: config.contentStyle || 'Dynamic',
        aspect_ratio: config.aspectRatio || '9:16',
        target_platforms: config.targetPlatforms || [],
        min_candidate_score: config.minCandidateScore ?? 60,
        target_duration: config.targetDuration || '30s',
        branding_settings: {
          brandName: config.brandName || '',
          aspectRatio: config.aspectRatio || '9:16',
        },
        created_at: now,
        updated_at: now,
      };

      await setDoc(settingsRef, settingsData);

      return { workspaceId };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'workspaces');
      return null;
    }
  },

  /**
   * Fetch workspace and settings by workspaceId
   */
  async getWorkspaceById(workspaceId: string): Promise<{
    workspace: DbWorkspace | null;
    settings: DbWorkspaceSettings | null;
  }> {
    if (!isFirebaseConfigured || !workspaceId) return { workspace: null, settings: null };

    try {
      const wsDoc = await getDoc(doc(db, 'workspaces', workspaceId));
      if (!wsDoc.exists()) {
        return { workspace: null, settings: null };
      }

      const ws = { id: wsDoc.id, ...wsDoc.data() } as DbWorkspace;

      const settingsQuery = query(
        collection(db, 'workspace_settings'),
        where('workspace_id', '==', workspaceId),
        limit(1)
      );
      const settingsSnap = await getDocs(settingsQuery);

      const settingsData = settingsSnap.empty
        ? null
        : ({ id: settingsSnap.docs[0].id, ...settingsSnap.docs[0].data() } as DbWorkspaceSettings);

      return {
        workspace: ws,
        settings: settingsData,
      };
    } catch (err) {
      console.error('getWorkspaceById error:', err);
      return { workspace: null, settings: null };
    }
  },

  /**
   * Update workspace & settings
   */
  async updateWorkspace(
    workspaceId: string,
    partial: Partial<WorkspaceConfig>
  ): Promise<boolean> {
    if (!isFirebaseConfigured) return false;

    try {
      const now = new Date().toISOString();

      if (partial.workspaceName || partial.brandName !== undefined) {
        const wsRef = doc(db, 'workspaces', workspaceId);
        await updateDoc(wsRef, {
          ...(partial.workspaceName ? { name: partial.workspaceName } : {}),
          ...(partial.brandName !== undefined ? { brand_name: partial.brandName } : {}),
          updated_at: now,
        });
      }

      const settingsQuery = query(
        collection(db, 'workspace_settings'),
        where('workspace_id', '==', workspaceId),
        limit(1)
      );
      const settingsSnap = await getDocs(settingsQuery);

      const settingsUpdate: Record<string, any> = {
        workspace_id: workspaceId,
        updated_at: now,
      };
      if (partial.mainNiche) settingsUpdate.main_niche = partial.mainNiche;
      if (partial.subtopics) settingsUpdate.subtopics = partial.subtopics;
      if (partial.contentLanguage) settingsUpdate.content_language = partial.contentLanguage;
      if (partial.contentStyle) settingsUpdate.content_style = partial.contentStyle;
      if (partial.aspectRatio) settingsUpdate.aspect_ratio = partial.aspectRatio;
      if (partial.targetPlatforms) settingsUpdate.target_platforms = partial.targetPlatforms;
      if (partial.minCandidateScore !== undefined)
        settingsUpdate.min_candidate_score = partial.minCandidateScore;
      if (partial.targetDuration) settingsUpdate.target_duration = partial.targetDuration;

      if (!settingsSnap.empty) {
        const settingsRef = doc(db, 'workspace_settings', settingsSnap.docs[0].id);
        await updateDoc(settingsRef, settingsUpdate);
      } else {
        const settingsRef = doc(collection(db, 'workspace_settings'));
        await setDoc(settingsRef, {
          id: settingsRef.id,
          created_at: now,
          ...settingsUpdate,
        });
      }

      return true;
    } catch (err) {
      console.error('updateWorkspace error:', err);
      return false;
    }
  },
};

export const FirebaseContentRepo = {
  // --- Sources ---
  async getSources(workspaceId: string): Promise<SourceVideo[]> {
    const targetWsId = (workspaceId || '').trim();
    if (!targetWsId) return [];

    let rawData: DbSourceVideo[] = [];

    if (isFirebaseConfigured) {
      try {
        const q = query(
          collection(db, 'source_videos'),
          where('workspace_id', '==', targetWsId)
        );
        const querySnap = await getDocs(q);
        rawData = querySnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as DbSourceVideo));
      } catch (err: any) {
        console.warn('[FirebaseContentRepo] Direct Firestore query error:', err);
      }
    }

    // Fallback to proxy API if client query yields empty
    if (rawData.length === 0) {
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resp = await fetch(`/api/sources?workspaceId=${encodeURIComponent(targetWsId)}`, { headers });
        if (resp.ok) {
          const json = await resp.json();
          if (json.success && Array.isArray(json.sources)) {
            rawData = json.sources;
          }
        }
      } catch (proxyErr) {
        console.warn('[FirebaseContentRepo] API proxy fetch error:', proxyErr);
      }
    }

    return rawData.map((d: DbSourceVideo) => {
      let meta: any = null;
      if (d.summary && d.summary.startsWith('[CLIPFLOW_META:')) {
        try {
          const endIdx = d.summary.indexOf(']');
          if (endIdx > 15) {
            meta = JSON.parse(d.summary.slice(15, endIdx));
          }
        } catch {
          // ignore
        }
      }

      const scoreMatch = d.summary?.match(/Scores: Rel (\d+)% · Eng (\d+)% · Short-Form (\d+)% · Quality (\d+)%/);
      const relScore = meta?.rel ?? (scoreMatch ? Number(scoreMatch[1]) : (d.relevance_score ?? 88));
      const engScore = meta?.eng ?? (scoreMatch ? Number(scoreMatch[2]) : 85);
      const sfScore = meta?.sf ?? (scoreMatch ? Number(scoreMatch[3]) : 80);
      const qualScore = meta?.qual ?? (scoreMatch ? Number(scoreMatch[4]) : 80);
      const overall = meta?.overall ?? (d.relevance_score ?? Math.round(relScore * 0.3 + engScore * 0.3 + sfScore * 0.25 + qualScore * 0.15));

      let explanation = meta?.exp || meta?.rationale;
      if (!explanation && d.summary?.includes('(Scores:')) {
        explanation = d.summary.split('(Scores:')[0].replace(/^\[CLIPFLOW_META:[^\]]+\]\s*/, '').trim();
      }

      let description = meta?.desc;
      if (!description && d.summary?.includes(') — ')) {
        description = d.summary.split(') — ')[1].trim();
      } else if (!description) {
        description = d.summary?.replace(/^\[CLIPFLOW_META:[^\]]+\]\s*/, '');
      }

      const isDev =
        meta?.isDev ??
        (d.youtube_url?.startsWith('dev://') ||
          d.youtube_url?.includes('test-source') ||
          d.youtube_url?.includes('dev_fit_') ||
          d.youtube_url?.includes('dev_tech_'));

      return {
        id: d.id,
        title: d.title,
        description,
        channelTitle: d.channel_title,
        duration: d.duration,
        viewCount: Number(d.view_count),
        publishedAt: d.published_at,
        youtubeUrl: d.youtube_url,
        status: d.status,
        relevanceScore: relScore,
        contentQualityScore: qualScore,
        engagementScore: engScore,
        shortFormScore: sfScore,
        overallScore: overall,
        scoreExplanation: explanation,
        freshnessTag: d.freshness_tag ?? undefined,
        candidatesCount: d.candidates_count,
        summary: description || d.summary,
        niche: d.niche,
        thumbnailGradient: d.thumbnail_gradient,
        mediaStatus: (d.media_status as any) || 'unavailable',
        mediaProvider: d.media_provider ?? undefined,
        mediaReference: d.media_reference ?? undefined,
        mediaPath: d.media_path ?? undefined,
        mediaUrl: d.media_url ?? undefined,
        mediaError: d.media_error ?? undefined,
        mediaUpdatedAt: d.media_updated_at ?? undefined,
        isDevelopmentSource: isDev,
        isSyntheticData: isDev,
      };
    });
  },

  async insertSource(workspaceId: string, src: Omit<SourceVideo, 'id'>): Promise<string | null> {
    if (!isFirebaseConfigured) return null;
    try {
      const docRef = doc(collection(db, 'source_videos'));
      const id = docRef.id;
      const now = new Date().toISOString();

      const payload: DbSourceVideo = {
        id,
        workspace_id: workspaceId,
        title: src.title,
        channel_title: src.channelTitle,
        duration: src.duration,
        view_count: src.viewCount,
        published_at: src.publishedAt,
        youtube_url: src.youtubeUrl,
        status: src.status,
        relevance_score: src.relevanceScore ?? 90,
        freshness_tag: src.freshnessTag ?? null,
        candidates_count: src.candidatesCount,
        summary: src.summary,
        niche: src.niche,
        thumbnail_gradient: src.thumbnailGradient,
        media_status: src.mediaStatus || 'unavailable',
        media_provider: src.mediaProvider || null,
        media_reference: src.mediaReference || null,
        media_path: src.mediaPath || null,
        media_url: src.mediaUrl || null,
        media_error: src.mediaError || null,
        created_at: now,
      };

      await setDoc(docRef, payload);
      return id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'source_videos');
      return null;
    }
  },

  async updateSource(sourceId: string, updates: Partial<SourceVideo>): Promise<boolean> {
    if (!isFirebaseConfigured) return false;
    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.candidatesCount !== undefined) dbUpdates.candidates_count = updates.candidatesCount;
      if (updates.summary) dbUpdates.summary = updates.summary;
      if (updates.mediaStatus) dbUpdates.media_status = updates.mediaStatus;
      if (updates.mediaProvider) dbUpdates.media_provider = updates.mediaProvider;
      if (updates.mediaReference) dbUpdates.media_reference = updates.mediaReference;
      if (updates.mediaPath) dbUpdates.media_path = updates.mediaPath;
      if (updates.mediaUrl) dbUpdates.media_url = updates.mediaUrl;
      if (updates.mediaError) dbUpdates.media_error = updates.mediaError;
      if (updates.mediaUpdatedAt) dbUpdates.media_updated_at = updates.mediaUpdatedAt;

      await updateDoc(doc(db, 'source_videos', sourceId), dbUpdates);
      return true;
    } catch (err) {
      console.error('updateSource error:', err);
      return false;
    }
  },

  async updateSourceMedia(
    sourceId: string,
    mediaStatus: 'unavailable' | 'available' | 'processing' | 'failed',
    mediaPath?: string,
    mediaUrl?: string,
    mediaProvider?: string,
    mediaReference?: string,
    mediaError?: string
  ): Promise<boolean> {
    if (!isFirebaseConfigured) return false;
    try {
      const dbUpdates: Record<string, any> = {
        media_status: mediaStatus,
        media_updated_at: new Date().toISOString(),
      };
      if (mediaPath !== undefined) dbUpdates.media_path = mediaPath;
      if (mediaUrl !== undefined) dbUpdates.media_url = mediaUrl;
      if (mediaProvider !== undefined) dbUpdates.media_provider = mediaProvider;
      if (mediaReference !== undefined) dbUpdates.media_reference = mediaReference;
      if (mediaError !== undefined) dbUpdates.media_error = mediaError;

      await updateDoc(doc(db, 'source_videos', sourceId), dbUpdates);
      return true;
    } catch (err) {
      console.error('updateSourceMedia error:', err);
      return false;
    }
  },

  // --- Candidates ---
  async getCandidates(workspaceId: string): Promise<ClipCandidate[]> {
    if (!isFirebaseConfigured) return [];
    
    let candidateRows: DbClipCandidate[] = [];
    const sourceMap = new Map<string, DbSourceVideo>();

    try {
      const sourcesQuery = query(
        collection(db, 'source_videos'),
        where('workspace_id', '==', workspaceId)
      );
      const sourcesSnap = await getDocs(sourcesQuery);
      sourcesSnap.docs.forEach((docSnap) => {
        const s = { id: docSnap.id, ...docSnap.data() } as DbSourceVideo;
        sourceMap.set(s.id, s);
      });

      const candQuery = query(
        collection(db, 'clip_candidates'),
        where('workspace_id', '==', workspaceId)
      );
      const candSnap = await getDocs(candQuery);
      candidateRows = candSnap.docs.map(
        (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as DbClipCandidate)
      );
    } catch (directErr) {
      console.warn('[FirebaseContentRepo] Direct Firestore candidate query warning:', directErr);
    }

    // Proxy fallback if empty or direct query had issues
    if (candidateRows.length === 0) {
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resp = await fetch(`/api/candidates?workspaceId=${encodeURIComponent(workspaceId)}`, { headers });
        if (resp.ok) {
          const json = await resp.json();
          if (json.success && Array.isArray(json.candidates)) {
            candidateRows = json.candidates;
            if (Array.isArray(json.sources)) {
              for (const s of json.sources) {
                sourceMap.set(s.id, s);
              }
            }
          }
        }
      } catch (apiErr) {
        console.warn('[FirebaseContentRepo] /api/candidates query fallback warning:', apiErr);
      }
    }

    candidateRows.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

    return candidateRows.map((c: DbClipCandidate) => {
      const factors = (c.factors || {}) as any;
      const score = Number(c.score) || 0;
      const parentSource = c.source_video_id ? sourceMap.get(c.source_video_id) : undefined;

      let qualityTier: 'Excellent' | 'Strong' | 'Potential' | 'Weak' =
        factors.qualityTier ||
        (score >= 90 ? 'Excellent' : score >= 75 ? 'Strong' : score >= 60 ? 'Potential' : 'Weak');

      const youtubeUrl = parentSource?.youtube_url || factors.sourceYoutubeUrl || '';
      let sourceThumbnailUrl = factors.sourceThumbnailUrl || undefined;
      if (!sourceThumbnailUrl && youtubeUrl) {
        const match = youtubeUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
        if (match && match[1]) {
          sourceThumbnailUrl = `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
        }
      }

      const rank = factors.rank || 1;
      const rawStatus = (c.status || 'new').toLowerCase();
      const selectionStatus: 'selected' | 'candidate' | 'rejected' =
        factors.selectionStatus ||
        (rawStatus === 'selected' || rawStatus === 'approved' || rawStatus === 'rendered' || score >= 75
          ? 'selected'
          : rawStatus === 'rejected' || score < 60
          ? 'rejected'
          : 'candidate');

      const selectionReason =
        factors.selectionReason ||
        factors.scoreReason ||
        factors.explanation ||
        (selectionStatus === 'selected'
          ? `Selected (#${rank}) for high-hook engagement and concise standalone retention.`
          : selectionStatus === 'candidate'
          ? 'Potential candidate: Meets criteria for short-form review.'
          : 'Downranked: Lower standalone clarity or introductory filler.');

      return {
        id: c.id,
        workspaceId: c.workspace_id || workspaceId,
        sourceVideoId: c.source_video_id || parentSource?.id || '',
        sourceTitle: parentSource?.title || c.source_title || 'Discovered Source',
        channelTitle: parentSource?.channel_title || c.channel_title || 'Creator Channel',
        startTime: c.start_time || '00:00',
        endTime: c.end_time || '00:30',
        duration: c.duration || '00:30',
        estimatedDuration: c.duration || '00:30',
        hook: c.hook || c.summary || 'Insight moment',
        summary: c.summary || `${c.hook}`,
        score,
        qualityTier,
        factors: {
          ...factors,
          qualityTier,
          rank,
          selectionStatus,
          selectionReason,
        },
        rank,
        selectionStatus,
        selectionReason,
        explanation: factors.scoreReason || factors.explanation || selectionReason,
        scoreReason: factors.scoreReason || factors.explanation || selectionReason,
        transcriptText: factors.transcriptText || c.hook || '',
        payoff: factors.payoff || undefined,
        contextSummary: factors.contextSummary || undefined,
        sourceThumbnailUrl,
        sourceYoutubeUrl: youtubeUrl || undefined,
        mediaStatus: parentSource?.media_status || undefined,
        mediaUrl: parentSource?.media_url || undefined,
        mediaPath: parentSource?.media_path || undefined,
        status: c.status,
        createdAt: c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Recent',
      };
    });
  },

  async insertCandidate(workspaceId: string, cand: Omit<ClipCandidate, 'id'>): Promise<string | null> {
    if (!isFirebaseConfigured) return null;
    try {
      const candRef = doc(collection(db, 'clip_candidates'));
      const id = candRef.id;
      const now = new Date().toISOString();

      const payload: DbClipCandidate = {
        id,
        workspace_id: workspaceId,
        source_video_id: cand.sourceVideoId || null,
        source_title: cand.sourceTitle,
        channel_title: cand.channelTitle,
        start_time: cand.startTime,
        end_time: cand.endTime,
        duration: cand.duration,
        hook: cand.hook,
        summary: cand.summary,
        score: cand.score,
        factors: cand.factors || {},
        status: cand.status || 'new',
        created_at: now,
      };

      await setDoc(candRef, payload);
      return id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'clip_candidates');
      return null;
    }
  },

  async updateCandidateStatus(
    candidateId: string,
    status: ClipCandidate['status']
  ): Promise<boolean> {
    if (!isFirebaseConfigured) return false;
    try {
      const dbStatus: 'new' | 'in_review' | 'generating' | 'approved' | 'rejected' =
        status === 'selected' || status === 'approved'
          ? 'approved'
          : status === 'rejected'
          ? 'rejected'
          : status === 'generating'
          ? 'generating'
          : status === 'in_review'
          ? 'in_review'
          : 'new';

      await updateDoc(doc(db, 'clip_candidates', candidateId), { status: dbStatus });
      return true;
    } catch (err) {
      console.error('updateCandidateStatus error:', err);
      return false;
    }
  },

  // --- Clips ---
  async getClips(workspaceId: string): Promise<Clip[]> {
    let rawClips: DbClip[] = [];

    if (isFirebaseConfigured) {
      try {
        const q = query(
          collection(db, 'clips'),
          where('workspace_id', '==', workspaceId)
        );
        const querySnap = await getDocs(q);
        rawClips = querySnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as DbClip));
      } catch (err) {
        console.warn('[FirebaseContentRepo] Direct getClips error:', err);
      }
    }

    if (rawClips.length === 0) {
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resp = await fetch(`/api/clips?workspaceId=${encodeURIComponent(workspaceId)}`, { headers });
        if (resp.ok) {
          const json = await resp.json();
          if (json.success && Array.isArray(json.clips)) {
            rawClips = json.clips;
          }
        }
      } catch (proxyErr) {
        console.warn('[FirebaseContentRepo] /api/clips query fallback warning:', proxyErr);
      }
    }

    return rawClips.map((cl: DbClip) => {
      const rawThumb = cl.thumbnail_bg || (cl as any).thumbnail_url;
      const rawVideo = cl.video_url;

      const isThumbUrl = rawThumb && typeof rawThumb === 'string' && (rawThumb.startsWith('/') || rawThumb.startsWith('http'));
      const isVideoUrl = rawVideo && typeof rawVideo === 'string' && (rawVideo.startsWith('/') || rawVideo.startsWith('http'));

      return {
        id: cl.id,
        candidateId: cl.candidate_id || '',
        workspaceId: cl.workspace_id,
        title: cl.title,
        hook: cl.hook,
        sourceTitle: cl.source_title,
        channelTitle: cl.channel_title,
        duration: cl.duration,
        aspectRatio: cl.aspect_ratio,
        style: cl.style,
        status: cl.status,
        thumbnailBg: rawThumb,
        thumbnailUrl: isThumbUrl ? rawThumb : undefined,
        videoUrl: isVideoUrl ? rawVideo : undefined,
        captionsSample: cl.captions_sample,
        hashtags: cl.hashtags,
        createdAt: cl.created_at ? new Date(cl.created_at).toLocaleDateString() : 'Recent',
        progress: cl.progress,
      };
    });
  },

  async insertClip(workspaceId: string, clip: Omit<Clip, 'id'> & { inQueue?: boolean }): Promise<string | null> {
    if (!isFirebaseConfigured) return null;
    try {
      const clipRef = doc(collection(db, 'clips'));
      const id = clipRef.id;
      const now = new Date().toISOString();

      const insertPayload: DbClip = {
        id,
        workspace_id: workspaceId,
        candidate_id: clip.candidateId || null,
        title: clip.title || 'Untitled Clip',
        hook: clip.hook || '',
        source_title: clip.sourceTitle || 'Discovered Video',
        channel_title: clip.channelTitle || 'Creator Channel',
        duration: clip.duration || '00:30',
        aspect_ratio: (clip.aspectRatio as '9:16') || '9:16',
        style: clip.style || 'Dynamic',
        status: (clip.status as any) || 'ready',
        thumbnail_bg: clip.thumbnailUrl || clip.thumbnailBg || '',
        captions_sample: clip.captionsSample || [],
        hashtags: clip.hashtags || [],
        progress: clip.progress ?? 100,
        in_queue: clip.inQueue ?? false,
        queue_status: 'needs_review',
        video_url: clip.videoUrl || null,
        scheduled_slot: null,
        created_at: now,
      };

      await setDoc(clipRef, insertPayload);
      return id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'clips');
      return null;
    }
  },

  async updateClip(clipId: string, updates: Partial<Clip>): Promise<boolean> {
    if (!isFirebaseConfigured) return false;
    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.hashtags) dbUpdates.hashtags = updates.hashtags;
      if (updates.captionsSample) dbUpdates.captions_sample = updates.captionsSample;

      await updateDoc(doc(db, 'clips', clipId), dbUpdates);
      return true;
    } catch (err) {
      console.error('updateClip error:', err);
      return false;
    }
  },

  async deleteClip(clipId: string): Promise<boolean> {
    if (!isFirebaseConfigured) return false;
    try {
      await deleteDoc(doc(db, 'clips', clipId));
      return true;
    } catch (err) {
      console.error('deleteClip error:', err);
      return false;
    }
  },

  // --- Queue Items ---
  async getQueue(workspaceId: string): Promise<QueueItem[]> {
    if (!isFirebaseConfigured) return [];
    try {
      const q = query(
        collection(db, 'clips'),
        where('workspace_id', '==', workspaceId),
        where('in_queue', '==', true)
      );
      const querySnap = await getDocs(q);

      return querySnap.docs.map((docSnap) => {
        const cl = { id: docSnap.id, ...docSnap.data() } as DbClip;
        return {
          id: `q_${cl.id}`,
          clipId: cl.id,
          title: cl.title,
          hook: cl.hook,
          duration: cl.duration,
          platforms: ['Instagram Reels', 'YouTube Shorts'],
          captionText: (cl.captions_sample || []).join(' '),
          hashtags: cl.hashtags || [],
          status: cl.queue_status || 'needs_review',
          scheduledSlot: cl.scheduled_slot || undefined,
          addedAt: cl.created_at ? new Date(cl.created_at).toLocaleDateString() : 'Recent',
          style: cl.style,
        };
      });
    } catch (err) {
      console.error('getQueue error:', err);
      return [];
    }
  },

  async setClipInQueue(clipId: string, inQueue: boolean, queueStatus = 'needs_review'): Promise<boolean> {
    if (!isFirebaseConfigured) return false;
    try {
      await updateDoc(doc(db, 'clips', clipId), {
        in_queue: inQueue,
        queue_status: queueStatus,
      });
      return true;
    } catch (err) {
      console.error('setClipInQueue error:', err);
      return false;
    }
  },

  async updateQueueItem(
    clipId: string,
    updates: { status?: QueueItem['status']; scheduledSlot?: string }
  ): Promise<boolean> {
    if (!isFirebaseConfigured) return false;
    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.status) dbUpdates.queue_status = updates.status;
      if (updates.scheduledSlot !== undefined) dbUpdates.scheduled_slot = updates.scheduledSlot;

      await updateDoc(doc(db, 'clips', clipId), dbUpdates);
      return true;
    } catch (err) {
      console.error('updateQueueItem error:', err);
      return false;
    }
  },

  // --- Jobs ---
  async getJobs(workspaceId: string): Promise<ActiveJob[]> {
    if (!isFirebaseConfigured) return [];
    try {
      const q = query(
        collection(db, 'render_jobs'),
        where('workspace_id', '==', workspaceId),
        where('status', '==', 'running')
      );
      const querySnap = await getDocs(q);

      return querySnap.docs.map((docSnap) => {
        const j = { id: docSnap.id, ...docSnap.data() } as DbJob;
        return {
          id: j.id,
          type: j.type,
          targetTitle: j.target_title,
          progress: j.progress,
          stage: j.stage,
          startedAt: 'Just now',
        };
      });
    } catch (err) {
      console.error('getJobs error:', err);
      return [];
    }
  },
};
