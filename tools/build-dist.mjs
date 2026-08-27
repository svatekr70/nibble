import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

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
  format: 'esm',
  target: ['chrome111', 'firefox115', 'safari16'],
  minify: true,
  metafile: true,
  // Bez banneru by v souboru nebylo poznat, co to je a odkud se to vzalo.
  // Lucide je tu proto, že ISC žádá copyright u všech kopií — a minifikovaný
  // balíček z jsDelivr je kopie jako každá jiná. Plné znění: licenses/lucide.txt.
  banner: {
    js: '/*! Nibble — https://github.com/svatekr70/nibble — MIT\n'
      + ' * Ikony: Lucide — https://lucide.dev — ISC, (c) Lucide Icons and Contributors */',
  },
  logLevel: 'info',
});

const bytes = Object.values(metafile.outputs)[0].bytes;
const gz = gzipSync(readFileSync('dist/nibble.min.js')).length;
console.log('\n  dist/nibble.min.js: %d B raw, %d B gzip', bytes, gz);
