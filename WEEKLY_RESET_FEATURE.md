# 🏆 Weekly Leaderboard Reset Feature

## Overview
The Weekly Leaderboard Reset feature automatically resets TCs (Total Contribution Scores), EP (Execution Points), and LP (Leadership Points) every Monday at midnight, ensuring fair competition and fresh starts for all users.

## Features

### 🔄 Automated Weekly Reset
- **Schedule**: Every Monday at midnight (Asia/Kolkata timezone)
- **Scope**: Resets all user weekly scores (EP, LP, TCS, bonus points)
- **Archiving**: Previous week's rankings are automatically archived
- **Notifications**: All users receive push notifications about the reset

### 📊 Weekly Rankings Display
- **Current Week View**: Shows rankings for the current week only
- **Toggle Interface**: Users can switch between overall and weekly rankings
- **Real-time Updates**: Rankings update as tasks are completed
- **Department Filtering**: View rankings by department

### 👨‍💼 Admin Controls
- **Manual Reset**: Admins can trigger weekly reset at any time
- **Reset History**: Track when resets were performed
- **User Notifications**: Manual resets also notify all users
- **Audit Trail**: All manual resets are logged with admin details

## Technical Implementation

### Backend (Firebase Cloud Functions)

#### 1. Automated Reset Function
```javascript
exports.weeklyLeaderboardReset = onSchedule({
  schedule: '0 0 * * 1', // Every Monday at midnight
  timeZone: 'Asia/Kolkata',
  memory: '1GB',
  timeoutSeconds: 540
}, async (event) => {
  // Reset logic here
});
```

#### 2. Manual Reset Function
```javascript
exports.manualWeeklyReset = onRequest(async (request, response) => {
  // Admin-only manual reset logic
});
```

### Frontend Components

#### 1. Weekly Reset Utilities (`src/shared/utils/weeklyReset.js`)
- `getStartOfWeek()`: Calculate start of current week (Monday)
- `getEndOfWeek()`: Calculate end of current week (Sunday)
- `shouldResetWeekly()`: Check if weekly reset is needed
- `archiveWeeklyLeaderboard()`: Archive current week's data
- `resetWeeklyScores()`: Reset all user weekly scores
- `getCurrentWeekRankings()`: Calculate current week's rankings

#### 2. API Functions (`src/features/admin/api/weeklyResetApi.js`)
- `triggerManualWeeklyReset()`: Call manual reset function
- `getWeeklyLeaderboardHistory()`: Fetch archived rankings
- `getLastWeeklyReset()`: Get last reset information

#### 3. UI Components
- **PointsTab**: Updated with weekly rankings toggle and admin controls
- **Weekly Rankings Section**: Displays current week's top performers
- **Admin Reset Button**: Allows admins to manually trigger reset

## Data Structure

### User Document Updates
When weekly reset occurs, the following fields are updated:
```javascript
{
  weeklyExecutionPoints: 0,
  weeklyLeadershipPoints: 0,
  weeklyBonusPoints: 0,
  weeklyTCS: 0,
  weeklyCompletedTasks: 0,
  lastWeeklyReset: serverTimestamp(),
  weeklyRank: null,
  weeklyRankLastWeek: previousRank // Store last week's rank
}
```

### Archive Document Structure
```javascript
{
  weekStart: Timestamp,
  weekEnd: Timestamp,
  archivedAt: Timestamp,
  rankings: [
    {
      userId: string,
      userName: string,
      executionPoints: number,
      leadershipPoints: number,
      bonusPoints: number,
      tcs: number,
      completedTasks: number,
      departmentId: string,
      rank: number
    }
  ],
  totalUsers: number,
  topPerformer: object,
  topLeader: object,
  manualReset: boolean, // If manually triggered
  resetBy: string // Admin user ID if manual
}
```

## Usage Guide

### For Users
1. **View Weekly Rankings**: Click "📅 Show Weekly" in the Points tab
2. **Track Progress**: See your current week's performance
3. **Reset Notifications**: Receive notifications when weekly reset occurs
4. **Historical Data**: Previous week's rankings are archived

### For Admins
1. **Manual Reset**: Click "🔄 Reset Weekly" button in Points tab
2. **Monitor Resets**: Check reset history and timing
3. **User Notifications**: All resets notify users automatically
4. **Audit Trail**: All manual resets are logged

## Configuration

### Reset Schedule
- **Frequency**: Weekly (every Monday)
- **Time**: 00:00 (midnight)
- **Timezone**: Asia/Kolkata
- **Memory**: 1GB allocated
- **Timeout**: 9 minutes maximum

### Notification Settings
- **Title**: "🏆 Weekly Leaderboard Reset!"
- **Message**: "New week, new opportunities! Your weekly scores have been reset."
- **Data**: Includes reset type and week start date

## Testing

### Unit Tests
- `src/shared/utils/__tests__/weeklyReset.test.js`
- Tests for date calculations and reset logic
- Verifies week boundary calculations

### Manual Testing
1. **Development Server**: Run `npm run dev`
2. **Admin Access**: Login as admin user
3. **Weekly View**: Toggle weekly rankings display
4. **Manual Reset**: Test admin reset functionality
5. **Notifications**: Verify reset notifications

## Monitoring

### Cloud Function Logs
- Monitor `weeklyLeaderboardReset` function execution
- Check for errors in reset process
- Verify user notification delivery

### Firestore Collections
- `weeklyLeaderboardArchives`: Historical rankings data
- `system/weeklyReset`: Reset metadata and timestamps
- `users`: Updated with weekly score fields

## Troubleshooting

### Common Issues

#### Reset Not Triggering
- Check Cloud Function deployment
- Verify cron schedule syntax
- Check timezone configuration

#### Manual Reset Failing
- Verify admin user permissions
- Check API endpoint accessibility
- Review error logs for details

#### Rankings Not Updating
- Verify Firestore rules allow updates
- Check user data structure
- Ensure proper date calculations

### Error Handling
- All functions include comprehensive error handling
- Failed resets are logged with detailed error messages
- Users are notified of any reset failures

## Future Enhancements

### Planned Features
1. **Custom Reset Schedules**: Allow different reset frequencies
2. **Department-Specific Resets**: Reset by department
3. **Reset Analytics**: Detailed reset performance metrics
4. **User Preferences**: Allow users to opt-out of notifications
5. **Reset Templates**: Predefined reset configurations

### Performance Optimizations
1. **Batch Processing**: Optimize large user base resets
2. **Caching**: Cache frequently accessed data
3. **Parallel Processing**: Process departments in parallel
4. **Database Indexing**: Optimize query performance

## Security Considerations

### Access Control
- Manual reset requires admin role verification
- API endpoints validate user permissions
- All operations are logged for audit

### Data Protection
- User data is anonymized in archives
- Sensitive information is excluded from logs
- Reset operations are atomic and consistent

## Support

### Documentation
- This feature guide
- API documentation
- User training materials

### Contact
- Technical issues: System administrator
- Feature requests: Development team
- User training: Department heads

---

*Last updated: [Current Date]*
*Version: 1.0.0*

