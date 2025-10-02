import React, { useState, useMemo, useEffect, useRef } from 'react';
import { STATUSES, DIFFICULTY_CONFIG, DIFFICULTY_LEVELS, ROLES } from '../../../shared/constants.js';
import { formatDateTime, formatDateOnly, toSafeDate } from '../../../shared/utils/date.js';
import EditTaskModal from '../../tasks/components/EditTaskModal.jsx';
import useTasks from '../../tasks/hooks/useTasks.js';

export default function TaskManagement({ tasks, users, departments, currentUser, t, onTaskFeedback }) {
  // Get task operations from useTasks hook
  const { updateTask, deleteTask } = useTasks(currentUser);
  
  const [sortField, setSortField] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');
  const [statusFilter, setStatusFilter] = useState([STATUSES.PENDING, STATUSES.ONGOING]); // Changed default to pending and ongoing
  const [departmentFilter, setDepartmentFilter] = useState([]);
  const [urgencyFilter, setUrgencyFilter] = useState([]);
  const [difficultyFilter, setDifficultyFilter] = useState([]);
  const [personFilter, setPersonFilter] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSummary, setShowSummary] = useState(false); // New state for summary visibility
  const [showFilters, setShowFilters] = useState(false); // New state for filters visibility
  
  // Dropdown open states
  const [openDropdown, setOpenDropdown] = useState(null);
  
  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState([
    'title', 'status', 'department', 'assignedBy', 'assignedUsers', 'urgency', 'difficulty', 'targetDate', 'createdAt', 'actions'
  ]);

  // Task detail modal state
  const [selectedTask, setSelectedTask] = useState(null);
  const [isTaskDetailOpen, setIsTaskDetailOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Edit task modal state
  const [editingTask, setEditingTask] = useState(null);
  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown && !event.target.closest(`#${openDropdown}-dropdown`) && !event.target.closest(`#${openDropdown}-button`)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdown]);

  const toggleDropdown = (dropdownId) => {
    setOpenDropdown(openDropdown === dropdownId ? null : dropdownId);
  };

  const isDropdownOpen = (dropdownId) => openDropdown === dropdownId;

  // Task action handlers
  const handleViewTask = (task) => {
    setSelectedTask(task);
    setIsTaskDetailOpen(true);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setIsEditTaskModalOpen(true);
  };

  const closeTaskDetail = () => {
    setIsTaskDetailOpen(false);
    setSelectedTask(null);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedTask(null);
  };
  
  const closeEditTaskModal = () => {
    setIsEditTaskModalOpen(false);
    setEditingTask(null);
  };

  // Delete comment handler for admin
  const handleDeleteComment = async (taskId, commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
      return;
    }

    try {
      // Find the task
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        console.error('Task not found');
        return;
      }

      // Remove the comment from the task's comments array
      const updatedComments = (task.comments || []).filter(comment => comment.id !== commentId);
      
      // Update the task with the new comments array
      await updateTask(taskId, { comments: updatedComments }, currentUser);

      // Update the selected task in the modal if it's the same task
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask({ ...selectedTask, comments: updatedComments });
      }

      console.log('Comment deleted successfully');
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('Failed to delete comment. Please try again.');
    }
  };

  // Filter and sort tasks
  const filteredAndSortedTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      // Hide deleted tasks from regular users (only admins can see them)
      if (task.status === STATUSES.DELETED && currentUser.role !== ROLES.ADMIN) {
        return false;
      }
      
      // Status filter
      if (statusFilter.length > 0 && !statusFilter.includes(task.status)) return false;
      
      // Department filter
      if (departmentFilter.length > 0 && !departmentFilter.includes(task.departmentId)) return false;
      
      // Urgency filter
      if (urgencyFilter.length > 0) {
        const isUrgent = task.isUrgent;
        const hasBlocking = task.hasBlockingTasks;
        if (!urgencyFilter.includes('urgent') && !urgencyFilter.includes('blocked') && !urgencyFilter.includes('normal')) return false;
        if (urgencyFilter.includes('urgent') && !isUrgent) return false;
        if (urgencyFilter.includes('blocked') && !hasBlocking) return false;
        if (urgencyFilter.includes('normal') && (isUrgent || hasBlocking)) return false;
      }
      
      // Difficulty filter
      if (difficultyFilter.length > 0 && !difficultyFilter.includes(task.difficulty)) return false;
      
      // Person filter
      if (personFilter.length > 0) {
        const assignedUserIds = task.assignedUserIds || [];
        const hasMatchingPerson = personFilter.some(personId => assignedUserIds.includes(personId));
        if (!hasMatchingPerson) return false;
      }
      
      // Search query
      if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase()) && 
          !task.notes?.some(note => note.text?.toLowerCase().includes(searchQuery.toLowerCase()))) {
        return false;
      }
      
      return true;
    });

    // Sort tasks
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'title':
          aValue = a.title?.toLowerCase() || '';
          bValue = b.title?.toLowerCase() || '';
          break;
        case 'status':
          aValue = a.status || '';
          bValue = b.status || '';
          break;
        case 'department':
          aValue = departments.find(d => d.id === a.departmentId)?.name || '';
          bValue = departments.find(d => d.id === b.departmentId)?.name || '';
          break;
        case 'assignedBy':
          aValue = users.find(u => u.id === a.assignedById)?.name || '';
          bValue = users.find(u => u.id === b.assignedById)?.name || '';
          break;
        case 'assignedUsers':
          aValue = a.assignedUserIds?.length || 0;
          bValue = b.assignedUserIds?.length || 0;
          break;
        case 'urgency':
          aValue = (a.isUrgent ? 2 : 0) + (a.hasBlockingTasks ? 1 : 0);
          bValue = (b.isUrgent ? 2 : 0) + (b.hasBlockingTasks ? 1 : 0);
          break;
        case 'difficulty':
          aValue = DIFFICULTY_CONFIG[a.difficulty]?.points || 0;
          bValue = DIFFICULTY_CONFIG[b.difficulty]?.points || 0;
          break;
        case 'targetDate':
          aValue = toSafeDate(a.targetDate) || new Date(0);
          bValue = toSafeDate(b.targetDate) || new Date(0);
          break;
        case 'createdAt':
        default: {
          const aDate = toSafeDate(a.createdAt) || toSafeDate(a.updatedAt) || toSafeDate(a.startedAt) || new Date(0);
          const bDate = toSafeDate(b.createdAt) || toSafeDate(b.updatedAt) || toSafeDate(b.startedAt) || new Date(0);
          aValue = aDate; bValue = bDate;
          break;
        }
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [tasks, sortField, sortDirection, statusFilter, departmentFilter, urgencyFilter, difficultyFilter, personFilter, searchQuery, departments]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleMultiSelect = (filterType, value, checked) => {
    switch (filterType) {
      case 'status':
        setStatusFilter(prev => checked ? [...prev, value] : prev.filter(v => v !== value));
        break;
      case 'department':
        setDepartmentFilter(prev => checked ? [...prev, value] : prev.filter(v => v !== value));
        break;
      case 'urgency':
        setUrgencyFilter(prev => checked ? [...prev, value] : prev.filter(v => v !== value));
        break;
      case 'difficulty':
        setDifficultyFilter(prev => checked ? [...prev, value] : prev.filter(v => v !== value));
        break;
      case 'person':
        setPersonFilter(prev => checked ? [...prev, value] : prev.filter(v => v !== value));
        break;
    }
  };

  const clearAllFilters = () => {
    setStatusFilter([]);
    setDepartmentFilter([]);
    setUrgencyFilter([]);
    setDifficultyFilter([]);
    setPersonFilter([]);
    setSearchQuery('');
  };

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => 
      prev.includes(columnKey) 
        ? prev.filter(key => key !== columnKey)
        : [...prev, columnKey]
    );
  };

  const exportToCSV = () => {
    const headers = visibleColumnsData.map(col => col.label).join(',');
    const rows = filteredAndSortedTasks.map(task => {
      const row = visibleColumns.map(col => {
        switch (col) {
          case 'title':
            return `"${task.title}"`;
          case 'status':
            return task.status;
          case 'department':
            return departments.find(d => d.id === task.departmentId)?.name || '';
          case 'assignedBy':
            return users.find(u => u.id === task.assignedById)?.name || '';
          case 'assignedUsers':
            return task.assignedUserIds?.map(id => users.find(u => u.id === id)?.name).join('; ') || '';
          case 'urgency':
            return getUrgencyText(task);
          case 'difficulty':
            return task.difficulty ? `${task.difficulty} (${task.points} pts)` : '';
          case 'targetDate':
            return task.targetDate ? formatDateOnly(task.targetDate) : '';
          case 'createdAt': {
            const d = toSafeDate(task.createdAt) || toSafeDate(task.updatedAt) || toSafeDate(task.startedAt);
            return d ? formatDateTime(d) : 'N/A';
          }
          default:
            return '';
        }
      });
      return row.join(',');
    });
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case STATUSES.COMPLETE: return 'bg-green-100 text-green-800';
      case STATUSES.ONGOING: return 'bg-blue-100 text-blue-800';
      case STATUSES.PENDING: return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case DIFFICULTY_LEVELS.EASY: return 'bg-green-100 text-green-800';
      case DIFFICULTY_LEVELS.MEDIUM: return 'bg-blue-100 text-blue-800';
      case DIFFICULTY_LEVELS.HARD: return 'bg-orange-100 text-orange-800';
      case DIFFICULTY_LEVELS.CRITICAL: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyIcon = (task) => {
    if (task.isUrgent) return '🚨';
    if (task.hasBlockingTasks) return '🔒';
    return '📋';
  };

  const getUrgencyText = (task) => {
    if (task.isUrgent) return 'Urgent';
    if (task.hasBlockingTasks) return 'Blocked';
    return 'Normal';
  };

  const getUrgencyColor = (task) => {
    if (task.isUrgent) return 'bg-red-100 text-red-800';
    if (task.hasBlockingTasks) return 'bg-orange-100 text-orange-800';
    return 'bg-gray-100 text-gray-800';
  };

  const allColumns = [
    { key: 'title', label: 'Task Title', sortable: true },
    { key: 'department', label: 'Department', sortable: true },
    { key: 'assignedBy', label: 'Assigned By', sortable: true },
    { key: 'assignedUsers', label: 'Assigned To', sortable: true },
    { key: 'difficulty', label: 'Difficulty', sortable: true },
    { key: 'urgency', label: 'Urgency', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'targetDate', label: 'Target Date', sortable: true },
    { key: 'createdAt', label: 'Created Date', sortable: true },
    { key: 'actions', label: 'Actions', sortable: false }
  ];

  const visibleColumnsData = allColumns.filter(col => visibleColumns.includes(col.key));

  // Summary statistics
  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter(t => t.status === STATUSES.PENDING).length;
  const ongoingTasks = tasks.filter(t => t.status === STATUSES.ONGOING).length;
  const completedTasks = tasks.filter(t => t.status === STATUSES.COMPLETE).length;
  const urgentTasks = tasks.filter(t => t.isUrgent).length;
  const blockedTasks = tasks.filter(t => t.hasBlockingTasks).length;

  // Helper function to get filter display text
  const getFilterDisplayText = (filterType, selectedValues, allOptions) => {
    if (selectedValues.length === 0) return `All ${filterType}`;
    if (selectedValues.length === 1) {
      const option = allOptions.find(opt => opt.value === selectedValues[0]);
      return option ? option.label : selectedValues[0];
    }
    if (selectedValues.length === allOptions.length) return `All ${filterType}`;
    return `${selectedValues.length} ${filterType} selected`;
  };

  const getSortIcon = (columnKey) => {
    const isActive = sortField === columnKey;
    const isAsc = sortDirection === 'asc';
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isActive ? '#2563eb' : '#94a3b8'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ml-1"
      >
        {isActive ? (
          isAsc ? (
            <polyline points="6 15 12 9 18 15" />
          ) : (
            <polyline points="6 9 12 15 18 9" />
          )
        ) : (
          <>
            <polyline points="8 10 12 6 16 10" />
            <polyline points="8 14 12 18 16 14" />
          </>
        )}
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Export and Clear Filters */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Management Dashboard</h2>
        <div className="flex gap-3">
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            📊 Export CSV
          </button>
          <button
            onClick={clearAllFilters}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      </div>

      {/* Summary Statistics Toggle */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Task Overview</h3>
        <button
          onClick={() => setShowSummary(!showSummary)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          {showSummary ? 'Hide Summary' : 'Show Summary'}
          <svg
            className={`w-4 h-4 transition-transform ${showSummary ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Summary Statistics */}
      {showSummary && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{totalTasks}</div>
            <div className="text-sm text-gray-600">Total</div>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{pendingTasks}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{ongoingTasks}</div>
            <div className="text-sm text-gray-600">Ongoing</div>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{completedTasks}</div>
            <div className="text-sm text-gray-600">Completed</div>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{urgentTasks}</div>
            <div className="text-sm text-gray-600">Urgent</div>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{blockedTasks}</div>
            <div className="text-sm text-gray-600">Blocked</div>
          </div>
        </div>
      )}

      {/* Search and Filter Controls */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          {/* Search */}
          <div className="flex-1 min-w-64">
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              placeholder="Search tasks by title or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Show Filters Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors border border-gray-300 rounded-md hover:bg-gray-50"
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
              <svg
                className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Advanced Filters - Hidden by default */}
        {showFilters && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex flex-wrap gap-4 items-end">
              {/* Status Filter */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <div className="relative">
                  <button
                    type="button"
                    id="status-button"
                    className={`relative w-56 bg-white border border-gray-300 rounded-md shadow-sm px-3 py-2 text-left focus:outline-none ${isDropdownOpen('status') ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-400'}`}
                    onClick={() => toggleDropdown('status')}
                  >
                    <span className="block truncate text-sm text-gray-700">
                      {getFilterDisplayText('Statuses', statusFilter, [
                        { value: STATUSES.PENDING, label: 'Pending' },
                        { value: STATUSES.ONGOING, label: 'Ongoing' },
                        { value: STATUSES.COMPLETE, label: 'Complete' }
                      ])}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                      {getSortIcon('status-filter')}
                    </span>
                  </button>
                  <div id="status-dropdown" className={isDropdownOpen('status') ? "block absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm" : "hidden absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"}>
                    {[
                      { value: STATUSES.PENDING, label: 'Pending' },
                      { value: STATUSES.ONGOING, label: 'Ongoing' },
                      { value: STATUSES.COMPLETE, label: 'Complete' }
                    ].map(option => (
                      <label key={option.value} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={statusFilter.includes(option.value)}
                          onChange={(e) => handleMultiSelect('status', option.value, e.target.checked)}
                          className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Department Filter */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                <div className="relative">
                  <button
                    type="button"
                    className={`relative w-56 bg-white border border-gray-300 rounded-md shadow-sm px-3 py-2 text-left focus:outline-none ${isDropdownOpen('department') ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-400'}`}
                    onClick={() => toggleDropdown('department')}
                  >
                    <span className="block truncate">
                      {getFilterDisplayText('Departments', departmentFilter, departments.map(dept => ({ value: dept.id, label: dept.name })))}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </button>
                  <div id="department-dropdown" className={isDropdownOpen('department') ? "block absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm" : "hidden absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"}>
                    {departments.map(dept => (
                      <label key={dept.id} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={departmentFilter.includes(dept.id)}
                          onChange={(e) => handleMultiSelect('department', dept.id, e.target.checked)}
                          className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{dept.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Urgency Filter */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">Urgency</label>
                <div className="relative">
                  <button
                    type="button"
                    id="urgency-button"
                    className={`relative w-56 bg-white border border-gray-300 rounded-md shadow-sm px-3 py-2 text-left focus:outline-none ${isDropdownOpen('urgency') ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-400'}`}
                    onClick={() => toggleDropdown('urgency')}
                  >
                    <span className="block truncate text-sm text-gray-700">
                      {getFilterDisplayText('Urgency', urgencyFilter, [
                        { value: 'urgent', label: '🚨 Urgent' },
                        { value: 'blocked', label: '🔒 Blocked' },
                        { value: 'normal', label: '📋 Normal' }
                      ])}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                      {getSortIcon('urgency-filter')}
                    </span>
                  </button>
                  <div id="urgency-dropdown" className={isDropdownOpen('urgency') ? "block absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm" : "hidden absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"}>
                    {[
                      { value: 'urgent', label: '🚨 Urgent' },
                      { value: 'blocked', label: '🔒 Blocked' },
                      { value: 'normal', label: '📋 Normal' }
                    ].map(option => (
                      <label key={option.value} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={urgencyFilter.includes(option.value)}
                          onChange={(e) => handleMultiSelect('urgency', option.value, e.target.checked)}
                          className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Difficulty Filter */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty</label>
                <div className="relative">
                  <button
                    type="button"
                    id="difficulty-button"
                    className={`relative w-56 bg-white border border-gray-300 rounded-md shadow-sm px-3 py-2 text-left focus:outline-none ${isDropdownOpen('difficulty') ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-400'}`}
                    onClick={() => toggleDropdown('difficulty')}
                  >
                    <span className="block truncate text-sm text-gray-700">
                      {getFilterDisplayText('Difficulties', difficultyFilter, Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => ({ value: key, label: `${config.label} (${config.points} pts)` })))}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                      {getSortIcon('difficulty-filter')}
                    </span>
                  </button>
                  <div id="difficulty-dropdown" className={isDropdownOpen('difficulty') ? "block absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm" : "hidden absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"}>
                    {Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => (
                      <label key={key} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={difficultyFilter.includes(key)}
                          onChange={(e) => handleMultiSelect('difficulty', key, e.target.checked)}
                          className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{config.label} ({config.points} pts)</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Person Filter */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">Assigned Person</label>
                <div className="relative">
                  <button
                    type="button"
                    id="person-button"
                    className={`relative w-56 bg-white border border-gray-300 rounded-md shadow-sm px-3 py-2 text-left focus:outline-none ${isDropdownOpen('person') ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-400'}`}
                    onClick={() => toggleDropdown('person')}
                  >
                    <span className="block truncate text-sm text-gray-700">
                      {getFilterDisplayText('People', personFilter, users.map(user => ({ value: user.id, label: user.name })))}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                      {getSortIcon('person-filter')}
                    </span>
                  </button>
                  <div id="person-dropdown" className={isDropdownOpen('person') ? "block absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm" : "hidden absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"}>
                    {users.map(user => (
                      <label key={user.id} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={personFilter.includes(user.id)}
                          onChange={(e) => handleMultiSelect('person', user.id, e.target.checked)}
                          className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{user.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table Columns Filter */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">Table Columns</label>
                <div className="relative">
                  <button
                    type="button"
                    id="columns-button"
                    className={`relative w-56 bg-white border border-gray-300 rounded-md shadow-sm px-3 py-2 text-left focus:outline-none ${isDropdownOpen('columns') ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-400'}`}
                    onClick={() => toggleDropdown('columns')}
                  >
                    <span className="block truncate text-sm text-gray-700">
                      {visibleColumns.length === allColumns.length ? 'All Columns' : `${visibleColumns.length} of ${allColumns.length} columns`}
                    </span>
                    <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </button>
                  <div id="columns-dropdown" className={isDropdownOpen('columns') ? "block absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm" : "hidden absolute z-10 mt-1 w-56 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"}>
                    {allColumns.map(column => (
                      <label key={column.key} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(column.key)}
                          onChange={() => toggleColumn(column.key)}
                          className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sort Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="createdAt">Created Date</option>
                  <option value="title">Task Title</option>
                  <option value="status">Status</option>
                  <option value="department">Department</option>
                  <option value="assignedBy">Assigned By</option>
                  <option value="assignedUsers">Assigned Users</option>
                  <option value="urgency">Urgency</option>
                  <option value="difficulty">Difficulty</option>
                  <option value="targetDate">Target Date</option>
                </select>
              </div>

              {/* Sort Direction */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Order</label>
                <select
                  value={sortDirection}
                  onChange={(e) => setSortDirection(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="desc">Newest First</option>
                  <option value="asc">Oldest First</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Results Count */}
        <div className="text-sm text-gray-600 pt-4 border-t mt-4">
          Showing {filteredAndSortedTasks.length} of {tasks.length} tasks
        </div>
      </div>



      {/* Tasks Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {visibleColumnsData.map(column => (
                  <th
                    key={column.key}
                    className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${column.sortable ? 'cursor-pointer select-none' : ''} ${sortField === column.key ? 'text-blue-600' : 'text-gray-500'}`}
                    onClick={() => column.sortable && handleSort(column.key)}
                  >
                    <div className="flex items-center gap-1">
                      <span>{column.label}</span>
                      {column.sortable && getSortIcon(column.key)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedTasks.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50">
                  {visibleColumnsData.map((column) => (
                    <td key={column.key} className="px-4 py-3">
                      {(() => {
                        switch (column.key) {
                          case 'title':
                            return (
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{getUrgencyIcon(task)}</span>
                                <div>
                                  <div className="font-medium text-gray-900">{task.title}</div>
                                  {task.notes && Array.isArray(task.notes) && task.notes.length > 0 && task.notes[0]?.text && (
                                    <div className="text-sm text-gray-500 line-clamp-1">{task.notes[0].text}</div>
                                  )}
                                </div>
                              </div>
                            );
                          case 'department':
                            return (
                              <span className="text-sm text-gray-900">{departments.find(d => d.id === task.departmentId)?.name || 'Unknown'}</span>
                            );
                          case 'assignedBy':
                            return (
                              <span className="text-sm text-gray-900">{task.assignedById ? users.find(u => u.id === task.assignedById)?.name || 'Unknown' : 'Unknown'}</span>
                            );
                          case 'assignedUsers':
                            return (
                              <span className="text-sm text-gray-900">{task.assignedUserIds?.map(userId => {
                                const user = users.find(u => u.id === userId);
                                return user?.name || 'Unknown';
                              }).join(', ') || 'Unassigned'}</span>
                            );
                          case 'difficulty':
                            return task.difficulty ? (
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getDifficultyColor(task.difficulty)}`}>
                                {DIFFICULTY_CONFIG[task.difficulty]?.label} ({DIFFICULTY_CONFIG[task.difficulty]?.points} pts)
                              </span>
                            ) : (
                              <span className="text-sm text-gray-500">Not set</span>
                            );
                          case 'urgency':
                            return (
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getUrgencyColor(task)}`}>{getUrgencyText(task)}</span>
                            );
                          case 'status':
                            return (
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(task.status)}`}>{task.status}</span>
                            );
                          case 'targetDate':
                            return (
                              <span className="text-sm text-gray-900">{task.targetDate ? formatDateOnly(task.targetDate) : 'No date'}</span>
                            );
                          case 'createdAt': {
                            const d = toSafeDate(task.createdAt) || toSafeDate(task.updatedAt) || toSafeDate(task.startedAt);
                            return (<span className="text-sm text-gray-900">{d ? formatDateTime(d) : 'N/A'}</span>);
                          }
                          case 'actions':
                            return (
                              <div className="flex items-center gap-2 text-sm text-gray-900">
                                <button className="text-blue-600 hover:text-blue-800 text-xs" onClick={() => handleViewTask(task)}>View</button>
                                <button className="text-green-600 hover:text-green-800 text-xs" onClick={() => handleEditTask(task)}>Edit</button>
                              </div>
                            );
                          default:
                            return null;
                        }
                      })()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {filteredAndSortedTasks.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks found</h3>
            <p className="text-gray-500">Try adjusting your filters or search query</p>
          </div>
        )}
      </div>

      {/* Task Detail Modal */}
      {isTaskDetailOpen && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Task Details</h3>
              <button
                onClick={closeTaskDetail}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Basic Information</h4>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Title:</span>
                      <p className="text-gray-900">{selectedTask.title}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Status:</span>
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(selectedTask.status)}`}>
                        {selectedTask.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Department:</span>
                      <p className="text-gray-900">{departments.find(d => d.id === selectedTask.departmentId)?.name || 'Unknown'}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Difficulty:</span>
                      {selectedTask.difficulty ? (
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getDifficultyColor(selectedTask.difficulty)}`}>
                          {DIFFICULTY_CONFIG[selectedTask.difficulty]?.label} ({DIFFICULTY_CONFIG[selectedTask.difficulty]?.points} pts)
                        </span>
                      ) : (
                        <span className="text-gray-500">Not set</span>
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Urgency:</span>
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getUrgencyColor(selectedTask)}`}>
                        {getUrgencyText(selectedTask)}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Timeline & Assignment</h4>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Created:</span>
                      <p className="text-gray-900">{(toSafeDate(selectedTask.createdAt) || toSafeDate(selectedTask.updatedAt) || toSafeDate(selectedTask.startedAt)) ? formatDateTime(toSafeDate(selectedTask.createdAt) || toSafeDate(selectedTask.updatedAt) || toSafeDate(selectedTask.startedAt)) : 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Target Date:</span>
                      <p className="text-gray-900">{selectedTask.targetDate ? formatDateOnly(selectedTask.targetDate) : 'No date set'}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Assigned By:</span>
                      <p className="text-gray-900">
                        {selectedTask.assignedById ? users.find(u => u.id === selectedTask.assignedById)?.name || 'Unknown' : 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Assigned To:</span>
                      <p className="text-gray-900">
                        {selectedTask.assignedUserIds?.map(userId => {
                          const user = users.find(u => u.id === userId);
                          return user?.name || 'Unknown';
                        }).join(', ') || 'Unassigned'}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Points:</span>
                      <p className="text-gray-900">{selectedTask.points || 0} points</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Notes Section */}
              {selectedTask.notes && Array.isArray(selectedTask.notes) && selectedTask.notes.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Notes</h4>
                  <div className="space-y-2">
                    {selectedTask.notes.map((note, index) => (
                      <div key={index} className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-gray-700">{note.text}</p>
                        {note.timestamp && (
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDateTime(note.timestamp)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comments Section */}
              {selectedTask.comments && selectedTask.comments.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Comments ({selectedTask.comments.length})
                  </h4>
                  <div className="space-y-3">
                    {selectedTask.comments.map((comment) => (
                      <div key={comment.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-xs font-medium text-blue-700">
                                {comment.userName?.charAt(0)?.toUpperCase() || 'U'}
                              </span>
                            </div>
                            <span className="font-medium text-sm text-gray-900">
                              {comment.userName || 'Unknown User'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {new Date(comment.createdAt).toLocaleDateString()} {new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                            {/* Admin Delete Button */}
                            <button
                              onClick={() => handleDeleteComment(selectedTask.id, comment.id)}
                              className="text-red-500 hover:text-red-700 text-xs ml-2 opacity-75 hover:opacity-100 transition-opacity"
                              title="Delete comment (Admin only)"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {comment.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
              <button
                onClick={() => {
                  closeTaskDetail();
                  handleEditTask(selectedTask);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Edit Task
              </button>
              <button
                onClick={closeTaskDetail}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {isEditModalOpen && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Edit Task</h3>
              <button
                onClick={closeEditModal}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Edit functionality will be implemented here. This would typically include a form to modify task properties.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800 text-sm">
                  <strong>Note:</strong> The edit form would be integrated with your existing task editing components or API calls.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={closeEditModal}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {isEditTaskModalOpen && editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Edit Task</h3>
              <button
                onClick={closeEditTaskModal}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <EditTaskModal
                task={editingTask}
                onClose={closeEditTaskModal}
                onSave={async (updated) => { 
                  try {
                    await updateTask(updated);
                    closeEditTaskModal();
                  } catch (error) {
                    console.error('Error updating task:', error);
                    // You might want to show an error message to the user here
                  }
                }}
                onDelete={async (taskId) => { 
                  try {
                    await deleteTask(taskId);
                    closeEditTaskModal();
                  } catch (error) {
                    console.error('Error deleting task:', error);
                    // You might want to show an error message to the user here
                  }
                }}
                users={users}
                departments={departments}
                currentUser={currentUser}
                t={t}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
