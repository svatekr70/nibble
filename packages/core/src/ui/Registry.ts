import type { Editor } from '../Editor.js';
import type { GlyphCategory, GlyphEntry } from './glyphs.js';

/**
 * Registr ovládacích prvků.
 *
 * Bydlí v jádře, i když se vykresluje jinde. Plugin musí umět přihlásit
 * tlačítko, aniž by věděl, jestli si ho někdo zobrazí v liště, v kontextové
 * nabídce, nebo vůbec — a jádro musí umět běžet bez UI, aby šlo sanitizovat
 * HTML na serveru. Tady jsou proto jen data; vykreslení řeší `@nibble/ui`.
 */

export interface ButtonSpec {
  kind?: 'button';
  icon: string;
  tooltip: string;
  shortcut?: string;
  active?: (editor: Editor) => boolean;
  enabled?: (editor: Editor) => boolean;
  onAction: (editor: Editor) => void;
}

export interface SelectSpec {
  kind: 'select';
  tooltip: string;
  options: ReadonlyArray<{ value: string; text: string }>;
  value: (editor: Editor) => string;
  onAction: (editor: Editor, value: string) => void;
}

/**
 * Výběr barvy.
 *
 * Vlastní druh prvku, ne obyčejné tlačítko: jádro ví, jakou barvu má nabídnout
 * a co s vybranou udělat, ale jak vypadá kolo a paleta je věc vykreslení.
 */
export interface ColorSpec {
  kind: 'color';
  tooltip: string;
  icon: string;
  /** Barva pod kurzorem, nebo null. */
  value: (editor: Editor) => string | null;
  onPick: (editor: Editor, color: string | null) => void;
  enabled?: (editor: Editor) => boolean;
  /** Předvolby do palety. */
  swatches?: ReadonlyArray<{ color: string; label: string }>;
}

/** Položka rozbalovací nabídky. `style` se použije na náhled. */
export interface MenuItem {
  value: string;
  label: string;
  style?: Readonly<Record<string, string>>;
  /** Oddělovač nad položkou — dělí skupiny. */
  separator?: boolean;
}

/**
 * Rozbalovací nabídka s náhledem.
 *
 * Vlastní druh prvku, ne `<select>`: u výběru písma má být každá položka
 * vysázená svým písmem a to nativní `<option>` napříč systémy neumí. Navíc
 * seznam vzniká až při otevření, takže může záviset na stavu — třeba nabídnout
 * velikost, která je v obsahu, ale ve výchozí řadě není.
 */
export interface MenuSpec {
  kind: 'menu';
  tooltip: string;
  /** Šířka spouštěče v pixelech. */
  width?: number;
  items: (editor: Editor) => readonly MenuItem[];
  value: (editor: Editor) => string | null;
  /**
   * Sedí hodnota položky na aktuální stav? Bez uvedení se porovnává doslova.
   * U písma je to potřeba: obsah z TinyMCE má `Georgia, serif`, nabídka
   * `Georgia, "Times New Roman", serif` — a je to totéž písmo.
   */
  matches?: (itemValue: string, current: string) => boolean;
  /** Popisek, když není vybráno nic. */
  placeholder?: string;
  onPick: (editor: Editor, value: string) => void;
  enabled?: (editor: Editor) => boolean;
}

/**
 * Mřížka pro volbu rozměru.
 *
 * Vlastní druh prvku ze stejného důvodu jako barva: jádro ví, co se má
 * s vybraným rozměrem stát, ale jak mřížka vypadá a jak se v ní najíždí je věc
 * vykreslení. Rozměr tabulky se vybírá okem, ne dvěma čísly v dialogu.
 */
export interface GridSpec {
  kind: 'grid';
  tooltip: string;
  icon: string;
  maxRows?: number;
  maxCols?: number;
  onPick: (editor: Editor, rows: number, cols: number) => void;
  /** Odkaz na plné nastavení pod mřížkou. */
  more?: { label: string; onAction: (editor: Editor) => void };
}

export type ControlSpec = ButtonSpec | SelectSpec | ColorSpec | MenuSpec | GridSpec;

