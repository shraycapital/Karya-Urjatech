# 🤖 AI Agent Documentation - Karya Task Management App

## 📋 Overview
This document provides comprehensive information for AI agents working on the Karya task management application. It covers architecture, coding patterns, data models, and best practices to ensure consistent and effective development.

---

## 🏗️ Application Architecture

### **Tech Stack**
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Firebase (Firestore, Functions, Auth, Storage)
- **State Management**: React hooks (useState, useEffect, useMemo)
- **Routing**: React Router v6
- **PWA**: Service Worker + Manifest
- **Analytics**: Custom PWA analytics system

### **Project Structure**
```
src/
├── features/           # Feature-based modules
│   ├── admin/         # Admin panel & management
│   ├── analytics/     # Analytics dashboard
│   ├── attendance/    # Attendance tracking
│   ├── auth/          # Authentication
│   ├── gamification/  # Points & leaderboards
│   ├── locations/     # Location tracking
│   ├── market/        # Market features
│   ├── notifications/ # Push notifications
│   └── tasks/         # Task management
├── shared/            # Shared utilities & components
│   ├── components/    # Reusable UI components
│   ├── hooks/         # Custom React hooks
│   ├── i18n/          # Internationalization
│   └── utils/         # Utility functions
├── App.jsx            # Main app component
├── main.jsx           # App entry point
├── routes.jsx         # Route definitions
└── firebase.js        # Firebase configuration
```

---

## 🔥 Firebase Data Models

### **Critical: Firestore Timestamp Format**
⚠️ **ALL dates use Firestore timestamp format, NOT JavaScript Date objects**
```javascript
// Format: { seconds: number, nanoseconds: number }
{
  "seconds": 1759301556,
  "nanoseconds": 884000000,
  "type": "firestore/timestamp/1.0"
}
```

### **Core Collections**

#### **Users Collection (`users`)**
```javascript
{
  id: string,
  name: string,
  email?: string,
  role: 'User' | 'Head' | 'Management' | 'Admin',
  departmentIds: string[],
  dailyPointsTarget: number, // Default: 350
  dailyBonusLedger: object, // Bonus points tracking
  streak: number, // Daily streak count
  fcmTokens: string[], // Push notification tokens
  weeklyExecutionPoints: number, // Weekly reset fields
  weeklyLeadershipPoints: number,
  weeklyBonusPoints: number,
  weeklyTCS: number,
  weeklyCompletedTasks: number,
  lastWeeklyReset: Timestamp,
  weeklyRank: number | null,
  weeklyRankLastWeek: number | null
}
```

#### **Tasks Collection (`tasks`)**
```javascript
{
  id: string,
  title: string,
  description: string,
  status: 'Pending' | 'Ongoing' | 'Complete' | 'Deleted' | 'Rejected',
  difficulty: 'easy' | 'medium' | 'hard' | 'critical',
  points: number, // Calculated from difficulty
  assignedUserIds: string[], // Array of user IDs
  assignedById: string, // Creator's user ID
  assignedByName: string, // Creator's name
  departmentId: string,
  targetDate: Timestamp,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  completedAt?: Timestamp,
  notes: Array<{userId: string, userName: string, text: string, createdAt: Timestamp}>,
  photos: string[], // Firebase Storage URLs
  isUrgent: boolean,
  isRdNewSkill: boolean, // R&D/New Skill flag
  projectSkillName?: string, // Project/skill name for R&D tasks
  parentScheduledTaskId?: string, // For recurring tasks
  recurrencePattern?: object // For scheduled tasks
}
```

#### **Departments Collection (`departments`)**
```javascript
{
  id: string,
  name: string,
  description?: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### **System Collections**
- `weeklyLeaderboardArchives`: Weekly reset data
- `system/weeklyReset`: Reset metadata
- `activityLogs`: System activity tracking
- `notifications`: Push notification queue

---

## 🎨 UI Components & Patterns

### **Component Structure**
```javascript
// Standard component pattern
import React, { useState, useEffect, useMemo } from 'react';
import { STATUSES, ROLES } from '../../../shared/constants';
import Section from '../../../shared/components/Section';

export default function ComponentName({ 
  currentUser, 
  tasks, 
  users, 
  departments, 
  t, 
  onAction 
}) {
  // State management
  const [state, setState] = useState(initialValue);
  
  // Computed values
  const computedValue = useMemo(() => {
    // Calculation logic
  }, [dependencies]);
  
  // Effects
  useEffect(() => {
    // Side effects
  }, [dependencies]);
  
  // Event handlers
  const handleAction = () => {
    // Action logic
  };
  
  return (
    <div className="space-y-4 pb-20">
      <Section title={t('title')}>
        {/* Component content */}
      </Section>
    </div>
  );
}
```

### **Key UI Components**

#### **Section Component**
```javascript
<Section title="Title" className="optional-class">
  {/* Content */}
