import React, { useState, useMemo } from 'react';
import {
  Compass,
  Search,
  Filter,
  Play,
  Sparkles,
  ExternalLink,
  Clock,
  Eye,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Sliders,
  Radio,
  ChevronDown,
  ChevronUp,
  Link,
  Layers,
  Settings,
  AlertTriangle,
  X,
  FlaskConical,
  Database,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SourceVideo } from '../types';

export const DiscoverPage: React.FC = () => {
  const {
    sources,
    isFetchingSources,
    sourcesFetchError,
    fetchSources,
    runDiscovery,
    analyzeSource,
    analyzeAllSources,
    isDiscovering,
    isAnalyzing,
    discoveryProviderError,
    clearDiscoveryProviderError,
    addSource,
    workspace,
    navigate,
    showToast,
  } = useApp();

  // Filter & discovery control states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFreshness, setSelectedFreshness] = useState<'all' | 'last_24h' | 'last_7d' | 'last_30d'>('all');
  const [selectedContentType, setSelectedContentType] = useState<'all' | 'deep_dive' | 'interviews' | 'keynote'>('all');
  const [selectedSubtopic, setSelectedSubtopic] = useState<string>('all');
  const [minRelevanceFilter, setMinRelevanceFilter] = useState<number>(0);

  // De-emphasized optional manual source override state
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualSubtopic, setManualSubtopic] = useState(workspace.subtopics[0] || workspace.mainNiche);

  // Filter sources based on controls and sort by overall score descending
  const filteredSources = useMemo(() => {
    return sources
      .filter((src) => {
        const matchesSearch =
          src.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          src.channelTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
          src.summary.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesSubtopic =
          selectedSubtopic === 'all' || src.niche === selectedSubtopic;

        const score = src.overallScore ?? src.relevanceScore ?? 88;
        const matchesRelevance = score >= minRelevanceFilter;

        return matchesSearch && matchesSubtopic && matchesRelevance;
      })
      .sort((a, b) => (b.overallScore ?? b.relevanceScore ?? 0) - (a.overallScore ?? a.relevanceScore ?? 0));
  }, [sources, searchQuery, selectedSubtopic, minRelevanceFilter]);

  const unanalyzedCount = useMemo(() => {
    return sources.filter((s) => s.status === 'new' || s.status === 'queued').length;
  }, [sources]);

  const handleRunDiscovery = () => {
    runDiscovery({
      freshness: selectedFreshness,
      contentType: selectedContentType,
      subtopic: selectedSubtopic !== 'all' ? selectedSubtopic : undefined,
    });
  };

  const handleManualOverrideSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;

    addSource({
      title: manualTitle.trim(),
      youtubeUrl: manualUrl.trim() || `https://youtube.com/watch?v=override_${Date.now()}`,
      niche: manualSubtopic,
    });

    setManualTitle('');
    setManualUrl('');
    setShowManualOverride(false);
    showToast('Manual source override added to discovery pool', 'success');
  };

  const getOverallScoreBadge = (source: SourceVideo) => {
    const val = source.overallScore ?? source.relevanceScore ?? 88;
    if (val >= 90) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {val}% High Short-Form Potential
        </span>
      );
    }
    if (val >= 75) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          {val}% Solid Candidate
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200/80">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        {val}% Moderate Potential
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Page Header with Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Source Video Discovery
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Set your niche once. ClipFlow automatically monitors feeds, discovers long-form talks, and extracts moments.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Secondary Action: Analyze Sources */}
          <button
            onClick={() => analyzeAllSources()}
            disabled={isAnalyzing || unanalyzedCount === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-md transition-colors shadow-xs disabled:opacity-50"
            title="Scan speech cadence and extract moments from un-indexed videos"
          >
            <Sparkles className={`w-3.5 h-3.5 text-blue-600 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>
              {isAnalyzing
                ? 'Analyzing Sources...'
                : unanalyzedCount > 0
                ? `Analyze Sources (${unanalyzedCount})`
                : 'All Sources Analyzed'}
            </span>
          </button>

          {/* Primary Action: Run Discovery */}
          <button
            onClick={handleRunDiscovery}
            disabled={isDiscovering}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-md transition-colors shadow-xs"
          >
            <Compass className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
            <span>{isDiscovering ? 'Crawling Repositories...' : 'Run Discovery'}</span>
          </button>
        </div>
      </div>

      {/* Provider Unavailable Alert State */}
      {discoveryProviderError && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-amber-950">
                YouTube discovery provider unavailable
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                {discoveryProviderError}
              </p>
              <p className="text-[11px] text-amber-700">
                The discovery provider interface is intact. When run in an environment with the necessary runtime binaries, automated YouTube search executes seamlessly.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearDiscoveryProviderError}
            className="text-amber-500 hover:text-amber-800 p-1 transition-colors"
            title="Dismiss message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Selected Niche and Monitored Subtopics Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-xs font-medium text-slate-300">Automated Pipeline Targeting:</span>
            <span className="text-sm font-bold text-white tracking-tight">
              {workspace.mainNiche}
            </span>
          </div>

          <button
            onClick={() => navigate('settings')}
            className="flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200 transition-colors font-medium self-start sm:self-auto"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Configure Niche & Subtopics</span>
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
            Monitored Subtopics
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {workspace.subtopics.map((sub) => (
              <span
                key={sub}
                className="px-2.5 py-1 text-xs bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 rounded-md transition-colors"
              >
                {sub}
              </span>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-slate-400 pt-1">
          ClipFlow continuously scans technical podcasts, keynotes, and demonstrations for these subtopics. No manual URL input is necessary.
        </div>
      </div>

      {/* Discovery Controls & Freshness / Content Filters */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-slate-600" />
            <h2 className="font-semibold text-xs text-slate-900 uppercase tracking-wider">
              Discovery Controls & Freshness Filters
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">
            Showing {filteredSources.length} of {sources.length} sources
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Subtopic Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Subtopic Focus
            </label>
            <select
              value={selectedSubtopic}
              onChange={(e) => setSelectedSubtopic(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            >
              <option value="all">All Subtopics ({workspace.subtopics.length})</option>
              {workspace.subtopics.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Freshness Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Publishing Freshness
            </label>
            <select
              value={selectedFreshness}
              onChange={(e) => setSelectedFreshness(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            >
              <option value="all">Any Freshness (All Time)</option>
              <option value="last_24h">Past 24 Hours</option>
              <option value="last_7d">Past 7 Days</option>
              <option value="last_30d">Past 30 Days</option>
            </select>
          </div>

          {/* Content Type Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Content Format
            </label>
            <select
              value={selectedContentType}
              onChange={(e) => setSelectedContentType(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            >
              <option value="all">All Formats</option>
              <option value="deep_dive">Deep Dives (30m+)</option>
              <option value="interviews">Podcasts & Interviews</option>
              <option value="keynote">Keynotes & Conferences</option>
            </select>
          </div>

          {/* Relevance Threshold */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Min Relevance Score
            </label>
            <select
              value={minRelevanceFilter}
              onChange={(e) => setMinRelevanceFilter(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            >
              <option value="0">All Matches (Any score)</option>
              <option value="90">Strong Match (90%+)</option>
              <option value="94">Top Tier Match (94%+)</option>
            </select>
          </div>
        </div>

        {/* Search Query Input */}
        <div className="relative pt-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search discovered video titles, guest speakers, or concepts..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
          />
        </div>
      </div>

      {/* Supabase Error Banner if fetch failed */}
      {sourcesFetchError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 sm:p-5 text-rose-900 shadow-xs mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">Supabase Sync Error</h3>
              <p className="text-xs text-rose-700 mt-1 leading-relaxed">{sourcesFetchError}</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => fetchSources()}
                  disabled={isFetchingSources}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetchingSources ? 'animate-spin' : ''}`} />
                  <span>Retry Supabase Fetch</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discovered Source Videos Appearing Automatically */}
      <div className="space-y-3">
        {isFetchingSources && sources.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-xl p-10 text-center shadow-xs">
            <RefreshCw className="w-7 h-7 text-blue-600 animate-spin mx-auto mb-3" />
            <h3 className="font-semibold text-sm text-slate-900">Querying Supabase source_videos</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Filtering records by workspace "{workspace.workspaceName || 'Apex Media Lab'}"...
            </p>
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-xl p-8 sm:p-12 text-center shadow-xs">
            <Compass className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <h3 className="font-semibold text-sm text-slate-900">
              {sources.length === 0 ? 'No source videos in this workspace' : 'No discovered sources match this filter'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {sources.length === 0
                ? `Run discovery to find, rank, and persist sources for "${workspace.mainNiche}" in Supabase.`
                : `Adjust your search or freshness filters, or run discovery again.`}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={handleRunDiscovery}
                disabled={isDiscovering}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 shadow-xs"
              >
                {isDiscovering ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Running Discovery...</span>
                  </>
                ) : (
                  <>
                    <Compass className="w-3.5 h-3.5" />
                    <span>Run Discovery Now</span>
                  </>
                )}
              </button>
              {sources.length > 0 && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSubtopic('all');
                    setSelectedFreshness('all');
                    setSelectedContentType('all');
                    setMinRelevanceFilter(0);
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          filteredSources.map((source) => {
            const isDev = Boolean(
              source.is_development_source ||
              source.isDevelopmentSource ||
              source.youtubeUrl?.startsWith('dev://') ||
              source.youtubeUrl?.includes('test-source')
            );

            return (
              <div
                key={source.id}
                className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 hover:border-slate-300 transition-colors shadow-xs flex flex-col md:flex-row md:items-start justify-between gap-4 sm:gap-5"
              >
                {/* Thumbnail preview if real image exists */}
                {source.thumbnailUrl && (
                  <div className="w-full md:w-44 md:h-28 rounded-lg overflow-hidden shrink-0 bg-slate-900 relative">
                    <img
                      src={source.thumbnailUrl}
                      alt={source.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 font-mono text-[10px] text-white font-medium">
                      {source.duration}
                    </div>
                  </div>
                )}

                {/* Left Details */}
                <div className="space-y-2 flex-1 min-w-0">
                  {/* Meta details & Source Relevance Status */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                    {getOverallScoreBadge(source)}
                    {isDev && (
                      <>
                        <span>·</span>
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/60 rounded text-[10px] font-semibold flex items-center gap-1">
                          <FlaskConical className="w-3 h-3 text-amber-600" />
                          <span>Dev Test Source</span>
                        </span>
                      </>
                    )}
                    <span>·</span>
                    <span className="font-semibold text-slate-800">{source.channelTitle}</span>
                    <span>·</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-medium">
                      {source.niche}
                    </span>
                    <span>·</span>
                    <span className="font-mono tabular-nums">{source.duration}</span>
                    <span>·</span>
                    <span className="font-mono tabular-nums">
                      {source.viewCount.toLocaleString()} views
                    </span>
                    {source.likeCount !== undefined && (
                      <>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{source.likeCount.toLocaleString()} likes</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{source.publishedAt}</span>
                  </div>

                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 leading-snug">
                    {source.title}
                  </h2>

                  {/* Explainable Rationale */}
                  {source.scoreExplanation && (
                    <div className="text-[11px] text-slate-700 bg-slate-50/90 border border-slate-200/70 rounded-md px-2.5 py-1.5 flex items-start gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-slate-900">Ranking Rationale:</strong> {source.scoreExplanation}
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {source.summary}
                  </p>

                  {/* Transparent 4-Factor Weighted Score Breakdown */}
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 flex-wrap pt-0.5 font-mono">
                    <span>Overall: <strong className="text-slate-900 font-semibold">{source.overallScore ?? source.relevanceScore ?? 88}%</strong></span>
                    <span>·</span>
                    <span>Rel (30%): <strong className="text-slate-700">{source.relevanceScore ?? 88}%</strong></span>
                    <span>·</span>
                    <span>Eng (30%): <strong className="text-slate-700">{source.engagementScore ?? 85}%</strong></span>
                    <span>·</span>
                    <span>Short-Form (25%): <strong className="text-slate-700">{source.shortFormScore ?? 80}%</strong></span>
                    <span>·</span>
                    <span>Qual (15%): <strong className="text-slate-700">{source.contentQualityScore ?? 80}%</strong></span>
                  </div>

                  {/* Real Status indicator */}
                  <div className="pt-1 flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                    {source.status === 'processing' ? (
                      <span className="flex items-center gap-1.5 text-blue-600 font-medium">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Analyzing speech cadence & moment hooks...</span>
                      </span>
                    ) : source.status === 'analyzed' && (source.candidatesCount ?? 0) > 0 ? (
                      <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Analyzed · {source.candidatesCount} candidate{source.candidatesCount === 1 ? '' : 's'} detected</span>
                      </span>
                    ) : source.status === 'analyzed' && (source.candidatesCount ?? 0) === 0 ? (
                      <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Analyzed · No candidates found</span>
                      </span>
                    ) : source.status === 'failed' ? (
                      <span className="flex items-center gap-1.5 text-rose-600 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        <span>Analysis failed</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Unanalyzed Source · Ready for moment detection</span>
                      </span>
                    )}

                    <span>·</span>
                    {source.mediaStatus === 'available' || source.mediaPath ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Media: Available</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>Media: Auto-Acquisition on Render</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Action buttons */}
                <div className="flex flex-wrap sm:flex-nowrap md:flex-col items-center md:items-end justify-between md:justify-start gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  {source.status === 'analyzed' ? (
                    <button
                      onClick={() => navigate('candidates')}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-md transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
                    >
                      <span>View Detected Moments</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => analyzeSource(source.id)}
                      disabled={isAnalyzing || source.status === 'processing'}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-xs rounded-md transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Analyze Source</span>
                    </button>
                  )}

                  {isDev ? (
                    <div
                      className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200/60 rounded px-2.5 py-1 flex items-center gap-1.5 select-none"
                      title="Development test source - intentionally non-clickable test URL"
                    >
                      <FlaskConical className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="font-medium">Test Source (Non-clickable)</span>
                    </div>
                  ) : (
                    <a
                      href={source.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 py-1 font-medium transition-colors"
                    >
                      <span>Reference Video</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* De-emphasized Optional Manual Override Accordion */}
      <div className="border border-slate-200/70 rounded-xl bg-slate-50/50 p-3.5 transition-colors">
        <button
          type="button"
          onClick={() => setShowManualOverride(!showManualOverride)}
          className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-800 font-medium py-1"
        >
          <div className="flex items-center gap-2">
            <Link className="w-3.5 h-3.5 text-slate-400" />
            <span>Optional: Manual Source Override (For testing specific external videos)</span>
          </div>
          {showManualOverride ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {showManualOverride && (
          <div className="pt-3 mt-2 border-t border-slate-200/60 text-xs space-y-3 animate-in fade-in duration-150">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              ClipFlow operates as an automated discovery engine based on your niche. You do not need to paste URLs to use the app. This override is provided strictly as an optional testing utility.
            </p>

            <form onSubmit={handleManualOverrideSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Video Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="e.g. In-Depth Autonomous Agent Benchmark"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  YouTube URL <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Subtopic
                </label>
                <select
                  value={manualSubtopic}
                  onChange={(e) => setManualSubtopic(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
                >
                  <option value={workspace.mainNiche}>{workspace.mainNiche}</option>
                  {workspace.subtopics.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-12 flex justify-end">
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs rounded transition-colors"
                >
                  Ingest Specific Override
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
