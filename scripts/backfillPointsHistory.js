/**
 * Backfill Points History Script
 * 
 * Adds October 2024 points to users' pointsHistory based on their completed tasks.
 * This populates the usable points system for existing users.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, query, where, serverTimestamp, writeBatch, Timestamp } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBOIBP01j6m1K7DrwsQCo9bWN1yG-e48RM",
  authDomain: "kartavya-58d2c.firebaseapp.com",
  projectId: "kartavya-58d2c",
  storageBucket: "kartavya-58d2c.firebasestorage.app",
  messagingSenderId: "899861294582",
  appId: "1:899861294582:web:80adaebe5a29daacac2bd7",
  measurementId: "G-TW66R38EE6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const POINTS_CONFIG = {
  EXPIRATION_DAYS: 90, // Points expire after 90 days
};

// Date range for October 2024
const OCTOBER_START = new Date('2024-10-01T00:00:00Z');
const OCTOBER_END = new Date('2024-10-31T23:59:59Z');

// Difficulty points mapping
const DIFFICULTY_POINTS = {
  easy: 10,
  medium: 25,
  hard: 50,
  critical: 100,
};

/**
 * Format date to date key
 */
function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse Firestore timestamp
 */
function parseTimestamp(timestamp) {
  if (!timestamp) return null;
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000);
  }
  if (timestamp.toDate) {
    return timestamp.toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return null;
}

/**
 * Calculate task points for a user
 */
function calculateTaskPoints(task, userId) {
  if (!task.assignedUserIds || !task.assignedUserIds.includes(userId)) {
    return 0;
  }

  const assignedUserCount = task.assignedUserIds.length;
  let basePoints = 50; // Default
  
  // Get base points from difficulty
  if (task.difficulty && DIFFICULTY_POINTS[task.difficulty]) {
    basePoints = DIFFICULTY_POINTS[task.difficulty];
  }
  
  // R&D/New Skill tasks get 5x base points
  if (task.isRdNewSkill) {
    basePoints = basePoints * 5;
  }
  
  // Split points among assigned users
  let basePointsPerUser = Math.round(basePoints / assignedUserCount);
  
  // Add bonuses (only for regular tasks, not R&D)
  if (!task.isRdNewSkill) {
    const collaborationBonus = assignedUserCount > 1 ? Math.round(basePointsPerUser * 0.1) : 0;
    const urgentBonus = task.isUrgent ? Math.round(basePointsPerUser * 0.25) : 0;
    basePointsPerUser += collaborationBonus + urgentBonus;
  }
  
  // On-time bonus
  const completionDate = parseTimestamp(task.completedAt);
  const targetDate = parseTimestamp(task.targetDate);
  if (completionDate && targetDate && completionDate <= targetDate) {
    if (task.isRdNewSkill) {
      // R&D tasks get no on-time bonus
    } else {
      basePointsPerUser += 3;
    }
  }
  
  return basePointsPerUser;
}

/**
 * Backfill points history for all users
 */
async function backfillPointsHistory() {
  console.log('Starting points history backfill for October 2024...');
  
  try {
    // Get all users
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`Found ${users.length} users`);
    
    // Get all completed tasks from October
    const tasksSnapshot = await getDocs(
      query(
        collection(db, 'tasks'),
        where('status', '==', 'Complete')
      )
    );
    const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`Found ${tasks.length} completed tasks`);
    
    let usersUpdated = 0;
    let errors = [];
    
    // Process each user
    for (const user of users) {
      try {
        console.log(`Processing user: ${user.name || user.id}`);
        
        // Get user's completed tasks in October
        const userTasks = tasks.filter(task => {
          if (!task.assignedUserIds || !task.assignedUserIds.includes(user.id)) {
            return false;
          }
          
          const completionDate = parseTimestamp(task.completedAt);
          if (!completionDate) return false;
          
          return completionDate >= OCTOBER_START && completionDate <= OCTOBER_END;
        });
        
        console.log(`  Found ${userTasks.length} completed tasks in October`);
        
        if (userTasks.length === 0) {
          console.log(`  No tasks to process for ${user.name || user.id}`);
          continue;
        }
        
        // Group tasks by date and calculate points
        const pointsByDate = {};
        
        userTasks.forEach(task => {
          const completionDate = parseTimestamp(task.completedAt);
          if (!completionDate) return;
          
          const dateKey = formatDateKey(completionDate);
          if (!dateKey) return;
          
          const points = calculateTaskPoints(task, user.id);
          
          if (!pointsByDate[dateKey]) {
            pointsByDate[dateKey] = 0;
          }
          pointsByDate[dateKey] += points;
        });
        
        console.log(`  Points by date:`, Object.keys(pointsByDate).length, 'days');
        
        // Get existing pointsHistory or initialize it
        const existingPointsHistory = user.pointsHistory || {};
        const newPointsHistory = { ...existingPointsHistory };
        
        // Add October points to history
        Object.entries(pointsByDate).forEach(([dateKey, points]) => {
          if (newPointsHistory[dateKey]) {
            // If entry exists, add to it
            newPointsHistory[dateKey].points += points;
          } else {
            // Create new entry
            newPointsHistory[dateKey] = {
              points: points,
              addedAt: Timestamp.fromDate(new Date(dateKey)),
              expirationDays: POINTS_CONFIG.EXPIRATION_DAYS,
              isUsable: true,
            };
          }
        });
        
        // Calculate total usable and total points
        let totalPoints = 0;
        const now = new Date();
        let usablePoints = 0;
        
        Object.entries(newPointsHistory).forEach(([dateKey, entry]) => {
          if (!entry || typeof entry.points !== 'number') return;
          
          totalPoints += entry.points;
          
          // Check if points are still usable
          const pointsDate = new Date(dateKey);
          const expirationDate = new Date(pointsDate);
          expirationDate.setDate(expirationDate.getDate() + (entry.expirationDays || POINTS_CONFIG.EXPIRATION_DAYS));
          
          if (now <= expirationDate && entry.isUsable !== false) {
            usablePoints += entry.points;
          }
        });
        
        // Update user document
        const userRef = doc(db, 'users', user.id);
        await updateDoc(userRef, {
          pointsHistory: newPointsHistory,
          usablePoints: Math.floor(usablePoints),
          totalPoints: Math.floor(totalPoints),
          pointsHistoryBackfilled: true,
          pointsHistoryBackfillDate: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        
        console.log(`  ✓ Updated ${user.name || user.id} - Usable: ${Math.floor(usablePoints)}, Total: ${Math.floor(totalPoints)}`);
        usersUpdated++;
        
      } catch (error) {
        console.error(`  ✗ Error processing ${user.name || user.id}:`, error.message);
        errors.push({ user: user.name || user.id, error: error.message });
      }
    }
    
    console.log(`\nBackfill complete!`);
    console.log(`Users updated: ${usersUpdated}`);
    console.log(`Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(({ user, error }) => {
        console.log(`  ${user}: ${error}`);
      });
    }
    
    return {
      success: true,
      usersUpdated,
      errors: errors.length,
    };
    
  } catch (error) {
    console.error('Fatal error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Export function for use in browser console or Node script
export { backfillPointsHistory };

// If running as script (Node.js environment)
if (typeof process !== 'undefined' && process.argv) {
  backfillPointsHistory()
    .then((result) => {
      console.log('\nResult:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

