import React, { useMemo, useRef, useState } from 'react';
import { parseFirestoreTimestamp } from '../../../shared/utils/date';
import { STATUSES } from '../../../shared/constants';
import html2canvas from 'html2canvas';

export default function WeeklySummaryTab({ tasks, users, departments, t }) {
  const summaryRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Compute weekly stats
  const { activeUsers, dateRangeStr } = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const rangeStr = `${formatDate(oneWeekAgo)} - ${formatDate(now)}`;

    const userStats = {};
    users.forEach(u => {
      userStats[u.id] = {
        id: u.id,
        name: u.name,
        department: departments?.find(d => u.departmentIds?.includes(d.id))?.name || 'Unknown',
        points: 0,
        tasksCompleted: 0,
        difficultyCounts: { easy: 0, medium: 0, hard: 0, critical: 0 },
        highQualityTasks: 0,
      };
    });

    tasks.forEach(task => {
      if (task.status !== STATUSES.COMPLETE) return;

      const completedAt = parseFirestoreTimestamp(task.completedAt) || parseFirestoreTimestamp(task.updatedAt);
      if (!completedAt || completedAt < oneWeekAgo) return;

      const assignedUserIds = Array.isArray(task.assignedUserIds) 
        ? task.assignedUserIds 
        : (task.assignedUserId ? [task.assignedUserId] : []);

      assignedUserIds.forEach(userId => {
        if (userStats[userId]) {
          const points = task.points || 0;
          const diff = (task.difficulty || 'medium').toLowerCase();
          
          userStats[userId].points += points;
          userStats[userId].tasksCompleted += 1;
          if (userStats[userId].difficultyCounts[diff] !== undefined) {
            userStats[userId].difficultyCounts[diff] += 1;
          }
          
          if (points >= 25 || ['medium', 'hard', 'critical'].includes(diff)) {
            userStats[userId].highQualityTasks += 1;
          }
        }
      });
    });

    const active = Object.values(userStats)
      .filter(u => u.tasksCompleted > 0)
      .sort((a, b) => b.points - a.points); // Sort by points descending

    return { activeUsers: active, dateRangeStr: rangeStr };
  }, [tasks, users, departments]);

  const top3 = activeUsers.slice(0, 3);
  const others = activeUsers.slice(3);

  const getInitials = (name) => {
    return name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
  };

  const shareAsImage = async () => {
    if (!summaryRef.current) return;
    setIsGenerating(true);
    
    try {
      const canvas = await html2canvas(summaryRef.current, {
        scale: 2,
        backgroundColor: '#f8fafc', // match tailwind slate-50
        useCORS: true,
        logging: false
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert('Failed to generate image blob');
          setIsGenerating(false);
          return;
        }
        
        const file = new File([blob], `leaderboard-${new Date().getTime()}.png`, { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'Weekly Leaderboard',
              text: '🏆 Check out our weekly leaderboard! Great job everyone! 💪',
              files: [file]
            });
          } catch (err) {
            console.log('Share was cancelled or failed', err);
            downloadImage(canvas.toDataURL('image/png'));
          }
        } else {
          // Fallback
          downloadImage(canvas.toDataURL('image/png'));
        }
        setIsGenerating(false);
      }, 'image/png');
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image.');
      setIsGenerating(false);
    }
  };

  const downloadImage = (dataUrl) => {
    const link = document.createElement('a');
    link.download = `leaderboard-${new Date().getTime()}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            🏆 {t('weeklyLeaderboard') || 'Weekly Leaderboard'}
          </h2>
          <p className="text-sm text-gray-500">{dateRangeStr}</p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={shareAsImage}
            disabled={isGenerating || activeUsers.length === 0}
            className="flex-1 sm:flex-none px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-medium rounded-md transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            )}
            {isGenerating ? 'Generating...' : (t('shareAsImage') || 'Share to WhatsApp')}
          </button>
        </div>
      </div>

      {activeUsers.length === 0 ? (
        <div className="bg-white p-8 text-center rounded-xl border border-dashed border-gray-300">
          <div className="text-4xl mb-3">😴</div>
          <h3 className="text-lg font-medium text-gray-900">No tasks completed</h3>
          <p className="text-gray-500">No one has completed any tasks in the past 7 days.</p>
        </div>
      ) : (
        /* The Card to be exported as Image */
        <div className="overflow-x-auto pb-4">
          <div 
            ref={summaryRef} 
            className="bg-slate-50 p-6 md:p-8 rounded-2xl w-[800px] mx-auto text-slate-800 shadow-sm border border-slate-200"
            style={{ minWidth: '800px' }} // fixed width for consistent image export
          >
            {/* Header */}
            <div className="text-center mb-10">
              <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-blue-600 mb-2 drop-shadow-sm">
                Weekly Leaderboard 🏆
              </h1>
              <p className="text-lg font-medium text-slate-500">{dateRangeStr}</p>
            </div>

            {/* Podium (Top 3) */}
            <div className="flex justify-center items-end gap-6 mb-12 h-64">
              {/* Rank 2 - Silver */}
              {top3[1] && (
                <div className="flex flex-col items-center w-48 relative">
                  <div className="absolute -top-12 text-4xl animate-bounce" style={{ animationDelay: '0.2s' }}>🥈</div>
                  <div className="w-16 h-16 rounded-full bg-slate-200 border-4 border-slate-300 flex items-center justify-center text-xl font-bold text-slate-600 shadow-md z-10 bg-white">
                    {getInitials(top3[1].name)}
                  </div>
                  <div className="bg-gradient-to-t from-slate-200 to-slate-100 w-full pt-10 pb-4 px-4 rounded-t-xl mt-[-2rem] text-center border-t border-l border-r border-slate-300 shadow-inner h-40 flex flex-col justify-end">
                    <h3 className="font-bold text-slate-800 line-clamp-1">{top3[1].name}</h3>
                    <p className="text-xs font-medium text-slate-500 mb-2 truncate">{top3[1].department}</p>
                    <div className="bg-white rounded-lg py-2 px-1 shadow-sm w-full">
                      <div className="text-xl font-black text-slate-700">{top3[1].points} pts</div>
                      <div className="text-xs font-medium text-slate-500">{top3[1].tasksCompleted} tasks</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Rank 1 - Gold */}
              {top3[0] && (
                <div className="flex flex-col items-center w-56 relative z-10">
                  <div className="absolute -top-14 text-5xl animate-bounce shadow-amber-500/50 drop-shadow-xl">👑</div>
                  <div className="w-20 h-20 rounded-full bg-amber-100 border-4 border-amber-400 flex items-center justify-center text-2xl font-black text-amber-600 shadow-xl z-10 bg-white">
                    {getInitials(top3[0].name)}
                  </div>
                  <div className="bg-gradient-to-t from-amber-200 to-amber-50 w-full pt-12 pb-4 px-4 rounded-t-xl mt-[-2.5rem] text-center border-t border-l border-r border-amber-300 shadow-lg h-48 flex flex-col justify-end relative overflow-hidden">
                    <div className="absolute inset-0 bg-white/20 pointer-events-none"></div>
                    <h3 className="font-bold text-slate-900 text-lg line-clamp-1 relative z-10">{top3[0].name}</h3>
                    <p className="text-xs font-medium text-amber-700 mb-2 truncate relative z-10">{top3[0].department}</p>
                    <div className="bg-white rounded-lg py-2 px-1 shadow w-full relative z-10 border border-amber-100">
                      <div className="text-2xl font-black text-amber-600">{top3[0].points} pts</div>
                      <div className="text-sm font-semibold text-slate-600">{top3[0].tasksCompleted} tasks</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Rank 3 - Bronze */}
              {top3[2] && (
                <div className="flex flex-col items-center w-48 relative">
                  <div className="absolute -top-12 text-4xl animate-bounce" style={{ animationDelay: '0.4s' }}>🥉</div>
                  <div className="w-16 h-16 rounded-full bg-orange-100 border-4 border-orange-300 flex items-center justify-center text-xl font-bold text-orange-700 shadow-md z-10 bg-white">
                    {getInitials(top3[2].name)}
                  </div>
                  <div className="bg-gradient-to-t from-orange-200 to-orange-50 w-full pt-10 pb-4 px-4 rounded-t-xl mt-[-2rem] text-center border-t border-l border-r border-orange-300 shadow-inner h-36 flex flex-col justify-end">
                    <h3 className="font-bold text-slate-800 line-clamp-1">{top3[2].name}</h3>
                    <p className="text-xs font-medium text-orange-700 mb-2 truncate">{top3[2].department}</p>
                    <div className="bg-white rounded-lg py-2 px-1 shadow-sm w-full">
                      <div className="text-xl font-black text-orange-700">{top3[2].points} pts</div>
                      <div className="text-xs font-medium text-slate-500">{top3[2].tasksCompleted} tasks</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Others List */}
            {others.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Rank</th>
                      <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                      <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Tasks</th>
                      <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">High Quality</th>
                      <th className="py-3 px-6 text-xs font-bold text-brand-600 uppercase tracking-wider text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {others.map((u, idx) => (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-6 text-sm font-semibold text-slate-400">#{idx + 4}</td>
                        <td className="py-3 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
                              {getInitials(u.name)}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-800">{u.name}</div>
                              <div className="text-xs text-slate-500">{u.department}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-6 text-center text-sm font-medium text-slate-600">
                          {u.tasksCompleted}
                        </td>
                        <td className="py-3 px-6 text-center text-sm font-medium text-slate-600">
                          {u.highQualityTasks > 0 ? (
                            <span className="inline-flex items-center justify-center px-2 py-1 bg-purple-50 text-purple-700 rounded-full text-xs">
                              {u.highQualityTasks} ⭐
                            </span>
                          ) : '-'}
                        </td>
                        <td className="py-3 px-6 text-right text-sm font-bold text-brand-600">
                          {u.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Footer / Branding */}
            <div className="mt-8 text-center text-xs font-medium text-slate-400 flex items-center justify-center gap-2">
              <span>Generated from Management Dashboard</span>
              <span>•</span>
              <span>{new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