export function isSelect(spec: ControlSpec): spec is SelectSpec {
  return spec.kind === 'select';
}

export function isColor(spec: ControlSpec): spec is ColorSpec {
  return spec.kind === 'color';
}

export function isMenu(spec: ControlSpec): spec is MenuSpec {
  return spec.kind === 'menu';
}

export function isGrid(spec: ControlSpec): spec is GridSpec {
  return spec.kind === 'grid';
}

/** Plovoucí lišta, která se ukáže, když kurzor stojí na určitém prvku. */
export interface ContextToolbarSpec {
  /** Prvek, u kterého se má lišta ukázat — nebo null. */
  match: (node: Node, editor: Editor) => Element | null;
  items: readonly string[];
  priority?: number;
}

export type DialogFieldType =
  | 'text' | 'url' | 'textarea' | 'number' | 'select' | 'checkbox' | 'file' | 'html'
  /** Zdrojový kód se zvýrazněním syntaxe. */
  | 'code'
  /**
   * Mřížka pojmenovaných znaků s kategoriemi a hledáním.
   *
   * Dva druhy, protože se liší jen sazbou: `emoji` vysází políčka barevným
   * písmem emoji, `chars` písmem obsahu — v mapě znaků má být vidět přesně
   * to, co se vloží do textu.
   */
  | 'emoji' | 'chars';

export interface DialogField {
  type: DialogFieldType;
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  /** Jen pro type: 'select'. */
  options?: ReadonlyArray<{ value: string; text: string }>;
  /** Jen pro type: 'file' — co přijmout, např. 'image/*'. */
  accept?: string;
  /** Jen pro type: 'html' — vloží se jako je, na vlastní zodpovědnost volajícího. */
  html?: string;
  /** Jen pro type: 'code' — kam postavit kurzor nebo co označit. */
  selection?: readonly [number, number];
  /**
   * Jen pro type: 'emoji' a 'chars' — co nabídnout a v jakých kategoriích.
   *
   * Seznam se předává zvenčí, ne aby si ho dialog nesl sám: je to pár set
   * položek a do balíčku patří jen tehdy, když si někdo ten plugin zapne.
   */
  glyphs?: readonly GlyphEntry[];
  categories?: readonly GlyphCategory[];
}

/**
 * Tlačítko, které dialog nezavře.
 *
 * Hledání potřebuje „Najít další" a „Nahradit" — obojí sáhne do obsahu a nechá
 * panel otevřený, aby se dalo hledat dál. Běžná tlačítka to neumí: potvrzení
 * dialog zavírá, protože jednorázový formulář nic jiného neznamená.
 */
export interface DialogAction {
  name: string;
  label: string;
}

export interface DialogSpec {
  title: string;
  fields: readonly DialogField[];
  initial?: Record<string, unknown>;
  submitLabel?: string;
  cancelLabel?: string;
  /** `large` je pro dialogy, ve kterých se pracuje — třeba se zdrojovým kódem. */
  size?: 'normal' | 'large';
  /**
   * Nemodální panel místo dialogu.
   *
   * Modální okno editor zakryje backdropem a znepřístupní. Hledání takhle
   * fungovat nemůže: výsledek se ukazuje v obsahu, takže na něj musí být vidět
   * a musí se v něm dát dál pracovat.
   */
  modeless?: boolean;
  /** Tlačítka, po kterých panel zůstane otevřený. */
  actions?: readonly DialogAction[];
  /** Zavolá se po stisku tlačítka z `actions`, s tím, co je zrovna v polích. */
  onAction?: (name: string, values: Record<string, unknown>) => void;
  /** Zavolá se, až panel zmizí — ať po potvrzení, zrušení, nebo Escapem. */
  onClose?: () => void;
}

export type StatusHandler = (name: string, text: string | null) => void;
export type DialogHandler = (spec: DialogSpec) => Promise<Record<string, unknown> | null>;
export type NotifyHandler = (text: string, level: 'info' | 'warn' | 'error') => void;

