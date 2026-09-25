import React, { useState } from 'react';
import { Film, Play, Send, Trash2, X, Share2, Check, ExternalLink } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Clip } from '../types';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export const ClipsPage: React.FC = () => {
  const { clips, addClipToQueue, deleteClip, navigate } = useApp();
  const [activeClip, setActiveClip] = useState<Clip | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleConfirmDelete = async () => {
    if (deleteTargetId) {
      await deleteClip(deleteTargetId);
      setDeleteTargetId(null);
      if (activeClip?.id === deleteTargetId) {
        setActiveClip(null);
      }
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Clips
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Your library of rendered vertical shorts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('queue')}
          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Send className="w-3.5 h-3.5 text-blue-600" />
          <span>Review queue</span>
        </button>
      </div>

      {/* Grid of Clips */}
      {clips.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No clips yet"
          description="Generate a clip from a candidate moment to populate your library."
          actionLabel="View candidates"
          onAction={() => navigate('candidates')}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {clips.map((clip) => (
            <div
              key={clip.id}
              className="bg-white border border-slate-200/80 rounded-xl overflow-hidden hover:border-slate-300 transition-all shadow-2xs flex flex-col group"
            >
              {/* 9:16 Video Thumbnail Container */}
              <div
                onClick={() => setActiveClip(clip)}
                className="relative aspect-[9/16] bg-slate-900 overflow-hidden cursor-pointer flex items-center justify-center"
              >
                {clip.videoUrl ? (
                  <video
                    src={clip.videoUrl}
                    preload="metadata"
                    muted
                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                  />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${clip.thumbnailBg || 'from-slate-800 to-indigo-950'} flex items-center justify-center`}>
                    <Play className="w-8 h-8 text-white/80" />
                  </div>
                )}

                {/* Overlay Play Icon */}
                <div className="absolute inset-0 bg-slate-950/20 group-hover:bg-slate-950/30 transition-colors flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 ml-0.5" />
                  </div>
                </div>

                {/* Duration Badge */}
                <span className="absolute bottom-2.5 right-2.5 bg-slate-950/80 text-white font-mono text-[11px] px-1.5 py-0.5 rounded tabular-nums">
                  {clip.duration}
                </span>

                {/* Queue Status Tag */}
                {clip.inQueue && (
                  <span className="absolute top-2.5 left-2.5 bg-blue-600/90 text-white text-[10px] font-medium px-2 py-0.5 rounded backdrop-blur-xs">
                    In Queue
                  </span>
                )}
              </div>

              {/* Clip Metadata */}
              <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <h3
                    onClick={() => setActiveClip(clip)}
                    className="text-xs font-semibold text-slate-900 leading-snug line-clamp-2 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    {clip.title}
                  </h3>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveClip(clip)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    Preview
                  </button>

                  <div className="flex items-center gap-1.5">
                    {!clip.inQueue && (
                      <button
                        type="button"
                        onClick={() => addClipToQueue(clip.id)}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-medium transition-colors cursor-pointer shadow-2xs"
                      >
                        Queue
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(clip.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete clip"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clip Detail Modal */}
      {activeClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 truncate pr-4">
                {activeClip.title}
              </h3>
              <button
                onClick={() => setActiveClip(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Video Player */}
              <div className="aspect-[9/16] bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center border border-slate-200 max-h-[420px] mx-auto">
                {activeClip.videoUrl ? (
                  <video
                    src={activeClip.videoUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-white text-xs text-center p-4">
                    Video processing completed.
                  </div>
                )}
              </div>

              {/* Details & Caption Info */}
              <div className="space-y-4 text-xs flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Hook</span>
                    <p className="text-slate-800 font-medium bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      "{activeClip.hook}"
                    </p>
                  </div>

                  {activeClip.captionsSample && activeClip.captionsSample.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Caption</span>
                      <p className="text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        {activeClip.captionsSample.join(' ')}
                      </p>
                    </div>
                  )}

                  {activeClip.hashtags && activeClip.hashtags.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Hashtags</span>
                      <p className="text-blue-600 font-mono text-[11px]">
                        {activeClip.hashtags.join(' ')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
                  {!activeClip.inQueue && (
                    <button
                      type="button"
                      onClick={() => {
                        addClipToQueue(activeClip.id);
                        setActiveClip(null);
                      }}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Add to Queue</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setDeleteTargetId(activeClip.id)}
                    className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg font-medium flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetId)}
        title="Delete this clip?"
        description="This will permanently remove the generated clip from your library and queue."
        confirmLabel="Delete clip"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
};
