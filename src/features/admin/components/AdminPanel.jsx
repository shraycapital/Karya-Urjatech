import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { collection, getDocs, query, where, orderBy, limit, startAfter, writeBatch, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { ROLES } from '../../../shared/constants';
import {
  addUser,
  updateUser,
  removeUser,
  addDepartment,
  updateDepartment,
  removeDepartment,
} from '../api/adminApi';
import ActivityLog from './ActivityLog.jsx';
import { canAccessFeature } from '../../../shared/utils/permissions.js';
import { cleanFirestoreData } from '../../../shared/utils/firestoreHelpers.js';

function AdminPanel({
  users,
  departments,
  notificationSettings,
  onUpdateNotificationSettings,
  currentUser,
  t,
}) {
  const handleAddUser = async (newUser) => {
    try {
      await addUser(newUser, currentUser);
      console.log('User added successfully');
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Failed to add user. Please try again.');
    }
  };
  const handleUpdateUser = async (user) => {
    const oldUser = users.find(u => u.id === user.id);
    console.log('handleUpdateUser called with:', { user, oldUser, currentUser });
    try {
      await updateUser(user, oldUser, currentUser);
      console.log('User updated successfully');
      alert('User updated successfully!');
    } catch (error) {
      console.error('Error updating user:', error);
      alert(`Failed to update user: ${error.message}. Please try again.`);
    }
  };
  const handleRemoveUser = async (userId) => {
    const user = users.find(u => u.id === userId);
    
    // Add confirmation dialog
    if (!window.confirm(`Are you sure you want to delete user "${user?.name || 'Unknown'}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await removeUser(userId, user, currentUser);
      // You could add a success notification here if you have a notification system
      console.log('User deleted successfully');
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user. Please try again.');
    }
  };

  const handleAddDepartment = (dept) => addDepartment(dept, currentUser);
  const handleUpdateDepartment = async (dept) => {
    const oldDept = departments.find(d => d.id === dept.id);
    try {
      await updateDepartment(dept, oldDept, currentUser);
      console.log('Department updated successfully');
    } catch (error) {
      console.error('Error updating department:', error);
      alert('Failed to update department. Please try again.');
    }
  };
  const handleRemoveDepartment = async (deptId) => {
    const oldDept = departments.find(d => d.id === deptId);
    
    // Add confirmation dialog
    if (!window.confirm(`Are you sure you want to delete department "${oldDept?.name || 'Unknown'}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await removeDepartment(deptId, oldDept, currentUser);
      console.log('Department deleted successfully');
    } catch (error) {
      console.error('Error deleting department:', error);
      alert('Failed to delete department. Please try again.');
    }
  };


  const [showActivityLog, setShowActivityLog] = useState(false);
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-2">{t('manageUsers')}</h3>
        <UserManagement 
          users={users} 
          departments={departments} 
          onSave={handleUpdateUser} 
          onRemove={handleRemoveUser} 
          onAddUser={handleAddUser} 
          t={t} 
        />
      </div>
      <div className="border-t pt-4">
        <h3 className="font-semibold mb-2">{t('manageDepts')}</h3>
        <ul className="space-y-2">
          {departments.map((d) => (
            <EditableDepartmentRow 
              key={d.id} 
              department={d} 
              isDeletable={!users.some((u) => u.departmentIds?.includes(d.id))} 
              onSave={handleUpdateDepartment} 
              onRemove={handleRemoveDepartment} 
              users={users}
              t={t} 
            />
          ))}
        </ul>
        <AddDepartmentForm onAdd={(name) => handleAddDepartment({ name })} t={t} />
      </div>
      <div className="border-t pt-4">
        <h3 className="font-semibold mb-2">{t('notificationSettings')}</h3>
        <NotificationSettingsPanel 
          settings={notificationSettings} 
          onUpdate={onUpdateNotificationSettings} 
          t={t} 
        />
      </div>

      {/* Activity Log Section - Admin only - Moved to end */}
      {canAccessFeature(currentUser?.role, 'activity-logs') && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">{t('activityLog')}</h3>
              <p className="text-sm text-blue-700">View all system activities with pagination support</p>
            </div>
        <button 
          onClick={() => setShowActivityLog(true)}
          className="btn btn-primary"
        >
          📊 {t('viewActivityLog') || 'View Activity Log'}
        </button>
      </div>

          {/* One-time maintenance: Backfill Assigned By - DISABLED */}
          {/* <BackfillAssignedByTool t={t} /> */}
        </div>
      )}

      {/* Activity Log Modal - Admin only */}
      {showActivityLog && canAccessFeature(currentUser?.role, 'activity-logs') && (
        <ActivityLog 
          onClose={() => setShowActivityLog(false)} 
          t={t} 
        />
      )}

    </div>
  );
}

