import { describe, expect, it } from 'vitest';
import { configCode } from '../../ui/src/configCode.js';
import { DEFAULT_PREFS, groupsFromLayout, type EditorPrefs } from '../src/ui/prefs.js';

/**
 * Vypsaná konfigurace musí být kód, který jde vzít a vložit do projektu.
 * Ověřuje se proto obsah i to, že se výsledek dá vyhodnotit.
 */
const prefs = (patch: Partial<EditorPrefs> = {}): EditorPrefs => ({
  ...DEFAULT_PREFS,
  groups: groupsFromLayout([['undo', 'redo'], ['bold', 'italic']]),
  ...patch,
});

describe('výpis konfigurace', () => {
  it('vypíše rozvržení ve zvoleném pořadí', () => {
    const code = configCode(prefs());
    expect(code).toContain("  layout: [\n    ['undo', 'redo'],\n    ['bold', 'italic'],\n  ],");
  });

  it('vypnutá tlačítka se nevypíšou', () => {
    const value = prefs();
    value.groups[1]!.items[0]!.on = false;
    expect(configCode(value)).toContain("['italic'],");
    expect(configCode(value)).not.toContain("'bold'");
  });

  it('skupina bez jediného zapnutého tlačítka zmizí celá', () => {
    const value = prefs();
    for (const item of value.groups[1]!.items) item.on = false;
    expect(configCode(value)).toContain("  layout: [\n    ['undo', 'redo'],\n  ],");
  });

  it('spodní řádek se vypíše zvlášť', () => {
    const value = prefs();
    value.groups[1]!.row = 'bottom';
    const code = configCode(value);
    expect(code).toContain("  layout: [\n    ['undo', 'redo'],\n  ],");
    expect(code).toContain("  layoutBottom: [\n    ['bold', 'italic'],\n  ],");
  });

  it('bez spodního řádku se o něm nemluví', () => {
    expect(configCode(prefs())).not.toContain('layoutBottom');
  });

  it('vypisují se jen hodnoty, které se liší od výchozích', () => {
    // Konfigurace opakující výchozí stav zastarává potichu.
    expect(configCode(prefs())).not.toContain('prefs:');

    const code = configCode(prefs({ height: '400px', sticky: false }));
    expect(code).toContain("  prefs: {\n    height: '400px',\n    sticky: false,\n  },");
    expect(code).not.toContain('statusbar');
  });

  it('nabídka je volba lišty, ne položka nastavení', () => {
    const code = configCode(prefs({ menubar: true }));
    expect(code).toContain('  menubar: true,');
    expect(code).not.toContain('prefs:');
  });

  it('vypíše načtené pluginy do importu i do konfigurace', () => {
    const code = configCode(prefs(), { plugins: ['link', 'table'] });
    expect(code).toContain("import { link, table } from '@nibble/plugins';");
    expect(code).toContain('  plugins: [link, table],');
  });

  it('bez pluginů se prázdný import nevypíše', () => {
    const code = configCode(prefs());
    expect(code).not.toContain('@nibble/plugins');
    expect(code).not.toContain('plugins:');
  });

  it('u obrázků připomene adaptér pro nahrávání', () => {
    expect(configCode(prefs(), { plugins: ['image'] })).toContain('createImagePlugin');
  });

  it('apostrof v hodnotě výpis nerozbije', () => {
    // Šířka je text od uživatele, ne jméno z registru.
    const code = configCode(prefs({ width: "calc(100% - 'x')" }));
    expect(code).toContain("width: 'calc(100% - \\'x\\')',");
  });

  it('výsledek je platný JavaScript', () => {
    const code = configCode(prefs({ height: '400px', menubar: true }), { plugins: ['link'] });
    // Importy patří modulu; zbytek se zabalí do async funkce kvůli `await`.
    const body = code.split('\n').filter((line) => !line.startsWith('import ')).join('\n');
    expect(() => new Function('Nibble', 'attachToolbar', 'link',
      'return (async () => {\n' + body + '\n});')).not.toThrow();
  });
});

describe('dlouhý seznam pluginů', () => {
  const many = ['link', 'image', 'table', 'media', 'code', 'autolink',
    'wordcount', 'fullscreen', 'searchreplace', 'typography', 'fonts'];

  it('se zalomí, aby nebyl potřeba vodorovný posuvník', () => {
    const code = configCode(prefs(), { plugins: many });
    const longest = Math.max(...code.split('\n').map((line) => line.length));
    expect(longest).toBeLessThanOrEqual(78);
  });

  it('a pořád je to platný JavaScript', () => {
    const code = configCode(prefs(), { plugins: many });
    // Importy patří modulu; kontroluje se zbytek od vytvoření editoru dál.
    const body = code.slice(code.indexOf('const editor'));
    expect(() => new Function(...many, 'Nibble', 'attachToolbar',
      'return (async () => {\n' + body + '\n});')).not.toThrow();
  });

  it('krátký seznam zůstane na jednom řádku', () => {
    expect(configCode(prefs(), { plugins: ['link', 'table'] }))
      .toContain("import { link, table } from '@nibble/plugins';");
  });
});
