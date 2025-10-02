import React, { useState, useEffect, useCallback } from 'react';
import { formatDate } from '../../../shared/utils/date.js';
import { getActivityLogsWithCursor, getActivityLogCount } from '../../../shared/utils/activityLogApi.js';

export default function ActivityLog({ onClose, t }) {
  const [activityLogFilter, setActivityLogFilter] = useState('all');
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  // Load initial activity logs
  const loadActivityLogs = useCallback(async (filter = 'all', reset = true) => {
    setIsLoading(true);
    try {
      const result = await getActivityLogsWithCursor(50, null, filter);
      if (reset) {
        setLogs(result.logs);
      } else {
        setLogs(prev => [...prev, ...result.logs]);
      }
      setHasMore(result.hasMore);
      setLastDoc(result.lastDoc);
      
      // Get total count for display
      const count = await getActivityLogCount(filter);
      setTotalCount(count);
      
    } catch (error) {
      // Handle error silently
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load more activity logs
  const loadMoreLogs = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    
    setIsLoadingMore(true);
    try {
      const result = await getActivityLogsWithCursor(50, lastDoc, activityLogFilter);
      setLogs(prev => [...prev, ...result.logs]);
      setHasMore(result.hasMore);
      setLastDoc(result.lastDoc);
    } catch (error) {
      // Handle error silently
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, lastDoc, activityLogFilter]);

  // Load logs when component mounts or filter changes
  useEffect(() => {
    loadActivityLogs(activityLogFilter, true);
  }, [activityLogFilter, loadActivityLogs]);

  // Handle filter change
  const handleFilterChange = (newFilter) => {
    setActivityLogFilter(newFilter);
    setLogs([]);
    setLastDoc(null);
    setHasMore(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{t('activityLog')}</h3>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700">{t('activityLogFilter')}</label>
            <span className="text-xs text-slate-500">
              {isLoading ? 'Loading...' : `${logs.length} of ${totalCount} activities`}
            </span>
          </div>
          
          <select 
            value={activityLogFilter} 
            onChange={(e) => handleFilterChange(e.target.value)} 
            className="select text-sm"
            disabled={isLoading}
          >
            <option value="all">{t('activityLogFilterAll')}</option>
            <option value="create">{t('activityLogFilterCreate')}</option>
            <option value="update">{t('activityLogFilterUpdate')}</option>
            <option value="delete">{t('activityLogFilterDelete')}</option>
            <option value="login">{t('activityLogFilterLogin')}</option>
            <option value="logout">{t('activityLogFilterLogout')}</option>
            <option value="complete">Completed</option>
            <option value="start">Started</option>
            <option value="reopen">Reopened</option>
            <option value="assign">Assigned</option>
            <option value="unassign">Unassigned</option>
            <option value="comment">Commented</option>
            <option value="request_material">Requested Material/Info</option>
            <option value="app_launch">App Launched</option>
            <option value="display_mode_change">Display Mode Changed</option>
            <option value="visibility_change">App Visibility Changed</option>
            <option value="connection_change">Connection Changed</option>
            <option value="web_vital_lcp">Performance: LCP</option>
            <option value="web_vital_cls">Performance: CLS</option>
            <option value="js_error">JavaScript Error</option>
            <option value="network_error">Network Error</option>
          </select>
        </div>

        <div className="overflow-y-auto max-h-96">
          {isLoading ? (
            <div className="text-center text-slate-500 py-8">
              <div className="flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                Loading activities...
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center text-slate-500 py-8">{t('activityLogEmpty')}</div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                  <div key={log.id} className="border rounded-lg p-3 bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900">{log.userName}</span>
                          <span className="text-sm text-slate-600">
                            {log.action === 'create' && 'Created'}
                            {log.action === 'update' && 'Updated'}
                            {log.action === 'delete' && 'Deleted'}
                            {log.action === 'login' && 'Logged In'}
                            {log.action === 'logout' && 'Logged Out'}
                            {log.action === 'complete' && 'Completed'}
                            {log.action === 'start' && 'Started'}
                            {log.action === 'reopen' && 'Reopened'}
                            {log.action === 'assign' && 'Assigned'}
                            {log.action === 'unassign' && 'Unassigned'}
                            {log.action === 'comment' && 'Commented'}
                            {log.action === 'request_material' && 'Requested Material/Info'}
                            {log.action === 'app_launch' && 'App Launched'}
                            {log.action === 'display_mode_change' && 'Display Mode Changed'}
                            {log.action === 'visibility_change' && 'App Visibility Changed'}
                            {log.action === 'connection_change' && 'Connection Changed'}
                            {log.action === 'web_vital_lcp' && 'Performance: LCP'}
                            {log.action === 'web_vital_cls' && 'Performance: CLS'}
                            {log.action === 'js_error' && 'JavaScript Error'}
                            {log.action === 'network_error' && 'Network Error'}
                            {!['create', 'update', 'delete', 'login', 'logout', 'complete', 'start', 'reopen', 'assign', 'unassign', 'comment', 'request_material', 'app_launch', 'display_mode_change', 'visibility_change', 'connection_change', 'web_vital_lcp', 'web_vital_cls', 'js_error', 'network_error'].includes(log.action) && log.action}
                          </span>
                        </div>
                        {log.entityName && log.entityType !== 'user' && (
                          <div className="text-sm text-slate-700 mb-1"><strong>Name:</strong> {log.entityName}</div>
                        )}
                        {log.location && (
                          <div className="text-xs text-slate-500 mt-1">
                            <strong>Location:</strong>{' '}
                            <a
                              href={`https://www.google.com/maps?q=${log.location.latitude},${log.location.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {log.location.latitude.toFixed(4)}, {log.location.longitude.toFixed(4)}
                            </a>
                          </div>
                        )}
                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="text-xs text-slate-600">
                            {Object.entries(log.details).map(([key, value]) => (
                              <div key={key}><strong>{key}:</strong> {Array.isArray(value) ? value.join(', ') : String(value)}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 text-right ml-4">{formatDate(log.timestamp)}</div>
                    </div>
                  </div>
                ))}
              
              {/* Load More Button */}
              {hasMore && (
                <div className="text-center py-4">
                  <button
                    onClick={loadMoreLogs}
                    disabled={isLoadingMore}
                    className="btn btn-primary btn-sm"
                  >
                    {isLoadingMore ? (
                      <div className="flex items-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                        Loading more...
                      </div>
                    ) : (
                      'Load More Activities'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <div className="text-sm text-slate-600">
            {logs.length} of {totalCount} activities
            {hasMore && ' (more available)'}
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm">{t('close')}</button>
        </div>
      </div>
    </div>
  );
}


