import type { Plugin } from '@nibble/core';

/**
 * Úchyt pro přesun bloku.
 *
 * Pointer events, ne nativní drag & drop: tažení textu už obsluhuje
 * `Paste.ts` a dva systémy přes sebe by si braly události. Blok se přesouvá
 * celý a beze změny — jen `insertBefore` — takže nedotčený obsah v něm zůstane
 * znak po znaku stejný.
 */

/** Mezera 0…n, do které dopadne blok puštěný ve výšce `y` (polovina bloku rozhoduje). */
export function dropIndex(edges: readonly { top: number; bottom: number }[], y: number): number {
  for (let i = 0; i < edges.length; i++) {
    const { top, bottom } = edges[i]!;
    if (y < (top + bottom) / 2) return i;
  }
  return edges.length;
}

/** Puštění těsně nad nebo pod sebou je návrat na původní místo. */
export function isNoopMove(from: number, to: number): boolean {
  return to === from || to === from + 1;
}

export const dragHandle: Plugin = {
  name: 'dragHandle',

  setup(editor) {
    const doc = editor.document;
    const win = doc.defaultView;
    // Na dotyku není „najetí myší“ a úchyt by jen překážel prstu.
    if (!win || win.matchMedia?.('(pointer: coarse)').matches) return;

    const root = editor.root;
    // Úchyt i čára patří do rodiče (`.nb-surface`), nikdy do `contenteditable`:
    // tam by je viděl `getHTML()` i kurzor.
    const host = (): HTMLElement | null => root.parentElement;

    const handle = doc.createElement('button');
    handle.type = 'button';
    handle.className = 'nb-drag-handle';
    handle.title = 'Přetáhnout blok';
    handle.setAttribute('aria-label', 'Přetáhnout blok');
    handle.tabIndex = -1;
    handle.hidden = true;
    handle.textContent = '⠿';

    const line = doc.createElement('div');
    line.className = 'nb-drop-line';
    line.hidden = true;

    let current: Element | null = null;
    let drag: { block: Element; from: number; to: number; moved: boolean; startY: number } | null = null;

    // Jen prvky: bílé textové uzly mezi bloky zůstanou, kde jsou. A jen
    // blokové: starší obsah mívá `<b>` nebo `<img>` přímo v kořeni a takový
    // prvek je kus věty — přesunem by se z ní vytrhl.
    const isDraggable = (el: Element): boolean => {
      const display = win.getComputedStyle(el).display;
      return display !== 'inline' && display !== 'inline-block' && display !== 'contents';
    };
    const blocks = (): Element[] => Array.from(root.children).filter(isDraggable);

    const hide = (): void => {
      handle.hidden = true;
      current = null;
    };

    const place = (block: Element): void => {
      const parent = host();
      if (!parent) return;
      if (!handle.isConnected) parent.append(handle, line);
      const base = parent.getBoundingClientRect();
      const box = block.getBoundingClientRect();
      const rootBox = root.getBoundingClientRect();
      handle.style.top = Math.round(box.top - base.top + parent.scrollTop) + 'px';
      handle.style.left = Math.round(rootBox.left - base.left) + 'px';
      handle.hidden = false;
      current = block;
    };

    const onMouseMove = (event: Event): void => {
      if (drag || editor.mode !== 'design') return;
      let node = event.target as Node | null;
      while (node && node.parentNode !== root) node = node.parentNode;
      if (!node || node.nodeType !== 1) return;
      if (!isDraggable(node as Element)) { hide(); return; }
      if (node !== current || handle.hidden) place(node as Element);
    };

    const onLeave = (event: Event): void => {
      if (drag) return;
      const to = (event as MouseEvent).relatedTarget as Node | null;
      if (to && (to === handle || root.contains(to))) return;
      hide();
    };

    // Psaní posouvá bloky, takže úchyt by stál vedle jiného místa. Klávesy se
    // jinak nechávají být — patří ostatním pluginům.
    const onKeyDown = (): void => {
      if (!drag) hide();
    };

    // Escape během tažení se poslouchá na celém dokumentu: stisk úchytu fokus
    // nepřesouvá, takže editor ho mít nemusí a na kořen by klávesa nedošla.
    const onDragKeyDown = (event: KeyboardEvent): void => {
      if (!drag || event.key !== 'Escape') return;
      event.preventDefault();
      finish(false);
    };

    const showLine = (to: number): void => {
      const parent = host();
      const list = blocks();
      if (!parent || !list.length) return;
      const base = parent.getBoundingClientRect();
      const y = to < list.length
        ? list[to]!.getBoundingClientRect().top
        : list[list.length - 1]!.getBoundingClientRect().bottom;
      const rootBox = root.getBoundingClientRect();
      line.style.top = Math.round(y - base.top + parent.scrollTop - 1) + 'px';
      line.style.left = Math.round(rootBox.left - base.left) + 'px';
      line.style.width = Math.round(rootBox.width) + 'px';
      line.hidden = false;
    };

    const finish = (commit: boolean): void => {
      const state = drag;
      drag = null;
      doc.removeEventListener('keydown', onDragKeyDown, true);
      line.hidden = true;
      handle.classList.remove('nb-dragging');
      // Zrušené tažení (Escape, pointercancel) nemá nic označit ani přesunout.
      if (!state || !commit) return;

      if (!state.moved) {
        // Klik bez tažení označí celý blok — rychlá cesta ke smazání nebo kopii.
        const range = doc.createRange();
        range.selectNode(state.block);
        editor.focus();
        editor.selection.setRange(range);
        return;
      }
      if (isNoopMove(state.from, state.to)) return;

      const list = blocks();
      root.insertBefore(state.block, list[state.to] ?? null);
      const range = doc.createRange();
      range.selectNodeContents(state.block);
      range.collapse(true);
      editor.focus();
      editor.selection.setRange(range);
      editor.commit('move');
      place(state.block);
    };

    const onPointerDown = (event: Event): void => {
      const e = event as PointerEvent;
      if (!current || e.button !== 0 || editor.mode !== 'design') return;
      const from = blocks().indexOf(current);
      if (from < 0) return;
      // Bez toho by prohlížeč začal označovat text a vzal editoru fokus.
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      drag = { block: current, from, to: from, moved: false, startY: e.clientY };
      doc.addEventListener('keydown', onDragKeyDown, true);
      handle.classList.add('nb-dragging');
    };

    const onPointerMove = (event: Event): void => {
      if (!drag) return;
      const e = event as PointerEvent;
      if (!drag.moved && Math.abs(e.clientY - drag.startY) < 4) return;
      drag.moved = true;
      const edges = blocks().map((b) => {
        const r = b.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
      drag.to = dropIndex(edges, e.clientY);
      showLine(drag.to);
    };

    // Mimo režim návrhu se bloky nepřesouvají: úchyt zmizí a tažení se zruší.
    const offMode = editor.on('modechange', (payload: { mode: string }) => {
      if (payload.mode === 'design') return;
      finish(false);
      hide();
    });

    root.addEventListener('mousemove', onMouseMove);
    root.addEventListener('mouseleave', onLeave);
    root.addEventListener('keydown', onKeyDown);
    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', () => finish(true));
    handle.addEventListener('pointercancel', () => finish(false));
    handle.addEventListener('mouseleave', onLeave);

    return () => {
      finish(false);
      offMode();
      root.removeEventListener('mousemove', onMouseMove);
      root.removeEventListener('mouseleave', onLeave);
      root.removeEventListener('keydown', onKeyDown);
      handle.remove();
      line.remove();
    };
  },
};
