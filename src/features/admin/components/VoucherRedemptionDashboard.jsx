import React, { useState, useEffect, useMemo } from 'react';
import { getAllRedeemedVouchers, getUserVoucherStats, deleteVoucherAndRefund } from '../../../shared/utils/voucherManagement';
import { getPointsBreakdown, adjustUserPoints } from '../../../shared/utils/pointsManagement';
import { getTotalBonusPoints } from '../../../shared/utils/dailyBonus';
import { calculateTotalLeadershipPoints, calculateTCS } from '../../../shared/utils/leadershipPoints';
import { DIFFICULTY_CONFIG, STATUSES } from '../../../shared/constants';
import { pwaAnalytics } from '../../../shared/utils/pwaAnalytics';
import { db } from '../../../firebase';
import { doc, getDoc } from 'firebase/firestore';

const VoucherRedemptionDashboard = ({ users, currentUser, tasks = [] }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [userStats, setUserStats] = useState([]);
  const [redemptionHistory, setRedemptionHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showPointsAdjustModal, setShowPointsAdjustModal] = useState(false);
  const [selectedUserForAdjustment, setSelectedUserForAdjustment] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedVoucherForDeletion, setSelectedVoucherForDeletion] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, [users, tasks]);

  const calculateTaskPoints = (task) => {
    if (!task?.assignedUserIds || !Array.isArray(task.assignedUserIds)) return 0;

    const assignedUserCount = task.assignedUserIds.length || 1;
    let basePoints = 50;

    if (task.difficulty && DIFFICULTY_CONFIG[task.difficulty]) {
      basePoints = DIFFICULTY_CONFIG[task.difficulty].points;
    } else if (typeof task.points === 'number') {
      basePoints = task.points;
    }

    const isRdNewSkill = task.isRdNewSkill || false;
    if (isRdNewSkill) {
      basePoints = basePoints * 5;
    }

    const basePointsPerUser = Math.round(basePoints / assignedUserCount);
    const collaborationBonus = !isRdNewSkill && assignedUserCount > 1 ? Math.round(basePointsPerUser * 0.1) : 0;
    const urgentBonus = !isRdNewSkill && task.isUrgent ? Math.round(basePointsPerUser * 0.25) : 0;

    return basePointsPerUser + collaborationBonus + urgentBonus;
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load user-wise stats
      const stats = await Promise.all(
        users.map(async (user) => {
          const freshUserSnap = await getDoc(doc(db, 'users', user.id));
          const effectiveUser = freshUserSnap.exists()
            ? { id: freshUserSnap.id, ...freshUserSnap.data() }
            : user;
          const vouchers = await getUserVoucherStats(effectiveUser.id);
          const pointsBreakdown = getPointsBreakdown(effectiveUser);
          const completedTasks = (tasks || []).filter(task =>
            task?.status === STATUSES.COMPLETE &&
            Array.isArray(task.assignedUserIds) &&
            task.assignedUserIds.includes(effectiveUser.id)
          );
          const executionPoints = completedTasks.reduce((sum, task) => sum + calculateTaskPoints(task), 0);
          const leadershipPoints = calculateTotalLeadershipPoints(tasks || [], effectiveUser.id, calculateTaskPoints).total;
          const bonusPoints = getTotalBonusPoints(effectiveUser?.dailyBonusLedger || {});
          const computedTcs = calculateTCS(executionPoints, leadershipPoints, bonusPoints, 0);
          return {
            user: effectiveUser,
            vouchers,
            points: pointsBreakdown,
            computedTcs,
            executionPoints,
            leadershipPoints,
            bonusPoints,
          };
        })
      );
      setUserStats(stats);

      // Load redemption history
      const history = await getAllRedeemedVouchers();
      setRedemptionHistory(history);

      // Load PWA analytics for market/voucher tab
      const analyticsData = await getMarketAnalytics();
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMarketAnalytics = async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Query PWA analytics for market/voucher related events
      const marketEvents = await pwaAnalytics.getAnalyticsData(thirtyDaysAgo, new Date());
      
      // Filter for market/voucher events
      const relevantEvents = marketEvents.eventTypes || {};
      return {
        marketVisits: relevantEvents['market_tab_click'] || 0,
        voucherPurchases: relevantEvents['voucher_purchased'] || 0,
        shopViewCount: relevantEvents['shop_view'] || 0,
        totalEvents: marketEvents.totalEvents || 0,
        dailyBreakdown: marketEvents.dailyBreakdown || [],
      };
    } catch (error) {
      console.error('Error loading market analytics:', error);
      return null;
    }
  };

  const handleAdjustPoints = (user) => {
    setSelectedUserForAdjustment(user);
    setShowPointsAdjustModal(true);
  };

  const handleDeleteVoucher = (voucher) => {
    setSelectedVoucherForDeletion(voucher);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteVoucher = async (reason) => {
    if (!selectedVoucherForDeletion) return;
    
    setLoading(true);
    try {
      const result = await deleteVoucherAndRefund(
        selectedVoucherForDeletion.userId,
        selectedVoucherForDeletion.id,
        selectedVoucherForDeletion.productId,
        selectedVoucherForDeletion.pointsSpent,
        currentUser.id,
        reason
      );
      
      if (result.success) {
        alert(`Voucher deleted successfully! ${result.refundedPoints} points refunded to user.`);
        await loadDashboardData();
      } else {
        alert(`Error deleting voucher: ${result.error}`);
      }
    } catch (error) {
      console.error('Error in confirmDeleteVoucher:', error);
      alert('Failed to delete voucher');
    } finally {
      setShowDeleteConfirm(false);
      setSelectedVoucherForDeletion(null);
      setLoading(false);
    }
  };

  const confirmAdjustPoints = async (adjustment, reason) => {
    if (!selectedUserForAdjustment || !adjustment || adjustment === 0) return;
    
    setLoading(true);
    try {
      const result = await adjustUserPoints(
        selectedUserForAdjustment.user.id,
        adjustment,
        reason,
        currentUser.id
      );
      
      if (result.success) {
        alert(`Points adjusted successfully! New usable points: ${result.newUsablePoints}`);
        await loadDashboardData();
      } else {
        alert(`Error adjusting points: ${result.error}`);
      }
    } catch (error) {
      console.error('Error in confirmAdjustPoints:', error);
      alert('Failed to adjust points');
    } finally {
      setShowPointsAdjustModal(false);
      setSelectedUserForAdjustment(null);
      setLoading(false);
    }
  };

  const totalTCS = useMemo(() => {
    return userStats.reduce((sum, stat) => sum + (stat.computedTcs || 0), 0);
  }, [userStats]);

  const totalSpent = useMemo(() => {
    return userStats.reduce((sum, stat) => sum + (stat.vouchers.totalPointsSpent || 0), 0);
  }, [userStats]);

  const totalVouchers = useMemo(() => {
    return userStats.reduce((sum, stat) => sum + (stat.vouchers.total || 0), 0);
  }, [userStats]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Voucher Redemption Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Comprehensive overview of user voucher activity</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'overview'
              ? 'border-b-2 border-brand-600 text-brand-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'users'
              ? 'border-b-2 border-brand-600 text-brand-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          User Stats
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'history'
              ? 'border-b-2 border-brand-600 text-brand-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Redemption History
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'analytics'
              ? 'border-b-2 border-brand-600 text-brand-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Analytics
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-blue-600">{totalTCS}</div>
              <div className="text-sm text-gray-600">Total TCS</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-orange-600">{totalSpent}</div>
              <div className="text-sm text-gray-600">Total Spent</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-purple-600">{totalVouchers}</div>
              <div className="text-sm text-gray-600">Total Vouchers</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-green-600">{redemptionHistory.length}</div>
              <div className="text-sm text-gray-600">Redeemed</div>
            </div>
          </div>

          {/* Top Users */}
          <div className="bg-white rounded-lg border">
            <div className="p-4 border-b">
              <h3 className="font-semibold">Top Users</h3>
            </div>
            <div className="p-4 space-y-3">
              {userStats
                .sort((a, b) => (b.vouchers.totalPointsSpent || 0) - (a.vouchers.totalPointsSpent || 0))
                .slice(0, 5)
                .map((stat, index) => (
                  <div key={stat.user.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{index + 1}.</span>
                      <div>
                        <div className="font-medium">{stat.user.name}</div>
                        <div className="text-sm text-gray-500">{stat.vouchers.total} vouchers</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-brand-600">{stat.vouchers.totalPointsSpent || 0} pts</div>
                      <div className="text-xs text-gray-500">{stat.computedTcs || 0} TCS</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* User Stats Tab */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total TCS Earned</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usable Points</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expired Points</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Vouchers</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points Spent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {userStats.map((stat) => (
                  <tr key={stat.user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{stat.user.name}</div>
                      <div className="text-xs text-gray-500">{stat.user.role}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-blue-600">{stat.computedTcs || 0}</td>
                    <td className="px-4 py-3 text-sm text-green-600">{stat.points.usable}</td>
                    <td className="px-4 py-3 text-sm text-red-600">{stat.points.expired}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{stat.vouchers.total || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{stat.vouchers.totalPointsSpent || 0}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleAdjustPoints(stat)}
                        className="text-sm bg-brand-600 text-white px-3 py-1 rounded hover:bg-brand-700"
                      >
                        Adjust Points
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Redemption History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-semibold">All Voucher Allocations and Redemptions</h3>
            <p className="text-sm text-gray-500 mt-1">Total: {redemptionHistory.length} vouchers redeemed</p>
          </div>
          {redemptionHistory.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3">🎫</div>
              <p className="text-gray-600">No voucher redemptions yet</p>
              <p className="text-sm text-gray-500 mt-1">Users haven't purchased any vouchers yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Voucher</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {redemptionHistory.map((voucher) => (
                    <tr key={voucher.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{voucher.userName}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{voucher.productName}</td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-700">{voucher.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{voucher.pointsSpent}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          voucher.status === 'used'
                            ? 'bg-green-100 text-green-800'
                            : voucher.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {voucher.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {voucher.purchasedAt?.toDate?.().toLocaleString() || 
                         (voucher.purchasedAt?.seconds ? new Date(voucher.purchasedAt.seconds * 1000).toLocaleString() : 'N/A')}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDeleteVoucher(voucher)}
                          className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-blue-600">{analytics?.marketVisits || 0}</div>
              <div className="text-sm text-gray-600">Market Tab Visits</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-purple-600">{analytics?.voucherPurchases || 0}</div>
              <div className="text-sm text-gray-600">Voucher Purchases</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-orange-600">{analytics?.shopViewCount || 0}</div>
              <div className="text-sm text-gray-600">Shop Views</div>
            </div>
          </div>

          {/* Daily Breakdown */}
          {analytics?.dailyBreakdown && analytics.dailyBreakdown.length > 0 && (
            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-semibold mb-4">Activity Over Time</h3>
              <div className="space-y-2">
                {analytics.dailyBreakdown.slice(-7).map((day, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{day.date}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-blue-600">{day.totalEvents || 0} events</span>
                      <span className="text-green-600">{day.uniqueUsers || 0} users</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Points Adjustment Modal */}
      {showPointsAdjustModal && selectedUserForAdjustment && (
        <PointsAdjustModal
          stat={selectedUserForAdjustment}
          onClose={() => {
            setShowPointsAdjustModal(false);
            setSelectedUserForAdjustment(null);
          }}
          onConfirm={confirmAdjustPoints}
        />
      )}

      {/* Delete Voucher Confirmation Modal */}
      {showDeleteConfirm && selectedVoucherForDeletion && (
        <DeleteVoucherModal
          voucher={selectedVoucherForDeletion}
          onClose={() => {
            setShowDeleteConfirm(false);
            setSelectedVoucherForDeletion(null);
          }}
          onConfirm={confirmDeleteVoucher}
        />
      )}
    </div>
  );
};

// Points Adjustment Modal Component
const PointsAdjustModal = ({ stat, onClose, onConfirm }) => {
  const [adjustment, setAdjustment] = useState('');
  const [reason, setReason] = useState('');
  const user = stat.user;

  const handleSubmit = (e) => {
    e.preventDefault();
    const adjustmentNum = parseInt(adjustment, 10);
    if (isNaN(adjustmentNum) || adjustmentNum === 0) {
      alert('Please enter a valid points adjustment (positive or negative number)');
      return;
    }
    onConfirm(adjustmentNum, reason);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <form onSubmit={handleSubmit}>
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="text-lg font-semibold">Adjust Points for {user.name}</h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
              &times;
            </button>
          </div>
          
          <div className="p-4 space-y-4">
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-sm text-gray-700">
                <div className="flex justify-between mb-1">
                  <span>Current TCS Earned:</span>
                  <span className="font-semibold">{stat.computedTcs || 0}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span>Current Usable Points:</span>
                  <span className="font-semibold">{stat.points?.usable || 0}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Points Adjustment
                <span className="text-xs text-gray-500 ml-2">(positive to add, negative to subtract)</span>
              </label>
              <input
                type="number"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
                className="input w-full"
                placeholder="e.g. 100 or -50"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input w-full"
                rows="3"
                placeholder="Explain why you're adjusting points..."
                required
              ></textarea>
            </div>
          </div>

          <div className="p-4 border-t flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Adjust Points
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Delete Voucher Confirmation Modal
const DeleteVoucherModal = ({ voucher, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert('Please provide a reason for deletion');
      return;
    }
    onConfirm(reason);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <form onSubmit={handleSubmit}>
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="text-lg font-semibold text-red-600">Delete Voucher</h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
              &times;
            </button>
          </div>
          
          <div className="p-4 space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
              <p className="text-sm text-yellow-800 font-medium">⚠️ Warning: This action cannot be undone</p>
            </div>

            <div className="bg-gray-50 p-3 rounded space-y-2">
              <div className="text-sm">
                <span className="text-gray-600">User:</span>
                <span className="ml-2 font-semibold">{voucher.userName}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">Voucher:</span>
                <span className="ml-2 font-semibold">{voucher.productName}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">Code:</span>
                <span className="ml-2 font-mono font-semibold">{voucher.code}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">Points to Refund:</span>
                <span className="ml-2 font-semibold text-green-600">{voucher.pointsSpent}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Reason for Deletion</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input w-full"
                rows="3"
                placeholder="Explain why this voucher is being deleted..."
                required
              ></textarea>
            </div>

            <p className="text-sm text-gray-600">
              The voucher will be deleted and {voucher.pointsSpent} points will be refunded to the user.
            </p>
          </div>

          <div className="p-4 border-t flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn bg-red-600 text-white hover:bg-red-700">
              Delete & Refund
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VoucherRedemptionDashboard;

