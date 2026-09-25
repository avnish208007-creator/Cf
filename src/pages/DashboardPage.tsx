import React from 'react';
import {
  Compass,
  Sparkles,
  Film,
  Send,
  Play,
  ArrowRight,
  Clock,
  X,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const DashboardPage: React.FC = () => {
  const {
    sources,
    candidates,
    clips,
    queue,
    jobs,
    navigate,
    runDiscovery,
    isDiscovering,
    generateClipFromCandidate,
    addClipToQueue,
    cancelJob,
  } = useApp();

  const highScoringCandidates = candidates
    .filter((c) => c.status !== 'rejected')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const recentClips = clips.slice(0, 3);

  const stats = [
    { label: 'Videos found', count: sources.length, targetPage: 'discover' as const, icon: Compass },
    { label: 'Candidates', count: candidates.length, targetPage: 'candidates' as const, icon: Sparkles },
    { label: 'Clips ready', count: clips.length, targetPage: 'clips' as const, icon: Film },
    { label: 'In queue', count: queue.length, targetPage: 'queue' as const, icon: Send },
  ];

  return (
    <div className="space-y-8 pb-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Here's what's happening with your content pipeline.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            runDiscovery();
            navigate('discover');
          }}
          disabled={isDiscovering}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-2xs flex items-center gap-2 disabled:opacity-50 cursor-pointer self-start sm:self-auto"
        >
          <Compass className={`w-4 h-4 ${isDiscovering ? 'animate-spin' : ''}`} />
          <span>{isDiscovering ? 'Searching...' : 'Find videos'}</span>
        </button>
      </div>

      {/* Horizontal Unboxed Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-white border border-slate-200/80 rounded-xl shadow-2xs">
        {stats.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              onClick={() => navigate(s.targetPage)}
              className={`p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group ${
                idx !== stats.length - 1 ? 'lg:border-r lg:border-slate-100' : ''
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>{s.label}</span>
                <Icon className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                {s.count}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Jobs / Tasks if running */}
      {jobs.length > 0 && (
        <div className="p-4 bg-white border border-slate-200/80 rounded-xl shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
              Active Processing Tasks ({jobs.length})
            </h2>
          </div>
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-slate-900 block truncate">{job.targetTitle}</span>
                  <span className="text-[11px] text-slate-500 block truncate">{job.stage}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-24 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all duration-300"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-slate-600 tabular-nums">{job.progress}%</span>
                  <button
                    onClick={() => cancelJob(job.id)}
                    className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Needs Attention & Recent Clips */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Needs Attention (Top Moments) */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Top Candidates</h2>
              <p className="text-xs text-slate-500">Moments ready for clip generation</p>
            </div>
            <button
              onClick={() => navigate('candidates')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {highScoringCandidates.length === 0 ? (
              <div className="p-8 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                No moments analyzed yet. Discover a video to extract candidates.
              </div>
            ) : (
              highScoringCandidates.map((cand) => (
                <div
                  key={cand.id}
                  className="p-3.5 bg-slate-50/60 border border-slate-200/70 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-medium text-slate-700 truncate">{cand.channelTitle}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-500 tabular-nums">{cand.startTime} - {cand.endTime}</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 leading-snug truncate">
                      "{cand.hook}"
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                      Score {cand.score}
                    </span>
                    <button
                      onClick={() => generateClipFromCandidate(cand.id)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-md transition-colors cursor-pointer shadow-2xs"
                    >
                      Generate clip
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Clips */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Recent Clips</h2>
              <p className="text-xs text-slate-500">Generated 9:16 vertical shorts</p>
            </div>
            <button
              onClick={() => navigate('clips')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {recentClips.length === 0 ? (
              <div className="p-8 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                No clips generated yet. Select a candidate to render a short.
              </div>
            ) : (
              recentClips.map((clip) => (
                <div
                  key={clip.id}
                  className="p-3 bg-slate-50/60 border border-slate-200/70 rounded-lg flex items-center gap-3 text-xs"
                >
                  <div className="w-12 h-16 bg-slate-900 rounded overflow-hidden relative shrink-0 flex items-center justify-center">
                    {clip.thumbnailBg ? (
                      <div className={`w-full h-full bg-gradient-to-br ${clip.thumbnailBg}`} />
                    ) : (
                      <Film className="w-5 h-5 text-slate-500" />
                    )}
                    <Play className="w-3.5 h-3.5 text-white absolute" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="font-semibold text-slate-900 truncate leading-snug">
                      {clip.title}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-mono tabular-nums">{clip.duration}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{clip.status}</span>
                    </div>
                  </div>

                  {!clip.inQueue && (
                    <button
                      onClick={() => addClipToQueue(clip.id)}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium transition-colors shrink-0 cursor-pointer"
                    >
                      Queue
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
