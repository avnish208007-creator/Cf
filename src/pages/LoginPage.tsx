import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Sparkles, ArrowRight, ShieldCheck, Check, Database, AlertCircle, Loader2 } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';

export const LoginPage: React.FC = () => {
  const { login, navigate } = useApp();
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('alex@creatorflow.io');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('Alex Rivera');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await login(
        email,
        password,
        authMode === 'signup',
        authMode === 'signup' ? name : undefined
      );

      if (!res.success && res.error) {
        setErrorMessage(res.error);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await login('alex@creatorflow.io', undefined, false, 'Alex Rivera');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartFreshOnboarding = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await login('newuser@creatorflow.io', undefined, false, 'Creator');
      navigate('onboarding');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 text-white font-bold text-lg mb-3 shadow-sm">
            CF
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {authMode === 'signin' ? 'Sign in to ClipFlow' : 'Create your ClipFlow Account'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Automated short-form content pipeline for creators and agencies
          </p>

          {/* Supabase status indicator badge */}
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white border border-slate-200 text-slate-600 shadow-2xs">
            <Database className="w-3 h-3 text-blue-600" />
            <span>Backend:</span>
            {isSupabaseConfigured ? (
              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Supabase Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-700 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Demo / Local Mode
              </span>
            )}
          </div>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-6 sm:p-8 shadow-xs">
          {/* Quick Demo Access Bar */}
          <div className="mb-6 p-3.5 bg-slate-50 border border-slate-200/70 rounded-lg">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-900 mb-1">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Instant Demo Access
              </span>
              <span className="text-[11px] font-normal text-slate-500">One-click explore</span>
            </div>
            <p className="text-xs text-slate-500 mb-2.5 leading-relaxed">
              Explore the pre-populated pipeline with sample sources, scored moments, and ready-to-publish clips.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDemoSignIn}
                disabled={isLoading}
                className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <span>Demo Dashboard</span>
                <ArrowRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleStartFreshOnboarding}
                disabled={isLoading}
                className="w-full py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium text-xs rounded-md transition-colors text-center disabled:opacity-50"
              >
                Fresh Setup
              </button>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg mb-5 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setAuthMode('signin');
                setErrorMessage(null);
              }}
              className={`flex-1 py-1.5 rounded-md transition-all text-center ${
                authMode === 'signin'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setErrorMessage(null);
              }}
              className={`flex-1 py-1.5 rounded-md transition-all text-center ${
                authMode === 'signup'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block">Authentication Error</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Your Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-white"
                  placeholder="Alex Rivera"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Work Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-white"
                placeholder="alex@creatorflow.io"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">Password</label>
                {authMode === 'signin' && (
                  <span
                    onClick={() => {
                      if (email) {
                        alert(`Password reset instructions will be sent to ${email}`);
                      }
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Forgot?
                  </span>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:border-slate-900 bg-white font-mono"
                placeholder="••••••••••••"
              />
              {authMode === 'signup' && (
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Must be at least 6 characters
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-md transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {authMode === 'signin' ? 'Sign In to Workspace' : 'Create Supabase Account'}
              </span>
            </button>
          </form>

          {/* Feature Highlights */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 space-y-2">
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Automated YouTube moment detection & hook extraction</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Row Level Security (RLS) workspace isolation</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Streamlined human-in-the-loop review and publishing queue</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          ClipFlow Content Automation &copy; 2026. Production SaaS foundation.
        </p>
      </div>
    </div>
  );
};
