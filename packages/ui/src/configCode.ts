import { DEFAULT_PREFS, type EditorPrefs } from '@nibble/core';

/**
 * Vygenerovaná konfigurace.
 *
 * Uživatel si lištu přeskládá podle sebe — a když se to povede, je to
 * nejlepší podklad pro to, jak má editor vypadat pro všechny ostatní. Tenhle
 * výpis proto z aktuálního nastavení udělá kód, který jde vzít a vložit do
 * projektu; z ladění „posuň to o jedno doleva a řekni mi, jak to vypadá" se
 * stane jedno zkopírování.
 *
 * Vypisuje se jen to, co se liší od výchozího stavu. Konfigurace, která
 * vyjmenovává hodnoty shodné s výchozími, totiž zastarává potichu: až se
 * výchozí stav změní, tahle ji přebije a nikdo nebude vědět proč.
 */

export interface ConfigCodeOptions {
  /** Jména načtených pluginů, typicky `editor.plugins`. */
  plugins?: readonly string[];
  /** Cíl, na který se editor věší. Jen do ukázky. */
  target?: string;
  /** Nabídkový pruh je vlastní, ne výchozí — vypsat se nedá, jen připomenout. */
  customMenubar?: boolean;
}

function quote(value: string): string {
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/**
 * Dlouhý seznam jmen rozláme na řádky.
 *
 * Jedenáct pluginů na jednom řádku znamená vodorovný posuvník — a kód, který
 * se nedá přečíst bez rolování, se hůř kontroluje, než aby se ušetřily tři
 * řádky.
 */
function wrapNames(names: readonly string[], open: string, close: string): string[] {
  const oneLine = open + names.join(', ') + close;
  if (oneLine.length <= 78) return [oneLine];

  const lines: string[] = [open.trimEnd()];
  let current = '';

  for (const name of names) {
    const next = current ? current + ', ' + name : name;
    if (next.length > 62) { lines.push('  ' + current + ','); current = name; }
    else current = next;
  }

  if (current) lines.push('  ' + current + ',');
  lines.push(close.trimStart());
  return lines;
}

function groupList(names: readonly string[][], indent: string): string {
  return names.map((group) => indent + '[' + group.map(quote).join(', ') + '],').join('\n');
}

/** Skupiny v daném řádku, jen se zapnutými tlačítky a bez prázdných skupin. */
function rowsOf(prefs: EditorPrefs, row: 'top' | 'bottom'): string[][] {
  return prefs.groups
    .filter((group) => group.row === row)
    .map((group) => group.items.filter((item) => item.on).map((item) => item.name))
    .filter((items) => items.length > 0);
}

export function configCode(prefs: EditorPrefs, options: ConfigCodeOptions = {}): string {
  const plugins = options.plugins ?? [];
  const target = options.target ?? '#obsah';

  const lines: string[] = [
    '// Vygenerováno z nastavení editoru.',
    '// Co tu není, zůstává výchozí — a bude se tak vyvíjet dál s Nibble.',
    '',
    "import { Nibble } from '@nibble/core';",
    "import { attachToolbar } from '@nibble/ui';",
  ];

  if (plugins.length > 0) {
    lines.push(...wrapNames(plugins, 'import { ', " } from '@nibble/plugins';"));
  }
  lines.push("import '@nibble/ui/nibble.css';", '');

  lines.push('const editor = await Nibble.create({');
  lines.push('  target: ' + quote(target) + ',');
  lines.push("  schema: 'legacy',");
  if (plugins.length > 0) {
    lines.push(...wrapNames(plugins, '  plugins: [', '],').map(
      (line, index) => index === 0 ? line : '  ' + line,
    ));
  }
  lines.push('});', '');

  lines.push('attachToolbar(editor, {');

  const top = rowsOf(prefs, 'top');
  const bottom = rowsOf(prefs, 'bottom');

  lines.push('  layout: [');
  lines.push(groupList(top, '    '));
  lines.push('  ],');

  if (bottom.length > 0) {
    lines.push('  // Skupiny, které si uživatel přesunul do druhého řádku.');
    lines.push('  layoutBottom: [');
    lines.push(groupList(bottom, '    '));
    lines.push('  ],');
  }

  if (prefs.menubar) {
    lines.push(options.customMenubar
      ? '  menubar: MENU,   // vlastní nabídka, doplňte své pole'
      : '  menubar: true,');
  }

  // `menubar` je volba lišty, ne položka `prefs` — jinak by byla dvakrát.
  const changed = (['width', 'height', 'sticky', 'statusbar', 'resizable'] as const)
    .filter((key) => prefs[key] !== DEFAULT_PREFS[key])
    .map((key) => '    ' + key + ': '
      + (typeof prefs[key] === 'string' ? quote(prefs[key] as string) : String(prefs[key])) + ',');

  if (changed.length > 0) {
    lines.push('  prefs: {', ...changed, '  },');
  }

  lines.push('});');

  if (plugins.includes('image')) {
    lines.push('');
    lines.push('// Obrázky se bez adaptéru vkládají jako data: URL.');
    lines.push('// Nahrávání na server zapne createImagePlugin({ upload }).');
  }

  return lines.join('\n');
}
