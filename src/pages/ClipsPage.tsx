import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Film,
  Play,
  Pause,
  Plus,
  Send,
  Trash2,
  Edit3,
  ExternalLink,
  Volume2,
  VolumeX,
  Sparkles,
  Check,
  X,
  Share2,
  Clock,
  Download,
  Video,
  RefreshCw,
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

  // Playback diagnostics state for active preview
  const [diagState, setDiagState] = useState<{
    currentSrc: string;
    readyState: number;
    networkState: number;
    duration: number;
    currentTime: number;
    videoWidth: number;
    videoHeight: number;
    errorCode: number | null;
    errorMessage: string | null;
    lastEvent: string;
  }>({
    currentSrc: '',
    readyState: 0,
    networkState: 0,
    duration: 0,
    currentTime: 0,
    videoWidth: 0,
    videoHeight: 0,
    errorCode: null,
    errorMessage: null,
    lastEvent: 'none',
  });

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
  const [activeCaptionIndex, setActiveCaptionIndex] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Caption edit state inside modal
  const [editingCaptions, setEditingCaptions] = useState(false);
  const [editableHashtags, setEditableHashtags] = useState('');
  const [editableCaptionSample, setEditableCaptionSample] = useState('');

  const getReadyStateText = (state: number) => {
    switch (state) {
      case 0: return '0 (HAVE_NOTHING)';
      case 1: return '1 (HAVE_METADATA)';
      case 2: return '2 (HAVE_CURRENT_DATA)';
      case 3: return '3 (HAVE_FUTURE_DATA)';
      case 4: return '4 (HAVE_ENOUGH_DATA)';
      default: return `${state}`;
    }
  };

  const getNetworkStateText = (state: number) => {
    switch (state) {
      case 0: return '0 (NETWORK_EMPTY)';
      case 1: return '1 (NETWORK_IDLE)';
      case 2: return '2 (NETWORK_LOADING)';
      case 3: return '3 (NETWORK_NO_SOURCE)';
      default: return `${state}`;
    }
  };

  const getMediaErrorMessage = (code: number) => {
    switch (code) {
      case 1: return 'MEDIA_ERR_ABORTED: Fetching process aborted by user.';
      case 2: return 'MEDIA_ERR_NETWORK: Network error occurred while fetching media.';
      case 3: return 'MEDIA_ERR_DECODE: Decoding error or corrupted media file.';
      case 4: return 'MEDIA_ERR_SRC_NOT_SUPPORTED: Video format or MIME type not supported.';
      default: return `Media error code ${code}`;
    }
  };

  const updateDiagnostics = (video: HTMLVideoElement, eventName: string) => {
    const err = video.error;
    setDiagState({
      currentSrc: video.currentSrc || video.src || '',
      readyState: video.readyState,
      networkState: video.networkState,
      duration: video.duration || 0,
      currentTime: video.currentTime || 0,
      videoWidth: video.videoWidth || 0,
      videoHeight: video.videoHeight || 0,
      errorCode: err ? err.code : null,
      errorMessage: err ? (err.message || getMediaErrorMessage(err.code)) : null,
      lastEvent: eventName,
    });
  };

  const filteredClips = useMemo(() => {
    return clips.filter((clip) => {
      if (filterStatus === 'all') return true;
      return clip.status === filterStatus;
    });
  }, [clips, filterStatus]);

  const openPreview = (clip: Clip) => {
    setSelectedClipForPreview(clip);
    setIsPlaying(false);
    setActiveCaptionIndex(0);
    setEditingCaptions(false);
    setEditableHashtags((clip.hashtags || []).join(' '));
    setEditableCaptionSample((clip.captionsSample || []).join('\n'));
    setVideoPlaybackError(null);
    setDiagState({
      currentSrc: clip.videoUrl || '',
      readyState: 0,
      networkState: 0,
      duration: 0,
      currentTime: 0,
      videoWidth: 0,
      videoHeight: 0,
      errorCode: null,
      errorMessage: null,
      lastEvent: 'previewOpened',
    });
  };

  const toggleModalPlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (v.paused) {
        await v.play();
      } else {
        v.pause();
      }
    } catch (err) {
      console.error('Play failed:', err);
    }
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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Rendered 9:16 Vertical Clips
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Synchronized short-form MP4 videos with burned subtitles, normalized audio, and 9:16 reframing
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-md transition-colors cursor-pointer"
            title="Refresh clips from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => navigate('candidates')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-md transition-colors cursor-pointer"
          >
            <span>View Candidate Moments</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start overflow-x-auto no-scrollbar max-w-full">
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
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{st}</span>
              <span className="font-mono text-[10px] tabular-nums text-slate-400">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Clips Grid (Vertical 9:16 aspect ratio representation) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filteredClips.length === 0 ? (
          <div className="col-span-full bg-white border border-slate-200/80 rounded-xl p-12 text-center shadow-xs">
            <Film className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <h3 className="font-semibold text-sm text-slate-900">No vertical clips rendered yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Select candidate moments from your discovered sources and render them into 9:16 short-form videos.
            </p>
            <button
              onClick={() => navigate('candidates')}
              className="mt-4 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-md transition-colors"
            >
              Go to Candidate Moments
            </button>
          </div>
        ) : (
          filteredClips.map((clip) => (
            <div
              key={clip.id}
              className="bg-white border border-slate-200/80 rounded-xl overflow-hidden hover:border-slate-300 transition-colors shadow-xs flex flex-col group"
            >
              {/* 9:16 Vertical Preview Frame */}
              <div
                onClick={() => openPreview(clip)}
                className="relative aspect-9/16 bg-slate-950 cursor-pointer overflow-hidden flex flex-col justify-between p-3.5 text-white select-none"
              >
                {/* Video / Poster preview */}
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
                ) : clip.thumbnailUrl ? (
                  <img
                    src={clip.thumbnailUrl}
                    alt={clip.title}
                    className="absolute inset-0 w-full h-full object-cover opacity-80"
                  />
                ) : (
                  <div className="absolute inset-0 bg-linear-to-b from-slate-900 via-neutral-900 to-black opacity-90" />
                )}

                {/* Dark gradient overlay for text legibility */}
                <div className="absolute inset-0 bg-linear-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />

                {/* Top Overlay: Brand & Duration */}
                <div className="relative z-10 flex items-center justify-between text-[10px]">
                  <span className="font-semibold tracking-wide text-slate-200 truncate max-w-[120px]">
                    {workspace.brandName || workspace.workspaceName}
                  </span>
                  <span className="font-mono tabular-nums bg-black/70 px-1.5 py-0.5 rounded text-slate-200">
                    {clip.duration}
                  </span>
                </div>

                {/* Center: Play hover button */}
                <div className="relative z-10 flex items-center justify-center my-auto pointer-events-none">
                  <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-xs flex items-center justify-center group-hover:scale-110 group-hover:bg-black/60 transition-all border border-white/20">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>

                {/* Bottom Overlay: Kinetic Hook & Subtitle Preview */}
                <div className="relative z-10 space-y-1.5">
                  <div className="bg-black/75 backdrop-blur-xs p-2 rounded border border-white/10 text-[11px] font-bold text-center leading-tight">
                    <span className="text-amber-300">"{clip.title}"</span>
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-slate-300 font-mono">
                    <span className="truncate max-w-[130px]">{clip.channelTitle}</span>
                    <span className="capitalize">{clip.status}</span>
                  </div>
                </div>

                {/* If Rendering: Progress Bar */}
                {clip.status === 'rendering' && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/90 p-2.5 z-20 space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-blue-300">
                      <span>Rendering 9:16</span>
                      <span>{clip.progress || 50}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full transition-all duration-300 animate-pulse"
                        style={{ width: `${clip.progress || 50}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Card Meta & Actions Below */}
              <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 line-clamp-2 leading-snug">
                    {clip.title}
                  </h3>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="font-mono tabular-nums">{clip.duration}</span>
                    <span>·</span>
                    <span className="font-mono tabular-nums text-slate-400">{clip.aspectRatio}</span>
                    <span>·</span>
                    <span className="capitalize text-slate-700">{clip.status}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
                  <button
                    onClick={() => openPreview(clip)}
                    className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 transition-colors"
                    title="Preview and edit captions"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {clip.videoUrl && (
                    <a
                      href={clip.videoUrl}
                      download={`${clip.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`}
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 transition-colors"
                      title="Download 9:16 MP4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}

                  <button
                    onClick={() => deleteClip(clip.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                    title="Delete clip"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => addClipToQueue(clip.id)}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium text-xs transition-colors flex items-center gap-1 shadow-xs ml-auto"
                  >
                    <Send className="w-3 h-3" />
                    <span>To Queue</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Interactive Clip Preview & Caption Editor Modal */}
      {selectedClipForPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-y-auto md:overflow-hidden animate-in fade-in duration-150 grid grid-cols-1 md:grid-cols-12 max-h-[92vh]">
            {/* Left: 9:16 Video Player */}
            <div className="md:col-span-6 bg-slate-950 flex flex-col justify-between p-4 relative min-h-[300px] sm:min-h-[360px] md:min-h-[480px] select-none">
              {videoPlaybackError ? (
                <div className="my-auto p-4 text-center bg-rose-950/90 border border-rose-800 text-rose-200 rounded-lg space-y-2 z-10">
                  <p className="font-bold text-sm text-rose-100">Video playback failed</p>
                  <p className="text-[11px] font-mono text-rose-300 break-all">
                    {videoPlaybackError}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono break-all pt-1">
                    Media URL: {selectedClipForPreview.videoUrl || 'None'}
                  </p>
                </div>
              ) : selectedClipForPreview.videoUrl ? (
                <div className="clip-video-stage w-full h-full my-auto py-2 z-10 flex flex-col items-center justify-center gap-2">
                  
                  {/* Aspect-locked video container */}
                  <div className="relative aspect-9/16 max-h-[70vh] w-auto bg-black rounded-lg overflow-hidden shadow-xl border border-slate-800 flex items-center justify-center">
                    <video
                      ref={videoRef}
                      key={selectedClipForPreview.id}
                      src={selectedClipForPreview.videoUrl}
                      playsInline
                      preload="auto"
                      controls
                      muted={isMuted}
                      className="w-full h-full object-contain block relative z-10"
                      onPlay={() => setIsPlaying(true)}
                      onPlaying={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      onTimeUpdate={(e) => {
                        setCurrentTime(e.currentTarget.currentTime);
                        updateDiagnostics(e.currentTarget, 'timeupdate');
                      }}
                      onDurationChange={(e) => {
                        setDuration(e.currentTarget.duration);
                        updateDiagnostics(e.currentTarget, 'durationchange');
                      }}
                      onLoadedMetadata={(e) => {
                        setDuration(e.currentTarget.duration || 0);
                        updateDiagnostics(e.currentTarget, 'loadedmetadata');
                      }}
                      onCanPlay={(e) => {
                        updateDiagnostics(e.currentTarget, 'canplay');
                      }}
                      onError={(e) => {
                        const v = e.currentTarget;
                        const mediaErr = v.error;
                        const msg = mediaErr
                          ? `Code ${mediaErr.code}: ${mediaErr.message || getMediaErrorMessage(mediaErr.code)}`
                          : 'Failed to stream or decode video media file.';
                        setVideoPlaybackError(msg);
                        updateDiagnostics(v, 'error');
                      }}
                    />
                  </div>

                  {/* Playback info */}
                  <div className="w-full px-2 text-center text-[10px] font-mono text-slate-400">
                    <span>{Math.floor(currentTime)}s / {Math.floor(duration || 0)}s</span>
                  </div>
                </div>
              ) : (
                <div className="my-auto p-4 text-center bg-amber-950/90 border border-amber-800 text-amber-200 rounded-lg space-y-2 z-10">
                  <p className="font-bold text-sm text-amber-100">No Video Stream Associated</p>
                  <p className="text-[11px] text-amber-300">
                    This clip record does not contain an MP4 output URL.
                  </p>
                </div>
              )}

              {/* Bottom Player Controls */}
              <div className="space-y-2 z-10 pt-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>9:16 Vertical HD</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const v = videoRef.current;
                        if (v) {
                          v.muted = !isMuted;
                          setIsMuted(!isMuted);
                        }
                      }}
                      className="text-slate-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors flex items-center gap-1"
                    >
                      {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                      <span>{isMuted ? 'Muted' : 'Sound'}</span>
                    </button>
                    {selectedClipForPreview.videoUrl && (
                      <a
                        href={selectedClipForPreview.videoUrl}
                        download={`${selectedClipForPreview.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`}
                        className="text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>MP4</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Clip Details & Caption/Hashtag Inspector */}
            <div className="md:col-span-6 p-4 sm:p-5 flex flex-col justify-between bg-white text-xs overflow-y-visible md:overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-semibold text-sm text-slate-900">
                      Clip Details
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      9:16 Vertical Video Short
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedClipForPreview(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
                    aria-label="Close preview modal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Clip Title
                  </label>
                  <p className="font-semibold text-slate-900 text-xs sm:text-sm">
                    {selectedClipForPreview.title}
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Original Source
                  </label>
                  <p className="text-slate-600 text-[11px]">
                    {selectedClipForPreview.sourceTitle}
                  </p>
                </div>

                {/* Caption Samples Section */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      Caption Script
                    </label>
                    <button
                      onClick={() => setEditingCaptions(!editingCaptions)}
                      className="text-blue-600 hover:text-blue-700 text-[11px] font-medium"
                    >
                      {editingCaptions ? 'Done Editing' : 'Edit Script'}
                    </button>
                  </div>

                  {editingCaptions ? (
                    <textarea
                      rows={4}
                      value={editableCaptionSample}
                      onChange={(e) => setEditableCaptionSample(e.target.value)}
                      className="w-full p-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  ) : (
                    <div className="p-2.5 bg-slate-50 rounded border border-slate-200/80 space-y-1 text-slate-700 text-[11px]">
                      {(selectedClipForPreview.captionsSample || []).map((line: string, idx: number) => (
                        <div key={idx} className="leading-snug">
                          • {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hashtags */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    Generated Hashtags
                  </label>
                  {editingCaptions ? (
                    <input
                      type="text"
                      value={editableHashtags}
                      onChange={(e) => setEditableHashtags(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(selectedClipForPreview.hashtags || []).map((tag: string) => (
                        <span
                          key={tag}
                          className="font-mono text-[11px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2 mt-4">
                {editingCaptions ? (
                  <button
                    onClick={handleSaveCaptions}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded text-xs transition-colors"
                  >
                    Save Changes
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        deleteClip(selectedClipForPreview.id);
                        setSelectedClipForPreview(null);
                      }}
                      className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded font-medium text-xs transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => {
                        addClipToQueue(selectedClipForPreview.id);
                        setSelectedClipForPreview(null);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded text-xs transition-colors flex items-center gap-1.5 shadow-xs"
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
