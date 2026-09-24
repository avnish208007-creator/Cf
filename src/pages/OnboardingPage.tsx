import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { WorkspaceConfig } from '../types';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Globe,
  Sliders,
  Tv,
  Plus,
  X,
  Layers,
} from 'lucide-react';

const PRESET_NICHES = [
  {
    name: 'Tech & Engineering Innovations',
    subtopics: ['Autonomous AI Agents', 'Open-Source Models', 'Developer Tools', 'Robotics'],
    style: 'Kinetic typography with high-contrast highlighted keywords',
  },
  {
    name: 'Personal Finance & Investing',
    subtopics: ['Index Funds & ETFs', 'Real Estate Strategies', 'Tax Optimization', 'Macro Economy'],
    style: 'Clean minimalist explainer with highlighted numbers',
  },
  {
    name: 'B2B SaaS Growth & Marketing',
    subtopics: ['Product-Led Growth', 'Inbound Content Engine', 'Cold Outreach', 'Churn Reduction'],
    style: 'Fast-paced documentary narrative with kinetic captions',
  },
  {
    name: 'Fitness, Nutrition & Longevity',
    subtopics: ['Hypertrophy Science', 'Sleep Optimization', 'Zone 2 Cardio', 'Micronutrients'],
    style: 'High-energy split screen with emphasized takeaway text',
  },
];

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

