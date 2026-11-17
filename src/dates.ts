/**
 * Calendar arithmetic on plain civil dates (no time zones, no `Date`).
 *
 * A date is represented as a day number: days since 1970-01-01 in the
 * proleptic Gregorian calendar. Conversions use Howard Hinnant's
 * `days_from_civil` / `civil_from_days` algorithms, which are exact for any
 * year a labor relationship could span.
 */

export interface CivilDate {
  readonly year: number;
  readonly month: number; // 1..12
  readonly day: number; // 1..31
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Day number of a civil date. */
export function toDayNumber({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Civil date of a day number. */
export function fromDayNumber(z: number): CivilDate {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

/** Parses a strict ISO date "YYYY-MM-DD". Returns null if invalid. */
export function parseISODate(value: string): CivilDate | null {
  const m = ISO_RE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatISODate({ year, month, day }: CivilDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Same month and day `years` later. February 29 maps to February 28 in
 * common years (documented convention; it only matters for people hired on
 * a leap day).
 */
export function addYearsClamped(date: CivilDate, years: number): CivilDate {
  const year = date.year + years;
  return { year, month: date.month, day: Math.min(date.day, daysInMonth(year, date.month)) };
}

/** Same day `months` later, clamped to the end of the target month. */
export function addMonthsClamped(date: CivilDate, months: number): CivilDate {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/** Days from `a` to `b` inclusive of both ends (same day = 1). */
export function inclusiveDays(a: CivilDate, b: CivilDate): number {
  return toDayNumber(b) - toDayNumber(a) + 1;
}

export interface ServiceTime {
  /** Calendar days of service, counting both the first and last day. */
  readonly totalDays: number;
  /** Full years of service completed on or before the end date. */
  readonly completedYears: number;
  /** Days elapsed in the service year in progress (0 when the end date closes a full year). */
  readonly daysIntoCurrentYear: number;
  /** Length in days (365 or 366) of the service year used for the fraction. */
  readonly currentYearLength: number;
  /** Date of the last anniversary (or the start date if none). */
  readonly lastAnniversary: CivilDate;
}

/**
 * Splits a period of service into completed years plus a fraction.
 *
 * Convention: a service year runs from an anniversary to the day before the
 * next one, so someone hired on 2025-01-01 who leaves on 2025-12-31 has
 * exactly one completed year (365 days of service) and a fraction of zero.
 */
export function serviceTime(start: CivilDate, end: CivilDate): ServiceTime {
  const startN = toDayNumber(start);
  const endN = toDayNumber(end);
  if (endN < startN) throw new RangeError('serviceTime: end date is before start date');

  // Largest k such that anniversary(k) <= end + 1. Start from the calendar
  // difference (an upper bound) and step down.
  let k = Math.max(0, end.year - start.year + 1);
  while (k > 0 && toDayNumber(addYearsClamped(start, k)) > endN + 1) k--;

  const last = addYearsClamped(start, k);
  const lastN = toDayNumber(last);
  const nextN = toDayNumber(addYearsClamped(start, k + 1));
  return {
    totalDays: endN - startN + 1,
    completedYears: k,
    daysIntoCurrentYear: endN - lastN + 1,
    currentYearLength: nextN - lastN,
    lastAnniversary: last,
  };
}
