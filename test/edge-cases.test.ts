import { describe, expect, it } from 'vitest';
import { calculateSeverance, SeveranceInputError, type SeveranceInput } from '../src/index.ts';

const base: SeveranceInput = {
  startDate: '2022-01-10',
  endDate: '2026-07-20',
  salary: { amount: '600', period: 'daily' },
  reason: 'resignation',
};

const run = (patch: Partial<SeveranceInput> = {}, locale: 'es' | 'en' = 'es') =>
  calculateSeverance({ ...base, ...patch }, { locale });

const item = (r: ReturnType<typeof run>, id: string) => r.items.find((i) => i.id === id);
const codes = (r: ReturnType<typeof run>) => r.notices.map((n) => n.code);

describe('input validation', () => {
  it.each([
    [{ startDate: '2026-02-30' }, 'startDate'],
    [{ endDate: 'yesterday' }, 'endDate'],
    [{ endDate: '2022-01-09' }, 'endDate'],
    [{ reason: 'quit' as never }, 'reason'],
    [{ zone: 'north' as never }, 'zone'],
    [{ salary: { amount: '600', period: 'hourly' as never } }, 'salary.period'],
    [{ salary: { amount: '0', period: 'daily' as const } }, 'salary.amount'],
    [{ salary: { amount: '-1', period: 'daily' as const } }, 'salary.amount'],
    [{ salary: { amount: 'abc', period: 'daily' as const } }, 'salary.amount'],
    [{ salary: undefined as never }, 'salary'],
    [{ pending: { wageDays: -2 } }, 'pending.wageDays'],
    [{ benefits: { integratedDailySalary: 0 } }, 'benefits.integratedDailySalary'],
    [{ indicators: { minimumWageDaily: '0' } }, 'indicators.minimumWageDaily'],
  ])('rejects %o', (patch, field) => {
    expect(() => run(patch as Partial<SeveranceInput>)).toThrow(SeveranceInputError);
    try {
      run(patch);
    } catch (e) {
      expect((e as SeveranceInputError).field).toBe(field);
    }
  });

  it('requires a minimum wage when the prima de antigüedad is due and none is bundled', () => {
    expect(() => run({ endDate: '2027-03-01', reason: 'unjustified-dismissal' })).toThrow(/minimumWageDaily/);
    // A resignation under 15 years does not need it.
    expect(() => run({ endDate: '2027-03-01' })).not.toThrow();
    expect(run({ endDate: '2027-03-01' }).indicators.minimumWage).toBeNull();
  });
});

describe('legal minimums', () => {
  it('raises aguinaldo below 15 days and prima vacacional below 25%', () => {
    const r = run({ benefits: { aguinaldoDays: 10, vacationPremiumPercent: 20 } });
    expect(r.salary.aguinaldoDays).toBe('15');
    expect(r.salary.vacationPremiumPercent).toBe('25');
    expect(codes(r)).toEqual(expect.arrayContaining(['aguinaldo-raised-to-minimum', 'premium-raised-to-minimum']));
  });

  it('never pays negative vacations when more days were taken than accrued', () => {
    const r = run({ pending: { vacationDaysTakenThisYear: 30 } });
    expect(item(r, 'vacation-proportional')?.amount.centavos).toBe(0);
    expect(codes(r)).toContain('vacation-taken-exceeds-accrued');
  });
});

