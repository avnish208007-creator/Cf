import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Film,
  Play,
  Pause,
  Send,
  Trash2,
  Edit3,
  Volume2,
  VolumeX,
  Download,
  RefreshCw,
  X,
  Check,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Clip } from '../types';

export const ClipsPage: React.FC = () => {
  const {
    clips,
    fetchClips,
    addClipToQueue,
    deleteClip,
    updateClipCaptions,
    navigate,
    workspace,
    showToast,
  } = useApp();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedClipForPreview, setSelectedClipForPreview] = useState<Clip | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [videoPlaybackError, setVideoPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    fetchClips();
  }, [fetchClips]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchClips();
    setIsRefreshing(false);
    showToast('Refreshed clips from Supabase', 'info');
  };

  // Player state inside preview modal
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Caption edit state inside modal
  const [editingCaptions, setEditingCaptions] = useState(false);
  const [editableHashtags, setEditableHashtags] = useState('');
  const [editableCaptionSample, setEditableCaptionSample] = useState('');

  const filteredClips = useMemo(() => {
    return clips.filter((clip) => {
      if (filterStatus === 'all') return true;
      return clip.status === filterStatus;
    });
  }, [clips, filterStatus]);

  const openPreview = (clip: Clip) => {
    setSelectedClipForPreview(clip);
    setIsPlaying(false);
    setEditingCaptions(false);
    setEditableHashtags((clip.hashtags || []).join(' '));
    setEditableCaptionSample((clip.captionsSample || []).join('\n'));
    setVideoPlaybackError(null);
  };

  const handleSaveCaptions = () => {
    if (!selectedClipForPreview) return;
    const newTags = editableHashtags
      .split(' ')
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .filter((t) => t.length > 1);

    const newSamples = editableCaptionSample
      .split('\n')
      .filter((s) => s.trim().length > 0);

    updateClipCaptions(selectedClipForPreview.id, newTags, newSamples);
    setSelectedClipForPreview({
      ...selectedClipForPreview,
      hashtags: newTags,
      captionsSample: newSamples,
    });
    setEditingCaptions(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* Header */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-white">
                Rendered 9:16 Clips
              </h1>
              <span className="text-xs font-mono font-medium text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                {clips.length} generated
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Vertical short-form MP4 clips ready for review, export, and queue publishing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => navigate('candidates')}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              Find More Moments
            </button>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 space-y-5">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-900/80 rounded-xl border border-slate-800/80 self-start">
          {(['all', 'ready', 'rendering', 'queued'] as const).map((st) => {
            const count =
              st === 'all'
                ? clips.length
                : clips.filter((c) => c.status === st).length;
            const isActive = filterStatus === st;

            return (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer capitalize flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{st}</span>
                <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Clips Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredClips.length === 0 ? (
            <div className="col-span-full p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
              <Film className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-200">No rendered clips yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                Select high-retention candidate moments to generate 9:16 vertical short-form videos.
              </p>
              <button
                onClick={() => navigate('candidates')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                View Candidate Moments
              </button>
            </div>
          ) : (
            filteredClips.map((clip) => (
              <div
                key={clip.id}
                className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all flex flex-col justify-between group"
              >
                {/* 9:16 Aspect ratio preview frame */}
                <div
                  onClick={() => openPreview(clip)}
                  className="relative aspect-9/16 bg-slate-950 cursor-pointer overflow-hidden flex flex-col justify-between p-3.5 text-white select-none"
                >
                  {clip.videoUrl ? (
                    <video
                      src={clip.videoUrl}
                      poster={clip.thumbnailUrl || clip.thumbnailBg}
                      preload="metadata"
                      playsInline
                      muted
                      loop
                      className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                      onMouseEnter={(e) => {
                        e.currentTarget.play().catch(() => {});
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-neutral-900 to-black opacity-90" />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />

                  {/* Top overlay */}
                  <div className="relative z-10 flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-slate-200 truncate max-w-[120px]">
                      {workspace.brandName || workspace.workspaceName}
                    </span>
                    <span className="font-mono tabular-nums bg-slate-950/80 px-1.5 py-0.5 rounded text-slate-300">
                      {clip.duration || '30s'}
                    </span>
                  </div>

                  {/* Center play icon */}
                  <div className="relative z-10 flex items-center justify-center my-auto pointer-events-none">
                    <div className="w-10 h-10 rounded-full bg-slate-950/60 border border-white/20 backdrop-blur-xs flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                    </div>
                  </div>

                  {/* Bottom hook preview */}
                  <div className="relative z-10 space-y-1">
                    <div className="bg-slate-950/80 backdrop-blur-xs p-2 rounded-lg border border-white/10 text-[11px] font-semibold text-center leading-snug">
                      <span className="text-blue-300">"{clip.title}"</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span className="truncate">{clip.channelTitle}</span>
                      <span className="capitalize text-emerald-400">{clip.status}</span>
                    </div>
                  </div>
                </div>

                {/* Card Meta & Action Bar */}
                <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h2 className="text-xs font-semibold text-slate-100 line-clamp-2 leading-snug">
                      {clip.title}
                    </h2>
                    {/* Unboxed Metadata */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1.5">
                      <span className="font-mono text-[11px] text-slate-300">{clip.duration || '30s'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[11px] text-slate-400">{clip.aspectRatio || '9:16'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize text-slate-300">{clip.status || 'ready'}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1 text-xs">
                    <button
                      onClick={() => openPreview(clip)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Edit captions"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    {clip.videoUrl && (
                      <a
                        href={clip.videoUrl}
                        download={`${clip.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Download MP4"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}

                    <button
                      onClick={() => deleteClip(clip.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Delete clip"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => addClipToQueue(clip.id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-xs transition-colors flex items-center gap-1 ml-auto cursor-pointer shadow-xs"
                    >
                      <Send className="w-3 h-3" />
                      <span>Queue</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Interactive Clip Preview Modal */}
      {selectedClipForPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 max-h-[90vh]">
            {/* Left Player */}
            <div className="md:col-span-6 bg-slate-950 flex flex-col justify-between p-4 relative min-h-[360px]">
              {selectedClipForPreview.videoUrl ? (
                <div className="w-full h-full my-auto flex flex-col items-center justify-center gap-2">
                  <div className="relative aspect-9/16 max-h-[60vh] w-auto bg-black rounded-lg overflow-hidden border border-slate-800">
                    <video
                      ref={videoRef}
                      src={selectedClipForPreview.videoUrl}
                      playsInline
                      controls
                      muted={isMuted}
                      className="w-full h-full object-contain"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onError={() => setVideoPlaybackError('Failed to play MP4 media stream.')}
                    />
                  </div>
                </div>
              ) : (
                <div className="my-auto p-4 text-center bg-slate-900 border border-slate-800 text-slate-300 rounded-lg">
                  No video URL attached
                </div>
              )}
            </div>

            {/* Right Details */}
            <div className="md:col-span-6 p-5 flex flex-col justify-between bg-slate-900 text-xs">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="font-semibold text-sm text-white">Clip Inspector</h3>
                  <button onClick={() => setSelectedClipForPreview(null)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-semibold text-slate-500">Title</label>
                  <p className="font-semibold text-white text-xs mt-0.5">{selectedClipForPreview.title}</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] uppercase font-semibold text-slate-500">Captions</label>
                    <button
                      onClick={() => setEditingCaptions(!editingCaptions)}
                      className="text-blue-400 hover:text-blue-300 text-xs font-medium cursor-pointer"
                    >
                      {editingCaptions ? 'Cancel' : 'Edit'}
                    </button>
                  </div>

                  {editingCaptions ? (
                    <textarea
                      rows={3}
                      value={editableCaptionSample}
                      onChange={(e) => setEditableCaptionSample(e.target.value)}
                      className="w-full p-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-hidden focus:border-blue-500"
                    />
                  ) : (
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-slate-300 space-y-1 text-xs">
                      {(selectedClipForPreview.captionsSample || []).map((line, idx) => (
                        <div key={idx}>• {line}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] uppercase font-semibold text-slate-500">Hashtags</label>
                  {editingCaptions ? (
                    <input
                      type="text"
                      value={editableHashtags}
                      onChange={(e) => setEditableHashtags(e.target.value)}
                      className="w-full p-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white mt-1"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(selectedClipForPreview.hashtags || []).map((tag) => (
                        <span key={tag} className="text-[11px] font-mono text-blue-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-2 mt-4">
                {editingCaptions ? (
                  <button
                    onClick={handleSaveCaptions}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-xs cursor-pointer"
                  >
                    Save Captions
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        deleteClip(selectedClipForPreview.id);
                        setSelectedClipForPreview(null);
                      }}
                      className="px-3 py-1.5 text-rose-400 hover:bg-rose-950/60 rounded-lg font-medium text-xs cursor-pointer"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => {
                        addClipToQueue(selectedClipForPreview.id);
                        setSelectedClipForPreview(null);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Move to Queue</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
