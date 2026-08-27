import { Events } from './Events.js';
import { Schema } from './model/Schema.js';
import { parseInto } from './model/Parser.js';
import { DEFAULT_EMBED_HOSTS, type SanitizeOptions } from './model/Sanitizer.js';
import { isIntact, type Region } from './model/Regions.js';
import { serializeNode, type SerializeOptions } from './model/Serializer.js';
import { usesNamedEntities } from './model/entities.js';
import { EditorSelection } from './selection/Selection.js';
import { History } from './history/History.js';
import { CommandRegistry } from './commands/Registry.js';
import { Formatter } from './format/Formatter.js';
import { bindInput } from './input/BeforeInput.js';
import { bindPaste } from './input/Paste.js';
import {
  clearFiller, closestBlock, ensureBlock, fillIfEmpty, isEmptyBlock, splitBlock,
} from './dom/blocks.js';

/** Bloky, jejichž obsah se při vkládání slije s okolím místo vzniku dalšího. */
const MERGEABLE = new Set(['p', 'div']);
import { deleteInDirection, insertParagraph, registerBlockCommands } from './commands/blocks.js';
import { registerListCommands } from './commands/lists.js';
import { registerDefListCommands } from './commands/deflist.js';
import { registerAnchorCommands } from './commands/anchor.js';
import { registerColorCommands } from './commands/colors.js';
import { registerClipboardCommands } from './commands/clipboard.js';
import { captureCaret, restoreCaret } from './selection/caret.js';
import { closestListItem, listOf } from './dom/lists.js';
import { UIRegistry } from './ui/Registry.js';
import { registerCoreControls } from './ui/coreControls.js';
import type { EntityEncoding, NibbleConfig, SchemaMode, SchemaViolation } from './types.js';

export type EditorMode = 'design' | 'readonly' | 'preview';

const FORMAT_TAGS: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  superscript: 'sup',
  subscript: 'sub',
  inlinecode: 'code',
};

/**
 * Formáty, které se navzájem vylučují.
 *
 * Text nemůže být zároveň horní a dolní index. Bez tohohle šlo zapnout obojí
 * a vzniklo `<sup><sub>…</sub></sup>` — v prohlížeči nesmysl, který se navíc
 * nedal jednoduše vypnout.
 */
const OPPOSITE: Record<string, string> = {
  sup: 'sub',
  sub: 'sup',
};

export class Editor {
  readonly root: HTMLElement;
  readonly schema: Schema;
  readonly selection: EditorSelection;
  readonly formatter: Formatter;
  readonly commands = new CommandRegistry<Editor>();
  readonly ui: UIRegistry;

  history!: History;
  mode: EditorMode = 'design';
  composing = false;
  /** Příští vložení proběhne jako čistý text (Ctrl+Shift+V). */
  pastePlainNext = false;

  /** Dokument, ve kterém editor žije. Příkazy z něj vytvářejí uzly. */
  readonly document: Document;
  private readonly events = new Events();
  private readonly teardown: Array<() => void> = [];
  private regions: Region[] = [];
  private readonly sanitizeOptions: SanitizeOptions;
  private serializeOptions: SerializeOptions = { entityEncoding: 'named' };
  private pendingMarks = new Set<string>();
  private foreignInputQueued = false;
  private destroyed = false;
  private readonly loaded: string[] = [];

  constructor(root: HTMLElement, config: NibbleConfig) {
    this.root = root;
    this.document = root.ownerDocument;
    this.schema = new Schema(config.schema ?? 'legacy');
    this.sanitizeOptions = {
      allowedEmbedHosts: config.allowedEmbedHosts ?? DEFAULT_EMBED_HOSTS,
    };
    this.selection = new EditorSelection(root, this.document);
    this.formatter = new Formatter(root, this.document);
    this.ui = new UIRegistry(this);

    root.setAttribute('contenteditable', 'true');
    root.setAttribute('role', 'textbox');
    root.setAttribute('aria-multiline', 'true');
    root.classList.add('nb-content');
    if (config.height) root.style.minHeight = config.height + 'px';

    this.setHTML(config.content ?? '', config.entityEncoding ?? 'auto');
    this.history = new History({
      html: this.getHTML(), mark: null, kind: 'init', at: Date.now(),
    });

    this.registerCoreCommands();
    registerBlockCommands(this);
    registerListCommands(this);
    registerDefListCommands(this);
    registerAnchorCommands(this);
    registerColorCommands(this);
    registerClipboardCommands(this);
    registerCoreControls(this, this.ui);
    this.teardown.push(bindInput(this));
    this.teardown.push(bindPaste(this, config.paste ?? {}));

    const onSelectionChange = (): void => {
      if (this.selection.getRange()) {
        this.pendingMarks.clear();
        this.events.dispatch('selectionchange');
      }
    };
    this.document.addEventListener('selectionchange', onSelectionChange);
    this.teardown.push(() => this.document.removeEventListener('selectionchange', onSelectionChange));

    if (config.readonly) this.setMode('readonly');
    for (const plugin of config.plugins ?? []) {
      const off = plugin.setup(this);
      if (off) this.teardown.push(off);
      this.loaded.push(plugin.name);
    }
    if (config.autofocus) this.focus();
  }

