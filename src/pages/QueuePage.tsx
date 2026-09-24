import React, { useState } from 'react';
import {
  Send,
  CheckCircle2,
  Clock,
  Copy,
  Calendar,
  Trash2,
  Edit3,
  Download,
  Share2,
  Film,
  Plus,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { QueueItem } from '../types';

export const QueuePage: React.FC = () => {
  const {
    queue,
    approveQueueItem,
    updateQueueItem,
    removeFromQueue,
    navigate,
    workspace,
    showToast,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_review' | 'approved' | 'scheduled'>('all');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editSlot, setEditSlot] = useState('');

  const filteredQueue = queue.filter((item) => {
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  const handleCopyBundle = (item: QueueItem) => {
    const fullText = `${item.captionText || ''}\n\n${(item.hashtags || []).join(' ')}`;
    navigator.clipboard.writeText(fullText);
    showToast('Caption and hashtags copied to clipboard', 'success');
  };

  const handleExportJson = (item: QueueItem) => {
    const bundle = {
      clipId: item.clipId,
      title: item.title,
      hook: item.hook,
      duration: item.duration,
      aspectRatio: '9:16',
      targetPlatforms: item.platforms,
      caption: item.captionText,
      hashtags: item.hashtags,
      scheduledSlot: item.scheduledSlot || 'Immediate',
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clipflow_${(item.title || 'clip').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Production manifest exported as JSON', 'info');
  };

  const startEdit = (item: QueueItem) => {
    setEditingItemId(item.id);
    setEditCaption(item.captionText || '');
    setEditSlot(item.scheduledSlot || 'Tomorrow, 10:00 AM');
  };

  const saveEdit = (itemId: string) => {
    updateQueueItem(itemId, {
      captionText: editCaption,
      scheduledSlot: editSlot,
    });
    setEditingItemId(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Publishing Queue
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Final review gate for generated vertical shorts before distribution to connected channels
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('clips')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-md transition-colors"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Select More Clips</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start overflow-x-auto no-scrollbar max-w-full">
        {(['all', 'needs_review', 'approved', 'scheduled'] as const).map((st) => {
          const count =
            st === 'all'
              ? queue.length
              : queue.filter((q) => q.status === st).length;
          const isActive = statusFilter === st;

          return (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{st.replace('_', ' ')}</span>
              <span className="font-mono text-[10px] tabular-nums text-slate-400">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Queue List */}
      <div className="space-y-4">
        {filteredQueue.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-xl p-8 sm:p-12 text-center shadow-xs">
            <Send className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <h3 className="font-semibold text-sm text-slate-900">No clips in the queue</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Generated vertical clips moved to the queue will appear here for editorial sign-off.
            </p>
            <button
              onClick={() => navigate('clips')}
              className="mt-4 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-md transition-colors"
            >
              Browse Clips
            </button>
          </div>
        ) : (
          filteredQueue.map((item, index) => {
            const isEditing = editingItemId === item.id;

            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 hover:border-slate-300 transition-colors shadow-xs space-y-4"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded bg-slate-100 text-slate-700 font-mono text-xs font-semibold flex items-center justify-center shrink-0">
                      #{index + 1}
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-sm text-slate-900 truncate">
                        {item.title}
                      </h2>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap mt-0.5">
                        <span className="font-mono tabular-nums">{item.duration}</span>
                        <span>·</span>
                        <span className="font-mono text-slate-600">9:16 Vertical</span>
                        <span>·</span>
                        <span>Added {item.addedAt}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status & Platforms */}
                  <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span>Destinations:</span>
                      <strong className="text-slate-800 font-medium">
                        {(item.platforms || []).join(', ')}
                      </strong>
                    </div>

                    <span className="text-slate-300">|</span>

                    <span
                      className={`text-xs font-medium capitalize ${
                        item.status === 'approved'
                          ? 'text-emerald-700 font-semibold'
                          : 'text-amber-700'
                      }`}
                    >
                      {(item.status || '').replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Caption & Hashtag Body */}
                {isEditing ? (
                  <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Caption Copy
                      </label>
                      <textarea
                        rows={4}
                        value={editCaption}
                        onChange={(e) => setEditCaption(e.target.value)}
                        className="w-full p-2.5 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Publish Slot
                      </label>
                      <input
                        type="text"
                        value={editSlot}
                        onChange={(e) => setEditSlot(e.target.value)}
                        className="w-full p-2 text-xs rounded border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setEditingItemId(null)}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(item.id)}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded"
                      >
                        Save Copy
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                      {item.captionText}
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(item.hashtags || []).map((h: string) => (
                        <span
                          key={h}
                          className="font-mono text-[11px] text-blue-600 bg-blue-50/80 px-2 py-0.5 rounded"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer Controls */}
                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs border-t border-slate-100">
                  <div className="flex items-center gap-3 flex-wrap">
                    {item.scheduledSlot ? (
                      <span className="flex items-center gap-1.5 text-slate-600 font-mono text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Slot: {item.scheduledSlot}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">No slot assigned</span>
                    )}

                    <button
                      onClick={() => startEdit(item)}
                      className="text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit Copy</span>
                    </button>

                    <button
                      onClick={() => handleCopyBundle(item)}
                      className="text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy All</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => handleExportJson(item)}
                      className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors flex items-center gap-1"
                      title="Export metadata manifest"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Pack</span>
                    </button>

                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                      title="Remove from queue"
                      aria-label="Remove item from queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {item.status !== 'approved' && (
                      <button
                        onClick={() => approveQueueItem(item.id)}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
