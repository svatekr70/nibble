import { VERSION, type EditorPrefs, type PrefGroup, type Editor } from '@nibble/core';
import { configCode } from './configCode.js';
import { iconSvg } from './icons.js';

/**
 * Nastavení editoru pro uživatele.
 *
 * Rozvržení lišty navrhne programátor a udělá to podle potřeb aplikace.
 * Uživatel u toho ale sedí celý den — a jeho zvyky se s tím návrhem potkat
 * nemusí. Tenhle dialog mu dovolí přeskládat, co potřebuje, aniž by kdokoli
 * musel sahat do kódu.
 *
 * Přetahování je pointerové, ne HTML5 drag & drop: ten se na dotykových
 * zařízeních chová nespolehlivě a nejde u něj rozumně vykreslit, kam prvek
 * spadne.
 */

export interface SettingsResult {
  prefs: Partial<EditorPrefs>;
  reset?: boolean;
}

/** Popisek prvku podle registru, aby uživatel neviděl vnitřní jména. */
function labelOf(editor: Editor, name: string): string {
  const spec = editor.ui.get(name);
  return spec?.tooltip ?? name;
}

function iconOf(editor: Editor, name: string): string {
  const spec = editor.ui.get(name);
  if (!spec || !('icon' in spec) || !spec.icon) return '';
  return iconSvg(spec.icon);
}

/**
 * Udělá ze seznamu přetahovatelný.
 *
 * Táhne se klon pod prstem, původní řádek zůstává na místě zesvětlený — je pak
 * vidět, odkud prvek jde i kam spadne. Pořadí se přepočítává průběžně, takže
 * puštění nic nepřekvapí.
 */
function makeSortable(
  list: HTMLElement,
  handleSelector: string,
  onDrop: () => void,
): void {
  let dragged: HTMLElement | null = null;

  const rowsOf = (): HTMLElement[] =>
    Array.from(list.querySelectorAll<HTMLElement>(':scope > .nb-set-row'));

  list.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest(handleSelector)) return;

    const row = target.closest<HTMLElement>('.nb-set-row');
    if (!row) return;

    event.preventDefault();
    dragged = row;
    row.classList.add('is-dragging');
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  });

  list.addEventListener('pointermove', (event) => {
    if (!dragged) return;

    const y = event.clientY;
    for (const row of rowsOf()) {
      if (row === dragged) continue;

      const box = row.getBoundingClientRect();
      const middle = box.top + box.height / 2;

      if (y < middle && row.compareDocumentPosition(dragged) & Node.DOCUMENT_POSITION_FOLLOWING) {
        list.insertBefore(dragged, row);
        return;
      }
      if (y > middle && row.compareDocumentPosition(dragged) & Node.DOCUMENT_POSITION_PRECEDING) {
        list.insertBefore(dragged, row.nextSibling);
        return;
      }
    }
  });

  const finish = (): void => {
    if (!dragged) return;
    dragged.classList.remove('is-dragging');
    dragged = null;
    onDrop();
  };

  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);
}

