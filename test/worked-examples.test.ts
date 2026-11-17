/**
 * Hand-checked worked examples. Each computation is written out in the
 * comments so a reviewer can redo it with a pencil (or a spreadsheet).
 *
 * Conventions used below (see README, "Rounding"):
 *   - SD (salario diario) and SDI (salario diario integrado) rounded to centavos.
 *   - Each line item rounded once, half away from zero.
 *   - 2026 minimum wage: general 315.04, ZLFN 440.87. UMA from 2026-02-01: 117.31.
 */
import { describe, expect, it } from 'vitest';
import { calculateSeverance, type LineItemId, type SeveranceResult } from '../src/index.ts';

function amounts(r: SeveranceResult): Partial<Record<LineItemId, string>> {
  return Object.fromEntries(r.items.map((i) => [i.id, i.amount.amount]));
}

function codes(r: SeveranceResult): string[] {
  return r.notices.map((n) => n.code);
}

describe('Example A: unjustified dismissal, salary above the cap (README example)', () => {
  // Hired 2019-03-01, dismissed 2026-10-31, $25,000 monthly, general zone.
  //
  // SD  = 25,000 / 30 = 833.333... -> 833.33                         (LFT art. 89)
  // Service: anniversaries every March 1. Last one 2026-03-01.
  //   completed years = 7; days into year 8 = 2026-03-01..2026-10-31 = 245; year length 365.
  //   years = 7 + 245/365 = 2,800/365 = 7.6712
  // Vacation entitlement of service year 8 = 22 days                  (LFT art. 76)
  // SDI = 833.33 x (1 + 15/365 + 22 x 25% / 365) = 833.33 x 385.5/365
  //     = 880.1335 -> 880.13                                          (LFT arts. 84, 89)
  //
  // Aguinaldo  = 15 x 304/365 x 833.33 (Jan 1..Oct 31 = 304 days)    = 10,410.9173 -> 10,410.92
  // Vacations  = 22 x 245/365 x 833.33                                = 12,305.8869 -> 12,305.89
  // Prima vac. = 25% x 12,305.89                                      =  3,076.4725 ->  3,076.47
  // Prima ant. = 12 x 2,800/365 x min(833.33, 2 x 315.04 = 630.08)
  //            = 630.08 x 33,600 / 365                                = 58,001.8849 -> 58,001.88
  // 3 months   = 90 x 880.13                                          = 79,211.70
  // Total      = 10,410.92 + 12,305.89 + 3,076.47 + 58,001.88 + 79,211.70 = 163,006.86
  const r = calculateSeverance({
    startDate: '2019-03-01',
    endDate: '2026-10-31',
    salary: { amount: '25000', period: 'monthly' },
    reason: 'unjustified-dismissal',
  });

  it('derives salaries and service time', () => {
    expect(r.salary.daily.amount).toBe('833.33');
    expect(r.salary.integrated.amount).toBe('880.13');
    expect(r.salary.integrationFactor).toBe('1.056164');
    expect(r.service).toMatchObject({ completedYears: 7, daysIntoCurrentYear: 245, years: '7.6712' });
    expect(r.service.vacationDays).toBe(22);
  });

  it('computes every line item', () => {
    expect(amounts(r)).toEqual({
      aguinaldo: '10410.92',
      'vacation-proportional': '12305.89',
      'vacation-premium': '3076.47',
      'seniority-premium': '58001.88',
      'indemnity-three-months': '79211.70',
    });
    expect(r.totals.earned.amount).toBe('25793.28');
    expect(r.totals.separation.amount).toBe('137213.58');
    expect(r.totals.total.amount).toBe('163006.86');
  });

  it('caps the prima de antigüedad at twice the minimum wage and explains why', () => {
    const pa = r.items.find((i) => i.id === 'seniority-premium');
    expect(pa?.dailyBase?.amount).toBe('630.08');
    expect(pa?.formula).toBe('12 días × (7 + 245/365) años × $630.08 (tope: 2 × SM $315.04)');
    expect(pa?.legalBasis).toEqual(['LFT art. 162', 'LFT art. 485', 'LFT art. 486']);
    expect(codes(r)).toContain('seniority-cap-applied');
  });

  it('does not add the 20 days per year unless asked (art. 49 / 50)', () => {
    expect(r.items.some((i) => i.id === 'indemnity-twenty-days')).toBe(false);
    expect(codes(r)).toContain('twenty-days-not-included');
    expect(codes(r)).toContain('reinstatement-alternative');
  });

  it('estimates ISR-exempt portions with the 2026 UMA', () => {
    // Aguinaldo exempt up to 30 x 117.31 = 3,519.30; prima vacacional up to 15 x 117.31 = 1,759.65.
    // Separation: 7 years + 245 days (> 6 months) = 8 years -> 90 x 117.31 x 8 = 84,463.20.
    expect(r.tax?.yearsForExemption).toBe(8);
    const byId = Object.fromEntries((r.tax?.rows ?? []).map((x) => [x.id, x]));
    expect(byId['aguinaldo']?.exempt.amount).toBe('3519.30');
    expect(byId['vacation-premium']?.exempt.amount).toBe('1759.65');
    expect(byId['separation']?.gross.amount).toBe('137213.58');
    expect(byId['separation']?.exempt.amount).toBe('84463.20');
    expect(byId['separation']?.taxable.amount).toBe('52750.38');
  });
});

