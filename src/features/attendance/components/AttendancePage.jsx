import React, { useMemo, useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import AttendanceImport from './AttendanceImport.jsx';
import { getFunctions, httpsCallable } from 'firebase/functions';

const AttendancePage = ({ t, currentUser, users, isAdmin }) => {
  const navigate = useNavigate();
  
  const [month, setMonth] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`; // YYYY-MM
  });
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Admin tools do on-demand fetch for CSV export; keep UI snappy

  const employeeId = useMemo(() => {
    return currentUser?.employeeId || users?.find(u => u.id === currentUser?.id)?.employeeId || '';
  }, [currentUser, users]);

  // Get available months (current and previous month only)
  const availableMonths = useMemo(() => {
    const months = [];
    const now = new Date();
    
    // Current month
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    months.push({ value: currentMonth, label: `${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (Current)` });
    
    // Previous month
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    months.push({ value: prevMonth, label: `${prevDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (Previous)` });
    
    return months;
  }, []);

  useEffect(() => {
    if (!employeeId || !month) return;
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const start = `${month}-01`;
        const end = `${month}-31`;
        const q = query(
          collection(db, 'attendance'),
          where('employeeId', '==', employeeId),
          where('date', '>=', start),
          where('date', '<=', end),
        );
        const snap = await getDocs(q);
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        rows.sort((a,b) => (a.date || '').localeCompare(b.date || ''));
        setRecords(rows);
      } catch (e) {
        setError(e?.message || 'Failed to load attendance');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [employeeId, month]);

  const getMonthRange = (monthStr) => {
    // monthStr format: YYYY-MM
    const [y, m] = monthStr.split('-').map((v) => parseInt(v, 10));
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  };

  const downloadMonthCSV = async (targetMonth) => {
    try {
      const functions = getFunctions();
      const generateAttendanceCSV = httpsCallable(functions, 'generateAttendanceCSV');
      const result = await generateAttendanceCSV({ month: targetMonth });
      
      const { csvContent } = result.data;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `attendance_${targetMonth}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('CSV download failed', e);
      alert('Failed to generate CSV');
    }
  };

  const downloadAllCSV = async () => {
    try {
      const functions = getFunctions();
      const generateAttendanceCSV = httpsCallable(functions, 'generateAttendanceCSV');
      const result = await generateAttendanceCSV({ allTime: true });

      const { csvContent } = result.data;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `attendance_all_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('CSV download failed', e);
      alert('Failed to generate CSV');
    }
  };

  const goBack = () => {
    navigate(-1); // Go back to previous page
  };

  return (
    <div className="min-h-screen bg-gray-50 w-full">
      {/* Header */}
      <div className="bg-white shadow-sm border-b w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={goBack}
                className="mr-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <span className="text-3xl">📅</span>
                {t('attendance') || 'Attendance'}
              </h1>
            </div>
            {/* Admin actions moved to sidebar tools */}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 max-w-none">
          {/* Attendance Card */}
          <div className="xl:col-span-3">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* User Info */}
              <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {currentUser?.name || 'User'}
                </h2>
                <p className="text-sm text-gray-600">
                  {employeeId ? `${t('employeeId') || 'Employee ID'}: ${employeeId}` : (t('noEmployeeIdConfigured') || 'Your Employee ID is not configured. Please contact your administrator to have it added to your profile.')}
                </p>
              </div>
              
              {/* Month Selector */}
                <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">
                  {t('selectMonth') || 'Select Month'}:
                </label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {availableMonths.map(m => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                </div>
            </div>
              </div>

          {/* Attendance Table */}
              <div className="p-0">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">{t('loading') || 'Loading...'}</span>
              </div>
            )}
            
            {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-6">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-red-700">{error}</span>
                </div>
              </div>
            )}

            {(!isLoading && !error) && (
              <>
                    <div className="overflow-x-auto rounded-xl m-6 ring-1 ring-gray-200">
                      <table className="w-full">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('date') || 'Date'}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('inTime') || 'In Time'}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('outTime') || 'Out Time'}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('otHours') || 'OT Hours'}
                        </th>
                      </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                      {records.map(record => (
                        <tr key={record.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {record.date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {record.inTime || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {record.outTime || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {typeof record.otHours === 'number' ? record.otHours.toFixed(2) : record.otHours || '-'}
                          </td>
                        </tr>
                      ))}
                      {records.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                            {t('noRecords') || 'No attendance records found for this month'}
                          </td>
                        </tr>
                      )}
                        </tbody>
                      </table>
                    </div>

                {/* Summary */}
                    <div className="m-6">
                      <Summary records={records} t={t} />
                    </div>
              </>
            )}
              </div>
            </div>
          </div>

          {/* Admin Tools */}
          {isAdmin && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-5 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Admin Tools</h3>
                  <p className="text-sm text-gray-600 mt-1">Import and export attendance data</p>
                </div>
                <div className="p-5 space-y-5">
                  <div>
                    <h4 className="text-sm font-medium text-gray-800 mb-2">Export CSV</h4>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={() => downloadMonthCSV(month)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Download {month} CSV
                      </button>
                      <button
                        onClick={() => {
                          const prev = availableMonths[1]?.value; if (prev) downloadMonthCSV(prev);
                        }}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        disabled={!availableMonths[1]?.value}
                      >
                        Download Previous Month
                      </button>
                      <button
                        onClick={downloadAllCSV}
                        className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        Download All
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-800 mb-2">Import CSV</h4>
                    <AttendanceImport t={t} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function Summary({ records, t }) {
  const totals = useMemo(() => {
    let workingDays = 0;
    let totalOt = 0;
    for (const r of records) {
      if (r.inTime || r.outTime) workingDays += 1;
      const ot = typeof r.otHours === 'number' ? r.otHours : parseFloat(r.otHours || '0');
      if (!isNaN(ot)) totalOt += ot;
    }
    return { workingDays, totalOt };
  }, [records]);

  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex items-center">
          <div className="p-2 bg-blue-100 rounded-lg">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-blue-900">{t('totalWorkingDays') || 'Total Working Days'}</p>
            <p className="text-2xl font-bold text-blue-600">{totals.workingDays}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-green-50 rounded-lg p-4">
        <div className="flex items-center">
          <div className="p-2 bg-green-100 rounded-lg">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-green-900">{t('totalOtHours') || 'Total OT Hours'}</p>
            <p className="text-2xl font-bold text-green-600">{totals.totalOt.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AttendancePage;
