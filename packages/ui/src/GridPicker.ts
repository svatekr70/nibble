/**
 * Mřížka pro volbu rozměru tabulky.
 *
 * Rozměr se vybírá okem, ne dvěma čísly v dialogu: člověk vidí, jak velká
 * tabulka mu vznikne, a nemusí si to představovat. Mřížka se přitom sama
 * rozrůstá — jakmile najedete do posledního řádku nebo sloupce, přibude další,
 * takže pevný strop není vidět, dokud se do něj nenarazí.
 *
 * Dialog s plným nastavením zůstává pod mřížkou. Kdo potřebuje záhlaví nebo
 * přesná čísla, dojde si tam; ostatní vyberou rozměr jedním tahem.
 */

export interface GridPickerOptions {
  maxRows?: number;
  maxCols?: number;
  /** Kolik políček ukázat na začátku. */
  startRows?: number;
  startCols?: number;
  onPick: (rows: number, cols: number) => void;
  more?: { label: string; onAction: () => void };
}

export function openGridPicker(
  anchor: HTMLElement,
  options: GridPickerOptions,
): () => void {
  const doc = anchor.ownerDocument;
  doc.querySelectorAll('.nb-grid').forEach((old) => old.remove());

  const maxRows = options.maxRows ?? 10;
  const maxCols = options.maxCols ?? 10;

  let shownRows = Math.min(options.startRows ?? 5, maxRows);
  let shownCols = Math.min(options.startCols ?? 5, maxCols);
  let rows = 0;
  let cols = 0;

  const box = doc.createElement('div');
  box.className = 'nb-grid';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Rozměr tabulky');

  const table = doc.createElement('div');
  table.className = 'nb-grid-cells';
  table.setAttribute('role', 'grid');

  const label = doc.createElement('div');
  label.className = 'nb-grid-label';
  label.setAttribute('role', 'status');

  const cells: HTMLElement[] = [];

  const paint = (): void => {
    table.style.gridTemplateColumns = 'repeat(' + shownCols + ', 16px)';
    label.textContent = rows > 0 ? rows + ' × ' + cols : 'Vyberte rozměr';

    for (const cell of cells) {
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      cell.hidden = r > shownRows || c > shownCols;
      cell.classList.toggle('is-on', r <= rows && c <= cols);
    }
  };

  const build = (): void => {
    for (let r = 1; r <= maxRows; r++) {
      for (let c = 1; c <= maxCols; c++) {
        const cell = doc.createElement('button');
        cell.type = 'button';
        cell.className = 'nb-grid-cell';
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.tabIndex = -1;
        cell.setAttribute('aria-label', r + ' × ' + c);

        cell.addEventListener('mouseenter', () => {
          rows = r;
          cols = c;

          // Mřížka se rozrůstá pod rukou — na kraji přibude řada.
          if (r === shownRows && shownRows < maxRows) shownRows++;
          if (c === shownCols && shownCols < maxCols) shownCols++;
          paint();
        });

        cell.addEventListener('click', () => { options.onPick(r, c); close(); });

        table.appendChild(cell);
        cells.push(cell);
      }
    }
  };

  build();
  box.append(table, label);

  if (options.more) {
    const more = doc.createElement('button');
    more.type = 'button';
    more.className = 'nb-grid-more';
    more.textContent = options.more.label;
    more.addEventListener('click', () => { options.more!.onAction(); close(); });
    box.appendChild(more);
  }

  doc.body.appendChild(box);
  paint();

  const anchorBox = anchor.getBoundingClientRect();
  box.style.left = window.scrollX + Math.max(8, Math.min(
    anchorBox.left, window.innerWidth - box.offsetWidth - 8,
  )) + 'px';
  box.style.top = window.scrollY + anchorBox.bottom + 4 + 'px';

  const onPointerDown = (event: Event): void => {
    const target = event.target as Node;
    if (!box.contains(target) && !anchor.contains(target)) close();
  };
  const onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key === 'Escape') { event.preventDefault(); close(); }
  };

  setTimeout(() => doc.addEventListener('pointerdown', onPointerDown), 0);
  doc.addEventListener('keydown', onKeyDown);

  function close(): void {
    doc.removeEventListener('pointerdown', onPointerDown);
    doc.removeEventListener('keydown', onKeyDown);
    box.remove();
  }

  return close;
}
