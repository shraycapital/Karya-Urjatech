/**
 * Weekly Reset Utility Tests
 * 
 * Tests for weekly reset functionality
 */

import { getStartOfWeek, getEndOfWeek, shouldResetWeekly } from '../weeklyReset.js';

describe('Weekly Reset Utilities', () => {
  describe('getStartOfWeek', () => {
    test('should return Monday as start of week', () => {
      const startOfWeek = getStartOfWeek();
      expect(startOfWeek.getDay()).toBe(1); // Monday is day 1
      expect(startOfWeek.getHours()).toBe(0);
      expect(startOfWeek.getMinutes()).toBe(0);
      expect(startOfWeek.getSeconds()).toBe(0);
    });
  });

  describe('getEndOfWeek', () => {
    test('should return Sunday as end of week', () => {
      const endOfWeek = getEndOfWeek();
      expect(endOfWeek.getDay()).toBe(0); // Sunday is day 0
      expect(endOfWeek.getHours()).toBe(23);
      expect(endOfWeek.getMinutes()).toBe(59);
      expect(endOfWeek.getSeconds()).toBe(59);
    });
  });

  describe('shouldResetWeekly', () => {
    test('should return true if lastReset is null', () => {
      expect(shouldResetWeekly(null)).toBe(true);
      expect(shouldResetWeekly(undefined)).toBe(true);
    });

    test('should return true if lastReset is more than a week ago', () => {
      const oneWeekAgo = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000)); // 8 days ago
      expect(shouldResetWeekly(oneWeekAgo)).toBe(true);
    });

    test('should return false if lastReset is less than a week ago', () => {
      const threeDaysAgo = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)); // 3 days ago
      expect(shouldResetWeekly(threeDaysAgo)).toBe(false);
    });

    test('should return false if lastReset is exactly a week ago', () => {
      const exactlyOneWeekAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // Exactly 7 days ago
      expect(shouldResetWeekly(exactlyOneWeekAgo)).toBe(false);
    });
  });
});