function BackfillAssignedByTool({ t }) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ total: 0, updated: 0, skipped: 0, checked: 0, errors: 0 });

  const backfill = async () => {
    if (isRunning) return;
    if (!window.confirm('Run one-time backfill to set Assigned By on old tasks? This will update tasks missing this field.')) return;
    setIsRunning(true);
    setProgress({ total: 0, updated: 0, skipped: 0, checked: 0, errors: 0 });
    try {
      // Load tasks in batches
      const tasksRef = collection(db, 'tasks');
      let tasksSnap = await getDocs(tasksRef);
      const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProgress(p => ({ ...p, total: tasks.length }));

      const batchSize = 400;
      let batch = writeBatch(db);
      let batched = 0;

      const toMillis = (ts) => {
        if (!ts) return 0;
        try {
          if (typeof ts === 'string') return new Date(ts).getTime() || 0;
          if (ts.seconds) return ts.seconds * 1000;
          if (ts.toDate) return ts.toDate().getTime();
        } catch {}
        return 0;
      };

      for (const task of tasks) {
        setProgress(p => ({ ...p, checked: p.checked + 1 }));
        if (task.assignedById && task.assignedByName) {
          setProgress(p => ({ ...p, skipped: p.skipped + 1 }));
          continue;
        }

        // Fetch activity logs for this task and find earliest meaningful entry
        let logs = [];
        try {
          let q1 = query(collection(db, 'activityLog'), where('entityType', '==', 'task'), where('entityId', '==', task.id));
          // Prefer server ordering if index exists
          try {
            const q2 = query(q1, orderBy('serverTimestamp', 'asc'), limit(200));
            const snap = await getDocs(q2);
            logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          } catch {
            const snap = await getDocs(q1);
            logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            logs.sort((a, b) => (toMillis(a.serverTimestamp || a.timestamp) - toMillis(b.serverTimestamp || b.timestamp)));
          }
        } catch {
          logs = [];
        }

        const preferred = logs.find(l => l.action === 'create' && l.userId) || logs.find(l => l.action === 'assign' && l.userId) || logs.find(l => l.userId);
        if (!preferred) {
          setProgress(p => ({ ...p, skipped: p.skipped + 1 }));
          continue;
        }

        const ref = doc(db, 'tasks', task.id);
        const updateData = { 
          assignedById: preferred.userId, 
          assignedByName: preferred.userName || `User-${(preferred.userId || '').slice(0,8)}` 
        };
        const cleanUpdateData = cleanFirestoreData(updateData);
        batch.update(ref, cleanUpdateData);
        batched++;
        setProgress(p => ({ ...p, updated: p.updated + 1 }));

        if (batched >= batchSize) {
          await batch.commit();
          batch = writeBatch(db);
          batched = 0;
        }
      }

      if (batched > 0) {
        await batch.commit();
      }
      alert('Backfill completed successfully.');
    } catch (e) {
      console.error('Backfill error', e);
      setProgress(p => ({ ...p, errors: p.errors + 1 }));
      alert('Backfill encountered an error. Check console for details.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-yellow-900">Maintenance: Backfill Assigned By</div>
          <div className="text-xs text-yellow-800">Sets missing Assigned By on old tasks using earliest task activity (create/assign).</div>
          {progress.total > 0 && (
            <div className="text-xs text-yellow-700 mt-1">Checked {progress.checked}/{progress.total} • Updated {progress.updated} • Skipped {progress.skipped}</div>
          )}
        </div>
        <button className={`btn ${isRunning ? 'btn-disabled' : 'btn-warning'}`} onClick={backfill} disabled={isRunning}>
          {isRunning ? 'Running…' : 'Run Backfill'}
        </button>
      </div>
    </div>
  );
}
function BackfillPointsTool({ t }) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ total: 0, updated: 0, errors: 0 });

  const DIFFICULTY_POINTS = {
    easy: 10,
    medium: 25,
    hard: 50,
    critical: 100,
  };

  const POINTS_CONFIG = {
    EXPIRATION_DAYS: 90,
  };

  // Use a broader date range - from Sept 1, 2024 to today
  const START_DATE = new Date('2024-09-01T00:00:00Z');
  const END_DATE = new Date();

  const formatDateKey = (date) => {
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseTimestamp = (timestamp) => {
    if (!timestamp) return null;
    
    // Handle Firestore Timestamp with seconds/nanoseconds
    if (timestamp.seconds !== undefined) {
      return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
    }
    
    // Handle Firestore Timestamp with toDate method
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    
    // Handle regular Date objects
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    // Handle string dates
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    
    return null;
  };

  const calculateTaskPoints = (task, userId) => {
    if (!task.assignedUserIds || !task.assignedUserIds.includes(userId)) {
      return 0;
    }

    const assignedUserCount = task.assignedUserIds.length;
    let basePoints = 50;
    
    if (task.difficulty && DIFFICULTY_POINTS[task.difficulty]) {
      basePoints = DIFFICULTY_POINTS[task.difficulty];
    }
    
    if (task.isRdNewSkill) {
      basePoints = basePoints * 5;
    }
    
    let basePointsPerUser = Math.round(basePoints / assignedUserCount);
    
    if (!task.isRdNewSkill) {
      const collaborationBonus = assignedUserCount > 1 ? Math.round(basePointsPerUser * 0.1) : 0;
      const urgentBonus = task.isUrgent ? Math.round(basePointsPerUser * 0.25) : 0;
      basePointsPerUser += collaborationBonus + urgentBonus;
    }
    
    const completionDate = parseTimestamp(task.completedAt);
    const targetDate = parseTimestamp(task.targetDate);
    if (completionDate && targetDate && completionDate <= targetDate) {
      if (!task.isRdNewSkill) {
        basePointsPerUser += 3;
      }
    }
    
    return basePointsPerUser;
  };

  const backfillPoints = async () => {
    if (isRunning) return;
    if (!window.confirm('This will backfill points history for all users from September 2024 onwards. Continue?')) {
      return;
    }

    setIsRunning(true);
    setProgress({ total: 0, updated: 0, errors: 0 });

    try {
      // Get all users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProgress(p => ({ ...p, total: users.length }));

      // Get all completed tasks
      const tasksSnapshot = await getDocs(
        query(collection(db, 'tasks'), where('status', '==', 'Complete'))
      );
      const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      let updated = 0;
      let errors = 0;

      for (const user of users) {
        try {
          setProgress(p => ({ ...p, checked: p.checked + 1 }));

          const userTasks = tasks.filter(task => {
            if (!task.assignedUserIds || !task.assignedUserIds.includes(user.id)) {
              return false;
            }
            
            // Use completedAt, fallback to updatedAt or createdAt
            let completionDate = parseTimestamp(task.completedAt);
            if (!completionDate) {
              completionDate = parseTimestamp(task.updatedAt);
            }
            if (!completionDate) {
              completionDate = parseTimestamp(task.createdAt);
            }
            
            if (!completionDate) return false;
            
            // Check if within date range
            return completionDate >= START_DATE && completionDate <= END_DATE;
          });

          if (userTasks.length === 0) {
            continue;
          }

          const pointsByDate = {};
          userTasks.forEach(task => {
            const completionDate = parseTimestamp(task.completedAt);
            if (!completionDate) return;
            const dateKey = formatDateKey(completionDate);
            if (!dateKey) return;
            const points = calculateTaskPoints(task, user.id);
            pointsByDate[dateKey] = (pointsByDate[dateKey] || 0) + points;
          });

          const existingPointsHistory = user.pointsHistory || {};
          const newPointsHistory = { ...existingPointsHistory };

          Object.entries(pointsByDate).forEach(([dateKey, points]) => {
            if (newPointsHistory[dateKey]) {
              newPointsHistory[dateKey].points += points;
            } else {
              newPointsHistory[dateKey] = {
                points: points,
                addedAt: Timestamp.fromDate(new Date(dateKey)),
                expirationDays: POINTS_CONFIG.EXPIRATION_DAYS,
                isUsable: true,
              };
            }
          });

          let totalPoints = 0;
          const now = new Date();
          let usablePoints = 0;

          Object.entries(newPointsHistory).forEach(([dateKey, entry]) => {
            if (!entry || typeof entry.points !== 'number') return;
            totalPoints += entry.points;
            const pointsDate = new Date(dateKey);
            const expirationDate = new Date(pointsDate);
            expirationDate.setDate(expirationDate.getDate() + (entry.expirationDays || POINTS_CONFIG.EXPIRATION_DAYS));
            if (now <= expirationDate && entry.isUsable !== false) {
              usablePoints += entry.points;
            }
          });

          const userRef = doc(db, 'users', user.id);
          const updateData = {
            pointsHistory: newPointsHistory,
            usablePoints: Math.floor(usablePoints),
            totalPoints: Math.floor(totalPoints),
            pointsHistoryBackfilled: true,
            pointsHistoryBackfillDate: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          
          // Clean undefined values
          const cleanUpdateData = cleanFirestoreData(updateData);
          await updateDoc(userRef, cleanUpdateData);

          updated++;
        } catch (error) {
          console.error(`Error processing ${user.name}:`, error);
          errors++;
        }
      }

      setProgress(p => ({ ...p, updated, errors }));
      alert(`Backfill complete! Updated ${updated} users.`);
    } catch (error) {
      console.error('Backfill error:', error);
      alert('Backfill encountered an error. Check console for details.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium text-blue-900 mb-1">Points History Backfill</div>
          <div className="text-sm text-blue-700">Backfill recent points (Sept 2024 onwards) to pointsHistory for all users</div>
          {progress.total > 0 && (
            <div className="text-xs text-blue-600 mt-2">
              Updated: {progress.updated} • Errors: {progress.errors} • Total: {progress.total}
            </div>
          )}
        </div>
        <button
          className={`btn ${isRunning ? 'btn-disabled' : 'btn-primary'}`}
          onClick={backfillPoints}
          disabled={isRunning}
        >
          {isRunning ? 'Running...' : 'Run Backfill'}
        </button>
      </div>
    </div>
  );
}


function UserManagement({ users, departments, onSave, onRemove, onAddUser, t }) {
  const [isAdding, setIsAdding] = useState(false);
  return (
    <div>
      <div className="space-y-2">
        {users.map((user) => (
          <EditableUserRow
            key={user.id}
            user={user}
            departments={departments}
            onSave={onSave}
            onRemove={onRemove}
            t={t}
          />
        ))}
      </div>
      {isAdding ? (
        <AddUserForm
          departments={departments}
          onCreate={onAddUser}
          onCancel={() => setIsAdding(false)}
          t={t}
        />
      ) : (
        <button onClick={() => setIsAdding(true)} className="btn btn-secondary mt-2">
          {t('addUser')}
        </button>
      )}
    </div>
  );
}

function EditableUserRow({ user, departments, onSave, onRemove, t }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState({ ...user });

  // Get current departments for this user - ONLY use departmentIds
  const getUserDepartments = (user) => {
    if (user.departmentIds && Array.isArray(user.departmentIds)) {
      return user.departmentIds;
    }
    return [];
  };

  // Initialize with current departments
  useEffect(() => {
    if (isEditing) {
      setEditedUser({
        ...user,
        role: user.role || ROLES.USER, // Ensure role has a default value
        selectedDepartments: getUserDepartments(user)
      });
    }
  }, [isEditing, user]);

  const handleSave = () => {
    // Validate required fields
    if (!editedUser.name || editedUser.name.trim() === '') {
      alert('Please enter a name for the user.');
      return;
    }

    // Validate role
    const validRoles = Object.values(ROLES);
    if (!validRoles.includes(editedUser.role)) {
      alert(`Invalid role: ${editedUser.role}. Please select a valid role.`);
      return;
    }

    // Convert selected departments to the proper format - ONLY use departmentIds
    const finalUser = {
      ...editedUser,
      name: editedUser.name.trim(),
      role: editedUser.role,
      employeeId: editedUser.employeeId || '',
      departmentIds: editedUser.selectedDepartments || []
    };
    delete finalUser.selectedDepartments; // Remove temporary field
    
    console.log('Saving user with role:', finalUser.role, 'Full user data:', finalUser);
    onSave(finalUser);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedUser({ ...user });
    setIsEditing(false);
  };

  const handleDepartmentToggle = (deptId) => {
    const currentSelected = editedUser.selectedDepartments || [];
    let newSelected;
    
    if (currentSelected.includes(deptId)) {
      newSelected = currentSelected.filter(id => id !== deptId);
    } else {
      newSelected = [...currentSelected, deptId];
    }
    
    setEditedUser({
      ...editedUser,
      selectedDepartments: newSelected
    });
  };

  if (isEditing) {
    return (
      <div className="bg-slate-100 p-2 rounded-md space-y-2">
        <input
          type="text"
          value={editedUser.name}
          onChange={(e) => setEditedUser({ ...editedUser, name: e.target.value })}
          className="input"
          placeholder={t('name')}
        />
        <input
          type="text"
          value={editedUser.password}
          onChange={(e) => setEditedUser({ ...editedUser, password: e.target.value })}
          className="input"
          placeholder={t('password')}
        />
        <input
          type="text"
          value={editedUser.employeeId || ''}
          onChange={(e) => setEditedUser({ ...editedUser, employeeId: e.target.value })}
          className="input"
          placeholder={t('employeeId') || 'Employee ID'}
        />
        <select
          value={editedUser.role || ROLES.USER}
          onChange={(e) => {
            console.log('Role changed from', editedUser.role, 'to', e.target.value);
            setEditedUser({ ...editedUser, role: e.target.value });
          }}
          className="select"
        >
          {Object.values(ROLES).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          {departments.map((d) => (
            <button
              key={d.id}
              onClick={() => handleDepartmentToggle(d.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                editedUser.selectedDepartments?.includes(d.id)
                  ? 'bg-blue-50 text-blue-700 border-blue-500'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
              type="button"
            >
              {editedUser.selectedDepartments?.includes(d.id) && (
                <span className="text-blue-600">✓</span>
              )}
              <span>{d.name}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="btn btn-primary">
            {t('save')}
          </button>
          <button onClick={handleCancel} className="btn btn-secondary">
            {t('cancel')}
          </button>
        </div>
      </div>
    );
  }

  const userDepartments = getUserDepartments(user);
  const userDeptNames = userDepartments.map(deptId => 
    departments.find(d => d.id === deptId)?.name
  ).filter(Boolean);

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold">{user.name}</h4>
            <span className={`badge badge-sm ${
              user.role === ROLES.ADMIN ? 'badge-error' : 
              user.role === ROLES.MANAGEMENT ? 'badge-warning' : 
              user.role === ROLES.HEAD ? 'badge-info' : 
              'badge-neutral'
            }`}>
              {user.role || ROLES.USER}
            </span>
          </div>
          <div className="text-sm text-slate-500">
          {user.employeeId && (
            <div className="text-xs text-slate-500">{(t('employeeId') || 'Employee ID')}: {user.employeeId}</div>
          )}
            {userDeptNames.length > 0 ? (
              <div>
                <span className="font-medium">{t('departments')}:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {userDeptNames.map((deptName, index) => (
                    <span key={index} className="badge badge-xs badge-outline">
                      {deptName}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <span>{t('noDept')}</span>
            )}
          </div>
          {user.email && (
            <p className="text-xs text-slate-400">{user.email}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button onClick={() => setIsEditing(true)} className="btn btn-sm btn-secondary">
              ✏️ {t('edit')}
            </button>
            <button 
              onClick={() => onRemove(user.id)} 
              className="btn btn-sm btn-error"
              title={t('remove')}
            >
              🗑️
            </button>
          </div>
          <div className="flex gap-2">
          </div>
        </div>
      </div>
    </div>
  );
}

function AddUserForm({ departments, onCreate, onCancel, t }) {
  const [newUser, setNewUser] = useState({ 
    name: '', 
    password: '', 
    role: ROLES.USER, 
    email: '',
    employeeId: '',
    selectedDepartments: []
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newUser.selectedDepartments.length === 0) {
      alert(t('selectAtLeastOneDepartment'));
      return;
    }
    
    onCreate({
      ...newUser,
      departmentIds: newUser.selectedDepartments
    });
    setNewUser({ 
      name: '', 
      password: '', 
      role: ROLES.USER, 
      email: '',
      employeeId: '',
      selectedDepartments: []
    });
  };

  const handleDepartmentToggle = (deptId) => {
    const currentSelected = newUser.selectedDepartments || [];
    let newSelected;
    
    if (currentSelected.includes(deptId)) {
      newSelected = currentSelected.filter(id => id !== deptId);
    } else {
      newSelected = [...currentSelected, deptId];
    }
    
    setNewUser({
      ...newUser,
      selectedDepartments: newSelected
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-100 p-2 rounded-md space-y-2 mt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          value={newUser.name}
          onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
          className="input"
          placeholder={t('name')}
          required
        />
        <input
          type="text"
          value={newUser.password}
          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
          className="input"
          placeholder={t('password')}
          required
        />
        <select
          value={newUser.role}
          onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
          className="select"
        >
          {Object.values(ROLES).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          type="email"
          value={newUser.email}
          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
          className="input"
          placeholder={t('email')}
        />
        <input
          type="text"
          value={newUser.employeeId}
          onChange={(e) => setNewUser({ ...newUser, employeeId: e.target.value })}
          className="input"
          placeholder={t('employeeId') || 'Employee ID'}
        />
      </div>
      
      {/* Multiple Department Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">{t('selectDepartments')}</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {departments.map((dept) => (
            <label key={dept.id} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={(newUser.selectedDepartments || []).includes(dept.id)}
                onChange={() => handleDepartmentToggle(dept.id)}
                className="checkbox"
              />
              <span className="text-sm">{dept.name}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {t('holdCtrlToSelectMultiple')}
        </p>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">
          {t('add')}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}

function EditableDepartmentRow({ department, users, onSave, onRemove, isDeletable, t }) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(department.name);
  
    // Filter users who belong to this specific department
    const departmentUsers = users.filter(user => {
      // Check if user has departmentIds array
      if (user.departmentIds && Array.isArray(user.departmentIds)) {
        return user.departmentIds.includes(department.id);
      }
      return false;
    });
  
    const handleSave = () => {
      onSave({ ...department, name });
      setIsEditing(false);
    };
  
    if (isEditing) {
      return (
        <div className="bg-slate-100 p-2 rounded-md flex items-center gap-2">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input flex-grow" />
          <button onClick={handleSave} className="btn btn-primary">{t('save')}</button>
          <button onClick={() => setIsEditing(false)} className="btn btn-secondary">{t('cancel')}</button>
        </div>
      );
    }
  
    return (
      <div className="p-2 border-b">
        <div className="flex items-center justify-between">
            <div>
                <p className="font-semibold">{department.name}</p>
                <p className="text-sm text-slate-500">{t('users')}: {departmentUsers.length}</p>
            </div>
            <div className="flex gap-2">
                <button onClick={() => setIsEditing(true)} className="btn-icon">✏️</button>
                <button onClick={() => onRemove(department.id)} className="btn-icon">🗑️</button>
            </div>
        </div>
        <div className="mt-2 pl-4">
          <div className="flex flex-wrap gap-1.5">
            {departmentUsers.map(user => (
              <span key={user.id} className="badge badge-xs badge-outline">
                {user.name} ({user.role})
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  function AddDepartmentForm({ onAdd, t }) {
    const [name, setName] = useState('');
  
    const handleSubmit = (e) => {
      e.preventDefault();
      onAdd(name);
      setName('');
    };
  
    return (
      <form onSubmit={handleSubmit} className="bg-slate-100 p-2 rounded-md flex items-center gap-2 mt-2">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input flex-grow" placeholder={t('deptName')} required />
        <button type="submit" className="btn btn-primary">{t('add')}</button>
      </form>
    );
  }
  
  function NotificationSettingsPanel({ settings, onUpdate, t }) {
    const [localSettings, setLocalSettings] = useState(() => {
      try {
        if (typeof settings === 'string') return JSON.parse(settings);
      } catch {}
      return (
        settings || {
          enabled: true,
          reminderDays: [1, 3],
          reminderTime: '09:00',
          messageTemplate: "‘{taskTitle}’ is due in {daysLeft} days.",
        }
      );
    });
    const [newDay, setNewDay] = useState('');
  
    const handleChange = (e) => {
      const { name, value, type, checked } = e.target;
      setLocalSettings((prev) => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      }));
    };
  
    const addReminderDay = () => {
      const dayNum = parseInt(newDay, 10);
      if (isNaN(dayNum) || dayNum < 0) return;
      setLocalSettings((prev) => ({
        ...prev,
        reminderDays: Array.from(new Set([...(prev.reminderDays || []), dayNum])).sort((a, b) => a - b),
      }));
      setNewDay('');
    };
  
    const removeReminderDay = (d) => {
      setLocalSettings((prev) => ({
        ...prev,
        reminderDays: (prev.reminderDays || []).filter((x) => x !== d),
      }));
    };
    
    // Simple debounced save
    useEffect(() => {
        const handler = setTimeout(() => {
            onUpdate(localSettings);
        }, 500);
        return () => clearTimeout(handler);
    }, [localSettings, onUpdate]);
  
    return (
      <div className="space-y-3">
        <div className="space-y-2 bg-slate-100 p-2 rounded-md">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="enabled" checked={!!localSettings.enabled} onChange={handleChange} />
            <span>{t('enableDeadlineReminders') || 'Enable deadline reminders'}</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t('reminderDays') || 'Reminder days (before deadline)'}</label>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              min="0"
              step="1"
              value={newDay}
              onChange={(e) => setNewDay(e.target.value)}
              className="input w-24"
              placeholder="e.g. 1"
            />
            <button type="button" onClick={addReminderDay} className="btn btn-secondary btn-sm">
              {t('add') || 'Add'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(localSettings.reminderDays || []).map((d) => (
              <span key={d} className="badge badge-xs badge-outline">
                {d} {t('days') || 'days'}
                <button type="button" className="ml-1 text-slate-500 hover:text-red-600" onClick={() => removeReminderDay(d)}>×</button>
              </span>
            ))}
            {(localSettings.reminderDays || []).length === 0 && (
              <span className="text-xs text-slate-500">{t('noReminderDays') || 'No days added yet.'}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('reminderTime') || 'Reminder time'}</label>
            <input
              type="time"
              name="reminderTime"
              value={localSettings.reminderTime || '09:00'}
              onChange={handleChange}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('messageTemplate') || 'Message template'}</label>
            <input
              type="text"
              name="messageTemplate"
              value={localSettings.messageTemplate || ''}
              onChange={handleChange}
              className="input"
              placeholder="e.g. ‘{taskTitle}’ is due in {daysLeft} days."
            />
          </div>
        </div>
      </div>
    );
  }

export default AdminPanel;



