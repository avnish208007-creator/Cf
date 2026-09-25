import React, { useState } from 'react';
import { SlidersHorizontal, Save, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const SettingsPage: React.FC = () => {
  const { workspace, updateWorkspace } = useApp();

  const [workspaceName, setWorkspaceName] = useState(workspace.workspaceName || '');
  const [mainNiche, setMainNiche] = useState(workspace.mainNiche || '');
  const [contentLanguage, setContentLanguage] = useState(workspace.contentLanguage || 'English');
  const [subtopicsText, setSubtopicsText] = useState((workspace.subtopics || []).join(', '));
  const [isSaved, setIsSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const subtopics = subtopicsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await updateWorkspace({
      workspaceName,
      mainNiche,
      contentLanguage,
      subtopics,
    });

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-6 pb-12 max-w-3xl">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-200/80">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
          Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Configure your workspace and discovery preferences.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Workspace Section */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 space-y-4 shadow-2xs">
          <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
            Workspace Configuration
          </h2>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 block">
                Workspace Name
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 block">
                  Target Niche
                </label>
                <input
                  type="text"
                  value={mainNiche}
                  onChange={(e) => setMainNiche(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 block">
                  Language
                </label>
                <select
                  value={contentLanguage}
                  onChange={(e) => setContentLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="German">German</option>
                  <option value="French">French</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Discovery Preferences */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 space-y-4 shadow-2xs">
          <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
            Discovery Preferences
          </h2>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 block">
              Focus Subtopics <span className="text-slate-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={subtopicsText}
              onChange={(e) => setSubtopicsText(e.target.value)}
              placeholder="e.g. AI Agents, LLMs, Automation"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {isSaved && (
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>Saved successfully</span>
            </span>
          )}

          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};