</Section>
```

#### **Modal Pattern**
```javascript
const [isModalOpen, setIsModalOpen] = useState(false);
const [modalData, setModalData] = useState(null);

// Open modal
const openModal = (data) => {
  setModalData(data);
  setIsModalOpen(true);
};

// Close modal
const closeModal = () => {
  setIsModalOpen(false);
  setModalData(null);
};
```

#### **Tab Navigation Pattern**
```javascript
const [activeTab, setActiveTab] = useState('default');

const tabs = [
  { id: 'tab1', label: 'Tab 1', icon: '📊' },
  { id: 'tab2', label: 'Tab 2', icon: '👥' }
];

// Tab content rendering
{activeTab === 'tab1' && <Tab1Content />}
{activeTab === 'tab2' && <Tab2Content />}
```

---

## 🔧 Coding Standards & Patterns

### **Naming Conventions**
- **Components**: PascalCase (`TaskForm.jsx`)
- **Files**: PascalCase for components, camelCase for utilities
- **Variables**: camelCase (`currentUser`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE (`STATUSES`, `ROLES`)
- **Functions**: camelCase (`handleSubmit`, `calculatePoints`)

### **Import Order**
```javascript
// 1. React imports
import React, { useState, useEffect } from 'react';

// 2. Third-party libraries
import { collection, doc } from 'firebase/firestore';

// 3. Internal imports (shared first, then features)
import { STATUSES, ROLES } from '../../../shared/constants';
import Section from '../../../shared/components/Section';
import { createTask } from '../api/taskApi';

// 4. Relative imports
import TaskForm from './TaskForm';
```

### **State Management Patterns**

#### **Form State**
```javascript
const [formData, setFormData] = useState({
  title: '',
  description: '',
  assignedUserIds: []
});

const updateFormData = (field, value) => {
  setFormData(prev => ({ ...prev, [field]: value }));
};
```

#### **Loading States**
```javascript
const [isLoading, setIsLoading] = useState(false);
const [isSubmitting, setIsSubmitting] = useState(false);
const [error, setError] = useState(null);
```

#### **Modal States**
```javascript
const [isModalOpen, setIsModalOpen] = useState(false);
const [modalData, setModalData] = useState(null);
```

### **Error Handling**
```javascript
try {
  setIsLoading(true);
  setError(null);
  const result = await apiCall();
  // Handle success
} catch (error) {
  console.error('Error:', error);
  setError(error.message);
} finally {
  setIsLoading(false);
}
```

---

## 🎯 Feature-Specific Patterns

### **Task Management**

#### **Task Status Flow**
```
Pending → Ongoing → Complete
   ↓        ↓         ↓
Deleted  Deleted   Deleted
```

#### **Task Creation Pattern**
```javascript
const createTask = async (taskData) => {
  const task = {
    ...taskData,
    status: STATUSES.PENDING,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    points: calculateTaskPoints(taskData.difficulty)
  };
  
  const docRef = await addDoc(collection(db, 'tasks'), task);
  await logTaskActivity(docRef.id, 'created', currentUser.id);
  return docRef.id;
};
```

#### **Task Updates**
```javascript
const updateTask = async (taskId, updates) => {
  await updateDoc(doc(db, 'tasks', taskId), {
    ...updates,
    updatedAt: serverTimestamp()
  });
  await logTaskActivity(taskId, 'updated', currentUser.id);
};
```

### **Gamification System**

#### **Points Calculation**
```javascript
const DIFFICULTY_POINTS = {
  easy: 10,
  medium: 25,
  hard: 50,
  critical: 100
};

