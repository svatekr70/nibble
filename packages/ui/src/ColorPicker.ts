/**
 * Výběr barvy.
 *
 * Dva listy, stejně jako to má Lattice v cílovém projektu — lidé to tam znají a nemá
 * smysl je učit něco jiného:
 *
 *  - **Kolo** — hexagonální mřížka, kde úhel je odstín a vzdálenost od středu
 *    sytost; jezdec pod ním řídí jas. Odstín se hledá okem, ne číslem.
 *  - **Palety** — hotové barvy pro případ, kdy má být text prostě červený,
 *    plus systémový výběr barvy pro cokoli přesného.
 *
 * K tomu naposledy použité barvy a „Bez barvy". Nic z toho není objev; smysl
 * je v tom, že se to chová jako zbytek aplikace.
 */

export interface ColorPickerOptions {
  title: string;
  /** Barva, která je nastavená teď — předvyplní vlastní výběr. */
  current?: string | null;
  swatches?: ReadonlyArray<{ color: string; label: string }>;
  onPick: (color: string) => void;
  onClear: () => void;
}

/** Výchozí paleta. Sytá řada pro důraz, světlá pro decentní podbarvení. */
export const DEFAULT_SWATCHES: ReadonlyArray<{ color: string; label: string }> = [
  { color: '#1f5f5b', label: 'Petrolejová' },
  { color: '#0d6efd', label: 'Modrá' },
  { color: '#198754', label: 'Zelená' },
  { color: '#dc3545', label: 'Červená' },
  { color: '#fd7e14', label: 'Oranžová' },
  { color: '#6f42c1', label: 'Fialová' },
  { color: '#6c757d', label: 'Šedá' },
  { color: '#212529', label: 'Černá' },
  { color: '#d1e7dd', label: 'Zelená světlá' },
  { color: '#cfe2ff', label: 'Modrá světlá' },
  { color: '#f8d7da', label: 'Červená světlá' },
  { color: '#fff3cd', label: 'Žlutá světlá' },
  { color: '#e2e3e5', label: 'Šedá světlá' },
  { color: '#cff4fc', label: 'Tyrkysová světlá' },
  { color: '#ede7f6', label: 'Fialová světlá' },
  { color: '#ffffff', label: 'Bílá' },
];

const RECENT_KEY = 'nibble:recent-colors';
const RECENT_MAX = 10;

function loadRecents(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function rememberColor(color: string): void {
  try {
    const list = loadRecents().filter((c) => c.toLowerCase() !== color.toLowerCase());
    list.unshift(color);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // Soukromé okno nebo plná kvóta — historie barev není nic, kvůli čemu padat.
  }
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0; let g = 0; let b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }

  return '#' + [r, g, b]
    .map((n) => Math.round((n + m) * 255).toString(16).padStart(2, '0'))
    .join('');
}

