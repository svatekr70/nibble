import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;

/**
 * Sestaví knihovnu do `dist/`, který se **commituje**.
 *
 * Důvod je jediný: jsDelivr servíruje soubory přímo z repozitáře, takže
 * `dist/nibble.min.js` na konkrétním tagu je neměnná adresa, ze které jde
 * editor načíst bez npm, bez klonování a bez lokálního buildu. Kdyby se
 * `dist/` nesestavoval do repozitáře, ta adresa by neexistovala.
 *
 * Aby se commitnutý bundle nerozešel se zdrojem, sestavení hlídá CI: po buildu
 * musí být pracovní strom čistý.
 */

mkdirSync('dist', { recursive: true });
copyFileSync('packages/ui/src/nibble.css', 'dist/nibble.css');

const { metafile } = await build({
  entryPoints: ['tools/bundle-entry.ts'],
  outfile: 'dist/nibble.min.js',
  bundle: true,
  // Verze se dosazuje z package.json, ať se nemá kde rozejít s vydáním.
  define: { __NIBBLE_VERSION__: JSON.stringify(VERSION) },
  format: 'esm',
  target: ['chrome111', 'firefox115', 'safari16'],
  minify: true,
  metafile: true,
  // Bez banneru by v souboru nebylo poznat, co to je a odkud se to vzalo.
  // Tabler je tu proto, že MIT žádá copyright u všech kopií — a minifikovaný
  // balíček z jsDelivr je kopie jako každá jiná. Plné znění: licenses/tabler.txt.
  banner: {
    js: '/*! Nibble — https://github.com/svatekr70/nibble — MIT\n'
      + ' * Ikony: Tabler Icons — https://tabler.io/icons — MIT, (c) Paweł Kuna */',
  },
  logLevel: 'info',
});

const bytes = Object.values(metafile.outputs)[0].bytes;
const gz = gzipSync(readFileSync('dist/nibble.min.js')).length;
console.log('\n  dist/nibble.min.js: %d B raw, %d B gzip', bytes, gz);
