import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`animate-pulse bg-slate-200/80 rounded-md ${className}`} />
  );
};

export const VideoCardSkeleton: React.FC = () => {
  return (
    <div className="p-3 bg-white border border-slate-200/80 rounded-lg space-y-3">
      <Skeleton className="aspect-video w-full rounded-md" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-7 w-20 rounded-md" />
      </div>
    </div>
  );
};
