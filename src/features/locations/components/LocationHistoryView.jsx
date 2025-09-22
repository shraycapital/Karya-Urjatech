import React, { useEffect, useMemo, useRef, useState } from 'react';

const QUICK_RANGES = [
  { value: '1', label: 'Last 24h' },
  { value: '3', label: 'Last 3 days' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

let googleMapsLoaderPromise = null;

const loadGoogleMaps = () => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google && window.google.maps) return Promise.resolve();
  if (googleMapsLoaderPromise) return googleMapsLoaderPromise;

  const runtimeKey =
    (typeof window !== 'undefined' && window.__KARTAVYA_GOOGLE_MAPS_API_KEY__) || undefined;
  const apiKey =
    runtimeKey ||
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_MAPS_API_KEY) ||
    (typeof process !== 'undefined' && process.env.REACT_APP_GOOGLE_MAPS_API_KEY) ||
    'AIzaSyD4oQIMQtYNKs3VebunniF_y1NLlO3L168';

  if (!apiKey) {
    console.warn('Google Maps API key not configured.');
    return Promise.reject(new Error('GOOGLE_MAPS_API_KEY missing'));
  }

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.google), { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
};

const ensureDate = (ms) => {
  if (!ms) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDayLabel = (dateStr) => {
  try {
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const formatTimeLabel = (dateObj) => {
  if (!dateObj) return '�';
  return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const LocationHistoryView = ({
  records = [],
  availableUsers = [],
  selectedUserId,
  onSelectUser,
  dateRange,
  onDateRangeChange,
  onRefresh,
  onExportAll,
  isLoading,
  userStats = {},
  t,
  permissionState = 'unknown',
  mapId = 'location-history-map',
  layout = 'modal',
}) => {
  const [userSearch, setUserSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const mapRef = useRef(null);
  const markerMetaRef = useRef([]);

  const processedRecords = useMemo(() => {
    return records
      .map((record) => {
        const occurredAt = ensureDate(record.occurredAtMs) || ensureDate(record.occurredAt?.getTime?.()) || null;
        return {
          ...record,
          occurredAt,
          occurredAtISO: record.occurredAtISO || (occurredAt ? occurredAt.toISOString() : null),
        };
      })
      .filter((record) => record.occurredAt)
      .sort((a, b) => b.occurredAt - a.occurredAt);
  }, [records]);

  useEffect(() => {
    if (processedRecords.length) {
      setSelectedEntryId(processedRecords[0].id);
    } else {
      setSelectedEntryId(null);
    }
  }, [processedRecords]);

  const groupedByDate = useMemo(() => {
    const buckets = new Map();
    processedRecords.forEach((record) => {
      const key = record.occurredAtISO?.split('T')[0];
      if (!key) return;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(record);
    });
    return buckets;
  }, [processedRecords]);

  const sortedDates = useMemo(
    () => Array.from(groupedByDate.keys()).sort((a, b) => new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)),
    [groupedByDate]
  );

  const selectedRecord = useMemo(
    () => processedRecords.find((record) => record.id === selectedEntryId),
    [processedRecords, selectedEntryId]
  );

  const summary = useMemo(() => {
    if (!processedRecords.length) {
      return {
        total: 0,
        activeDays: 0,
        firstSeen: null,
        lastSeen: null,
      };
    }
    const lastSeen = processedRecords[0].occurredAt;
    const firstSeen = processedRecords[processedRecords.length - 1].occurredAt;
    return {
      total: processedRecords.length,
      activeDays: sortedDates.length,
      firstSeen,
      lastSeen,
    };
  }, [processedRecords, sortedDates]);

  const filteredUsers = useMemo(() => {
    const searchTerm = userSearch.trim().toLowerCase();
    const deptFilter = departmentFilter.trim().toLowerCase();
    
    return availableUsers.filter((user) => {
      const matchesSearch = !searchTerm || 
        (user.name || '').toLowerCase().includes(searchTerm) ||
        (user.department || '').toLowerCase().includes(searchTerm) ||
        (user.role || '').toLowerCase().includes(searchTerm);
      
      const matchesDept = !deptFilter || 
        (user.department || '').toLowerCase().includes(deptFilter);
      
      return matchesSearch && matchesDept;
    });
  }, [userSearch, departmentFilter, availableUsers]);

  const uniqueDepartments = useMemo(() => {
    const depts = [...new Set(availableUsers.map(u => u.department).filter(Boolean))];
    return depts.sort();
  }, [availableUsers]);

  const departmentStats = useMemo(() => {
    const stats = {};
    availableUsers.forEach(user => {
      const dept = user.department || 'Unknown';
      if (!stats[dept]) {
        stats[dept] = { users: 0, totalLocations: 0, activeDays: 0 };
      }
      stats[dept].users += 1;
      const userStat = userStats[user.id] || { totalLocations: 0, activeDays: 0 };
      stats[dept].totalLocations += userStat.totalLocations;
      stats[dept].activeDays += userStat.activeDays;
    });
    return stats;
  }, [availableUsers, userStats]);

  useEffect(() => {
    if (!processedRecords.length) {
      markerMetaRef.current.forEach(({ marker, infoWindow }) => {
        infoWindow.close();
        marker.setMap(null);
      });
      markerMetaRef.current = [];
      if (mapRef.current) {
        mapRef.current = null;
      }
      return;
    }

    const renderMarkers = (google) => {
      const mapElement = document.getElementById(mapId);
      if (!mapElement) return;

      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(mapElement, {
          zoom: 12,
          center: { lat: processedRecords[0].location.latitude, lng: processedRecords[0].location.longitude },
          mapTypeId: 'roadmap',
        });
      }

      markerMetaRef.current.forEach(({ marker, infoWindow }) => {
        infoWindow.close();
        marker.setMap(null);
      });
      markerMetaRef.current = [];

      const bounds = new google.maps.LatLngBounds();

      processedRecords.forEach((record, index) => {
        const position = new google.maps.LatLng(record.location.latitude, record.location.longitude);
        bounds.extend(position);

        const marker = new google.maps.Marker({
          position,
          map: mapRef.current,
          label: `${index + 1}`,
          title: `${record.action} � ${record.occurredAt.toLocaleString()}`,
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 10px; max-width: 300px;">
              <h3 style="margin: 0 0 8px 0; color: #1f2937;">${record.action}</h3>
              <p style="margin: 4px 0; color: #4b5563;"><strong>Time:</strong> ${record.occurredAt.toLocaleString()}</p>
              <p style="margin: 4px 0; color: #4b5563;"><strong>Element:</strong> ${record.elementId || 'unknown'}</p>
              ${record.details?.elementText ? `<p style="margin: 4px 0; color: #4b5563;"><strong>Details:</strong> ${record.details.elementText}</p>` : ''}
              <p style="margin: 4px 0; color: #4b5563;"><strong>Coordinates:</strong> ${record.location.latitude.toFixed(6)}, ${record.location.longitude.toFixed(6)}</p>
              ${record.location.accuracy ? `<p style=\"margin: 4px 0; color: #4b5563;\"><strong>Accuracy:</strong> ${Math.round(record.location.accuracy)}m</p>` : ''}
            </div>
          `,
        });

        marker.addListener('click', () => {
          setSelectedEntryId(record.id);
        });

        markerMetaRef.current.push({ id: record.id, marker, infoWindow });
      });

      if (!bounds.isEmpty()) {
        mapRef.current.fitBounds(bounds);
      }
    };

    loadGoogleMaps()
      .then((google) => {
        renderMarkers(google);
      })
      .catch((error) => {
        console.error('Failed to initialise Google Maps:', error);
      });
  }, [processedRecords, mapId]);

  useEffect(() => {
    if (!selectedEntryId || !mapRef.current) return;
    const meta = markerMetaRef.current.find((item) => item.id === selectedEntryId);
    if (!meta) return;

    markerMetaRef.current.forEach(({ infoWindow }) => infoWindow.close());
    meta.infoWindow.open(mapRef.current, meta.marker);
    mapRef.current.panTo(meta.marker.getPosition());
    if (mapRef.current.getZoom() < 14) {
      mapRef.current.setZoom(14);
    }
  }, [selectedEntryId]);

  const mapHeightClass = layout === 'tab' ? 'h-96 min-h-[384px]' : 'h-80 min-h-[320px]';

  return (
    <div className={`grid gap-6 ${layout === 'tab' ? 'lg:grid-cols-[280px_1fr]' : 'md:grid-cols-[260px_1fr]'}`}>
      <aside className="space-y-6">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {t('users') || 'Users'}
            </h3>
            {availableUsers.length > 0 && (
              <span className="text-xs text-slate-500">{availableUsers.length}</span>
            )}
          </div>
          <input
            type="text"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder={t('searchUsers') || 'Search users'}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {uniqueDepartments.length > 1 && (
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="w-full mt-2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('allDepartments') || 'All Departments'}</option>
              {uniqueDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          )}
          <div className="mt-3 max-h-72 overflow-y-auto space-y-2 pr-1">
            {filteredUsers.length === 0 && (
              <p className="text-xs text-slate-500">{t('noUsers') || 'No users with location data yet.'}</p>
            )}
            {filteredUsers.map((user) => {
              const isActive = user.id === selectedUserId;
              const stats = userStats[user.id] || { totalLocations: 0, activeDays: 0, lastLocation: null };
              const isOnline = user.isOnline;
              
              return (
                <button
                  type="button"
                  key={user.id}
                  onClick={() => onSelectUser(user.id)}
                  className={`w-full rounded-md border px-3 py-3 text-left text-sm transition-colors ${
                    isActive
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="block font-medium truncate">{user.name}</span>
                        {isOnline && (
                          <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" title="Online"></div>
                        )}
                      </div>
                      <div className="mt-1 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-medium">{user.department}</span>
                          <span>•</span>
                          <span className="capitalize">{user.role}</span>
                        </div>
                        {stats.totalLocations > 0 && (
                          <div className="text-xs text-slate-500">
                            <span className="font-medium">{stats.totalLocations}</span> locations • 
                            <span className="font-medium ml-1">{stats.activeDays}</span> active days
                          </div>
                        )}
                        {stats.lastLocation && (
                          <div className="text-xs text-slate-400">
                            Last: {formatTimeLabel(new Date(stats.lastLocation))}
                          </div>
                        )}
                      </div>
                    </div>
                    {isActive && summary.total > 0 && (
                      <div className="text-right text-xs text-blue-600 ml-2">
                        <div className="font-medium">{summary.total}</div>
                        <div>{summary.total === 1 ? (t('location') || 'location') : (t('locations') || 'locations')}</div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {permissionState === 'denied' && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              {t('locationPermissionDenied') || 'The browser is blocking location access. Ask the user to enable permissions to resume tracking.'}
            </div>
          )}
        </div>
      </aside>

      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_RANGES.map((range) => (
              <button
                key={range.value}
                type="button"
                onClick={() => onDateRangeChange(range.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  dateRange === range.value
                    ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={dateRange}
              onChange={(event) => onDateRangeChange(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="1">{t('lastDay') || 'Last 1 day'}</option>
              <option value="3">{t('last3Days') || 'Last 3 days'}</option>
              <option value="7">{t('last7Days') || 'Last 7 days'}</option>
              <option value="14">{t('last14Days') || 'Last 14 days'}</option>
              <option value="30">{t('last30Days') || 'Last 30 days'}</option>
            </select>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1 rounded-md border border-blue-500 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
              disabled={isLoading}
            >
              {isLoading ? (t('loading') || 'Loading...') : (t('refresh') || 'Refresh')}
            </button>
            {onExportAll && (
              <button
                type="button"
                onClick={onExportAll}
                className="inline-flex items-center gap-1 rounded-md border border-green-500 px-3 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50"
                disabled={isLoading}
              >
                📊 {t('exportAll') || 'Export All'}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
              {t('totalLocations') || 'Total locations'}
            </p>
            <p className="mt-1 text-2xl font-semibold text-blue-700">{summary.total}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">
              {t('activeDays') || 'Active days'}
            </p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">{summary.activeDays}</p>
          </div>
          <div className="rounded-lg border border-purple-100 bg-purple-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-purple-600">
              {t('selectedUser') || 'Selected user'}
            </p>
            <p className="mt-1 truncate text-2xl font-semibold text-purple-700">
              {availableUsers.find((user) => user.id === selectedUserId)?.name || t('unknownUser') || 'Unknown'}
            </p>
          </div>
          <div className="rounded-lg border border-orange-100 bg-orange-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-orange-600">
              {t('totalUsers') || 'Total users'}
            </p>
            <p className="mt-1 text-2xl font-semibold text-orange-700">{availableUsers.length}</p>
          </div>
        </div>

        {Object.keys(departmentStats).length > 1 && (
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">
                {t('departmentSummary') || 'Department Summary'}
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {Object.entries(departmentStats)
                .sort(([,a], [,b]) => b.totalLocations - a.totalLocations)
                .map(([dept, stats]) => (
                  <div key={dept} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-slate-700">{dept}</h4>
                        <p className="text-xs text-slate-500">
                          {stats.users} {stats.users === 1 ? (t('user') || 'user') : (t('users') || 'users')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-700">{stats.totalLocations}</p>
                        <p className="text-xs text-slate-500">
                          {stats.activeDays} {t('activeDays') || 'active days'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {t('locationHistory') || 'Location history'}
            </h3>
          </div>
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
            {processedRecords.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500">
                {t('noLocationData') || 'No location data found for this user in the selected period.'}
              </div>
            )}
            {sortedDates.map((dateKey) => {
              const dayRecords = groupedByDate.get(dateKey) || [];
              return (
                <div key={dateKey} className="px-4 py-3">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h4 className="text-sm font-semibold text-slate-700">{formatDayLabel(dateKey)}</h4>
                    <span className="text-xs text-slate-400">
                      {dayRecords.length} {dayRecords.length === 1 ? (t('entry') || 'entry') : (t('entries') || 'entries')}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {dayRecords.map((record) => {
                      const isActive = record.id === selectedEntryId;
                      return (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => setSelectedEntryId(record.id)}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                            isActive
                              ? 'border-blue-500 bg-blue-50 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-blue-400'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-700">{record.action}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                <span className="font-medium">{t('time') || 'Time'}:</span>{' '}
                                {formatTimeLabel(record.occurredAt)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                <span className="font-medium">{t('coordinates') || 'Coordinates'}:</span>{' '}
                                {record.location.latitude.toFixed(6)}, {record.location.longitude.toFixed(6)}
                                {record.location.accuracy && (
                                  <span className="ml-2">
                                    <span className="font-medium">{t('accuracy') || 'Accuracy'}:</span> {Math.round(record.location.accuracy)}m
                                  </span>
                                )}
                              </p>
                              {record.details?.elementText && (
                                <p className="mt-1 text-xs text-slate-500">
                                  <span className="font-medium">{t('details') || 'Details'}:</span> {record.details.elementText}
                                </p>
                              )}
                            </div>
                            <div className="text-right text-xs text-slate-500">
                              <p>{record.elementId || 'unknown'}</p>
                              <p className="mt-1 uppercase tracking-wide">#{record.id.slice(-6)}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {t('locationMap') || 'Location map'}
            </h3>
          </div>
          <div className={`relative ${mapHeightClass}`}>
            <div id={mapId} className="absolute inset-0 rounded-b-lg" />
            {processedRecords.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                {t('noLocationData') || 'No location data to display'}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default LocationHistoryView;
