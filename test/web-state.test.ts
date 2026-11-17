import { describe, expect, it } from 'vitest';
import { calculateSeverance } from '../src/index.ts';
import { decodeLocale, decodeState, encodeState, EXAMPLE, toInput, type FormState } from '../web/src/state.ts';

describe('shareable URL state', () => {
  it('round-trips through the query string and omits defaults', () => {
    const query = encodeState(EXAMPLE, 'es');
    expect(query).toBe('i=2019-03-01&f=2026-10-31&s=25000&p=m&m=inj');
    expect(decodeState(`?${query}`)).toEqual(EXAMPLE);
  });

  it('round-trips every option', () => {
    const s: FormState = {
      ...EXAMPLE,
      period: 'biweekly',
      zone: 'zlfn',
      reason: 'mutual-agreement',
      aguinaldoDays: '30',
      premium: '50',
      other: '1500.50',
      sdi: '900',
      wageDays: '3',
      priorVacation: '6',
      takenVacation: '2.5',
      seniorityBase: 'integrated',
      mutualAs: 'employer-initiated',
      twenty: 'no',
      months: '14',
      tax: false,
      mw: '350',
      uma: '120.5',
    };
    const query = encodeState(s, 'en');
    expect(decodeState(query)).toEqual(s);
    expect(decodeLocale(query)).toBe('en');
    expect(decodeState(encodeState({ ...s, twenty: 'yes' }, 'es'))?.twenty).toBe('yes');
  });

  it('carries only dates, numbers and short codes (no free text)', () => {
    const query = encodeState({ ...EXAMPLE, other: '1000' }, 'en');
    for (const [, value] of new URLSearchParams(query)) {
      expect(value).toMatch(/^[\d.-]+$|^[a-z]{1,3}$/);
    }
  });

  it('ignores malformed or hostile values', () => {
    const s = decodeState('?i=<script>&f=2026-01-01&s=1e9&p=zz&m=nope&ag=abc&lang=fr');
    expect(s).toMatchObject({ start: '', end: '2026-01-01', salary: '', period: 'monthly', reason: 'resignation' });
    expect(s?.aguinaldoDays).toBe('15');
    expect(decodeLocale('?lang=fr')).toBe('es');
    expect(decodeState('?utm_source=x')).toBeNull();
  });

  it('maps the form to a valid library input', () => {
    const r = calculateSeverance(toInput(EXAMPLE));
    expect(r.totals.total.amount).toBe('163006.86');
    const input = toInput({ ...EXAMPLE, twenty: 'yes', months: '3', sdi: ' ', mw: '' });
    expect(input.options).toMatchObject({ includeTwentyDaysPerYear: true, litigationMonths: '3' });
    expect(input.benefits).not.toHaveProperty('integratedDailySalary');
    expect(input.indicators).toEqual({});
  });
});
