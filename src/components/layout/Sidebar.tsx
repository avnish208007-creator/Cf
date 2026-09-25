import React from 'react';
import {
  LayoutDashboard,
  Compass,
  Sparkles,
  Film,
  Send,
  Settings,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageRoute } from '../../types';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const {
    currentPage,
    navigate,
    workspace,
    candidates,
    clips,
    queue,
    sources,
    user,
  } = useApp();

  const navItems: {
    id: PageRoute;
    label: string;
    icon: React.ElementType;
    count?: number;
  }[] = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'discover', label: 'Discover', icon: Compass, count: sources.length },
    {
      id: 'candidates',
      label: 'Candidates',
      icon: Sparkles,
      count: candidates.filter((c) => c.status !== 'rejected').length,
    },
    { id: 'clips', label: 'Clips', icon: Film, count: clips.length },
    { id: 'queue', label: 'Queue', icon: Send, count: queue.length },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (page: PageRoute) => {
    navigate(page);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <aside className="w-64 max-w-[85vw] h-full bg-white text-slate-900 flex flex-col border-r border-slate-200/80 select-none">
      {/* Brand & Workspace Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-blue-600 text-white font-bold text-xs flex items-center justify-center tracking-tight shadow-2xs">
            CF
          </div>
          <span className="font-semibold text-sm tracking-tight text-slate-900">
            ClipFlow
          </span>
        </div>

        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Workspace Indicator */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 shrink-0">
        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">
          <span>Workspace</span>
          <button
            onClick={() => handleNavClick('settings')}
            className="text-slate-400 hover:text-slate-700 transition-colors"
            title="Settings"
          >
            <SlidersHorizontal className="w-3 h-3" />
          </button>
        </div>
        <div className="text-xs font-semibold text-slate-800 truncate">
          {workspace.workspaceName || 'Default Workspace'}
        </div>
        <div className="text-[11px] text-slate-500 truncate mt-0.5">
          {workspace.mainNiche || 'General Niche'}
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto no-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                isActive
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-blue-600' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {item.count !== undefined && item.count > 0 && (
                <span
                  className={`font-mono text-[10px] tabular-nums px-1.5 py-0.2 rounded ${
                    isActive
                      ? 'bg-slate-200 text-slate-800'
                      : 'text-slate-400 bg-slate-100'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Session Footer */}
      <div className="p-3.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
        <div className="flex items-center gap-2.5 px-1 min-w-0">
          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-mono text-[11px] font-semibold shrink-0 border border-slate-300/60">
            {user?.avatarInitials || 'CU'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-800 truncate">
              {user?.name || 'ClipFlow User'}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {user?.email || 'user@clipflow.app'}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