describe('Example B: resignation under 15 years, improved benefits, pending items', () => {
  // Hired 2023-05-15, resigns 2026-08-14. $3,500 weekly -> SD = 3,500 / 7 = 500.00 (art. 89).
  // Contract: 30 days of aguinaldo, 50% prima vacacional.
  // 5 unpaid days, 2 vacation days already taken this year, 4 days left over from prior years.
  //
  // Service: completed 3 years (last anniversary 2026-05-15); days into year 4 =
  //   2026-05-15..2026-08-14 = 17 + 30 + 31 + 14 = 92; year length 365. Year 4 gives 18 days.
  //
  // Pending wages = 5 x 500                                          =  2,500.00
  // Aguinaldo     = 30 x 226/365 x 500 (Jan 1..Aug 14 = 226 days)    =  9,287.6712 -> 9,287.67
  // Vacations     = (18 x 92/365 - 2) x 500 = (1,656 - 730)/365 x 500 = 1,268.4932 -> 1,268.49
  // Prior years   = 4 x 500                                          =  2,000.00
  // Prima vac.    = 50% x (1,268.49 + 2,000.00) = 1,634.245          -> 1,634.25 (half away from zero)
  // Prima ant.    = not due: voluntary separation with 3 < 15 years (art. 162 fr. III)
  // Total         = 2,500 + 9,287.67 + 1,268.49 + 2,000 + 1,634.25    = 16,690.41
  const r = calculateSeverance({
    startDate: '2023-05-15',
    endDate: '2026-08-14',
    salary: { amount: 3500, period: 'weekly' },
    reason: 'resignation',
    benefits: { aguinaldoDays: 30, vacationPremiumPercent: 50 },
    pending: { wageDays: 5, vacationDaysTakenThisYear: 2, vacationDaysFromPriorYears: 4 },
  });

  it('computes every line item', () => {
    expect(r.salary.daily.amount).toBe('500.00');
    expect(amounts(r)).toEqual({
      'pending-wages': '2500.00',
      aguinaldo: '9287.67',
      'vacation-proportional': '1268.49',
      'vacation-pending': '2000.00',
      'vacation-premium': '1634.25',
    });
    expect(r.totals.total.amount).toBe('16690.41');
    expect(r.totals.separation.amount).toBe('0.00');
  });

  it('shows reproducible formulas', () => {
    const f = Object.fromEntries(r.items.map((i) => [i.id, i.formula]));
    expect(f['aguinaldo']).toBe('30 días × 226/365 (días trabajados en 2026) × $500.00');
    expect(f['vacation-proportional']).toBe(
      '(18 días (año de servicio 4) × 92/365 - 2 días disfrutados) × $500.00',
    );
    expect(f['vacation-premium']).toBe('50% × ($1,268.49 + $2,000.00)');
  });

  it('explains why there is no prima de antigüedad', () => {
    expect(codes(r)).toContain('seniority-not-due');
    expect(r.notices.find((n) => n.code === 'seniority-not-due')?.message).toContain('3.2521');
  });

  it('estimates the SDI with the improved benefits: 500 x (1 + 30/365 + 18 x 50% / 365) = 553.42', () => {
    expect(r.salary.integrated.amount).toBe('553.42');
  });
});

