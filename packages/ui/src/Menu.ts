import type { MenuItem } from '@nibble/core';

/**
 * Rozbalovací nabídka s náhledem.
 *
 * Nativní `<select>` by stačil na druh bloku, ale ne na písmo: `<option>` se
 * napříč systémy nedá spolehlivě vysázet jeho vlastním písmem, a právě to je
 * u výběru písma to podstatné — člověk si vybírá okem, ne podle názvu.
 *
 * Ovládání odpovídá vzoru ARIA `listbox`: šipky posouvají, Home a End skáčou
 * na kraj, Enter potvrdí, Escape zavře a fokus se vrátí na spouštěč.
 */

export interface MenuOptions {
  items: readonly MenuItem[];
  current: string | null;
  /** Porovnání hodnoty položky s aktuálním stavem. */
  matches?: (itemValue: string, current: string) => boolean;
  onPick: (value: string) => void;
  /** Zavolá se při otevření — třeba aby se stáhla písma pro náhled. */
  onOpen?: () => void;
}

export function openMenu(anchor: HTMLElement, options: MenuOptions): () => void {
  const doc = anchor.ownerDocument;
  doc.querySelectorAll('.nb-menu').forEach((old) => old.remove());

  options.onOpen?.();

  const menu = doc.createElement('div');
  menu.className = 'nb-menu';
  menu.setAttribute('role', 'listbox');
  menu.tabIndex = -1;

  const same = options.matches ?? ((a: string, b: string) => a === b);
  const buttons: HTMLButtonElement[] = [];
  let activeIndex = 0;

  options.items.forEach((item, index) => {
    if (item.separator && index > 0) {
      const line = doc.createElement('div');
      line.className = 'nb-menu-sep';
      line.setAttribute('aria-hidden', 'true');
      menu.appendChild(line);
    }

    const selected = options.current !== null && same(item.value, options.current);
    if (selected) activeIndex = buttons.length;

    const option = doc.createElement('button');
    option.type = 'button';
    option.className = 'nb-menu-item';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(selected));
    option.tabIndex = -1;
    option.dataset.value = item.value;

    const label = doc.createElement('span');
    label.className = 'nb-menu-label';
    label.textContent = item.label;
    for (const [property, value] of Object.entries(item.style ?? {})) {
      label.style.setProperty(property, value);
    }

    const tick = doc.createElement('span');
    tick.className = 'nb-menu-tick';
    tick.setAttribute('aria-hidden', 'true');
    tick.textContent = selected ? '✓' : '';

    option.append(label, tick);
    option.addEventListener('click', () => { options.onPick(item.value); close(); });

    menu.appendChild(option);
    buttons.push(option);
  });

  doc.body.appendChild(menu);

  // Umístění pod spouštěč; když se nabídka nevejde dolů, vyklopí se nahoru.
  const box = anchor.getBoundingClientRect();
  const height = menu.offsetHeight;
  const below = window.innerHeight - box.bottom;

  menu.style.minWidth = Math.max(box.width, 160) + 'px';
  menu.style.left = window.scrollX + Math.max(8, Math.min(
    box.left, window.innerWidth - menu.offsetWidth - 8,
  )) + 'px';
  menu.style.top = (below < height && box.top > height
    ? window.scrollY + box.top - height - 4
    : window.scrollY + box.bottom + 4) + 'px';

  /**
   * Přesun po položkách.
   *
   * `preventScroll` a ruční nastavení `scrollTop` schválně: `focus()` i
   * `scrollIntoView()` by odrolovaly celou stránku, protože nabídka visí
   * v `<body>`. Uživateli by se pod rukama posunul dokument jen proto,
   * že rozbalil nabídku.
   */
  const focusAt = (index: number): void => {
    activeIndex = (index + buttons.length) % buttons.length;

    const active = buttons[activeIndex];
    if (!active) return;

    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < menu.scrollTop) menu.scrollTop = top;
    else if (bottom > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = bottom - menu.clientHeight;
    }

    active.focus({ preventScroll: true });
  };

  const onKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;
    const keys: Record<string, () => void> = {
      ArrowDown: () => focusAt(activeIndex + 1),
      ArrowUp: () => focusAt(activeIndex - 1),
      Home: () => focusAt(0),
      End: () => focusAt(buttons.length - 1),
      Escape: () => { close(); anchor.focus(); },
    };

    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  };

  const onPointerDown = (event: Event): void => {
    const target = event.target as Node;
    if (!menu.contains(target) && !anchor.contains(target)) close();
  };

  menu.addEventListener('keydown', onKeyDown);
  setTimeout(() => doc.addEventListener('pointerdown', onPointerDown), 0);

  function close(): void {
    doc.removeEventListener('pointerdown', onPointerDown);
    menu.remove();
  }

  focusAt(activeIndex);

  return close;
}
