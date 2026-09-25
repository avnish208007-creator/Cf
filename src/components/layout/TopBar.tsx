import React from 'react';
import { Menu, Compass, Sparkles, Send, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface TopBarProps {
  onToggleMobileMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onToggleMobileMenu }) => {
  const {
    currentPage,
    navigate,
    runDiscovery,
    isDiscovering,
    batchApproveAndRenderClips,
    candidates,
  } = useApp();

  const getPageHeaderInfo = () => {
    switch (currentPage) {
      case 'dashboard':
        return {
          title: 'Overview',
          actionLabel: isDiscovering ? 'Searching...' : 'Find videos',
          icon: Compass,
          onAction: () => {
            runDiscovery();
            navigate('discover');
          },
          disabled: isDiscovering,
        };
      case 'discover':
        return {
          title: 'Discover',
          actionLabel: isDiscovering ? 'Searching...' : 'Find videos',
          icon: Compass,
          onAction: () => runDiscovery(),
          disabled: isDiscovering,
        };
      case 'candidates':
        return {
          title: 'Candidates',
          actionLabel: 'Generate clips',
          icon: Sparkles,
          onAction: () => batchApproveAndRenderClips(),
          disabled: candidates.length === 0,
        };
      case 'clips':
        return {
          title: 'Clips',
          actionLabel: 'Review queue',
          icon: Send,
          onAction: () => navigate('queue'),
          disabled: false,
        };
      case 'queue':
        return {
          title: 'Queue',
          actionLabel: 'Discover more',
          icon: Compass,
          onAction: () => navigate('discover'),
          disabled: false,
        };
      case 'settings':
        return {
          title: 'Settings',
          actionLabel: null,
          icon: null,
          onAction: null,
          disabled: false,
        };
      default:
        return {
          title: 'ClipFlow',
          actionLabel: 'Find videos',
          icon: Compass,
          onAction: () => runDiscovery(),
          disabled: isDiscovering,
        };
    }
  };

  const headerInfo = getPageHeaderInfo();
  const ActionIcon = headerInfo.icon;

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between z-10 shrink-0">
      {/* Left: Mobile Trigger & Page Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 -ml-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 truncate">
          {headerInfo.title}
        </h1>
      </div>

      {/* Right: Contextual Primary Action Button */}
      {headerInfo.actionLabel && headerInfo.onAction && (
        <button
          type="button"
          onClick={headerInfo.onAction}
          disabled={headerInfo.disabled}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
        >
          {ActionIcon && (
            <ActionIcon
              className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`}
            />
          )}
          <span>{headerInfo.actionLabel}</span>
        </button>
      )}
    </header>
  );
};
