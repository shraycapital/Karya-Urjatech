#  Karya Points Calculation System

This document provides a detailed explanation of how points are calculated in the Karya Task Management application. The system is designed to reward users for task completion, leadership, and daily engagement.

The points system is composed of three main components:
1.  **Execution Points (EP)**: Earned by completing tasks.
2.  **Leadership Points (LP)**: Awarded to users who assign tasks that are successfully completed.
3.  **Bonus Points**: Extra points awarded for various activities, like daily streaks.

The **Total Contribution Score (TCS)** is the sum of these three components.

---

## 1. Execution Points (EP)

Execution Points are the primary way users earn points. They are calculated based on the tasks they complete.

### Base Points per Task

The base points for a task are determined by its difficulty level:

| Difficulty | Base Points |
| :--- | :--- |
| Easy | 10 |
| Medium | 25 |
| Hard | 50 |
| Critical | 100 |

### R&D / New Skill Task Multiplier

If a task is marked as an "R&D/New Skill" task, its base points are multiplied by **5x**.

-   **Example**: A 'Hard' R&D task would have `50 * 5 = 250` base points.

### Points Distribution for Team Tasks

If a task is assigned to multiple users, the base points are split evenly among them.

-   **Example**: A 'Hard' task (50 points) assigned to 2 users means each user's base calculation starts from `50 / 2 = 25` points.

### EP Bonuses (for regular tasks)

Bonuses are added to the user's share of the base points. **These bonuses do not apply to R&D/New Skill tasks.**

-   **Collaboration Bonus**: **+10%** of the user's base points if the task is assigned to more than one person.
-   **Urgent Task Bonus**: **+25%** of the user's base points if the task is marked as urgent.
-   **On-Time Completion Bonus**: **+3** flat points if the task is completed on or before its target date. (This is mainly applied in the backend).

### Final EP Calculation Formula

```
EP = (BasePoints / AssignedUsers) + CollaborationBonus + UrgentBonus + OnTimeBonus
```

**Example:**
A 'Medium' (25 points), 'Urgent' task is assigned to 2 users and completed on time.
-   Base points per user: `25 / 2 = 12.5`, rounded to `13`.
-   Collaboration Bonus: `13 * 0.10 = 1.3`, rounded to `1`.
-   Urgent Bonus: `13 * 0.25 = 3.25`, rounded to `3`.
-   On-Time Bonus: `3`.
-   **Total EP for each user**: `13 + 1 + 3 + 3 = 20` points.

---

## 2. Leadership Points (LP)

Leadership Points are awarded to the user who created/assigned a task when it is completed by the assignees. This rewards effective management and task delegation. LP is calculated based on the task's EP.

LP has three components:

-   **Completion Bonus**:
    -   For regular tasks: **20%** of the task's total EP.
    -   For R&D/New Skill tasks: **50%** of the task's total EP.
-   **Difficulty Fairness Bonus**: **5%** of the task's EP. This is awarded if the actual time taken to complete the task is within a reasonable range of the expected time for its difficulty level. This bonus is not awarded for R&D tasks.
-   **On-Time Delivery Bonus**: **5%** of the task's EP if the task is completed by its target date. This bonus is not awarded for R&D tasks.

### Final LP Calculation Formula

```
LP = CompletionBonus + DifficultyFairnessBonus + OnTimeDeliveryBonus
```

---

## 3. Bonus Points

Users can earn additional points that are not tied to a specific task.

-   **Daily Bonus**: Users can claim a daily bonus of **25 points**. The `dailyBonus.js` utility manages the logic for claiming and tracking these bonuses.

---

## Total Contribution Score (TCS)

The TCS is the ultimate measure of a user's contribution. It's a simple sum of all the points they have earned.

### TCS Formula

```
TCS = Total EP + Total LP + Total Bonus Points
```

This score is used for the main leaderboard rankings. The system also supports weekly resets, where these scores are archived and reset to 0 for the new week.
