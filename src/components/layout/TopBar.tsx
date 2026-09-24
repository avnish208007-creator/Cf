import React from 'react';
import {
  Menu,
  Compass,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageRoute } from '../../types';

interface TopBarProps {
  onToggleMobileMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onToggleMobileMenu }) => {
  const {
    currentPage,
    navigate,
    workspace,
    runDiscovery,
    isDiscovering,
    resetToDemo,
  } = useApp();

  const getPageTitle = (page: PageRoute): { section: string; title: string } => {
    switch (page) {
      case 'dashboard':
        return { section: 'Overview', title: 'Content Pipeline Dashboard' };
      case 'discover':
        return { section: 'Sources', title: 'Automated Source Discovery' };
      case 'candidates':
        return { section: 'Moments', title: 'AI-Detected Clip Candidates' };
      case 'clips':
        return { section: 'Production', title: 'Generated Vertical Clips' };
      case 'queue':
        return { section: 'Publishing', title: 'Approval & Distribution Queue' };
      case 'settings':
        return { section: 'Workspace', title: 'Settings & Niche Configuration' };
      case 'onboarding':
        return { section: 'Setup', title: 'Workspace Onboarding Flow' };
      case 'login':
        return { section: 'Auth', title: 'Sign In to ClipFlow' };
      default:
        return { section: 'ClipFlow', title: 'Workspace' };
    }
  };

  const { section, title } = getPageTitle(currentPage);

  const handleRunDiscoveryClick = () => {
    runDiscovery();
    if (currentPage !== 'discover') {
      navigate('discover');
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between z-10 shrink-0">
      {/* Left: Mobile trigger & Breadcrumbs */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumbs - unboxed text with dynamic truncation */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium min-w-0">
          <span className="text-slate-500 font-normal shrink-0">ClipFlow</span>
          <span className="text-slate-300 font-mono shrink-0">/</span>
          <span className="text-slate-500 hidden md:inline font-normal shrink-0">{section}</span>
          <span className="text-slate-300 hidden md:inline font-mono shrink-0">/</span>
          <span className="text-slate-900 font-semibold truncate max-w-[130px] xs:max-w-[180px] sm:max-w-xs md:max-w-md">
            {title}
          </span>
        </div>
      </div>

      {/* Right: Niche indicator & Run Discovery Primary Action */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Active Niche indicator */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 font-normal">
          <span>Target Niche:</span>
          <span className="text-slate-900 font-medium truncate max-w-[170px] bg-slate-100 px-2 py-0.5 rounded">
            {workspace.mainNiche}
          </span>
        </div>

        <div className="hidden lg:block w-px h-4 bg-slate-200" />

        {/* Clear Workspace button to return to empty baseline */}
        <button
          onClick={resetToDemo}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
          title="Reset to clean empty workspace state"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          <span>Clear State</span>
        </button>

        {/* Primary Action Button: Run Discovery */}
        <button
          onClick={handleRunDiscoveryClick}
          disabled={isDiscovering}
          className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-md transition-colors shadow-xs whitespace-nowrap"
        >
          <Compass className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
          <span>{isDiscovering ? 'Discovering...' : 'Run Discovery'}</span>
        </button>
      </div>
    </header>
  );
};
