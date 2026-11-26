import {
  formatCentavos,
  q,
  type LineItem,
  type LineItemGroup,
  type Locale,
  type SeveranceResult,
} from '../../src/index.ts';
import { t, type UiKey } from './i18n.ts';
import type { FormState } from './state.ts';

type Child = Node | string | null | false | undefined;

/** Minimal DOM builder. Text always goes through text nodes (no innerHTML). */
function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) {
    if (c === null || c === false || c === undefined) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

const GROUP_KEYS: Record<LineItemGroup, UiKey> = {
  earned: 'group.earned',
  separation: 'group.separation',
  litigation: 'group.litigation',
};

function serviceText(r: SeveranceResult, locale: Locale): string {
  const { completedYears, daysIntoCurrentYear } = r.service;
  const y = `${completedYears} ${t(locale, 'result.years')}`;
  const d = `${daysIntoCurrentYear} ${t(locale, 'result.days')}`;
  return daysIntoCurrentYear === 0 ? y : `${y}, ${d}`;
}

function itemRow(item: LineItem, locale: Locale): HTMLElement {
  return h(
    'tr',
    { class: item.estimate ? 'item estimate' : 'item' },
    h(
      'td',
      { class: 'concept', 'data-label': t(locale, 'table.concept') },
      h('span', { class: 'item-label' }, item.label),
      h('code', { class: 'formula' }, item.formula),
    ),
    h(
      'td',
      { class: 'basis', 'data-label': t(locale, 'table.basis') },
      h('ul', { class: 'cites' }, ...item.legalBasis.map((b) => h('li', {}, b))),
      item.criteria.length > 0 && h('ul', { class: 'criteria' }, ...item.criteria.map((c) => h('li', {}, c))),
    ),
    h('td', { class: 'num amount', 'data-label': t(locale, 'table.amount') }, item.amount.formatted),
  );
}

function groupBody(r: SeveranceResult, group: LineItemGroup, locale: Locale): HTMLElement | null {
  const items = r.items.filter((i) => i.group === group);
  if (items.length === 0) return null;
  const subtotal = group === 'earned' ? r.totals.earned : group === 'separation' ? r.totals.separation : r.totals.litigation;
  return h(
    'tbody',
    { class: `group group-${group}` },
    h('tr', { class: 'group-head' }, h('th', { colspan: '3', scope: 'rowgroup' }, t(locale, GROUP_KEYS[group]))),
    ...items.map((i) => itemRow(i, locale)),
    h(
      'tr',
      { class: 'subtotal' },
      h('td', { colspan: '2' }, t(locale, 'group.subtotal')),
      h('td', { class: 'num' }, subtotal.formatted),
    ),
  );
}

function taxSection(r: SeveranceResult, locale: Locale): HTMLElement | null {
  const tax = r.tax;
  if (!tax) return null;
  return h(
    'details',
    { class: 'tax' },
    h('summary', {}, t(locale, 'tax.title')),
    h('p', { class: 'hint' }, `${t(locale, 'tax.lead')} UMA ${tax.umaDaily.formatted}.`),
    // On phones the four columns do not fit: the table scrolls inside its own
    // box (reachable with the keyboard) instead of widening the page.
    h(
      'div',
      { class: 'table-scroll', role: 'region', 'aria-label': t(locale, 'tax.title'), tabindex: '0' },
      h(
        'table',
        { class: 'tax-table' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, t(locale, 'tax.concept')),
            h('th', { scope: 'col', class: 'num' }, t(locale, 'tax.gross')),
            h('th', { scope: 'col', class: 'num' }, t(locale, 'tax.exempt')),
            h('th', { scope: 'col', class: 'num' }, t(locale, 'tax.taxable')),
          ),
        ),
        h(
          'tbody',
          {},
          ...tax.rows.map((row) =>
            h(
              'tr',
              {},
              h('td', {}, row.label, h('small', { class: 'cite-inline' }, row.legalBasis.join(', '))),
              h('td', { class: 'num' }, row.gross.formatted),
              h('td', { class: 'num' }, row.exempt.formatted),
              h('td', { class: 'num' }, row.taxable.formatted),
            ),
          ),
        ),
        h(
          'tfoot',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'row' }, t(locale, 'tax.total')),
            h('td', { class: 'num' }, tax.totals.gross.formatted),
            h('td', { class: 'num' }, tax.totals.exempt.formatted),
            h('td', { class: 'num' }, tax.totals.taxable.formatted),
          ),
        ),
      ),
    ),
    h('p', { class: 'hint' }, `${t(locale, 'tax.years')}: ${tax.yearsForExemption}.`),
  );
}

