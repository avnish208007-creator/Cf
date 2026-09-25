import React from 'react';
import {
  Compass,
  Sparkles,
  Film,
  Send,
  ArrowUpRight,
  Activity,
  Play,
  Clock,
  ChevronRight,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const DashboardPage: React.FC = () => {
  const {
    workspace,
    sources,
    candidates,
    clips,
    queue,
    jobs,
    activities,
    navigate,
    cancelJob,
    generateClipFromCandidate,
    runDiscovery,
    isDiscovering,
    batchApproveAndRenderClips,
  } = useApp();

  const highScoringCandidates = candidates
    .filter((c) => c.status !== 'rejected')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const readyToPublishCount = queue.filter((q) => q.status === 'approved' || q.status === 'needs_review').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* Header Banner */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            {/* Anti-Slop Clean Text Metadata */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-200">{workspace.workspaceName}</span>
              <span aria-hidden="true">·</span>
              <span className="text-blue-400 font-medium">{workspace.mainNiche}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[11px] text-slate-400">{workspace.contentLanguage}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Automated Content Pipeline
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              ClipFlow automatically discovers YouTube sources, extracts high-retention moments, reframes 9:16 vertical shorts, and queues clips for publication.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                runDiscovery();
                navigate('discover');
              }}
              disabled={isDiscovering}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Compass className={`w-4 h-4 ${isDiscovering ? 'animate-spin' : ''}`} />
              <span>{isDiscovering ? 'Searching...' : 'Run Discovery'}</span>
            </button>
            <button
              onClick={() => batchApproveAndRenderClips()}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Auto-Render Top Clips</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Dashboard Body */}
      <div className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 space-y-6">
        {/* Pipeline Flow Bar */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium mb-3">
            <span>Autonomous Pipeline Status</span>
            <span className="text-emerald-400 font-medium">Targeting "{workspace.mainNiche}"</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 font-mono block">1. NICHE</span>
              <span className="font-semibold text-slate-200 block truncate">{workspace.mainNiche}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">{workspace.subtopics.length} subtopics</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 font-mono block">2. SOURCES</span>
              <span className="font-semibold text-slate-200 block truncate">{sources.length} videos</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">{sources.filter((s) => s.status === 'analyzed').length} analyzed</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 font-mono block">3. MOMENTS</span>
              <span className="font-semibold text-slate-200 block truncate">{candidates.length} detected</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">{candidates.filter((c) => c.status === 'approved').length} approved</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 font-mono block">4. 9:16 SHORTS</span>
              <span className="font-semibold text-slate-200 block truncate">{clips.length} rendered</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">{clips.filter((c) => c.status === 'ready').length} ready</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 col-span-2 md:col-span-1">
              <span className="text-[10px] text-slate-500 font-mono block">5. QUEUE</span>
              <span className="font-semibold text-slate-200 block truncate">{readyToPublishCount} queued</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Ready for review</span>
            </div>
          </div>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            onClick={() => navigate('discover')}
            className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 p-5 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Discovered Sources</span>
              <Compass className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">
              {sources.length}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              <span className="text-slate-300 font-medium">{sources.filter((s) => s.status === 'analyzed').length}</span> analyzed
            </div>
          </div>

          <div
            onClick={() => navigate('candidates')}
            className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 p-5 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Scored Moments</span>
              <Sparkles className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">
              {candidates.length}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              <span className="text-emerald-400 font-semibold">{candidates.filter((c) => c.status === 'approved').length}</span> selected
            </div>
          </div>

          <div
            onClick={() => navigate('clips')}
            className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 p-5 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>9:16 Clips</span>
              <Film className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">
              {clips.length}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              <span className="text-slate-300 font-medium">{clips.filter((c) => c.status === 'ready').length}</span> ready MP4s
            </div>
          </div>

          <div
            onClick={() => navigate('queue')}
            className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 p-5 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Publish Queue</span>
              <Send className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">
              {readyToPublishCount}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              <span className="text-blue-400 font-medium">{queue.filter((q) => q.status === 'approved').length}</span> approved
            </div>
          </div>
        </div>

        {/* Active Jobs */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <h2 className="font-semibold text-sm text-white">Active Processing Tasks</h2>
            </div>
            <span className="font-mono text-xs text-slate-500">
              {jobs.length > 0 ? `${jobs.length} running` : 'Idle'}
            </span>
          </div>

          {jobs.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              No background jobs currently running.
            </p>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-slate-200 block truncate">{job.targetTitle}</span>
                    <span className="text-[11px] text-slate-500 block truncate">{job.stage}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-28 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${job.progress}%` }} />
                    </div>
                    <span className="font-mono text-[11px] text-slate-300">{job.progress}%</span>
                    <button onClick={() => cancelJob(job.id)} className="text-slate-500 hover:text-rose-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Candidates & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Top Candidates */}
          <div className="lg:col-span-7 bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <h2 className="font-semibold text-sm text-white">Top Scored Moments</h2>
                <p className="text-xs text-slate-400">Predicted high-retention dialogue segments</p>
              </div>
              <button
                onClick={() => navigate('candidates')}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              >
                <span>View All ({candidates.length})</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {highScoringCandidates.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-500">
                  No candidate moments detected yet.
                </div>
              ) : (
                highScoringCandidates.map((cand) => (
                  <div key={cand.id} className="p-4 bg-slate-950/80 border border-slate-800 rounded-lg space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span className="text-slate-300">{cand.channelTitle}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{cand.startTime} - {cand.endTime}</span>
                        </div>
                        <h3 className="font-semibold text-xs text-white leading-snug">"{cand.hook}"</h3>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-base font-bold text-emerald-400">{cand.score}</span>
                        <span className="text-[10px] text-slate-500 block">Retention</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-slate-400 capitalize">Status: {cand.status}</span>
                      <button
                        onClick={() => generateClipFromCandidate(cand.id)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Generate 9:16 Clip
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="lg:col-span-5 bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <h2 className="font-semibold text-sm text-white">Pipeline Ledger</h2>
              <Clock className="w-4 h-4 text-slate-500" />
            </div>

            <div className="space-y-3 text-xs">
              {activities.length === 0 ? (
                <div className="p-6 text-center text-slate-500">No activity recorded yet.</div>
              ) : (
                activities.map((act) => (
                  <div key={act.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-slate-200 block truncate">{act.title}</span>
                      <span className="text-[11px] text-slate-500 block truncate">{act.subtitle}</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">{act.timestamp}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
