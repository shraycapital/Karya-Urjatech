import React from 'react';
import { canAccessFeature } from '../utils/permissions.js';
import { ROLES } from '../constants.js';

const TasksIcon = ({ size = 20, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 11H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 4h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4" />
    <path d="M9 21H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h4" />
    <path d="M16 21h4a2 2 0 0 1 2-2v-4a2 2 0 0 1-2-2h-4" />
  </svg>
);

const PointsIcon = ({ size = 20, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const ManagementIcon = ({ size = 20, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 3v18h18" />
    <path d="M18.7 8l-5.1 5.1-2.8-2.7L7 14.3" />
  </svg>
);

const DepartmentIcon = ({ size = 20, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const MarketIcon = ({ size = 20, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13v6a2 2 0 002 2h6a2 2 0 002-2v-6M9 19h6" />
  </svg>
);


function BottomTabs({ activeTab, setActiveTab, t, currentUser }) {
  const canAccessManagement = canAccessFeature(currentUser?.role, 'management-dashboard') || 
                             canAccessFeature(currentUser?.role, 'analytics-dashboard');
  
  // Department Dashboard access: managers, heads, admins, and management roles
  const canAccessDepartmentDashboard = currentUser?.role === ROLES.ADMIN || 
                                      currentUser?.role === ROLES.HEAD || 
                                      currentUser?.role === ROLES.MANAGEMENT;
  
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40">
      <div className="flex justify-around items-center h-16 px-2">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            activeTab === 'tasks' 
              ? 'text-brand-600 border-t-2 border-brand-600' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <TasksIcon size={20} className="mb-1" />
          <span className="text-xs font-medium">{t('tasks')}</span>
        </button>
        
        <button
          onClick={() => setActiveTab('points')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            activeTab === 'points' 
              ? 'text-brand-600 border-t-2 border-brand-600' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <PointsIcon size={20} className="mb-1" />
          <span className="text-xs font-medium">{t('points')}</span>
        </button>

        {/* Market Tab - Visible to everyone */}
        <button
          onClick={() => setActiveTab('market')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            activeTab === 'market' 
              ? 'text-brand-600 border-t-2 border-brand-600' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <MarketIcon size={20} className="mb-1" />
          <span className="text-xs font-medium">{t('market') || 'Market'}</span>
        </button>

        {/* Department Dashboard - Managers, Heads, Admins, and Management */}
        {canAccessDepartmentDashboard && (
          <button
            onClick={() => setActiveTab('department')}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              activeTab === 'department' 
                ? 'text-brand-600 border-t-2 border-brand-600' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <DepartmentIcon size={20} className="mb-1" />
            <span className="text-xs font-medium">{t('deptDashboard') || 'Department'}</span>
          </button>
        )}

        {/* Management Dashboard - Management and Admin */}
        {canAccessManagement && (
          <button
            onClick={() => setActiveTab('management')}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              activeTab === 'management' 
                ? 'text-brand-600 border-t-2 border-brand-600' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ManagementIcon size={20} className="mb-1" />
            <span className="text-xs font-medium">Management</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default BottomTabs;
