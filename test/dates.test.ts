import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  addMonthsClamped,
  addYearsClamped,
  daysInMonth,
  daysInYear,
  formatISODate,
  fromDayNumber,
  inclusiveDays,
  isLeapYear,
  parseISODate,
  serviceTime,
  toDayNumber,
  type CivilDate,
} from '../src/dates.ts';

const d = (s: string): CivilDate => {
  const r = parseISODate(s);
  if (!r) throw new Error(`bad date ${s}`);
  return r;
};

describe('calendar basics', () => {
  it('knows leap years (Gregorian rules)', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInYear(2028)).toBe(366);
    expect(daysInYear(2027)).toBe(365);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2027, 4)).toBe(30);
    expect(daysInMonth(2027, 12)).toBe(31);
  });

  it('parses only strict, real ISO dates', () => {
    expect(parseISODate('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
    expect(parseISODate(' 2026-02-28 ')).toEqual({ year: 2026, month: 2, day: 28 });
    expect(parseISODate('2026-02-29')).toBeNull();
    expect(parseISODate('2026-13-01')).toBeNull();
    expect(parseISODate('2026-00-10')).toBeNull();
    expect(parseISODate('2026-1-1')).toBeNull();
    expect(parseISODate('1850-01-01')).toBeNull();
    expect(parseISODate('2026-04-31')).toBeNull();
  });

  it('converts day numbers both ways', () => {
    expect(toDayNumber(d('1970-01-01'))).toBe(0);
    expect(toDayNumber(d('2000-03-01'))).toBe(11017);
    expect(formatISODate(fromDayNumber(20_000))).toBe('2024-10-04');
    fc.assert(
      fc.property(fc.integer({ min: -25_000, max: 80_000 }), (n) => toDayNumber(fromDayNumber(n)) === n),
    );
  });

  it('counts inclusive days', () => {
    expect(inclusiveDays(d('2026-01-01'), d('2026-01-01'))).toBe(1);
    expect(inclusiveDays(d('2026-01-01'), d('2026-12-31'))).toBe(365);
    expect(inclusiveDays(d('2028-01-01'), d('2028-12-31'))).toBe(366);
  });

  it('adds years and months with end-of-month clamping', () => {
    expect(formatISODate(addYearsClamped(d('2024-02-29'), 1))).toBe('2025-02-28');
    expect(formatISODate(addYearsClamped(d('2024-02-29'), 4))).toBe('2028-02-29');
    expect(formatISODate(addMonthsClamped(d('2026-08-31'), 6))).toBe('2027-02-28');
    expect(formatISODate(addMonthsClamped(d('2026-01-15'), 6))).toBe('2026-07-15');
    expect(formatISODate(addMonthsClamped(d('2026-11-30'), 3))).toBe('2027-02-28');
  });
});

describe('serviceTime', () => {
  it('start and end on the same day is one day of service', () => {
    expect(serviceTime(d('2026-03-10'), d('2026-03-10'))).toMatchObject({
      totalDays: 1,
      completedYears: 0,
      daysIntoCurrentYear: 1,
      currentYearLength: 365,
    });
  });

  it('the eve of the anniversary closes a full year', () => {
    // 2025-01-01 .. 2025-12-31 is 365 days: exactly one year, no fraction.
    expect(serviceTime(d('2025-01-01'), d('2025-12-31'))).toMatchObject({
      totalDays: 365,
      completedYears: 1,
      daysIntoCurrentYear: 0,
    });
    // The anniversary itself starts year two.
    expect(serviceTime(d('2025-01-01'), d('2026-01-01'))).toMatchObject({
      completedYears: 1,
      daysIntoCurrentYear: 1,
    });
  });

  it('exactly N years', () => {
    expect(serviceTime(d('2011-06-15'), d('2026-06-14'))).toMatchObject({
      completedYears: 15,
      daysIntoCurrentYear: 0,
    });
    expect(serviceTime(d('2011-06-15'), d('2026-06-13'))).toMatchObject({
      completedYears: 14,
      daysIntoCurrentYear: 364,
      currentYearLength: 365,
    });
  });

  it('uses the real length of a service year that contains February 29', () => {
    // Service year 2027-06-01 .. 2028-05-31 contains 2028-02-29.
    expect(serviceTime(d('2025-06-01'), d('2028-01-31'))).toMatchObject({
      completedYears: 2,
      daysIntoCurrentYear: 245,
      currentYearLength: 366,
    });
  });

  it('handles people hired on February 29', () => {
    // Anniversary in common years falls on February 28.
    expect(serviceTime(d('2024-02-29'), d('2025-02-27'))).toMatchObject({
      totalDays: 365,
      completedYears: 1,
      daysIntoCurrentYear: 0,
    });
    expect(serviceTime(d('2024-02-29'), d('2025-02-28'))).toMatchObject({
      completedYears: 1,
      daysIntoCurrentYear: 1,
    });
  });

  it('rejects an end date before the start date', () => {
    expect(() => serviceTime(d('2026-01-02'), d('2026-01-01'))).toThrow(RangeError);
  });

  it('completed years plus the fraction always reconstruct the total days', () => {
    const date = fc
      .integer({ min: toDayNumber(d('1990-01-01')), max: toDayNumber(d('2026-12-31')) })
      .map(fromDayNumber);
    fc.assert(
      fc.property(date, fc.integer({ min: 0, max: 15_000 }), (start, span) => {
        const end = fromDayNumber(toDayNumber(start) + span);
        const s = serviceTime(start, end);
        const yearsDays = toDayNumber(s.lastAnniversary) - toDayNumber(start);
        return (
          s.totalDays === span + 1 &&
          yearsDays + s.daysIntoCurrentYear === s.totalDays &&
          s.daysIntoCurrentYear >= 0 &&
          s.daysIntoCurrentYear < s.currentYearLength &&
          (s.currentYearLength === 365 || s.currentYearLength === 366)
        );
      }),
    );
  });
});
