import {
  addMonthsClamped,
  daysInYear,
  formatISODate,
  inclusiveDays,
  parseISODate,
  serviceTime,
  toDayNumber,
  type CivilDate,
} from './dates.ts';
import { minimumWageOn, umaOn, type OfficialSource } from './data/indicators.ts';
import { ITEM_LABELS, NOTICES, TAX_LABELS, WORDS } from './messages.ts';
import { formatPesos, money, moneyToRational, type Money } from './money.ts';
import { Rational, q, type Decimalish } from './rational.ts';
import { LEGAL_MINIMUMS as LM, PAY_PERIOD_DAYS, vacationDaysForServiceYear } from './rules.ts';
import type {
  CalculateOptions,
  LineItem,
  LineItemGroup,
  LineItemId,
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

/** Thrown for invalid or incomplete input. `field` names the offending input path. */
export class SeveranceInputError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = 'SeveranceInputError';
    this.field = field;
  }
}

const REASONS: readonly TerminationReason[] = [
  'resignation',
  'mutual-agreement',
  'justified-dismissal',
  'unjustified-dismissal',
  'worker-rescission',
];
const ZONES: readonly Zone[] = ['general', 'zlfn'];
const PERIODS = Object.keys(PAY_PERIOD_DAYS) as PayPeriod[];

/** Reasons where the employer owes the three-month indemnity and back pay can arise. */
const EMPLOYER_LIABLE: readonly TerminationReason[] = ['unjustified-dismissal', 'worker-rescission'];

function parseDate(value: unknown, field: string): CivilDate {
  const d = typeof value === 'string' ? parseISODate(value) : null;
  if (!d) throw new SeveranceInputError(field, `expected a valid date "YYYY-MM-DD", got ${JSON.stringify(value)}`);
  return d;
}

function parseAmount(value: Decimalish | undefined, field: string, fallback: Rational): Rational {
  if (value === undefined || value === '') return fallback;
  let r: Rational;
  try {
    r = q(value);
  } catch {
    throw new SeveranceInputError(field, `expected a number, got ${JSON.stringify(String(value))}`);
  }
  if (r.isNegative()) throw new SeveranceInputError(field, 'must not be negative');
  return r;
}

/** "3", "2.5", "7.3973". */
function num(r: Rational): string {
  return r.toDecimalString(4);
}

/** Exact years of service as a readable expression: "7", "245/365" or "(7 + 245/365)". */
function yearsExpr(completed: number, daysInto: number, length: number): string {
  if (daysInto === 0) return String(completed);
  if (completed === 0) return `${daysInto}/${length}`;
  return `(${completed} + ${daysInto}/${length})`;
}

/**
 * Computes the finiquito (earned benefits) and, when it applies, the
 * liquidación (separation payments) for a termination under the Ley Federal
 * del Trabajo. Pure function: same input, same output, no I/O.
 *
 * Rounding rules (see README, "Rounding"):
 *  1. The daily salary and the integrated daily salary are rounded to centavos.
 *  2. Day counts and proportions are exact fractions.
 *  3. Each line item is rounded once, half away from zero, to centavos.
 *  4. Totals are sums of rounded line items.
 */
