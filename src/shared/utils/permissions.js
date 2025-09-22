import { ROLES, PERMISSIONS, ROLE_HIERARCHY } from '../constants.js';

/**
 * Check if a user has a specific permission
 * @param {string} userRole - The user's role
 * @param {string} permission - The permission to check
 * @returns {boolean} - Whether the user has the permission
 */
export const hasPermission = (userRole, permission) => {
  if (!userRole || !permission) return false;
  
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) return false;
  
  return allowedRoles.includes(userRole);
};

/**
 * Check if a user has any of the specified permissions
 * @param {string} userRole - The user's role
 * @param {string[]} permissions - Array of permissions to check
 * @returns {boolean} - Whether the user has any of the permissions
 */
export const hasAnyPermission = (userRole, permissions) => {
  if (!userRole || !permissions || !Array.isArray(permissions)) return false;
  
  return permissions.some(permission => hasPermission(userRole, permission));
};

/**
 * Check if a user has all of the specified permissions
 * @param {string} userRole - The user's role
 * @param {string[]} permissions - Array of permissions to check
 * @returns {boolean} - Whether the user has all of the permissions
 */
export const hasAllPermissions = (userRole, permissions) => {
  if (!userRole || !permissions || !Array.isArray(permissions)) return false;
  
  return permissions.every(permission => hasPermission(userRole, permission));
};

/**
 * Check if a user's role is higher than or equal to another role
 * @param {string} userRole - The user's role
 * @param {string} requiredRole - The minimum required role
 * @returns {boolean} - Whether the user's role meets the requirement
 */
export const hasRoleOrHigher = (userRole, requiredRole) => {
  if (!userRole || !requiredRole) return false;
  
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  
  return userLevel >= requiredLevel;
};

/**
 * Get all permissions for a user role
 * @param {string} userRole - The user's role
 * @returns {string[]} - Array of permissions the user has
 */
export const getUserPermissions = (userRole) => {
  if (!userRole) return [];
  
  return Object.keys(PERMISSIONS).filter(permission => 
    hasPermission(userRole, permission)
  );
};

/**
 * Check if user can access a specific feature
 * @param {string} userRole - The user's role
 * @param {string} feature - The feature to check access for
 * @returns {boolean} - Whether the user can access the feature
 */
export const canAccessFeature = (userRole, feature) => {
  const featurePermissions = {
    'task-management': ['VIEW_OWN_TASKS', 'CREATE_TASKS'],
    'analytics-dashboard': ['VIEW_ANALYTICS_DASHBOARD'],
    'management-dashboard': ['VIEW_MANAGEMENT_DASHBOARD'],
    'user-management': ['MANAGE_USERS'],
    'department-management': ['MANAGE_DEPARTMENTS'],
    'pwa-analytics': ['VIEW_PWA_ANALYTICS'],
    'activity-logs': ['VIEW_ACTIVITY_LOGS'],
    'pwa-dashboard': ['VIEW_PWA_DASHBOARD']
  };
  
  const requiredPermissions = featurePermissions[feature];
  if (!requiredPermissions) return false;
  
  return hasAnyPermission(userRole, requiredPermissions);
};

/**
 * Get user role display name
 * @param {string} role - The role constant
 * @returns {string} - Display name for the role
 */
export const getRoleDisplayName = (role) => {
  const displayNames = {
    [ROLES.USER]: 'User',
    [ROLES.HEAD]: 'Department Head',
    [ROLES.MANAGEMENT]: 'Management',
    [ROLES.ADMIN]: 'Administrator'
  };
  
  return displayNames[role] || role;
};

/**
 * Get role description
 * @param {string} role - The role constant
 * @returns {string} - Description of the role
 */
export const getRoleDescription = (role) => {
  const descriptions = {
    [ROLES.USER]: 'Can view and manage their own tasks',
    [ROLES.HEAD]: 'Can manage department tasks and view team performance',
    [ROLES.MANAGEMENT]: 'Can manage users, departments, and view analytics (no PWA access)',
    [ROLES.ADMIN]: 'Full system access including PWA analytics and activity logs'
  };
  
  return descriptions[role] || 'Unknown role';
};