export const OnboardingPage: React.FC = () => {
  const { completeOnboarding, workspace: existingWorkspace, navigate } = useApp();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [workspaceName, setWorkspaceName] = useState(
    existingWorkspace.workspaceName || 'Apex Media Lab'
  );
  const [brandName, setBrandName] = useState(existingWorkspace.brandName || 'Apex Insights');
  const [mainNiche, setMainNiche] = useState(
    existingWorkspace.mainNiche || 'Tech & Engineering Innovations'
  );
  const [subtopics, setSubtopics] = useState<string[]>(
    existingWorkspace.subtopics.length > 0
      ? existingWorkspace.subtopics
      : ['Autonomous AI Agents', 'Open-Source Models', 'Developer Tools']
  );
  const [newSubtopicInput, setNewSubtopicInput] = useState('');
  const [contentLanguage, setContentLanguage] = useState(
    existingWorkspace.contentLanguage || 'English (US)'
  );
  const [contentStyle, setContentStyle] = useState(
    existingWorkspace.contentStyle || 'Kinetic typography with high-contrast highlighted keywords'
  );
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>([
    'Instagram Reels',
    'YouTube Shorts',
    'TikTok',
  ]);

  const handleAddSubtopic = () => {
    const trimmed = newSubtopicInput.trim();
    if (trimmed && !subtopics.includes(trimmed)) {
      setSubtopics([...subtopics, trimmed]);
      setNewSubtopicInput('');
    }
  };

  const handleRemoveSubtopic = (topicToRemove: string) => {
    setSubtopics(subtopics.filter((t) => t !== topicToRemove));
  };

  const applyPreset = (preset: (typeof PRESET_NICHES)[0]) => {
    setMainNiche(preset.name);
    setSubtopics(preset.subtopics);
    setContentStyle(preset.style);
  };

  const togglePlatform = (p: string) => {
    if (targetPlatforms.includes(p)) {
      if (targetPlatforms.length > 1) {
        setTargetPlatforms(targetPlatforms.filter((item) => item !== p));
      }
    } else {
      setTargetPlatforms([...targetPlatforms, p]);
    }
  };

  const handleFinish = () => {
    const config: WorkspaceConfig = {
      workspaceName: workspaceName.trim() || 'My Content Workspace',
      mainNiche: mainNiche.trim() || 'General Insights',
      subtopics: subtopics.length > 0 ? subtopics : ['Core Insights', 'Analysis'],
      contentLanguage,
      contentStyle,
      brandName: brandName.trim() || undefined,
      aspectRatio: '9:16',
      targetPlatforms,
      minCandidateScore: 80,
      targetDuration: '30-60s',
    };
    completeOnboarding(config);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 lg:p-10">
      {/* Top Header */}
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between py-4 border-b border-slate-200/80 mb-6 sm:mb-8">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-slate-900 text-white font-bold text-sm flex items-center justify-center">
            CF
          </div>
          <span className="font-bold text-base text-slate-900 tracking-tight">ClipFlow</span>
        </div>

        {/* Step Indicator (adaptive for mobile) */}
        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
          <span className="sm:hidden font-semibold text-slate-800">
            Step {step} / 3
          </span>
          <div className="hidden sm:flex items-center gap-2">
            <span className={step >= 1 ? 'font-semibold text-slate-900' : ''}>1. Workspace</span>
            <span>·</span>
            <span className={step >= 2 ? 'font-semibold text-slate-900' : ''}>2. Niche & Topics</span>
            <span>·</span>
            <span className={step >= 3 ? 'font-semibold text-slate-900' : ''}>3. Style & Language</span>
          </div>
        </div>

        <button
          onClick={() => navigate('dashboard')}
          className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
        >
          Skip to Dashboard
        </button>
      </div>

      {/* Main Form Container */}
      <div className="max-w-4xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start my-auto">
        {/* Left Form Area */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-xl p-4 sm:p-8 shadow-xs">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Name your workspace</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Configure the primary production environment and optional branding.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Workspace Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    required
                    placeholder="e.g. Apex Media Lab"
                    className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-white"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Used across your team, pipeline jobs, and export archives.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Brand or Channel Name <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="e.g. Silicon Brief Daily"
                    className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-white"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Displayed on watermark presets and outro cards if enabled.
                  </span>
                </div>

                {/* Target Platforms */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Target Publishing Formats
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {['Instagram Reels', 'YouTube Shorts', 'TikTok'].map((platform) => {
                      const isSelected = targetPlatforms.includes(platform);
                      return (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => togglePlatform(platform)}
                          className={`p-2.5 text-xs rounded-md border text-left transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <span className="font-medium truncate">{platform}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full sm:w-auto py-2.5 px-5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-md transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Continue to Niche</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Choose your niche & subtopics</h2>
                <p className="text-xs text-slate-500 mt-1">
                  ClipFlow uses this to discover relevant YouTube podcasts, talks, and discussions.
                </p>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Fast Preset Selection
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRESET_NICHES.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`p-2.5 text-left rounded-md border text-xs transition-colors ${
                        mainNiche === preset.name
                          ? 'border-slate-900 bg-slate-50 text-slate-900 font-medium'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="font-semibold text-slate-900">{preset.name}</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {preset.subtopics.slice(0, 3).join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Niche Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Main Niche
                </label>
                <input
                  type="text"
                  value={mainNiche}
                  onChange={(e) => setMainNiche(e.target.value)}
                  placeholder="e.g. Artificial Intelligence & LLMs"
                  className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-white"
                />
              </div>

              {/* Subtopics Tag Builder */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Specific Subtopics & Search Angles
                </label>
                <div className="flex flex-col sm:flex-row gap-2 mb-2.5">
                  <input
                    type="text"
                    value={newSubtopicInput}
                    onChange={(e) => setNewSubtopicInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubtopic();
                      }
                    }}
                    placeholder="Add a topic (e.g. Multi-agent systems) and press Enter"
                    className="flex-1 px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubtopic}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Subtopic tags (clean unboxed text or subtle buttons) */}
                <div className="flex flex-wrap gap-1.5">
                  {subtopics.map((st) => (
                    <span
                      key={st}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium"
                    >
                      <span>{st}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubtopic(st)}
                        className="text-slate-400 hover:text-slate-600 p-0.5"
                        aria-label={`Remove ${st}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="py-2 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-md transition-colors flex items-center gap-1.5"
                >
                  <span>Continue to Style</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Language & Content Style</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Tailor the vertical clip format, transcription language, and typography pacing.
                </p>
              </div>

              {/* Language Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Primary Content Language
                </label>
                <select
                  value={contentLanguage}
                  onChange={(e) => setContentLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-white"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              {/* Content Style Options */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-2">
                  Caption & Visual Style
                </label>
                <div className="space-y-2">
                  {STYLES.map((styleOpt) => {
                    const isSelected = contentStyle === styleOpt.id;
                    return (
                      <button
                        key={styleOpt.id}
                        type="button"
                        onClick={() => setContentStyle(styleOpt.id)}
                        className={`w-full text-left p-3 rounded-md border text-xs transition-colors flex items-start justify-between gap-3 ${
                          isSelected
                            ? 'border-slate-900 bg-slate-50/70 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-900">{styleOpt.title}</div>
                          <div className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                            {styleOpt.desc}
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="py-2 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-md transition-colors shadow-xs flex items-center gap-1.5"
                >
                  <span>Launch ClipFlow Pipeline</span>
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Summary Preview Card */}
        <div className="lg:col-span-5 bg-slate-900 text-white rounded-xl p-6 border border-slate-800 shadow-md space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Pipeline Blueprint
            </span>
            <span className="text-xs font-mono tabular-nums text-blue-400">Ready to build</span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Workspace</span>
              <span className="font-semibold text-sm text-slate-100">
                {workspaceName || 'Untitled Workspace'}
              </span>
            </div>

            {brandName && (
              <div>
                <span className="text-slate-400 block text-[11px]">Brand Overlay</span>
                <span className="text-slate-200">{brandName}</span>
              </div>
            )}

            <div>
              <span className="text-slate-400 block text-[11px]">Core Niche</span>
              <span className="text-slate-200 font-medium">{mainNiche}</span>
            </div>

            <div>
              <span className="text-slate-400 block text-[11px]">Target Subtopics</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {subtopics.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <span className="text-slate-400 block text-[11px]">Language</span>
                <span className="text-slate-200 font-medium">{contentLanguage}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Aspect Ratio</span>
                <span className="text-slate-200 font-mono">9:16 Vertical</span>
              </div>
            </div>

            <div>
              <span className="text-slate-400 block text-[11px]">Publishing Targets</span>
              <div className="text-slate-300 text-[11px] mt-0.5">
                {targetPlatforms.join(' · ')}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 text-[11px] text-emerald-400 font-medium">
              Autonomous Discovery: Sources and candidate moments will be found automatically without manual URL entry.
            </div>
          </div>

          {/* Mini Simulated 9:16 Mock Card */}
          <div className="mt-4 p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-center">
            <div className="text-[10px] text-slate-400 mb-1">Simulated Output Format</div>
            <div className="w-24 h-40 mx-auto rounded border border-slate-700 bg-slate-900 flex flex-col justify-between p-2">
              <div className="text-[8px] text-slate-400 truncate">
                {brandName || 'ClipFlow'}
              </div>
              <div className="text-[9px] font-bold text-white leading-tight">
                "The #1 insight in {mainNiche.slice(0, 15)}..."
              </div>
              <div className="text-[7px] text-amber-400 font-mono">00:45</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="max-w-4xl mx-auto w-full text-center text-xs text-slate-400 py-4">
        You can fine-tune all niche parameters anytime under Settings.
      </div>
    </div>
  );
};
