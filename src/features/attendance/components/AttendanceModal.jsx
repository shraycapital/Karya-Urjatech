import React, { useMemo, useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

const AttendanceModal = ({ isOpen, onClose, t, currentUser, users }) => {
  if (!isOpen) return null;

  const [month, setMonth] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`; // YYYY-MM
  });
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const employeeId = useMemo(() => {
    return currentUser?.employeeId || users?.find(u => u.id === currentUser?.id)?.employeeId || '';
  }, [currentUser, users]);

  useEffect(() => {
    if (!employeeId || !month) return;
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        // attendance collection model: one doc per day per employee
        // fields: employeeId, date (YYYY-MM-DD), inTime, outTime, otHours (number)
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">📅</span>
            {t('attendance') || 'Attendance'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="p-6 text-center">
          {/* Attendance Icon */}
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="40" 
              height="40" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="white" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">{t('attendance') || 'Attendance'}</h2>
            <p className="text-xs text-slate-600">{employeeId ? `${t('employeeId') || 'Employee ID'}: ${employeeId}` : (t('noEmployeeIdConfigured') || 'Your Employee ID is not configured. Please contact your administrator to have it added to your profile.')}</p>
          </div>

          <div className="flex items-center justify-center gap-2 mb-4">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="input"
            />
          </div>

          {isLoading && <div className="text-sm text-slate-600">{t('loading') || 'Loading...'}</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}

          {(!isLoading && !error) && (
            <div className="text-left bg-slate-50 rounded-lg p-4 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left py-1">{t('date') || 'Date'}</th>
                    <th className="text-left py-1">{t('inTime') || 'In'}</th>
                    <th className="text-left py-1">{t('outTime') || 'Out'}</th>
                    <th className="text-left py-1">{t('otHours') || 'OT (h)'}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id} className="border-t border-slate-200">
                      <td className="py-1">{r.date}</td>
                      <td className="py-1">{r.inTime || '-'}</td>
                      <td className="py-1">{r.outTime || '-'}</td>
                      <td className="py-1">{typeof r.otHours === 'number' ? r.otHours.toFixed(2) : r.otHours || '-'}</td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-slate-500 py-4">{t('noRecords') || 'No records for this month'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {(!isLoading && !error) && (
            <Summary records={records} t={t} />
          )}
          
          {/* Features Preview */}
          <div className="text-left bg-slate-50 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-3 text-center">
              {t('attendanceFeatures') || 'What to Expect'}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <path d="M22 4L12 14.01l-3-3" />
                  </svg>
                </div>
                <span className="text-slate-700">
                  {t('attendanceFeature1') || 'Check-in and check-out'}
                </span>
              </div>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <path d="M22 4L12 14.01l-3-3" />
                  </svg>
                </div>
                <span className="text-slate-700">
                  {t('attendanceFeature2') || 'View attendance history and reports'}
                </span>
              </div>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <path d="M22 4L12 14.01l-3-3" />
                  </svg>
                </div>
                <span className="text-slate-700">
                  {t('attendanceFeature3') || 'Automatic overtime and break calculations'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
            {t('noteAttendanceSource') || 'Attendance data is loaded by Employee ID from CSV imports.'}
          </div>
        </div>
        
        <div className="flex justify-end p-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('close') || 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttendanceModal;

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
    <div className="grid grid-cols-2 gap-2 mb-2">
      <div className="p-3 rounded bg-white border">
        <div className="text-xs text-slate-500">{t('totalWorkingDays') || 'Total Working Days'}</div>
        <div className="text-xl font-semibold">{totals.workingDays}</div>
      </div>
      <div className="p-3 rounded bg-white border">
        <div className="text-xs text-slate-500">{t('totalOtHours') || 'Total OT Hours'}</div>
        <div className="text-xl font-semibold">{totals.totalOt.toFixed(2)}</div>
      </div>
    </div>
  );
}
