import type { LineItemId, Locale, NoticeCode, TaxRow } from './types.ts';

type Dict<K extends string> = Record<Locale, Record<K, string>>;

export const ITEM_LABELS: Dict<LineItemId> = {
  es: {
    'pending-wages': 'Salarios devengados pendientes',
    aguinaldo: 'Aguinaldo proporcional',
    'vacation-proportional': 'Vacaciones proporcionales',
    'vacation-pending': 'Vacaciones de años anteriores no disfrutadas',
    'vacation-premium': 'Prima vacacional',
    'seniority-premium': 'Prima de antigüedad',
    'indemnity-three-months': 'Indemnización constitucional (3 meses)',
    'indemnity-twenty-days': 'Indemnización de 20 días por año',
    'back-pay': 'Salarios vencidos (escenario de juicio)',
    'back-pay-interest': 'Intereses sobre 15 meses de salario (escenario de juicio)',
  },
  en: {
    'pending-wages': 'Unpaid earned wages',
    aguinaldo: 'Pro-rated aguinaldo (year-end bonus)',
    'vacation-proportional': 'Pro-rated vacation pay',
    'vacation-pending': 'Untaken vacation from prior years',
    'vacation-premium': 'Vacation premium (prima vacacional)',
    'seniority-premium': 'Seniority premium (prima de antigüedad)',
    'indemnity-three-months': 'Constitutional indemnity (3 months)',
    'indemnity-twenty-days': 'Indemnity of 20 days per year',
    'back-pay': 'Back pay, salarios vencidos (litigation scenario)',
    'back-pay-interest': 'Interest on 15 months of salary (litigation scenario)',
  },
};

export const TAX_LABELS: Dict<TaxRow['id']> = {
  es: {
    aguinaldo: 'Aguinaldo',
    'vacation-premium': 'Prima vacacional',
    separation: 'Prima de antigüedad e indemnizaciones',
    ordinary: 'Salarios y vacaciones',
    litigation: 'Salarios vencidos e intereses (escenario)',
  },
  en: {
    aguinaldo: 'Aguinaldo',
    'vacation-premium': 'Vacation premium',
    separation: 'Seniority premium and indemnities',
    ordinary: 'Wages and vacation pay',
    litigation: 'Back pay and interest (scenario)',
  },
};

/** Words used inside formula strings. */
export const WORDS: Dict<
  | 'days'
  | 'day'
  | 'years'
  | 'months'
  | 'dailySalary'
  | 'sdi'
  | 'workedIn'
  | 'serviceYear'
  | 'complete'
  | 'taken'
  | 'cap'
  | 'floor'
  | 'minimumWage'
  | 'vacationPay'
  | 'monthsOf30'
  | 'of'
> = {
  es: {
    days: 'días',
    day: 'día',
    years: 'años',
    months: 'meses',
    dailySalary: 'salario diario',
    sdi: 'SDI',
    workedIn: 'días trabajados en',
    serviceYear: 'año de servicio',
    complete: 'completo',
    taken: 'disfrutados',
    cap: 'tope',
    floor: 'piso',
    minimumWage: 'SM',
    vacationPay: 'pago de vacaciones',
    monthsOf30: '3 meses de 30 días',
    of: 'de',
  },
  en: {
    days: 'days',
    day: 'day',
    years: 'years',
    months: 'months',
    dailySalary: 'daily salary',
    sdi: 'SDI',
    workedIn: 'days worked in',
    serviceYear: 'service year',
    complete: 'complete',
    taken: 'taken',
    cap: 'cap',
    floor: 'floor',
    minimumWage: 'MW',
    vacationPay: 'vacation pay',
    monthsOf30: '3 months of 30 days',
    of: 'of',
  },
};

type Params = Record<string, string | number>;
type Template = (p: Params) => string;

const s = (p: Params, k: string): string => String(p[k] ?? '');

