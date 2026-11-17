import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import './styles.css';

import {
  calculateSeverance,
  LFT_VERSION,
  MINIMUM_WAGES,
  SeveranceInputError,
  UMA_VALUES,
  type Locale,
  type SeveranceResult,
} from '../../src/index.ts';
import { isUiKey, t, type UiKey } from './i18n.ts';
import { renderResult } from './render.ts';
import { decodeLocale, decodeState, EMPTY, encodeState, EXAMPLE, toInput, type FormState } from './state.ts';

function $<T extends HTMLElement>(sel: string, type: new () => T): T {
  const el = document.querySelector(sel);
  if (!(el instanceof type)) throw new Error(`missing element ${sel}`);
  return el;
}

const form = $('#form', HTMLFormElement);
const resultBody = $('#result-body', HTMLDivElement);
const exampleNote = $('#example-note', HTMLParagraphElement);
const live = $('#live', HTMLParagraphElement);

// Screen readers hear only the new total, once typing pauses, not the whole table.
let announceTimer: ReturnType<typeof setTimeout> | undefined;
function announce(text: string): void {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    if (live.textContent !== text) live.textContent = text;
  }, 700);
}

let locale: Locale = decodeLocale(location.search);
const fromUrl = decodeState(location.search);
let state: FormState = fromUrl ?? { ...EXAMPLE };
let showingExample = fromUrl === null;

// ------------------------------------------------------------------ i18n

function applyI18n(): void {
  document.documentElement.lang = locale === 'en' ? 'en' : 'es-MX';
  document.title = t(locale, 'meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t(locale, 'meta.description'));
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset['i18n'] ?? '';
    if (isUiKey(key)) el.textContent = t(locale, key);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    const [attr, key] = (el.dataset['i18nAttr'] ?? '').split(':');
    if (attr && key && isUiKey(key)) el.setAttribute(attr, t(locale, key));
  }
  renderSources();
}

function renderSources(): void {
  const list = $('#sources', HTMLUListElement);
  const mw = MINIMUM_WAGES[MINIMUM_WAGES.length - 1];
  const uma = UMA_VALUES[UMA_VALUES.length - 1];
  const items: [UiKey, string, string][] = [['footer.lft', LFT_VERSION.lastReformDof, LFT_VERSION.url]];
  if (mw) items.push(['footer.mw', mw.source.dofDate, mw.source.url]);
  if (uma) items.push(['footer.uma', uma.source.dofDate, uma.source.url]);
  list.replaceChildren(
    ...items.map(([key, date, url]) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      a.textContent = `${t(locale, key)} ${date}`;
      li.append(a);
      return li;
    }),
  );
}

// ------------------------------------------------------------------ form <-> state

type TextField = Exclude<keyof FormState, 'period' | 'zone' | 'reason' | 'seniorityBase' | 'mutualAs' | 'twenty' | 'tax'>;
const TEXT_FIELDS: TextField[] = [
  'start',
  'end',
  'salary',
  'aguinaldoDays',
  'premium',
  'other',
  'sdi',
  'wageDays',
  'priorVacation',
  'takenVacation',
  'months',
  'mw',
  'uma',
];

const field = (name: string): HTMLInputElement => $(`#${name}`, HTMLInputElement);
const select = (name: string): HTMLSelectElement => $(`#${name}`, HTMLSelectElement);

function writeForm(s: FormState): void {
  for (const name of TEXT_FIELDS) field(name).value = s[name];
  select('period').value = s.period;
  select('seniorityBase').value = s.seniorityBase;
  select('mutualAs').value = s.mutualAs;
  select('twenty').value = s.twenty;
  field('tax').checked = s.tax;
  for (const r of form.querySelectorAll<HTMLInputElement>('input[name="zone"]')) r.checked = r.value === s.zone;
  for (const r of form.querySelectorAll<HTMLInputElement>('input[name="reason"]')) r.checked = r.value === s.reason;
}

