import type { Editor } from '../Editor.js';
import {
  cleanPastedContent, detectSource, extractFragment, type PasteSource,
} from '../model/clean.js';
import { collectStyleRules, inlineStyleRules } from '../model/pasteCss.js';
import { looksLikeMarkdown, markdownToHtml, plainTextToHtml } from '../model/markdown.js';

/**
 * Vkládání ze schránky.
 *
 * Vložený obsah je jediné místo, kde Nibble sahá na cizí HTML naplno. Načtený
 * dokument se nechává být, protože ho někdo napsal a o změnu nežádal — ale to,
 * co právě teď přišlo ze schránky, vzniká v tuhle chvíli a nese s sebou
 * nepořádek zdrojové aplikace. Kdyby prošlo, usadí se v databázi natrvalo.
 */

export interface PasteOptions {
  /** Které vlastnosti stylu si z vloženého obsahu nechat. */
  keepStyles?: readonly string[];
  /** Povolené značky. Co v seznamu není, se rozbalí a text zůstane. */
  allowedTags?: ReadonlySet<string>;
  /** Převádět Markdown, když přijde čistý text? Výchozí: ano. */
  markdown?: boolean;
}

/** Značky, které se z vloženého obsahu pouštějí dál. */
export const PASTE_ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'a', 'img',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'colgroup', 'col', 'span', 'div', 'figure', 'figcaption',
]);

export interface PasteResult {
  source: PasteSource;
  removed: string[];
  html: string;
}

/** Vyčistí HTML ze schránky. Vrací i to, co se zahodilo — kvůli ladění. */
export function cleanPastedHtml(
  html: string,
  doc: Document,
  options: PasteOptions = {},
): PasteResult {
  // Obojí se čte z celého HTML, ne z výřezu: `<style>` blok i hlavička, podle
  // které se pozná zdroj, jsou nad značkou fragmentu.
  const source = detectSource(html);

  // Google Sheets posílá formátování ke každé buňce a `<style>` blok má jen
  // jako náhradu pro aplikace, které inline styly neumějí — je v něm světle
  // šedý rámeček na všechno. Kdyby se vlil dovnitř, dostal by mřížku i sešit,
  // který žádnou nemá. U Sheets se proto blok přeskakuje celý.
  const rules = source === 'google-sheets' ? [] : collectStyleRules(html);

  const box = doc.createElement('div');
  box.innerHTML = extractFragment(html);
  inlineStyleRules(box, rules);

  const { removed } = cleanPastedContent(box, doc, {
    ...(options.keepStyles ? { keepStyles: options.keepStyles } : {}),
    allowedTags: options.allowedTags ?? PASTE_ALLOWED_TAGS,
    source,
  });

  return { source, removed, html: box.innerHTML };
}

/** Převede čistý text na HTML — případně přes Markdown. */
export function textToHtml(text: string, options: PasteOptions = {}): string {
  const useMarkdown = options.markdown ?? true;
  return useMarkdown && looksLikeMarkdown(text)
    ? markdownToHtml(text)
    : plainTextToHtml(text);
}

/** Nese HTML ze schránky tabulku? Rozhoduje o přednosti před obrázkem. */
function hasTable(html: string): boolean {
  return /<table[\s>]/i.test(html);
}

export function bindPaste(editor: Editor, options: PasteOptions = {}): () => void {
  const onPaste = (event: Event): void => {
    const e = event as ClipboardEvent;
    if (editor.mode !== 'design') return;

    const data = e.clipboardData;
    if (!data) return;

    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    if (!html && !text) return;

    // Obrázek ve schránce si jinak bere plugin obrázků; ten si událost zruší
    // sám. Kontroluje se typ, ne jen počet souborů: Word posílá zároveň
    // obrázek i HTML a bez toho by se vložilo obojí.
    //
    // Excel a Sheets ale posílají obrázek vždycky — je to náhled zkopírované
    // oblasti. Kdyby platila jen ta první úvaha, skončila by každá tabulka
    // z Excelu v obsahu jako obrázek, se kterým už nikdo nic neudělá. Když
    // v HTML tabulka je, má přednost ona a plugin obrázků se ke slovu nedostane.
    if (Array.from(data.files).some((f) => f.type.startsWith('image/'))) {
      if (!hasTable(html)) return;
      e.stopImmediatePropagation();
    }

    e.preventDefault();

    const plainOnly = editor.pastePlainNext;
    editor.pastePlainNext = false;

    if (plainOnly || !html) {
      editor.insertHTML(textToHtml(text, options));
      return;
    }

    const result = cleanPastedHtml(html, editor.document, options);
    if (result.removed.length > 0) {
      editor.dispatch('pasteclean', { source: result.source, removed: result.removed });
    }
    editor.insertHTML(result.html);
  };

  const onKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;
    // Ctrl+Shift+V vloží jako čistý text. Vlajka se přečte v obsluze vkládání,
    // protože samotné stisknutí zkratky ještě žádná data ze schránky nedá.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
      editor.pastePlainNext = true;
    }
  };

  const onDrop = (event: Event): void => {
    const e = event as DragEvent;
    if (editor.mode !== 'design') return;

    const data = e.dataTransfer;
    if (!data) return;

    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    if (!html && !text) return;

    if (Array.from(data.files).some((f) => f.type.startsWith('image/'))) {
      if (!hasTable(html)) return;
      e.stopImmediatePropagation();
    }

    e.preventDefault();
    const result = html
      ? cleanPastedHtml(html, editor.document, options).html
      : textToHtml(text, options);
    editor.insertHTML(result);
  };

  editor.root.addEventListener('paste', onPaste);
  editor.root.addEventListener('keydown', onKeyDown);
  editor.root.addEventListener('drop', onDrop);

  return () => {
    editor.root.removeEventListener('paste', onPaste);
    editor.root.removeEventListener('keydown', onKeyDown);
    editor.root.removeEventListener('drop', onDrop);
  };
}
