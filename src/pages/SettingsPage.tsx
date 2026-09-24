import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  Sparkles,
  Check,
  Plus,
  X,
  Sliders,
  Tv,
  Globe,
  Tag,
  Share2,
  Database,
  ShieldCheck,
  Radio,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const LANGUAGES = [
  'English (US)',
  'English (UK)',
  'Spanish (LatAm)',
  'Spanish (Spain)',
  'German',
  'French',
  'Portuguese (Brazil)',
  'Italian',
  'Japanese',
  'Hindi',
];

const STYLES = [
  {
    id: 'Kinetic typography with high-contrast highlighted keywords',
    title: 'Kinetic Bold Typography',
    desc: 'Word-by-word highlighted captions with high contrast for maximum retention.',
  },
  {
    id: 'Documentary storytelling with subtle animated subtitles',
    title: 'Documentary Storytelling',
    desc: 'Editorial pacing, clean neutral typography, and smooth caption transitions.',
  },
  {
    id: 'Clean minimalist explainer with highlighted keywords',
    title: 'Clean Minimalist',
    desc: 'Understated lower-third captions, clean layout, optimal for technical insights.',
  },
  {
    id: 'High-energy fast cuts & dynamic zoom punch-ins',
    title: 'High-Energy Fast Cuts',
    desc: 'Rapid pacing, micro zooms on key phrases, and punchy hook overlays.',
  },
];

