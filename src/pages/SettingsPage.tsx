import React, { useState } from 'react';
import {
  Save,
  RotateCcw,
  Plus,
  X,
  Database,
  ShieldCheck,
  Radio,
  RefreshCw,
  Check,
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* Header */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Workspace Settings
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure niche targeting, visual templates, and AI moment detection thresholds.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('onboarding')}
            className="px-3 py-1.5 text-xs text-slate-300 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Run Setup Wizard
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-6 py-6 flex-1">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Workspace & Brand */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-800/80 pb-3">
              <h2 className="font-semibold text-sm text-white">
                Workspace & Brand Identity
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Brand attributes used for watermark overlays and export manifests.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Brand / Channel Display Name
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Apex Daily"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-hidden focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Niche & Discovery Topics */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-800/80 pb-3">
              <h2 className="font-semibold text-sm text-white">
                Niche & Subtopic Targeting
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Drives YouTube RSS search queries and moment relevance analysis.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Main Niche
                </label>
                <input
                  type="text"
                  required
                  value={mainNiche}
                  onChange={(e) => setMainNiche(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Subtopics
                </label>
                <div className="flex gap-2 mb-2.5">
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
                    placeholder="Type subtopic and press Enter..."
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-hidden focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddTopic}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {subtopics.map((topic) => (
                    <span
                      key={topic}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-slate-200 text-xs font-medium"
                    >
                      <span>{topic}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTopic(topic)}
                        className="text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Language & Style */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-800/80 pb-3">
              <h2 className="font-semibold text-sm text-white">
                Language & Format Specifications
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Content Language
                </label>
                <select
                  value={contentLanguage}
                  onChange={(e) => setContentLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-hidden focus:border-blue-500 cursor-pointer"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Output Format
                </label>
                <input
                  type="text"
                  disabled
                  value="9:16 Vertical Short-Form (1080 × 1920 MP4)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-950 text-slate-400 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Caption Style Template
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {STYLES.map((st) => {
                  const isSelected = contentStyle === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setContentStyle(st.id)}
                      className={`p-3 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-blue-500 bg-slate-950 text-white'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-semibold text-white flex items-center justify-between">
                        <span>{st.title}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        {st.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 4: Database Status */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <h2 className="font-semibold text-sm text-white">
                  Database & Storage Provider
                </h2>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Supabase Connected
              </span>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs space-y-1">
              <span className="text-[11px] text-slate-500 block">Workspace Scope ID</span>
              <span className="font-mono text-slate-200 select-all">
                {currentWorkspaceId || 'a0000000-0000-4000-a000-000000000001'}
              </span>
            </div>
          </div>

          {/* Footer Save */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={resetToDemo}
              className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Reset Workspace
            </button>

            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-sm shadow-blue-500/20"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Settings</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
