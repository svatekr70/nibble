import { Prefs, type EditorPrefs, type Editor, type Layout } from '@nibble/core';
import { ContextToolbar } from './ContextToolbar.js';
import { renderControl } from './controls.js';
import { openDialog } from './Dialog.js';
import { Menubar, type MenubarMenu } from './Menubar.js';
import { openSettingsDialog } from './SettingsDialog.js';
import { bindResizeGrip, buildStatusBar, type StatusBarHandle } from './StatusBar.js';
import { Toolbar } from './Toolbar.js';

export { Toolbar } from './Toolbar.js';
export { ContextToolbar } from './ContextToolbar.js';
export { openDialog } from './Dialog.js';
export { buildCodeField, highlightHtml } from './CodeField.js';
export { openColorPicker, toHex, DEFAULT_SWATCHES } from './ColorPicker.js';
export { openMenu } from './Menu.js';
export { openGridPicker } from './GridPicker.js';
export type { GridPickerOptions } from './GridPicker.js';
export { Menubar, DEFAULT_MENUBAR } from './Menubar.js';
export type { MenubarMenu, MenuNode } from './Menubar.js';
export { openSettingsDialog, openConfigCode } from './SettingsDialog.js';
export { configCode } from './configCode.js';
export type { ConfigCodeOptions } from './configCode.js';
export { buildStatusBar, bindResizeGrip } from './StatusBar.js';
export { renderControl, syncControl } from './controls.js';
export { iconSvg, ICONS } from './icons.js';

const DEFAULT_LAYOUT = [
  ['undo', 'redo'],
  ['blocks', 'fontfamily', 'fontsize', 'lineheight'],
  ['bold', 'italic', 'underline', 'strike'],
  ['forecolor', 'backcolor'],
  ['bullist', 'numlist'],
  ['alignleft', 'aligncenter', 'alignright', 'alignjustify'],
  ['link', 'image', 'media', 'table'],
  ['blockquote', 'hr', 'removeformat'],
  ['code', 'searchreplace', 'fullscreen'],
] as const;

/**
 * Ozubené kolo do rozvržení nepatří.
 *
 * Je to jediná cesta zpátky: kdyby si ho uživatel vypnul nebo přesunul do
 * spodního řádku pod tabulku, kterou zrovna needituje, nedostal by se
 * k nastavení už nikdy. Proto se vykresluje mimo skupiny — vždy v horním
 * řádku a vždy úplně vpravo — a v seznamu tlačítek se vůbec nenabízí.
 */
const SETTINGS = 'settings';

export interface EditorUI {
  toolbar: Toolbar;
  contextToolbar: ContextToolbar;
  menubar: Menubar | null;
  prefs: Prefs;
  destroy(): void;
}

export interface AttachOptions {
  /** Rozvržení horního řádku lišty. */
  layout?: Layout;
  /** Skupiny, které mají začít ve druhém řádku lišty. */
  layoutBottom?: Layout;
  /** Nabídkový pruh. `true` použije výchozí rozvržení, pole vlastní. */
  menubar?: boolean | readonly MenubarMenu[];
  /** Klíč, pod kterým se ukládá nastavení uživatele. */
  prefsKey?: string;
  /** Výchozí hodnoty nastavení. Uživatel je může přebít. */
  prefs?: Partial<EditorPrefs>;
  /**
   * Ozubené kolo s nastavením. Jediné místo, kde se dá schovat — uživatel to
   * nesvede, protože by se pak k nastavení nedostal zpátky.
   */
  settings?: boolean;
}

/**
 * Připojí k editoru lištu, nabídku, plovoucí lištu, stavový řádek a dialogy.
 *
 * Rozvržení lišty je návrh programátora — uživatel ho může přeskládat
 * v nastavení a jeho volba pak vyhrává. Po změně se ovládání postaví znovu;
 * je to jednodušší a spolehlivější než dopočítávat, co přesně se pohnulo.
 */
