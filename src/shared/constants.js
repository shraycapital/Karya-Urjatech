export const ROLES = { USER: 'User', HEAD: 'Head', MANAGEMENT: 'Management', ADMIN: 'Admin' };

// Role hierarchy (higher number = more permissions)
export const ROLE_HIERARCHY = {
  [ROLES.USER]: 1,
  [ROLES.HEAD]: 2,
  [ROLES.MANAGEMENT]: 3,
  [ROLES.ADMIN]: 4
};

// Permission matrix
export const PERMISSIONS = {
  // Task Management
  VIEW_OWN_TASKS: [ROLES.USER, ROLES.HEAD, ROLES.MANAGEMENT, ROLES.ADMIN],
  CREATE_TASKS: [ROLES.USER, ROLES.HEAD, ROLES.MANAGEMENT, ROLES.ADMIN],
  VIEW_DEPARTMENT_TASKS: [ROLES.HEAD, ROLES.MANAGEMENT, ROLES.ADMIN],
  CREATE_TASKS_FOR_OTHERS: [ROLES.HEAD, ROLES.MANAGEMENT, ROLES.ADMIN],
  
  // User Management
  MANAGE_USERS: [ROLES.MANAGEMENT, ROLES.ADMIN],
  MANAGE_DEPARTMENTS: [ROLES.MANAGEMENT, ROLES.ADMIN],
  
  // Analytics & Reporting
  VIEW_ANALYTICS_DASHBOARD: [ROLES.MANAGEMENT, ROLES.ADMIN],
  VIEW_MANAGEMENT_DASHBOARD: [ROLES.MANAGEMENT, ROLES.ADMIN],
  
  // System Administration
  VIEW_PWA_ANALYTICS: [ROLES.ADMIN],
  VIEW_ACTIVITY_LOGS: [ROLES.ADMIN],
  VIEW_PWA_DASHBOARD: [ROLES.ADMIN],
  
  // Comments & Moderation
  DELETE_COMMENTS: [ROLES.ADMIN],
  ACCESS_ACTIVITY_LOGS: [ROLES.ADMIN]
};

export const STATUSES = { PENDING: 'Pending', ONGOING: 'Ongoing', COMPLETE: 'Complete', DELETED: 'Deleted', REJECTED: 'Rejected' };

export const DIFFICULTY_LEVELS = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
  CRITICAL: 'critical'
};

export const DIFFICULTY_CONFIG = {
  easy: { label: 'Easy', points: 10, time: '15 mins' },
  medium: { label: 'Medium', points: 25, time: '1 hr' },
  hard: { label: 'Hard', points: 50, time: '4 hrs' },
  critical: { label: 'Critical', points: 100, time: '1 day' }
};
