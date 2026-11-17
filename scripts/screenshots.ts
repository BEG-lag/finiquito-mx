/**
 * Serves the production build (web-dist/) and captures the README
 * screenshots with a headless browser. Also runs a few smoke checks:
 * no console errors, no horizontal scroll on a phone, every control labelled,
 * and the print view hides the form.
 *
 *   npm run build:web && npm run screenshots
 *
 * Uses the locally installed Google Chrome through playwright-core (no
 * browser download). Set CHROME_PATH to use another Chromium binary.
 */
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'web-dist');
const ASSETS = join(ROOT, 'assets');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

function serve(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = normalize(join(DIST, path.endsWith('/') ? `${path}index.html` : path));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    readFile(file).then(
      (body) => {
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
      },
      () => res.writeHead(404).end('not found'),
    );
  });
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      ok({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function launch(): Promise<Browser> {
  const executablePath = process.env['CHROME_PATH'];
  return executablePath
    ? chromium.launch({ executablePath, headless: true })
    : chromium.launch({ channel: 'chrome', headless: true });
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function checks(page: Page, label: string): Promise<string[]> {
  return page.evaluate((label) => {
    const problems: string[] = [];
    const controls = [...document.querySelectorAll('input, select, textarea')];
    for (const c of controls) {
      const labelled = c.closest('label') ?? (c.id && document.querySelector(`label[for="${c.id}"]`));
      if (!labelled && !c.getAttribute('aria-label')) problems.push(`${label}: unlabelled control ${c.outerHTML}`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      problems.push(`${label}: horizontal scroll (${document.documentElement.scrollWidth} > ${window.innerWidth})`);
    }
    if (!document.querySelector('#total')?.textContent.startsWith('$')) problems.push(`${label}: no total rendered`);
    return problems;
  }, label);
}

const { server, url } = await serve();
const browser = await launch();
const problems: string[] = [];

try {
  // Desktop: the sample case (same facts as the README worked example).
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1.5 });
  const desktopErrors = collectErrors(desktop);
  await desktop.goto(url, { waitUntil: 'networkidle' });
  await desktop.evaluate(() => document.fonts.ready);
  problems.push(...(await checks(desktop, 'desktop')));
  await desktop.screenshot({ path: join(ASSETS, 'screenshot-desktop.png') });

  // Desktop, English, with the litigation scenario and the ISR table open.
  await desktop.goto(`${url}?i=2019-03-01&f=2026-10-31&s=25000&p=m&m=inj&jm=18&lang=en`, { waitUntil: 'networkidle' });
  await desktop.evaluate(() => {
    document.querySelector<HTMLDetailsElement>('details.tax')?.setAttribute('open', '');
    // Unstick the result panel so the element screenshot shows all of it.
    document.querySelector<HTMLElement>('#result')?.setAttribute('style', 'position:static;max-height:none');
  });
  await desktop.locator('#result').screenshot({ path: join(ASSETS, 'screenshot-result-en.png') });

  // Print view: the form disappears, the breakdown stays.
  await desktop.goto(url, { waitUntil: 'networkidle' });
  await desktop.emulateMedia({ media: 'print' });
  const formVisible = await desktop.locator('#form').isVisible();
  if (formVisible) problems.push('print: form is visible');
  // The PDF prints the page URL (localhost here), so it stays out of the repo.
  const pdfPath = join(tmpdir(), 'finiquito-mx-print.pdf');
  await desktop.pdf({ path: pdfPath, format: 'Letter', printBackground: true });
  console.log(`print preview: ${pdfPath}`);
  await desktop.emulateMedia({ media: 'screen' });
  problems.push(...desktopErrors.map((e) => `desktop console: ${e}`));

  // Phone.
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const phoneErrors = collectErrors(phone);
  await phone.goto(url, { waitUntil: 'networkidle' });
  await phone.evaluate(() => document.fonts.ready);
  problems.push(...(await checks(phone, 'phone')));
  await phone.screenshot({ path: join(ASSETS, 'screenshot-mobile-form.png') });
  await phone.locator('#result').scrollIntoViewIfNeeded();
  await phone.evaluate(() => {
    document.querySelector('#result')?.scrollIntoView({ block: 'start' });
  });
  await phone.screenshot({ path: join(ASSETS, 'screenshot-mobile-result.png') });
  problems.push(...phoneErrors.map((e) => `phone console: ${e}`));

  // Keyboard: Tab reaches the first reason radio and arrow keys change it.
  await phone.goto(url, { waitUntil: 'networkidle' });
  await phone.focus('input[name="reason"]:checked');
  await phone.keyboard.press('ArrowDown');
  const reason = await phone.evaluate(
    () => document.querySelector<HTMLInputElement>('input[name="reason"]:checked')?.value,
  );
  if (reason !== 'worker-rescission') problems.push(`keyboard: arrow key did not move the reason (${String(reason)})`);
  if (!(await phone.evaluate(() => location.search.includes('m=res')))) {
    problems.push('keyboard: URL did not follow the change');
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('screenshots written to assets/, all checks passed');
