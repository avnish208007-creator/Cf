import React, { useState, useMemo } from 'react';
import {
  Compass,
  Search,
  Sparkles,
  ExternalLink,
  MoreVertical,
  Trash2,
  CheckSquare,
  Square,
  AlertTriangle,
  Play,
  Clock,
  Eye,
  RefreshCw,
  Plus,
  X,
  Filter,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SourceVideo } from '../types';

export const DiscoverPage: React.FC = () => {
  const {
    sources,
    isFetchingSources,
    sourcesFetchError,
    fetchSources,
    deleteSource,
    bulkDeleteSources,
    runDiscovery,
    analyzeSource,
    analyzeAllSources,
    isDiscovering,
    isAnalyzing,
    addSource,
    workspace,
  } = useApp();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'analyzed' | 'processing'>('all');
  const [selectedSubtopic, setSelectedSubtopic] = useState<string>('all');

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Delete Confirmation Modal State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'single' | 'bulk';
    sourceId?: string;
    sourceTitle?: string;
    count?: number;
  } | null>(null);

  // Overflow Menu active state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Manual source add drawer state
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addSubtopic, setAddSubtopic] = useState(workspace.subtopics[0] || workspace.mainNiche);

  // Filter sources
  const filteredSources = useMemo(() => {
    return sources.filter((src) => {
      const matchesSearch =
        src.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        src.channelTitle.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'new' && (src.status === 'new' || src.status === 'queued')) ||
        (statusFilter === 'analyzed' && src.status === 'analyzed') ||
        (statusFilter === 'processing' && src.status === 'processing');

      const matchesSubtopic =
        selectedSubtopic === 'all' || src.niche === selectedSubtopic;

      return matchesSearch && matchesStatus && matchesSubtopic;
    });
  }, [sources, searchQuery, statusFilter, selectedSubtopic]);

  const allVisibleSelected = useMemo(() => {
    if (filteredSources.length === 0) return false;
    return filteredSources.every((src) => selectedIds.has(src.id));
  }, [filteredSources, selectedIds]);

  // Toggle selection
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<string>();
      filteredSources.forEach((src) => next.add(src.id));
      setSelectedIds(next);
    }
  };

  const handleSingleDeleteRequest = (source: SourceVideo) => {
    setActiveMenuId(null);
    setDeleteConfirmTarget({
      type: 'single',
      sourceId: source.id,
      sourceTitle: source.title,
    });
  };

  const handleBulkDeleteRequest = () => {
    setDeleteConfirmTarget({
      type: 'bulk',
      count: selectedIds.size,
    });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmTarget) return;

    if (deleteConfirmTarget.type === 'single' && deleteConfirmTarget.sourceId) {
      await deleteSource(deleteConfirmTarget.sourceId);
    } else if (deleteConfirmTarget.type === 'bulk') {
      await bulkDeleteSources(Array.from(selectedIds));
      setSelectedIds(new Set());
    }

    setDeleteConfirmTarget(null);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTitle.trim()) return;
    await addSource({
      title: addTitle.trim(),
      youtubeUrl: addUrl.trim() || `https://www.youtube.com/watch?v=${Date.now()}`,
      niche: addSubtopic,
    });
    setAddTitle('');
    setAddUrl('');
    setShowAddDrawer(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* Page Header */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-white">
                Discover Sources
              </h1>
              <span className="text-xs font-medium text-slate-400 font-mono bg-slate-800/80 px-2 py-0.5 rounded">
                {sources.length} videos
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Find long-form YouTube videos worth turning into short-form clips for{' '}
              <span className="text-slate-200 font-medium">{workspace.mainNiche}</span>.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => runDiscovery()}
              disabled={isDiscovering}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Compass className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
              <span>{isDiscovering ? 'Searching...' : 'Run Discovery'}</span>
            </button>

            <button
              onClick={() => analyzeAllSources()}
              disabled={isAnalyzing || sources.filter((s) => s.status === 'new').length === 0}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'Analyzing...' : 'Analyze All New'}</span>
            </button>

            <button
              onClick={() => setShowAddDrawer(!showAddDrawer)}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add URL</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 space-y-5">
        {/* Manual Add Drawer */}
        {showAddDrawer && (
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-white">
              <span>Manually Add Source Video</span>
              <button onClick={() => setShowAddDrawer(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Video Title..."
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                required
                className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-hidden focus:border-blue-500"
              />
              <input
                type="url"
                placeholder="YouTube URL..."
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-hidden focus:border-blue-500"
              />
              <button
                type="submit"
                className="py-1.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Add Video Record
              </button>
            </form>
          </div>
        )}

        {/* Filter Controls & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/80">
          {/* Status Tabs (Interactive Segmented Control) */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800/60">
            {(['all', 'new', 'analyzed', 'processing'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer capitalize ${
                  statusFilter === tab
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search Input & Subtopic Filter */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search title or channel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-hidden focus:border-blue-500 placeholder:text-slate-500"
              />
            </div>

            {workspace.subtopics.length > 0 && (
              <select
                value={selectedSubtopic}
                onChange={(e) => setSelectedSubtopic(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-hidden focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Subtopics</option>
                {workspace.subtopics.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Bulk Actions Contextual Toolbar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-blue-950/70 border border-blue-800/80 rounded-xl text-xs text-blue-200 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 font-medium">
              <span className="font-semibold text-white">{selectedIds.size} selected</span>
              <span className="text-slate-400">·</span>
              <button
                onClick={toggleSelectAllVisible}
                className="text-blue-300 hover:text-white underline cursor-pointer"
              >
                {allVisibleSelected ? 'Deselect all' : 'Select all visible'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkDeleteRequest}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected</span>
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-2.5 py-1 text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Source Content List */}
        {filteredSources.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
            <Compass className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-200">No discovered videos found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Run automatic discovery to query YouTube RSS feeds for videos matching your niche.
            </p>
            <button
              onClick={() => runDiscovery()}
              disabled={isDiscovering}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Run Discovery
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSources.map((source) => {
              const isSelected = selectedIds.has(source.id);
              const youtubeId = source.youtubeUrl ? source.youtubeUrl.split('v=').pop()?.split('&')[0] : null;
              const thumbUrl = youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg` : null;

              return (
                <div
                  key={source.id}
                  className={`group relative bg-slate-900/70 border transition-all rounded-xl overflow-hidden flex flex-col justify-between ${
                    isSelected ? 'border-blue-500 ring-1 ring-blue-500 bg-slate-900' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Card Header & Thumbnail */}
                  <div>
                    <div className="relative aspect-video bg-slate-950 overflow-hidden">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={source.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${source.thumbnailGradient || 'from-slate-900 to-indigo-950'} flex items-center justify-center text-slate-600`}>
                          <Play className="w-8 h-8 opacity-40" />
                        </div>
                      )}

                      {/* Select Checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectOne(source.id);
                        }}
                        className="absolute top-2 left-2 p-1 rounded-md bg-slate-950/80 hover:bg-slate-900 text-white backdrop-blur-xs cursor-pointer z-10"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 opacity-80 group-hover:opacity-100" />
                        )}
                      </button>

                      {/* Duration Tag */}
                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-slate-950/90 text-[10px] font-mono font-medium text-slate-200 rounded backdrop-blur-xs">
                        {source.duration || '12:00'}
                      </div>

                      {/* Status Overlay */}
                      <div className="absolute top-2 right-2">
                        {source.status === 'analyzed' ? (
                          <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-950/90 text-emerald-300 border border-emerald-800/80 rounded backdrop-blur-xs">
                            Analyzed
                          </span>
                        ) : source.status === 'processing' ? (
                          <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-950/90 text-blue-300 border border-blue-800/80 rounded backdrop-blur-xs flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                            Analyzing
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-medium bg-slate-950/90 text-slate-400 border border-slate-800 rounded backdrop-blur-xs">
                            New
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 space-y-2">
                      <h2 className="text-sm font-semibold text-slate-100 line-clamp-2 leading-snug group-hover:text-blue-400 transition-colors">
                        {source.title}
                      </h2>

                      {/* Anti-Slop Clean Text Metadata */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="font-medium text-slate-300 truncate">{source.channelTitle}</span>
                        <span aria-hidden="true">·</span>
                        <span>{source.publishedAt || 'Recently'}</span>
                        {source.relevanceScore !== undefined && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                              {source.relevanceScore}% fit
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Actions & Overflow Menu */}
                  <div className="p-4 pt-0 flex items-center justify-between gap-2 border-t border-slate-800/60 mt-3 pt-3">
                    {source.status === 'new' ? (
                      <button
                        onClick={() => analyzeSource(source.id)}
                        disabled={isAnalyzing}
                        className="flex-1 py-1.5 px-3 bg-blue-600/90 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Analyze Moments</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => analyzeSource(source.id)}
                        className="flex-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                        <span>Re-analyze</span>
                      </button>
                    )}

                    {/* Overflow Menu (···) */}
                    <div className="relative">
                      <button
                        onClick={() => setActiveMenuId(activeMenuId === source.id ? null : source.id)}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        title="More options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {activeMenuId === source.id && (
                        <div className="absolute right-0 bottom-full mb-1 w-44 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-30 p-1 text-xs space-y-0.5 animate-in fade-in duration-100">
                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              analyzeSource(source.id);
                            }}
                            className="w-full text-left px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg flex items-center gap-2 cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>Analyze</span>
                          </button>

                          {source.youtubeUrl && (
                            <a
                              href={source.youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => setActiveMenuId(null)}
                              className="w-full text-left px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg flex items-center gap-2 cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                              <span>Open YouTube</span>
                            </a>
                          )}

                          <div className="border-t border-slate-800/80 my-1" />

                          <button
                            onClick={() => handleSingleDeleteRequest(source)}
                            className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-950/60 rounded-lg flex items-center gap-2 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove from discoveries</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3 text-rose-400">
              <div className="p-2 bg-rose-950/80 border border-rose-800/60 rounded-xl shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  {deleteConfirmTarget.type === 'single'
                    ? 'Remove this video?'
                    : `Remove ${deleteConfirmTarget.count} selected videos?`}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Removing it will permanently delete the source record from Supabase and remove associated candidates and clips.
                </p>
                {deleteConfirmTarget.sourceTitle && (
                  <p className="text-xs font-medium text-slate-300 mt-2 italic line-clamp-2">
                    "{deleteConfirmTarget.sourceTitle}"
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                {deleteConfirmTarget.type === 'single' ? 'Remove video' : 'Remove selected'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
