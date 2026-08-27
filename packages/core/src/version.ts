/**
 * Verze Nibble.
 *
 * Hodnotu dosazuje bundler z `package.json` (`define` v `tools/build*.mjs`),
 * takže se nemůže rozejít s vydáním. Když se kód spustí bez bundleru —
 * v jednotkových testech — zůstane `dev`; testy verzi nepotřebují a udržovat
 * ji na dvou místech by znamenalo, že jedno z nich bude jednou zapomenuté.
 */
declare const __NIBBLE_VERSION__: string | undefined;

export const VERSION: string =
  typeof __NIBBLE_VERSION__ === 'string' ? __NIBBLE_VERSION__ : 'dev';