const calculateTaskPoints = (task) => {
  let points = DIFFICULTY_POINTS[task.difficulty] || 0;
  
  // Team collaboration bonus (10%)
  if (task.assignedUserIds?.length > 1) {
    points = Math.round(points * 1.1);
  }
  
  // Urgent task bonus (25%)
  if (task.isUrgent) {
    points = Math.round(points * 1.25);
  }
  
  // On-time completion bonus (+3 points)
  if (task.completedAt && task.targetDate) {
    const completed = parseFirestoreTimestamp(task.completedAt);
    const target = parseFirestoreTimestamp(task.targetDate);
    if (completed <= target) {
      points += 3;
    }
  }
  
  return points;
};
```

#### **Leadership Points (LP)**
```javascript
const calculateLeadershipPoints = (task, taskExecutionPoints) => {
  let completionBonus = 0;
  let difficultyFairness = 0;
  let onTimeBonus = 0;
  
  const isRdNewSkill = task.isRdNewSkill || false;
  
  // Completion Bonus
  if (isRdNewSkill) {
    completionBonus = taskExecutionPoints; // 100% for R&D
  } else {
    completionBonus = Math.round(taskExecutionPoints * 0.10); // 10% for regular
  }
  
  // Difficulty Fairness (5% for regular tasks)
  if (!isRdNewSkill) {
    difficultyFairness = Math.round(taskExecutionPoints * 0.05);
  }
  
  // On-Time Delivery Bonus (5%)
  if (task.targetDate && task.completedAt) {
    const targetDate = parseFirestoreTimestamp(task.targetDate);
    const completedDate = parseFirestoreTimestamp(task.completedAt);
    if (completedDate <= targetDate) {
      onTimeBonus = Math.round(taskExecutionPoints * 0.05);
    }
  }
  
  return {
    completionBonus,
    difficultyFairness,
    onTimeBonus,
    total: completionBonus + difficultyFairness + onTimeBonus
  };
};
```

### **Weekly Reset System**

#### **Reset Schedule**
- **Frequency**: Every Monday at midnight (Asia/Kolkata timezone)
- **Scope**: Resets weekly scores (EP, LP, TCS, bonus points)
- **Archiving**: Previous week's rankings are preserved

#### **Reset Implementation**
```javascript
// Check if reset is needed
const shouldResetWeekly = (lastResetDate) => {
  if (!lastResetDate) return true;
  const oneWeekAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
  return lastResetDate < oneWeekAgo;
};

// Get week boundaries
const getStartOfWeek = () => {
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);
  return startOfWeek;
};
```

---

## 🔐 Permission System

### **Role Hierarchy**
```javascript
const ROLES = { 
  USER: 'User', 
  HEAD: 'Head', 
  MANAGEMENT: 'Management', 
  ADMIN: 'Admin' 
};

const ROLE_HIERARCHY = {
  [ROLES.USER]: 1,
  [ROLES.HEAD]: 2,
  [ROLES.MANAGEMENT]: 3,
  [ROLES.ADMIN]: 4
};
```

### **Permission Checks**
```javascript
const canAccessFeature = (userRole, feature) => {
  const requiredRoles = PERMISSIONS[feature] || [];
  return requiredRoles.includes(userRole);
};

// Usage
{canAccessFeature(currentUser?.role, 'VIEW_ANALYTICS_DASHBOARD') && (
  <AnalyticsDashboard />
)}
```

### **Feature Access Matrix**
| Feature | User | Head | Management | Admin |
|---------|------|------|------------|-------|
| View Own Tasks | ✅ | ✅ | ✅ | ✅ |
| Create Tasks | ✅ | ✅ | ✅ | ✅ |
| View Department Tasks | ❌ | ✅ | ✅ | ✅ |
| Create Tasks for Others | ❌ | ✅ | ✅ | ✅ |
| Manage Users/Departments | ❌ | ❌ | ✅ | ✅ |
| View Analytics Dashboard | ❌ | ❌ | ✅ | ✅ |
| View Activity Logs | ❌ | ❌ | ❌ | ✅ |

---

## 📱 PWA Features

### **Service Worker**
- **File**: `public/firebase-messaging-sw.js`
- **Purpose**: Push notifications, offline support
- **Registration**: Automatic in `firebase.js`

### **Manifest Configuration**
```javascript
// public/manifest.webmanifest
{
  "name": "Karya Task Management",
  "short_name": "Karya",
  "theme_color": "#3B82F6",
  "background_color": "#FFFFFF",
  "display": "standalone",
  "orientation": "portrait"
}
```

### **PWA Analytics**
```javascript
import { initializePwaAnalytics, logPwaEvent } from './shared/utils/pwaAnalytics';

// Initialize
initializePwaAnalytics(userId, userName);

// Log events
logPwaEvent('task_created', { taskId, difficulty });
logPwaEvent('user_login', { userId, timestamp });
```

---

## 🌐 Internationalization (i18n)

### **Translation System**
```javascript
import { useI18n } from './shared/i18n/translations';

function Component() {
  const { t, setLanguage, language } = useI18n();
  
  return (
    <div>
      <h1>{t('welcome')}</h1>
      <button onClick={() => setLanguage('hi')}>हिन्दी</button>
      <button onClick={() => setLanguage('en')}>English</button>
    </div>
  );
}
```

### **Supported Languages**
- **English** (`en`): Default language
- **Hindi** (`hi`): Secondary language

---

## 🔔 Notification System

### **Push Notifications**
```javascript
// Enable notifications
const enableNotifications = async () => {
  const token = await enablePushNotifications(vapidKey);
  // Store token in user document
};