function printSummary(r: SeveranceResult, s: FormState, locale: Locale, url: string): HTMLElement {
  const period = t(locale, `period.${s.period}` as UiKey);
  const reason = t(locale, `reason.${s.reason}` as UiKey);
  const zone = t(locale, `zone.${s.zone}` as UiKey);
  return h(
    'div',
    { class: 'print-only print-summary' },
    h('p', { class: 'print-title' }, `finiquito-mx · ${t(locale, 'print.inputs')}`),
    h(
      'p',
      {},
      `${r.service.startDate} → ${r.service.endDate} · ${formatCentavos(q(s.salary).roundToCentavos())} ${period.toLowerCase()} · ${reason} · ${zone}`,
    ),
    h('p', { class: 'print-url' }, url),
  );
}

export function renderResult(r: SeveranceResult, s: FormState, locale: Locale, url: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const hasLitigation = r.totals.litigation.centavos > 0;
  const integratedBadge = r.salary.integratedIsEstimate ? h('span', { class: 'badge' }, t(locale, 'result.estimated')) : null;

  const parts: Child[] = [
    printSummary(r, s, locale, url),
    h(
      'div',
      { class: 'total-card' },
      h('p', { class: 'eyebrow' }, t(locale, 'result.total')),
      h('p', { class: 'total', id: 'total' }, r.totals.total.formatted),
      h(
        'dl',
        { class: 'split' },
        h('div', {}, h('dt', {}, t(locale, 'result.earned')), h('dd', {}, r.totals.earned.formatted)),
        h('div', {}, h('dt', {}, t(locale, 'result.separation')), h('dd', {}, r.totals.separation.formatted)),
        hasLitigation &&
          h(
            'div',
            { class: 'litigation' },
            h('dt', {}, t(locale, 'result.withLitigation')),
            h('dd', {}, r.totals.totalWithLitigation.formatted),
          ),
      ),
    ),
    h(
      'dl',
      { class: 'facts' },
      h(
        'div',
        {},
        h('dt', {}, t(locale, 'result.service')),
        h('dd', {}, serviceText(r, locale), h('span', { class: 'muted' }, ` (${r.service.years})`)),
      ),
      h('div', {}, h('dt', {}, t(locale, 'result.daily')), h('dd', {}, r.salary.daily.formatted)),
      h('div', {}, h('dt', {}, t(locale, 'result.integrated')), h('dd', {}, r.salary.integrated.formatted, integratedBadge)),
      r.indicators.minimumWage &&
        h('div', {}, h('dt', {}, t(locale, 'result.mw')), h('dd', {}, r.indicators.minimumWage.daily.formatted)),
    ),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'breakdown' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, t(locale, 'table.concept')),
            h('th', { scope: 'col' }, t(locale, 'table.basis')),
            h('th', { scope: 'col', class: 'num' }, t(locale, 'table.amount')),
          ),
        ),
        groupBody(r, 'earned', locale),
        groupBody(r, 'separation', locale),
        groupBody(r, 'litigation', locale),
      ),
    ),
    r.notices.length > 0 &&
      h(
        'section',
        { class: 'notices', 'aria-labelledby': 'notices-title' },
        h('h3', { id: 'notices-title' }, t(locale, 'notices.title')),
        h('ul', {}, ...r.notices.map((n) => h('li', { class: n.level }, n.message))),
      ),
    taxSection(r, locale),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn primary', 'data-action': 'copy' }, t(locale, 'actions.copy')),
      h('button', { type: 'button', class: 'btn', 'data-action': 'print' }, t(locale, 'actions.print')),
    ),
    h(
      'aside',
      { class: 'disclaimer' },
      h('strong', {}, `${t(locale, 'disclaimer.title')}. `),
      t(locale, 'disclaimer.body'),
    ),
  ];
  for (const part of parts) if (part) frag.append(part);
  return frag;
}