describe('edge cases of time', () => {
  it('start and end on the same day: one day of everything', () => {
    // 15 x 1/365 x 600 = 24.6575 -> 24.66; 12 x 1/365 x 600 = 19.7260 -> 19.73
    const r = run({ startDate: '2026-07-20', endDate: '2026-07-20' });
    expect(r.service.totalDays).toBe(1);
    expect(item(r, 'aguinaldo')?.amount.amount).toBe('24.66');
    expect(item(r, 'vacation-proportional')?.amount.amount).toBe('19.73');
    expect(codes(r)).not.toContain('confirm-pending-vacations');
  });

  it('a full calendar year of aguinaldo is exactly the annual days, leap year or not', () => {
    for (const year of [2026, 2028]) {
      const r = calculateSeverance({
        ...base,
        startDate: `${year - 3}-06-01`,
        endDate: `${year}-12-31`,
        indicators: { minimumWageDaily: '315.04' },
      });
      // 15 x 365/365 (or 366/366) x 600 = 9,000.00
      expect(item(r, 'aguinaldo')?.amount.amount).toBe('9000.00');
      expect(item(r, 'aguinaldo')?.days).toBe('15');
    }
  });

  it('aguinaldo only counts days of the current calendar year', () => {
    // Hired 2026-12-01, leaves 2027-01-05: only 5 days of 2027 count. 15 x 5/365 x 600 = 123.29
    const r = run({ startDate: '2026-12-01', endDate: '2027-01-05' });
    expect(item(r, 'aguinaldo')?.amount.amount).toBe('123.29');
  });

  it('exactly 15 years is enough for the prima de antigüedad on resignation; one day less is not', () => {
    const exact = run({ startDate: '2011-07-21', endDate: '2026-07-20' });
    expect(exact.service).toMatchObject({ completedYears: 15, daysIntoCurrentYear: 0 });
    // 12 x 15 x 600 = 108,000.00 (600 is below the cap of 2 x 315.04 = 630.08)
    expect(item(exact, 'seniority-premium')?.amount.amount).toBe('108000.00');
    const short = run({ startDate: '2011-07-22', endDate: '2026-07-20' });
    expect(short.service.completedYears).toBe(14);
    expect(item(short, 'seniority-premium')).toBeUndefined();
  });

  it('pro-rates the prima de antigüedad for a fraction of a year (jurisprudencia reg. 243041)', () => {
    // 0 years + 191/365 (2026-01-11 .. 2026-07-20). 12 x 191/365 x 600 = 3,767.67
    const r = run({ startDate: '2026-01-11', reason: 'unjustified-dismissal' });
    expect(item(r, 'seniority-premium')?.amount.amount).toBe('3767.67');
    expect(item(r, 'seniority-premium')?.formula).toBe('12 días × 191/365 años × $600.00');
  });
});

