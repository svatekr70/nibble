/**
 * Záloha rozepsaného textu.
 *
 * Kdo píše půl hodiny a omylem obnoví stránku, přijde o všechno — a je to ta
 * ztráta, kterou uživatel editoru nejvíc pamatuje. Nibble proto průběžně
 * ukládá obsah do `localStorage` a po načtení nabídne, že ho vrátí.
 *
 * **Nabídne, ne obnoví.** Automatické obnovení by přepsalo text, který mezitím
 * mohl někdo změnit jinde — třeba druhý editor téhož záznamu — a uživatel by
 * se to nedozvěděl. Záloha je pojistka, ne zdroj pravdy.
 *
 * Ukládá se jen to, co se liší od obsahu, se kterým editor začal. Kdo si
 * stránku jen otevřel a nic nenapsal, žádnou zálohu nezanechá.
 */

export interface Draft {
  /** Rozepsané HTML. */
  html: string;
  /** Kdy se uložilo, v milisekundách. */
  savedAt: number;
}

export interface AutosaveOptions {
  /**
   * Vlastní klíč. Bez něj se odvodí z adresy stránky a z `name` nebo `id`
   * cílového prvku — dva editory na jedné stránce se tak nepřepisují.
   */
  key?: string;
  /** Jak dlouho po posledním psaní se ukládá. Výchozí 800 ms. */
  delay?: number;
  /** Po jaké době záloha zestárne a zahodí se. Výchozí 7 dní. */
  maxAge?: number;
}

const PREFIX = 'nibble:draft:';
const DEFAULT_DELAY = 800;
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Úložiště, které nespadne.
 *
 * `localStorage` není samozřejmost: v soukromém okně, při zakázaných
 * souborech cookie nebo v `<iframe>` z jiné domény se na něj i jen sáhnout
 * může skončit výjimkou. Záloha je pojistka navíc — když nejde, editor kvůli
 * ní padat nesmí.
 */
function storageOf(win: Window | null): Storage | null {
  try {
    const store = win?.localStorage ?? null;
    if (!store) return null;
    const probe = PREFIX + 'test';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export class Autosave {
  readonly key: string;
  private readonly store: Storage | null;
  private readonly delay: number;
  private readonly maxAge: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enabled = true;

  /** Obsah, se kterým editor začal. Proti němu se pozná, co je rozepsané. */
  private baseline: string;

  /** Záloha nalezená při startu, pokud se od výchozího obsahu liší. */
  readonly pending: Draft | null;

  constructor(win: Window | null, key: string, baseline: string, options: AutosaveOptions = {}) {
    this.key = PREFIX + key;
    this.store = storageOf(win);
    this.delay = options.delay ?? DEFAULT_DELAY;
    this.maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
    this.baseline = baseline;

    this.sweep();
    this.pending = this.read();
  }

  /** Je zálohování vůbec k dispozici? */
  get available(): boolean {
    return this.store !== null;
  }

  /**
   * Zapne nebo vypne zálohování za běhu — z Nastavení editoru.
   *
   * Vypnutí zálohu rovnou zahodí. Nechat ji ležet by znamenalo, že se po
   * obnovení stránky nabídne verze, kterou uživatel zálohovat nechtěl.
   */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.discard();
  }

  /**
   * Naplánuje uložení. Opakované volání během psaní posune čas —
   * do `localStorage` se sahá až v pauze, ne po každém znaku.
   */
  schedule(html: string): void {
    if (!this.store || !this.enabled) return;

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.write(html);
    }, this.delay);
  }

  /** Uloží hned, bez čekání. Pro chvíle, kdy stránka končí. */
  flush(html: string): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.write(html);
  }

  /**
   * Zahodí zálohu.
   *
   * Volá se po odeslání formuláře — text je v databázi, pojistka doslouží —
   * a když ji uživatel odmítne.
   */
  discard(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try {
      this.store?.removeItem(this.key);
    } catch {
      // Úložiště mohlo mezitím zmizet. Zahodit zálohu se nepovedlo,
      // ale to není nic, kvůli čemu by měl editor přestat fungovat.
    }
  }

  /** Od téhle chvíle se za rozepsané považuje odchylka od tohohle obsahu. */
  rebase(html: string): void {
    this.baseline = html;
  }

  destroy(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  private write(html: string): void {
    if (!this.store || !this.enabled) return;

    // Shoda s výchozím obsahem není co zálohovat — a stará záloha by po
    // vrácení změn zpátky zůstala viset a nabízela by se pořád dokola.
    if (html === this.baseline) return this.discard();

    try {
      this.store.setItem(this.key, JSON.stringify({ html, savedAt: Date.now() }));
    } catch {
      // Nejspíš došlo místo. Úklid starých záloh uvolní, co jde, a druhý
      // pokus se povede — nebo se to prostě neuloží.
      this.sweep(true);
      try {
        this.store.setItem(this.key, JSON.stringify({ html, savedAt: Date.now() }));
      } catch {
        // Víc se dělat nedá.
      }
    }
  }

  private read(): Draft | null {
    if (!this.store) return null;

    try {
      const raw = this.store.getItem(this.key);
      if (!raw) return null;

      const draft = JSON.parse(raw) as Partial<Draft>;
      if (typeof draft.html !== 'string' || typeof draft.savedAt !== 'number') return null;

      // Záloha shodná s tím, co editor stejně načetl, není co nabízet.
      if (draft.html === this.baseline) { this.discard(); return null; }

      return { html: draft.html, savedAt: draft.savedAt };
    } catch {
      return null;
    }
  }

  /** Zahodí zálohy, které nikdo nevyzvedl. `all` zahodí i ty cizí a čerstvé. */
  private sweep(all = false): void {
    if (!this.store) return;

    try {
      const now = Date.now();
      for (let i = this.store.length - 1; i >= 0; i -= 1) {
        const key = this.store.key(i);
        if (!key || !key.startsWith(PREFIX)) continue;
        if (key === this.key && !all) continue;

        if (all) { this.store.removeItem(key); continue; }

        const raw = this.store.getItem(key);
        const savedAt = raw ? (JSON.parse(raw) as Partial<Draft>).savedAt : null;
        if (typeof savedAt !== 'number' || now - savedAt > this.maxAge) {
          this.store.removeItem(key);
        }
      }
    } catch {
      // Poškozený záznam nebo nedostupné úložiště. Úklid je údržba,
      // ne funkce, na které by mělo něco záviset.
    }
  }
}

/**
 * Klíč zálohy.
 *
 * Adresa stránky plus jméno pole. Bez jména by dva editory na jedné stránce
 * psaly do stejného záznamu a přepisovaly si ho; s ním má každý svůj.
 * Dotaz v adrese se schválně nepoužívá — bývají v něm jednorázové parametry,
 * po kterých by se záloha po návratu na tutéž stránku nenašla.
 */
export function draftKey(win: Window | null, name: string, index: number): string {
  const path = win?.location?.pathname ?? '';
  return path + '#' + (name || 'nibble-' + index);
}