export function calculateSeverance(input: SeveranceInput, options: CalculateOptions = {}): SeveranceResult {
  const locale = options.locale ?? 'es';
  const W = WORDS[locale];
  const LABEL = ITEM_LABELS[locale];
  const MSG = NOTICES[locale];

  const notices: Notice[] = [];
  const notify = (code: NoticeCode, level: Notice['level'], params: Record<string, string | number> = {}): void => {
    notices.push({ code, level, message: MSG[code](params) });
  };

  // ---------------------------------------------------------------- input
  const start = parseDate(input.startDate, 'startDate');
  const end = parseDate(input.endDate, 'endDate');
  if (toDayNumber(end) < toDayNumber(start)) {
    throw new SeveranceInputError('endDate', 'the end date is before the start date');
  }
  const reason = input.reason;
  if (!REASONS.includes(reason)) {
    throw new SeveranceInputError('reason', `expected one of ${REASONS.join(', ')}`);
  }
  const zone: Zone = input.zone ?? 'general';
  if (!ZONES.includes(zone)) throw new SeveranceInputError('zone', `expected one of ${ZONES.join(', ')}`);
  // Runtime guard for untyped callers (plain JS, URL parameters).
  const salary = input.salary as SeveranceInput['salary'] | undefined;
  if (!salary) throw new SeveranceInputError('salary', 'is required');
  const period = salary.period;
  if (!PERIODS.includes(period)) {
    throw new SeveranceInputError('salary.period', `expected one of ${PERIODS.join(', ')}`);
  }
  const salaryAmount = parseAmount(salary.amount, 'salary.amount', Rational.ZERO);
  if (salaryAmount.isZero()) throw new SeveranceInputError('salary.amount', 'must be greater than zero');

  const benefits = input.benefits ?? {};
  const pending = input.pending ?? {};
  const opts = input.options ?? {};
  const endISO = formatISODate(end);

  // ---------------------------------------------------------------- service time
  const svc = serviceTime(start, end);
  const inProgress = svc.daysIntoCurrentYear > 0;
  const fraction = Rational.of(svc.daysIntoCurrentYear, svc.currentYearLength);
  const yearsExact = Rational.of(svc.completedYears).add(fraction);
  const yExpr = yearsExpr(svc.completedYears, svc.daysIntoCurrentYear, svc.currentYearLength);
  // Vacation entitlement of the service year in progress. When the end date
  // closes a full year, that year's days were just earned and not yet taken.
  const vacationYear = inProgress ? svc.completedYears + 1 : svc.completedYears;
  const vacationDays = vacationDaysForServiceYear(vacationYear);
  const vacationFraction = inProgress ? fraction : Rational.ONE;

  // ---------------------------------------------------------------- salary
  const daily = salaryAmount.div(q(PAY_PERIOD_DAYS[period])).round(2);
  const dailyStr = formatPesos(daily);

  let aguinaldoDays = parseAmount(benefits.aguinaldoDays, 'benefits.aguinaldoDays', q(LM.aguinaldoDays));
  if (aguinaldoDays.lt(q(LM.aguinaldoDays))) {
    notify('aguinaldo-raised-to-minimum', 'warning', { given: num(aguinaldoDays) });
    aguinaldoDays = q(LM.aguinaldoDays);
  }
  let premiumPercent = parseAmount(
    benefits.vacationPremiumPercent,
    'benefits.vacationPremiumPercent',
    q(LM.vacationPremiumPercent),
  );
  if (premiumPercent.lt(q(LM.vacationPremiumPercent))) {
    notify('premium-raised-to-minimum', 'warning', { given: num(premiumPercent) });
    premiumPercent = q(LM.vacationPremiumPercent);
  }
  const premiumRate = premiumPercent.div(q(100));

  // Salario diario integrado (LFT arts. 84 and 89): cuota diaria plus the
  // daily share of aguinaldo, prima vacacional and other benefits.
  let integrated: Rational;
  let integrationFactor: Rational | null = null;
  const sdiOverride = benefits.integratedDailySalary;
  if (sdiOverride !== undefined && sdiOverride !== '') {
    integrated = parseAmount(sdiOverride, 'benefits.integratedDailySalary', Rational.ZERO).round(2);
    if (integrated.isZero()) throw new SeveranceInputError('benefits.integratedDailySalary', 'must be greater than zero');
  } else {
    const otherMonthly = parseAmount(benefits.otherMonthly, 'benefits.otherMonthly', Rational.ZERO);
    integrationFactor = Rational.ONE.add(aguinaldoDays.div(q(365))).add(q(vacationDays).mul(premiumRate).div(q(365)));
    integrated = daily.mul(integrationFactor).add(otherMonthly.div(q(30))).round(2);
    notify('integrated-salary-estimated', 'info', {
      factor: integrationFactor.toFixed(6),
      other: otherMonthly.isZero() ? '' : '1',
    });
  }
  const sdiStr = formatPesos(integrated);

  // ---------------------------------------------------------------- indicators
  const mwOverride = input.indicators?.minimumWageDaily;
  const mwEntry = minimumWageOn(endISO);
  let minimumWage: { value: Rational; source: OfficialSource | null; overridden: boolean } | null = null;
  if (mwOverride !== undefined && mwOverride !== '') {
    const value = parseAmount(mwOverride, 'indicators.minimumWageDaily', Rational.ZERO);
    if (value.isZero()) throw new SeveranceInputError('indicators.minimumWageDaily', 'must be greater than zero');
    minimumWage = { value, source: null, overridden: true };
    notify('minimum-wage-override', 'info', { value: formatPesos(value) });
  } else if (mwEntry) {
    minimumWage = { value: q(mwEntry[zone]), source: mwEntry.source, overridden: false };
  }
  if (minimumWage && daily.lt(minimumWage.value)) {
    notify('salary-below-minimum', 'warning', { daily: dailyStr, mw: formatPesos(minimumWage.value) });
  }

  // ---------------------------------------------------------------- line items
  const items: LineItem[] = [];
  const add = (item: {
    id: LineItemId;
    group: LineItemGroup;
    value: Rational;
    days?: Rational | null;
    dailyBase?: Rational | null;
    formula: string;
    legalBasis: string[];
    criteria?: string[];
  }): LineItem => {
    const li: LineItem = {
      id: item.id,
      group: item.group,
      label: LABEL[item.id],
      days: item.days ? num(item.days) : null,
      dailyBase: item.dailyBase ? money(item.dailyBase) : null,
      amount: money(item.value),
      formula: item.formula,
      legalBasis: item.legalBasis,
      criteria: item.criteria ?? [],
      estimate: item.group === 'litigation',
    };
    items.push(li);
    return li;
  };

  // Unpaid earned wages.
  const wageDays = parseAmount(pending.wageDays, 'pending.wageDays', Rational.ZERO);
  if (!wageDays.isZero()) {
    add({
      id: 'pending-wages',
      group: 'earned',
      value: daily.mul(wageDays),
      days: wageDays,
      dailyBase: daily,
      formula: `${num(wageDays)} ${W.days} × ${dailyStr} (${W.dailySalary})`,
      legalBasis: ['LFT art. 82', 'LFT art. 88'],
    });
  }

  // Aguinaldo for the calendar year of the termination (LFT art. 87).
  const yearStart: CivilDate = { year: end.year, month: 1, day: 1 };
  const aguinaldoFrom = toDayNumber(start) > toDayNumber(yearStart) ? start : yearStart;
  const workedThisYear = inclusiveDays(aguinaldoFrom, end);
  const yearLength = daysInYear(end.year);
  const aguinaldoDaysDue = aguinaldoDays.mul(Rational.of(workedThisYear, yearLength));
  const aguinaldoItem = add({
    id: 'aguinaldo',
    group: 'earned',
    value: daily.mul(aguinaldoDaysDue),
    days: aguinaldoDaysDue,
    dailyBase: daily,
    formula: `${num(aguinaldoDays)} ${W.days} × ${workedThisYear}/${yearLength} (${W.workedIn} ${end.year}) × ${dailyStr}`,
    legalBasis: ['LFT art. 87'],
  });

  // Vacations of the service year in progress (LFT arts. 76 and 79).
  const accrued = q(vacationDays).mul(vacationFraction);
  const taken = parseAmount(pending.vacationDaysTakenThisYear, 'pending.vacationDaysTakenThisYear', Rational.ZERO);
  let vacationNet = accrued.sub(taken);
  if (vacationNet.isNegative()) {
    notify('vacation-taken-exceeds-accrued', 'warning', { taken: num(taken), accrued: num(accrued) });
    vacationNet = Rational.ZERO;
  }
  const accruedExpr = inProgress
    ? `${vacationDays} ${W.days} (${W.serviceYear} ${vacationYear}) × ${svc.daysIntoCurrentYear}/${svc.currentYearLength}`
    : `${vacationDays} ${W.days} (${W.serviceYear} ${vacationYear} ${W.complete})`;
  const takenExpr = taken.isZero() ? '' : ` - ${num(taken)} ${W.days} ${W.taken}`;
  const vacationItem = add({
    id: 'vacation-proportional',
    group: 'earned',
    value: daily.mul(vacationNet),
    days: vacationNet,
    dailyBase: daily,
    formula: taken.isZero() ? `${accruedExpr} × ${dailyStr}` : `(${accruedExpr}${takenExpr}) × ${dailyStr}`,
    legalBasis: ['LFT art. 76', 'LFT art. 79'],
  });

  const priorVacation = parseAmount(
    pending.vacationDaysFromPriorYears,
    'pending.vacationDaysFromPriorYears',
    Rational.ZERO,
  );
  let priorVacationItem: LineItem | null = null;
  if (!priorVacation.isZero()) {
    priorVacationItem = add({
      id: 'vacation-pending',
      group: 'earned',
      value: daily.mul(priorVacation),
      days: priorVacation,
      dailyBase: daily,
      formula: `${num(priorVacation)} ${W.days} × ${dailyStr}`,
      legalBasis: ['LFT art. 76', 'LFT art. 81'],
    });
  } else if (svc.completedYears >= 1) {
    notify('confirm-pending-vacations', 'info');
  }

  // Prima vacacional on the vacation pay (LFT art. 80).
  const vacationPay = [vacationItem, priorVacationItem]
    .filter((x): x is LineItem => x !== null)
    .map((x) => moneyToRational(x.amount));
  const vacationPayTotal = Rational.sum(vacationPay);
  const premiumItem = add({
    id: 'vacation-premium',
    group: 'earned',
    value: vacationPayTotal.mul(premiumRate),
    formula:
      vacationPay.length === 1
        ? `${num(premiumPercent)}% × ${formatPesos(vacationPayTotal)} (${W.vacationPay})`
        : `${num(premiumPercent)}% × (${vacationPay.map(formatPesos).join(' + ')})`,
    legalBasis: ['LFT art. 80'],
  });

  // Prima de antigüedad (LFT art. 162).
  const mutualAs = opts.mutualAgreementTreatedAs ?? 'voluntary';
  const voluntary = reason === 'resignation' || (reason === 'mutual-agreement' && mutualAs === 'voluntary');
  if (reason === 'mutual-agreement') {
    notify(mutualAs === 'voluntary' ? 'mutual-agreement-voluntary' : 'mutual-agreement-employer', 'info');
  }
  const seniorityDue = !voluntary || svc.completedYears >= LM.seniorityPremiumVoluntaryYears;
  if (!seniorityDue) {
    notify('seniority-not-due', 'info', { years: yearsExact.toFixed(4) });
  } else {
    if (!minimumWage) {
      throw new SeveranceInputError(
        'indicators.minimumWageDaily',
        `no official minimum wage is bundled for ${endISO}; pass it explicitly (it sets the floor and cap of the prima de antigüedad)`,
      );
    }
    const baseKind = opts.seniorityPremiumBase ?? 'daily';
    const raw = baseKind === 'integrated' ? integrated : daily;
    const mw = minimumWage.value;
    const cap = mw.mul(q(2));
    let base = raw;
    let baseNote = '';
    if (raw.gt(cap)) {
      base = cap;
      baseNote = ` (${W.cap}: 2 × ${W.minimumWage} ${formatPesos(mw)})`;
      notify('seniority-cap-applied', 'info', { cap: formatPesos(cap) });
    } else if (raw.lt(mw)) {
      base = mw;
      baseNote = ` (${W.floor}: ${W.minimumWage})`;
      notify('seniority-floor-applied', 'info', { floor: formatPesos(mw) });
    }
    notify('seniority-premium-base', 'info', { base: baseKind });
    const days = q(LM.seniorityPremiumDaysPerYear).mul(yearsExact);
    const criteria = ['2a./J. 48/2011 (reg. 162319)', 'Jurisprudencia 4a. Sala (reg. 243041)'];
    if (!voluntary) criteria.push('Jurisprudencia 4a. Sala (reg. 243029)');
    if (baseKind === 'integrated') criteria.push('Tesis aislada (reg. 243324)');
    add({
      id: 'seniority-premium',
      group: 'separation',
      value: base.mul(days),
      days,
      dailyBase: base,
      formula: `${LM.seniorityPremiumDaysPerYear} ${W.days} × ${yExpr} ${W.years} × ${formatPesos(base)}${baseNote}`,
      legalBasis: ['LFT art. 162', 'LFT art. 485', 'LFT art. 486'],
      criteria,
    });
  }
  if (reason === 'justified-dismissal') notify('justified-dismissal-notice', 'warning');

  // Indemnización constitucional: three months of salary.
  const employerLiable = EMPLOYER_LIABLE.includes(reason);
  if (employerLiable) {
    if (reason === 'unjustified-dismissal') notify('reinstatement-alternative', 'info');
    const days = q(LM.indemnityThreeMonthsDays);
    add({
      id: 'indemnity-three-months',
      group: 'separation',
      value: integrated.mul(days),
      days,
      dailyBase: integrated,
      formula: `90 ${W.days} (${W.monthsOf30}) × ${sdiStr} (${W.sdi})`,
      legalBasis:
        reason === 'unjustified-dismissal'
          ? ['CPEUM art. 123 A fr. XXII', 'LFT art. 48', 'LFT art. 89']
          : ['CPEUM art. 123 A fr. XXII', 'LFT art. 52', 'LFT art. 50 fr. III', 'LFT art. 89'],
      criteria: ['PR.L.CS. J/26 L (11a.) (reg. 2026784)'],
    });
    notify('three-months-as-90-days', 'info');
  }

  // Twenty days per year of service (LFT art. 50 fr. II).
  const twentyDays = opts.includeTwentyDaysPerYear ?? reason === 'worker-rescission';
  if (twentyDays) {
    const days = q(LM.indemnityDaysPerYear).mul(yearsExact);
    const legalBasis =
      reason === 'worker-rescission'
        ? ['LFT art. 52', 'LFT art. 50 fr. II']
        : reason === 'unjustified-dismissal'
          ? ['LFT art. 49', 'LFT art. 50 fr. II']
          : ['LFT art. 50 fr. II', 'LFT art. 33'];
    add({
      id: 'indemnity-twenty-days',
      group: 'separation',
      value: integrated.mul(days),
      days,
      dailyBase: integrated,
      formula: `${LM.indemnityDaysPerYear} ${W.days} × ${yExpr} ${W.years} × ${sdiStr} (${W.sdi})`,
      legalBasis,
      criteria: ['PR.L.CS. J/37 L (11a.) (reg. 2027249)'],
    });
    if (reason === 'unjustified-dismissal') notify('twenty-days-conditional', 'info');
    if (!employerLiable) notify('twenty-days-by-agreement', 'warning');
    if (inProgress) notify('twenty-days-proportional', 'info');
  } else if (reason === 'unjustified-dismissal') {
    notify('twenty-days-not-included', 'info');
  }

  // Litigation scenario: salarios vencidos and interest (LFT art. 48).
  const litigationMonths = parseAmount(opts.litigationMonths, 'options.litigationMonths', Rational.ZERO);
  if (!litigationMonths.isZero()) {
    if (!employerLiable) {
      notify('litigation-not-applicable', 'warning');
    } else {
      const maxMonths = q(LM.backPayMaxMonths);
      const backMonths = Rational.min(litigationMonths, maxMonths);
      const monthsExpr = litigationMonths.gt(maxMonths)
        ? `min(${num(litigationMonths)}, 12) ${W.months}`
        : `${num(backMonths)} ${W.months}`;
      const backDays = backMonths.mul(q(30));
      add({
        id: 'back-pay',
        group: 'litigation',
        value: integrated.mul(backDays),
        days: backDays,
        dailyBase: integrated,
        formula: `${monthsExpr} × 30 ${W.days} × ${sdiStr} (${W.sdi})`,
        legalBasis: reason === 'unjustified-dismissal' ? ['LFT art. 48'] : ['LFT art. 50 fr. III', 'LFT art. 48'],
        criteria: ['PR.L.CS. J/26 L (11a.) (reg. 2026784)'],
      });
      if (litigationMonths.gt(maxMonths)) {
        const interestMonths = litigationMonths.sub(maxMonths);
        const fifteenMonths = integrated.mul(q(LM.interestBaseMonths * 30));
        const rate = Rational.of(LM.interestMonthlyRatePercent, 100);
        add({
          id: 'back-pay-interest',
          group: 'litigation',
          value: fifteenMonths.mul(rate).mul(interestMonths),
          formula: `2% × ${num(interestMonths)} ${W.months} × (15 ${W.months} × 30 ${W.days} × ${sdiStr})`,
          legalBasis: ['LFT art. 48'],
          criteria: ['Tesis V.3o.C.T.19 L (10a.) (reg. 2021747)'],
        });
      }
      notify('litigation-scenario', 'warning');
    }
  }

  // ---------------------------------------------------------------- totals
  const sumGroup = (group: LineItemGroup): Rational =>
    Rational.sum(items.filter((i) => i.group === group).map((i) => moneyToRational(i.amount)));
  const earned = sumGroup('earned');
  const separation = sumGroup('separation');
  const litigation = sumGroup('litigation');

  // ---------------------------------------------------------------- ISR estimate
  let tax: TaxEstimate | null = null;
  let umaInfo: SeveranceResult['indicators']['uma'] = null;
  if (opts.taxEstimate ?? true) {
    const umaOverride = input.indicators?.umaDaily;
    const umaEntry = umaOn(endISO);
    let uma: Rational | null = null;
    let umaSource: OfficialSource | null = null;
    if (umaOverride !== undefined && umaOverride !== '') {
      uma = parseAmount(umaOverride, 'indicators.umaDaily', Rational.ZERO);
      notify('uma-override', 'info', { value: formatPesos(uma) });
    } else if (umaEntry) {
      uma = q(umaEntry.daily);
      umaSource = umaEntry.source;
    }
    if (!uma) {
      notify('tax-uma-unavailable', 'warning');
    } else {
      umaInfo = { daily: money(uma), source: umaSource, overridden: umaSource === null };
      // LISR art. 93 fr. XIII: "Toda fracción de más de seis meses se considerará un año completo."
      const moreThanSixMonths =
        inProgress && toDayNumber(end) >= toDayNumber(addMonthsClamped(svc.lastAnniversary, 6));
      const yearsForExemption = svc.completedYears + (moreThanSixMonths ? 1 : 0);
      tax = buildTax({
        locale,
        uma,
        umaSource,
        yearsForExemption,
        aguinaldo: moneyToRational(aguinaldoItem.amount),
        premium: moneyToRational(premiumItem.amount),
        separation,
        ordinary: earned.sub(moneyToRational(aguinaldoItem.amount)).sub(moneyToRational(premiumItem.amount)),
        litigation,
      });
      notify('tax-estimate', 'info');
    }
  }

  return {
    locale,
    reason,
    zone,
    service: {
      startDate: formatISODate(start),
      endDate: endISO,
      totalDays: svc.totalDays,
      completedYears: svc.completedYears,
      daysIntoCurrentYear: svc.daysIntoCurrentYear,
      currentYearLength: svc.currentYearLength,
      years: yearsExact.toFixed(4),
      vacationServiceYear: vacationYear,
      vacationDays,
    },
    salary: {
      daily: money(daily),
      integrated: money(integrated),
      integrationFactor: integrationFactor ? integrationFactor.toFixed(6) : null,
      integratedIsEstimate: integrationFactor !== null,
      aguinaldoDays: num(aguinaldoDays),
      vacationPremiumPercent: num(premiumPercent),
    },
    indicators: {
      minimumWage: minimumWage
        ? { daily: money(minimumWage.value), source: minimumWage.source, overridden: minimumWage.overridden }
        : null,
      uma: umaInfo,
    },
    items,
    totals: {
      earned: money(earned),
      separation: money(separation),
      litigation: money(litigation),
      total: money(earned.add(separation)),
      totalWithLitigation: money(earned.add(separation).add(litigation)),
    },
    tax,
    notices,
  };
}

