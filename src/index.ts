/**
 * finiquito-mx: finiquito and liquidación under Mexico's Ley Federal del Trabajo.
 *
 * Estimate for reference only. Not legal advice. Validate with PROFEDET, an
 * attorney or the competent authority.
 */
export { calculateSeverance, SeveranceInputError } from './calculate.ts';
export type {
  CalculateOptions,
  LineItem,
  LineItemGroup,
  LineItemId,
  Locale,
  Notice,
  NoticeCode,
  PayPeriod,
  SeveranceInput,
  SeveranceResult,
  TaxEstimate,
  TaxRow,
  TerminationReason,
  Zone,
} from './types.ts';
export { vacationDaysForServiceYear, LEGAL_MINIMUMS, PAY_PERIOD_DAYS } from './rules.ts';
export {
  MINIMUM_WAGES,
  UMA_VALUES,
  INDICATORS_VERIFIED_ON,
  LFT_VERSION,
  minimumWageOn,
  umaOn,
} from './data/indicators.ts';
export type { MinimumWageEntry, UmaEntry, OfficialSource } from './data/indicators.ts';
export { serviceTime, parseISODate, formatISODate, isLeapYear } from './dates.ts';
export type { CivilDate, ServiceTime } from './dates.ts';
export { Rational, q } from './rational.ts';
export type { Decimalish } from './rational.ts';
export { formatCentavos } from './money.ts';
export type { Money } from './money.ts';