function readForm(): FormState {
  const radio = (name: string): string =>
    form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
  const text = Object.fromEntries(TEXT_FIELDS.map((n) => [n, field(n).value.trim().replace(/,/g, '')])) as Record<
    TextField,
    string
  >;
  return {
    ...text,
    period: select('period').value as FormState['period'],
    zone: radio('zone') === 'zlfn' ? 'zlfn' : 'general',
    reason: (radio('reason') || 'resignation') as FormState['reason'],
    seniorityBase: select('seniorityBase').value as FormState['seniorityBase'],
    mutualAs: select('mutualAs').value as FormState['mutualAs'],
    twenty: select('twenty').value as FormState['twenty'],
    tax: field('tax').checked,
  };
}

// ------------------------------------------------------------------ compute

const ERROR_KEYS: Record<string, UiKey> = {
  startDate: 'error.startDate',
  endDate: 'error.endDate',
  'salary.amount': 'error.salary.amount',
  'indicators.minimumWageDaily': 'error.indicators.minimumWageDaily',
};

function showError(id: string, message: string | null): void {
  const el = $(`#${id}`, HTMLParagraphElement);
  el.hidden = message === null;
  el.textContent = message ?? '';
}

function markInvalid(names: string[]): void {
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  for (const n of names) field(n).setAttribute('aria-invalid', 'true');
}

function update(): void {
  $('#mutual-field', HTMLLabelElement).hidden = state.reason !== 'mutual-agreement';
  exampleNote.hidden = !showingExample;
  const query = encodeState(state, locale);
  history.replaceState(null, '', `${location.pathname}?${query}${location.hash}`);

  showError('error-dates', null);
  showError('error-salary', null);
  showError('error-general', null);
  markInvalid([]);

  if (!state.start || !state.end || !state.salary) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = t(locale, 'result.empty');
    resultBody.replaceChildren(p);
    return;
  }

  let result: SeveranceResult;
  try {
    result = calculateSeverance(toInput(state), { locale });
  } catch (e) {
    if (!(e instanceof SeveranceInputError)) throw e;
    const key = ERROR_KEYS[e.field];
    const message = key ? t(locale, key) : `${t(locale, 'error.generic')} (${e.field})`;
    if (e.field === 'startDate' || e.field === 'endDate') {
      showError('error-dates', message);
      markInvalid([e.field === 'startDate' ? 'start' : 'end']);
    } else if (e.field === 'salary.amount') {
      showError('error-salary', message);
      markInvalid(['salary']);
    } else {
      showError('error-general', message);
      if (e.field === 'indicators.minimumWageDaily') {
        $('#options', HTMLDetailsElement).open = true;
        markInvalid(['mw']);
      }
    }
    resultBody.replaceChildren();
    return;
  }
  resultBody.replaceChildren(renderResult(result, state, locale, location.href));
  announce(`${t(locale, 'result.total')}: ${result.totals.total.formatted}`);
}

// ------------------------------------------------------------------ events

form.addEventListener('input', () => {
  state = readForm();
  showingExample = false;
  update();
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
});

$('#reset', HTMLButtonElement).addEventListener('click', () => {
  state = { ...EMPTY };
  showingExample = false;
  writeForm(state);
  update();
  field('start').focus();
});

$('#lang', HTMLButtonElement).addEventListener('click', () => {
  locale = locale === 'es' ? 'en' : 'es';
  applyI18n();
  update();
});

resultBody.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!target) return;
  if (target.dataset['action'] === 'print') window.print();
  if (target.dataset['action'] === 'copy') {
    const done = (): void => {
      target.textContent = t(locale, 'actions.copied');
      setTimeout(() => (target.textContent = t(locale, 'actions.copy')), 2000);
    };
    navigator.clipboard.writeText(location.href).then(done, () => {
      window.prompt(t(locale, 'actions.copy'), location.href);
    });
  }
});

// Print the ISR estimate too: open collapsed sections while printing.
let openedForPrint: HTMLDetailsElement[] = [];
window.addEventListener('beforeprint', () => {
  openedForPrint = [...resultBody.querySelectorAll<HTMLDetailsElement>('details:not([open])')];
  for (const d of openedForPrint) d.open = true;
});
window.addEventListener('afterprint', () => {
  for (const d of openedForPrint) d.open = false;
  openedForPrint = [];
});

// ------------------------------------------------------------------ boot

writeForm(state);
applyI18n();
update();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