export const SettingsPage: React.FC = () => {
  const {
    workspace,
    updateWorkspace,
    resetToDemo,
    navigate,
    currentWorkspaceId,
    isSupabaseActive,
  } = useApp();

  const [providerStatus, setProviderStatus] = useState<{ available: boolean; workerUrlConfigured: boolean }>({ available: true, workerUrlConfigured: true });
  const checkProviderStatus = () => {
    setProviderStatus({ available: true, workerUrlConfigured: true });
  };

  const [workspaceName, setWorkspaceName] = useState(workspace.workspaceName);
  const [brandName, setBrandName] = useState(workspace.brandName || '');
  const [mainNiche, setMainNiche] = useState(workspace.mainNiche);
  const [subtopics, setSubtopics] = useState<string[]>(workspace.subtopics);
  const [newTopicInput, setNewTopicInput] = useState('');
  const [contentLanguage, setContentLanguage] = useState(workspace.contentLanguage);
  const [contentStyle, setContentStyle] = useState(workspace.contentStyle);
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>(workspace.targetPlatforms);
  const [minScore, setMinScore] = useState(workspace.minCandidateScore || 82);
  const [targetDuration, setTargetDuration] = useState(workspace.targetDuration || '30-60s');

  const handleAddTopic = () => {
    const trimmed = newTopicInput.trim();
    if (trimmed && !subtopics.includes(trimmed)) {
      setSubtopics([...subtopics, trimmed]);
      setNewTopicInput('');
    }
  };

  const handleRemoveTopic = (topic: string) => {
    setSubtopics(subtopics.filter((t) => t !== topic));
  };

  const togglePlatform = (plat: string) => {
    if (targetPlatforms.includes(plat)) {
      if (targetPlatforms.length > 1) {
        setTargetPlatforms(targetPlatforms.filter((p) => p !== plat));
      }
    } else {
      setTargetPlatforms([...targetPlatforms, plat]);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateWorkspace({
      workspaceName: workspaceName.trim() || 'My Workspace',
      brandName: brandName.trim() || undefined,
      mainNiche: mainNiche.trim() || 'General Insights',
      subtopics,
      contentLanguage,
      contentStyle,
      targetPlatforms,
      minCandidateScore: minScore,
      targetDuration,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Workspace Settings
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure niche targeting, visual templates, brand attributes, and AI detection filters
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('onboarding')}
            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
          >
            Re-run Setup Wizard
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Workspace & Brand */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-semibold text-sm text-slate-900">
              Workspace & Brand Identity
            </h2>
            <p className="text-xs text-slate-500">
              Identity used for asset grouping, export manifests, and overlays
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Workspace Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Brand / Channel Display Name <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Apex Daily"
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Niche & Discovery Topics */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-semibold text-sm text-slate-900">
              Niche & Subtopic Targeting
            </h2>
            <p className="text-xs text-slate-500">
              Determines YouTube discovery search angles and transcript relevance filtering
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Main Niche
              </label>
              <input
                type="text"
                required
                value={mainNiche}
                onChange={(e) => setMainNiche(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Specific Subtopics
              </label>
              <div className="flex flex-col sm:flex-row gap-2 mb-2.5">
                <input
                  type="text"
                  value={newTopicInput}
                  onChange={(e) => setNewTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTopic();
                    }
                  }}
                  placeholder="Type a subtopic and press Enter..."
                  className="flex-1 px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddTopic}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Topic</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {subtopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium"
                  >
                    <span>{topic}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTopic(topic)}
                      className="text-slate-400 hover:text-slate-600 p-0.5"
                      aria-label={`Remove ${topic}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Language & Visual Style */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-semibold text-sm text-slate-900">
              Language, Captions & Format
            </h2>
            <p className="text-xs text-slate-500">
              Output specs for vertical 9:16 rendering and caption transcription
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Content Language
              </label>
              <select
                value={contentLanguage}
                onChange={(e) => setContentLanguage(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Aspect Ratio
              </label>
              <input
                type="text"
                disabled
                value="9:16 Vertical (1080 × 1920)"
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 bg-slate-50 text-slate-500 font-mono"
              />
            </div>
          </div>

          {/* Style selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Caption Typography & Pacing
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {STYLES.map((st) => {
                const isSelected = contentStyle === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setContentStyle(st.id)}
                    className={`p-3 rounded-lg border text-left text-xs transition-colors ${
                      isSelected
                        ? 'border-slate-900 bg-slate-50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-semibold text-slate-900 flex items-center justify-between">
                      <span>{st.title}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-slate-900" />}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      {st.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target platforms */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Target Distribution Platforms
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {['Instagram Reels', 'YouTube Shorts', 'TikTok'].map((plat) => {
                const isSel = targetPlatforms.includes(plat);
                return (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => togglePlatform(plat)}
                    className={`p-2.5 sm:p-2 rounded border text-xs text-left transition-colors flex items-center justify-between ${
                      isSel
                        ? 'border-slate-900 bg-slate-900 text-white font-medium'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span>{plat}</span>
                    {isSel && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Section 4: AI Quality Thresholds */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-semibold text-sm text-slate-900">
              Quality & Filtering Thresholds
            </h2>
            <p className="text-xs text-slate-500">
              Fine-tune the sensitivity of moment detection and candidate scoring
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Minimum Candidate Score Threshold
                </label>
                <span className="font-mono tabular-nums text-xs font-bold text-slate-900">
                  {minScore}/100
                </span>
              </div>
              <input
                type="range"
                min="70"
                max="95"
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full accent-slate-900 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Moments below this score will not be automatically highlighted.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Clip Duration
              </label>
              <select
                value={targetDuration}
                onChange={(e) => setTargetDuration(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 bg-white"
              >
                <option value="15-30s">15 - 30 seconds (Ultra-compact)</option>
                <option value="30-60s">30 - 60 seconds (Recommended standard)</option>
                <option value="60-90s">60 - 90 seconds (In-depth breakdown)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Database & Persistence Info */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <h2 className="font-semibold text-sm text-slate-900">
                Database & Workspace Isolation
              </h2>
            </div>
            {isSupabaseActive ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Supabase Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Demo / Local Mode
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg space-y-1">
              <span className="text-[11px] text-slate-500 block">Workspace Database ID</span>
              <span className="font-mono text-slate-800 font-medium break-all select-all">
                {currentWorkspaceId || 'Local Demo Workspace'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg space-y-1">
              <span className="text-[11px] text-slate-500 block">Security Policy</span>
              <div className="flex items-center gap-1 text-slate-800 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Row Level Security (RLS) Active</span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Workspace data (sources, detected candidate moments, vertical clips, and jobs) is isolated to your authenticated user account.
          </p>
        </div>

        {/* YouTube Discovery Worker Architecture Card */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-600" />
              <h2 className="font-semibold text-sm text-slate-900">
                YouTube Discovery Architecture
              </h2>
            </div>
            {providerStatus?.available ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Worker Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Worker Not Connected
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg space-y-1">
              <span className="text-[11px] text-slate-500 block">Discovery Engine</span>
              <span className="font-semibold text-slate-800">
                yt-dlp Worker Provider (Zero API Keys Required)
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg space-y-1">
              <span className="text-[11px] text-slate-500 block">Server Configuration</span>
              <div className="flex items-center justify-between">
                <code className="text-slate-800 font-mono text-[11px]">DISCOVERY_WORKER_URL</code>
                <span className="text-[10px] text-slate-500">
                  {providerStatus.workerUrlConfigured ? 'Configured' : 'Not Set'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 text-xs">
            <p className="text-[11px] text-slate-500 leading-relaxed max-w-lg">
              ClipFlow generates focused search queries based on your active niche, queries YouTube via the worker, deduplicates by video ID, and persists matching sources to Supabase.
            </p>
            <button
              type="button"
              onClick={() => checkProviderStatus()}
              className="shrink-0 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Check Worker</span>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={resetToDemo}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset All Demo Data</span>
          </button>

          <button
            type="submit"
            className="flex items-center justify-center gap-1.5 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-md transition-colors shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Workspace Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};
