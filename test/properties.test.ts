/**
 * Property-based tests: invariants that must hold for every input, checked
 * on thousands of random cases with fast-check.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculateSeverance, type SeveranceInput, type SeveranceResult, type TerminationReason } from '../src/index.ts';
import { formatISODate, fromDayNumber, parseISODate, toDayNumber } from '../src/dates.ts';

const dayOf = (iso: string): number => {
  const d = parseISODate(iso);
  if (!d) throw new Error(iso);
  return toDayNumber(d);
};

const REASONS: TerminationReason[] = [
  'resignation',
  'mutual-agreement',
  'justified-dismissal',
  'unjustified-dismissal',
  'worker-rescission',
];

/** End dates inside the bundled minimum-wage tables (2025-2026). */
const endDay = fc.integer({ min: dayOf('2025-01-01'), max: dayOf('2026-12-31') });
/** Up to ~40 years of service. */
const spanDays = fc.integer({ min: 0, max: 40 * 366 });
/** Salaries from $100.00 to $5,000.00 a day, in centavos. */
const centavos = fc.integer({ min: 10_000, max: 500_000 });

const inputArb = fc.record({
  end: endDay,
  span: spanDays,
  salary: centavos,
  period: fc.constantFrom('daily', 'weekly', 'biweekly', 'monthly' as const),
  reason: fc.constantFrom(...REASONS),
  zone: fc.constantFrom('general', 'zlfn' as const),
  twenty: fc.option(fc.boolean(), { nil: undefined }),
  months: fc.option(fc.integer({ min: 0, max: 36 }), { nil: undefined }),
  base: fc.constantFrom('daily', 'integrated' as const),
});

type Arb = typeof inputArb extends fc.Arbitrary<infer T> ? T : never;

function toInput(a: Arb, overrides: { salaryCentavos?: number; span?: number } = {}): SeveranceInput {
  const span = overrides.span ?? a.span;
  const salary = overrides.salaryCentavos ?? a.salary;
  return {
    startDate: formatISODate(fromDayNumber(a.end - span)),
    endDate: formatISODate(fromDayNumber(a.end)),
    salary: { amount: (salary / 100).toFixed(2), period: a.period },
    reason: a.reason,
    zone: a.zone,
    options: {
      seniorityPremiumBase: a.base,
      ...(a.twenty === undefined ? {} : { includeTwentyDaysPerYear: a.twenty }),
      ...(a.months === undefined ? {} : { litigationMonths: a.months }),
    },
  };
}

const c = (r: SeveranceResult, id: string): number => r.items.find((i) => i.id === id)?.amount.centavos ?? 0;

describe('invariants', () => {
  it('totals are the sums of their rounded line items, and nothing is negative', () => {
    fc.assert(
      fc.property(inputArb, (a) => {
        const r = calculateSeverance(toInput(a));
        const sum = (g: string) => r.items.filter((i) => i.group === g).reduce((s, i) => s + i.amount.centavos, 0);
        expect(r.totals.earned.centavos).toBe(sum('earned'));
        expect(r.totals.separation.centavos).toBe(sum('separation'));
        expect(r.totals.litigation.centavos).toBe(sum('litigation'));
        expect(r.totals.total.centavos).toBe(r.totals.earned.centavos + r.totals.separation.centavos);
        expect(r.totals.totalWithLitigation.centavos).toBe(r.totals.total.centavos + r.totals.litigation.centavos);
        for (const i of r.items) expect(i.amount.centavos).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 500 },
    );
  });

  it('every line item cites at least one statute and carries a formula', () => {
    fc.assert(
      fc.property(inputArb, (a) => {
        const r = calculateSeverance(toInput(a));
        for (const i of r.items) {
          expect(i.legalBasis.length).toBeGreaterThan(0);
          expect(i.legalBasis.every((b) => /^(LFT|CPEUM|LISR) art\. /.test(b))).toBe(true);
          expect(i.formula.length).toBeGreaterThan(5);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('the prima de antigüedad base always lies between one and two minimum wages', () => {
    fc.assert(
      fc.property(inputArb, (a) => {
        const r = calculateSeverance(toInput(a));
        const pa = r.items.find((i) => i.id === 'seniority-premium');
        const mw = r.indicators.minimumWage?.daily.centavos;
        if (!pa || mw === undefined) return;
        const b = pa.dailyBase?.centavos ?? -1;
        expect(b).toBeGreaterThanOrEqual(mw);
        expect(b).toBeLessThanOrEqual(2 * mw);
      }),
      { numRuns: 500 },
    );
  });

  it('back pay never exceeds 12 months of integrated salary', () => {
    fc.assert(
      fc.property(inputArb, (a) => {
        const r = calculateSeverance(toInput(a));
        expect(c(r, 'back-pay')).toBeLessThanOrEqual(360 * r.salary.integrated.centavos);
        if (c(r, 'back-pay-interest') > 0) expect(c(r, 'back-pay')).toBe(360 * r.salary.integrated.centavos);
      }),
      { numRuns: 300 },
    );
  });

  it('ISR-exempt portions never exceed the gross amounts', () => {
    fc.assert(
      fc.property(inputArb, (a) => {
        const r = calculateSeverance(toInput(a));
        for (const row of r.tax?.rows ?? []) {
          expect(row.exempt.centavos).toBeLessThanOrEqual(row.gross.centavos);
          expect(row.exempt.centavos + row.taxable.centavos).toBe(row.gross.centavos);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('amounts do not depend on the output language', () => {
    fc.assert(
      fc.property(inputArb, (a) => {
        const es = calculateSeverance(toInput(a), { locale: 'es' });
        const en = calculateSeverance(toInput(a), { locale: 'en' });
        expect(en.items.map((i) => [i.id, i.amount.centavos])).toEqual(es.items.map((i) => [i.id, i.amount.centavos]));
      }),
      { numRuns: 200 },
    );
  });
});

describe('monotonicity', () => {
  it('a higher salary never lowers any line item', () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 1, max: 200_000 }), (a, raise) => {
        const low = calculateSeverance(toInput(a));
        const high = calculateSeverance(toInput(a, { salaryCentavos: a.salary + raise }));
        for (const i of low.items) {
          expect(c(high, i.id)).toBeGreaterThanOrEqual(i.amount.centavos);
        }
        expect(high.totals.totalWithLitigation.centavos).toBeGreaterThanOrEqual(low.totals.totalWithLitigation.centavos);
      }),
      { numRuns: 400 },
    );
  });

  it('longer service never lowers the separation payments or the aguinaldo', () => {
    // Vacation pay is deliberately excluded: at each anniversary the year's
    // entitlement moves from "proportional" to "pending from prior years",
    // an input the user provides.
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 1, max: 3_000 }), (a, extra) => {
        const short = calculateSeverance(toInput(a));
        const long = calculateSeverance(toInput(a, { span: a.span + extra }));
        expect(c(long, 'aguinaldo')).toBeGreaterThanOrEqual(c(short, 'aguinaldo'));
        expect(long.totals.separation.centavos).toBeGreaterThanOrEqual(short.totals.separation.centavos);
      }),
      { numRuns: 400 },
    );
  });

  it('a longer trial never lowers the litigation scenario', () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 0, max: 24 }), fc.integer({ min: 1, max: 24 }), (a, m, more) => {
        const r1 = calculateSeverance(toInput({ ...a, months: m }));
        const r2 = calculateSeverance(toInput({ ...a, months: m + more }));
        expect(r2.totals.litigation.centavos).toBeGreaterThanOrEqual(r1.totals.litigation.centavos);
      }),
      { numRuns: 300 },
    );
  });
});
