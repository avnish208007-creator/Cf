import React, { useState } from 'react';
import { Sparkles, Trash2, CheckCircle2, Play, ChevronRight, X, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ClipCandidate } from '../types';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export const CandidatesPage: React.FC = () => {
  const {
    candidates,
    isFetchingCandidates,
    generateClipFromCandidate,
    rejectCandidate,
    deleteCandidate,
    batchApproveAndRenderClips,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'all' | 'approved' | 'in_review'>('all');
  const [selectedCandidate, setSelectedCandidate] = useState<ClipCandidate | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const filteredCandidates = candidates.filter((c) => {
    if (c.status === 'rejected') return false;
    if (activeTab === 'approved') return c.status === 'approved';
    if (activeTab === 'in_review') return c.status === 'new' || c.status === 'in_review';
    return true;
  });

  const handleConfirmDelete = async () => {
    if (deleteTargetId) {
      await deleteCandidate(deleteTargetId);
      setDeleteTargetId(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Candidates
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Review moments found in your videos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => batchApproveAndRenderClips()}
          disabled={filteredCandidates.length === 0}
          className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Generate clips</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200/60 w-fit">
        {(['all', 'in_review', 'approved'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
              activeTab === tab
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab === 'in_review' ? 'In Review' : tab}
          </button>
        ))}
      </div>

      {/* Candidate List */}
      {filteredCandidates.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No candidates yet"
          description="Analyze a discovered video to find potential moments."
        />
      ) : (
        <div className="space-y-3">
          {filteredCandidates.map((cand) => (
            <div
              key={cand.id}
              className="p-4 bg-white border border-slate-200/80 rounded-xl hover:border-slate-300 transition-all shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              {/* Left: Hook & Video Info */}
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700 truncate">{cand.channelTitle}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-500 tabular-nums">{cand.startTime} - {cand.endTime} ({cand.duration})</span>
                </div>

                <h3
                  onClick={() => setSelectedCandidate(cand)}
                  className="text-sm font-semibold text-slate-900 leading-snug hover:text-blue-600 transition-colors cursor-pointer"
                >
                  "{cand.hook}"
                </h3>
              </div>

              {/* Right: Score & Actions */}
              <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                <div className="text-right pr-2 border-r border-slate-100">
                  <div className="font-mono text-sm font-bold text-blue-600 tabular-nums">
                    {cand.score}
                  </div>
                  <div className="text-[10px] text-slate-400">Score</div>
                </div>

                <button
                  type="button"
                  onClick={() => generateClipFromCandidate(cand.id)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate clip</span>
                </button>

                <button
                  type="button"
                  onClick={() => rejectCandidate(cand.id)}
                  className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  Reject
                </button>

                <button
                  type="button"
                  onClick={() => setDeleteTargetId(cand.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50"
                  title="Delete candidate"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Candidate Detail Drawer */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col p-6 space-y-6 animate-in slide-in-from-right duration-200 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Candidate Moment</span>
              <button onClick={() => setSelectedCandidate(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-mono text-slate-500">{selectedCandidate.startTime} - {selectedCandidate.endTime} ({selectedCandidate.duration})</span>
              <h2 className="text-base font-semibold text-slate-900 leading-snug">"{selectedCandidate.hook}"</h2>
              <p className="text-xs text-slate-500">{selectedCandidate.channelTitle}</p>
            </div>

            {(selectedCandidate.transcriptText || selectedCandidate.summary) && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-slate-900">Transcript Segment</h3>
                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                  "{selectedCandidate.transcriptText || selectedCandidate.summary}"
                </p>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-900">Analysis Signals</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-400 block">Overall Score</span>
                  <span className="font-mono text-sm font-bold text-blue-600">{selectedCandidate.score} / 100</span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-400 block">Viral Potential</span>
                  <span className="font-mono text-sm font-bold text-slate-800">{selectedCandidate.score >= 85 ? 'High' : 'Moderate'}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  generateClipFromCandidate(selectedCandidate.id);
                  setSelectedCandidate(null);
                }}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate clip</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetId)}
        title="Delete candidate?"
        description="This moment will be permanently removed from your candidate list."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
};
