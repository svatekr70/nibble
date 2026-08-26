import {
  ALL_GLYPHS, glyphsInCategory, filterGlyphs,
  type DialogField, type GlyphCategory, type GlyphEntry,
} from '@nibble/core';

/**
 * Mřížka pojmenovaných znaků — emotikony i mapa znaků.
 *
 * Jedno vykreslení pro obojí. Výběr smajlíka a výběr `©` je tatáž úloha:
 * najdi v pár stech položkách tu jednu a vlož ji. Liší se jen tím, co je
 * v seznamu a jakým písmem se políčka vysází, a to je málo na dvě obsluhy
 * kláves, dvě mřížky a dvoje hledání.
 *
 * Není to samostatný popover, ale pole dialogu — proto tady není `<dialog>`
 * ani obsluha zavírání. Výběr je totiž jediná věc, kterou dialog obsahuje,
 * a kdyby si otevíral vlastní okno, měl by editor dvě různá modální okna,
 * která se chovají každé jinak. Takhle se past na fokus, Escape i uložení
 * a obnovení výběru řeší jednou pro všechny dialogy.
 *
 * Seznam se předává zvenčí, z pluginu. Kdyby ležel tady, byl by v balíčku
 * i pro toho, kdo si mřížku nikdy neotevře.
 */

/**
 * Pevný počet sloupců, ne `auto-fill`.
 *
 * Šipky nahoru a dolů musí skočit o řádek, a k tomu je potřeba vědět, kolik
 * je sloupců. Dopočítávat to z rozměrů políčka jde, ale rozbije se to při
 * každé změně velikosti písma v hostitelské stránce — pevné číslo drží.
 */
const COLS = 9;

export interface GlyphFieldHandle {
  element: HTMLElement;
  /** Skryté pole, ve kterém stojí vybraný znak. Čte ho `readValue`. */
  input: HTMLInputElement;
}

interface Tile {
  button: HTMLButtonElement;
  entry: GlyphEntry;
}

/**
 * Kód znaku, jak se píše v dokumentaci — `U+00A9`.
 *
 * Jen u mapy znaků a jen u těch, které stojí na jediném kódovém bodu.
 * U složeného emoji by z toho byl řetěz čtyř čísel, který nikomu nic neřekne.
 */
function codeLabel(char: string): string {
  const points = Array.from(char);
  if (points.length !== 1) return '';
  return 'U+' + points[0]!.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
}

