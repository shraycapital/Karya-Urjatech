# 🔥 Firestore Timestamp Format Guide

## ⚠️ CRITICAL: All Dates/Times Use Firestore Timestamp Format

**This application uses Firestore timestamps throughout the entire codebase.** All dates and times are stored and retrieved in Firestore timestamp format, NOT regular JavaScript Date objects.

## 📋 Firestore Timestamp Format

### Structure
```javascript
{
  "seconds": 1759301556,        // Unix timestamp in seconds
  "nanoseconds": 884000000,      // Additional nanoseconds precision
  "type": "firestore/timestamp/1.0"  // Optional type identifier
}
```

### Examples from Real Data
```javascript
// Task creation timestamp
{
  "id": "01BG5G6mZCRJHwp4KGX3",
  "title": "Process of testing",
  "createdAt": {
    "type": "firestore/timestamp/1.0",
    "seconds": 1759301556,
    "nanoseconds": 884000000
  },
  "status": "Complete"
}
```

## 🛠️ Proper Parsing Methods

### Method 1: Using seconds/nanoseconds (Recommended)
```javascript
function parseFirestoreTimestamp(timestamp) {
  if (!timestamp) return null;
  
  if (timestamp.seconds) {
    // Convert seconds to milliseconds and add nanoseconds
    return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
  }
  
  if (timestamp.toDate) {
    // Use Firestore's built-in method
    return timestamp.toDate();
  }
  
  // Fallback for regular dates
  return new Date(timestamp);
}
```

### Method 2: Using toDate() method
```javascript
function parseFirestoreTimestamp(timestamp) {
  if (!timestamp) return null;
  
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
  }
  
  return new Date(timestamp);
}
```

## 🚨 Common Mistakes to Avoid

### ❌ WRONG - Don't do this:
```javascript
// This will NOT work with Firestore timestamps
const taskDate = new Date(task.createdAt);
const isAfter = taskDate > someDate;
```

### ✅ CORRECT - Do this instead:
```javascript
// Properly parse Firestore timestamp first
let taskDate;
if (task.createdAt?.seconds) {
  taskDate = new Date(task.createdAt.seconds * 1000 + (task.createdAt.nanoseconds || 0) / 1000000);
} else if (task.createdAt?.toDate) {
  taskDate = task.createdAt.toDate();
} else {
  taskDate = new Date(task.createdAt);
}

const isAfter = taskDate > someDate;
```

## 📍 Files That Handle Timestamps

### Core Files
- `src/shared/utils/date.js` - Main date utility functions
- `src/features/tasks/api/taskApi.js` - Task creation/updates
- `src/features/analytics/components/AnalyticsDashboard.jsx` - Analytics date filtering
- `src/features/tasks/components/TasksTab.jsx` - Task filtering and display

### Key Functions
- `toSafeDate()` in `src/shared/utils/date.js` - Handles Firestore timestamp parsing
- `parseDate()` in `AnalyticsDashboard.jsx` - Robust timestamp parsing
- `calculateTrendsWithBuckets()` - Timeline bucket generation

## 🔧 Implementation Examples

### Task Filtering by Date
```javascript
const filteredTasks = tasks.filter(task => {
  // Parse Firestore timestamp
  let taskDate;
  if (task.createdAt?.seconds) {
    taskDate = new Date(task.createdAt.seconds * 1000 + (task.createdAt.nanoseconds || 0) / 1000000);
  } else if (task.createdAt?.toDate) {
    taskDate = task.createdAt.toDate();
  } else {
    taskDate = new Date(task.createdAt);
  }
  
  return taskDate >= startDate && taskDate < endDate;
});
```

### Date Comparison
```javascript
function compareFirestoreTimestamps(timestamp1, timestamp2) {
  const date1 = parseFirestoreTimestamp(timestamp1);
  const date2 = parseFirestoreTimestamp(timestamp2);
  
  if (!date1 || !date2) return 0;
  
  return date1.getTime() - date2.getTime();
}
```

### Formatting for Display
```javascript
function formatFirestoreTimestamp(timestamp) {
  const date = parseFirestoreTimestamp(timestamp);
  return date ? date.toLocaleDateString('en-IN', { 
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium' 
  }) : 'N/A';
}
```

## 🌍 Timezone Considerations

- All timestamps are stored in UTC
- Display formatting uses IST (Indian Standard Time)
- Use `timeZone: 'Asia/Kolkata'` in formatting options

## 🧪 Testing Timestamps

### Test Data Creation
```javascript
// Create test Firestore timestamp
const testTimestamp = {
  seconds: Math.floor(Date.now() / 1000),
  nanoseconds: 0
};

// Verify parsing
const parsedDate = parseFirestoreTimestamp(testTimestamp);
console.log('Original:', testTimestamp);
console.log('Parsed:', parsedDate);
console.log('ISO String:', parsedDate.toISOString());
```

## 📚 Additional Resources

- [Firestore Timestamp Documentation](https://firebase.google.com/docs/reference/js/firebase.firestore.Timestamp)
- [JavaScript Date Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)

---

## ⚠️ REMINDER FOR DEVELOPERS

**ALWAYS assume dates are in Firestore timestamp format unless explicitly documented otherwise. When in doubt, check the data structure first before writing date parsing code.**

**This format is used consistently across:**
- Task creation dates (`createdAt`)
- Task update dates (`updatedAt`) 
- Task completion dates (`completedAt`)
- Activity log timestamps
- All other date fields in the application
