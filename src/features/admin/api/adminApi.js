import { db } from '../../../firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { logActivity } from '../../../shared/utils/activityLogger';

export const addUser = async (newUser, currentUser) => {
  const result = await addDoc(collection(db, 'users'), newUser);
  logActivity('create', 'user', result.id, newUser.name, currentUser.id, currentUser.name, {
    role: newUser.role,
    departmentIds: newUser.departmentIds,
  });
  return result;
};

export const updateUser = async (user, oldUser, currentUser) => {
  const { id, ...data } = user;
  console.log('Updating user in Firestore:', { id, data, oldUser });
  
  // Ensure role is included in the data
  if (!data.role) {
    console.warn('No role found in user data, using default USER role');
    data.role = 'User';
  }
  
  await updateDoc(doc(db, 'users', id), data);
  console.log('User updated successfully in Firestore');
  if (oldUser) {
    logActivity('update', 'user', id, oldUser.name, currentUser.id, currentUser.name, {
      changes: Object.keys(data),
      previousRole: oldUser.role,
      newRole: data.role || oldUser.role,
    });
  }
};

export const removeUser = async (userId, user, currentUser) => {
  await deleteDoc(doc(db, 'users', userId));
  if (user) {
    logActivity('delete', 'user', userId, user.name, currentUser.id, currentUser.name, {
      role: user.role,
      departmentIds: user.departmentIds,
    });
  }
};

export const addDepartment = async (dept, currentUser) => {
  const result = await addDoc(collection(db, 'departments'), dept);
  logActivity('create', 'department', result.id, dept.name, currentUser.id, currentUser.name);
  return result;
};

export const updateDepartment = async (dept, oldDept, currentUser) => {
  const { id, ...data } = dept;
  await updateDoc(doc(db, 'departments', id), data);
  if (oldDept) {
    logActivity('update', 'department', id, oldDept.name, currentUser.id, currentUser.name, {
      changes: Object.keys(data),
      previousName: oldDept.name,
      newName: data.name || oldDept.name,
    });
  }
};

export const removeDepartment = async (deptId, dept, currentUser) => {
  await deleteDoc(doc(db, 'departments', deptId));
  if (dept) {
    logActivity('delete', 'department', deptId, dept.name, currentUser.id, currentUser.name);
  }
};
