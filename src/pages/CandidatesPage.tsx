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
  Trash2,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ClipCandidate } from '../types';

export const CandidatesPage: React.FC = () => {
  const {
    candidates,
    fetchCandidates,
    isFetchingCandidates,
    deleteCandidate,
    selectCandidate,
    rejectCandidate,
    generateClipFromCandidate,
    batchApproveAndRenderClips,
    navigate,
    workspace,
    showToast,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'new' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCandidateModal, setSelectedCandidateModal] = useState<ClipCandidate | null>(null);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      const matchesSearch =
        c.hook.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.sourceTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.channelTitle.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'approved' && (c.status === 'approved' || c.status === 'selected')) ||
        (statusFilter === 'new' && (c.status === 'new' || c.status === 'in_review')) ||
        (statusFilter === 'rejected' && c.status === 'rejected');

      return matchesSearch && matchesStatus;
    });
  }, [candidates, searchQuery, statusFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* Header */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-white">
                Candidate Moments
              </h1>
              <span className="text-xs font-mono font-medium text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                {candidates.length} detected
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              AI-scored dialogue moments evaluated for hook strength and retention potential.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchCandidates()}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingCandidates ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => batchApproveAndRenderClips()}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Auto-Render Eligible</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 space-y-5">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800/60">
            {(['all', 'new', 'approved', 'rejected'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer capitalize ${
                  statusFilter === st
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search hook or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-hidden focus:border-blue-500 placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Candidate List */}
        <div className="space-y-3">
          {filteredCandidates.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
              <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-200">No candidate moments found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                Analyze discovered source videos to extract high-retention dialogue segments.
              </p>
              <button
                onClick={() => navigate('discover')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Go to Discover Sources
              </button>
            </div>
          ) : (
            filteredCandidates.map((cand) => (
              <div
                key={cand.id}
                className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 hover:border-slate-700 transition-colors space-y-3"
              >
                {/* Top Row: Hook & Score */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="font-medium text-slate-200 truncate">{cand.channelTitle}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[11px]">{cand.startTime} - {cand.endTime} ({cand.duration})</span>
                    </div>

                    <h2 className="text-sm font-semibold text-white leading-snug">
                      "{cand.hook}"
                    </h2>

                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                      {cand.summary}
                    </p>
                  </div>

                  {/* Score badge */}
                  <div className="text-right shrink-0 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="font-mono text-lg font-bold text-emerald-400">{cand.score}</span>
                    <span className="text-[10px] text-slate-500 block">Retention</span>
                  </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500 text-[11px] truncate">
                    Source: <span className="text-slate-300">{cand.sourceTitle}</span>
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => deleteCandidate(cand.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Delete candidate"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {cand.status !== 'rejected' && (
                      <button
                        onClick={() => rejectCandidate(cand.id)}
                        className="px-2.5 py-1 text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      >
                        Reject
                      </button>
                    )}

                    <button
                      onClick={() => generateClipFromCandidate(cand.id)}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>Render 9:16 Short</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
