import React, { useState } from 'react';
import { Compass, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const OnboardingPage: React.FC = () => {
  const { completeOnboarding, workspace } = useApp();

  const [workspaceName, setWorkspaceName] = useState(workspace.workspaceName || 'My Shorts Workspace');
  const [mainNiche, setMainNiche] = useState(workspace.mainNiche || 'AI & Tech');
  const [subtopicsText, setSubtopicsText] = useState('AI Agents, LLMs, Automation');
  const [contentLanguage, setContentLanguage] = useState('English');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const subtopics = subtopicsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await completeOnboarding({
      workspaceName,
      mainNiche,
      contentLanguage,
      contentStyle: 'Informative',
      subtopics,
      aspectRatio: '9:16',
      targetPlatforms: ['YouTube Shorts', 'TikTok', 'Instagram Reels'],
      minCandidateScore: 75,
      targetDuration: '30-60s',
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
        <div className="space-y-2 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-md">
            <Compass className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Setup your workspace
          </h1>
          <p className="text-xs text-slate-500">
            Tell ClipFlow what content you want to discover.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">
              Workspace Name
            </label>
            <input
              type="text"
              required
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="e.g. Creator Channel"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">
              Target Niche
            </label>
            <input
              type="text"
              required
              value={mainNiche}
              onChange={(e) => setMainNiche(e.target.value)}
              placeholder="e.g. AI & Technology, Finance, Fitness"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">
              Subtopics <span className="text-slate-400 font-normal">(comma separated)</span>
            </label>
            <input
              type="text"
              value={subtopicsText}
              onChange={(e) => setSubtopicsText(e.target.value)}
              placeholder="e.g. AI Agents, LLMs, Automation"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-2xs flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
