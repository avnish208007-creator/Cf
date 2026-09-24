import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Search,
  Film,
  Check,
  X,
  Play,
  Clock,
  ExternalLink,
  Copy,
  ChevronRight,
  AlertCircle,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Award,
  Terminal,
  RefreshCw,
  Database,
  Info,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ClipCandidate } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

function parseTimestampToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => isNaN(p))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function extractYouTubeId(urlOrId?: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  return match ? match[1] : null;
}

interface DbRowDiagnostic {
  id: string;
  workspaceId: string;
  sourceVideoId?: string;
  status?: string;
  score?: number;
  createdAt?: string;
}

export const CandidatesPage: React.FC = () => {
  const {
    currentWorkspaceId,
    rejectCandidate,
    navigate,
    showToast,
  } = useApp();

  const [directCandidates, setDirectCandidates] = useState<ClipCandidate[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [allDbCandidatesSummary, setAllDbCandidatesSummary] = useState<DbRowDiagnostic[]>([]);
  const [totalDbRowsCount, setTotalDbRowsCount] = useState<number>(0);
  const [sourceVideoRowsCount, setSourceVideoRowsCount] = useState<number>(0);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isQueryLoading, setIsQueryLoading] = useState<boolean>(true);
  const [queriedWorkspaceId, setQueriedWorkspaceId] = useState<string>('');

  // Per-candidate action loading states
  const [actionLoadingIds, setActionLoadingIds] = useState<Record<string, 'selecting' | 'rendering' | undefined>>({});
  const [candidateErrors, setCandidateErrors] = useState<Record<string, { code?: string; message: string; technical?: string }>>({});
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<
    'all' | 'selected' | 'potential' | 'rejected' | 'Excellent' | 'Strong' | 'Weak'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModalCandidate, setActiveModalCandidate] = useState<ClipCandidate | null>(null);

  // STEP 1, 2, 5, 6: Direct Query Pipeline connecting Supabase and Backend Service
  const executeCandidateFetch = useCallback(async () => {
    setIsQueryLoading(true);
    setQueryError(null);

    // 1. Resolve current workspace ID
    let wsId = currentWorkspaceId;
    if (!wsId && isSupabaseConfigured) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.id) {
          const { data: wsData } = await supabase
            .from('workspaces')
            .select('id')
            .eq('owner_id', authData.user.id)
            .limit(1)
            .maybeSingle();
          if (wsData?.id) wsId = wsData.id;
        }
      } catch (err) {
        console.warn('[Candidates] Warning querying user workspace from Supabase:', err);
      }
    }
    if (!wsId) {
      wsId =
        localStorage.getItem('clipflow_state_v2_workspace_id') ||
        'a0000000-0000-4000-a000-000000000001';
    }
    setQueriedWorkspaceId(wsId);

    try {
      let candidateRows: any[] = [];
      let sourcesList: any[] = [];
      const sourceMap = new Map<string, any>();
      let totalAllDb = 0;
      let allDbSummary: DbRowDiagnostic[] = [];

      // A. Query via resilient backend service handler (which has Supabase service role access)
      try {
        const { data: sessionData } = isSupabaseConfigured ? await supabase.auth.getSession() : { data: null };
        const token = sessionData?.session?.access_token;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resp = await fetch(`/api/candidates?workspaceId=${encodeURIComponent(wsId)}`, { headers });
        if (resp.ok) {
          const json = await resp.json();
          if (json.success) {
            candidateRows = json.candidates || [];
            sourcesList = json.sources || [];
            totalAllDb = json.totalDatabaseCandidatesCount || candidateRows.length;
            allDbSummary = json.allCandidatesSummary || [];

            for (const s of sourcesList) {
              sourceMap.set(s.id, s);
            }
          }
        }
      } catch (apiErr) {
        console.warn('[Candidates] API endpoint fetch note:', apiErr);
      }

      // B. If direct client query fallback is available and needed
      if (candidateRows.length === 0 && isSupabaseConfigured) {
        const { data: srcRows } = await supabase
          .from('source_videos')
          .select('*')
          .eq('workspace_id', wsId);

        if (srcRows) {
          sourcesList = srcRows;
          for (const s of srcRows) {
            sourceMap.set(s.id, s);
          }
        }

        const { data: candData, error: candError } = await supabase
          .from('clip_candidates')
          .select('*')
          .eq('workspace_id', wsId)
          .order('score', { ascending: false });

        if (candError) {
          console.error('[Candidates] Direct Supabase error:', candError);
          if (!candidateRows.length) setQueryError(candError.message);
        } else if (candData) {
          candidateRows = candData;
        }
      }

      setSourceVideoRowsCount(sourcesList.length);
      setRawRows(candidateRows);
      setTotalDbRowsCount(totalAllDb || candidateRows.length);
      setAllDbCandidatesSummary(allDbSummary);

      // STEP 11: Exact debug output required
      console.log(`[Candidates]`);
      console.log(`workspaceId = ${wsId}`);
      console.log(`candidateRowsFromSupabase = ${candidateRows.length}`);
      console.log(`candidateIds =`, candidateRows.map((r) => r.id));
      console.log(`sourceVideoRows = ${sourcesList.length}`);
      console.log(`finalCandidatesRendered = ${candidateRows.length}`);

      // STEP 7: Safe transformation into ClipCandidate objects
      const transformed: ClipCandidate[] = candidateRows.map((c) => {
        const factors = (c.factors || {}) as any;
        const score = Number(c.score || c.overall_score || factors.score || 75);
        const parentSource = c.source_video_id ? sourceMap.get(c.source_video_id) : undefined;

        let sourceThumbnailUrl = factors.sourceThumbnailUrl || parentSource?.thumbnail_url || undefined;
        const youtubeUrl = parentSource?.youtube_url || factors.sourceYoutubeUrl || '';
        if (!sourceThumbnailUrl && youtubeUrl) {
          const match = youtubeUrl.match(
            /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
          );
          if (match && match[1]) {
            sourceThumbnailUrl = `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
          }
        }

        const rawStatus = (c.status || 'new').toLowerCase();
        const rawSel = (factors.selectionStatus || c.selection_status || '').toLowerCase();
        const isSelectedStatus =
          rawSel === 'selected' || rawStatus === 'selected' || rawStatus === 'approved' || rawStatus === 'rendered';

        const selectionStatus: 'selected' | 'candidate' | 'rejected' =
          isSelectedStatus
            ? 'selected'
            : rawSel === 'rejected' || rawStatus === 'rejected'
            ? 'rejected'
            : 'candidate';

        const qualityTier =
          c.quality_tier ||
          factors.qualityTier ||
          (score >= 90 ? 'Excellent' : score >= 75 ? 'Strong' : score >= 60 ? 'Potential' : 'Weak');

        const mediaError =
          factors.mediaErrorMessage ||
          factors.mediaTechnicalDetails ||
          parentSource?.media_error ||
          undefined;

        if (mediaError && !candidateErrors[c.id]) {
          setCandidateErrors((prev) => ({
            ...prev,
            [c.id]: {
              code: factors.mediaErrorCode || 'MEDIA_PROVIDER_UNAVAILABLE',
              message: factors.mediaErrorMessage || 'Source media could not be acquired automatically.',
              technical: factors.mediaTechnicalDetails || parentSource?.media_error,
            },
          }));
        }

        return {
          id: c.id,
          workspaceId: c.workspace_id || wsId,
          sourceVideoId: c.source_video_id || '',
          sourceTitle: parentSource?.title || c.source_title || 'Source Video',
          channelTitle: parentSource?.channel_title || c.channel_title || 'Creator Channel',
          startTime: c.start_time || '00:00',
          endTime: c.end_time || '00:30',
          duration: c.duration || '00:30',
          estimatedDuration: c.duration || '00:30',
          hook: c.hook || factors.hook || c.summary || 'Insight moment',
          summary: c.summary || factors.summary || c.hook || 'High-retention moment segment',
          score,
          qualityTier,
          factors: {
            ...factors,
            qualityTier,
            selectionStatus,
          },
          rank: factors.rank || 1,
          selectionStatus,
          selectionReason:
            factors.selectionReason ||
            factors.scoreReason ||
            factors.explanation ||
            'Analyzed candidate moment',
          explanation: factors.explanation || factors.scoreReason || '',
          scoreReason: factors.scoreReason || '',
          transcriptText: c.transcript_text || factors.transcriptText || c.hook || '',
          sourceThumbnailUrl,
          sourceYoutubeUrl: youtubeUrl || undefined,
          mediaStatus: factors.mediaStatus || parentSource?.media_status,
          mediaUrl: factors.mediaUrl || parentSource?.media_url,
          mediaPath: factors.mediaPath || parentSource?.media_path,
          status: c.status || 'new',
          createdAt: c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Recent',
        };
      });

      setDirectCandidates(transformed);
    } catch (err: any) {
      console.error('[Candidates] Query exception:', err);
      setQueryError(err?.message || 'Failed to retrieve candidates');
    } finally {
      setIsQueryLoading(false);
    }
  }, [currentWorkspaceId]);

  useEffect(() => {
    executeCandidateFetch();
  }, [executeCandidateFetch]);

  // Handle Candidate Selection & Automatic Media Acquisition
  const handleSelectCandidate = async (candidateId: string) => {
    setActionLoadingIds((prev) => ({ ...prev, [candidateId]: 'selecting' }));
    try {
      const { data: sessionData } = isSupabaseConfigured ? await supabase.auth.getSession() : { data: null };
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const resp = await fetch('/api/candidates/select', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          candidateId,
          workspaceId: queriedWorkspaceId,
        }),
      });

      const json = await resp.json();
      if (resp.ok && json.success) {
        const mediaRes = json.mediaResult;
        if (mediaRes && mediaRes.success && mediaRes.status === 'available') {
          showToast('Moment selected! Usable source media acquired.', 'success');
        } else {
          const errCode = mediaRes?.errorCode || 'MEDIA_PROVIDER_UNAVAILABLE';
          const errMsg = mediaRes?.errorMessage || 'Source media could not be acquired automatically.';
          setCandidateErrors((prev) => ({
            ...prev,
            [candidateId]: {
              code: errCode,
              message: errMsg,
              technical: mediaRes?.technicalDetails,
            },
          }));
          showToast(`Selected in database. Media note: ${errMsg}`, 'info');
        }
        await executeCandidateFetch();
      } else {
        const msg = json.message || 'Failed to select candidate.';
        showToast(`Selection error: ${msg}`, 'error');
      }
    } catch (err: any) {
      console.error('[Candidates] Selection request error:', err);
      showToast(`Selection failed: ${err.message}`, 'error');
    } finally {
      setActionLoadingIds((prev) => ({ ...prev, [candidateId]: undefined }));
    }
  };

  // Handle Render Action
  const handleRenderCandidate = async (candidate: ClipCandidate, forceTestVideo: boolean = false) => {
    setActionLoadingIds((prev) => ({ ...prev, [candidate.id]: 'rendering' }));
    try {
      const { data: sessionData } = isSupabaseConfigured ? await supabase.auth.getSession() : { data: null };
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const endpoint = forceTestVideo ? '/api/render-dev-test' : '/api/render';
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          candidateId: candidate.id,
          workspaceId: candidate.workspaceId || queriedWorkspaceId,
          sourceVideoId: candidate.sourceVideoId,
          sourceTitle: candidate.sourceTitle,
          channelTitle: candidate.channelTitle,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          durationSeconds: parseTimestampToSeconds(candidate.duration),
          hook: candidate.hook,
          transcriptText: candidate.transcriptText,
          summary: candidate.summary,
          sourceYoutubeUrl: candidate.sourceYoutubeUrl,
          mediaUrl: candidate.mediaUrl,
          mediaPath: candidate.mediaPath,
        }),
      });

      const json = await resp.json();
      if (resp.ok && json.success) {
        showToast(forceTestVideo ? 'Vertical clip rendering queued in background with local test media!' : 'Render job queued in background! Monitoring progress...', 'success');
        // Clear errors on success
        setCandidateErrors((prev) => {
          const next = { ...prev };
          delete next[candidate.id];
          return next;
        });
        await executeCandidateFetch();
      } else {
        const errCode = json.errorCode || 'RENDER_FAILED';
        const errMsg = json.errorMessage || json.message || 'Rendering failed.';
        setCandidateErrors((prev) => ({
          ...prev,
          [candidate.id]: {
            code: errCode,
            message: errMsg,
            technical: json.technicalDetails,
          },
        }));
        showToast(`Render failed: ${errMsg}`, 'error');
        await executeCandidateFetch();
      }
    } catch (err: any) {
      console.error('[Candidates] Render request error:', err);
      showToast(`Render request failed: ${err.message}`, 'error');
    } finally {
      setActionLoadingIds((prev) => ({ ...prev, [candidate.id]: undefined }));
    }
  };

  const resolveTier = (c: ClipCandidate): 'Excellent' | 'Strong' | 'Potential' | 'Weak' => {
    if (c.qualityTier) return c.qualityTier;
    const s = Number(c.score) || 0;
    if (s >= 90) return 'Excellent';
    if (s >= 75) return 'Strong';
    if (s >= 60) return 'Potential';
    return 'Weak';
  };

  const resolveSelectionStatus = (c: ClipCandidate): 'selected' | 'potential' | 'rejected' => {
    const rawStatus = (c.status || '').toLowerCase();
    const sel = (c.selectionStatus || c.factors?.selectionStatus || '').toLowerCase();

    if (rawStatus === 'rejected' || sel === 'rejected') return 'rejected';
    if (
      rawStatus === 'selected' ||
      rawStatus === 'approved' ||
      rawStatus === 'rendered' ||
      sel === 'selected'
    ) {
      return 'selected';
    }
    return 'potential';
  };

  const counts = useMemo(() => {
    const res = {
      all: directCandidates.length,
      selected: 0,
      potential: 0,
      rejected: 0,
      Excellent: 0,
      Strong: 0,
      PotentialTier: 0,
      Weak: 0,
    };

    for (const c of directCandidates) {
      const sel = resolveSelectionStatus(c);
      res[sel]++;

      const tier = resolveTier(c);
      if (tier === 'Excellent') res.Excellent++;
      else if (tier === 'Strong') res.Strong++;
      else if (tier === 'Potential') res.PotentialTier++;
      else if (tier === 'Weak') res.Weak++;
    }
    return res;
  }, [directCandidates]);

  const sortedAndFilteredCandidates = useMemo(() => {
    const sorted = [...directCandidates].sort(
      (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)
    );

    return sorted.filter((cand) => {
      const selStatus = resolveSelectionStatus(cand);
      const tier = resolveTier(cand);

      let matchesFilter = true;
      if (statusFilter === 'all') {
        matchesFilter = true;
      } else if (
        statusFilter === 'selected' ||
        statusFilter === 'potential' ||
        statusFilter === 'rejected'
      ) {
        matchesFilter = selStatus === statusFilter;
      } else {
        matchesFilter = tier === statusFilter;
      }

      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        q === '' ||
        (cand.hook && cand.hook.toLowerCase().includes(q)) ||
        (cand.sourceTitle && cand.sourceTitle.toLowerCase().includes(q)) ||
        (cand.channelTitle && cand.channelTitle.toLowerCase().includes(q)) ||
        (cand.summary && cand.summary.toLowerCase().includes(q)) ||
        (cand.transcriptText && cand.transcriptText.toLowerCase().includes(q));

      return matchesFilter && matchesSearch;
    });
  }, [directCandidates, statusFilter, searchQuery]);

  const getYouTubeTimestampUrl = (cand: ClipCandidate): string | null => {
    const rawUrl = cand.sourceYoutubeUrl;
    const ytid = extractYouTubeId(rawUrl);
    if (!ytid) return rawUrl || null;

    const startSec = parseTimestampToSeconds(cand.startTime);
    return `https://www.youtube.com/watch?v=${ytid}&t=${startSec}s`;
  };

  const getCandidateThumbnail = (cand: ClipCandidate): string | undefined => {
    if (cand.sourceThumbnailUrl) return cand.sourceThumbnailUrl;
    const rawUrl = cand.sourceYoutubeUrl;
    const ytid = extractYouTubeId(rawUrl);
    return ytid ? `https://img.youtube.com/vi/${ytid}/hqdefault.jpg` : undefined;
  };

  const copyHookText = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Hook copied to clipboard', 'info');
  };

  const getCandidateRenderState = (
    cand: ClipCandidate
  ): 'READY' | 'MEDIA_ACQUIRING' | 'MEDIA_UNAVAILABLE' | 'RENDER_IN_PROGRESS' | 'RENDERED' | 'RENDER_FAILED' => {
    const factors = (cand.factors || {}) as any;
    const renderStatus = factors.renderStatus || '';

    if (cand.status === 'rendered' || renderStatus === 'completed') return 'RENDERED';
    if (actionLoadingIds[cand.id] === 'rendering' || renderStatus === 'rendering' || cand.status === 'generating') {
      return 'RENDER_IN_PROGRESS';
    }
    if (actionLoadingIds[cand.id] === 'selecting' || renderStatus === 'acquiring_media') {
      return 'MEDIA_ACQUIRING';
    }
    if (cand.status === 'failed' || renderStatus === 'failed' || candidateErrors[cand.id]) {
      return 'RENDER_FAILED';
    }

    const ms = (cand.mediaStatus as string) || factors.mediaStatus || '';
    if (cand.mediaUrl || cand.mediaPath || ms === 'available' || ms === 'ready' || renderStatus === 'media_ready') {
      return 'READY';
    }
    if (ms === 'processing' || ms === 'downloading') return 'MEDIA_ACQUIRING';

    return 'MEDIA_UNAVAILABLE';
  };

  // Poll candidate status continuously if any are rendering or acquiring
  useEffect(() => {
    const hasActiveRendering = directCandidates.some((c) => {
      const state = getCandidateRenderState(c);
      return state === 'RENDER_IN_PROGRESS' || state === 'MEDIA_ACQUIRING';
    });

    if (!hasActiveRendering) return;

    const interval = setInterval(() => {
      executeCandidateFetch();
    }, 5000);

    return () => clearInterval(interval);
  }, [directCandidates, executeCandidateFetch]);

  const getRenderStateBadge = (renderState: string) => {
    switch (renderState) {
      case 'RENDERED':
        return (
          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Rendered
          </span>
        );
      case 'RENDER_IN_PROGRESS':
        return (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold flex items-center gap-1">
            <div className="w-2.5 h-2.5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
            Rendering MP4...
          </span>
        );
      case 'READY':
        return (
          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-xs font-semibold flex items-center gap-1">
            <Film className="w-3 h-3 text-indigo-600" /> Media Ready
          </span>
        );
      case 'MEDIA_ACQUIRING':
        return (
          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold flex items-center gap-1">
            <div className="w-2.5 h-2.5 border-2 border-amber-600/30 border-t-amber-600 rounded-full animate-spin" />
            Preparing Source...
          </span>
        );
      case 'RENDER_FAILED':
        return (
          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full text-xs font-semibold flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-rose-600" /> Media Acquisition Note
          </span>
        );
      case 'MEDIA_UNAVAILABLE':
      default:
        return (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-semibold flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" /> Discovered Moment
          </span>
        );
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'Excellent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Award className="w-3 h-3 text-emerald-600" />
            <span>Excellent</span>
          </span>
        );
      case 'Strong':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <TrendingUp className="w-3 h-3 text-blue-600" />
            <span>Strong</span>
          </span>
        );
      case 'Potential':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>Potential</span>
          </span>
        );
      case 'Weak':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-300">
            <XCircle className="w-3 h-3 text-slate-400" />
            <span>Weak</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Clip Candidates
            </h1>
            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
              {sortedAndFilteredCandidates.length} candidate{sortedAndFilteredCandidates.length === 1 ? '' : 's'} found
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Moments identified, scored, and ready for compliant media acquisition & vertical rendering.
          </p>
        </div>

        {/* Global Stats Summary */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => executeCandidateFetch()}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Reload latest moments from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isQueryLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => navigate('clips')}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Film className="w-3.5 h-3.5 text-blue-300" />
            <span>View Rendered Clips</span>
          </button>
        </div>
      </div>

      {/* SECTION 10 & 11: Real-time Workspace Diagnostic Panel */}
      <div className="bg-slate-900 text-slate-200 text-xs rounded-xl p-4 border border-slate-800 font-mono space-y-3 shadow-xs">
        <div className="flex items-center justify-between text-slate-400 font-semibold border-b border-slate-800 pb-2">
          <span className="flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-blue-400" />
            <span>Workspace & Supabase Pipeline Diagnostic</span>
          </span>
          <span className="text-[10px] text-emerald-400 font-normal bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
            Supabase Live
          </span>
        </div>

        {/* Diagnostic Key Values */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
          <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/60">
            <span className="text-slate-500 block text-[10px] uppercase font-semibold">Current Workspace:</span>
            <span className="text-amber-300 font-bold break-all">{queriedWorkspaceId || 'None'}</span>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/60">
            <span className="text-slate-500 block text-[10px] uppercase font-semibold">All DB Candidate Rows:</span>
            <span className="text-indigo-300 font-bold text-sm">{totalDbRowsCount}</span>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/60">
            <span className="text-slate-500 block text-[10px] uppercase font-semibold">Workspace Candidates:</span>
            <span className="text-emerald-400 font-bold text-sm">{rawRows.length}</span>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/60">
            <span className="text-slate-500 block text-[10px] uppercase font-semibold">Candidates Rendered:</span>
            <span className="text-emerald-400 font-bold text-sm">{sortedAndFilteredCandidates.length}</span>
          </div>
        </div>

        {/* Database Candidate Workspace ID Verification */}
        {allDbCandidatesSummary.length > 0 && (
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-1 text-slate-400 font-semibold mb-1">
              <Database className="w-3 h-3 text-blue-400" />
              <span>Database Rows Workspace Verification:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {allDbCandidatesSummary.map((c) => (
                <span
                  key={c.id}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                    c.workspaceId === queriedWorkspaceId
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : 'bg-amber-950 text-amber-300 border-amber-800'
                  }`}
                  title={`Candidate ID: ${c.id}\nWorkspace ID: ${c.workspaceId}\nSource Video ID: ${c.sourceVideoId || 'None'}`}
                >
                  {c.id.slice(0, 8)}… → ws: {c.workspaceId.slice(0, 8)}…
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Query Errors Display */}
      {queryError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 flex items-start justify-between gap-3 text-xs">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-rose-900">Candidate query failed:</p>
              <p className="text-rose-700 mt-0.5 font-mono">{queryError}</p>
            </div>
          </div>
          <button
            onClick={() => executeCandidateFetch()}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-medium text-xs shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All Moments ({counts.all})
            </button>

            <button
              onClick={() => setStatusFilter('selected')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'selected'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
              }`}
            >
              <Check className="w-3 h-3" />
              <span>Selected ({counts.selected})</span>
            </button>

            <button
              onClick={() => setStatusFilter('potential')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                statusFilter === 'potential'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Potential ({counts.potential})
            </button>

            <button
              onClick={() => setStatusFilter('rejected')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                statusFilter === 'rejected'
                  ? 'bg-slate-700 text-white font-semibold'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              Rejected ({counts.rejected})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search hook, source, or text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>
        </div>
      </div>

      {/* Moment Candidate Cards List */}
      <div className="space-y-4">
        {isQueryLoading && directCandidates.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center">
            <div className="w-8 h-8 border-3 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">
              Loading candidates from Supabase...
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Querying clip_candidates for workspace: {queriedWorkspaceId}
            </p>
          </div>
        ) : directCandidates.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center">
            <Sparkles className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm sm:text-base font-semibold text-slate-800">
              No moment candidates detected yet
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Analyze discovered source videos on the Discover page to automatically detect high-retention short-form moments.
            </p>
            <button
              onClick={() => navigate('discover')}
              className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Go to Video Discovery</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : sortedAndFilteredCandidates.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center">
            <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <h3 className="text-sm sm:text-base font-semibold text-slate-800">
              No clips match your active filters
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              You have {directCandidates.length} total candidates stored in Supabase, but none match filter "{statusFilter}"
              {searchQuery ? ` or search "${searchQuery}"` : ''}.
            </p>
            <button
              onClick={() => {
                setStatusFilter('all');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Show All Moments ({directCandidates.length})</span>
            </button>
          </div>
        ) : (
          sortedAndFilteredCandidates.map((candidate, idx) => {
            const selStatus = resolveSelectionStatus(candidate);
            const tier = resolveTier(candidate);
            const renderState = getCandidateRenderState(candidate);
            const youtubeUrl = getYouTubeTimestampUrl(candidate);
            const thumbnail = getCandidateThumbnail(candidate);
            const isRendered = candidate.status === 'rendered' || renderState === 'RENDERED';
            const isSelecting = actionLoadingIds[candidate.id] === 'selecting';
            const isRendering = actionLoadingIds[candidate.id] === 'rendering';
            const isMediaReady = renderState === 'READY';
            const errInfo = candidateErrors[candidate.id];
            const isErrorExpanded = expandedErrorId === candidate.id;

            return (
              <div
                key={candidate.id}
                className={`bg-white rounded-xl border transition-all p-4 sm:p-5 shadow-xs hover:shadow-md ${
                  selStatus === 'selected'
                    ? 'border-emerald-300 ring-1 ring-emerald-400/20'
                    : selStatus === 'rejected'
                    ? 'border-slate-200 opacity-75'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Top Row: Rank, Badges, Timestamp & Score */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Rank Badge */}
                    <span className="px-2 py-0.5 bg-slate-900 text-white rounded text-[11px] font-bold">
                      #{idx + 1}
                    </span>

                    {/* Quality Tier Badge */}
                    {getTierBadge(tier)}

                    {/* Selection State Badge */}
                    {selStatus === 'selected' && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> Selected Moment
                      </span>
                    )}

                    {/* Render State Badge */}
                    {getRenderStateBadge(renderState)}

                    {/* Timestamp Range */}
                    <div className="flex items-center gap-1 text-slate-500 text-xs font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                      <Clock className="w-3 h-3" />
                      <span>
                        {candidate.startTime} – {candidate.endTime} ({candidate.duration})
                      </span>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                      Retention Score:
                    </span>
                    <span
                      className={`text-sm sm:text-base font-extrabold ${
                        candidate.score >= 90
                          ? 'text-emerald-600'
                          : candidate.score >= 75
                          ? 'text-blue-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {candidate.score}/100
                    </span>
                  </div>
                </div>

                {/* Candidate Content Body */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 py-4">
                  {/* Left: Thumbnail Preview & Source Context */}
                  <div className="lg:col-span-4 flex flex-col gap-2">
                    <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-video border border-slate-200 group">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={candidate.sourceTitle}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400">
                          <Film className="w-8 h-8" />
                        </div>
                      )}

                      {/* Video overlay bar */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2.5">
                        <div className="w-full flex items-center justify-between text-white text-[11px]">
                          <span className="font-mono bg-black/60 px-1.5 py-0.5 rounded">
                            {candidate.startTime}
                          </span>
                          {youtubeUrl && (
                            <a
                              href={youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded font-medium flex items-center gap-1 transition-colors cursor-pointer"
                              title="Watch segment on YouTube"
                            >
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>Play Segment</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs">
                      <p className="font-semibold text-slate-800 truncate" title={candidate.sourceTitle}>
                        {candidate.sourceTitle}
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        Channel: {candidate.channelTitle}
                      </p>
                    </div>
                  </div>

                  {/* Right: Hook, Factors Breakdown & Payoff */}
                  <div className="lg:col-span-8 space-y-3">
                    {/* The Hook */}
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold mb-1">
                        DETECTED HOOK & VALUE PROP
                      </span>
                      <p className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                        "{candidate.hook}"
                      </p>
                    </div>

                    {/* Summary / Context */}
                    <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <strong className="text-slate-800 font-semibold block mb-0.5">
                        Moment Context:
                      </strong>
                      {candidate.summary}
                    </div>

                    {/* Selection / Scoring Explanation */}
                    {(candidate.selectionReason ||
                      candidate.scoreReason ||
                      candidate.explanation) && (
                      <div className="text-[11px] text-slate-700 bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                        <strong className="text-blue-900 font-semibold block mb-0.5">
                          Editorial Evaluation:
                        </strong>
                        {candidate.selectionReason ||
                          candidate.scoreReason ||
                          candidate.explanation}
                      </div>
                    )}

                    {/* Real Media Acquisition & Technical Details Diagnostic if present */}
                    {errInfo && (
                      <div className="text-[11px] bg-amber-50/80 border border-amber-200 rounded-lg p-3 text-amber-900 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Media Provider Notice: {errInfo.code || 'UNAVAILABLE'}</span>
                          </span>
                          <button
                            onClick={() => setExpandedErrorId(isErrorExpanded ? null : candidate.id)}
                            className="text-[10px] text-amber-700 underline hover:text-amber-900 cursor-pointer font-medium"
                          >
                            {isErrorExpanded ? 'Hide Details' : 'View Technical Details'}
                          </button>
                        </div>
                        <p className="text-amber-800 text-[11px]">{errInfo.message}</p>
                        
                        <div className="bg-amber-100/40 p-2.5 rounded-md border border-amber-200/50 space-y-1.5">
                          <p className="font-medium text-slate-800">Troubleshooting Fallbacks:</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => handleRenderCandidate(candidate, true)}
                              disabled={isRendering}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded text-[10px] font-semibold transition-colors shadow-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Generates high-definition local moving media with an HD test pattern and sine audio using FFmpeg, completely bypassing YouTube blocking filters."
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Render with Local Test Video (DEVELOPMENT ONLY)</span>
                            </button>
                          </div>
                        </div>

                        {isErrorExpanded && errInfo.technical && (
                          <div className="mt-2 p-2 bg-amber-100/70 rounded font-mono text-[10px] text-amber-950 leading-relaxed border border-amber-300/60">
                            {errInfo.technical}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Actions Bar */}
                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <button
                      onClick={() => copyHookText(candidate.hook)}
                      className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 shrink-0 px-2 py-1 hover:bg-slate-100 rounded cursor-pointer"
                      title="Copy hook sentence"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy Hook</span>
                    </button>

                    <button
                      onClick={() => setActiveModalCandidate(candidate)}
                      className="text-blue-600 hover:text-blue-700 transition-colors font-medium flex items-center gap-0.5 shrink-0 px-2 py-1 hover:bg-blue-50 rounded cursor-pointer"
                    >
                      <span>Full Inspector</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Primary Action Sequence: Select -> Preparing -> Media Ready / Render -> View Clip */}
                  <div className="flex items-center gap-2 justify-end flex-wrap">
                    {selStatus !== 'rejected' && (
                      <button
                        onClick={() => rejectCandidate(candidate.id)}
                        className="px-2.5 py-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors text-xs font-medium cursor-pointer"
                        title="Mark as rejected"
                      >
                        Reject
                      </button>
                    )}

                    {/* Step 1: Candidate Selection */}
                    {selStatus !== 'selected' && (
                      <button
                        onClick={() => handleSelectCandidate(candidate.id)}
                        disabled={isSelecting}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                        title="Select this candidate and trigger automatic media acquisition"
                      >
                        {isSelecting ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Selecting...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Select</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Step 2: Selected, Acquiring Source Media */}
                    {selStatus === 'selected' && isSelecting && (
                      <button
                        disabled
                        className="px-3.5 py-1.5 bg-amber-600 text-white rounded-lg font-medium text-xs flex items-center gap-1.5 cursor-not-allowed shadow-xs"
                      >
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Preparing source...</span>
                      </button>
                    )}

                    {/* Step 3: Selected & Media Ready -> Render Button */}
                    {selStatus === 'selected' && !isSelecting && !isRendered && isMediaReady && (
                      <button
                        onClick={() => handleRenderCandidate(candidate)}
                        disabled={isRendering}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                        title="Render vertical 9:16 clip from source media"
                      >
                        {isRendering ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Rendering...</span>
                          </>
                        ) : (
                          <>
                            <Film className="w-3.5 h-3.5 text-blue-300" />
                            <span>Render</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Step 4: Completed -> View Clip */}
                    {isRendered && (
                      <button
                        onClick={() => navigate('clips')}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>View Clip</span>
                      </button>
                    )}

                    {/* Step 5: Render or Acquisition Failed Notice */}
                    {selStatus === 'selected' && !isSelecting && !isMediaReady && !isRendered && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleSelectCandidate(candidate.id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                          title="Retry media acquisition"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Re-check Media</span>
                        </button>
                        <button
                          onClick={() => handleRenderCandidate(candidate, true)}
                          disabled={isRendering}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          title="Generates high-definition local moving media with an HD test pattern and sine audio using FFmpeg, completely bypassing YouTube blocking filters."
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Use Test Video (DEVELOPMENT ONLY)</span>
                        </button>
                        <button
                          onClick={() => handleRenderCandidate(candidate)}
                          disabled={isRendering}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="Attempt rendering with modular pipeline"
                        >
                          {isRendering ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Rendering...</span>
                            </>
                          ) : (
                            <>
                              <Film className="w-3.5 h-3.5 text-blue-300" />
                              <span>Render</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Candidate Modal Inspector */}
      {activeModalCandidate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                  Moment Candidate Deep-Dive
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Retention & Hook Breakdown
                </h3>
              </div>
              <button
                onClick={() => setActiveModalCandidate(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Source Reference
                </span>
                <p className="font-semibold text-slate-800 text-sm">
                  {activeModalCandidate.sourceTitle}
                </p>
                <p className="text-slate-500 text-xs">
                  Channel: {activeModalCandidate.channelTitle}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs font-mono text-slate-600">
                  <span>Start: {activeModalCandidate.startTime}</span>
                  <span>End: {activeModalCandidate.endTime}</span>
                  <span>Duration: {activeModalCandidate.duration}</span>
                </div>
              </div>

              {(activeModalCandidate.selectionReason || activeModalCandidate.scoreReason) && (
                <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl text-xs text-emerald-900">
                  <span className="font-bold block mb-1">Editorial Selection Reason</span>
                  <p className="leading-relaxed">
                    {activeModalCandidate.selectionReason || activeModalCandidate.scoreReason}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">
                  Identified Opening Hook
                </span>
                <p className="p-3 bg-slate-100 text-slate-800 text-sm rounded-lg font-medium italic border border-slate-200">
                  "{activeModalCandidate.hook}"
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">
                  Transcript Excerpt / Dialogue
                </span>
                <div className="p-3 bg-slate-900 text-slate-200 text-xs rounded-lg font-mono leading-relaxed max-h-48 overflow-y-auto">
                  {activeModalCandidate.transcriptText || activeModalCandidate.summary}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                {getYouTubeTimestampUrl(activeModalCandidate) ? (
                  <a
                    href={getYouTubeTimestampUrl(activeModalCandidate)!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Watch at {activeModalCandidate.startTime}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">Timestamp: {activeModalCandidate.startTime}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveModalCandidate(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    handleSelectCandidate(activeModalCandidate.id);
                    setActiveModalCandidate(null);
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Select Moment</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
