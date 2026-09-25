import React from 'react';
import { X, ExternalLink, Sparkles, Play, Clock, Eye, Trash2 } from 'lucide-react';
import { SourceVideo, ClipCandidate } from '../../types';

interface VideoDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  video: SourceVideo | null;
  candidates?: ClipCandidate[];
  onAnalyze?: (sourceId: string) => void;
  onDelete?: (sourceId: string) => void;
  onGenerateClip?: (candidateId: string) => void;
}

export const VideoDetailDrawer: React.FC<VideoDetailDrawerProps> = ({
  isOpen,
  onClose,
  video,
  candidates = [],
  onAnalyze,
  onDelete,
  onGenerateClip,
}) => {
  if (!isOpen || !video) return null;

  const relatedCandidates = candidates.filter((c) => c.sourceVideoId === video.id);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Video Details</span>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Thumbnail & Key Meta */}
          <div className="space-y-3">
            <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-900 group">
              {video.youtubeUrl ? (
                <iframe
                  src={`https://www.youtube.com/embed/${video.youtubeUrl.split('v=')[1]?.split('&')[0]}?autoplay=0`}
                  title={video.title}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                  No preview available
                </div>
              )}
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900 leading-snug">{video.title}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{video.channelTitle}</span>
                <span aria-hidden="true">·</span>
                <span>{video.duration}</span>
                <span aria-hidden="true">·</span>
                <span>Published {video.publishedAt}</span>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            {onAnalyze && video.status !== 'analyzed' && (
              <button
                onClick={() => onAnalyze(video.id)}
                className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Analyze moments</span>
              </button>
            )}

            {video.youtubeUrl && (
              <a
                href={video.youtubeUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>YouTube</span>
              </a>
            )}

            {onDelete && (
              <button
                onClick={() => onDelete(video.id)}
                className="py-2 px-3 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>

          {/* Detailed Summary */}
          {video.summary && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-slate-900">Summary</h3>
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                {video.summary}
              </p>
            </div>
          )}

          {/* Associated Moments */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">Detected Moments ({relatedCandidates.length})</h3>
            </div>

            {relatedCandidates.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center bg-slate-50 rounded-lg">
                No moments analyzed yet. Click "Analyze moments" above.
              </p>
            ) : (
              <div className="space-y-2.5">
                {relatedCandidates.map((cand) => (
                  <div key={cand.id} className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-mono text-slate-500">{cand.startTime} - {cand.endTime}</span>
                        <h4 className="text-xs font-semibold text-slate-900 leading-snug mt-0.5">"{cand.hook}"</h4>
                      </div>
                      <span className="font-mono text-xs font-bold text-blue-600 shrink-0 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                        {cand.score}
                      </span>
                    </div>

                    {onGenerateClip && (
                      <button
                        onClick={() => onGenerateClip(cand.id)}
                        className="w-full py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 rounded text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        <span>Generate clip</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
