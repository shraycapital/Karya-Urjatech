import React from 'react';

export default function RefreshIndicator({ 
  isRefreshing, 
  refreshProgress, 
  pullDistance, 
  threshold = 80 
}) {
  const showIndicator = isRefreshing || pullDistance > 0;
  
  if (!showIndicator) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
      <div className="flex justify-center">
        <div className="bg-slate-700/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-b-lg shadow-lg flex items-center gap-2 text-xs">
          {isRefreshing ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
              <span className="font-medium">Refreshing...</span>
            </>
          ) : (
            <>
              <div className="h-3 w-3">
                {pullDistance >= threshold ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
              </div>
              <span className="font-medium">
                {pullDistance >= threshold ? 'Release to refresh' : 'Pull to refresh'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
