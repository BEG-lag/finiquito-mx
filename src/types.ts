import type { Money } from './money.ts';
import type { Decimalish } from './rational.ts';
import type { OfficialSource } from './data/indicators.ts';

/**
 * Why the employment relationship ended.
 *
 * - `resignation`: renuncia voluntaria.
 * - `mutual-agreement`: terminación por mutuo consentimiento (LFT art. 53 fr. I).
 * - `justified-dismissal`: despido justificado, rescisión sin responsabilidad para el patrón (LFT art. 47).
 * - `unjustified-dismissal`: despido injustificado (LFT art. 48; CPEUM art. 123 A fr. XXII).
 * - `worker-rescission`: rescisión por causa imputable al patrón (LFT arts. 51 and 52).
 */
export type TerminationReason =
  | 'resignation'
  | 'mutual-agreement'
  | 'justified-dismissal'
  | 'unjustified-dismissal'
  | 'worker-rescission';

/** Minimum-wage area: general zone or Zona Libre de la Frontera Norte. */
export type Zone = 'general' | 'zlfn';

/** How often the salary is fixed (LFT art. 89: weekly / 7, monthly / 30). */
export type PayPeriod = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export type Locale = 'es' | 'en';

export interface SeveranceInput {
  /** First day of work, "YYYY-MM-DD". */
  readonly startDate: string;
  /** Last day of work (termination date), "YYYY-MM-DD". */
  readonly endDate: string;
  /** Ordinary salary (cuota diaria or its weekly/biweekly/monthly equivalent). */
  readonly salary: { readonly amount: Decimalish; readonly period: PayPeriod };
  readonly reason: TerminationReason;
  /** Defaults to `general`. */
  readonly zone?: Zone;
  readonly benefits?: {
    /** Aguinaldo days per year if the contract grants more than 15 (LFT art. 87). */
    readonly aguinaldoDays?: Decimalish;
    /** Prima vacacional percentage if the contract grants more than 25% (LFT art. 80). */
    readonly vacationPremiumPercent?: Decimalish;
    /** Other benefits that integrate the salary (art. 84), as a monthly amount. Divided by 30. */
    readonly otherMonthly?: Decimalish;
    /** Known salario diario integrado. When given, it replaces the estimate. */
    readonly integratedDailySalary?: Decimalish;
  };
  readonly pending?: {
    /** Days worked and not yet paid (salarios devengados). */
    readonly wageDays?: Decimalish;
    /** Vacation days from completed service years that were never taken. */
    readonly vacationDaysFromPriorYears?: Decimalish;
    /** Vacation days already taken in the service year in progress (advance). */
    readonly vacationDaysTakenThisYear?: Decimalish;
  };
  /** Debatable points. Every default is documented in the README. */
  readonly options?: {
    /**
     * Daily salary used for the prima de antigüedad before the floor and cap
     * of arts. 485 and 486. Default `daily` (cuota diaria): there is no
     * jurisprudence on the integrated salary and the tesis aisladas are split.
     */
    readonly seniorityPremiumBase?: 'daily' | 'integrated';
    /**
     * Mutual agreement is treated as voluntary separation for the prima de
     * antigüedad (15-year rule) by default. Use `employer-initiated` when the
     * separation was in fact decided by the employer.
     */
    readonly mutualAgreementTreatedAs?: 'voluntary' | 'employer-initiated';
    /**
     * Include 20 days of salary per year of service (LFT art. 50 fr. II).
     * Default: `true` for `worker-rescission` (art. 52 sends to art. 50) and
     * `false` otherwise. For an unjustified dismissal it is owed only when the
     * employer refuses reinstatement in the cases of art. 49, or if agreed.
     */
    readonly includeTwentyDaysPerYear?: boolean;
    /**
     * Litigation scenario: months the trial would last. Adds back pay
     * (salarios vencidos, up to 12 months) and, beyond 12 months, 2% monthly
     * interest on 15 months of salary (LFT art. 48). Only for
     * `unjustified-dismissal` and `worker-rescission`. Estimate only.
     */
    readonly litigationMonths?: Decimalish;
    /** Estimate the ISR-exempt portions (LISR art. 93). Default `true`. */
    readonly taxEstimate?: boolean;
  };
  /**
   * Overrides for official values. Required when the end date falls outside
   * the bundled tables, or to use a salario mínimo profesional.
   */
  readonly indicators?: {
    readonly minimumWageDaily?: Decimalish;
    readonly umaDaily?: Decimalish;
  };
}

export interface CalculateOptions {
  /** Language of labels, formulas and notices. Default `es`. */
  readonly locale?: Locale;
}

export type LineItemId =
  | 'pending-wages'
  | 'aguinaldo'
  | 'vacation-proportional'
  | 'vacation-pending'
  | 'vacation-premium'
  | 'seniority-premium'
  | 'indemnity-three-months'
  | 'indemnity-twenty-days'
  | 'back-pay'
  | 'back-pay-interest';

