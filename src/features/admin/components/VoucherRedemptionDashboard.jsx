import React, { useState, useEffect, useMemo } from 'react';
import { getAllRedeemedVouchers, getUserVoucherStats } from '../../../shared/utils/voucherManagement';
import { getRedemptionSummary } from '../../../shared/utils/voucherProducts';
import { getPointsBreakdown } from '../../../shared/utils/pointsManagement';
import { formatDateTime } from '../../../shared/utils/date';
import { pwaAnalytics } from '../../../shared/utils/pwaAnalytics';

const VoucherRedemptionDashboard = ({ users, currentUser }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [userStats, setUserStats] = useState([]);
  const [redemptionHistory, setRedemptionHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [users]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load user-wise stats
      const stats = await Promise.all(
        users.map(async (user) => {
          const vouchers = await getUserVoucherStats(user.id);
          const pointsBreakdown = getPointsBreakdown(user);
          return {
            user,
            vouchers,
            points: pointsBreakdown,
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

  const totalTCS = useMemo(() => {
    return userStats.reduce((sum, stat) => sum + (stat.user.totalTCS || 0), 0);
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
                      <div className="text-xs text-gray-500">{stat.user.totalTCS || 0} TCS</div>
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">TCS</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usable</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Vouchers</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points Spent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Used</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {userStats.map((stat) => (
                  <tr key={stat.user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{stat.user.name}</div>
                      <div className="text-xs text-gray-500">{stat.user.role}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{stat.user.totalTCS || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{stat.points.usable}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{stat.vouchers.total || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{stat.vouchers.totalPointsSpent || 0}</td>
                    <td className="px-4 py-3 text-sm text-green-600">{stat.vouchers.pending + stat.vouchers.confirmed || 0}</td>
                    <td className="px-4 py-3 text-sm text-blue-600">{stat.vouchers.used || 0}</td>
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
            <h3 className="font-semibold">All Voucher Redemptions</h3>
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
    </div>
  );
};

export default VoucherRedemptionDashboard;

