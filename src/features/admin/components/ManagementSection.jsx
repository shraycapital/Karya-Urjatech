import React, { useState, Suspense, lazy } from 'react';
import { canAccessFeature } from '../../../shared/utils/permissions.js';
import { ROLES } from '../../../shared/constants.js';

const PWAAnalyticsDashboard = lazy(() => import('./PWAAnalyticsDashboard'));
const TaskManagement = lazy(() => import('./ManagementDashboard'));
const LocationAnalyticsDashboard = lazy(() => import('./LocationAnalyticsDashboard'));

export default function ManagementSection({ 
  currentUser, 
  users, 
  departments, 
  tasks, 
  activityLogs, 
  t, 
  onTaskFeedback,
  AnalyticsDashboard 
}) {
  const [activeManagementTab, setActiveManagementTab] = useState('management');

  console.log('ManagementSection rendering. Users:', users.length, 'Departments:', departments.length);

  const canSeeManagement = canAccessFeature(currentUser?.role, 'management-dashboard');
  const canSeeAnalytics = canAccessFeature(currentUser?.role, 'analytics-dashboard');
  const isAdmin = currentUser?.role === ROLES.ADMIN;

  // If user cannot see any tab, show access denied
  if (!canSeeManagement && !canSeeAnalytics && !isAdmin) {
    return (
      <div className="bg-white rounded-lg p-6">
        <p className="text-sm text-gray-600">{t('accessDenied') || 'Access denied.'}</p>
      </div>
    );
  }

  // Guard Clause: Wait for essential data before rendering tabs
  if (!users || users.length === 0 || !departments || departments.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 text-center">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="mt-2 text-sm text-slate-500">{t('loadingUsersAndDepartments') || 'Loading users and departments...'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Management Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <nav className="flex space-x-8 px-4">
          {canSeeManagement && (
            <button
              onClick={() => setActiveManagementTab('management')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeManagementTab === 'management'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📋 {t('managementDashboard') || 'Task Management'}
            </button>
          )}
          {canSeeAnalytics && (
            <button
              onClick={() => setActiveManagementTab('analytics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeManagementTab === 'analytics'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📈 {t('analyticsDashboard') || 'Analytics Dashboard'}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setActiveManagementTab('pwa')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeManagementTab === 'pwa'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📊 {t('pwaAnalytics') || 'PWA Analytics'}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setActiveManagementTab('locations')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeManagementTab === 'locations'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📍 {t('locations') || 'Locations'}
            </button>
          )}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-screen">
        {activeManagementTab === 'management' && canSeeManagement && (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-2 text-sm text-slate-500">{t('loadingManagement') || 'Loading management dashboard...'}</span>
            </div>
          }>
            <TaskManagement
              currentUser={currentUser}
              users={users}
              departments={departments}
              tasks={tasks}
              t={t}
              onTaskFeedback={onTaskFeedback}
            />
          </Suspense>
        )}

        {activeManagementTab === 'analytics' && canSeeAnalytics && (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-2 text-sm text-slate-500">{t('loadingAnalytics') || 'Loading analytics dashboard...'}</span>
            </div>
          }>
            <AnalyticsDashboard
              currentUser={currentUser}
              users={users}
              departments={departments}
              tasks={tasks}
              activityLogs={activityLogs}
              t={t}
            />
          </Suspense>
        )}

        {activeManagementTab === 'pwa' && isAdmin && (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-2 text-sm text-slate-500">{t('loadingAnalytics') || 'Loading analytics dashboard...'}</span>
            </div>
          }>
            <PWAAnalyticsDashboard
              users={users}
              departments={departments}
              t={t}
            />
          </Suspense>
        )}

        {activeManagementTab === 'locations' && isAdmin && (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-2 text-sm text-slate-500">{t('loadingLocations') || 'Loading locations...'}</span>
            </div>
          }>
            <LocationAnalyticsDashboard
              users={users}
              t={t}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
