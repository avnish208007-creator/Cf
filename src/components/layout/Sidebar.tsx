import React from 'react';
import {
  LayoutDashboard,
  Compass,
  Sparkles,
  Film,
  Send,
  Settings,
  Flame,
  Sliders,
  X,
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
    jobs,
    user,
    logout,
    isSupabaseActive,
  } = useApp();

  const navItems: {
    id: PageRoute;
    label: string;
    icon: React.ElementType;
    count?: number;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'discover', label: 'Discover Sources', icon: Compass, count: sources.length },
    {
      id: 'candidates',
      label: 'Candidate Moments',
      icon: Sparkles,
      count: candidates.filter((c) => c.status !== 'rejected').length,
    },
    { id: 'clips', label: 'Vertical Clips', icon: Film, count: clips.length },
    { id: 'queue', label: 'Publish Queue', icon: Send, count: queue.length },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (page: PageRoute) => {
    navigate(page);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <aside className="w-72 sm:w-64 max-w-[85vw] h-full bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 sm:px-5 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-sm tracking-tight shadow-xs shrink-0">
            CF
          </div>
          <div className="min-w-0">
            <div className="font-bold text-base tracking-tight text-white flex items-center gap-1.5 leading-none">
              ClipFlow
            </div>
            <div className="text-[11px] text-slate-400 font-normal truncate mt-1">
              Short-Form Automation
            </div>
          </div>
        </div>

        {onCloseMobile ? (
          <button
            onClick={onCloseMobile}
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        ) : isSupabaseActive ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-1.5 py-0.5 rounded" title="Connected to Supabase PostgreSQL & Auth">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Supabase
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/50 px-1.5 py-0.5 rounded" title="Demo / Local Mode">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Demo
          </span>
        )}
      </div>

      {/* Workspace Context Snippet */}
      <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-950/40 shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="uppercase tracking-wider font-semibold text-[10px] text-slate-500">
            Workspace
          </span>
          <button
            onClick={() => handleNavClick('settings')}
            className="p-1 -mr-1 text-slate-400 hover:text-white transition-colors rounded hover:bg-slate-800/50"
            title="Workspace settings"
            aria-label="Workspace settings"
          >
            <Sliders className="w-3 h-3" />
          </button>
        </div>
        <div className="text-sm font-semibold text-slate-200 truncate">
          {workspace.workspaceName || 'Default Workspace'}
        </div>
        <div className="text-xs text-slate-400 truncate mt-0.5">
          {workspace.mainNiche || 'General Niche'}
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto no-scrollbar">
        <div className="px-2 pb-1.5 text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
          Pipeline Stages
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium transition-colors text-left ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.count !== undefined && (
                <span
                  className={`font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-blue-700 text-white' : 'text-slate-400 bg-slate-800/80'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}

        {/* Pipeline Stage Summary Card */}
        <div className="pt-4 px-1">
          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg text-xs text-slate-400">
            <div className="flex items-center justify-between font-medium text-slate-300 text-[11px] mb-2.5">
              <span className="flex items-center gap-1.5 text-slate-200">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Pipeline Flow
              </span>
              <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                {jobs.length > 0 ? `${jobs.length} in flight` : 'Idle'}
              </span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between text-slate-400">
                <span>1. Sources</span>
                <span className="font-mono tabular-nums text-slate-300">{sources.length}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>2. Moments</span>
                <span className="font-mono tabular-nums text-slate-300">{candidates.length}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>3. 9:16 Shorts</span>
                <span className="font-mono tabular-nums text-slate-300">{clips.length}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>4. Publish Queue</span>
                <span className="font-mono tabular-nums text-slate-300">{queue.length}</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* User Account / Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 shrink-0">
        <div className="flex items-center gap-2.5 px-1 min-w-0">
          <div className="w-8 h-8 rounded bg-slate-800 text-slate-200 flex items-center justify-center font-mono text-xs font-semibold shrink-0 border border-slate-700">
            {user?.avatarInitials || 'CU'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-slate-200 truncate">{user?.name || 'ClipFlow User'}</div>
            <div className="text-[11px] text-slate-400 truncate">{user?.email || 'user@clipflow.app'}</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
