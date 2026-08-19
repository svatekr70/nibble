import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

/**
 * Sestaví projektový web do `dist-site/`.
 *
 * Stránky importují sestavenou knihovnu ze stejného repozitáře, ne z npm —
 * na webu tak vždycky běží ten kód, který je vedle v `packages/`. Kdyby se
 * rozešly, praskne to při buildu, ne až po nasazení.
 */

const OUT = 'dist-site';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/dist`, { recursive: true });
mkdirSync(`${OUT}/fixtures`, { recursive: true });

// Stránky, styly a skripty webu.
cpSync('site', OUT, { recursive: true });

// Demo běží na stejných vzorcích jako testy — kdyby mělo vlastní, ukazovalo by
// se na webu něco jiného, než co je ověřené.
const FIXTURE_DIR = 'packages/core/test/fixtures';
for (const file of readdirSync(FIXTURE_DIR)) {
  if (file.endsWith('.html')) cpSync(`${FIXTURE_DIR}/${file}`, `${OUT}/fixtures/${file}`);
}

cpSync('packages/ui/src/nibble.css', `${OUT}/dist/nibble.css`);

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
  outdir: `${OUT}/dist`,
  minify: true,
});

// Jeden soubor pro ty, kdo si chtějí editor jen zkusit — bez balíčkovače,
// bez klonování, rovnou z adresy.
await build({
  ...common,
  entryPoints: ['tools/bundle-entry.ts'],
  outfile: `${OUT}/dist/nibble.min.js`,
  minify: true,
});

console.log(`\n  web sestaven do ${OUT}/`);