export const NOTICES: Record<Locale, Record<NoticeCode, Template>> = {
  es: {
    'salary-below-minimum': (p) =>
      `El salario diario (${s(p, 'daily')}) es menor que el salario mínimo de la zona (${s(p, 'mw')}). Salvo jornada reducida, nadie puede ganar menos del mínimo por una jornada (LFT art. 90): revisa posibles diferencias salariales.`,
    'aguinaldo-raised-to-minimum': (p) =>
      `Se capturaron ${s(p, 'given')} días de aguinaldo; la ley exige al menos 15 (LFT art. 87) y se usaron 15.`,
    'premium-raised-to-minimum': (p) =>
      `Se capturó una prima vacacional de ${s(p, 'given')}%; la ley exige al menos 25% (LFT art. 80) y se usó 25%.`,
    'vacation-taken-exceeds-accrued': (p) =>
      `Las vacaciones disfrutadas del año en curso (${s(p, 'taken')} días) exceden las proporcionales (${s(p, 'accrued')} días). Se dejaron en cero; el excedente no se descuenta (LFT art. 33).`,
    'confirm-pending-vacations': () =>
      'Confirma si quedaron vacaciones de años de servicio anteriores sin disfrutar; aquí se usaron 0. La acción para reclamarlas prescribe en un año (LFT art. 516); valida desde cuándo corre ese plazo, porque se relaciona con los seis meses para disfrutarlas (art. 81).',
    'integrated-salary-estimated': (p) =>
      `El salario diario integrado se estimó con el aguinaldo y la prima vacacional${s(p, 'other') ? ' más otras prestaciones' : ''} (factor ${s(p, 'factor')}). Si recibes bonos, vales, comisiones u otras prestaciones (LFT art. 84), captúralas o usa tu SDI real.`,
    'seniority-premium-base': (p) =>
      p['base'] === 'integrated'
        ? 'Prima de antigüedad sobre el salario integrado (tesis aislada reg. 243324). Hay tesis en contra (reg. 242881, 215596 y 248481) y no hay jurisprudencia: criterio debatible.'
        : 'Prima de antigüedad sobre la cuota diaria. No hay jurisprudencia sobre si se usa el salario integrado: lo excluyen las tesis aisladas reg. 242881, 215596 y 248481, y lo incluye la reg. 243324. Puedes cambiarlo en las opciones.',
    'seniority-cap-applied': (p) =>
      `La prima de antigüedad se topó en el doble del salario mínimo de la zona: ${s(p, 'cap')} diarios (LFT arts. 162 fr. II, 485 y 486; jurisprudencia 2a./J. 48/2011).`,
    'seniority-floor-applied': (p) =>
      `El salario para la prima de antigüedad se elevó al salario mínimo de la zona, ${s(p, 'floor')} (LFT art. 485).`,
    'seniority-not-due': (p) =>
      `Sin prima de antigüedad: en la separación voluntaria sólo procede con 15 años de servicio o más (LFT art. 162 fr. III). Antigüedad: ${s(p, 'years')} años.`,
    'mutual-agreement-voluntary': () =>
      'El mutuo acuerdo se trató como retiro voluntario para la prima de antigüedad (tesis aislada reg. 243325). Si en los hechos la separación la decidió el patrón, la prima procede sin importar los años (jurisprudencia reg. 243029): cámbialo en las opciones.',
    'mutual-agreement-employer': () =>
      'El mutuo acuerdo se trató como separación decidida por el patrón: la prima de antigüedad procede sin importar los años (jurisprudencia reg. 243029). Valida que los hechos lo sostengan.',
    'justified-dismissal-notice': () =>
      'El despido justificado exige aviso escrito con la conducta y las fechas, entregado al despedir o comunicado al Tribunal dentro de cinco días hábiles; sin él se presume injustificado (LFT art. 47).',
    'reinstatement-alternative': () =>
      'Ante un despido injustificado la persona trabajadora puede pedir la reinstalación en lugar de la indemnización (LFT art. 48). El plazo para demandar es de dos meses (art. 518) y antes hay que acudir al Centro de Conciliación (art. 684-B).',
    'three-months-as-90-days': () =>
      'Los tres meses se tomaron como 90 días: el mes es de 30 días según el art. 89 (criterio de la jurisprudencia PR.L.CS. J/26 L (11a.), aplicado por analogía).',
    'twenty-days-not-included': () =>
      'No se incluyeron los 20 días por año: en el despido injustificado proceden si el patrón se niega a reinstalar en los casos del art. 49 (arts. 49 y 50 fr. II), o si se pactan en un convenio. Puedes activarlos en las opciones.',
    'twenty-days-conditional': () =>
      'Se incluyeron los 20 días por año. En el despido injustificado proceden si el patrón se niega a reinstalar en los casos del art. 49 (arts. 49 y 50 fr. II), o si se pactan; si la persona trabajadora es reinstalada, no se pagan.',
    'twenty-days-by-agreement': () =>
      'Se incluyeron los 20 días por año aunque la ley no los exige para este motivo: tómalos como cantidad pactada en convenio, no como mínimo legal.',
    'twenty-days-proportional': () =>
      'Los 20 días por año se pagaron en proporción a la fracción de año (jurisprudencia PR.L.CS. J/37 L (11a.), obligatoria en la Región Centro-Sur).',
    'litigation-scenario': () =>
      'Escenario de juicio: los salarios vencidos y los intereses sólo se generan si un tribunal condena al patrón, y su monto depende de cuánto dure el juicio. Los intereses se calculan como interés simple del 2% mensual sobre 15 meses de salario integrado a partir del mes 13 (lectura de "capitalizable al momento del pago" en el art. 48). Es una estimación, no una cantidad exigible hoy.',
    'litigation-not-applicable': () =>
      'Los salarios vencidos sólo se calculan para despido injustificado o rescisión por causa del patrón; se omitió el escenario de juicio.',
    'minimum-wage-override': (p) => `Se usó un salario mínimo capturado manualmente: ${s(p, 'value')} diarios.`,
    'uma-override': (p) => `Se usó una UMA capturada manualmente: ${s(p, 'value')} diarios.`,
    'tax-estimate': () =>
      'Partes exentas de ISR estimadas con la UMA (LISR art. 93 fr. XIII y XIV; la ley dice salario mínimo y se aplica la UMA por la desindexación de 2016). La retención real depende de LISR arts. 95 y 96 y de tus demás ingresos del año: valida con tu contador.',
    'tax-uma-unavailable': () =>
      'No hay UMA oficial cargada para la fecha de terminación; captura el valor para estimar las partes exentas de ISR.',
  },
  en: {
    'salary-below-minimum': (p) =>
      `The daily salary (${s(p, 'daily')}) is below the zone minimum wage (${s(p, 'mw')}). Unless the workday is reduced, nobody may earn less than the minimum for a workday (LFT art. 90): check for unpaid salary differences.`,
    'aguinaldo-raised-to-minimum': (p) =>
      `${s(p, 'given')} aguinaldo days were entered; the law requires at least 15 (LFT art. 87), so 15 were used.`,
    'premium-raised-to-minimum': (p) =>
      `A ${s(p, 'given')}% vacation premium was entered; the law requires at least 25% (LFT art. 80), so 25% was used.`,
    'vacation-taken-exceeds-accrued': (p) =>
      `Vacation days already taken this service year (${s(p, 'taken')}) exceed the accrued days (${s(p, 'accrued')}). Set to zero; the excess is not deducted (LFT art. 33).`,
    'confirm-pending-vacations': () =>
      'Confirm whether vacation days from earlier service years were left untaken; 0 was used here. The claim expires after one year (LFT art. 516); check when that period starts, since it relates to the six-month window to take them (art. 81).',
    'integrated-salary-estimated': (p) =>
      `The integrated daily salary (SDI) was estimated from aguinaldo and vacation premium${s(p, 'other') ? ' plus other benefits' : ''} (factor ${s(p, 'factor')}). If you receive bonuses, vouchers, commissions or other benefits (LFT art. 84), enter them or use your actual SDI.`,
    'seniority-premium-base': (p) =>
      p['base'] === 'integrated'
        ? 'Seniority premium on the integrated salary (tesis aislada reg. 243324). Other tesis disagree (reg. 242881, 215596, 248481) and there is no binding precedent: debatable.'
        : 'Seniority premium on the ordinary daily salary. There is no binding precedent on whether the integrated salary applies: tesis aisladas reg. 242881, 215596 and 248481 exclude it, reg. 243324 includes it. You can switch it in the options.',
    'seniority-cap-applied': (p) =>
      `The seniority premium was capped at twice the zone minimum wage: ${s(p, 'cap')} per day (LFT arts. 162 fr. II, 485, 486; jurisprudencia 2a./J. 48/2011).`,
    'seniority-floor-applied': (p) =>
      `The salary for the seniority premium was raised to the zone minimum wage, ${s(p, 'floor')} (LFT art. 485).`,
    'seniority-not-due': (p) =>
      `No seniority premium: on voluntary separation it is owed only after 15 years of service (LFT art. 162 fr. III). Service: ${s(p, 'years')} years.`,
    'mutual-agreement-voluntary': () =>
      'Mutual agreement was treated as voluntary separation for the seniority premium (tesis aislada reg. 243325). If the employer actually decided the separation, the premium is owed regardless of tenure (jurisprudencia reg. 243029): change it in the options.',
    'mutual-agreement-employer': () =>
      'Mutual agreement was treated as an employer-initiated separation: the seniority premium is owed regardless of tenure (jurisprudencia reg. 243029). Make sure the facts support it.',
    'justified-dismissal-notice': () =>
      'A justified dismissal requires a written notice stating the conduct and dates, handed over at dismissal or filed with the labor court within five business days; without it the dismissal is presumed unjustified (LFT art. 47).',
    'reinstatement-alternative': () =>
      'After an unjustified dismissal the worker may claim reinstatement instead of the indemnity (LFT art. 48). The deadline to sue is two months (art. 518), and conciliation at the Centro de Conciliación comes first (art. 684-B).',
    'three-months-as-90-days': () =>
      'Three months were taken as 90 days: a month is 30 days under art. 89 (reasoning of jurisprudencia PR.L.CS. J/26 L (11a.), applied by analogy).',
    'twenty-days-not-included': () =>
      'The 20 days per year were not included: after an unjustified dismissal they are owed when the employer refuses reinstatement in the cases of art. 49 (arts. 49 and 50 fr. II), or when agreed in a settlement. You can turn them on in the options.',
    'twenty-days-conditional': () =>
      'The 20 days per year were included. After an unjustified dismissal they are owed when the employer refuses reinstatement in the cases of art. 49 (arts. 49 and 50 fr. II), or when agreed; if the worker is reinstated, they are not paid.',
    'twenty-days-by-agreement': () =>
      'The 20 days per year were included although the law does not require them for this reason: treat them as a negotiated amount, not a legal minimum.',
    'twenty-days-proportional': () =>
      'The 20 days per year were pro-rated for the fraction of a year (jurisprudencia PR.L.CS. J/37 L (11a.), binding in the Centro-Sur region).',
    'litigation-scenario': () =>
      'Litigation scenario: back pay and interest only arise if a court rules against the employer, and the amount depends on how long the trial lasts. Interest is simple interest at 2% per month on 15 months of integrated salary from month 13 on (reading "capitalizable al momento del pago" in art. 48 as no compounding before payment). It is an estimate, not an amount due today.',
    'litigation-not-applicable': () =>
      'Back pay is only computed for unjustified dismissal or rescission caused by the employer; the litigation scenario was skipped.',
    'minimum-wage-override': (p) => `A manually entered minimum wage was used: ${s(p, 'value')} per day.`,
    'uma-override': (p) => `A manually entered UMA was used: ${s(p, 'value')} per day.`,
    'tax-estimate': () =>
      'ISR-exempt portions estimated with the UMA (LISR art. 93 fr. XIII and XIV; the statute says minimum wage, and the UMA applies since the 2016 de-indexation). Actual withholding depends on LISR arts. 95 and 96 and your other income for the year: check with an accountant.',
    'tax-uma-unavailable': () =>
      'No official UMA is bundled for the end date; enter it to estimate the ISR-exempt portions.',
  },
};
