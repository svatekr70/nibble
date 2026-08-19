/**
 * Pole pro úpravu zdrojového kódu.
 *
 * Zvýraznění syntaxe v `<textarea>` nejde — ta umí jen holý text. Používá se
 * proto stará osvědčená dvojice: pod průhlednou textareou leží `<pre>` se
 * stejným textem, jen obarveným. Obojí má shodné písmo, řádkování i odsazení,
 * takže se překrývají znak na znak; při psaní a rolování se drží v zákrytu.
 *
 * Zvýrazňovač je záměrně malý — pár set bajtů místo celého CodeMirroru. Není
 * to plnohodnotný parser: nemá ambici pochopit HTML, jen ho učinit čitelným.
 */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (ch) => ESCAPES[ch]!);
}

function span(kind: string, text: string): string {
  return '<span class="nb-hl-' + kind + '">' + escapeHtml(text) + '</span>';
}

/**
 * Rozdělí HTML na barevné kousky.
 *
 * Pořadí testů rozhoduje: komentář a doctype se musí poznat dřív než značka,
 * protože obojí začíná `<`.
 */
export function highlightHtml(source: string): string {
  let out = '';
  let i = 0;

  while (i < source.length) {
    const ch = source[i]!;

    if (ch === '<') {
      if (source.startsWith('<!--', i)) {
        const end = source.indexOf('-->', i + 4);
        const stop = end < 0 ? source.length : end + 3;
        out += span('comment', source.slice(i, stop));
        i = stop;
        continue;
      }

      if (source.startsWith('<!', i)) {
        const end = source.indexOf('>', i);
        const stop = end < 0 ? source.length : end + 1;
        out += span('doctype', source.slice(i, stop));
        i = stop;
        continue;
      }

      const tag = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(source.slice(i, i + 64));
      if (tag) {
        const end = findTagEnd(source, i);
        out += highlightTag(source.slice(i, end));
        i = end;
        continue;
      }
    }

    if (ch === '&') {
      const semi = source.indexOf(';', i);
      if (semi > 0 && semi - i <= 12 && /^&#?[a-zA-Z0-9]+;$/.test(source.slice(i, semi + 1))) {
        out += span('entity', source.slice(i, semi + 1));
        i = semi + 1;
        continue;
      }
    }

    // Souvislý text najednou — po znacích by výstup nabobtnal.
    const next = source.slice(i + 1).search(/[<&]/);
    const stop = next < 0 ? source.length : i + 1 + next;
    out += escapeHtml(source.slice(i, stop));
    i = stop;
  }

  return out;
}

function findTagEnd(source: string, from: number): number {
  let quote = '';
  for (let i = from + 1; i < source.length; i++) {
    const ch = source[i]!;
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '>') return i + 1;
  }
  return source.length;
}

const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+)?/g;

function highlightTag(tag: string): string {
  const name = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag);
  if (!name) return escapeHtml(tag);

  const nameEnd = name[0].length;
  let out = span('punct', tag.slice(0, name[0].length - name[1]!.length))
    + span('tag', name[1]!);

  const body = tag.slice(nameEnd, tag.length - 1);
  let last = 0;

  ATTR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR.exec(body)) !== null) {
    out += escapeHtml(body.slice(last, match.index));
    out += span('attr', match[1]!);
    if (match[2]) out += span('punct', match[2]);
    if (match[3]) out += span('value', match[3]);
    last = match.index + match[0].length;
  }

  out += escapeHtml(body.slice(last));
  return out + span('punct', tag.slice(tag.length - 1));
}

export interface CodeFieldHandle {
  element: HTMLElement;
  textarea: HTMLTextAreaElement;
}

const WRAP_KEY = 'nibble:code-wrap';

/** Zalamovat řádky? Výchozí ano — vodorovné rolování je v kódu otrava. */
function wrapPreference(): boolean {
  try {
    const stored = localStorage.getItem(WRAP_KEY);
    return stored === null ? true : stored === '1';
  } catch {
    return true;
  }
}

