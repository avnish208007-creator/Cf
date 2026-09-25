import React, { useState } from 'react';
import {
  Send,
  CheckCircle2,
  Clock,
  Copy,
  Trash2,
  Edit3,
  Download,
  Film,
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
    showToast('Manifest exported as JSON', 'info');
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* Header */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-white">
                Publishing Queue
              </h1>
              <span className="text-xs font-mono font-medium text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                {queue.length} items
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Editorial sign-off and scheduling queue for rendered vertical shorts.
            </p>
          </div>

          <button
            onClick={() => navigate('clips')}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Select More Clips</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 space-y-5">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-900/80 rounded-xl border border-slate-800/80 self-start">
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
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer capitalize flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{st.replace('_', ' ')}</span>
                <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Queue List */}
        <div className="space-y-3">
          {filteredQueue.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
              <Send className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-200">No queue items found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                Rendered vertical clips added to the queue will appear here.
              </p>
              <button
                onClick={() => navigate('clips')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Browse Rendered Clips
              </button>
            </div>
          ) : (
            filteredQueue.map((item, index) => {
              const isEditing = editingItemId === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3 hover:border-slate-700 transition-colors"
                >
                  {/* Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-md bg-slate-800 text-slate-300 font-mono text-xs font-semibold flex items-center justify-center shrink-0">
                        #{index + 1}
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-sm text-slate-100 truncate">
                          {item.title}
                        </h2>
                        {/* Unboxed Metadata */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                          <span className="font-mono text-[11px]">{item.duration || '30s'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-300">9:16 Vertical</span>
                          <span aria-hidden="true">·</span>
                          <span>Added {item.addedAt || 'Recently'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-xs font-medium capitalize ${
                          item.status === 'approved'
                            ? 'text-emerald-400 font-semibold'
                            : 'text-amber-400'
                        }`}
                      >
                        {(item.status || '').replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Body Copy */}
                  {isEditing ? (
                    <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-slate-500">Caption Copy</label>
                        <textarea
                          rows={3}
                          value={editCaption}
                          onChange={(e) => setEditCaption(e.target.value)}
                          className="w-full p-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white mt-1"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-semibold text-slate-500">Publish Slot</label>
                        <input
                          type="text"
                          value={editSlot}
                          onChange={(e) => setEditSlot(e.target.value)}
                          className="w-full p-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white mt-1"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          onClick={() => setEditingItemId(null)}
                          className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveEdit(item.id)}
                          className="px-3 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800/80 leading-relaxed whitespace-pre-line">
                        {item.captionText}
                      </p>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(item.hashtags || []).map((h) => (
                          <span key={h} className="font-mono text-[11px] text-blue-400">
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="pt-2 flex items-center justify-between gap-3 text-xs border-t border-slate-800/80">
                    <div className="flex items-center gap-3">
                      {item.scheduledSlot ? (
                        <span className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>Slot: {item.scheduledSlot}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">No slot assigned</span>
                      )}

                      <button
                        onClick={() => startEdit(item)}
                        className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleCopyBundle(item)}
                        className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExportJson(item)}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Export Pack"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => removeFromQueue(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Remove from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {item.status !== 'approved' && (
                        <button
                          onClick={() => approveQueueItem(item.id)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
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
    </div>
  );
};
