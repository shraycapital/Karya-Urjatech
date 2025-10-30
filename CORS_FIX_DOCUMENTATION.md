# CORS Error Fix Documentation

## 🔴 The Error You Encountered

```
Access to fetch at 'https://asia-south2-kartavya-58d2c.cloudfunctions.net/processScheduledTasksHttp' 
from origin 'https://karya.urja.tech' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.

POST https://asia-south2-kartavya-58d2c.cloudfunctions.net/processScheduledTasksHttp net::ERR_FAILED
```

---

## 🔍 Root Cause Analysis

### **The Problem: Region Mismatch**

The error was caused by a **region mismatch** between:

1. **Where your Firebase Functions are DEPLOYED**: `asia-south1`
   - Configured in `functions/index.js` (line 23):
   ```javascript
   setGlobalOptions({ maxInstances: 10, region: 'asia-south1' });
   ```

2. **Where your frontend was CALLING**: `asia-south2`
   - Hardcoded in `src/features/tasks/api/taskApi.js` (line 522)
   - Hardcoded in `src/features/admin/api/weeklyResetApi.js` (line 17)

### **Why This Happens**

When you call a Cloud Function URL at a region where it **doesn't exist**, the browser:
1. Sends a **preflight OPTIONS request** to check CORS headers
2. Gets back a `404 Not Found` error (function doesn't exist at that URL)
3. The 404 response doesn't include `Access-Control-Allow-Origin` headers
4. Browser blocks the request with CORS error

The actual CORS headers are only sent from endpoints that **exist**.

---

## ✅ The Solution

### **Changes Made**

#### **1. Fixed Task API (src/features/tasks/api/taskApi.js)**

**Before:**
```javascript
const region = 'asia-south2';  // ❌ Wrong region
const functionUrl = `https://${region}-${projectId}.cloudfunctions.net/processScheduledTasksHttp`;
```

**After:**
```javascript
const region = 'asia-south1';  // ✅ Correct region - matches deployment
const functionUrl = `https://${region}-${projectId}.cloudfunctions.net/processScheduledTasksHttp`;
```

#### **2. Fixed Weekly Reset API (src/features/admin/api/weeklyResetApi.js)**

**Before:**
```javascript
const response = await fetch('https://asia-south2-karya-urjatech.cloudfunctions.net/manualWeeklyReset', {
  // ❌ Wrong region AND wrong project ID
});
```

**After:**
```javascript
const response = await fetch('https://asia-south1-kartavya-58d2c.cloudfunctions.net/manualWeeklyReset', {
  // ✅ Correct region AND correct project ID
});
```

### **Deployment Steps Completed**

1. ✅ Updated source files with correct region
2. ✅ Rebuilt the project: `npm run build`
3. ✅ Verified compiled code contains `asia-south1`
4. ✅ Deployed to Firebase Hosting: `firebase deploy --only hosting`

---

## 🔧 CORS Headers Configuration

Your Firebase Functions already have **proper CORS headers** configured:

```javascript
// From functions/index.js (line 358)
exports.processScheduledTasksHttp = onRequest(async (request, response) => {
  // Enhanced CORS support for in-app fetch calls
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.set('Access-Control-Max-Age', '3600');

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }
  
  // ... rest of function
});
```

These headers allow:
- ✅ Requests from any origin (`*`)
- ✅ All HTTP methods
- ✅ Common request headers
- ✅ Proper preflight handling

---

## 📊 URL Mapping Reference

### **Cloud Functions Endpoints**

| Function Name | Old URL (❌ Wrong) | New URL (✅ Correct) |
|---|---|---|
| `processScheduledTasksHttp` | `asia-south2-kartavya-58d2c.cloudfunctions.net` | `asia-south1-kartavya-58d2c.cloudfunctions.net` |
| `manualWeeklyReset` | `asia-south2-karya-urjatech.cloudfunctions.net` | `asia-south1-kartavya-58d2c.cloudfunctions.net` |

### **Key Identifiers**

- **Project ID**: `kartavya-58d2c`
- **Region**: `asia-south1`
- **Hosting URL**: `https://karya.urja.tech`
- **Fallback Hosting**: `https://kartavya-58d2c.web.app`

---

## 🚀 Testing the Fix

### **What Should Work Now**

1. **Scheduled Tasks Processing**
   ```javascript
   await triggerScheduledTasks();
   // ✅ Now successfully calls asia-south1 endpoint
   ```

2. **Weekly Reset (Admin Panel)**
   ```javascript
   await triggerManualWeeklyReset(adminUserId);
   // ✅ Now successfully calls asia-south1 endpoint
   ```

3. **No CORS Errors**
   - Preflight OPTIONS request succeeds
   - CORS headers are properly returned
   - Browser allows the request

### **How to Verify**

Open your browser DevTools (F12) → Network tab:
1. Look for `processScheduledTasksHttp` request
2. Check the Response Headers
3. Should see: `Access-Control-Allow-Origin: *`
4. Status should be `200 OK`

---

## 🛡️ Prevention Strategies

### **1. Use Environment Variables**

Create `.env` file:
```env
VITE_FIREBASE_PROJECT_ID=kartavya-58d2c
VITE_CLOUD_FUNCTIONS_REGION=asia-south1
```

Use in code:
```javascript
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const region = import.meta.env.VITE_CLOUD_FUNCTIONS_REGION;
const url = `https://${region}-${projectId}.cloudfunctions.net/functionName`;
```

### **2. Centralized Configuration**

Create `src/config/functions.js`:
```javascript
export const CLOUD_FUNCTIONS_CONFIG = {
  projectId: 'kartavya-58d2c',
  region: 'asia-south1',
  endpoints: {
    processScheduledTasks: 'processScheduledTasksHttp',
    manualWeeklyReset: 'manualWeeklyReset',
    sendNotification: 'sendNotification'
  }
};

export const getCloudFunctionUrl = (functionName) => {
  const { projectId, region, endpoints } = CLOUD_FUNCTIONS_CONFIG;
  const endpoint = endpoints[functionName] || functionName;
  return `https://${region}-${projectId}.cloudfunctions.net/${endpoint}`;
};
```

Then use:
```javascript
import { getCloudFunctionUrl } from '../config/functions';

const url = getCloudFunctionUrl('processScheduledTasks');
```

### **3. Verify Deployments**

After deploying functions:
```bash
firebase functions:list
# Shows all deployed functions with their URLs
```

---

## 📝 Related Documentation

- **Firebase Cloud Functions Regions**: https://firebase.google.com/docs/functions/locations
- **CORS Handling**: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- **Cloud Functions HTTP Triggers**: https://firebase.google.com/docs/functions/http-events

---

## ✨ Summary

| Aspect | Details |
|--------|---------|
| **Error Type** | CORS + 404 Not Found |
| **Root Cause** | Region mismatch (asia-south2 vs asia-south1) |
| **Affected Functions** | 2 (processScheduledTasksHttp, manualWeeklyReset) |
| **Files Modified** | 2 (taskApi.js, weeklyResetApi.js) |
| **Fix Type** | Configuration update + rebuild + redeploy |
| **Status** | ✅ RESOLVED |
| **Deployment Status** | ✅ COMPLETE |

---

**Last Updated**: October 15, 2025
**Status**: Fixed and Deployed ✅