describe('Example C: justified dismissal in the Zona Libre de la Frontera Norte, under one year', () => {
  // Hired 2026-02-10, dismissed with cause 2026-09-30. Daily salary 450.00 (ZLFN minimum 440.87).
  // Service: 0 completed years; 2026-02-10..2026-09-30 = 19 + 214 = 233 days; year length 365.
  //
  // Aguinaldo  = 15 x 233/365 x 450                 = 4,308.9041 -> 4,308.90
  // Vacations  = 12 x 233/365 x 450                 = 3,447.1233 -> 3,447.12
  // Prima vac. = 25% x 3,447.12                     =   861.78
  // Prima ant. = 12 x 233/365 x 450 (450 is between 440.87 and 881.74) = 3,447.12
  //   due regardless of tenure: "separados de su empleo, independientemente de la
  //   justificación o injustificación del despido" (art. 162 fr. III).
  // Total      = 4,308.90 + 3,447.12 + 861.78 + 3,447.12 = 12,064.92
  const r = calculateSeverance({
    startDate: '2026-02-10',
    endDate: '2026-09-30',
    salary: { amount: '450', period: 'daily' },
    reason: 'justified-dismissal',
    zone: 'zlfn',
  });

  it('computes every line item', () => {
    expect(amounts(r)).toEqual({
      aguinaldo: '4308.90',
      'vacation-proportional': '3447.12',
      'vacation-premium': '861.78',
      'seniority-premium': '3447.12',
    });
    expect(r.totals.total.amount).toBe('12064.92');
  });

  it('uses the ZLFN minimum wage and warns about the written notice of art. 47', () => {
    expect(r.indicators.minimumWage?.daily.amount).toBe('440.87');
    expect(codes(r)).toContain('justified-dismissal-notice');
    expect(codes(r)).not.toContain('salary-below-minimum');
    expect(codes(r)).not.toContain('confirm-pending-vacations');
  });

  it('counts the 233-day fraction (more than six months) as one year for the ISR exemption', () => {
    // 2026-02-10 + 6 months = 2026-08-10 <= 2026-09-30, so the fraction counts as one year.
    expect(r.tax?.yearsForExemption).toBe(1);
  });
});

