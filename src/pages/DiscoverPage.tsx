import React, { useState, useMemo } from 'react';
import {
  Compass,
  Search,
  MoreVertical,
  Plus,
  Trash2,
  Sparkles,
  ExternalLink,
  Check,
  CheckSquare,
  Square,
  X,
  Filter,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SourceVideo } from '../types';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { AddUrlModal } from '../components/ui/AddUrlModal';
import { VideoDetailDrawer } from '../components/ui/VideoDetailDrawer';
import { EmptyState } from '../components/ui/EmptyState';
import { VideoCardSkeleton } from '../components/ui/Skeleton';

export const DiscoverPage: React.FC = () => {
  const {
    sources,
    isFetchingSources,
    runDiscovery,
    isDiscovering,
    analyzeSource,
    deleteSource,
    bulkDeleteSources,
    addSource,
    candidates,
    workspace,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'analyzed' | 'processing'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Modal / Drawer state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [showAddUrlModal, setShowAddUrlModal] = useState(false);
  const [detailVideo, setDetailVideo] = useState<SourceVideo | null>(null);

  // Filtered sources
  const filteredSources = useMemo(() => {
    return sources.filter((src) => {
      const matchesSearch =
        src.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        src.channelTitle.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'new'
          ? src.status === 'new' || src.status === 'queued'
          : statusFilter === 'analyzed'
          ? src.status === 'analyzed'
          : src.status === 'processing';

      return matchesSearch && matchesStatus;
    });
  }, [sources, searchQuery, statusFilter]);

  // Bulk selection toggles
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredSources.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredSources.map((s) => s.id));
    }
  };

  const handleConfirmSingleDelete = async () => {
    if (deleteTargetId) {
      await deleteSource(deleteTargetId);
      setDeleteTargetId(null);
      setSelectedIds((prev) => prev.filter((id) => id !== deleteTargetId));
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.length > 0) {
      await bulkDeleteSources(selectedIds);
      setSelectedIds([]);
      setShowBulkConfirm(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Discover
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Find videos worth turning into shorts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddUrlModal(true)}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add URL</span>
          </button>

          <button
            type="button"
            onClick={() => runDiscovery()}
            disabled={isDiscovering}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <Compass className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
            <span>{isDiscovering ? 'Searching...' : 'Find videos'}</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search videos or channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200/60 self-start sm:self-auto">
          {(['all', 'new', 'analyzed', 'processing'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                statusFilter === tab
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Action Contextual Toolbar */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-slate-900 text-white rounded-xl shadow-md flex items-center justify-between animate-in fade-in duration-150">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5"
            >
              {selectedIds.length === filteredSources.length ? (
                <CheckSquare className="w-4 h-4 text-blue-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>{selectedIds.length} selected</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkConfirm(true)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete selected</span>
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="p-1.5 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content View */}
      {isFetchingSources ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <VideoCardSkeleton />
          <VideoCardSkeleton />
          <VideoCardSkeleton />
        </div>
      ) : filteredSources.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No videos found"
          description={
            searchQuery
              ? `No videos match "${searchQuery}".`
              : 'Find YouTube videos for your niche to extract clips.'
          }
          actionLabel="Find videos"
          onAction={() => runDiscovery()}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSources.map((video) => {
            const isSelected = selectedIds.includes(video.id);

            return (
              <div
                key={video.id}
                className={`bg-white border rounded-xl overflow-hidden transition-all duration-150 flex flex-col ${
                  isSelected
                    ? 'border-blue-500 ring-1 ring-blue-500/20'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                {/* Card Thumbnail Area */}
                <div className="relative aspect-video bg-slate-900 group">
                  {video.youtubeUrl ? (
                    <img
                      src={`https://img.youtube.com/vi/${
                        video.youtubeUrl.split('v=')[1]?.split('&')[0]
                      }/hqdefault.jpg`}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                      onError={(e) => {
                        // Fallback gradient container if image fails
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : null}

                  {/* Fallback gradient if no img */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${video.thumbnailGradient || 'from-slate-800 to-slate-900'} -z-10`} />

                  {/* Selection Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSelect(video.id);
                    }}
                    className="absolute top-2.5 left-2.5 z-10 p-1 rounded-md bg-slate-900/60 backdrop-blur-xs text-white hover:bg-slate-900 transition-colors"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300" />
                    )}
                  </button>

                  {/* Duration Overlay */}
                  <span className="absolute bottom-2.5 right-2.5 bg-slate-950/80 text-white font-mono text-[11px] px-1.5 py-0.5 rounded tabular-nums">
                    {video.duration || '10:00'}
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <h3
                      onClick={() => setDetailVideo(video)}
                      className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      {video.title}
                    </h3>

                    {/* Unboxed Text Metadata */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-medium text-slate-700 truncate max-w-[140px]">
                        {video.channelTitle}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{video.publishedAt}</span>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-[11px] font-medium text-slate-500 capitalize">
                      {video.status === 'analyzed'
                        ? `${video.candidatesCount || 0} moments`
                        : video.status}
                    </span>

                    <div className="flex items-center gap-1.5 relative">
                      {video.status !== 'analyzed' && (
                        <button
                          type="button"
                          onClick={() => analyzeSource(video.id)}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Analyze</span>
                        </button>
                      )}

                      {/* Overflow Menu Toggle */}
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMenuId(openMenuId === video.id ? null : video.id)
                        }
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Overflow Menu Dropdown */}
                      {openMenuId === video.id && (
                        <div
                          className="absolute right-0 bottom-8 z-20 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs space-y-0.5 animate-in zoom-in-95 duration-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              setDetailVideo(video);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                            <span>View details</span>
                          </button>

                          {video.youtubeUrl && (
                            <a
                              href={video.youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => setOpenMenuId(null)}
                              className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                              <span>Open YouTube</span>
                            </a>
                          )}

                          <button
                            onClick={() => {
                              setDeleteTargetId(video.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Dialogs & Modals */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetId)}
        title="Remove this video?"
        description="Removing it will also remove its associated candidate moments and clips."
        confirmLabel="Remove video"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmSingleDelete}
        onCancel={() => setDeleteTargetId(null)}
      />

      <ConfirmDialog
        isOpen={showBulkConfirm}
        title={`Remove ${selectedIds.length} videos?`}
        description="Removing selected videos will also clean up their candidate moments."
        confirmLabel="Remove videos"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setShowBulkConfirm(false)}
      />

      <AddUrlModal
        isOpen={showAddUrlModal}
        onClose={() => setShowAddUrlModal(false)}
        onSubmit={addSource}
        defaultNiche={workspace.mainNiche}
      />

      <VideoDetailDrawer
        isOpen={Boolean(detailVideo)}
        onClose={() => setDetailVideo(null)}
        video={detailVideo}
        candidates={candidates}
        onAnalyze={analyzeSource}
        onDelete={(id) => {
          setDetailVideo(null);
          setDeleteTargetId(id);
        }}
      />
    </div>
  );
};
