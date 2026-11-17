/**
 * Official economic indicators used by the calculator.
 *
 * Every value below was checked against its official publication on
 * 2026-11-17. To add a new year, append an entry with its source; values that
 * cannot be verified must not be added here (pass them as an explicit
 * override instead, see `IndicatorOverrides`).
 */

export interface OfficialSource {
  /** Issuing body. */
  readonly issuer: string;
  /** Title of the publication as printed. */
  readonly title: string;
  /** Publication date in the Diario Oficial de la Federación (YYYY-MM-DD). */
  readonly dofDate: string;
  readonly url: string;
  /** Additional official reference (press release, PDF), if any. */
  readonly secondaryUrl?: string;
}

export interface MinimumWageEntry {
  /** First day the values apply (YYYY-MM-DD). */
  readonly from: string;
  /** Last day the values apply (YYYY-MM-DD). */
  readonly to: string;
  /** Daily minimum wage, general zone (Zona del Salario Mínimo General). */
  readonly general: string;
  /** Daily minimum wage, Zona Libre de la Frontera Norte. */
  readonly zlfn: string;
  readonly source: OfficialSource;
}

export interface UmaEntry {
  readonly from: string;
  readonly to: string;
  /** Daily value of the Unidad de Medida y Actualización. */
  readonly daily: string;
  readonly monthly: string;
  readonly annual: string;
  readonly source: OfficialSource;
}

/**
 * Salarios mínimos generales (CONASAMI). They take effect on January 1.
 * The LFT still uses the minimum wage (not the UMA) for the floor and cap of
 * the prima de antigüedad (arts. 162 fr. II, 485 and 486).
 */
export const MINIMUM_WAGES: readonly MinimumWageEntry[] = [
  {
    from: '2025-01-01',
    to: '2025-12-31',
    general: '278.80',
    zlfn: '419.88',
    source: {
      issuer: 'Comisión Nacional de los Salarios Mínimos (CONASAMI)',
      title:
        'Resolución del H. Consejo de Representantes de la Comisión Nacional de los Salarios Mínimos que fija los salarios mínimos generales y profesionales que habrán de regir a partir del 1 de enero de 2025',
      dofDate: '2024-12-19',
      url: 'https://dof.gob.mx/nota_detalle.php?codigo=5745678&fecha=19/12/2024',
    },
  },
  {
    from: '2026-01-01',
    to: '2026-12-31',
    general: '315.04',
    zlfn: '440.87',
    source: {
      issuer: 'Comisión Nacional de los Salarios Mínimos (CONASAMI)',
      title:
        'Resolución del H. Consejo de Representantes de la Comisión Nacional de los Salarios Mínimos que fija los salarios mínimos generales y profesionales que habrán de regir a partir del 1 de enero de 2026',
      dofDate: '2025-12-09',
      url: 'https://dof.gob.mx/nota_detalle.php?codigo=5775534&fecha=09/12/2025',
    },
  },
];

/**
 * Unidad de Medida y Actualización (INEGI). Each value takes effect on
 * February 1 and applies until January 31 of the following year. Used only
 * for the optional ISR exemption estimate (LISR art. 93).
 */
export const UMA_VALUES: readonly UmaEntry[] = [
  {
    from: '2024-02-01',
    to: '2025-01-31',
    daily: '108.57',
    monthly: '3300.53',
    annual: '39606.36',
    source: {
      issuer: 'Instituto Nacional de Estadística y Geografía (INEGI)',
      title: 'Unidad de medida y actualización (valores vigentes a partir del 1o. de febrero de 2024)',
      dofDate: '2024-01-10',
      url: 'https://sc.inegi.org.mx/repositorioNormateca/UMA24.pdf',
      secondaryUrl: 'https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2024/UMA/UMA2024.pdf',
    },
  },
  {
    from: '2025-02-01',
    to: '2026-01-31',
    daily: '113.14',
    monthly: '3439.46',
    annual: '41273.52',
    source: {
      issuer: 'Instituto Nacional de Estadística y Geografía (INEGI)',
      title: 'Unidad de medida y actualización (valores vigentes a partir del 1o. de febrero de 2025)',
      dofDate: '2025-01-10',
      url: 'https://dof.gob.mx/nota_detalle.php?codigo=5746930&fecha=10/01/2025',
    },
  },
  {
    from: '2026-02-01',
    to: '2027-01-31',
    daily: '117.31',
    monthly: '3566.22',
    annual: '42794.64',
    source: {
      issuer: 'Instituto Nacional de Estadística y Geografía (INEGI)',
      title: 'Unidad de medida y actualización (valores vigentes a partir del 1o. de febrero de 2026)',
      dofDate: '2026-01-09',
      url: 'https://dof.gob.mx/nota_detalle.php?codigo=5778072&fecha=09/01/2026',
      secondaryUrl: 'https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/uma/uma2026.pdf',
    },
  },
];

/** Date on which the values above were last checked against the official sources. */
export const INDICATORS_VERIFIED_ON = '2026-11-17';

/** Text of the Ley Federal del Trabajo used to write and test the rules. */
export const LFT_VERSION = {
  lastReformDof: '2026-05-14',
  url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf',
  checkedOn: '2026-11-17',
} as const;

function findByDate<T extends { from: string; to: string }>(table: readonly T[], isoDate: string): T | undefined {
  // ISO dates compare correctly as strings.
  return table.find((e) => e.from <= isoDate && isoDate <= e.to);
}

export function minimumWageOn(isoDate: string): MinimumWageEntry | undefined {
  return findByDate(MINIMUM_WAGES, isoDate);
}

export function umaOn(isoDate: string): UmaEntry | undefined {
  return findByDate(UMA_VALUES, isoDate);
}