export function attachToolbar(
  editor: Editor,
  options: readonly (readonly string[])[] | AttachOptions = {},
): EditorUI {
  const doc = editor.root.ownerDocument;

  // Druhý parametr bývalo rozvržení lišty; pole se proto pořád přijímá.
  const config: AttachOptions = Array.isArray(options)
    ? { layout: options as readonly (readonly string[])[] }
    : options as AttachOptions;

  // Kdyby si ho někdo napsal do rozvržení, vykreslilo by se dvakrát.
  const clean = (rows: Layout): Layout => rows
    .map((group) => group.filter((name) => name !== SETTINGS))
    .filter((group) => group.length > 0);

  const layout = clean(config.layout ?? DEFAULT_LAYOUT);
  const bottomLayout = clean(config.layoutBottom ?? []);

  const withSettings = config.settings !== false;
  const defaults: Partial<EditorPrefs> = {
    ...config.prefs,
    ...(config.menubar ? { menubar: true } : {}),
  };

  const prefs = new Prefs({
    id: config.prefsKey ?? 'default',
    layout,
    bottomLayout,
    defaults,
    known: (name) => name !== SETTINGS && editor.ui.get(name) !== undefined,
  });

  if (withSettings) registerSettingsControl(editor, prefs);

  const shell = doc.createElement('div');
  shell.className = 'nb';
  editor.root.parentNode?.insertBefore(shell, editor.root);

  const head = doc.createElement('div');
  head.className = 'nb-head';
  shell.appendChild(head);

  const surface = doc.createElement('div');
  surface.className = 'nb-surface';
  shell.appendChild(surface);
  surface.appendChild(editor.root);

  const foot = doc.createElement('div');
  foot.className = 'nb-foot';
  shell.appendChild(foot);

  const contextToolbar = new ContextToolbar(editor, surface);

  let menubar: Menubar | null = null;
  let toolbarTop: Toolbar | null = null;
  let toolbarBottom: Toolbar | null = null;
  let statusbar: StatusBarHandle | null = null;
  let releaseGrip: (() => void) | null = null;

  /** Postaví ovládání podle nastavení. Volá se znovu po každé jeho změně. */
  const build = (): void => {
    menubar?.destroy();
    toolbarTop?.destroy();
    toolbarBottom?.destroy();
    statusbar?.destroy();
    releaseGrip?.();

    menubar = null;
    toolbarTop = null;
    toolbarBottom = null;
    statusbar = null;
    releaseGrip = null;

    head.replaceChildren();
    foot.replaceChildren();

    const value = prefs.get();

    if (value.menubar) {
      menubar = new Menubar(
        editor,
        Array.isArray(config.menubar) ? config.menubar : undefined,
      );
      head.appendChild(menubar.element);
    }

    // První řádek je vlastní pruh: vlevo lišta, která se láme podle potřeby,
    // vpravo ozubené kolo přišpendlené k prvnímu řádku. Kdyby bylo jen
    // posledním prvkem lišty, po zalomení by skončilo dole uprostřed.
    const top = prefs.layoutFor('top');
    const bottom = prefs.layoutFor('bottom');

    if (top.length > 0 || withSettings) {
      const row = doc.createElement('div');
      row.className = 'nb-toolrow';

      if (top.length > 0) {
        toolbarTop = new Toolbar(editor, top);
        row.appendChild(toolbarTop.element);
      } else {
        // Prázdná výplň drží kolo vpravo i tehdy, když si uživatel přesunul
        // všechny skupiny do druhého řádku.
        const fill = doc.createElement('div');
        fill.className = 'nb-toolrow-fill';
        row.appendChild(fill);
      }

      const spec = withSettings ? editor.ui.get(SETTINGS) : undefined;
      if (spec) row.appendChild(renderControl(SETTINGS, spec, editor));

      // Mezi oběma řádky lišty se čára nekreslí — patří k sobě.
      row.classList.toggle('nb-toolrow-open', bottom.length > 0);
      head.appendChild(row);
    }

    // Druhý řádek patří hned pod první, ne dolů k obsahu. Uživatel v nastavení
    // skládá lištu, ne rozhraní editoru.
    if (bottom.length > 0) {
      toolbarBottom = new Toolbar(editor, bottom);
      toolbarBottom.element.classList.add('nb-toolbar-second');
      head.appendChild(toolbarBottom.element);
    }

    if (value.statusbar) {
      statusbar = buildStatusBar(editor, foot);
      editor.ui.setStatusHandler((name, text) => statusbar?.setStatus(name, text));

      if (value.resizable) {
        releaseGrip = bindResizeGrip(statusbar.element, shell, (w, h, done) => {
          const width = Math.round(w) + 'px';
          // Táhne se za celý editor, ale výšku dostává jen plocha s obsahem —
          // lišta a stavový řádek si svou drží samy.
          const height = Math.round(
            Math.max(60, h - head.offsetHeight - foot.offsetHeight),
          ) + 'px';

          // Puštění je teprve rozhodnutí: uloží se a ovládání se postaví znovu.
          if (done) { prefs.set({ width, height }); return; }

          shell.style.width = width;
          surface.style.height = height;

          // Zmenšený editor musí obsah rolovat. Bez tohohle by text pokračoval
          // pod spodní hranou editoru — a to i tehdy, když uživatel žádnou
          // výšku nezadal a `nb-surface-scroll` tedy nebylo z čeho zapnout.
          surface.classList.add('nb-surface-scroll');
        });
      }
    } else {
      editor.ui.setStatusHandler(null);
    }

    head.classList.toggle('nb-head-sticky', value.sticky);

    // Prázdná šířka nebo výška znamená „podle obsahu“ — nesmí se zapsat 0.
    shell.style.width = value.width || '';
    surface.style.height = value.height || '';
    surface.classList.toggle('nb-surface-scroll', value.height !== '');
  };

  build();
  const offPrefs = prefs.onChange(build);

  editor.ui.setDialogHandler((spec) => openDialog(spec, doc));
  editor.ui.setNotifyHandler((text, level) => {
    const note = doc.createElement('div');
    note.className = 'nb-note nb-note-' + level;
    note.setAttribute('role', level === 'error' ? 'alert' : 'status');
    note.textContent = text;
    surface.appendChild(note);
    setTimeout(() => note.remove(), 4000);
  });

  // Kliknutí do textu zavře otevřenou nabídku. Projít se musí *všechny* panely,
  // ne jen první: u podnabídky je otevřený druhý.
  const onPointerDown = (event: Event): void => {
    if (!menubar) return;

    const target = event.target as Node;
    if (menubar.element.contains(target)) return;

    const panels = Array.from(doc.querySelectorAll('.nb-panel'));
    if (panels.some((panel) => panel.contains(target))) return;

    menubar.close();
  };
  doc.addEventListener('pointerdown', onPointerDown);

  return {
    get toolbar() { return toolbarTop ?? toolbarBottom!; },
    contextToolbar,
    get menubar() { return menubar; },
    prefs,

    destroy() {
      doc.removeEventListener('pointerdown', onPointerDown);
      offPrefs();
      editor.ui.setDialogHandler(null);
      editor.ui.setNotifyHandler(null);
      editor.ui.setStatusHandler(null);
      releaseGrip?.();
      statusbar?.destroy();
      menubar?.destroy();
      toolbarTop?.destroy();
      toolbarBottom?.destroy();
      contextToolbar.destroy();
      shell.replaceWith(editor.root);
    },
  };
}

/** Tlačítko, které otevře nastavení. Registruje se až tady — potřebuje prefs. */
function registerSettingsControl(editor: Editor, prefs: Prefs): void {
  editor.ui.addButton('settings', {
    icon: 'settings',
    tooltip: 'Nastavení editoru',
    onAction: () => {
      openSettingsDialog(editor, prefs.get(), (result) => {
        if (result.reset) prefs.reset();
        else prefs.set(result.prefs);
      });
    },
  });
}