export function openSettingsDialog(
  editor: Editor,
  prefs: EditorPrefs,
  onApply: (result: SettingsResult) => void,
): () => void {
  const doc = editor.root.ownerDocument;
  doc.querySelectorAll('.nb-settings').forEach((old) => old.remove());

  // Pracuje se nad kopií — zrušení dialogu nesmí nic změnit.
  const draft: PrefGroup[] = prefs.groups.map((group) => ({
    id: group.id,
    row: group.row,
    items: group.items.map((item) => ({ ...item })),
  }));

  const dialog = doc.createElement('dialog');
  dialog.className = 'nb-dialog nb-dialog-large nb-settings';

  const form = doc.createElement('form');
  form.method = 'dialog';

  const heading = doc.createElement('h2');
  heading.className = 'nb-dialog-title';
  heading.textContent = 'Nastavení editoru';
  form.appendChild(heading);

  const body = doc.createElement('div');
  body.className = 'nb-dialog-body nb-settings-body';
  form.appendChild(body);

  // ---------------------------------------------------------------- rozměry

  const general = doc.createElement('div');
  general.className = 'nb-set-panel';

  const field = (label: string, node: HTMLElement): HTMLElement => {
    const wrap = doc.createElement('label');
    wrap.className = 'nb-field';
    const text = doc.createElement('span');
    text.textContent = label;
    wrap.append(text, node);
    return wrap;
  };

  const width = doc.createElement('input');
  width.type = 'text';
  width.className = 'nb-input';
  width.value = prefs.width;
  width.placeholder = '100% nebo 800px';

  const height = doc.createElement('input');
  height.type = 'text';
  height.className = 'nb-input';
  height.value = prefs.height;
  height.placeholder = '500px';

  const check = (label: string, checked: boolean): HTMLInputElement => {
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;

    const wrap = doc.createElement('label');
    wrap.className = 'nb-set-check';
    const text = doc.createElement('span');
    text.textContent = label;
    wrap.append(input, text);
    general.appendChild(wrap);
    return input;
  };

  const size = doc.createElement('div');
  size.className = 'nb-set-size';
  size.append(field('Šířka', width), field('Výška', height));

  general.append(sectionTitle(doc, 'Rozměry'), size, hint(doc,
    'Prázdné pole znamená „podle obsahu“. Zadaná výška zapne rolování uvnitř '
    + 'editoru.'), sectionTitle(doc, 'Vzhled'));

  const menubar = check('Zobrazit nabídku', prefs.menubar);
  const sticky = check('Ovládací panel se drží u okraje', prefs.sticky);
  const statusbar = check('Informační řádek dole', prefs.statusbar);
  const resizable = check('Měnit velikost tažením za roh', prefs.resizable);
  const autosave = check('Pamatovat si rozepsané', prefs.autosave);

  // Když zálohování vypnul programátor, zaškrtnutí by nic nezměnilo —
  // políčko to musí přiznat, ne tiše lhát.
  if (!editor.autosave) {
    autosave.checked = false;
    autosave.disabled = true;
    autosave.closest('label')?.classList.add('nb-check-off');
  }

  body.appendChild(general);

  // ---------------------------------------------------------------- lišta

  const toolbar = doc.createElement('div');
  toolbar.className = 'nb-set-panel nb-set-groups';
  toolbar.append(
    sectionTitle(doc, 'Lišta'),
    hint(doc, 'Přetažením za úchyt změníte pořadí. Zaškrtnutím zapnete nebo '
      + 'vypnete jednotlivá tlačítka.'),
  );

  const groupList = doc.createElement('div');
  groupList.className = 'nb-set-list nb-set-grouplist';
  toolbar.appendChild(groupList);
  body.appendChild(toolbar);

  /** Přečte pořadí zpátky z DOMu — ten je po přetahování zdrojem pravdy. */
  const readOrder = (): PrefGroup[] =>
    Array.from(groupList.querySelectorAll<HTMLElement>(':scope > .nb-set-row')).map((row) => {
      const id = row.dataset.group!;
      const original = draft.find((g) => g.id === id)!;
      const items = Array.from(row.querySelectorAll<HTMLElement>('.nb-set-item'));

      return {
        id,
        row: (row.querySelector<HTMLSelectElement>('.nb-set-rowpick')!.value === 'bottom'
          ? 'bottom' : 'top') as 'top' | 'bottom',
        items: items.map((item) => ({
          name: item.dataset.name!,
          on: item.querySelector<HTMLInputElement>('input')!.checked,
        })),
      } satisfies PrefGroup;
    }).filter((group) => group.items.length > 0 || draft.some((g) => g.id === group.id));

  for (const group of draft) {
    const row = doc.createElement('div');
    row.className = 'nb-set-row nb-set-group';
    row.dataset.group = group.id;

    const head = doc.createElement('div');
    head.className = 'nb-set-grouphead';

    const grip = doc.createElement('span');
    grip.className = 'nb-set-grip';
    grip.title = 'Přetáhnout skupinu';
    grip.textContent = '⠿';

    const name = doc.createElement('span');
    name.className = 'nb-set-groupname';
    // Devět skupin pojmenovaných „Skupina“ by uživateli neřeklo nic. Popisek
    // se proto skládá z obsahu — a zůstává platný i po přeskládání.
    name.textContent = group.items.slice(0, 3).map((i) => labelOf(editor, i.name)).join(' · ')
      + (group.items.length > 3 ? ' …' : '');

    const rowPick = doc.createElement('select');
    rowPick.className = 'nb-select nb-set-rowpick';
    for (const [value, text] of [['top', 'První řádek'], ['bottom', 'Druhý řádek']]) {
      const option = doc.createElement('option');
      option.value = value!;
      option.textContent = text!;
      rowPick.appendChild(option);
    }
    rowPick.value = group.row;

    head.append(grip, name, rowPick);
    row.appendChild(head);

    const items = doc.createElement('div');
    items.className = 'nb-set-list nb-set-items';

    for (const item of group.items) {
      const itemRow = doc.createElement('div');
      itemRow.className = 'nb-set-row nb-set-item';
      itemRow.dataset.name = item.name;

      const itemGrip = doc.createElement('span');
      itemGrip.className = 'nb-set-grip';
      itemGrip.title = 'Přetáhnout tlačítko';
      itemGrip.textContent = '⠿';

      const toggle = doc.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = item.on;

      const icon = doc.createElement('span');
      icon.className = 'nb-set-icon';
      icon.innerHTML = iconOf(editor, item.name);

      const label = doc.createElement('span');
      label.className = 'nb-set-label';
      label.textContent = labelOf(editor, item.name);

      itemRow.append(itemGrip, toggle, icon, label);
      items.appendChild(itemRow);
    }

    makeSortable(items, '.nb-set-grip', () => { /* pořadí se čte při uložení */ });
    row.appendChild(items);
    groupList.appendChild(row);
  }

  makeSortable(groupList, '.nb-set-grouphead .nb-set-grip', () => { /* viz výše */ });

  // ---------------------------------------------------------------- patička

  const footer = doc.createElement('div');
  footer.className = 'nb-dialog-footer';

  const reset = doc.createElement('button');
  reset.type = 'button';
  reset.className = 'nb-dialog-btn nb-set-reset';
  reset.textContent = 'Výchozí nastavení';

  const dump = doc.createElement('button');
  dump.type = 'button';
  dump.className = 'nb-dialog-btn nb-set-dump';
  dump.textContent = 'Vypsat konfiguraci';
  dump.title = 'Kód pro inicializaci podle toho, jak je editor nastavený teď';

  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.className = 'nb-dialog-btn';
  cancel.textContent = 'Zrušit';

  const submit = doc.createElement('button');
  submit.type = 'submit';
  submit.className = 'nb-dialog-btn nb-dialog-btn-primary';
  submit.textContent = 'Použít';

  footer.append(reset, dump, cancel, submit);
  form.appendChild(footer);

  // Verze pod tlačítky, ne mezi nimi: je to údaj o programu, ne ovládací prvek,
  // a v řadě s tlačítky by se o ně otíral.
  const version = doc.createElement('p');
  version.className = 'nb-dialog-version';
  version.textContent = 'Nibble ' + VERSION;
  form.appendChild(version);

  dialog.appendChild(form);
  doc.body.appendChild(dialog);

  /** Aktuální stav formuláře. Používá ho uložení i výpis konfigurace. */
  function current(): Required<Pick<EditorPrefs,
    'width' | 'height' | 'menubar' | 'sticky' | 'statusbar' | 'resizable'
    | 'autosave' | 'groups'>> {
    return {
      width: width.value.trim(),
      height: height.value.trim(),
      menubar: menubar.checked,
      sticky: sticky.checked,
      statusbar: statusbar.checked,
      resizable: resizable.checked,
      autosave: autosave.checked,
      groups: readOrder(),
    };
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onApply({ prefs: current() });
    close();
  });

  // Vypisuje se stav dialogu, ne to, co je zrovna uložené: uživatel chce vidět
  // konfiguraci pro to, co má před sebou, i když ještě nekliknul na Použít.
  dump.addEventListener('click', () => {
    openConfigCode(editor, configCode({ ...prefs, ...current() }, {
      plugins: editor.plugins,
    }));
  });

  reset.addEventListener('click', () => { onApply({ prefs: {}, reset: true }); close(); });
  cancel.addEventListener('click', () => close());
  dialog.addEventListener('close', () => dialog.remove());

  dialog.showModal();
  width.focus();

  function close(): void { dialog.close(); }
  return close;
}