describe('Example D: rescission caused by the employer (arts. 51 and 52), high salary, other benefits', () => {
  // Hired 2016-11-01, worker rescinds 2026-04-15. $45,000 monthly -> SD 1,500.00.
  // Other benefits that integrate salary: $3,000 a month -> 100.00 a day.
  // Service: 9 completed years (last anniversary 2025-11-01); days into year 10 =
  //   30 + 31 + 31 + 28 + 31 + 15 = 166; length 365. years = 9 + 166/365 = 3,451/365.
  // Year 10 gives 22 vacation days.
  // SDI = 1,500 x (1 + 15/365 + 22 x 25%/365) + 3,000/30 = 1,584.2466 + 100 = 1,684.25
  //
  // Aguinaldo  = 15 x 105/365 x 1,500 (Jan 1..Apr 15 = 105)     =   6,472.6027 ->   6,472.60
  // Vacations  = 22 x 166/365 x 1,500                            =  15,008.2192 ->  15,008.22
  // Prima vac. = 25% x 15,008.22 = 3,752.055                     ->   3,752.06
  // Prima ant. = 12 x 3,451/365 x 630.08 (cap) = 26,092,872.96/365 = 71,487.3232 -> 71,487.32
  // 3 months   = 90 x 1,684.25                                   = 151,582.50
  // 20 days    = 20 x 3,451/365 x 1,684.25 = 116,246,935/365     = 318,484.7534 -> 318,484.75
  // Total      = 566,787.45
  const r = calculateSeverance({
    startDate: '2016-11-01',
    endDate: '2026-04-15',
    salary: { amount: 45000, period: 'monthly' },
    reason: 'worker-rescission',
    benefits: { otherMonthly: 3000 },
  });

  it('computes every line item, including 20 days per year by default', () => {
    expect(r.salary.integrated.amount).toBe('1684.25');
    expect(amounts(r)).toEqual({
      aguinaldo: '6472.60',
      'vacation-proportional': '15008.22',
      'vacation-premium': '3752.06',
      'seniority-premium': '71487.32',
      'indemnity-three-months': '151582.50',
      'indemnity-twenty-days': '318484.75',
    });
    expect(r.totals.total.amount).toBe('566787.45');
  });

  it('cites art. 52 and art. 50 for the indemnities', () => {
    const tm = r.items.find((i) => i.id === 'indemnity-three-months');
    const td = r.items.find((i) => i.id === 'indemnity-twenty-days');
    expect(tm?.legalBasis).toEqual(['CPEUM art. 123 A fr. XXII', 'LFT art. 52', 'LFT art. 50 fr. III', 'LFT art. 89']);
    expect(td?.legalBasis).toEqual(['LFT art. 52', 'LFT art. 50 fr. II']);
    expect(td?.criteria).toEqual(['PR.L.CS. J/37 L (11a.) (reg. 2027249)']);
    expect(codes(r)).toContain('twenty-days-proportional');
  });
});

describe('Example E: resignation after exactly 16 years, ending on February 29 (leap year)', () => {
  // Hired 2012-03-01, resigns 2028-02-29. Daily salary 400.00. 2028 is not in the bundled
  // tables, so a minimum wage is passed explicitly: 350.00 (hypothetical value for the test).
  // Service: the next anniversary is 2028-03-01 = end + 1, so exactly 16 completed years.
  // Year 16 vacation entitlement (26 days) was just earned and not taken: paid in full.
  //
  // Aguinaldo  = 15 x 60/366 x 400 (Jan 1..Feb 29 of a leap year)  = 983.6066 -> 983.61
  // Vacations  = 26 x 400                                          = 10,400.00
  // Prima vac. = 25% x 10,400                                      =  2,600.00
  // Prima ant. = 12 x 16 x 400 (16 >= 15 years, so due on resignation; 350 <= 400 <= 700)
  //            = 76,800.00
  // Total      = 90,783.61
  const r = calculateSeverance({
    startDate: '2012-03-01',
    endDate: '2028-02-29',
    salary: { amount: 400, period: 'daily' },
    reason: 'resignation',
    indicators: { minimumWageDaily: '350' },
  });

  it('computes every line item', () => {
    expect(r.service).toMatchObject({ completedYears: 16, daysIntoCurrentYear: 0, vacationServiceYear: 16 });
    expect(amounts(r)).toEqual({
      aguinaldo: '983.61',
      'vacation-proportional': '10400.00',
      'vacation-premium': '2600.00',
      'seniority-premium': '76800.00',
    });
    expect(r.totals.total.amount).toBe('90783.61');
  });

  it('flags the manual minimum wage and the missing UMA', () => {
    expect(r.indicators.minimumWage).toMatchObject({ overridden: true, source: null });
    expect(codes(r)).toEqual(expect.arrayContaining(['minimum-wage-override', 'tax-uma-unavailable']));
    expect(r.tax).toBeNull();
  });
});