export class UIRegistry {
  constructor(private readonly editor: Editor) {}

  private readonly controls = new Map<string, ControlSpec>();
  private readonly contextToolbars = new Map<string, ContextToolbarSpec>();
  private dialogHandler: DialogHandler | null = null;
  private notifyHandler: NotifyHandler | null = null;
  private statusHandler: StatusHandler | null = null;
  private readonly status = new Map<string, string>();

  addButton(name: string, spec: Omit<ButtonSpec, 'kind'>): this {
    this.controls.set(name, { ...spec, kind: 'button' });
    return this;
  }

  addSelect(name: string, spec: Omit<SelectSpec, 'kind'>): this {
    this.controls.set(name, { ...spec, kind: 'select' });
    return this;
  }

  addColor(name: string, spec: Omit<ColorSpec, 'kind'>): this {
    this.controls.set(name, { ...spec, kind: 'color' });
    return this;
  }

  addMenu(name: string, spec: Omit<MenuSpec, 'kind'>): this {
    this.controls.set(name, { ...spec, kind: 'menu' });
    return this;
  }

  addGrid(name: string, spec: Omit<GridSpec, 'kind'>): this {
    this.controls.set(name, { ...spec, kind: 'grid' });
    return this;
  }

  addContextToolbar(name: string, spec: ContextToolbarSpec): this {
    this.contextToolbars.set(name, spec);
    return this;
  }

  get(name: string): ControlSpec | undefined {
    return this.controls.get(name);
  }

  names(): string[] {
    return Array.from(this.controls.keys());
  }

  /** Kontextové lišty seřazené podle priority, nejvyšší první. */
  contextToolbarsFor(node: Node, editor: Editor): Array<{ target: Element; items: readonly string[] }> {
    const out: Array<{ target: Element; items: readonly string[]; priority: number }> = [];

    for (const spec of this.contextToolbars.values()) {
      const target = spec.match(node, editor);
      if (target) out.push({ target, items: spec.items, priority: spec.priority ?? 0 });
    }

    return out.sort((a, b) => b.priority - a.priority);
  }

  setDialogHandler(handler: DialogHandler | null): void {
    this.dialogHandler = handler;
  }

  setNotifyHandler(handler: NotifyHandler | null): void {
    this.notifyHandler = handler;
  }

  /**
   * Otevře dialog a počká na výsledek. Vrátí null, když ho uživatel zavřel.
   *
   * Promise místo dvojice onSubmit/onCancel: volající pak nemusí rozdělovat
   * jednu operaci do dvou callbacků a `await` drží kód pohromadě.
   *
   * Výběr se ukládá a obnovuje tady, protože otevření dialogu přesune fokus
   * a s ním i výběr — příkaz spuštěný po zavření by pak neměl na čem pracovat.
   * Řeší se to jednou pro všechny dialogy: kdyby si to hlídal každý plugin sám,
   * dřív nebo později by se na to jeden zapomněl.
   */
  async dialog(spec: DialogSpec): Promise<Record<string, unknown> | null> {
    if (!this.dialogHandler) {
      throw new Error('Nibble: dialogy nejsou k dispozici — chybí @nibble/ui (attachToolbar).');
    }

    const mark = this.editor.selection.save();
    try {
      return await this.dialogHandler(spec);
    } finally {
      this.editor.focus();
      this.editor.selection.restore(mark);
    }
  }

  notify(text: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    this.notifyHandler?.(text, level);
  }

  setStatusHandler(handler: StatusHandler | null): void {
    this.statusHandler = handler;
    // Nová obsluha dostane, co už je nastavené — jinak by stavový řádek
    // po připojení zůstal prázdný, dokud se obsah nezmění.
    for (const [name, text] of this.status) handler?.(name, text);
  }

  /** Zapíše nebo smaže políčko ve stavovém řádku. */
  setStatus(name: string, text: string | null): void {
    if (text === null) this.status.delete(name);
    else this.status.set(name, text);
    this.statusHandler?.(name, text);
  }

  getStatus(): ReadonlyMap<string, string> {
    return this.status;
  }
}