function sectionTitle(doc: Document, text: string): HTMLElement {
  const title = doc.createElement('h3');
  title.className = 'nb-set-title';
  title.textContent = text;
  return title;
}

function hint(doc: Document, text: string): HTMLElement {
  const node = doc.createElement('p');
  node.className = 'nb-hint';
  node.textContent = text;
  return node;
}

/**
 * Okno s vygenerovanou konfigurací.
 *
 * Otevírá se nad nastavením, ne místo něj: uživatel se po zavření vrátí přesně
 * tam, odkud šel, a nemusí si své úpravy pamatovat.
 */
export function openConfigCode(editor: Editor, code: string): () => void {
  const doc = editor.root.ownerDocument;
  doc.querySelectorAll('.nb-dump').forEach((old) => old.remove());

  const dialog = doc.createElement('dialog');
  dialog.className = 'nb-dialog nb-dump';

  const heading = doc.createElement('h2');
  heading.className = 'nb-dialog-title';
  heading.textContent = 'Konfigurace podle aktuálního nastavení';

  const body = doc.createElement('div');
  body.className = 'nb-dialog-body nb-dump-body';

  const pre = doc.createElement('pre');
  pre.className = 'nb-dump-code';
  pre.tabIndex = 0;
  pre.textContent = code;
  body.appendChild(pre);

  const footer = doc.createElement('div');
  footer.className = 'nb-dialog-footer';

  const copy = doc.createElement('button');
  copy.type = 'button';
  copy.className = 'nb-dialog-btn nb-dialog-btn-primary';
  copy.textContent = 'Kopírovat';

  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'nb-dialog-btn';
  close.textContent = 'Zavřít';

  footer.append(copy, close);
  dialog.append(heading, body, footer);
  doc.body.appendChild(dialog);

  /** Označí celý výpis, aby fungovalo Ctrl+C i tam, kde schránka není. */
  const selectAll = (): void => {
    const range = doc.createRange();
    range.selectNodeContents(pre);
    const selection = doc.defaultView?.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  copy.addEventListener('click', () => {
    // Schránka je bez HTTPS i bez oprávnění nedostupná. Označení textu je
    // pořád lepší odpověď než tichý neúspěch.
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(code))
      .then(
        () => { copy.textContent = 'Zkopírováno'; },
        () => { selectAll(); copy.textContent = 'Označeno — Ctrl+C'; },
      )
      .then(() => { setTimeout(() => { copy.textContent = 'Kopírovat'; }, 2500); });
  });

  const shut = (): void => dialog.close();
  close.addEventListener('click', shut);
  dialog.addEventListener('close', () => dialog.remove());

  dialog.showModal();

  // Fokus na hlavní akci, ale bez posunu: prohlížeč by jinak odrolil výpis
  // k zaostřenému prvku a uživatel by začínal číst kód od konce.
  copy.focus({ preventScroll: true });
  pre.scrollTop = 0;
  pre.scrollLeft = 0;

  return shut;
}