/**
 * - `earned`: prestaciones devengadas, owed in every termination (the finiquito).
 * - `separation`: payments for the separation itself (prima de antigüedad, indemnizaciones).
 * - `litigation`: optional trial scenario (salarios vencidos and interest). Estimate.
 */
export type LineItemGroup = 'earned' | 'separation' | 'litigation';

export interface LineItem {
  readonly id: LineItemId;
  readonly group: LineItemGroup;
  readonly label: string;
  /** Days of salary paid by this item, rounded to 4 decimals for display. Null when not day-based. */
  readonly days: string | null;
  /** Daily salary the days are multiplied by. */
  readonly dailyBase: Money | null;
  readonly amount: Money;
  /** Human-readable computation, reproducible from the numbers it shows. */
  readonly formula: string;
  /** Statutory basis, e.g. ["LFT art. 87"]. */
  readonly legalBasis: readonly string[];
  /** Judicial criteria relied on, if any. */
  readonly criteria: readonly string[];
  /** True for the litigation scenario, which depends on facts nobody knows yet. */
  readonly estimate: boolean;
}

export type NoticeCode =
  | 'salary-below-minimum'
  | 'aguinaldo-raised-to-minimum'
  | 'premium-raised-to-minimum'
  | 'vacation-taken-exceeds-accrued'
  | 'confirm-pending-vacations'
  | 'integrated-salary-estimated'
  | 'seniority-premium-base'
  | 'seniority-cap-applied'
  | 'seniority-floor-applied'
  | 'seniority-not-due'
  | 'mutual-agreement-voluntary'
  | 'mutual-agreement-employer'
  | 'justified-dismissal-notice'
  | 'reinstatement-alternative'
  | 'three-months-as-90-days'
  | 'twenty-days-not-included'
  | 'twenty-days-conditional'
  | 'twenty-days-by-agreement'
  | 'twenty-days-proportional'
  | 'litigation-scenario'
  | 'litigation-not-applicable'
  | 'minimum-wage-override'
  | 'uma-override'
  | 'tax-estimate'
  | 'tax-uma-unavailable';

export interface Notice {
  readonly code: NoticeCode;
  readonly level: 'info' | 'warning';
  readonly message: string;
}

export interface TaxRow {
  readonly id: 'aguinaldo' | 'vacation-premium' | 'separation' | 'ordinary' | 'litigation';
  readonly label: string;
  readonly gross: Money;
  readonly exempt: Money;
  readonly taxable: Money;
  readonly legalBasis: readonly string[];
}

export interface TaxEstimate {
  readonly umaDaily: Money;
  readonly umaSource: OfficialSource | null;
  /** Years of service for LISR art. 93 fr. XIII: a fraction of more than six months counts as a full year. */
  readonly yearsForExemption: number;
  readonly rows: readonly TaxRow[];
  readonly totals: { readonly gross: Money; readonly exempt: Money; readonly taxable: Money };
}

export interface SeveranceResult {
  readonly locale: Locale;
  readonly reason: TerminationReason;
  readonly zone: Zone;
  readonly service: {
    readonly startDate: string;
    readonly endDate: string;
    readonly totalDays: number;
    readonly completedYears: number;
    readonly daysIntoCurrentYear: number;
    readonly currentYearLength: number;
    /** Years of service with the fraction, 4 decimals, e.g. "7.6712". */
    readonly years: string;
    /** Service year whose vacation entitlement applies (1-based). */
    readonly vacationServiceYear: number;
    /** Vacation days of that service year (LFT art. 76). */
    readonly vacationDays: number;
  };
  readonly salary: {
    readonly daily: Money;
    readonly integrated: Money;
    /** Factor of integration used for the estimate, 6 decimals. Null when the SDI was given. */
    readonly integrationFactor: string | null;
    readonly integratedIsEstimate: boolean;
    readonly aguinaldoDays: string;
    readonly vacationPremiumPercent: string;
  };
  readonly indicators: {
    /** Null only when no minimum wage was needed and none is bundled for the end date. */
    readonly minimumWage: { readonly daily: Money; readonly source: OfficialSource | null; readonly overridden: boolean } | null;
    readonly uma: { readonly daily: Money; readonly source: OfficialSource | null; readonly overridden: boolean } | null;
  };
  readonly items: readonly LineItem[];
  readonly totals: {
    readonly earned: Money;
    readonly separation: Money;
    readonly litigation: Money;
    /** earned + separation. */
    readonly total: Money;
    /** total + litigation scenario. */
    readonly totalWithLitigation: Money;
  };
  readonly tax: TaxEstimate | null;
  readonly notices: readonly Notice[];
}
