/**
 * House style: the em-dash character (U+2014) is not used anywhere in this
 * repository: code, comments, docs, UI text or SVGs. This check scans every
 * tracked or new (non-ignored) text file and fails if it finds one.
 *
 *   node scripts/check-dashes.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const EM_DASH = String.fromCharCode(0x2014);
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|pdf)$/i;

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f !== '' && !BINARY.test(f));

const hits: string[] = [];
for (const file of files) {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the working tree
  }
  text.split('\n').forEach((line, i) => {
    if (line.includes(EM_DASH)) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
  });
}

if (hits.length > 0) {
  console.error(`Found ${hits.length} em-dash character(s):\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`No em-dash in ${files.length} files.`);
