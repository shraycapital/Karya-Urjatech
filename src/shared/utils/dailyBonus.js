export const DAILY_BONUS_POINTS = 25;

const isObject = (value) => value !== null && typeof value === 'object';

export const formatDateKey = (date) => {
  if (!(date instanceof Date)) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export const parseDateKey = (key) => {
  if (typeof key !== 'string') {
    return null;
  }

  const parts = key.split('-').map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return null;
  }

  const [year, month, day] = parts;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

export const getPointsFromEntry = (entry) => {
  if (typeof entry === 'number') {
    return entry;
  }

  if (isObject(entry) && typeof entry.points === 'number') {
    return entry.points;
  }

  return 0;
};

export const getBonusClaimsInRange = (ledger, startDate = null, endDate = null) => {
  if (!isObject(ledger)) {
    return [];
  }

  return Object.entries(ledger).reduce((acc, [dateKey, entry]) => {
    const date = parseDateKey(dateKey);
    if (!date) {
      return acc;
    }

    if (startDate && date < startDate) {
      return acc;
    }

    if (endDate && date > endDate) {
      return acc;
    }

    acc.push({ dateKey, date, entry });
    return acc;
  }, []);
};

export const getBonusPointsInRange = (ledger, startDate = null, endDate = null) => {
  return getBonusClaimsInRange(ledger, startDate, endDate).reduce((sum, { entry }) => {
    return sum + getPointsFromEntry(entry);
  }, 0);
};

export const getTotalBonusPoints = (ledger) => getBonusPointsInRange(ledger);

export const hasBonusBeenClaimed = (ledger, dateKey) => {
  if (!isObject(ledger) || !dateKey) {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(ledger, dateKey);
};

export const mergeBonusClaim = (ledger, dateKey, points = DAILY_BONUS_POINTS, claimedAt = new Date().toISOString()) => {
  const normalizedLedger = isObject(ledger) ? ledger : {};

  const safePoints = typeof points === 'number' ? points : DAILY_BONUS_POINTS;

  return {
    ...normalizedLedger,
    [dateKey]: {
      points: safePoints,
      claimedAt,
    },
  };
};
