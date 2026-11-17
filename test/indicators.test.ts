import { describe, expect, it } from 'vitest';
import { MINIMUM_WAGES, UMA_VALUES, minimumWageOn, umaOn } from '../src/data/indicators.ts';
import { vacationDaysForServiceYear } from '../src/rules.ts';
import { q } from '../src/rational.ts';
import { parseISODate, toDayNumber } from '../src/dates.ts';

describe('official indicators', () => {
  it('2026 minimum wages match the CONASAMI resolution (DOF 2025-12-09)', () => {
    expect(minimumWageOn('2026-06-30')).toMatchObject({ general: '315.04', zlfn: '440.87' });
    expect(minimumWageOn('2026-01-01')?.source.dofDate).toBe('2025-12-09');
    expect(minimumWageOn('2026-12-31')?.general).toBe('315.04');
  });

  it('2025 minimum wages match the CONASAMI resolution (DOF 2024-12-19)', () => {
    expect(minimumWageOn('2025-12-31')).toMatchObject({ general: '278.80', zlfn: '419.88' });
  });

  it('has no minimum wage for years that are not bundled', () => {
    expect(minimumWageOn('2024-12-31')).toBeUndefined();
    expect(minimumWageOn('2027-01-01')).toBeUndefined();
  });

  it('UMA values switch on February 1 (INEGI)', () => {
    expect(umaOn('2026-01-31')?.daily).toBe('113.14');
    expect(umaOn('2026-02-01')?.daily).toBe('117.31');
    expect(umaOn('2025-01-31')?.daily).toBe('108.57');
    expect(umaOn('2027-01-31')?.daily).toBe('117.31');
    expect(umaOn('2027-02-01')).toBeUndefined();
  });

  it('UMA monthly = daily x 30.4 and annual = monthly x 12, as INEGI publishes them', () => {
    for (const u of UMA_VALUES) {
      expect(q(u.daily).mul(q('30.4')).round(2).eq(q(u.monthly))).toBe(true);
      expect(q(u.monthly).mul(q(12)).eq(q(u.annual))).toBe(true);
    }
  });

  it('tables are contiguous, ordered and cite a DOF date', () => {
    for (const table of [MINIMUM_WAGES, UMA_VALUES]) {
      for (let i = 0; i < table.length; i++) {
        const e = table[i];
        if (!e) continue;
        expect(e.from <= e.to).toBe(true);
        expect(parseISODate(e.source.dofDate)).not.toBeNull();
        expect(e.source.url).toMatch(/^https:\/\//);
        const next = table[i + 1];
        if (next) {
          const to = parseISODate(e.to);
          const from = parseISODate(next.from);
          expect(to && from && toDayNumber(from) - toDayNumber(to)).toBe(1);
        }
      }
    }
  });
});

describe('vacation schedule (LFT art. 76, DOF 2022-12-27)', () => {
  it.each([
    [1, 12],
    [2, 14],
    [3, 16],
    [4, 18],
    [5, 20],
    [6, 22],
    [10, 22],
    [11, 24],
    [15, 24],
    [16, 26],
    [20, 26],
    [21, 28],
    [25, 28],
    [26, 30],
    [30, 30],
    [31, 32],
    [35, 32],
  ])('service year %i gives %i days', (year, days) => {
    expect(vacationDaysForServiceYear(year)).toBe(days);
  });

  it('rejects invalid service years', () => {
    expect(() => vacationDaysForServiceYear(0)).toThrow(RangeError);
    expect(() => vacationDaysForServiceYear(1.5)).toThrow(RangeError);
  });
});
