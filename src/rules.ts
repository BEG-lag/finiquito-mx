/**
 * Statutory schedules that do not depend on the termination scenario.
 */

/**
 * Days of paid vacation for service year `n` (n >= 1) under LFT art. 76 as
 * reformed in the DOF on 2022-12-27 (in force since 2023-01-01, "vacaciones
 * dignas"):
 *
 *   "...en ningún caso podrá ser inferior a doce días laborables, y que
 *   aumentará en dos días laborables, hasta llegar a veinte, por cada año
 *   subsecuente de servicios. A partir del sexto año, el periodo de
 *   vacaciones aumentará en dos días por cada cinco de servicios."
 *
 *   year 1: 12, 2: 14, 3: 16, 4: 18, 5: 20,
 *   years 6-10: 22, 11-15: 24, 16-20: 26, 21-25: 28, 26-30: 30, 31-35: 32 ...
 */
export function vacationDaysForServiceYear(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`vacationDaysForServiceYear: invalid service year ${n}`);
  if (n <= 5) return 10 + 2 * n;
  return 22 + 2 * Math.floor((n - 6) / 5);
}

/** Legal minimums that a contract may improve but never reduce. */
export const LEGAL_MINIMUMS = {
  /** LFT art. 87. */
  aguinaldoDays: 15,
  /** LFT art. 80. */
  vacationPremiumPercent: 25,
  /** LFT art. 162 fr. I. */
  seniorityPremiumDaysPerYear: 12,
  /** LFT art. 162 fr. III: voluntary separation requires 15 years. */
  seniorityPremiumVoluntaryYears: 15,
  /** LFT art. 50 fr. II. */
  indemnityDaysPerYear: 20,
  /** LFT art. 48 / art. 50 fr. III / CPEUM art. 123 A fr. XXII: three months of 30 days (art. 89). */
  indemnityThreeMonthsDays: 90,
  /** LFT art. 48: back pay is capped at 12 months. */
  backPayMaxMonths: 12,
  /** LFT art. 48: interest is computed on 15 months of salary... */
  interestBaseMonths: 15,
  /** ...at 2% per month. */
  interestMonthlyRatePercent: 2,
  /** LISR art. 93 fr. XIV: aguinaldo exempt up to 30 UMA. */
  taxExemptAguinaldoUma: 30,
  /** LISR art. 93 fr. XIV: prima vacacional exempt up to 15 UMA. */
  taxExemptVacationPremiumUma: 15,
  /** LISR art. 93 fr. XIII: separation payments exempt up to 90 UMA per year of service. */
  taxExemptSeparationUmaPerYear: 90,
} as const;

/** Divisor that turns a pay-period salary into a daily salary (LFT art. 89, last paragraph). */
export const PAY_PERIOD_DAYS = {
  daily: 1,
  weekly: 7,
  /** Not in art. 89; a quincena is treated as 15 days, consistent with the 30-day month. */
  biweekly: 15,
  monthly: 30,
} as const;