function rememberWrap(on: boolean): void {
  try { localStorage.setItem(WRAP_KEY, on ? '1' : '0'); } catch { /* soukromé okno */ }
}

/** Postaví pole se zvýrazněním. Vrací obal i vlastní textareu. */
export function buildCodeField(
  doc: Document,
  value: string,
  selection?: readonly [number, number],
): CodeFieldHandle {
  const wrap = doc.createElement('div');
  wrap.className = 'nb-code';

  const area = doc.createElement('div');
  area.className = 'nb-code-area';

  const highlight = doc.createElement('pre');
  highlight.className = 'nb-code-hl';
  highlight.setAttribute('aria-hidden', 'true');

  const textarea = doc.createElement('textarea');
  textarea.className = 'nb-input nb-code-input';
  textarea.spellcheck = false;
  textarea.value = value;
  // Zvýraznění nesmí přebít kontrolu pravopisu ani doplňování — kód není próza.
  textarea.autocapitalize = 'off';
  textarea.setAttribute('autocorrect', 'off');

  const paint = (): void => {
    // Koncový řádek navíc: bez něj `<pre>` poslední prázdný řádek nezobrazí
    // a zvýraznění se o řádek rozejde s textem.
    highlight.innerHTML = highlightHtml(textarea.value) + '\n';
  };

  textarea.addEventListener('input', paint);
  textarea.addEventListener('scroll', () => {
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  });

  area.append(highlight, textarea);

  /**
   * Přepínač zalamování.
   *
   * Musí přepnout **obě vrstvy naráz** — kdyby zalamovala jen jedna, rozešly
   * by se řádky a obarvení by přestalo sedět na textu. Proto je to jedna třída
   * na společném obalu, ne dvě nastavení.
   */
  const wrapRow = doc.createElement('label');
  wrapRow.className = 'nb-code-wrap';

  const toggle = doc.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = wrapPreference();

  const wrapLabel = doc.createElement('span');
  wrapLabel.textContent = 'Zalamovat řádky';

  const applyWrap = (): void => {
    area.classList.toggle('is-wrap', toggle.checked);
    // Po přepnutí se řádky přeskládají — zvýraznění se musí srovnat s textem.
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  };

  toggle.addEventListener('change', () => { rememberWrap(toggle.checked); applyWrap(); });
  wrapRow.append(toggle, wrapLabel);

  wrap.append(area, wrapRow);
  applyWrap();
  paint();

  if (selection) {
    // Až po vložení do dokumentu; jinak se výběr neodroluje na správné místo.
    queueMicrotask(() => {
      textarea.focus();

      // Měření mění `value`, a to výběr zruší — proto se počítá dřív,
      // než se výběr nastaví.
      const top = caretScrollTop(textarea, selection[0]);
      textarea.setSelectionRange(selection[0], selection[1]);
      textarea.scrollTop = top;
      highlight.scrollTop = textarea.scrollTop;
    });
  }

  return { element: wrap, textarea };
}

/**
 * Na jaké odrolování postavit kurzor, aby byl uprostřed.
 *
 * Počítat řádky podle `\n` nejde: se zapnutým zalamováním zabírá jeden logický
 * řádek několik vizuálních. Text se proto dočasně zkrátí ke kurzoru a změří se
 * výška — ta odpovídá skutečné poloze bez ohledu na zalamování.
 *
 * Vrací hodnotu místo aby ji rovnou nastavovala: přepis `value` výběr zruší,
 * takže se musí měřit **před** jeho nastavením.
 */
function caretScrollTop(textarea: HTMLTextAreaElement, at: number): number {
  const full = textarea.value;
  textarea.value = full.slice(0, at);
  const height = textarea.scrollHeight;
  textarea.value = full;

  return Math.max(0, height - textarea.clientHeight / 2);
}