// Send notifications
const sendNotification = async (title, body, data) => {
  // Implementation in Firebase Functions
};
```

### **Notification Types**
- **Task Assignments**: When users receive new tasks
- **Deadline Reminders**: Automatic alerts before due dates
- **Status Updates**: When task statuses change
- **Weekly Resets**: Leaderboard reset notifications
- **System Alerts**: Admin notifications

---

## 📊 Analytics & Monitoring

### **PWA Analytics**
- **User Activity**: Login, task creation, completion
- **Performance Metrics**: Load times, error rates
- **Usage Patterns**: Feature adoption, user engagement
- **System Health**: API response times, error tracking

### **Activity Logging**
```javascript
import { logActivity } from './shared/utils/activityLogger';

// Log user actions
await logActivity({
  userId: currentUser.id,
  action: 'task_created',
  details: { taskId, title, difficulty },
  timestamp: new Date()
});
```

---

## 🧪 Testing Patterns

### **Component Testing**
```javascript
// Test file naming: ComponentName.test.jsx
import { render, screen } from '@testing-library/react';
import ComponentName from './ComponentName';

describe('ComponentName', () => {
  test('renders correctly', () => {
    render(<ComponentName />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### **API Testing**
```javascript
// Firebase Functions testing
import { initializeTestEnvironment } from 'firebase-functions-test';

describe('API Functions', () => {
  test('creates task successfully', async () => {
    // Test implementation
  });
});
```

---

## 🚀 Deployment & Build

### **Build Commands**
```bash
# Development
npm run dev

# Production build
npm run build

# Preview build
npm run preview

# Linting
npm run lint

# Firebase Functions
cd functions && npm run serve
```

### **Environment Configuration**
- **Development**: Local Firebase emulators
- **Production**: Firebase production project
- **Environment Variables**: Vite `VITE_*` prefix

---

## 🔧 Common Utilities

### **Date Handling**
```javascript
import { parseFirestoreTimestamp, formatDateTime } from './shared/utils/date';

// Parse Firestore timestamps
const date = parseFirestoreTimestamp(task.createdAt);

// Format for display
const formatted = formatDateTime(date);
```

### **Permission Utilities**
```javascript
import { canAccessFeature } from './shared/utils/permissions';

// Check feature access
const canViewAnalytics = canAccessFeature(userRole, 'VIEW_ANALYTICS_DASHBOARD');
```

### **Activity Logging**
```javascript
import { logActivity, logTaskActivity } from './shared/utils/activityLogger';

// Log general activity
await logActivity({ userId, action, details });

// Log task-specific activity
await logTaskActivity(taskId, 'status_changed', userId);
```

---

## ⚠️ Important Notes for AI Agents

### **Critical Requirements**
1. **Always use Firestore timestamps** - Never use JavaScript Date objects
2. **Follow the permission system** - Check user roles before showing features
3. **Use centralized utilities** - Don't duplicate date/calculation logic
4. **Maintain consistency** - Follow established patterns and naming conventions
5. **Handle errors gracefully** - Always include try-catch blocks for async operations

### **Common Pitfalls to Avoid**
1. **Date handling**: Always use `parseFirestoreTimestamp()` for dates
2. **Permission checks**: Always verify user roles before rendering admin features
3. **State management**: Use proper React patterns (useState, useEffect, useMemo)
4. **Component structure**: Follow the established component pattern
5. **Import order**: Maintain consistent import organization

### **When Adding New Features**
1. **Create feature branch**: Use descriptive branch names
2. **Follow folder structure**: Place components in appropriate feature folders
3. **Add proper permissions**: Update permission matrix if needed
4. **Include error handling**: Add comprehensive error handling
5. **Update documentation**: Keep this file updated with new patterns

---

## 📚 Additional Resources

### **Key Documentation Files**
- `FIRESTORE_TIMESTAMP_GUIDE.md`: Complete timestamp handling guide
- `WEEKLY_RESET_FEATURE.md`: Weekly reset system documentation
- `Karya_User_Training_Guide.md`: User training materials
- `Karya_Heads_Management_Training_Guide.md`: Management training guide

### **Configuration Files**
- `eslint.config.js`: ESLint configuration
- `tailwind.config.js`: Tailwind CSS configuration
- `vite.config.js`: Vite build configuration
- `firebase.json`: Firebase project configuration
- `firestore.rules`: Firestore security rules
- `firestore.indexes.json`: Database indexes

---

*Last updated: [Current Date]*
*Version: 1.0.0*

**Remember**: This documentation is living and should be updated as the application evolves. Always refer to the latest version when making changes.