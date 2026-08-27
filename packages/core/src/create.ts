import { Editor } from './Editor.js';
import type { NibbleConfig } from './types.js';

function resolveTarget(target: NibbleConfig['target']): HTMLElement {
  if (typeof target !== 'string') return target;
  const found = document.querySelector(target);
  if (!found) throw new Error('Nibble: cíl "' + target + '" na stránce není.');
  return found as HTMLElement;
}

/**
 * Připraví editor. Textarea se nahradí editovatelnou oblastí a její obsah
 * se převezme jako výchozí — díky tomu stačí u stávajících formulářů vyměnit
 * jeden řádek a odesílání zůstane, jak bylo.
 */
export async function create(config: NibbleConfig): Promise<Editor> {
  const target = resolveTarget(config.target);

  let host = target;
  let textarea: HTMLTextAreaElement | null = null;

  if (target.tagName === 'TEXTAREA') {
    textarea = target as HTMLTextAreaElement;
    host = target.ownerDocument.createElement('div');
    textarea.parentNode?.insertBefore(host, textarea);
    textarea.style.display = 'none';
  }

  const content = config.content ?? (textarea ? textarea.value : host.innerHTML);

  // Jméno pole je nejlepší klíč zálohy, jaký na stránce je — `id` hostitele
  // bývá generované, `name` ve formuláři ne.
  const named = textarea?.name || textarea?.id || host.id;
  if (named) host.dataset.nibbleName = named;

  const editor = new Editor(host, { ...config, target: host, content });

  if (textarea) {
    // Textarea zůstává zdrojem pravdy pro odeslání formuláře.
    editor.on('change', () => { textarea!.value = editor.getHTML(); });
    textarea.form?.addEventListener('submit', () => {
      textarea!.value = editor.getHTML();
      // Text jde do databáze, pojistka doslouží. Bez tohohle by se rozepsaná
      // verze nabízela znovu i po úspěšném uložení.
      editor.autosave?.discard();
    });
  }

  return editor;
}

export const Nibble = { create };
