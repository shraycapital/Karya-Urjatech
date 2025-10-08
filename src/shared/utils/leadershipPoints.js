/**
 * Leadership Points (LP) Utility Functions
 * 
 * Leadership Points are awarded to managers (task assigners) based on their team's performance.
 * This encourages good task assignment, difficulty calibration, and deadline setting.
 */

/**
 * Calculate Leadership Points for a completed task
 * 
 * LP Components:
 * - Completion Bonus (10% of task EP): Awarded when team completes a task
 * - Difficulty Fairness (5% of task EP): Awarded if task difficulty matches actual completion time
 * - On-Time Delivery (5% of task EP): Awarded if task completed before/on target date
 * 
 * @param {Object} task - The completed task object
 * @param {number} taskExecutionPoints - The execution points earned by the task completer
 * @returns {Object} LP breakdown { completionBonus, difficultyFairness, onTimeBonus, total }
 */
export function calculateLeadershipPoints(task, taskExecutionPoints) {
  if (!task || !taskExecutionPoints) {
    return { completionBonus: 0, difficultyFairness: 0, onTimeBonus: 0, total: 0 };
  }

  let completionBonus = 0;
  let difficultyFairness = 0;
  let onTimeBonus = 0;

  // Check if this is an R&D/New Skill task
  const isRdNewSkill = task.isRdNewSkill || false;

  // 1. Completion Bonus
  if (isRdNewSkill) {
    // R&D/New Skill tasks: 100% of EP as completion bonus
    completionBonus = taskExecutionPoints;
  } else {
    // Regular tasks: 10% of EP
    completionBonus = Math.round(taskExecutionPoints * 0.10);
  }

  // 2. Difficulty Fairness (5% of EP) - Only for regular tasks
  // R&D/New Skill tasks skip difficulty fairness bonus
  if (!isRdNewSkill && task.startedAt && task.completedAt) {
    const startDate = task.startedAt?.seconds 
      ? new Date(task.startedAt.seconds * 1000)
      : new Date(task.startedAt);
    const completeDate = task.completedAt?.seconds
      ? new Date(task.completedAt.seconds * 1000)
      : new Date(task.completedAt);
    
    const timeTakenHours = (completeDate - startDate) / (1000 * 60 * 60);
    
    // Difficulty expectations (in hours)
    const difficultyExpectations = {
      'easy': 4,      // < 4 hours
      'medium': 12,   // 4-12 hours
      'hard': 48,     // 12-48 hours
      'critical': 120 // > 48 hours
    };
    
    const expectedHours = difficultyExpectations[task.difficulty?.toLowerCase()] || 12;
    const tolerance = 0.5; // 50% tolerance
    
    // Award if completion time is within expected range
    if (timeTakenHours <= expectedHours * (1 + tolerance)) {
      difficultyFairness = Math.round(taskExecutionPoints * 0.05);
    }
  }

  // 3. On-Time Delivery Bonus (5% of EP) - Only for regular tasks
  // R&D/New Skill tasks skip on-time delivery bonus
  if (!isRdNewSkill && task.completedAt && task.targetDate) {
    const completeDate = task.completedAt?.seconds
      ? new Date(task.completedAt.seconds * 1000)
      : new Date(task.completedAt);
    const targetDate = task.targetDate?.seconds
      ? new Date(task.targetDate.seconds * 1000)
      : new Date(task.targetDate);
    
    if (completeDate <= targetDate) {
      onTimeBonus = Math.round(taskExecutionPoints * 0.05);
    }
  }

  const total = completionBonus + difficultyFairness + onTimeBonus;

  return {
    completionBonus,
    difficultyFairness,
    onTimeBonus,
    total,
    breakdown: `Completion: ${completionBonus} | Fairness: ${difficultyFairness} | On-Time: ${onTimeBonus}`
  };
}

/**
 * Calculate total EP (Execution Points) from completed tasks
 * 
 * @param {Array} completedTasks - Array of tasks completed by the user
 * @param {Function} calculateTaskPoints - Function to calculate points for a single task
 * @returns {number} Total execution points
 */
export function calculateExecutionPoints(completedTasks, calculateTaskPoints) {
  if (!Array.isArray(completedTasks) || !calculateTaskPoints) return 0;
  
  return completedTasks.reduce((total, task) => {
    return total + calculateTaskPoints(task);
  }, 0);
}

/**
 * Calculate total LP (Leadership Points) from tasks assigned by the user
 * 
 * @param {Array} tasks - All tasks in the system
 * @param {string} managerId - The manager's user ID
 * @param {Function} calculateTaskPoints - Function to calculate EP for a task
 * @returns {Object} LP breakdown { total, completionBonus, difficultyFairness, onTimeBonus, tasksAwarded }
 */
export function calculateTotalLeadershipPoints(tasks, managerId, calculateTaskPoints) {
  if (!Array.isArray(tasks) || !managerId || !calculateTaskPoints) {
    return { total: 0, completionBonus: 0, difficultyFairness: 0, onTimeBonus: 0, tasksAwarded: 0 };
  }

  let totalCompletionBonus = 0;
  let totalDifficultyFairness = 0;
  let totalOnTimeBonus = 0;
  let tasksAwarded = 0;

  // Filter tasks assigned by this manager that are completed
  const managerTasks = tasks.filter(task => 
    task.assignedById === managerId && 
    task.status === 'Complete'
  );

  managerTasks.forEach(task => {
    const taskEP = calculateTaskPoints(task);
    const lpBreakdown = calculateLeadershipPoints(task, taskEP);
    
    totalCompletionBonus += lpBreakdown.completionBonus;
    totalDifficultyFairness += lpBreakdown.difficultyFairness;
    totalOnTimeBonus += lpBreakdown.onTimeBonus;
    tasksAwarded++;
  });

  return {
    total: totalCompletionBonus + totalDifficultyFairness + totalOnTimeBonus,
    completionBonus: totalCompletionBonus,
    difficultyFairness: totalDifficultyFairness,
    onTimeBonus: totalOnTimeBonus,
    tasksAwarded
  };
}

/**
 * Calculate TCS (Total Contribution Score) = EP + LP + Bonuses - Penalties
 * 
 * @param {number} executionPoints - Total EP
 * @param {number} leadershipPoints - Total LP
 * @param {number} bonuses - Total bonus points
 * @param {number} penalties - Total penalty points
 * @returns {number} Total Contribution Score
 */
export function calculateTCS(executionPoints, leadershipPoints, bonuses = 0, penalties = 0) {
  return executionPoints + leadershipPoints + bonuses - penalties;
}

/**
 * Get LP breakdown for display in UI
 * 
 * @param {Object} lpData - LP data object from calculateTotalLeadershipPoints
 * @returns {Array} Array of breakdown items for display
 */
export function getLPBreakdownDisplay(lpData) {
  return [
    {
      label: 'Team Completion',
      value: lpData.completionBonus,
      icon: '✅',
      description: '10% of team\'s EP'
    },
    {
      label: 'Task Calibration',
      value: lpData.difficultyFairness,
      icon: '⚖️',
      description: '5% for fair difficulty'
    },
    {
      label: 'On-Time Delivery',
      value: lpData.onTimeBonus,
      icon: '⏰',
      description: '5% for meeting deadlines'
    }
  ];
}

