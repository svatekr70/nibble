import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';

mkdirSync('demo/dist', { recursive: true });
mkdirSync('demo/fixtures', { recursive: true });

// Demo i testy v prohlížeči jedou na stejné sadě jako testy modelu — kdyby
// měly vlastní vzorky, testovalo by se v každé vrstvě něco jiného.
const FIXTURE_DIR = 'packages/core/test/fixtures';
for (const file of readdirSync(FIXTURE_DIR)) {
  if (file.endsWith('.html')) copyFileSync(`${FIXTURE_DIR}/${file}`, `demo/fixtures/${file}`);
}
copyFileSync('packages/ui/src/nibble.css', 'demo/dist/nibble.css');

const common = {
  bundle: true,
  format: 'esm',
  target: ['chrome111', 'firefox115', 'safari16'],
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: [
    'packages/ui/src/index.ts',
    'packages/core/src/index.ts',
    'packages/plugins/src/index.ts',
  ],
  outdir: 'demo/dist',
  minify: false,
  sourcemap: true,
});

const { metafile } = await build({
  ...common,
  entryPoints: ['tools/bundle-entry.ts'],
  outfile: 'demo/dist/nibble.min.js',
  minify: true,
  metafile: true,
});

const out = Object.values(metafile.outputs)[0];
const { gzipSync } = await import('node:zlib');
const { readFileSync } = await import('node:fs');
const gz = gzipSync(readFileSync('demo/dist/nibble.min.js')).length;

console.log('\n  jádro + lišta: %d B raw, %d B gzip', out.bytes, gz);
