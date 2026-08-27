/**
 * Uživatelské nastavení editoru.
 *
 * Rozvržení lišty navrhne programátor, který Nibble do projektu zasazuje —
 * a to je správně, protože ví, co ta konkrétní aplikace potřebuje. Jenže
 * uživatel u toho sedí osm hodin denně a jeho potřeby se s tím návrhem nemusí
 * potkat. Nastavení proto **přebíjí** to, co přišlo z konfigurace, ne naopak.
 *
 * Uloženému nastavení se přitom nesmí věřit slepě: je v prohlížeči uživatele,
 * může být staré půl roku a mezitím mohly přibýt nové funkce. Slučuje se proto
 * s aktuální konfigurací tak, aby nové prvky nezmizely jen proto, že o nich
 * uložená verze neví.
 */

export interface PrefItem {
  name: string;
  on: boolean;
}

export interface PrefGroup {
  id: string;
  /** První nebo druhý řádek lišty. */
  row: 'top' | 'bottom';
  items: PrefItem[];
}

export interface EditorPrefs {
  /** Prázdné = podle obsahu. Jinak libovolná délka v CSS. */
  width: string;
  height: string;
  menubar: boolean;
  /** Ovládací panel se drží u horního okraje. */
  sticky: boolean;
  statusbar: boolean;
  /** Změna velikosti tažením za pravý dolní roh. */
  resizable: boolean;
  /**
   * Zálohovat rozepsaný text do `localStorage`.
   *
   * Uživatelská volba nad rámec konfigurace. Když ji programátor vypnul
   * přes `autosave: false`, nezapne ji ani zaškrtnutí tady — editor pak
   * žádnou zálohu nemá.
   */
  autosave: boolean;
  groups: PrefGroup[];
}

export type PrefsPatch = Partial<Omit<EditorPrefs, 'groups'>> & { groups?: PrefGroup[] };

export type Layout = readonly (readonly string[])[];

export interface PrefsOptions {
  /** Pod čím se nastavení ukládá. */
  id: string;
  /** Rozvržení prvního řádku od programátora. */
  layout: Layout;
  /** Rozvržení druhého řádku. Málokdy — ale vygenerovaná konfigurace ho umí. */
  bottomLayout?: Layout;
  defaults?: Partial<EditorPrefs>;
  /** Prvky, které nikdo nepřihlásil, se do nastavení nedostanou. */
  known: (name: string) => boolean;
}

export const DEFAULT_PREFS: Omit<EditorPrefs, 'groups'> = {
  width: '',
  height: '',
  menubar: false,
  sticky: true,
  statusbar: true,
  resizable: true,
  autosave: true,
};

/** Rozvržení od programátora na výchozí skupiny. */
export function groupsFromLayout(layout: Layout, bottomLayout: Layout = []): PrefGroup[] {
  const build = (rows: Layout, row: 'top' | 'bottom', prefix: string): PrefGroup[] =>
    rows.map((items, index) => ({
      id: prefix + index,
      row,
      items: items.map((name) => ({ name, on: true })),
    }));

  return [...build(layout, 'top', 'g'), ...build(bottomLayout, 'bottom', 'b')];
}

/**
 * Sloučí uložené nastavení s aktuálním rozvržením.
 *
 * Prvky, které uživatel zná, si drží své pořadí i zapnutí. Prvky, které mezitím
 * přibyly, se doplní na konec své původní skupiny — jinak by upgrade editoru
 * znamenal, že nové funkce nikdo neuvidí, protože je nemá v uloženém nastavení.
 * Prvky, které zmizely, se zahodí.
 */
export function mergeGroups(
  stored: readonly PrefGroup[],
  fresh: readonly PrefGroup[],
  known: (name: string) => boolean,
): PrefGroup[] {
  const seen = new Set<string>();

  const merged: PrefGroup[] = stored.map((group) => ({
    id: group.id,
    row: group.row === 'bottom' ? 'bottom' : 'top',
    items: group.items
      .filter((item) => known(item.name) && !seen.has(item.name) && seen.add(item.name) !== null)
      .map((item) => ({ name: item.name, on: item.on !== false })),
  }));

  for (const group of fresh) {
    const target = merged.find((g) => g.id === group.id);
    const missing = group.items.filter((item) => !seen.has(item.name) && known(item.name));
    if (missing.length === 0) continue;

    for (const item of missing) seen.add(item.name);
    if (target) target.items.push(...missing);
    else merged.push({ ...group, items: missing });
  }

  return merged.filter((group) => group.items.length > 0);
}

function storageKey(id: string): string {
  return 'nibble:prefs:' + id;
}

/**
 * Nastavení editoru s uložením do prohlížeče.
 *
 * Úložiště může být nedostupné (soukromé okno, plná kvóta). Nastavení pak
 * funguje v paměti a jen se nepřenese do příštího sezení — spadnout kvůli
 * tomu by bylo horší.
 */
export class Prefs {
  private value: EditorPrefs;
  private readonly listeners = new Set<(prefs: EditorPrefs) => void>();
  private readonly id: string;

  constructor(private readonly options: PrefsOptions) {
    this.id = options.id;

    const stored = this.read();
    this.value = stored
      ? {
        ...this.base(),
        ...stored,
        groups: mergeGroups(stored.groups ?? [], this.fresh(), options.known),
      }
      : this.base();
  }

  /** Stav bez ohledu na to, co je uložené — tedy to, co chtěl programátor. */
  private base(): EditorPrefs {
    return { ...DEFAULT_PREFS, ...this.options.defaults, groups: this.fresh() };
  }

  private fresh(): PrefGroup[] {
    return groupsFromLayout(this.options.layout, this.options.bottomLayout);
  }

  get(): EditorPrefs {
    return this.value;
  }

  /** Prvky, které se mají v daném řádku vykreslit, ve zvoleném pořadí. */
  layoutFor(row: 'top' | 'bottom'): string[][] {
    return this.value.groups
      .filter((group) => group.row === row)
      .map((group) => group.items.filter((item) => item.on).map((item) => item.name))
      .filter((items) => items.length > 0);
  }

  set(patch: PrefsPatch): void {
    this.value = { ...this.value, ...patch };
    this.write();
    for (const listener of this.listeners) listener(this.value);
  }

  /** Vrátí vše na výchozí stav podle konfigurace. */
  reset(): void {
    this.clear();
    this.value = this.base();
    for (const listener of this.listeners) listener(this.value);
  }

  onChange(listener: (prefs: EditorPrefs) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private read(): Partial<EditorPrefs> | null {
    try {
      const raw = localStorage.getItem(storageKey(this.id));
      return raw ? JSON.parse(raw) as Partial<EditorPrefs> : null;
    } catch {
      return null;
    }
  }

  private write(): void {
    try {
      localStorage.setItem(storageKey(this.id), JSON.stringify(this.value));
    } catch {
      // Soukromé okno nebo plná kvóta — nastavení zůstane jen pro tohle sezení.
    }
  }

  private clear(): void {
    try { localStorage.removeItem(storageKey(this.id)); } catch { /* viz výše */ }
  }
}
