import React, { useState, useEffect } from 'react';
import { ROLES } from '../../../shared/constants';
import DepartmentDashboard from './DepartmentDashboard.jsx';
import Section from '../../../shared/components/Section.jsx';

function DepartmentDashboardTab({ currentUser, users, departments, tasks, t, onUpdateTask, onDeleteTask, onDeleteComment }) {
  const [dashboardDeptId, setDashboardDeptId] = useState('');
  
  const isAdmin = currentUser.role === ROLES.ADMIN;
  const isDeptHead = currentUser.role === ROLES.HEAD;
  const isManager = currentUser.role === ROLES.MANAGEMENT;
  
  // Get the department ID for the current user (only use departmentIds)
  const getUserDepartmentId = (user) => {
    if (user.departmentIds && Array.isArray(user.departmentIds) && user.departmentIds.length > 0) {
      return user.departmentIds[0]; // Use first department as primary
    }
    return '';
  };

  const viewingDeptId = (isAdmin || isDeptHead || isManager) ? dashboardDeptId : getUserDepartmentId(currentUser);
  const viewingDept = departments.find((d) => d.id === viewingDeptId);
  
  const deptTasks = viewingDeptId === 'all' 
    ? tasks 
    : tasks.filter((t) => t.departmentId === viewingDeptId);
    
  const deptUsers = viewingDeptId === 'all' 
    ? users 
    : users.filter((u) => {
        if (!u) return false;
        if (Array.isArray(u.departmentIds)) return u.departmentIds.includes(viewingDeptId);
        return false;
      });

  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === ROLES.ADMIN) {
        setDashboardDeptId('all');
      } else {
        const firstDept = getUserDepartmentId(currentUser);
        setDashboardDeptId(firstDept);
      }
    }
  }, [currentUser]);

  // Filter users by department (only use departmentIds)
  const isUserInDepartment = (user, deptId) => {
    if (!deptId || deptId === 'all') return true;
    
    // Check departmentIds array
    if (user.departmentIds && Array.isArray(user.departmentIds)) {
      return user.departmentIds.includes(deptId);
    }
    
    return false;
  };

  return (
    <div className="space-y-4 pb-20">
      <Section title={`${t('deptDashboard')} – ${viewingDeptId === 'all' ? t('allDepartments') : viewingDept?.name || '-'}`}>
        <DepartmentDashboard 
          users={deptUsers} 
          tasks={deptTasks} 
          allUsers={users} 
          departments={departments}
          currentUser={currentUser}
          onUpdateTask={onUpdateTask}
          deleteTask={onDeleteTask}
          onDeleteComment={onDeleteComment}
          t={t}
          dashboardDeptId={dashboardDeptId}
          setDashboardDeptId={setDashboardDeptId}
          isAdmin={isAdmin}
          isDeptHead={isDeptHead}
          isManager={isManager}
        />
      </Section>
    </div>
  );
}

export default DepartmentDashboardTab;