export function buildGlyphField(doc: Document, field: DialogField): GlyphFieldHandle {
  const all = field.glyphs ?? [];
  const categories = field.categories ?? [];
  const chars = field.type === 'chars';

  const element = doc.createElement('div');
  // Sazba políček je jediné, čím se oba druhy liší. Emoji chtějí barevné
  // písmo, mapa znaků naopak to, kterým se vysází obsah.
  element.className = 'nb-glyphs nb-glyphs-' + (chars ? 'chars' : 'emoji');

  const input = doc.createElement('input');
  input.type = 'hidden';
  input.name = field.name;
  input.value = all[0]?.char ?? '';

  // ---- kategorie

  const cats = doc.createElement('div');
  cats.className = 'nb-glyphs-cats';
  cats.setAttribute('role', 'tablist');
  cats.setAttribute('aria-orientation', 'vertical');
  cats.setAttribute('aria-label', 'Kategorie');

  let category = ALL_GLYPHS;
  const catButtons = new Map<string, HTMLButtonElement>();

  const addCategory = (item: GlyphCategory): void => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'nb-glyphs-cat';
    button.textContent = item.label;
    button.dataset.key = item.key;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(item.key === category));
    button.addEventListener('click', () => selectCategory(item.key));
    cats.appendChild(button);
    catButtons.set(item.key, button);
  };

  addCategory({ key: ALL_GLYPHS, label: 'Vše' });
  for (const item of categories) addCategory(item);

  // ---- hledání

  const main = doc.createElement('div');
  main.className = 'nb-glyphs-main';

  const searchWrap = doc.createElement('div');
  searchWrap.className = 'nb-glyphs-search';

  const searchId = 'nb-f-' + field.name + '-q';
  const searchLabel = doc.createElement('label');
  searchLabel.htmlFor = searchId;
  searchLabel.textContent = 'Hledat';

  const search = doc.createElement('input');
  search.type = 'search';
  search.id = searchId;
  search.className = 'nb-input';
  search.autocomplete = 'off';
  search.placeholder = 'název nebo klíčové slovo';

  searchWrap.append(searchLabel, search);

  // ---- mřížka

  const grid = doc.createElement('div');
  grid.className = 'nb-glyphs-grid';
  grid.setAttribute('role', 'listbox');
  grid.setAttribute('aria-label', 'Emotikony');

  const caption = doc.createElement('div');
  caption.className = 'nb-glyphs-caption';
  caption.setAttribute('role', 'status');

  main.append(searchWrap, grid, caption);
  element.append(cats, main, input);

  let tiles: Tile[] = [];
  let active = -1;

  /** Zapíše vybraný znak do skrytého pole a napíše, co to je. */
  const highlight = (index: number): void => {
    const tile = tiles[index];
    if (!tile) return;

    tiles[active]?.button.setAttribute('tabindex', '-1');
    tiles[active]?.button.setAttribute('aria-selected', 'false');

    active = index;
    tile.button.setAttribute('tabindex', '0');
    tile.button.setAttribute('aria-selected', 'true');
    input.value = tile.entry.char;

    const code = chars ? codeLabel(tile.entry.char) : '';
    caption.textContent = code ? tile.entry.name + ' · ' + code : tile.entry.name;
  };

  const focusTile = (index: number): void => {
    const next = Math.max(0, Math.min(index, tiles.length - 1));
    highlight(next);
    tiles[next]?.button.focus();
  };

  /**
   * Vybrané se vkládá hned, jedním kliknutím.
   *
   * Odeslání formuláře řeší dialog: `requestSubmit()` projde kontrolou
   * i obsluhou `submit`, na rozdíl od `submit()`, který by ji přeskočil.
   */
  const pick = (index: number): void => {
    highlight(index);
    element.closest('form')?.requestSubmit();
  };

  const render = (list: readonly GlyphEntry[]): void => {
    grid.replaceChildren();
    tiles = [];
    active = -1;

    if (list.length === 0) {
      const empty = doc.createElement('p');
      empty.className = 'nb-glyphs-empty';
      empty.textContent = 'Nic takového tu není.';
      grid.appendChild(empty);
      caption.textContent = '';
      // Prázdné pole by při odeslání vložilo nic; příkaz to pozná a mlčí.
      input.value = '';
      return;
    }

    const frag = doc.createDocumentFragment();

    for (const entry of list) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'nb-glyphs-tile';
      button.textContent = entry.display ?? entry.char;
      // Náhrada za neviditelný znak se musí poznat od znaku samotného, jinak
      // by uživatel čekal, že se do textu vloží zrovna ta šipka nebo tečka.
      if (entry.display) button.classList.add('nb-glyphs-tile-stand-in');
      button.title = entry.name;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-label', entry.name);
      button.setAttribute('aria-selected', 'false');
      button.setAttribute('tabindex', '-1');

      const index = tiles.length;
      // mousedown, ne click: políčko se tím nemusí nejdřív zaostřit, takže
      // kurzor zůstane v hledání a `pick` odešle přesně to, na co se kliklo.
      button.addEventListener('mousedown', (event) => { event.preventDefault(); pick(index); });
      button.addEventListener('focus', () => highlight(index));

      frag.appendChild(button);
      tiles.push({ button, entry });
    }

    grid.appendChild(frag);
    highlight(0);
  };

  const refresh = (): void => {
    const query = search.value.trim();
    // Hledá se přes všechno, ne jen v otevřené kategorii. Kdo napíše „auto“
    // v jídle, chce auto — ne prázdnou mřížku a domýšlet si proč.
    render(query
      ? filterGlyphs(all, query)
      : glyphsInCategory(all, category));
  };

  function markCategory(key: string): void {
    category = key;
    for (const [name, button] of catButtons) {
      button.setAttribute('aria-selected', String(name === key));
    }
  }

  function selectCategory(key: string): void {
    markCategory(key);
    // Kategorie a hledání si nemohou odporovat: kliknutí do seznamu vlevo
    // znamená „ukaž mi tohle“, takže se dotaz zahodí.
    search.value = '';
    refresh();
  }

  // Hledání přepne seznam vlevo na „Vše“, protože se hledá přes všechno.
  // Zvýraznit dál kategorii, ve které výsledky nejsou, by lhalo.
  search.addEventListener('input', () => {
    if (search.value.trim()) markCategory(ALL_GLYPHS);
    refresh();
  });

  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusTile(0);
      return;
    }
    // Enter v hledání by odeslal formulář s tím, co zbylo v skrytém poli.
    // Vkládá se proto první nalezené — to je i to, co je vidět zvýrazněné.
    if (event.key === 'Enter') {
      event.preventDefault();
      if (tiles.length > 0) pick(active < 0 ? 0 : active);
    }
  });

  grid.addEventListener('keydown', (event) => {
    const step: Record<string, number> = {
      ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS,
    };

    if (event.key in step) {
      event.preventDefault();
      // Z prvního řádku nahoru se jde zpátky do hledání — je to jediná cesta
      // ven z mřížky, která nevyžaduje myš.
      if (event.key === 'ArrowUp' && active < COLS) { search.focus(); return; }
      focusTile(active + step[event.key]!);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusTile(event.key === 'Home' ? 0 : tiles.length - 1);
      return;
    }

    // Políčko je `type="button"`, takže Enter formulář sám neodešle — a mít
    // pod ním `type="submit"` by znamenalo, že mřížku odešle i mezerník
    // omylem stisknutý při rolování.
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (active >= 0) pick(active);
    }
  });

  refresh();
  return { element, input };
}
