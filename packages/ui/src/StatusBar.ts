import type { Editor } from '@nibble/core';

/**
 * Stavový řádek.
 *
 * Vlevo cesta k prvku pod kurzorem, vpravo místo pro údaje pluginů (počet
 * slov), v rohu úchyt pro změnu velikosti.
 *
 * Cesta není ozdoba: v cizím HTML — a to je v cílovém projektu skoro všechno — bývá
 * `<span>` ve `<span>` uvnitř `<h4>` v buňce tabulky, a bez cesty uživatel
 * netuší, čeho se jeho úprava vlastně týká. Kliknutím se navíc dá vybrat celý
 * prvek, což je nejrychlejší způsob, jak se zbavit obalu, o kterém nevíte.
 */

export interface StatusBarHandle {
  element: HTMLElement;
  setStatus(name: string, text: string | null): void;
  destroy(): void;
}

/** Cesta od kořene k prvku pod kurzorem. */
function pathTo(node: Node | null, root: Element): Element[] {
  const out: Element[] = [];
  let cur: Node | null = node;

  while (cur && cur !== root) {
    if (cur.nodeType === 1) out.unshift(cur as Element);
    cur = cur.parentNode;
  }

  return out;
}

export function buildStatusBar(editor: Editor, host: HTMLElement): StatusBarHandle {
  const doc = editor.root.ownerDocument;

  const bar = doc.createElement('div');
  bar.className = 'nb-statusbar';

  const path = doc.createElement('div');
  path.className = 'nb-path';
  path.setAttribute('role', 'status');
  path.setAttribute('aria-label', 'Cesta k prvku');

  const slots = doc.createElement('div');
  slots.className = 'nb-status-slots';

  bar.append(path, slots);

  const renderPath = (): void => {
    const range = editor.selection.getRange();
    const chain = range ? pathTo(range.startContainer, editor.root) : [];

    path.replaceChildren();

    chain.forEach((element, index) => {
      if (index > 0) {
        const sep = doc.createElement('span');
        sep.className = 'nb-path-sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '›';
        path.appendChild(sep);
      }

      const step = doc.createElement('button');
      step.type = 'button';
      step.className = 'nb-path-step';
      step.textContent = element.tagName.toLowerCase();
      step.title = 'Vybrat celý prvek';

      // mousedown, ne click: kliknutí by nejdřív sebralo výběr, který
      // vzápětí nastavujeme.
      step.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const selection = doc.createRange();
        selection.selectNodeContents(element);
        editor.focus();
        editor.selection.setRange(selection);
      });

      path.appendChild(step);
    });
  };

  renderPath();
  const offSelection = editor.on('selectionchange', renderPath);
  const offChange = editor.on('change', renderPath);

  host.appendChild(bar);

  return {
    element: bar,

    setStatus(name, text) {
      let slot = slots.querySelector<HTMLElement>('[data-status="' + name + '"]');

      if (text === null) { slot?.remove(); return; }

      if (!slot) {
        slot = doc.createElement('span');
        slot.className = 'nb-status';
        slot.dataset.status = name;
        slots.appendChild(slot);
      }
      slot.textContent = text;
    },

    destroy() {
      offSelection();
      offChange();
      bar.remove();
    },
  };
}

/**
 * Změna velikosti tažením za pravý dolní roh.
 *
 * Úchyt je vlastní prvek, ne `resize: both` na obalu: CSS resize by zapsalo
 * rozměry inline a nastavení uživatele by se s nimi rozešlo. Takhle jde
 * výsledek rovnou uložit — což je taky celý smysl posledního `done`: během
 * tažení se rozměr jen ukazuje, teprve po puštění se zapíše do nastavení.
 */
export function bindResizeGrip(
  bar: HTMLElement,
  shell: HTMLElement,
  onResize: (width: number, height: number, done: boolean) => void,
): () => void {
  const doc = shell.ownerDocument;

  const grip = doc.createElement('div');
  grip.className = 'nb-grip';
  grip.setAttribute('aria-hidden', 'true');
  grip.title = 'Táhnutím změníte velikost';
  bar.appendChild(grip);

  let start: { x: number; y: number; width: number; height: number } | null = null;
  let last: { width: number; height: number } | null = null;

  const onPointerDown = (event: Event): void => {
    const e = event as PointerEvent;
    e.preventDefault();

    const box = shell.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY, width: box.width, height: box.height };
    last = null;
    grip.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (event: Event): void => {
    if (!start) return;
    const e = event as PointerEvent;

    last = {
      width: Math.max(240, start.width + (e.clientX - start.x)),
      height: Math.max(140, start.height + (e.clientY - start.y)),
    };
    onResize(last.width, last.height, false);
  };

  const onPointerUp = (): void => {
    // Samotné kliknutí do rohu není změna velikosti — zapisovat by se nemělo nic.
    if (start && last) onResize(last.width, last.height, true);
    start = null;
    last = null;
  };

  grip.addEventListener('pointerdown', onPointerDown);
  grip.addEventListener('pointermove', onPointerMove);
  grip.addEventListener('pointerup', onPointerUp);
  grip.addEventListener('pointercancel', onPointerUp);

  return () => grip.remove();
}
