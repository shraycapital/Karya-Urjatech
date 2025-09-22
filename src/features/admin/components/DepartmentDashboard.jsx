import React, { useEffect, useMemo, useState } from 'react';
import TaskList from '../../tasks/components/TaskList.jsx';
import { STATUSES, ROLES } from '../../../shared/constants.js';
import { toSafeDate } from '../../../shared/utils/date.js';
import { toISTISOString } from '../../../shared/utils/date.js';
import { createTask } from '../../tasks/api/taskApi.js';
import { createMaterialRequest } from '../../tasks/utils/materialRequest.js';

export default function DepartmentDashboard({ users, tasks, allUsers, departments, currentUser, onUpdateTask, onLogActivity, t, deleteTask, allTasks, onDeleteComment, dashboardDeptId, setDashboardDeptId, isAdmin, isDeptHead, isManager }) {
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [isMonthFilterOpen, setIsMonthFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState([STATUSES.PENDING, STATUSES.ONGOING]); // Default to pending and ongoing
  const [searchQuery, setSearchQuery] = useState(''); // New search state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false); // New state for advanced filters
  
  const monthOptions = useMemo(
    () => [...new Set(tasks.map((t) => (toSafeDate(t.createdAt)?.getMonth())))]
      .filter((m) => typeof m === 'number')
      .map((monthIndex) => ({ value: monthIndex, label: new Date(2000, monthIndex).toLocaleString('default', { month: 'long' }) })),
    [tasks]
  );

  const handleAddComment = async (taskId, commentText) => {
    const task = (allTasks || tasks).find((t) => t.id === taskId);
    if (!task) return;

    const newComment = {
      id: Date.now().toString(),
      text: commentText,
      userId: currentUser.id,
      userName: currentUser.name,
      createdAt: new Date().toISOString(),
    };

    const updatedComments = [...(task.comments || []), newComment];
    await onUpdateTask({ id: taskId, comments: updatedComments });
  };

  const handleCreateRequest = async (requestData) => {
    try {
      await createMaterialRequest(requestData, currentUser);
      // Ensure UI reflects the change for the original task
      await onUpdateTask({ id: requestData.originalTaskId, hasBlockingTasks: true });
    } catch (error) {
      console.error('DepartmentDashboard: Error creating request:', error);
      alert('Failed to create request. Please try again.');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMonthFilterOpen && !event.target.closest('.month-filter-container')) {
        setIsMonthFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMonthFilterOpen]);

  const filteredTasks = tasks.filter(task => {
    // Hide deleted tasks from regular users (only admins can see them)
    if (task.status === STATUSES.DELETED && currentUser.role !== ROLES.ADMIN) {
      return false;
    }
    
    // Check if task matches all filters
    const matchesUser = selectedUserId === 'all' || (Array.isArray(task.assignedUserIds) && task.assignedUserIds.includes(selectedUserId));
    const matchesMonth = selectedMonths.length === 0 || selectedMonths.includes(toSafeDate(task.createdAt)?.getMonth());
    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(task.status);
    
    // Enhanced search functionality
    const matchesSearch = searchQuery === '' || (() => {
      const query = searchQuery.toLowerCase();
      
      // Search in task title
      if (task.title?.toLowerCase().includes(query)) return true;
      
      // Search in task description
      if (task.description?.toLowerCase().includes(query)) return true;
      
      // Search in assigned user names
      if (task.assignedUserIds && Array.isArray(task.assignedUserIds)) {
        const assignedUsers = allUsers.filter(user => task.assignedUserIds.includes(user.id));
        if (assignedUsers.some(user => user.name?.toLowerCase().includes(query))) return true;
      }
      
      // Search in task ID
      if (task.id?.toLowerCase().includes(query)) return true;
      
      // Search in department name
      if (task.departmentId) {
        const department = departments.find(d => d.id === task.departmentId);
        if (department?.name?.toLowerCase().includes(query)) return true;
      }
      
      return false;
    })();
    
    return matchesUser && matchesMonth && matchesStatus && matchesSearch;
  });

  // Sorting helpers
  const getRelevantDate = (t) => {
    const d = toSafeDate(t?.completedAt) || toSafeDate(t?.updatedAt) || toSafeDate(t?.createdAt) || toSafeDate(t?.timestamp);
    return d ? d.getTime() : 0;
  };
  const getTaskPoints = (t) => {
    if (typeof t?.points === 'number') return t.points;
    return (t?.difficulty && (typeof t.difficulty === 'string')) ? (t.difficulty.toLowerCase() === 'easy' ? 10 : t.difficulty.toLowerCase() === 'medium' ? 25 : t.difficulty.toLowerCase() === 'hard' ? 50 : t.difficulty.toLowerCase() === 'critical' ? 100 : 0) : 0;
  };

  const handleMonthToggle = (monthValue) => {
    setSelectedMonths(prev => prev.includes(monthValue) ? prev.filter(m => m !== monthValue) : [...prev, monthValue]);
  };

  return (
    <div className="space-y-3">
      {/* Status Filter Buttons - Top Priority */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter([])}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
              statusFilter.length === 0
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <span>All Tasks</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none transition-colors ${
                statusFilter.length === 0
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {tasks.length}
            </span>
          </button>
          <button
            onClick={() => setStatusFilter(prev => prev.includes(STATUSES.PENDING) ? prev.filter(s => s !== STATUSES.PENDING) : [...prev, STATUSES.PENDING])}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
              statusFilter.includes(STATUSES.PENDING)
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <span>Pending</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none transition-colors ${
                statusFilter.includes(STATUSES.PENDING)
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {tasks.filter(t => t.status === STATUSES.PENDING).length}
            </span>
          </button>
          <button
            onClick={() => setStatusFilter(prev => prev.includes(STATUSES.ONGOING) ? prev.filter(s => s !== STATUSES.ONGOING) : [...prev, STATUSES.ONGOING])}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
              statusFilter.includes(STATUSES.ONGOING)
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <span>Ongoing</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none transition-colors ${
                statusFilter.includes(STATUSES.ONGOING)
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {tasks.filter(t => t.status === STATUSES.ONGOING).length}
            </span>
          </button>
          <button
            onClick={() => setStatusFilter(prev => prev.includes(STATUSES.COMPLETE) ? prev.filter(s => s !== STATUSES.COMPLETE) : [...prev, STATUSES.COMPLETE])}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
              statusFilter.includes(STATUSES.COMPLETE)
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <span>Completed</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none transition-colors ${
                statusFilter.includes(STATUSES.COMPLETE)
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {tasks.filter(t => t.status === STATUSES.COMPLETE).length}
            </span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-3">
        <div className="relative">
          <input
            type="text"
            placeholder={t('searchTasks') || 'Search tasks by title, description, user, or department...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('');
                e.target.blur();
              }
            }}
            className="w-full px-4 py-2 pl-10 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            aria-label="Search tasks"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="mt-2 text-sm text-slate-500">
            Searching for: <span className="font-medium">"{searchQuery}"</span>
            <span className="ml-2 text-slate-400">
              ({filteredTasks.length} of {tasks.length} tasks)
            </span>
            <button
              onClick={() => setSearchQuery('')}
              className="ml-2 text-blue-600 hover:text-blue-800 underline"
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      {/* Show Filters Button */}
      <div className="mb-3">
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <svg className={`w-4 h-4 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {showAdvancedFilters ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>

      {/* Advanced Filters - Collapsible */}
      {showAdvancedFilters && (
        <div className="mb-3 p-3 bg-slate-50 rounded-lg border">
          <div className={`grid grid-cols-1 gap-3 items-end ${(isAdmin || isDeptHead || isManager) ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {/* Department Selection Filter - Only show for Admin/Head/Manager */}
            {(isAdmin || isDeptHead || isManager) && (
              <div>
                <label className="text-xs text-slate-500 mr-2">{t('viewDept') || 'Department'}</label>
                <select value={dashboardDeptId} onChange={(e) => setDashboardDeptId(e.target.value)} className="select">
                  {isAdmin && <option value="all">{t('allDepartments')}</option>}
                  {(isAdmin ? departments : departments.filter(d => currentUser.departmentIds?.includes(d.id))).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
        <div>
          <label className="text-xs text-slate-500 mr-2">{t('filterByUser')}</label>
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="select">
            <option value="all">{t('allUsers')}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="relative month-filter-container">
          <label className="text-xs text-slate-500 mr-2">{t('filterByMonth')}</label>
          <button onClick={() => setIsMonthFilterOpen(!isMonthFilterOpen)} className="select text-left w-full">
            {selectedMonths.length === 0 ? t('allMonths') : selectedMonths.map(m => monthOptions.find(opt => opt.value === m)?.label).join(', ')}
          </button>
          {isMonthFilterOpen && (
            <div className="absolute z-10 top-full mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {monthOptions.map(month => (
                <label key={month.value} className="flex items-center p-2 hover:bg-slate-50 text-sm">
                  <input type="checkbox" checked={selectedMonths.includes(month.value)} onChange={() => handleMonthToggle(month.value)} className="mr-2" />
                  {month.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
          
          {/* Clear All Filters Button */}
          {(searchQuery || selectedUserId !== 'all' || selectedMonths.length > 0 || statusFilter.length > 0) && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedUserId('all');
                  setSelectedMonths([]);
                  setStatusFilter([STATUSES.PENDING, STATUSES.ONGOING]);
                }}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}




      <TaskList
        tasks={filteredTasks}
        allTasks={allTasks || tasks}
        onUpdateTask={onUpdateTask}
        users={allUsers}
        departments={departments}
        t={t}
        currentUser={currentUser}
        isReadOnly={false}
        onLogActivity={onLogActivity}
        deleteTask={deleteTask}
        onAddComment={handleAddComment}
        onDeleteComment={onDeleteComment}
        onCreateRequest={handleCreateRequest}
        showAssignedUsers={true}
      />
    </div>
  );
}