function buildTax(a: {
  locale: SeveranceResult['locale'];
  uma: Rational;
  umaSource: OfficialSource | null;
  yearsForExemption: number;
  aguinaldo: Rational;
  premium: Rational;
  separation: Rational;
  ordinary: Rational;
  litigation: Rational;
}): TaxEstimate {
  const label = TAX_LABELS[a.locale];
  const rows: TaxRow[] = [];
  const row = (id: TaxRow['id'], gross: Rational, cap: Rational | null, legalBasis: string[]): void => {
    const exempt = cap === null ? Rational.ZERO : Rational.min(gross, cap);
    const g: Money = money(gross);
    const e: Money = money(exempt);
    rows.push({
      id,
      label: label[id],
      gross: g,
      exempt: e,
      taxable: money(moneyToRational(g).sub(moneyToRational(e))),
      legalBasis,
    });
  };
  row('aguinaldo', a.aguinaldo, a.uma.mul(q(LM.taxExemptAguinaldoUma)), ['LISR art. 93 fr. XIV']);
  row('vacation-premium', a.premium, a.uma.mul(q(LM.taxExemptVacationPremiumUma)), ['LISR art. 93 fr. XIV']);
  if (!a.separation.isZero()) {
    row(
      'separation',
      a.separation,
      a.uma.mul(q(LM.taxExemptSeparationUmaPerYear)).mul(q(a.yearsForExemption)),
      ['LISR art. 93 fr. XIII', 'LISR art. 95'],
    );
  }
  if (!a.ordinary.isZero()) row('ordinary', a.ordinary, null, ['LISR art. 94', 'LISR art. 96']);
  if (!a.litigation.isZero()) row('litigation', a.litigation, null, ['LISR art. 94']);
  const total = (k: 'gross' | 'exempt' | 'taxable'): Money =>
    money(Rational.sum(rows.map((r) => moneyToRational(r[k]))));
  return {
    umaDaily: money(a.uma),
    umaSource: a.umaSource,
    yearsForExemption: a.yearsForExemption,
    rows,
    totals: { gross: total('gross'), exempt: total('exempt'), taxable: total('taxable') },
  };
}