  /** Jména načtených pluginů v pořadí, ve kterém se nastavovaly. */
  get plugins(): readonly string[] {
    return this.loaded;
  }

  // ---------------------------------------------------------------- obsah

  /**
   * Serializuje obsah. Bloky, kterých se nikdo nedotkl, se vypíšou v původním
   * znění — proto `getHTML()` po pouhém načtení vrátí přesně to, co přišlo.
   */
  getHTML(): string {
    const firstOfRegion = new Map<Node, Region>();
    for (const region of this.regions) {
      const first = region.nodes[0];
      if (first) firstOfRegion.set(first, region);
    }

    let out = '';
    const children = Array.from(this.root.childNodes);
    let i = 0;

    while (i < children.length) {
      const node = children[i]!;
      const region = firstOfRegion.get(node);

      if (region && isIntact(region, this.root)) {
        out += region.source;
        i += region.nodes.length;
        continue;
      }

      out += serializeNode(node, this.serializeOptions);
      i += 1;
    }

    return out;
  }

  setHTML(html: string, entityEncoding: EntityEncoding = 'auto'): void {
    const mode: Exclude<EntityEncoding, 'auto'> =
      entityEncoding === 'auto'
        ? (usesNamedEntities(html) ? 'named' : 'utf8')
        : entityEncoding;
    this.serializeOptions = { entityEncoding: mode };

    const result = parseInto(this.root, html, this.document, this.sanitizeOptions);
    this.regions = result.regions;

    if (this.root.childNodes.length === 0) {
      const p = this.document.createElement('p');
      fillIfEmpty(p, this.document);
      this.root.appendChild(p);
      this.regions = [];
    }

    for (const item of result.removed) {
      this.events.dispatch('schemaviolation', { node: item, reason: 'bezpečnostní pravidlo' });
    }
    this.events.dispatch('setcontent', { html });
  }

  getText(): string {
    return this.root.textContent ?? '';
  }

  /**
   * Vloží HTML na pozici kurzoru.
   *
   * Když vkládaný obsah obsahuje bloky, rozdělí se blok pod kurzorem a bloky se
   * vloží mezi půlky. První vložený odstavec se přitom slije s tím, do čeho se
   * vkládá — jinak by vložení doprostřed věty větu roztrhlo na dva odstavce.
   */
  insertHTML(html: string): boolean {
    const range = this.selection.getRange();
    if (!range || html === '') return false;

    const box = this.document.createElement('div');
    box.innerHTML = html;
    if (!box.firstChild) return false;

    range.deleteContents();

    const hasBlocks = box.querySelector(
      'p, div, h1, h2, h3, h4, h5, h6, ul, ol, li, table, blockquote, pre, hr, figure',
    ) !== null;

    const block = ensureBlock(range.startContainer, this.root, this.document);

    if (!hasBlocks || !block) {
      const frag = this.document.createDocumentFragment();
      while (box.firstChild) frag.appendChild(box.firstChild);
      const last = frag.lastChild;

      range.insertNode(frag);
      if (last) {
        this.selection.collapseTo(
          last, last.nodeType === 3 ? (last.nodeValue ?? '').length : last.childNodes.length,
        );
      }
      this.commit('insert');
      return true;
    }

    const tail = splitBlock(block, range, this.document);
    const parent = tail.parentNode;
    if (!parent) return false;

    const first = box.firstElementChild;
    if (first && isEmptyBlock(block) === false && MERGEABLE.has(first.tagName.toLowerCase())) {
      while (first.firstChild) block.appendChild(first.firstChild);
      first.remove();
    }

    let caret: Node = block;
    while (box.firstChild) {
      caret = box.firstChild;
      parent.insertBefore(box.firstChild, tail);
    }

    // Prázdné půlky po rozdělení nemají zůstat.
    if (isEmptyBlock(block) && block !== caret) block.remove();
    if (isEmptyBlock(tail)) tail.remove();
    else if (caret.nodeType === 1 && MERGEABLE.has((caret as Element).tagName.toLowerCase())) {
      while (tail.firstChild) (caret as Element).appendChild(tail.firstChild);
      tail.remove();
    }

    const landing = caret.nodeType === 1 ? (caret as Element) : caret;
    this.selection.collapseTo(landing, landing.childNodes.length);
    this.commit('insert');
    return true;
  }

