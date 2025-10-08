import React, { useState, useEffect } from 'react';

const RECURRENCE_TYPES = {
  DAILY: 'daily',
  WEEKLY: 'weekly', 
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
};

const RANGE_TYPES = {
  NO_END: 'no_end',
  END_BY: 'end_by',
  END_AFTER: 'end_after'
};

const WEEKDAYS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' }
];

const MONTH_OPTIONS = [
  { value: 'first', label: 'First' },
  { value: 'second', label: 'Second' },
  { value: 'third', label: 'Third' },
  { value: 'fourth', label: 'Fourth' },
  { value: 'last', label: 'Last' }
];

export default function RecurrencePattern({ 
  isScheduled, 
  onRecurrenceChange, 
  startDate, 
  initialValue,
  t = (key) => key 
}) {
  const [recurrenceType, setRecurrenceType] = useState(RECURRENCE_TYPES.DAILY);
  const [interval, setInterval] = useState(1);
  const [selectedWeekdays, setSelectedWeekdays] = useState(['monday']);
  const [monthlyType, setMonthlyType] = useState('day'); // 'day' or 'weekday'
  const [monthlyDay, setMonthlyDay] = useState(1);
  const [monthlyWeekday, setMonthlyWeekday] = useState('last');
  const [monthlyWeekdayName, setMonthlyWeekdayName] = useState('friday');
  const [regenerateAfter, setRegenerateAfter] = useState(1);
  const [rangeType, setRangeType] = useState(RANGE_TYPES.NO_END);
  const [endDate, setEndDate] = useState('');
  const [occurrences, setOccurrences] = useState(10);

  // Initialize state with initialValue if provided
  useEffect(() => {
    if (initialValue) {
      setRecurrenceType(initialValue.type || RECURRENCE_TYPES.DAILY);
      setInterval(initialValue.interval || 1);
      
      if (initialValue.weekdays) {
        setSelectedWeekdays(initialValue.weekdays);
      }
      
      if (initialValue.monthlyType) {
        setMonthlyType(initialValue.monthlyType);
        setMonthlyDay(initialValue.monthlyDay || 1);
        setMonthlyWeekday(initialValue.monthlyWeekday || 'last');
        setMonthlyWeekdayName(initialValue.monthlyWeekdayName || 'friday');
        setRegenerateAfter(initialValue.regenerateAfter || 1);
      }
      
      if (initialValue.range) {
        setRangeType(initialValue.range.type || RANGE_TYPES.NO_END);
        setEndDate(initialValue.range.endDate || '');
        setOccurrences(initialValue.range.occurrences || 10);
      }
    }
  }, [initialValue]);

  // Update parent component when recurrence settings change
  useEffect(() => {
    if (!isScheduled) {
      onRecurrenceChange(null);
      return;
    }

    const recurrence = {
      type: recurrenceType,
      interval,
      range: {
        type: rangeType,
      },
    };

    if (recurrenceType === RECURRENCE_TYPES.WEEKLY) {
      recurrence.weekdays = selectedWeekdays;
    }

    if (recurrenceType === RECURRENCE_TYPES.MONTHLY) {
      recurrence.monthlyType = monthlyType;
      if (monthlyType === 'day') {
        recurrence.monthlyDay = monthlyDay;
      } else if (monthlyType === 'weekday') {
        recurrence.monthlyWeekday = monthlyWeekday;
        recurrence.monthlyWeekdayName = monthlyWeekdayName;
      } else if (monthlyType === 'regenerate') {
        recurrence.regenerateAfter = regenerateAfter;
      }
    }

    if (rangeType === RANGE_TYPES.END_BY && endDate) {
      recurrence.range.endDate = endDate;
    } else if (rangeType === RANGE_TYPES.END_AFTER) {
      recurrence.range.occurrences = occurrences;
    }

    onRecurrenceChange(recurrence);
  }, [
    isScheduled, recurrenceType, interval, selectedWeekdays, monthlyType, 
    monthlyDay, monthlyWeekday, monthlyWeekdayName, regenerateAfter, 
    rangeType, endDate, occurrences, onRecurrenceChange
  ]);

  const handleWeekdayToggle = (weekday) => {
    setSelectedWeekdays(prev => 
      prev.includes(weekday) 
        ? prev.filter(w => w !== weekday)
        : [...prev, weekday]
    );
  };

  const formatRecurrenceSummary = () => {
    if (!isScheduled) return '';
    
    let summary = '';
    
    switch (recurrenceType) {
      case RECURRENCE_TYPES.DAILY:
        summary = `Every ${interval} day${interval > 1 ? 's' : ''}`;
        break;
      case RECURRENCE_TYPES.WEEKLY:
        const weekdayNames = selectedWeekdays.map(w => 
          WEEKDAYS.find(day => day.value === w)?.label
        ).join(', ');
        summary = `Every ${interval} week${interval > 1 ? 's' : ''} on ${weekdayNames}`;
        break;
      case RECURRENCE_TYPES.MONTHLY:
        if (monthlyType === 'day') {
          summary = `Day ${monthlyDay} of every ${interval} month${interval > 1 ? 's' : ''}`;
        } else if (monthlyType === 'weekday') {
          const weekOption = MONTH_OPTIONS.find(opt => opt.value === monthlyWeekday)?.label;
          const weekdayName = WEEKDAYS.find(day => day.value === monthlyWeekdayName)?.label;
          summary = `The ${weekOption} ${weekdayName} of every ${interval} month${interval > 1 ? 's' : ''}`;
        } else {
          summary = `Regenerate new task ${regenerateAfter} month${regenerateAfter > 1 ? 's' : ''} after each task is completed`;
        }
        break;
      case RECURRENCE_TYPES.YEARLY:
        summary = `Every ${interval} year${interval > 1 ? 's' : ''}`;
        break;
    }

    // Add range information
    if (rangeType === RANGE_TYPES.END_BY && endDate) {
      summary += ` until ${endDate}`;
    } else if (rangeType === RANGE_TYPES.END_AFTER) {
      summary += ` for ${occurrences} occurrence${occurrences > 1 ? 's' : ''}`;
    }

    return summary;
  };

  if (!isScheduled) return null;

  return (
    <div className="space-y-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        <h3 className="text-lg font-semibold text-slate-800">Recurrence Pattern</h3>
      </div>

      {/* Recurrence Type Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">Repeat every</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(RECURRENCE_TYPES).map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRecurrenceType(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                recurrenceType === value
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              {t(value)}
            </button>
          ))}
        </div>
      </div>

      {/* Interval Input */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Every</label>
        <input
          type="number"
          min="1"
          max="999"
          value={interval}
          onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <span className="text-sm text-slate-600">
          {recurrenceType === RECURRENCE_TYPES.DAILY && 'day(s)'}
          {recurrenceType === RECURRENCE_TYPES.WEEKLY && 'week(s)'}
          {recurrenceType === RECURRENCE_TYPES.MONTHLY && 'month(s)'}
          {recurrenceType === RECURRENCE_TYPES.YEARLY && 'year(s)'}
        </span>
      </div>

      {/* Weekly Options */}
      {recurrenceType === RECURRENCE_TYPES.WEEKLY && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">On days</label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => handleWeekdayToggle(day.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedWeekdays.includes(day.value)
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                }`}
              >
                {day.label.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Options */}
      {recurrenceType === RECURRENCE_TYPES.MONTHLY && (
        <div className="space-y-4">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Monthly pattern</label>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="monthlyType"
                  value="day"
                  checked={monthlyType === 'day'}
                  onChange={(e) => setMonthlyType(e.target.value)}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="text-sm text-slate-700">Day</span>
                {monthlyType === 'day' && (
                  <div className="flex items-center gap-2 ml-4">
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={monthlyDay}
                      onChange={(e) => setMonthlyDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                      className="w-16 px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="text-sm text-slate-600">of every month</span>
                  </div>
                )}
              </label>

              <label className="flex items-center">
                <input
                  type="radio"
                  name="monthlyType"
                  value="weekday"
                  checked={monthlyType === 'weekday'}
                  onChange={(e) => setMonthlyType(e.target.value)}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="text-sm text-slate-700">The</span>
                {monthlyType === 'weekday' && (
                  <div className="flex items-center gap-2 ml-4">
                    <select
                      value={monthlyWeekday}
                      onChange={(e) => setMonthlyWeekday(e.target.value)}
                      className="px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {MONTH_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={monthlyWeekdayName}
                      onChange={(e) => setMonthlyWeekdayName(e.target.value)}
                      className="px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {WEEKDAYS.map(day => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-slate-600">of every month</span>
                  </div>
                )}
              </label>

              <label className="flex items-center">
                <input
                  type="radio"
                  name="monthlyType"
                  value="regenerate"
                  checked={monthlyType === 'regenerate'}
                  onChange={(e) => setMonthlyType(e.target.value)}
                  className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="text-sm text-slate-700">Regenerate new task</span>
                {monthlyType === 'regenerate' && (
                  <div className="flex items-center gap-2 ml-4">
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={regenerateAfter}
                      onChange={(e) => setRegenerateAfter(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                      className="w-16 px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="text-sm text-slate-600">month(s) after each task is completed</span>
                  </div>
                )}
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Range of Recurrence */}
      <div className="space-y-4 border-t border-blue-200 pt-4">
        <h4 className="text-sm font-semibold text-slate-800">Range of recurrence</h4>
        
        <div className="space-y-3">
          <div className="flex items-center">
            <span className="text-sm text-slate-600 mr-4">Start:</span>
            <input
              type="date"
              value={startDate}
              disabled
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 text-slate-500"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="rangeType"
                value={RANGE_TYPES.END_BY}
                checked={rangeType === RANGE_TYPES.END_BY}
                onChange={(e) => setRangeType(e.target.value)}
                className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <span className="text-sm text-slate-700">End by:</span>
              {rangeType === RANGE_TYPES.END_BY && (
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="ml-4 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              )}
            </label>

            <label className="flex items-center">
              <input
                type="radio"
                name="rangeType"
                value={RANGE_TYPES.END_AFTER}
                checked={rangeType === RANGE_TYPES.END_AFTER}
                onChange={(e) => setRangeType(e.target.value)}
                className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <span className="text-sm text-slate-700">End after:</span>
              {rangeType === RANGE_TYPES.END_AFTER && (
                <div className="flex items-center gap-2 ml-4">
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={occurrences}
                    onChange={(e) => setOccurrences(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-sm text-slate-600">occurrence(s)</span>
                </div>
              )}
            </label>

            <label className="flex items-center">
              <input
                type="radio"
                name="rangeType"
                value={RANGE_TYPES.NO_END}
                checked={rangeType === RANGE_TYPES.NO_END}
                onChange={(e) => setRangeType(e.target.value)}
                className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <span className="text-sm text-slate-700">No end date</span>
            </label>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-lg p-3 border border-blue-200">
        <div className="text-xs font-medium text-slate-500 mb-1">Recurrence Summary</div>
        <div className="text-sm text-slate-700">{formatRecurrenceSummary()}</div>
      </div>
    </div>
  );
}
