import React from 'react';
import {
  Compass,
  Sparkles,
  Film,
  Send,
  ArrowUpRight,
  Activity,
  Plus,
  Play,
  Layers,
  Clock,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
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
    <div className="space-y-6 sm:space-y-8">
      {/* Top Banner / Welcome with Clear Primary Action */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-6 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6 shadow-xs">
        <div className="space-y-2 max-w-2xl min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
            <span className="font-medium text-slate-700">{workspace.workspaceName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
              {workspace.mainNiche}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[11px]">{workspace.contentLanguage}</span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 leading-tight">
            Automated Content Pipeline
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Set your niche once. ClipFlow automatically discovers relevant source videos, extracts high-retention moments, renders vertical clips with kinetic typography, and prepares them for publishing.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            onClick={() => {
              runDiscovery();
              navigate('discover');
            }}
            disabled={isDiscovering}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-xs sm:text-sm rounded-md transition-colors shadow-xs"
          >
            <Compass className={`w-4 h-4 shrink-0 ${isDiscovering ? 'animate-spin' : ''}`} />
            <span>{isDiscovering ? 'Discovering...' : 'Run Discovery'}</span>
          </button>
          <button
            onClick={() => batchApproveAndRenderClips()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm rounded-md transition-colors shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
            <span>Auto-Render Top Clips</span>
          </button>
        </div>
      </div>

      {/* Automated Pipeline Flow Visualization */}
      <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 sm:p-4 text-xs">
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold uppercase tracking-wider mb-2.5">
          <span>End-to-End Autonomous Pipeline</span>
          <span className="text-emerald-700 font-medium">Configured for "{workspace.mainNiche}"</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
          <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 shadow-2xs">
            <span className="text-[10px] text-slate-400 block font-mono">STEP 1</span>
            <span className="font-semibold text-slate-800 block truncate">1. Niche Selection</span>
            <span className="text-[10px] text-slate-500 truncate block mt-0.5">{workspace.subtopics.length} subtopics set</span>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 shadow-2xs">
            <span className="text-[10px] text-slate-400 block font-mono">STEP 2</span>
            <span className="font-semibold text-slate-800 block truncate">2. Auto Discovery</span>
            <span className="text-[10px] text-slate-500 truncate block mt-0.5">{sources.length} sources crawled</span>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 shadow-2xs">
            <span className="text-[10px] text-slate-400 block font-mono">STEP 3</span>
            <span className="font-semibold text-slate-800 block truncate">3. Speech & Moments</span>
            <span className="text-[10px] text-slate-500 truncate block mt-0.5">{candidates.length} moments detected</span>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 shadow-2xs">
            <span className="text-[10px] text-slate-400 block font-mono">STEP 4</span>
            <span className="font-semibold text-slate-800 block truncate">4. 9:16 Render</span>
            <span className="text-[10px] text-slate-500 truncate block mt-0.5">{clips.length} vertical clips</span>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 shadow-2xs col-span-2 md:col-span-1">
            <span className="text-[10px] text-slate-400 block font-mono">STEP 5</span>
            <span className="font-semibold text-slate-800 block truncate">5. Ready Queue</span>
            <span className="text-[10px] text-slate-500 truncate block mt-0.5">{readyToPublishCount} clips queued</span>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid - 4 Key Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1: Sources */}
        <div
          onClick={() => navigate('discover')}
          className="bg-white border border-slate-200/80 rounded-lg p-3.5 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 sm:mb-2">
            <span className="truncate pr-1">Sources Discovered</span>
            <Compass className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
            {sources.length}
          </div>
          <div className="mt-1.5 sm:mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
            <span className="font-mono tabular-nums text-slate-800 font-medium">
              {sources.filter((s) => s.status === 'analyzed').length}
            </span>
            <span>fully analyzed</span>
          </div>
        </div>

        {/* Metric 2: Candidates */}
        <div
          onClick={() => navigate('candidates')}
          className="bg-white border border-slate-200/80 rounded-lg p-3.5 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 sm:mb-2">
            <span className="truncate pr-1">Clip Candidates</span>
            <Sparkles className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
            {candidates.length}
          </div>
          <div className="mt-1.5 sm:mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
            <span className="font-mono tabular-nums text-emerald-600 font-semibold">
              {candidates.filter((c) => c.status === 'approved').length}
            </span>
            <span>approved for clips</span>
          </div>
        </div>

        {/* Metric 3: Clips Created */}
        <div
          onClick={() => navigate('clips')}
          className="bg-white border border-slate-200/80 rounded-lg p-3.5 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 sm:mb-2">
            <span className="truncate pr-1">Clips Created</span>
            <Film className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
            {clips.length}
          </div>
          <div className="mt-1.5 sm:mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
            <span className="font-mono tabular-nums text-slate-800 font-medium">
              {clips.filter((c) => c.status === 'ready').length}
            </span>
            <span>ready to preview</span>
          </div>
        </div>

        {/* Metric 4: Ready to Publish */}
        <div
          onClick={() => navigate('queue')}
          className="bg-white border border-slate-200/80 rounded-lg p-3.5 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer group shadow-xs"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 sm:mb-2">
            <span className="truncate pr-1">Ready to Publish</span>
            <Send className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
            {readyToPublishCount}
          </div>
          <div className="mt-1.5 sm:mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
            <span className="font-mono tabular-nums text-blue-600 font-semibold">
              {queue.filter((q) => q.status === 'approved').length}
            </span>
            <span>scheduled in queue</span>
          </div>
        </div>
      </div>

      {/* Active Processing Jobs & Pipeline Status */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-1.5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600 shrink-0" />
            <h2 className="font-semibold text-sm text-slate-900">
              Active Background Jobs
            </h2>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              ({jobs.length} in flight)
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Pipeline queue auto-balancer active
          </span>
        </div>

        {jobs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No background jobs currently processing. All discovered sources have been indexed.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
                      {(job.type || '').replace('_', ' ')}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="font-medium text-xs text-slate-900 truncate max-w-md">
                      {job.targetTitle}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                    <span>{job.stage}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono tabular-nums text-slate-400">
                      Started {job.startedAt}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto w-full sm:w-auto justify-between sm:justify-end">
                  <div className="w-32 sm:w-36 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs tabular-nums text-slate-700 w-9 text-right font-medium">
                    {job.progress}%
                  </span>
                  <button
                    onClick={() => cancelJob(job.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                    title="Cancel task"
                    aria-label="Cancel job"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Two Column Grid: Top Candidate Moments & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
        {/* Left: Top Scored Candidate Moments */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div>
              <h2 className="font-semibold text-sm text-slate-900">
                Top Candidate Moments
              </h2>
              <p className="text-xs text-slate-500">
                AI-scored moments with highest predicted hook retention
              </p>
            </div>
            <button
              onClick={() => navigate('candidates')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1 shrink-0"
            >
              <span>View All ({candidates.length})</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {highScoringCandidates.length === 0 ? (
              <div className="py-8 px-4 text-center border border-dashed border-slate-200 rounded-lg">
                <Sparkles className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-800">No candidate moments yet</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Run automated discovery and source analysis to detect high-retention moments.
                </p>
                <button
                  onClick={() => {
                    runDiscovery();
                    navigate('discover');
                  }}
                  className="mt-3 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold transition-colors"
                >
                  Run Discovery
                </button>
              </div>
            ) : (
              highScoringCandidates.map((cand) => (
                <div
                  key={cand.id}
                  className="p-3.5 sm:p-4 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50/50 transition-colors space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                        <span className="font-medium text-slate-800 truncate max-w-[140px] sm:max-w-none">
                          {cand.channelTitle}
                        </span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">
                          {cand.startTime} - {cand.endTime} ({cand.duration})
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug">
                        "{cand.hook}"
                      </div>
                    </div>

                    <div className="text-right shrink-0 bg-white sm:bg-transparent px-2 py-1 sm:p-0 rounded border sm:border-0 border-slate-200/60">
                      <div className="font-mono text-sm sm:text-base font-bold text-slate-900 tabular-nums">
                        {cand.score}
                        <span className="text-[10px] text-slate-400 font-normal">/100</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-normal">Retention Score</div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                    {cand.summary}
                  </p>

                  <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t border-slate-200/60 text-xs">
                    <span className="text-[11px] text-slate-500">
                      Status: <span className="font-medium text-slate-800 capitalize">{cand.status}</span>
                    </span>

                    <button
                      onClick={() => generateClipFromCandidate(cand.id)}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <Film className="w-3.5 h-3.5 text-blue-300" />
                      <span>Create Vertical Clip</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Recent Activity Feed */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="font-semibold text-sm text-slate-900">
                Recent Pipeline Activity
              </h2>
              <p className="text-xs text-slate-500">
                Chronological ledger of content generation steps
              </p>
            </div>
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          <div className="space-y-3.5">
            {activities.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                No recent activity logged yet.
              </div>
            ) : (
              activities.map((act) => (
                <div key={act.id} className="flex items-start gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 leading-tight">
                      {act.title}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {act.subtitle}
                    </div>
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0">
                    {act.timestamp}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pipeline Quick Links Footer */}
          <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between flex-wrap gap-2">
            <span className="truncate max-w-[200px]">Workspace: {workspace.workspaceName}</span>
            <button
              onClick={() => navigate('settings')}
              className="text-blue-600 hover:underline font-medium shrink-0"
            >
              Configure Thresholds →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