  /** Bloky, které se od načtení změnily. */
  getDirtyBlocks(): Node[] {
    const out: Node[] = [];
    for (const region of this.regions) {
      if (!isIntact(region, this.root)) out.push(...region.nodes);
    }
    return out;
  }

  isDirty(): boolean {
    return this.regions.some((region) => !isIntact(region, this.root));
  }

  /** Co by z tohohle obsahu odstranil přísný režim — bez toho, aby to udělal. */
  audit(html?: string): SchemaViolation[] {
    if (html === undefined) return this.schema.audit(this.root);
    const box = this.document.createElement('div');
    box.innerHTML = html;
    return this.schema.audit(box);
  }

  // ---------------------------------------------------------------- akce

  exec(name: string, args?: unknown): boolean {
    if (this.mode !== 'design' && name !== 'undo' && name !== 'redo') return false;
    return this.commands.exec(this, name, args);
  }

  can(name: string): boolean {
    return this.commands.can(this, name);
  }

  is(format: string): boolean {
    const tag = FORMAT_TAGS[format];
    if (!tag) return false;
    if (this.pendingMarks.has(tag)) return true;
    const range = this.selection.getRange();
    return range ? this.formatter.matches(range, tag) : false;
  }

  focus(): void { this.root.focus(); }

  setMode(mode: EditorMode): void {
    this.mode = mode;
    this.root.setAttribute('contenteditable', mode === 'design' ? 'true' : 'false');
    this.events.dispatch('modechange', { mode });
  }

  on(event: string, fn: (payload: never) => void): () => void {
    return this.events.on(event, fn as (p: unknown) => void);
  }

  /** Vyvolá vlastní událost. Pluginy tím hlásí, co udělaly. */
  dispatch(event: string, payload?: unknown): void {
    this.events.dispatch(event, payload);
  }

