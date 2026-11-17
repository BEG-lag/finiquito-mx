/**
 * Form state <-> URL query string <-> library input.
 *
 * The query string only ever carries dates, numbers and short enum codes.
 * No names, no identifiers, no free text: a shared link reveals nothing
 * personal.
 */
import type { Locale, PayPeriod, SeveranceInput, TerminationReason, Zone } from '../../src/index.ts';

export interface FormState {
  start: string;
  end: string;
  salary: string;
  period: PayPeriod;
  zone: Zone;
  reason: TerminationReason;
  aguinaldoDays: string;
  premium: string;
  other: string;
  sdi: string;
  wageDays: string;
  priorVacation: string;
  takenVacation: string;
  seniorityBase: 'daily' | 'integrated';
  mutualAs: 'voluntary' | 'employer-initiated';
  twenty: 'auto' | 'yes' | 'no';
  months: string;
  tax: boolean;
  mw: string;
  uma: string;
}

/** Sample shown on first visit (same facts as the README example). */
export const EXAMPLE: FormState = {
  start: '2019-03-01',
  end: '2026-10-31',
  salary: '25000',
  period: 'monthly',
  zone: 'general',
  reason: 'unjustified-dismissal',
  aguinaldoDays: '15',
  premium: '25',
  other: '',
  sdi: '',
  wageDays: '',
  priorVacation: '',
  takenVacation: '',
  seniorityBase: 'daily',
  mutualAs: 'voluntary',
  twenty: 'auto',
  months: '',
  tax: true,
  mw: '',
  uma: '',
};

export const EMPTY: FormState = {
  ...EXAMPLE,
  start: '',
  end: '',
  salary: '',
  period: 'monthly',
  reason: 'resignation',
};

const PERIOD_CODES: Record<PayPeriod, string> = { daily: 'd', weekly: 'w', biweekly: 'b', monthly: 'm' };
const REASON_CODES: Record<TerminationReason, string> = {
  resignation: 'ren',
  'mutual-agreement': 'mut',
  'justified-dismissal': 'jus',
  'unjustified-dismissal': 'inj',
  'worker-rescission': 'res',
};

function invert<K extends string>(m: Record<K, string>): Record<string, K> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>;
}
const PERIOD_FROM = invert(PERIOD_CODES);
const REASON_FROM = invert(REASON_CODES);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUM_RE = /^\d{1,9}(\.\d{1,4})?$/;

const date = (v: string | null): string => (v && DATE_RE.test(v) ? v : '');
const number = (v: string | null): string => (v && NUM_RE.test(v) ? v : '');

/** Reads a state from a query string. Returns null when there is nothing to read. */
export function decodeState(search: string): FormState | null {
  const p = new URLSearchParams(search);
  if (!p.has('i') && !p.has('f') && !p.has('s')) return null;
  return {
    start: date(p.get('i')),
    end: date(p.get('f')),
    salary: number(p.get('s')),
    period: PERIOD_FROM[p.get('p') ?? ''] ?? 'monthly',
    zone: p.get('z') === 'n' ? 'zlfn' : 'general',
    reason: REASON_FROM[p.get('m') ?? ''] ?? 'resignation',
    aguinaldoDays: number(p.get('ag')) || '15',
    premium: number(p.get('pv')) || '25',
    other: number(p.get('ot')),
    sdi: number(p.get('sdi')),
    wageDays: number(p.get('sp')),
    priorVacation: number(p.get('vp')),
    takenVacation: number(p.get('vt')),
    seniorityBase: p.get('pa') === 'i' ? 'integrated' : 'daily',
    mutualAs: p.get('mu') === 'e' ? 'employer-initiated' : 'voluntary',
    twenty: p.get('v20') === '1' ? 'yes' : p.get('v20') === '0' ? 'no' : 'auto',
    months: number(p.get('jm')),
    tax: p.get('isr') !== '0',
    mw: number(p.get('sm')),
    uma: number(p.get('uma')),
  };
}

/** Writes a state (and language) as a compact query string. Defaults are omitted. */
export function encodeState(s: FormState, locale: Locale): string {
  const p = new URLSearchParams();
  const set = (k: string, v: string, def = ''): void => {
    if (v !== '' && v !== def) p.set(k, v);
  };
  set('i', s.start);
  set('f', s.end);
  set('s', s.salary);
  p.set('p', PERIOD_CODES[s.period]);
  p.set('m', REASON_CODES[s.reason]);
  set('z', s.zone === 'zlfn' ? 'n' : '');
  set('ag', s.aguinaldoDays, '15');
  set('pv', s.premium, '25');
  set('ot', s.other);
  set('sdi', s.sdi);
  set('sp', s.wageDays);
  set('vp', s.priorVacation);
  set('vt', s.takenVacation);
  set('pa', s.seniorityBase === 'integrated' ? 'i' : '');
  set('mu', s.mutualAs === 'employer-initiated' ? 'e' : '');
  set('v20', s.twenty === 'yes' ? '1' : s.twenty === 'no' ? '0' : '');
  set('jm', s.months);
  set('isr', s.tax ? '' : '0');
  set('sm', s.mw);
  set('uma', s.uma);
  set('lang', locale === 'en' ? 'en' : '');
  return p.toString();
}

/** Builds the library input. Empty optional fields are left out. */
export function toInput(s: FormState): SeveranceInput {
  const opt = (v: string): string | undefined => (v.trim() === '' ? undefined : v.trim());
  const benefits = {
    ...(opt(s.aguinaldoDays) && { aguinaldoDays: s.aguinaldoDays }),
    ...(opt(s.premium) && { vacationPremiumPercent: s.premium }),
    ...(opt(s.other) && { otherMonthly: s.other }),
    ...(opt(s.sdi) && { integratedDailySalary: s.sdi }),
  };
  const pending = {
    ...(opt(s.wageDays) && { wageDays: s.wageDays }),
    ...(opt(s.priorVacation) && { vacationDaysFromPriorYears: s.priorVacation }),
    ...(opt(s.takenVacation) && { vacationDaysTakenThisYear: s.takenVacation }),
  };
  const indicators = {
    ...(opt(s.mw) && { minimumWageDaily: s.mw }),
    ...(opt(s.uma) && { umaDaily: s.uma }),
  };
  return {
    startDate: s.start,
    endDate: s.end,
    salary: { amount: s.salary.trim() === '' ? '0' : s.salary.trim(), period: s.period },
    reason: s.reason,
    zone: s.zone,
    benefits,
    pending,
    indicators,
    options: {
      seniorityPremiumBase: s.seniorityBase,
      mutualAgreementTreatedAs: s.mutualAs,
      ...(s.twenty !== 'auto' && { includeTwentyDaysPerYear: s.twenty === 'yes' }),
      ...(opt(s.months) && { litigationMonths: s.months }),
      taxEstimate: s.tax,
    },
  };
}

export function decodeLocale(search: string): Locale {
  return new URLSearchParams(search).get('lang') === 'en' ? 'en' : 'es';
}
