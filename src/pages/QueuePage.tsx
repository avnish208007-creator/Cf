import React, { useState } from 'react';
import { Send, CheckCircle2, Trash2, Clock, Calendar, ExternalLink } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { QueueItem } from '../types';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export const QueuePage: React.FC = () => {
  const { queue, approveQueueItem, removeFromQueue, navigate } = useApp();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleConfirmRemove = async () => {
    if (deleteTargetId) {
      await removeFromQueue(deleteTargetId);
      setDeleteTargetId(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Queue
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Clips waiting to be published.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('clips')}
          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <span>Add clips from library</span>
        </button>
      </div>

      {/* Queue Items List */}
      {queue.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No clips in queue"
          description="Add clips from your library to schedule and publish."
          actionLabel="View Clips"
          onAction={() => navigate('clips')}
        />
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs divide-y divide-slate-100">
          {queue.map((item) => (
            <div
              key={item.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className={`capitalize font-medium ${item.status === 'approved' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {item.status === 'approved' ? 'Approved' : 'Needs Review'}
                  </span>
                  {item.scheduledSlot && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[11px] text-slate-500">{item.scheduledSlot}</span>
                    </>
                  )}
                </div>

                <h3 className="text-sm font-semibold text-slate-900 leading-snug truncate">
                  {item.title}
                </h3>

                {item.captionText && (
                  <p className="text-xs text-slate-500 line-clamp-1">
                    {item.captionText}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {item.status !== 'approved' && (
                  <button
                    type="button"
                    onClick={() => approveQueueItem(item.id)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDeleteTargetId(item.id)}
                  className="px-3 py-1.5 text-slate-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetId)}
        title="Remove from queue?"
        description="This will remove the clip from your publishing queue."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmRemove}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
};