describe('debatable points exposed as options', () => {
  it('mutual agreement: voluntary by default, employer-initiated on request', () => {
    const voluntary = run({ reason: 'mutual-agreement' });
    expect(item(voluntary, 'seniority-premium')).toBeUndefined();
    expect(codes(voluntary)).toContain('mutual-agreement-voluntary');

    const employer = run({ reason: 'mutual-agreement', options: { mutualAgreementTreatedAs: 'employer-initiated' } });
    expect(item(employer, 'seniority-premium')).toBeDefined();
    expect(item(employer, 'seniority-premium')?.criteria).toContain('Jurisprudencia 4a. Sala (reg. 243029)');
    expect(codes(employer)).toContain('mutual-agreement-employer');
  });

  it('prima de antigüedad base: cuota diaria by default, integrated on request', () => {
    // Salary 300, service year 5 (20 vacation days): SDI = 300 x (1 + 15/365 + 20 x 25%/365) = 300 x 385/365 = 316.44
    const daily = run({ salary: { amount: 300, period: 'daily' }, reason: 'justified-dismissal' });
    const integrated = run({
      salary: { amount: 300, period: 'daily' },
      reason: 'justified-dismissal',
      options: { seniorityPremiumBase: 'integrated' },
    });
    expect(item(daily, 'seniority-premium')?.dailyBase?.amount).toBe('315.04'); // floor: 300 < 315.04
    expect(integrated.salary.integrated.amount).toBe('316.44');
    expect(item(integrated, 'seniority-premium')?.dailyBase?.amount).toBe('316.44');
    expect(item(integrated, 'seniority-premium')?.criteria).toContain('Tesis aislada (reg. 243324)');
  });

  it('20 days per year: opt-in for unjustified dismissal, labeled as negotiated for other reasons', () => {
    const dismissal = run({ reason: 'unjustified-dismissal', options: { includeTwentyDaysPerYear: true } });
    expect(item(dismissal, 'indemnity-twenty-days')?.legalBasis).toEqual(['LFT art. 49', 'LFT art. 50 fr. II']);
    expect(codes(dismissal)).toContain('twenty-days-conditional');

    const resignation = run({ options: { includeTwentyDaysPerYear: true } });
    expect(item(resignation, 'indemnity-twenty-days')).toBeDefined();
    expect(codes(resignation)).toContain('twenty-days-by-agreement');

    const rescissionWithout = run({ reason: 'worker-rescission', options: { includeTwentyDaysPerYear: false } });
    expect(item(rescissionWithout, 'indemnity-twenty-days')).toBeUndefined();
  });

  it('litigation scenario only for employer-liable reasons; no interest up to 12 months', () => {
    const resignation = run({ options: { litigationMonths: 6 } });
    expect(resignation.totals.litigation.centavos).toBe(0);
    expect(codes(resignation)).toContain('litigation-not-applicable');

    const sixMonths = run({ reason: 'worker-rescission', options: { litigationMonths: '6.5' } });
    const backPay = item(sixMonths, 'back-pay');
    expect(backPay?.days).toBe('195');
    expect(backPay?.formula).toMatch(/^6\.5 meses × 30 días × /);
    expect(backPay?.legalBasis).toEqual(['LFT art. 50 fr. III', 'LFT art. 48']);
    expect(item(sixMonths, 'back-pay-interest')).toBeUndefined();
  });

  it('a known SDI replaces the estimate', () => {
    const r = run({ benefits: { integratedDailySalary: '701.555' }, reason: 'unjustified-dismissal' });
    expect(r.salary).toMatchObject({ integratedIsEstimate: false, integrationFactor: null });
    expect(r.salary.integrated.amount).toBe('701.56');
    expect(item(r, 'indemnity-three-months')?.amount.amount).toBe('63140.40');
    expect(codes(r)).not.toContain('integrated-salary-estimated');
  });

  it('the ISR estimate can be turned off or fed a UMA', () => {
    expect(run({ options: { taxEstimate: false } }).tax).toBeNull();
    const r = run({ indicators: { umaDaily: '100' } });
    expect(r.indicators.uma).toMatchObject({ overridden: true });
    expect(r.tax?.umaDaily.amount).toBe('100.00');
    expect(codes(r)).toContain('uma-override');
  });

  it('LISR: a fraction of six months or less does not add a year; more than six months does', () => {
    // Last anniversary 2026-01-10. Six months later: 2026-07-10.
    const six = run({ reason: 'unjustified-dismissal', endDate: '2026-07-09' });
    expect(six.service.completedYears).toBe(4);
    expect(six.tax?.yearsForExemption).toBe(4);
    const more = run({ reason: 'unjustified-dismissal', endDate: '2026-07-10' });
    expect(more.tax?.yearsForExemption).toBe(5);
  });
});

describe('salary periods (LFT art. 89)', () => {
  it.each([
    ['daily', '600', '600.00'],
    ['weekly', '4200', '600.00'],
    ['biweekly', '9000', '600.00'],
    ['monthly', '18000', '600.00'],
    ['monthly', '10000', '333.33'],
  ] as const)('%s %s -> %s per day', (period, amount, expected) => {
    expect(run({ salary: { amount, period } }).salary.daily.amount).toBe(expected);
  });
});

describe('localization', () => {
  it('returns English labels, formulas and notices on request', () => {
    const r = run({ reason: 'unjustified-dismissal' }, 'en');
    expect(r.locale).toBe('en');
    expect(item(r, 'aguinaldo')?.label).toBe('Pro-rated aguinaldo (year-end bonus)');
    expect(item(r, 'aguinaldo')?.formula).toBe('15 days × 201/365 (days worked in 2026) × $600.00');
    expect(r.notices.find((n) => n.code === 'reinstatement-alternative')?.message).toMatch(/reinstatement/);
  });

  it('every notice code has a message in both languages', () => {
    const es = run({ reason: 'worker-rescission', options: { litigationMonths: 20 } }, 'es');
    const en = run({ reason: 'worker-rescission', options: { litigationMonths: 20 } }, 'en');
    expect(es.notices.map((n) => n.code)).toEqual(en.notices.map((n) => n.code));
    for (const n of [...es.notices, ...en.notices]) expect(n.message.length).toBeGreaterThan(20);
  });
});
