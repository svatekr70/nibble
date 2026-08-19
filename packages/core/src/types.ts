/** Veřejné typy Nibble. */

import type { Editor } from './Editor.js';

export type SchemaMode = 'legacy' | 'strict';

/**
 * Jak kódovat znaky mimo ASCII v obsahu, kterého se uživatel dotkl.
 *
 * 'named'  – &iacute; a spol. podle tabulky HTML4. Tohle dělá TinyMCE ve výchozím
 *            stavu, takže je to i výchozí stav Nibble: skoro polovina uloženého
 *            obsahu v cílovém projektu entity obsahuje a nový obsah má vypadat stejně.
 * 'utf8'   – jen &amp; &lt; &gt; a &nbsp;, zbytek doslova.
 * 'auto'   – rozhodne se podle toho, co bylo na vstupu.
 */
export type EntityEncoding = 'named' | 'utf8' | 'auto';

import type { PasteOptions } from './input/Paste.js';

export interface NibbleConfig {
  target: string | HTMLElement;
  content?: string;
  schema?: SchemaMode;
  entityEncoding?: EntityEncoding;
  height?: number;
  lang?: string;
  autofocus?: boolean;
  readonly?: boolean;
  toolbar?: readonly (readonly string[])[];
  plugins?: readonly Plugin[];
  /** Chování při vkládání ze schránky. */
  paste?: PasteOptions;
  /**
   * Hostitelé, jejichž `<iframe>` smí být v obsahu. Prázdné pole zahodí všechny.
   * Bez uvedení platí výchozí seznam běžných video služeb.
   */
  allowedEmbedHosts?: readonly string[];
}

/**
 * Plugin.
 *
 * `setup` dostane celý editor, ne osekané rozhraní: plugin si registruje
 * příkazy i tlačítka a jakýkoli mezistupeň by musel jen předávat dál. Vrácená
 * funkce je úklid — volá se v `destroy()`, takže inicializace a úklid stojí
 * na jednom místě a nedá se na druhý zapomenout.
 */
export interface Plugin {
  readonly name: string;
  setup(editor: Editor): void | (() => void);
}

export interface SchemaViolation {
  node: string;
  reason: string;
}