describe('Example F: unjustified dismissal at exactly one year, part-time salary below the minimum', () => {
  // Hired 2025-07-01, dismissed 2026-06-30 (exactly one year). Daily salary 250.00, general zone.
  // Year 1 vacation (12 days) is paid in full because the year just closed.
  // SDI = 250 x (1 + 15/365 + 12 x 25%/365) = 250 x 383/365 = 262.3288 -> 262.33
  //
  // Aguinaldo  = 15 x 181/365 x 250 (Jan 1..Jun 30 = 181)  = 1,859.5890 -> 1,859.59
  // Vacations  = 12 x 250                                  = 3,000.00
  // Prima vac. = 25% x 3,000                               =   750.00
  // Prima ant. = 12 x 1 x 315.04 (raised to the minimum wage, art. 485) = 3,780.48
  // 3 months   = 90 x 262.33                               = 23,609.70
  // Total      = 32,999.77
  const r = calculateSeverance({
    startDate: '2025-07-01',
    endDate: '2026-06-30',
    salary: { amount: 250, period: 'daily' },
    reason: 'unjustified-dismissal',
  });

  it('computes every line item', () => {
    expect(amounts(r)).toEqual({
      aguinaldo: '1859.59',
      'vacation-proportional': '3000.00',
      'vacation-premium': '750.00',
      'seniority-premium': '3780.48',
      'indemnity-three-months': '23609.70',
    });
    expect(r.totals.total.amount).toBe('32999.77');
  });

  it('applies the minimum-wage floor and warns about the low salary', () => {
    expect(codes(r)).toEqual(expect.arrayContaining(['seniority-floor-applied', 'salary-below-minimum']));
  });

  it('exempts separation pay up to 90 UMA for one year', () => {
    // separation = 3,780.48 + 23,609.70 = 27,390.18; cap = 90 x 117.31 x 1 = 10,557.90.
    const sep = r.tax?.rows.find((x) => x.id === 'separation');
    expect(sep?.gross.amount).toBe('27390.18');
    expect(sep?.exempt.amount).toBe('10557.90');
    expect(sep?.taxable.amount).toBe('16832.28');
    // Aguinaldo and prima vacacional are below their caps: fully exempt.
    expect(r.tax?.rows.find((x) => x.id === 'aguinaldo')?.taxable.amount).toBe('0.00');
  });
});

describe('Example G: litigation scenario of 18 months (art. 48)', () => {
  // Same facts as a $18,000 monthly worker: SD 600.00; hired 2019-03-01, dismissed 2026-10-31.
  // SDI = 600 x 385.5/365 = 633.6986 -> 633.70
  // Back pay  = min(18, 12) x 30 x 633.70                    = 228,132.00
  // Interest  = 2% x (18 - 12) x (15 x 30 x 633.70) = 0.12 x 285,165 = 34,219.80
  const r = calculateSeverance({
    startDate: '2019-03-01',
    endDate: '2026-10-31',
    salary: { amount: 18000, period: 'monthly' },
    reason: 'unjustified-dismissal',
    options: { litigationMonths: 18 },
  });

  it('adds back pay capped at 12 months and simple interest after that', () => {
    expect(amounts(r)['back-pay']).toBe('228132.00');
    expect(amounts(r)['back-pay-interest']).toBe('34219.80');
    expect(r.totals.litigation.amount).toBe('262351.80');
    expect(r.items.filter((i) => i.group === 'litigation').every((i) => i.estimate)).toBe(true);
    expect(r.totals.totalWithLitigation.centavos).toBe(r.totals.total.centavos + 26235180);
    expect(codes(r)).toContain('litigation-scenario');
  });
});