  off(event: string, fn: (payload: never) => void): void {
    this.events.off(event, fn as (p: unknown) => void);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const fn of this.teardown.reverse()) fn();
    this.teardown.length = 0;
    this.events.clear();
    this.root.removeAttribute('contenteditable');
    this.root.classList.remove('nb-content');
  }

  // ---------------------------------------------------------------- vnitřek

  /** Zapíše krok do historie a ohlásí změnu. Volá se po každé úpravě. */
  commit(kind: string): void {
    const html = this.getHTML();
    this.history.push({ html, mark: this.selection.save(), kind, at: Date.now() });
    this.events.dispatch('change', { html });
  }

  /**
   * Vstup, který zatím neumíme zpracovat sami, provede prohlížeč. Až po něm si
   * srovnáme stav — bez toho by taková úprava minula historii i `change`.
   */
  scheduleForeignInput(): void {
    if (this.foreignInputQueued) return;
    this.foreignInputQueued = true;
    queueMicrotask(() => {
      this.foreignInputQueued = false;
      if (!this.destroyed) this.commit('foreign');
    });
  }

  private restore(html: string, mark: Parameters<EditorSelection['restore']>[0]): void {
    this.history.transact(() => {
      this.setHTML(html, this.serializeOptions.entityEncoding);
      this.selection.restore(mark);
    });
    this.events.dispatch('change', { html });
  }

  private registerCoreCommands(): void {
    for (const [name, tag] of Object.entries(FORMAT_TAGS)) {
      this.commands.add(name, (ed) => {
        const range = ed.selection.getRange();
        if (!range) return false;

        const opposite = OPPOSITE[tag];

        if (range.collapsed) {
          // Bez výběru se formát jen předepíše pro další napsaný znak.
          if (ed.pendingMarks.has(tag)) {
            ed.pendingMarks.delete(tag);
          } else {
            ed.pendingMarks.add(tag);
            if (opposite) ed.pendingMarks.delete(opposite);
          }
          ed.events.dispatch('selectionchange');
          return true;
        }

        // Zapnutí jednoho z dvojice vypne ten druhý — jinak by se zanořily
        // do sebe a text by byl horní i dolní index zároveň.
        const live = opposite && !ed.formatter.matches(range, tag)
          ? ed.formatter.clear(range, [opposite])
          : range;

        ed.selection.setRange(ed.formatter.toggle(live, tag));
        ed.commit('format');
        return true;
      });
    }

    this.commands.add('insertText', (ed, args) => {
      const data = typeof args === 'string' ? args : '';
      if (!data) return false;

      const range = ed.selection.getRange();
      if (!range) return false;

      range.deleteContents();

      // Psaní strukturu nemění. `ensureBlock` by srovnal citaci s holým textem
      // a přeskládal uzly pod rukama — od psaní to nikdo nečeká. Zavolá se
      // proto jen tam, kde blok opravdu chybí, tedy u holého textu v kořeni.
      let block = closestBlock(range.startContainer, ed.root);
      if (!block) {
        const caret = captureCaret(ed);
        block = ensureBlock(range.startContainer, ed.root, ed.document);
        restoreCaret(ed, caret);

        const live = ed.selection.getRange();
        if (!live) return false;
        range.setStart(live.startContainer, live.startOffset);
        range.collapse(true);
      }

      if (block && isEmptyBlock(block)) {
        clearFiller(block);
        range.selectNodeContents(block);
        range.collapse(true);
      }

      // Psaní do existujícího textového uzlu, ne vedle něj.
      //
      // Vypadá to jako optimalizace, ale je to podmínka funkčnosti: kdyby každý
      // úhoz zakládal vlastní uzel, měl by odstavec po napsání adresy dvacet
      // textových uzlů a cokoli, co se dívá na `text.data` — automatické odkazy,
      // typografie, hledání — by vidělo vždy jen poslední písmeno.
      if (ed.pendingMarks.size === 0 && range.startContainer.nodeType === 3) {
        const existing = range.startContainer as Text;
        const at = range.startOffset;
        existing.insertData(at, data);
        ed.selection.collapseTo(existing, at + data.length);
        ed.dispatch('input', { data });
        ed.commit('type');
        return true;
      }

      let node: Node = ed.document.createTextNode(data);

      for (const tag of ed.pendingMarks) {
        const wrapper = ed.document.createElement(tag);
        wrapper.appendChild(node);
        node = wrapper;
      }
      ed.pendingMarks.clear();

      range.insertNode(node);
      const caret = node.nodeType === 3 ? node : (node as Element).firstChild ?? node;
      ed.selection.collapseTo(caret, (caret.nodeValue ?? '').length);
      ed.dispatch('input', { data });
      ed.commit('type');
      return true;
    });

    this.commands.add('insertParagraph', (ed) => insertParagraph(ed));

    this.commands.add('insertLineBreak', (ed) => {
      const range = ed.selection.getRange();
      if (!range) return false;
      range.deleteContents();

      const br = ed.document.createElement('br');
      range.insertNode(br);
      const after = ed.document.createTextNode('');
      br.parentNode?.insertBefore(after, br.nextSibling);
      ed.selection.collapseTo(after, 0);
      ed.commit('break');
      return true;
    });

    this.commands.add('deleteBackward', (ed) => deleteInDirection(ed, -1));
    this.commands.add('deleteForward', (ed) => deleteInDirection(ed, 1));

    this.commands.add(
      'undo',
      (ed) => {
        const snapshot = ed.history.undo();
        if (!snapshot) return false;
        ed.restore(snapshot.html, snapshot.mark);
        return true;
      },
      (ed) => ed.history.canUndo,
    );

    this.commands.add(
      'redo',
      (ed) => {
        const snapshot = ed.history.redo();
        if (!snapshot) return false;
        ed.restore(snapshot.html, snapshot.mark);
        return true;
      },
      (ed) => ed.history.canRedo,
    );
  }

  /** Značka bloku, ve kterém je kurzor. Řídí výběr v liště. */
  getBlockTag(): string | null {
    const range = this.selection.getRange();
    if (!range) return null;
    const block = closestBlock(range.startContainer, this.root);
    return block ? block.tagName.toLowerCase() : null;
  }

  /** Druh seznamu pod kurzorem, nebo null. Řídí stav tlačítek v liště. */
  isInList(): 'ul' | 'ol' | null {
    const range = this.selection.getRange();
    if (!range) return null;
    const li = closestListItem(range.startContainer, this.root);
    const list = li ? listOf(li) : null;
    if (!list) return null;
    return list.tagName.toLowerCase() === 'ol' ? 'ol' : 'ul';
  }

  /** Zarovnání bloku pod kurzorem. */
  getAlignment(): string {
    const range = this.selection.getRange();
    if (!range) return 'left';
    const block = closestBlock(range.startContainer, this.root);
    const value = block ? (block as HTMLElement).style.textAlign : '';
    return value || 'left';
  }

  /** Blok pod kurzorem; holý text v kořeni se přitom obalí odstavcem. */
  currentBlock(): Element | null {
    const range = this.selection.getRange();
    if (!range) return null;
    return ensureBlock(range.startContainer, this.root, this.document);
  }
}
