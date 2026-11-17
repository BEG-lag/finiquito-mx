import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const OUT_DIR = resolve(import.meta.dirname, 'web-dist');

/**
 * Writes the list of built assets (and a cache version derived from it) into
 * sw.js, so the first visit already works offline and each release replaces
 * the previous cache.
 */
function precacheManifest(): Plugin {
  let files: string[] = [];
  return {
    name: 'finiquito-precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      files = Object.keys(bundle)
        // woff2 is enough for every browser that supports service workers.
        .filter((f) => !/\.(html|map|woff)$/.test(f))
        .map((f) => `./${f}`)
        .sort();
    },
    closeBundle() {
      const sw = resolve(OUT_DIR, 'sw.js');
      const source = readFileSync(sw, 'utf8');
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10);
      writeFileSync(
        sw,
        source
          .replace("const VERSION = 'finiquito-mx-dev';", `const VERSION = 'finiquito-mx-${version}';`)
          .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(files)};`),
      );
    },
  };
}

// Static build of the web calculator. Relative base so the same build works
// at https://beg-lag.github.io/finiquito-mx/ and from any local folder.
export default defineConfig({
  root: 'web',
  base: './',
  publicDir: 'public',
  plugins: [precacheManifest()],
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173 },
});