/** Cokoli, co prohlížeč umí vypsat, na #rrggbb — kvůli `<input type="color">`. */
export function toHex(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
  if (short) return ('#' + short[1]! + short[1]! + short[2]! + short[2]! + short[3]! + short[3]!).toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(trimmed);
  if (!rgb) return null;

  const parts = rgb[1]!.split(',').map((n) => parseFloat(n));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;

  return '#' + parts.slice(0, 3)
    .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hexagonální kolo v SVG.
 *
 * Šestiúhelníky se skládají v osových souřadnicích: `q` a `r` dávají pozici,
 * jejich vzdálenost od středu sytost a úhel odstín. Jezdec jasu přebarví celé
 * kolo naráz, takže je hned vidět, co se vybírá.
 */
function buildWheel(size: number, doc: Document, onPick: (hex: string) => void) {
  const RINGS = 6;
  const hexR = size / (2 * (1.5 * RINGS + 1));
  const centre = size / 2;
  const NS = 'http://www.w3.org/2000/svg';

  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('class', 'nb-wheel');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Barevné kolo');

  const cells: Array<{ poly: SVGPolygonElement; hue: number; sat: number }> = [];
  let value = 1;

  for (let q = -RINGS; q <= RINGS; q++) {
    for (let r = Math.max(-RINGS, -q - RINGS); r <= Math.min(RINGS, -q + RINGS); r++) {
      const px = centre + hexR * 1.5 * q;
      const py = centre + hexR * Math.sqrt(3) * (r + q / 2);
      const sat = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 / RINGS;
      const hue = (Math.atan2(py - centre, px - centre) * 180 / Math.PI + 360) % 360;

      const points: string[] = [];
      for (let k = 0; k < 6; k++) {
        const angle = (Math.PI / 180) * (60 * k);
        points.push(
          (px + hexR * Math.cos(angle)).toFixed(1) + ',' + (py + hexR * Math.sin(angle)).toFixed(1),
        );
      }

      const poly = doc.createElementNS(NS, 'polygon');
      poly.setAttribute('points', points.join(' '));
      poly.setAttribute('class', 'nb-wheel-cell');
      poly.addEventListener('click', () => onPick(hsvToHex(hue, sat, value)));

      svg.appendChild(poly);
      cells.push({ poly, hue, sat });
    }
  }

  const paint = (): void => {
    for (const cell of cells) cell.poly.setAttribute('fill', hsvToHex(cell.hue, cell.sat, value));
  };
  paint();

  return {
    element: svg,
    setValue(next: number) { value = next; paint(); },
  };
}

/** Otevře popover pod kotvou. Vrátí funkci, která ho zavře. */
export function openColorPicker(
  anchor: HTMLElement,
  options: ColorPickerOptions,
): () => void {
  const doc = anchor.ownerDocument;
  doc.querySelectorAll('.nb-picker').forEach((old) => old.remove());

  const menu = doc.createElement('div');
  menu.className = 'nb-picker';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', options.title);

  const heading = doc.createElement('div');
  heading.className = 'nb-picker-title';
  heading.textContent = options.title;
  menu.appendChild(heading);

  const finish = (color: string, remember = true): void => {
    if (remember) rememberColor(color);
    options.onPick(color);
    close();
  };

  // --- listy ---
  const tabs = doc.createElement('div');
  tabs.className = 'nb-picker-tabs';
  tabs.setAttribute('role', 'tablist');

  const makeTab = (label: string, selected: boolean): HTMLButtonElement => {
    const tab = doc.createElement('button');
    tab.type = 'button';
    tab.className = 'nb-picker-tab';
    tab.textContent = label;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(selected));
    tabs.appendChild(tab);
    return tab;
  };

  const tabWheel = makeTab('Kolo', true);
  const tabPalette = makeTab('Palety', false);
  menu.appendChild(tabs);

  // --- kolo ---
  const wheelPane = doc.createElement('div');
  wheelPane.className = 'nb-picker-pane';

  const wheel = buildWheel(196, doc, (hex) => finish(hex));
  wheelPane.appendChild(wheel.element);

  const brightRow = doc.createElement('label');
  brightRow.className = 'nb-picker-bright';
  const brightLabel = doc.createElement('span');
  brightLabel.textContent = 'Jas';
  const bright = doc.createElement('input');
  bright.type = 'range';
  bright.min = '20';
  bright.max = '100';
  bright.value = '100';
  bright.addEventListener('input', () => wheel.setValue(Number(bright.value) / 100));
  brightRow.append(brightLabel, bright);
  wheelPane.appendChild(brightRow);

  menu.appendChild(wheelPane);

  // --- palety ---
  const palettePane = doc.createElement('div');
  palettePane.className = 'nb-picker-pane';
  palettePane.hidden = true;

  const grid = doc.createElement('div');
  grid.className = 'nb-picker-grid';
  for (const item of options.swatches ?? DEFAULT_SWATCHES) {
    const swatch = doc.createElement('button');
    swatch.type = 'button';
    swatch.className = 'nb-picker-swatch';
    swatch.style.background = item.color;
    swatch.title = item.label;
    swatch.setAttribute('aria-label', item.label);
    // Předvolby jsou pořád po ruce — nemá smysl jimi zaplňovat historii.
    swatch.addEventListener('click', () => finish(item.color, false));
    grid.appendChild(swatch);
  }
  palettePane.appendChild(grid);

  const customRow = doc.createElement('div');
  customRow.className = 'nb-picker-custom';

  const customLabel = doc.createElement('span');
  customLabel.textContent = 'Vlastní:';

  const custom = doc.createElement('input');
  custom.type = 'color';
  custom.className = 'nb-picker-input';
  custom.value = toHex(options.current) ?? '#1f5f5b';
  custom.setAttribute('aria-label', 'Vlastní barva');

  const apply = doc.createElement('button');
  apply.type = 'button';
  apply.className = 'nb-picker-apply';
  apply.textContent = 'Použít';
  apply.addEventListener('click', () => finish(custom.value));

  customRow.append(customLabel, custom, apply);
  palettePane.appendChild(customRow);
  menu.appendChild(palettePane);

  const swap = (toPalette: boolean): void => {
    wheelPane.hidden = toPalette;
    palettePane.hidden = !toPalette;
    tabWheel.setAttribute('aria-selected', String(!toPalette));
    tabPalette.setAttribute('aria-selected', String(toPalette));
  };
  tabWheel.addEventListener('click', () => swap(false));
  tabPalette.addEventListener('click', () => swap(true));

  // --- naposledy použité ---
  const recents = loadRecents();
  if (recents.length > 0) {
    const label = doc.createElement('div');
    label.className = 'nb-picker-recents-label';
    label.textContent = 'Naposledy použité';
    menu.appendChild(label);

    const row = doc.createElement('div');
    row.className = 'nb-picker-recents';
    for (const color of recents) {
      const swatch = doc.createElement('button');
      swatch.type = 'button';
      swatch.className = 'nb-picker-swatch nb-picker-recent';
      swatch.style.background = color;
      swatch.title = color;
      swatch.setAttribute('aria-label', 'Naposledy použitá ' + color);
      swatch.addEventListener('click', () => finish(color));
      row.appendChild(swatch);
    }
    menu.appendChild(row);
  }

  // --- bez barvy ---
  const clear = doc.createElement('button');
  clear.type = 'button';
  clear.className = 'nb-picker-clear';
  clear.textContent = 'Bez barvy';
  clear.addEventListener('click', () => { options.onClear(); close(); });
  menu.appendChild(clear);

  doc.body.appendChild(menu);

  // Umístění pod kotvu, s ohledem na okraj okna.
  const box = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(
    window.scrollX + box.left,
    window.scrollX + window.innerWidth - menu.offsetWidth - 8,
  ));
  menu.style.top = window.scrollY + box.bottom + 4 + 'px';
  menu.style.left = left + 'px';

  const onPointerDown = (event: Event): void => {
    const target = event.target as Node;
    if (!menu.contains(target) && !anchor.contains(target)) close();
  };
  const onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key === 'Escape') { event.preventDefault(); close(); }
  };

  // Až po vykreslení, jinak by menu zavřelo kliknutí, které ho otevřelo.
  setTimeout(() => doc.addEventListener('pointerdown', onPointerDown), 0);
  doc.addEventListener('keydown', onKeyDown);

  function close(): void {
    doc.removeEventListener('pointerdown', onPointerDown);
    doc.removeEventListener('keydown', onKeyDown);
    menu.remove();
  }

  tabWheel.focus();
  return close;
}
