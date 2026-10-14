# Nápady z TipTapu — plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přidat do Nibble osm funkcí inspirovaných TipTapem: odkazy při vkládání, placeholder, limit znaků, Markdown zkratky, úkoly, rozbalovací blok, lomítkové příkazy a úchyt pro přetažení bloku.

**Architecture:** Každá funkce je volitelný plugin v `packages/plugins` (placeholder je volba jádra). Jádro dostane jen malé obecné háčky: export pomocníků z `dom/blocks`, událost `itemsplit`, vnořitelné `history.transact`, `summary` mezi bloky a registr `addSuggestion`. Vykreslování nových prvků UI (nabídka u kurzoru) patří do `@nibble/ui`, stejně jako všechno ostatní.

**Tech Stack:** TypeScript (vanilla, žádné závislosti za běhu), vitest + linkedom pro čisté funkce, Playwright (Chromium) pro všechno s kurzorem, klávesami a historií.

**Spec:** `docs/superpowers/specs/2026-10-14-tiptap-inspirace-design.md`

## Global Constraints

- Načtený obsah, na který uživatel nesáhl, se uloží znak po znaku stejně. Všech 145 fixtures musí projít.
- Žádná nová závislost za běhu.
- Každá změna obsahu provedená funkcí je samostatný krok historie: první Ctrl+Z ji vrátí celou.
- Placeholder, úchyt, nabídka u kurzoru i zaškrtávátko se nikdy nedostanou do `getHTML()`.
- Formát úkolů: `<ul data-type="taskList"><li data-type="taskItem" data-checked="true|false">`.
- Limit znaků jen varuje: nic neblokuje a nic neusekává.
- Komentáře a texty v UI česky, ve stylu okolního kódu (komentář vysvětluje *proč*).
- Každý úkol končí vlastním commitem a zápisem do `CHANGELOG.md` pod `## [Unreleased]` (sekci založit, pokud chybí). Vydání verze se nedělá.
- Commit message končí řádkem `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Zkratky v existujícím obsahu:** napsání `# ` uprostřed odstavce, který už text má, nesmí nic převést. Převádí se jen tehdy, když je před kurzorem *jen* vzor (test v Úkolu 4).
2. **Vložení adresy, když kurzor stojí na konci odkazu:** Chrome hlásí kurzor uvnitř `<a>`, takže se nesmí vytvořit vnořený odkaz (test v Úkolu 1).
3. **Undo po lomítkovém příkazu:** Ctrl+Z musí vrátit text `/nad` v jednom kroku u příkazů bez dialogu (test v Úkolu 7).
4. **Přetažení bloku mezi bílými textovými uzly:** kořen fixtures obsahuje `\n` mezi bloky. Přesun nesmí rozbít okolní nedotčené bloky, ostatní bloky se musí uložit doslova (test v Úkolu 8).
5. **Enter na zaškrtnutém úkolu:** nová položka nesmí zdědit `data-checked="true"` (test v Úkolu 5).

---

## Mapa souborů

| Soubor | Úkol | Odpovědnost |
|---|---|---|
| `packages/core/src/index.ts` | 1, 4, 7 | nové veřejné exporty |
| `packages/plugins/src/tools.ts` | 1, 3 | `autolink` (vkládání), `wordcount` (limit) |
| `packages/core/src/types.ts`, `create.ts`, `Editor.ts`, `dom/blocks.ts` | 2 | placeholder |
| `packages/core/src/ui/Registry.ts`, `packages/ui/src/StatusBar.ts` | 3 | tón položky stavového řádku |
| `packages/core/src/selection/textBefore.ts` (nový) | 4 | text bloku před kurzorem |
| `packages/plugins/src/markdown.ts` (nový) | 4, 5 | vzory a plugin zkratek |
| `packages/core/src/history/History.ts` | 5 | vnořitelné `transact` |
| `packages/core/src/commands/lists.ts` | 5 | událost `itemsplit` |
| `packages/plugins/src/tasks.ts` (nový) | 5 | úkoly |
| `packages/core/src/dom/blocks.ts`, `input/Paste.ts` | 6 | `summary` jako blok, vkládání `details` |
| `packages/plugins/src/details.ts` (nový) | 6 | rozbalovací blok |
| `packages/core/src/ui/suggest.ts` (nový) | 7 | dotaz a filtr nabídky (čisté funkce) |
| `packages/ui/src/CaretMenu.ts` (nový) | 7 | nabídka u kurzoru |
| `packages/plugins/src/slash.ts` (nový) | 7 | položky lomítkové nabídky |
| `packages/plugins/src/dragHandle.ts` (nový) | 8 | úchyt a přesun bloku |
| `packages/ui/src/nibble.css` | 2, 3, 5, 6, 7, 8 | vzhled |
| `tools/build-icons.mjs` → `packages/ui/src/icons.ts` | 5, 6 | ikony `tasklist`, `details`, `detailsopen` |
| `packages/plugins/src/index.ts` | 3–8 | exporty pluginů |
| `demo/e2e.html` | 4–8 | nové pluginy ve výchozí sadě testovací stránky |
| `CHANGELOG.md`, `README.md` | všechny | zápis změn, dokumentace |

Příkazy:
- unit: `npx vitest run <soubor>`
- e2e: `npx playwright test e2e/<soubor>`. `webServer` si projekt sám přeloží, ale když server běží (`reuseExistingServer`), je potřeba předtím spustit `npm run build`.
- celé: `npm test && npm run typecheck && npm run e2e`

---

### Task 1: Odkazy při vkládání

**Files:**
- Modify: `packages/core/src/index.ts` (export pomocníků z `dom/blocks`)
- Modify: `packages/plugins/src/tools.ts:86-147` (`autolink`)
- Modify: `packages/plugins/src/index.ts` (export `pastedHref`)
- Test: `packages/core/test/tools.test.ts`, `e2e/autolink.spec.ts` (nový)

**Interfaces:**
- Produces: `export { closestBlock, isEmptyBlock, fillIfEmpty, atBlockStart, blocksInRange } from './dom/blocks.js'` v `@nibble/core`. Používají je Úkoly 4–8.
- Produces: `pastedHref(text: string): string | null` v `packages/plugins/src/tools.ts`.

- [ ] **Step 1: Napsat padající unit test**

Do `packages/core/test/tools.test.ts` doplnit import `pastedHref` a blok:

```ts
import { countWords, findMatches, pastedHref } from '../../plugins/src/tools.js';

describe('adresa ve schránce', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['  https://example.com/a?b=1#c \n', 'https://example.com/a?b=1#c'],
    ['http://x.cz', 'http://x.cz'],
    ['jan.novak@firma.cz', 'mailto:jan.novak@firma.cz'],
  ])('%j → %s', (text, expected) => {
    expect(pastedHref(text)).toBe(expected);
  });

  it.each([
    'viz https://example.com',
    'https://a.cz https://b.cz',
    'example.com',
    'ftp://example.com',
    '',
    'javascript:alert(1)',
  ])('%j není adresa', (text) => {
    expect(pastedHref(text)).toBeNull();
  });
});
```

- [ ] **Step 2: Ověřit, že test padá**

Run: `npx vitest run packages/core/test/tools.test.ts`
Expected: FAIL (`pastedHref` is not exported).

- [ ] **Step 3: Exportovat pomocníky z jádra**

Do `packages/core/src/index.ts` za řádek s `splitTopLevel` přidat:

```ts
export {
  closestBlock, isEmptyBlock, fillIfEmpty, atBlockStart, blocksInRange,
} from './dom/blocks.js';
```

- [ ] **Step 4: Implementovat vkládání v `autolink`**

V `packages/plugins/src/tools.ts` doplnit import `closestBlock` z `@nibble/core` a `closestLink` z `./link.js`. Za `EMAIL_PATTERN` přidat:

```ts
const PASTED_URL = /^https?:\/\/[^\s<>"']+$/i;
const PASTED_EMAIL = /^[\w.+-]+@[\w-]+\.[\w.-]+\w$/;

/**
 * Je celý text ze schránky jedna adresa? Vrátí `href`, nebo null.
 *
 * Jen celý text: věta, ve které adresa je, se vkládá jako věta — dělat z ní
 * odkazy by bylo hádání, a to při vkládání nechceme.
 */
export function pastedHref(text: string): string | null {
  const trimmed = text.trim();
  if (PASTED_URL.test(trimmed)) return trimmed;
  if (PASTED_EMAIL.test(trimmed)) return 'mailto:' + trimmed;
  return null;
}
```

V `setup` pluginu `autolink` před `return` přidat obsluhu a úklid upravit:

```ts
    /**
     * Adresa ze schránky.
     *
     * Běží ve fázi capture, tedy před vkládáním v jádře — to by z adresy
     * udělalo obyčejný odstavec. Když ve schránce není jen adresa, nechá
     * vložení jádru celé.
     */
    const onPaste = (event: Event): void => {
      const e = event as ClipboardEvent;
      if (editor.mode !== 'design' || editor.pastePlainNext) return;

      const data = e.clipboardData;
      if (!data) return;
      if (Array.from(data.files).some((f) => f.type.startsWith('image/'))) return;

      const text = data.getData('text/plain');
      const href = pastedHref(text);
      if (!href) return;

      const range = editor.selection.getRange();
      if (!range) return;

      // Odkaz v odkazu je neplatné HTML a prohlížeč ho při dalším načtení
      // rozbije po svém.
      if (closestLink(range.startContainer, editor.root)
        || closestLink(range.endContainer, editor.root)) return;

      // Přes víc bloků by `<a>` musel obalit odstavce. Radši vložit normálně.
      if (!range.collapsed
        && closestBlock(range.startContainer, editor.root)
          !== closestBlock(range.endContainer, editor.root)) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const anchor = editor.document.createElement('a');
      anchor.setAttribute('href', href);

      if (range.collapsed) anchor.textContent = text.trim();
      else anchor.appendChild(range.extractContents());

      range.insertNode(anchor);

      const after = editor.document.createRange();
      after.setStartAfter(anchor);
      after.collapse(true);
      editor.selection.setRange(after);
      editor.commit('autolink');
    };

    editor.root.addEventListener('keydown', onKeyDown);
    editor.root.addEventListener('paste', onPaste, true);
    return () => {
      editor.root.removeEventListener('keydown', onKeyDown);
      editor.root.removeEventListener('paste', onPaste, true);
    };
```

Do `packages/plugins/src/index.ts` přidat `pastedHref` do exportů z `./tools.js`.

- [ ] **Step 5: Ověřit, že unit test prochází**

Run: `npx vitest run packages/core/test/tools.test.ts`
Expected: PASS

- [ ] **Step 6: Napsat e2e test**

Vytvořit `e2e/autolink.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { caret, html, mount, select } from './helpers.js';

/** Vloží text, jako by přišel ze schránky — skutečná schránka je v CI nespolehlivá. */
async function pasteText(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    (window as any).ed.root.dispatchEvent(event);
  }, text);
}

test.describe('odkazy při vkládání', () => {
  test('samotná adresa se vloží jako odkaz', async ({ page }) => {
    await mount(page, '<p>Viz </p>');
    await caret(page, 0, 4);
    await pasteText(page, 'https://example.com');
    expect(await html(page)).toBe('<p>Viz <a href="https://example.com">https://example.com</a></p>');
  });

  test('adresa vložená na výběr z něj udělá odkaz', async ({ page }) => {
    await mount(page, '<p>Náš web je tady.</p>');
    await select(page, 0, 11, 15);
    await pasteText(page, 'https://example.com');
    expect(await html(page)).toBe('<p>Náš web je <a href="https://example.com">tady</a>.</p>');
  });

  test('e-mail dostane mailto:', async ({ page }) => {
    await mount(page, '<p>x</p>');
    await caret(page, 0, 1);
    await pasteText(page, 'jan@firma.cz');
    expect(await html(page)).toContain('<a href="mailto:jan@firma.cz">jan@firma.cz</a>');
  });

  test('jeden Ctrl+Z vrátí stav před vložením', async ({ page }) => {
    await mount(page, '<p>Náš web je tady.</p>');
    await select(page, 0, 11, 15);
    await pasteText(page, 'https://example.com');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe('<p>Náš web je tady.</p>');
  });

  test('uvnitř odkazu nevznikne odkaz v odkazu', async ({ page }) => {
    await mount(page, '<p><a href="https://a.cz">odkaz</a></p>');
    await caret(page, 0, 5);
    await pasteText(page, 'https://b.cz');
    expect(await html(page)).not.toContain('<a href="https://b.cz"');
  });

  test('věta s adresou zůstane textem', async ({ page }) => {
    await mount(page, '<p>x</p>');
    await caret(page, 0, 1);
    await pasteText(page, 'viz https://example.com');
    expect(await html(page)).not.toContain('<a ');
  });

  test('Ctrl+Shift+V vloží adresu jako text', async ({ page }) => {
    await mount(page, '<p>x</p>');
    await caret(page, 0, 1);
    await page.evaluate(() => { (window as any).ed.pastePlainNext = true; });
    await pasteText(page, 'https://example.com');
    expect(await html(page)).not.toContain('<a ');
  });
});
```

- [ ] **Step 7: Spustit e2e**

Run: `npm run build && npx playwright test e2e/autolink.spec.ts e2e/paste.spec.ts`
Expected: PASS. Kdyby test „uvnitř odkazu“ selhal, protože Chrome na konci `<a>` hlásí kurzor za odkazem, zjistit, kde kurzor opravdu je, a podmínku upravit. Neupravovat test.

- [ ] **Step 8: CHANGELOG a commit**

Do `CHANGELOG.md` pod `## [Unreleased]` / `### Přidáno`:

```markdown
- Adresa nebo e-mail vložený ze schránky se rovnou stane odkazem. Když je
  označený text, odkazem se stane on — bez dialogu. Věta, ve které adresa
  je, se vkládá jako věta; Ctrl+Shift+V vloží vždy čistý text.
```

```bash
git add packages/core/src/index.ts packages/plugins/src/tools.ts packages/plugins/src/index.ts packages/core/test/tools.test.ts e2e/autolink.spec.ts CHANGELOG.md
git commit -m "Adresa ze schránky se vloží jako odkaz"
```

---

### Task 2: Placeholder

**Files:**
- Modify: `packages/core/src/dom/blocks.ts` (nová `isEmptyDocument`)
- Modify: `packages/core/src/types.ts` (`placeholder?: string`)
- Modify: `packages/core/src/create.ts` (převzetí z textarey)
- Modify: `packages/core/src/Editor.ts` (konstruktor, `destroy`)
- Modify: `packages/ui/src/nibble.css` (za blok `.nb-content` u ř. 285)
- Test: `packages/core/test/blocks.test.ts`, `e2e/placeholder.spec.ts` (nový)

**Interfaces:**
- Produces: `isEmptyDocument(root: Element): boolean` v `dom/blocks.ts`.
- Produces: `NibbleConfig.placeholder?: string`. Na kořeni editoru je `data-placeholder` a třída `nb-empty`.

- [ ] **Step 1: Napsat padající unit test**

Do `packages/core/test/blocks.test.ts` doplnit import `isEmptyDocument` z `../src/dom/blocks.js` a:

```ts
describe('prázdný dokument', () => {
  const root = (html: string) => {
    const { document } = parseWindow();
    const el = document.createElement('div');
    el.innerHTML = html;
    return el;
  };

  it.each([
    ['<p><br></p>', true],
    ['<p></p>', true],
    ['<p>x</p>', false],
    ['<p><br></p><p><br></p>', false],
    ['<h2><br></h2>', false],
    ['<p><img src="a.png"></p>', false],
  ])('%s → %s', (html, expected) => {
    expect(isEmptyDocument(root(html))).toBe(expected);
  });
});
```

- [ ] **Step 2: Ověřit, že padá**

Run: `npx vitest run packages/core/test/blocks.test.ts`
Expected: FAIL (`isEmptyDocument` is not a function).

- [ ] **Step 3: Implementace v `dom/blocks.ts`**

Za `isEmptyBlock`:

```ts
/**
 * Je celý dokument „nic"? Tedy jediný prázdný odstavec — to, co editor
 * vytvoří z prázdného vstupu a co zbude po smazání všeho.
 *
 * Nadpis bez textu prázdný dokument není: uživatel si ho zvolil, a nápověda
 * přes něj by vypadala jako text v nadpisu.
 */
export function isEmptyDocument(root: Element): boolean {
  if (root.children.length !== 1) return false;
  const only = root.firstElementChild!;
  return only.tagName.toLowerCase() === 'p' && isEmptyBlock(only)
    && only.querySelector('img, iframe, video, audio, hr') === null;
}
```

Run: `npx vitest run packages/core/test/blocks.test.ts` → PASS. Pokud `isEmptyBlock` vrací pro `<p><img></p>` true, kontrola `querySelector` to pokryje.

- [ ] **Step 4: Volba v typech a v `create`**

V `types.ts` do `NibbleConfig` za `readonly`:

```ts
  /** Šedý text v prázdném editoru. Bez uvedení se vezme z `<textarea placeholder>`. */
  placeholder?: string;
```

V `create.ts` místo `const editor = new Editor(host, { ...config, target: host, content });`:

```ts
  const placeholder = config.placeholder ?? (textarea?.placeholder || undefined);

  const editor = new Editor(host, {
    ...config, target: host, content, ...(placeholder ? { placeholder } : {}),
  });
```

- [ ] **Step 5: Editor**

V `Editor.ts` přidat `isEmptyDocument` do importu z `./dom/blocks.js`. V konstruktoru za `registerCoreControls(...)` vložit:

```ts
    if (config.placeholder) this.teardown.push(this.bindPlaceholder(config.placeholder));
```

A do třídy (sekce `vnitřek`):

```ts
  /**
   * Nápověda v prázdném editoru.
   *
   * Jen atribut a třída na kořeni, text kreslí CSS. Kořen do `getHTML()`
   * nepatří, takže se nápověda nemůže dostat do uloženého obsahu.
   */
  private bindPlaceholder(text: string): () => void {
    this.root.dataset.placeholder = text;
    const sync = (): void => {
      this.root.classList.toggle('nb-empty', isEmptyDocument(this.root));
    };
    sync();
    const offChange = this.on('change', sync);
    const offSet = this.on('setcontent', sync);
    return () => {
      offChange();
      offSet();
      this.root.classList.remove('nb-empty');
      delete this.root.dataset.placeholder;
    };
  }
```

- [ ] **Step 6: CSS**

Do `nibble.css` za `.nb-content > :last-child { … }`:

```css
/* Nápověda v prázdném editoru. Plovoucí s nulovou výškou: kurzor stojí na
   začátku řádku přes ni a text ji při prvním písmenu nahradí. */
.nb-content.nb-empty::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: var(--nb-muted, #8a8f98);
  pointer-events: none;
  user-select: none;
}
```

(Pokud v `nibble.css` proměnná `--nb-muted` neexistuje, použít tu, kterou soubor má pro tlumený text. Najít ji přes `grep -n "muted\|--nb-.*text" packages/ui/src/nibble.css`.)

- [ ] **Step 7: e2e**

Vytvořit `e2e/placeholder.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { CONTENT, caret, html, mount } from './helpers.js';

test.describe('placeholder', () => {
  test('prázdný editor ukáže nápovědu, text ji schová', async ({ page }) => {
    await mount(page, '', { placeholder: 'Text poznámky…' });
    await expect(page.locator(CONTENT)).toHaveClass(/nb-empty/);
    await expect(page.locator(CONTENT)).toHaveAttribute('data-placeholder', 'Text poznámky…');

    await caret(page, 0, 0);
    await page.keyboard.type('a');
    await expect(page.locator(CONTENT)).not.toHaveClass(/nb-empty/);
  });

  test('po smazání všeho se nápověda vrátí', async ({ page }) => {
    await mount(page, '<p>ab</p>', { placeholder: 'Piš' });
    await caret(page, 0, 2);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(page.locator(CONTENT)).toHaveClass(/nb-empty/);
  });

  test('nápověda není v uloženém HTML', async ({ page }) => {
    await mount(page, '', { placeholder: 'Piš' });
    expect(await html(page)).not.toContain('Piš');
  });

  test('převezme se z textarey', async ({ page }) => {
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    const value = await page.evaluate(async () => {
      const ta = document.createElement('textarea');
      ta.placeholder = 'Z textarey';
      document.getElementById('host')!.replaceChildren(ta);
      const { Nibble } = await import('/dist/core/src/index.js' as any);
      const ed = await Nibble.create({ target: ta, autosave: false });
      return ed.root.dataset.placeholder;
    });
    expect(value).toBe('Z textarey');
  });
});
```

`mount(page, html, opts)` zatím volby nepřijímá. V `e2e/helpers.ts` změnit signaturu:

```ts
export async function mount(page: Page, html: string, opts: Record<string, unknown> = {}): Promise<void> {
  await page.goto('/e2e.html');
  await page.waitForFunction(() => (window as any).ready === true);
  await page.evaluate(([h, o]) => (window as any).mount(h, o), [html, opts] as const);
}
```

(`window.mount` v `demo/e2e.html` už druhý parametr přijímá a předává ho do `Nibble.create`.)

Run: `npm run build && npx playwright test e2e/placeholder.spec.ts`
Expected: PASS

- [ ] **Step 8: README, CHANGELOG, commit**

V README v sekci `## Použití` doplnit k ukázce konfigurace řádek `placeholder: 'Začněte psát…',` s komentářem, že bez uvedení se bere z `<textarea placeholder>`.

CHANGELOG / Přidáno:

```markdown
- Volba `placeholder` — šedá nápověda v prázdném editoru. Bez uvedení se
  převezme z atributu `placeholder` nahrazované `<textarea>`, takže stávající
  formuláře ji ukážou bez úprav. Do uloženého HTML se nedostane.
```

```bash
git add packages/core/src packages/core/test/blocks.test.ts packages/ui/src/nibble.css e2e/placeholder.spec.ts e2e/helpers.ts README.md CHANGELOG.md
git commit -m "Placeholder v prázdném editoru"
```

---

### Task 3: Limit znaků

**Files:**
- Modify: `packages/core/src/ui/Registry.ts` (`setStatus` s tónem)
- Modify: `packages/ui/src/StatusBar.ts:107-121` (`setStatus` s tónem)
- Modify: `packages/ui/src/index.ts` (předání tónu do stavového řádku)
- Modify: `packages/plugins/src/tools.ts:150-176` (`wordcount` → `createWordcountPlugin`)
- Modify: `packages/plugins/src/index.ts`
- Modify: `packages/ui/src/nibble.css`
- Test: `packages/core/test/tools.test.ts`, `e2e/tools.spec.ts`

**Interfaces:**
- Produces: `type StatusTone = 'normal' | 'over'`, `StatusHandler = (name, text, tone: StatusTone) => void`, `UIRegistry.setStatus(name, text, tone?: StatusTone)`.
- Produces: `createWordcountPlugin(options?: { maxChars?: number }): Plugin`, `wordcount = createWordcountPlugin()`, `wordcountLabel(text: string, maxChars?: number): { label: string; count: number; over: boolean }`.
- Produces: událost editoru `limit` s payloadem `{ count: number; max: number; over: boolean }`.

Rozhodnutí: limit počítá **všechny znaky včetně mezer**, stejně jako `maxlength`. Běžný údaj „N znaků“ bez limitu zůstává beze změny (bez mezer).

- [ ] **Step 1: Padající unit test**

V `packages/core/test/tools.test.ts` přidat import `wordcountLabel` a:

```ts
describe('popisek počítadla', () => {
  it('bez limitu jako dosud', () => {
    expect(wordcountLabel('ahoj světe')).toEqual({ label: '2 slov · 9 znaků', count: 9, over: false });
  });

  it('s limitem počítá i mezery', () => {
    expect(wordcountLabel('ahoj světe', 160)).toEqual({ label: '2 slov · 10 / 160 znaků', count: 10, over: false });
  });

  it('přes limit', () => {
    expect(wordcountLabel('abcdef', 5).over).toBe(true);
    expect(wordcountLabel('abcde', 5).over).toBe(false);
  });
});
```

Run: `npx vitest run packages/core/test/tools.test.ts` → FAIL.

- [ ] **Step 2: Tón ve stavovém řádku (jádro)**

V `Registry.ts`:

```ts
export type StatusTone = 'normal' | 'over';
export type StatusHandler = (name: string, text: string | null, tone: StatusTone) => void;
```

Do třídy přidat `private readonly tones = new Map<string, StatusTone>();` a upravit:

```ts
  setStatusHandler(handler: StatusHandler | null): void {
    this.statusHandler = handler;
    for (const [name, text] of this.status) handler?.(name, text, this.tones.get(name) ?? 'normal');
  }

  /** Zapíše nebo smaže políčko ve stavovém řádku. Tón `over` ho obarví jako varování. */
  setStatus(name: string, text: string | null, tone: StatusTone = 'normal'): void {
    if (text === null) { this.status.delete(name); this.tones.delete(name); }
    else { this.status.set(name, text); this.tones.set(name, tone); }
    this.statusHandler?.(name, text, tone);
  }
```

Exportovat `StatusTone` z `packages/core/src/index.ts` (do bloku `export type { … } from './ui/Registry.js'`).

- [ ] **Step 3: Tón ve stavovém řádku (UI)**

`StatusBar.ts`: v `StatusBarHandle` `setStatus(name: string, text: string | null, tone?: StatusTone): void;` (import typu z `@nibble/core`). V implementaci za `slot.textContent = text;` přidat:

```ts
      slot.classList.toggle('nb-status-over', tone === 'over');
```

`packages/ui/src/index.ts`: `editor.ui.setStatusHandler((name, text, tone) => statusbar?.setStatus(name, text, tone));`

CSS za ostatní `.nb-status` pravidla (najít `grep -n "nb-status" packages/ui/src/nibble.css`):

```css
.nb-status-over { color: var(--nb-danger, #c62828); font-weight: 600; }
```

- [ ] **Step 4: Plugin**

Nahradit `wordcount` v `tools.ts`:

```ts
export interface WordcountOptions {
  /** Doporučená délka. Překročení se jen ukáže a ohlásí, nic se neusekne. */
  maxChars?: number;
}

/**
 * Popisek do stavového řádku.
 *
 * S limitem se počítá všechno včetně mezer, stejně jako u `maxlength` —
 * limity bývají kvůli místu, kam text půjde (perex, meta popis), a tam
 * zabírá místo i mezera. Bez limitu zůstává původní počet bez mezer.
 */
export function wordcountLabel(text: string, maxChars?: number): { label: string; count: number; over: boolean } {
  const words = countWords(text) + ' slov · ';
  if (maxChars === undefined) {
    const count = text.replace(/\s/g, '').length;
    return { label: words + count + ' znaků', count, over: false };
  }
  const count = text.length;
  return { label: words + count + ' / ' + maxChars + ' znaků', count, over: count > maxChars };
}

/** Počet slov a znaků ve stavovém řádku, případně proti limitu. */
export function createWordcountPlugin(options: WordcountOptions = {}): Plugin {
  return {
    name: 'wordcount',

    setup(editor) {
      const max = options.maxChars;
      let wasOver = false;

      const update = (): void => {
        const { label, count, over } = wordcountLabel(editor.getText(), max);
        editor.ui.setStatus('wordcount', label, over ? 'over' : 'normal');

        // Jen při přechodu: formulář si podle toho zapne nebo vypne odeslání
        // a nemá dostávat stejnou zprávu po každém úhozu.
        if (max !== undefined && over !== wasOver) {
          wasOver = over;
          editor.dispatch('limit', { count, max, over });
        }
      };

      update();
      const off = editor.on('change', update);
      const offSet = editor.on('setcontent', update);

      return () => { off(); offSet(); editor.ui.setStatus('wordcount', null); };
    },
  };
}

export const wordcount: Plugin = createWordcountPlugin();
```

V `packages/plugins/src/index.ts` přidat `createWordcountPlugin, wordcountLabel` a `export type { WordcountOptions } from './tools.js';`.

Run: `npx vitest run packages/core/test/tools.test.ts && npm run typecheck` → PASS.

- [ ] **Step 5: e2e**

Do `demo/e2e.html` přidat `createWordcountPlugin` do importu a vystavit ho: `window.plugins = { createWordcountPlugin };` (za import). Do `e2e/tools.spec.ts` přidat:

```ts
test.describe('limit znaků', () => {
  async function mountLimited(page: import('@playwright/test').Page, htmlIn: string, max: number) {
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    await page.evaluate(([h, m]) => {
      const w = window as any;
      w.limits = [];
      return w.mount(h, { plugins: [w.plugins.createWordcountPlugin({ maxChars: m })] }).then(() => {
        w.ed.on('limit', (p: unknown) => w.limits.push(p));
      });
    }, [htmlIn, max] as const);
  }

  test('ukáže počet proti limitu a po překročení zčervená', async ({ page }) => {
    await mountLimited(page, '<p>abcd</p>', 5);
    const slot = page.locator('.nb-status[data-status=wordcount]');
    await expect(slot).toHaveText('1 slov · 4 / 5 znaků');

    await caret(page, 0, 4);
    await page.keyboard.type('ef');
    await expect(slot).toHaveText('1 slov · 6 / 5 znaků');
    await expect(slot).toHaveClass(/nb-status-over/);
    // Nic se neusekne.
    expect(await html(page)).toBe('<p>abcdef</p>');
  });

  test('událost limit přijde při přechodu oběma směry', async ({ page }) => {
    await mountLimited(page, '<p>abcd</p>', 5);
    await caret(page, 0, 4);
    await page.keyboard.type('ef');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    const limits = await page.evaluate(() => (window as any).limits);
    // 5 → 6 přejde přes limit, 6 → 5 zpátky; druhý Backspace (5 → 4) už nic.
    expect(limits).toEqual([
      { count: 6, max: 5, over: true },
      { count: 5, max: 5, over: false },
    ]);
  });
});
```

(Doplnit `caret`, `html` do importu z `./helpers.js`, pokud tam ještě nejsou.)

Run: `npm run build && npx playwright test e2e/tools.spec.ts` → PASS.

- [ ] **Step 6: CHANGELOG a commit**

```markdown
- `createWordcountPlugin({ maxChars })` — počítadlo ukáže „152 / 160 znaků“,
  po překročení zčervená a editor vyšle událost `limit` s `{ count, max, over }`.
  Psát jde dál a nic se neusekne; formulář si podle události může zakázat
  odeslání. S limitem se počítají i mezery, jako u `maxlength`.
```

```bash
git add packages/core/src packages/ui/src packages/plugins/src packages/core/test/tools.test.ts e2e/tools.spec.ts demo/e2e.html CHANGELOG.md
git commit -m "Limit znaků v počítadle"
```

---

### Task 4: Markdown zkratky

**Files:**
- Create: `packages/core/src/selection/textBefore.ts`
- Modify: `packages/core/src/index.ts` (export)
- Create: `packages/plugins/src/markdown.ts`
- Modify: `packages/plugins/src/index.ts`, `demo/e2e.html`
- Test: `packages/core/test/markdownShortcuts.test.ts` (nový), `e2e/markdownShortcuts.spec.ts` (nový)

**Interfaces:**
- Produces: `textBeforeCaret(block: Element, range: Range): string` z `@nibble/core`. Vrátí text od začátku bloku po začátek rozsahu. Používají ho Úkoly 6 a 7.
- Produces (`packages/plugins/src/markdown.ts`):
  ```ts
  export type BlockShortcut =
    | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
    | { kind: 'bullist' }
    | { kind: 'numlist'; start: number }
    | { kind: 'quote' }
    | { kind: 'task'; checked: boolean };
  export function matchBlockShortcut(textBefore: string): BlockShortcut | null;
  export function matchEnterShortcut(blockText: string): 'hr' | 'pre' | null;
  export interface InlineShortcut { tag: 'strong' | 'em' | 'code' | 's'; start: number; inner: string }
  export function matchInlineShortcut(textBefore: string): InlineShortcut | null;
  export const markdownShortcuts: Plugin; // name: 'markdown'
  ```
  Úkol 5 do pluginu doplní větev `task`. V tomto úkolu se `task` jen rozpozná a plugin ji přeskočí.

Princip pluginu: jádro vyvolá `input` těsně před `commit('type')`. Plugin si práci odloží do mikroúlohy, takže běží až po zápisu psaní. Úpravu pak provede uvnitř `editor.history.transact(...)`, kde se příkazy jádra (`formatBlock`, `bullist`…) nezapisují do historie, a nakonec zavolá jedno `editor.commit('markdown')`. První Ctrl+Z tak vrátí doslovný text.

- [ ] **Step 1: Padající unit testy čistých funkcí**

`packages/core/test/markdownShortcuts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { textBeforeCaret } from '../src/selection/textBefore.js';
import {
  matchBlockShortcut, matchEnterShortcut, matchInlineShortcut,
} from '../../plugins/src/markdown.js';

describe('blokové zkratky', () => {
  it.each([
    ['# ', { kind: 'heading', level: 1 }],
    ['### ', { kind: 'heading', level: 3 }],
    ['###### ', { kind: 'heading', level: 6 }],
    ['- ', { kind: 'bullist' }],
    ['* ', { kind: 'bullist' }],
    ['1. ', { kind: 'numlist', start: 1 }],
    ['5. ', { kind: 'numlist', start: 5 }],
    ['> ', { kind: 'quote' }],
    ['[ ] ', { kind: 'task', checked: false }],
    ['[x] ', { kind: 'task', checked: true }],
    ['[X] ', { kind: 'task', checked: true }],
  ])('%j', (text, expected) => {
    expect(matchBlockShortcut(text)).toEqual(expected);
  });

  it.each(['#', '####### ', 'a# ', 'Text - ', '1.', '1) ', ' - ', '# '])('%j nic', (text) => {
    expect(matchBlockShortcut(text)).toBeNull();
  });
});

describe('zkratky na Enter', () => {
  it('---', () => expect(matchEnterShortcut('---')).toBe('hr'));
  it('```', () => expect(matchEnterShortcut('```')).toBe('pre'));
  it.each(['--', '----', 'a---', '``` js'])('%j nic', (t) => expect(matchEnterShortcut(t)).toBeNull());
});

describe('řádkové zkratky', () => {
  it.each([
    ['ahoj **tučně**', { tag: 'strong', start: 5, inner: 'tučně' }],
    ['**a**', { tag: 'strong', start: 0, inner: 'a' }],
    ['x *kurzíva*', { tag: 'em', start: 2, inner: 'kurzíva' }],
    ['x _kurzíva_', { tag: 'em', start: 2, inner: 'kurzíva' }],
    ['kód `a+b`', { tag: 'code', start: 4, inner: 'a+b' }],
    ['~~pryč~~', { tag: 's', start: 0, inner: 'pryč' }],
    ['a **dvě slova**', { tag: 'strong', start: 2, inner: 'dvě slova' }],
  ])('%j', (text, expected) => {
    expect(matchInlineShortcut(text)).toEqual(expected);
  });

  it.each([
    'snake_case_',
    '** mezera**',
    '**mezera **',
    '**x*',
    '2 * 3 * 4',
    '****',
    'a*b*',
  ])('%j nic', (text) => {
    expect(matchInlineShortcut(text)).toBeNull();
  });
});

describe('text před kurzorem', () => {
  it('sečte text přes inline značky', () => {
    const { document } = parseWindow();
    const p = document.createElement('p');
    p.innerHTML = 'a<strong>b</strong>cd';
    const range = document.createRange();
    range.setStart(p.lastChild!, 1);
    expect(textBeforeCaret(p, range)).toBe('abc');
  });
});
```

Run: `npx vitest run packages/core/test/markdownShortcuts.test.ts` → FAIL (moduly neexistují).

Pozn.: `'a*b*'` nic, protože `*` uprostřed slova kurzívu nezačíná, stejně jako u `_`.

- [ ] **Step 2: `textBeforeCaret`**

`packages/core/src/selection/textBefore.ts`:

```ts
/**
 * Text bloku od jeho začátku po kurzor.
 *
 * Přes `Range.toString()`, ne `textContent` jednoho uzlu: odstavec bývá
 * rozdělený do více textových uzlů a značek a zkratka typu `# ` musí platit
 * pro celý začátek bloku, ne jen pro uzel, ve kterém kurzor zrovna stojí.
 */
export function textBeforeCaret(block: Element, range: Range): string {
  const doc = block.ownerDocument;
  const before = doc.createRange();
  before.setStart(block, 0);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString();
}
```

Do `packages/core/src/index.ts`: `export { textBeforeCaret } from './selection/textBefore.js';`

- [ ] **Step 3: Čisté funkce v `markdown.ts`**

`packages/plugins/src/markdown.ts`, první část:

```ts
import type { Editor, Plugin } from '@nibble/core';
import { closestBlock, fillIfEmpty, isEmptyBlock, textBeforeCaret } from '@nibble/core';

/**
 * Markdown zkratky při psaní.
 *
 * Napsané `## ` udělá z odstavce nadpis, `**slovo**` tučné slovo. Převádí se
 * až ve chvíli, kdy je vzor celý — dokud uživatel píše, editor mu pod rukama
 * nic nemění. A první Ctrl+Z převod vrátí: kdo chtěl opravdu napsat `# `,
 * nemá s editorem bojovat.
 */

export type BlockShortcut =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: 'bullist' }
  | { kind: 'numlist'; start: number }
  | { kind: 'quote' }
  | { kind: 'task'; checked: boolean };

/** Rozpozná blokovou zkratku. Text musí být **celý** začátek bloku včetně mezery. */
export function matchBlockShortcut(textBefore: string): BlockShortcut | null {
  let m = /^(#{1,6}) $/.exec(textBefore);
  if (m) return { kind: 'heading', level: m[1]!.length as 1 | 2 | 3 | 4 | 5 | 6 };
  if (/^[-*] $/.test(textBefore)) return { kind: 'bullist' };
  m = /^(\d{1,9})\. $/.exec(textBefore);
  if (m) return { kind: 'numlist', start: Number(m[1]) };
  if (textBefore === '> ') return { kind: 'quote' };
  m = /^\[([ xX])\] $/.exec(textBefore);
  if (m) return { kind: 'task', checked: m[1] !== ' ' };
  return null;
}

/** Zkratky potvrzované Enterem. Celý text bloku musí být přesně vzor. */
export function matchEnterShortcut(blockText: string): 'hr' | 'pre' | null {
  if (blockText === '---') return 'hr';
  if (blockText === '```') return 'pre';
  return null;
}

export interface InlineShortcut {
  tag: 'strong' | 'em' | 'code' | 's';
  /** Kde v textu začíná otevírací značka. */
  start: number;
  inner: string;
}

/**
 * Vzory pro řádkové zkratky. Pořadí je důležité: `**` se zkouší před `*`,
 * jinak by `**a**` skončilo jako kurzíva s hvězdičkami.
 *
 * Obsah nesmí začínat ani končit mezerou — `2 * 3 * 4` je násobení, ne
 * kurzíva. A otevírací `*` a `_` nesmí stát uprostřed slova, jinak by se
 * `snake_case_` převedlo hned po napsání podtržítka.
 */
const INLINE: ReadonlyArray<[RegExp, InlineShortcut['tag'], number]> = [
  [/(^|[^*])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, 'strong', 2],
  [/(^|[^~])~~([^~\s](?:[^~]*[^~\s])?)~~$/, 's', 2],
  [/(^|[^`])`([^`\s](?:[^`]*[^`\s])?)`$/, 'code', 1],
  [/(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, 'em', 1],
  [/(^|[^_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, 'em', 1],
];

export function matchInlineShortcut(textBefore: string): InlineShortcut | null {
  for (const [pattern, tag] of INLINE) {
    const m = pattern.exec(textBefore);
    if (!m) continue;
    return { tag, start: m.index + m[1]!.length, inner: m[2]! };
  }
  return null;
}
```

Run: `npx vitest run packages/core/test/markdownShortcuts.test.ts` → PASS. Kdyby test `'****'` nebo `'2 * 3 * 4'` neprošel, opravit regulární výraz, ne test.

- [ ] **Step 4: Plugin**

Pokračování `markdown.ts`:

```ts
/** Kde se zkratky nespouštějí: kód, odkaz, předformátovaný text. */
function insideLiteral(node: Node, root: Element): boolean {
  for (let cur: Node | null = node; cur && cur !== root; cur = cur.parentNode) {
    if (cur.nodeType === 1 && ['pre', 'code', 'a'].includes((cur as Element).tagName.toLowerCase())) return true;
  }
  return false;
}

/** Bloky, ve kterých má bloková zkratka smysl — obyčejný odstavec. */
function convertible(block: Element): boolean {
  const tag = block.tagName.toLowerCase();
  return tag === 'p' || tag === 'div';
}

/** Smaže začátek bloku po kurzor a postaví kurzor na začátek bloku. */
function dropPrefix(editor: Editor, block: Element, range: Range): void {
  const prefix = editor.document.createRange();
  prefix.setStart(block, 0);
  prefix.setEnd(range.startContainer, range.startOffset);
  prefix.deleteContents();
  if (isEmptyBlock(block)) fillIfEmpty(block, editor.document);
  editor.selection.collapseTo(block, 0);
}

/**
 * Úprava jako jeden krok historie.
 *
 * Příkazy jádra si commitují samy; v `transact` se jejich zápis zahodí
 * a uloží se jen výsledek celé zkratky.
 */
function asOneStep(editor: Editor, fn: () => void): void {
  editor.history.transact(fn);
  editor.commit('markdown');
}

function applyBlock(editor: Editor, block: Element, range: Range, rule: BlockShortcut): boolean {
  switch (rule.kind) {
    case 'heading':
      asOneStep(editor, () => { dropPrefix(editor, block, range); editor.exec('formatBlock', 'h' + rule.level); });
      return true;
    case 'bullist':
      asOneStep(editor, () => { dropPrefix(editor, block, range); editor.exec('bullist'); });
      return true;
    case 'numlist':
      asOneStep(editor, () => {
        dropPrefix(editor, block, range);
        editor.exec('numlist');
        if (rule.start !== 1) {
          const at = editor.selection.getRange()?.startContainer ?? null;
          const list = at && (at.nodeType === 1 ? at as Element : at.parentElement)?.closest('ol');
          list?.setAttribute('start', String(rule.start));
        }
      });
      return true;
    case 'quote':
      asOneStep(editor, () => { dropPrefix(editor, block, range); editor.exec('blockquote'); });
      return true;
    case 'task':
      // Doplní Úkol 5 — bez pluginu úkolů zůstane text, jak je.
      return false;
  }
}

function applyInline(editor: Editor, text: Text, offset: number, rule: InlineShortcut): void {
  const doc = editor.document;
  const tail = text.splitText(offset);
  const marked = text.splitText(rule.start);

  const wrapper = doc.createElement(rule.tag);
  wrapper.textContent = rule.inner;
  marked.parentNode!.replaceChild(wrapper, marked);

  // Kurzor za značku, ne do ní — další psaní už tučné být nemá.
  editor.selection.collapseTo(tail, 0);
}

export const markdownShortcuts: Plugin = {
  name: 'markdown',

  setup(editor) {
    const afterInput = (data: string): void => {
      if (editor.composing || editor.mode !== 'design') return;
      const range = editor.selection.getRange();
      if (!range || !range.collapsed || range.startContainer.nodeType !== 3) return;

      const text = range.startContainer as Text;
      if (insideLiteral(text, editor.root)) return;

      const block = closestBlock(text, editor.root);
      if (!block) return;

      if (data === ' ' && convertible(block)) {
        const rule = matchBlockShortcut(textBeforeCaret(block, range));
        if (rule && applyBlock(editor, block, range, rule)) return;
      }

      const inline = matchInlineShortcut(text.data.slice(0, range.startOffset));
      if (inline) asOneStep(editor, () => applyInline(editor, text, range.startOffset, inline));
    };

    // `input` přijde těsně před zápisem napsaného znaku do historie. Odložením
    // do mikroúlohy se zkratka zapíše až po něm — a Ctrl+Z ji vrátí samostatně.
    const offInput = editor.on('input', (payload: { data: string }) => {
      const data = payload.data;
      queueMicrotask(() => afterInput(data));
    });

    const onKeyDown = (event: Event): void => {
      const e = event as KeyboardEvent;
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing || editor.mode !== 'design') return;

      const range = editor.selection.getRange();
      if (!range || !range.collapsed) return;
      const block = closestBlock(range.startContainer, editor.root);
      if (!block || !convertible(block) || insideLiteral(range.startContainer, editor.root)) return;

      const rule = matchEnterShortcut(block.textContent ?? '');
      if (!rule) return;

      e.preventDefault();
      asOneStep(editor, () => {
        dropPrefix(editor, block, range);
        if (rule === 'pre') { editor.exec('formatBlock', 'pre'); return; }
        // Čára nahradí odstavec a za ní vznikne nový, do kterého se píše dál.
        editor.exec('hr');
      });
    };

    editor.root.addEventListener('keydown', onKeyDown);
    return () => { offInput(); editor.root.removeEventListener('keydown', onKeyDown); };
  },
};
```

Zkontrolovat chování příkazu `hr` v prázdném bloku (`packages/core/src/commands/blocks.ts:231-260`): po něm má být za čarou odstavec s kurzorem. Pokud čára nahradí odstavec a další blok nevznikne, doplnit ho uvnitř `asOneStep` za `editor.exec('hr')`.

Pozn. k typům: `editor.on` má typ `(payload: never) => void`. Pokud TS hlásí chybu u `(payload: { data: string })`, napsat obsluhu jako `(payload: never) => { const data = (payload as { data: string }).data; … }`.

Do `packages/plugins/src/index.ts`:

```ts
export {
  markdownShortcuts, matchBlockShortcut, matchEnterShortcut, matchInlineShortcut,
} from './markdown.js';
export type { BlockShortcut, InlineShortcut } from './markdown.js';
```

Do `demo/e2e.html`: přidat `markdownShortcuts` do importu a do výchozího seznamu `plugins`.

Run: `npx vitest run && npm run typecheck` → PASS.

- [ ] **Step 5: e2e**

`e2e/markdownShortcuts.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { caret, html, mount } from './helpers.js';

const undo = (page: import('@playwright/test').Page) => page.keyboard.press('ControlOrMeta+z');

test.describe('Markdown zkratky', () => {
  test('## a mezera udělá nadpis', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('## Nadpis');
    expect(await html(page)).toBe('<h2>Nadpis</h2>');
  });

  test('Ctrl+Z vrátí doslovný text', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('## ');
    await undo(page);
    expect(await html(page)).toBe('<p>## </p>');
  });

  test('- udělá odrážky, 3. číslovaný seznam od tří', async ({ page }) => {
    await mount(page, '<p><br></p><p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('- a');
    expect(await html(page)).toContain('<ul><li>a</li></ul>');

    await caret(page, 1, 0);
    await page.keyboard.type('3. b');
    expect(await html(page)).toContain('<ol start="3"><li>b</li></ol>');
  });

  test('> udělá citaci', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('> c');
    expect(await html(page)).toBe('<blockquote><p>c</p></blockquote>');
  });

  test('# uprostřed textu nic nedělá', async ({ page }) => {
    await mount(page, '<p>Text</p>');
    await caret(page, 0, 4);
    await page.keyboard.type(' # x');
    expect(await html(page)).toBe('<p>Text # x</p>');
  });

  test('**tučně** a další psaní už tučné není', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('a **b** c');
    expect(await html(page)).toBe('<p>a <strong>b</strong> c</p>');
  });

  test('`kód`, _kurzíva_, ~~pryč~~', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('`k` _i_ ~~s~~');
    expect(await html(page)).toBe('<p><code>k</code> <em>i</em> <s>s</s></p>');
  });

  test('snake_case_name zůstane textem', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('snake_case_name');
    expect(await html(page)).toBe('<p>snake_case_name</p>');
  });

  test('--- a Enter udělá čáru', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('---');
    await page.keyboard.press('Enter');
    await page.keyboard.type('dál');
    expect(await html(page)).toBe('<hr><p>dál</p>');
  });

  test('``` a Enter udělá blok kódu, zkratky v něm neplatí', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('```');
    await page.keyboard.press('Enter');
    await page.keyboard.type('**x** ');
    expect(await html(page)).toBe('<pre>**x** </pre>');
  });
});
```

Run: `npm run build && npx playwright test e2e/markdownShortcuts.spec.ts` → PASS.

Pak spustit **celou** e2e sadu: `npm run e2e`. Plugin je teď ve výchozí sadě testovací stránky, takže starší test, který píše třeba `- ` nebo `1. ` na začátek odstavce, se může změnit. Takovému testu předat v `mount` explicitní seznam pluginů bez `markdownShortcuts` a v commitu to zmínit. Očekávání testu neměnit.

- [ ] **Step 6: README, CHANGELOG, commit**

README: nová sekce `## Markdown při psaní` za `## Mapa znaků a české uvozovky`. Obsahuje tabulku zkratek ze specifikace a větu „První Ctrl+Z převod vrátí a nechá napsaný text.“

CHANGELOG / Přidáno:

```markdown
- Plugin `markdownShortcuts` — při psaní převádí `# `–`###### `, `- `, `* `,
  `1. `, `> `, `---`+Enter, ```` ``` ````+Enter, `**tučně**`, `*kurzíva*`,
  `_kurzíva_`, `` `kód` `` a `~~přeškrtnutí~~`. První Ctrl+Z převod vrátí.
  V kódu a v odkazech se nespouští.
```

```bash
git add packages/core/src packages/plugins/src packages/core/test/markdownShortcuts.test.ts e2e demo/e2e.html README.md CHANGELOG.md
git commit -m "Markdown zkratky při psaní"
```

---

### Task 5: Seznam úkolů

**Files:**
- Modify: `packages/core/src/history/History.ts` (vnořitelné `transact`)
- Modify: `packages/core/src/commands/lists.ts:256-273` (událost `itemsplit`)
- Create: `packages/plugins/src/tasks.ts`
- Modify: `packages/plugins/src/markdown.ts` (větev `task`)
- Modify: `tools/build-icons.mjs` → regenerovat `packages/ui/src/icons.ts`
- Modify: `packages/ui/src/nibble.css`, `packages/ui/src/index.ts` (`DEFAULT_LAYOUT`), `packages/ui/src/Menubar.ts` (`DEFAULT_MENUBAR`)
- Modify: `packages/plugins/src/index.ts`, `demo/e2e.html`
- Test: `packages/core/test/history.test.ts` (nový), `packages/core/test/tasks.test.ts` (nový), `e2e/tasks.spec.ts` (nový)

**Interfaces:**
- Consumes: `matchBlockShortcut` → `{ kind: 'task', checked }` z Úkolu 4.
- Produces: událost `itemsplit` s payloadem `{ from: Element; to: Element }` (obě `<li>`), vyvolaná před `commit('split')`.
- Produces (`tasks.ts`): `isTaskList(list: Element | null): boolean`, `isTaskItem(node: Node | null): node is Element`, `toTaskList(list: Element): void`, `fromTaskList(list: Element): void`, `setTaskChecked(li: Element, checked: boolean): void`, plugin `tasks` (name `'tasks'`), příkaz `tasklist`, tlačítko `tasklist`.

- [ ] **Step 1: Padající test vnořeného `transact`**

`packages/core/test/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { History } from '../src/history/History.js';

const snap = (html: string) => ({ html, mark: null, kind: 'x', at: 0 });

describe('transact', () => {
  it('vnořený transact neodemkne vnější', () => {
    const h = new History(snap('a'));
    h.transact(() => {
      h.transact(() => h.push(snap('b')));
      h.push(snap('c'));
    });
    h.push(snap('d'));
    expect(h.undo()?.html).toBe('a');
  });
});
```

Run: `npx vitest run packages/core/test/history.test.ts` → FAIL (`undo()` vrátí `'c'`).

- [ ] **Step 2: Vnořitelné `transact`**

V `History.ts` nahradit `private locked = false;` za `private depth = 0;` a:

```ts
  /**
   * Zamkne zásobník na dobu, kdy sám obnovuje obsah.
   *
   * Počítadlo, ne příznak: plugin může v `transact` spustit příkaz, který si
   * `transact` volá sám — a vnitřní konec by jinak zámek uvolnil předčasně.
   */
  get isLocked(): boolean { return this.depth > 0; }
```

V `push` `if (this.locked) return;` → `if (this.depth > 0) return;`. A:

```ts
  transact<T>(fn: () => T): T {
    this.depth++;
    try { return fn(); } finally { this.depth--; }
  }
```

Run: `npx vitest run` → PASS.

- [ ] **Step 3: Událost `itemsplit`**

V `lists.ts` v `insertParagraphInList` mezi `const next = splitListItem(...)` a `editor.selection.collapseTo(...)`:

```ts
  // Položka se dělí s atributy — pluginy, které v nich drží stav (úkol a jeho
  // zaškrtnutí), si novou položku srovnají dřív, než se zapíše do historie.
  editor.dispatch('itemsplit', { from: li, to: next });
```

- [ ] **Step 4: Padající unit test modelu úkolů**

`packages/core/test/tasks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { fromTaskList, isTaskItem, isTaskList, setTaskChecked, toTaskList } from '../../plugins/src/tasks.js';

function list(html: string): Element {
  const { document } = parseWindow();
  const box = document.createElement('div');
  box.innerHTML = html;
  return box.firstElementChild!;
}

describe('úkoly', () => {
  it('z odrážek udělá úkoly, zaškrtnutí nastaví na ne', () => {
    const ul = list('<ul><li>a</li><li>b</li></ul>');
    toTaskList(ul);
    expect(ul.outerHTML).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">a</li>'
      + '<li data-type="taskItem" data-checked="false">b</li></ul>',
    );
    expect(isTaskList(ul)).toBe(true);
    expect(isTaskItem(ul.firstElementChild)).toBe(true);
  });

  it('existující zaškrtnutí nechá', () => {
    const ul = list('<ul><li data-checked="true">a</li></ul>');
    toTaskList(ul);
    expect(ul.firstElementChild!.getAttribute('data-checked')).toBe('true');
  });

  it('zpětný převod odstraní jen svoje atributy', () => {
    const ul = list('<ul data-type="taskList" class="x"><li data-type="taskItem" data-checked="true" id="k">a</li></ul>');
    fromTaskList(ul);
    expect(ul.outerHTML).toBe('<ul class="x"><li id="k">a</li></ul>');
  });

  it('vnořený seznam je samostatný', () => {
    const ul = list('<ul><li>a<ul><li>b</li></ul></li></ul>');
    toTaskList(ul);
    expect(ul.querySelector('ul ul li')!.hasAttribute('data-type')).toBe(false);
  });

  it('přepnutí zaškrtnutí', () => {
    const ul = list('<ul data-type="taskList"><li data-type="taskItem" data-checked="false">a</li></ul>');
    setTaskChecked(ul.firstElementChild!, true);
    expect(ul.firstElementChild!.getAttribute('data-checked')).toBe('true');
  });
});
```

Run: `npx vitest run packages/core/test/tasks.test.ts` → FAIL.

- [ ] **Step 5: `tasks.ts`**

```ts
import type { Editor, Plugin } from '@nibble/core';
import { closestListItem, listOf } from '@nibble/core';

/**
 * Seznam úkolů.
 *
 * Formát je TipTapův — `data-type="taskList"` a `data-checked` — aby se úkoly
 * zkopírované z aplikací na TipTapu poznaly samy. Zaškrtávátko je jen CSS:
 * `<input>` v `contenteditable` dělá kolem sebe s kurzorem neplechu a na webu
 * by stejně potřeboval vlastní pravidla.
 */

const TYPE = 'data-type';
const CHECKED = 'data-checked';

export function isTaskList(list: Element | null): boolean {
  return !!list && list.getAttribute(TYPE) === 'taskList';
}

export function isTaskItem(node: Node | null): node is Element {
  return !!node && node.nodeType === 1 && (node as Element).getAttribute(TYPE) === 'taskItem';
}

/** Přímé položky seznamu — vnořené seznamy mají vlastní druh. */
function items(list: Element): Element[] {
  return Array.from(list.children).filter((c) => c.tagName.toLowerCase() === 'li');
}

export function toTaskList(list: Element): void {
  list.setAttribute(TYPE, 'taskList');
  for (const li of items(list)) {
    li.setAttribute(TYPE, 'taskItem');
    if (li.getAttribute(CHECKED) !== 'true') li.setAttribute(CHECKED, 'false');
  }
}

export function fromTaskList(list: Element): void {
  list.removeAttribute(TYPE);
  for (const li of items(list)) {
    li.removeAttribute(TYPE);
    li.removeAttribute(CHECKED);
  }
}

export function setTaskChecked(li: Element, checked: boolean): void {
  li.setAttribute(CHECKED, checked ? 'true' : 'false');
}

function listAtCaret(editor: Editor): Element | null {
  const range = editor.selection.getRange();
  const li = range ? closestListItem(range.startContainer, editor.root) : null;
  return li ? listOf(li) : null;
}

/** Šířka oblasti zaškrtávátka — levé odsazení položky, kam ho kreslí CSS. */
function inCheckbox(li: Element, clientX: number): boolean {
  const box = li.getBoundingClientRect();
  const pad = parseFloat(li.ownerDocument.defaultView!.getComputedStyle(li).paddingLeft) || 0;
  return clientX >= box.left && clientX < box.left + pad;
}

export const tasks: Plugin = {
  name: 'tasks',

  setup(editor) {
    editor.commands.add('tasklist', (ed) => {
      const current = listAtCaret(ed);
      if (isTaskList(current)) {
        fromTaskList(current!);
        ed.commit('task');
        return true;
      }

      // Z čehokoli jiného nejdřív odrážky — přes příkaz jádra, který umí
      // výběr přes více odstavců i převod z číslování. Jeho zápis do historie
      // se zahodí: celý převod je jeden krok.
      ed.history.transact(() => {
        if (current?.tagName.toLowerCase() !== 'ul') ed.exec('bullist');
      });

      const list = listAtCaret(ed);
      if (!list) return false;
      toTaskList(list);
      ed.commit('task');
      return true;
    });

    editor.ui.addButton('tasklist', {
      icon: 'tasklist', tooltip: 'Úkoly',
      active: (ed) => isTaskList(listAtCaret(ed)),
      onAction: (ed) => { ed.focus(); ed.exec('tasklist'); },
    });

    const offSplit = editor.on('itemsplit', (payload: never) => {
      const { from, to } = payload as { from: Element; to: Element };
      if (isTaskItem(from)) setTaskChecked(to, false);
    });

    /**
     * Klik do zaškrtávátka.
     *
     * `mousedown` a `preventDefault`: kurzor se nemá přesunout na začátek
     * položky — uživatel odškrtává, ne edituje.
     */
    const onMouseDown = (event: Event): void => {
      const e = event as MouseEvent;
      if (editor.mode !== 'design' || e.button !== 0) return;

      const li = (e.target as Element | null)?.closest?.('li');
      if (!li || !editor.root.contains(li) || !isTaskItem(li) || !inCheckbox(li, e.clientX)) return;

      e.preventDefault();
      setTaskChecked(li, li.getAttribute(CHECKED) !== 'true');
      editor.commit('task');
    };

    editor.root.addEventListener('mousedown', onMouseDown);
    return () => { offSplit(); editor.root.removeEventListener('mousedown', onMouseDown); };
  },
};
```

Run: `npx vitest run packages/core/test/tasks.test.ts` → PASS. Pokud `closestListItem`/`listOf` z `@nibble/core` při běhu ve vitestu nejdou (import balíčku), zkontrolovat, jak to řeší `table.ts`, a postupovat stejně.

- [ ] **Step 6: Větev `task` v Markdown zkratkách**

V `markdown.ts` nahradit `case 'task'`:

```ts
    case 'task':
      // Bez pluginu úkolů zůstane `[ ] ` textem.
      if (!editor.can('tasklist')) return false;
      asOneStep(editor, () => {
        dropPrefix(editor, block, range);
        editor.exec('tasklist');
        if (rule.checked) {
          const at = editor.selection.getRange()?.startContainer ?? null;
          const li = at && (at.nodeType === 1 ? at as Element : at.parentElement)?.closest('li');
          li?.setAttribute('data-checked', 'true');
        }
      });
      return true;
```

- [ ] **Step 7: Ikona, lišta, nabídka, CSS**

`tools/build-icons.mjs`:
- do `LABELS` přidat `tasklist: 'Úkoly',`,
- do map přidat `lucide: tasklist: 'list-checks'`, `tabler: tasklist: 'list-check'`, `ph: tasklist: 'list-checks'`.

Pak `npm run icons`. Ověřit `git diff --stat packages/ui/src/icons.ts` (přibyla jedna ikona) a že `npx vitest run packages/core/test/icons.test.ts` prochází. Pokud test kontroluje počet ikon, upravit číslo v testu i v komentáři „Do balíčku jde N ikon“.

`packages/ui/src/index.ts` `DEFAULT_LAYOUT`: `['bullist', 'numlist', 'tasklist'],`.
`Menubar.ts` `DEFAULT_MENUBAR` → Formát → Seznam: za `{ control: 'numlist' }` přidat `{ control: 'tasklist' }`.

CSS do `nibble.css` za `.nb-content ul, .nb-content ol { … }`:

```css
/* Úkoly. Pravidla stojí na položce, ne na seznamu: položka nese stav, a když
   se seznam rozdělí, nový obal atribut `data-type` mít nemusí. */
.nb-content ul[data-type="taskList"] { padding-left: .2em; }
.nb-content li[data-type="taskItem"] {
  list-style: none;
  position: relative;
  padding-left: 1.7em;
}
.nb-content li[data-type="taskItem"]::before {
  content: '';
  position: absolute;
  left: .1em;
  top: .3em;
  width: 1em;
  height: 1em;
  border: 1.5px solid currentColor;
  border-radius: 3px;
  opacity: .6;
  cursor: pointer;
  box-sizing: border-box;
}
.nb-content li[data-type="taskItem"][data-checked="true"]::before {
  opacity: 1;
  background: var(--nb-accent) center / 80% no-repeat
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12l5 5L20 7'/%3E%3C/svg%3E");
  border-color: var(--nb-accent);
}
.nb-content li[data-type="taskItem"][data-checked="true"] { color: var(--nb-muted, #8a8f98); }
```

(Ověřit, že `--nb-accent` existuje. Podle `nibble.css:790` ano.)

Do `packages/plugins/src/index.ts`: `export { tasks, isTaskList, isTaskItem, toTaskList, fromTaskList, setTaskChecked } from './tasks.js';`
Do `demo/e2e.html`: `tasks` do importu a do výchozího seznamu.

- [ ] **Step 8: e2e**

`e2e/tasks.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { CONTENT, caret, html, mount } from './helpers.js';

const TASKS = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">a</li></ul>';

test.describe('úkoly', () => {
  test('tlačítko udělá z odstavce úkol', async ({ page }) => {
    await mount(page, '<p>koupit mléko</p>');
    await caret(page, 0, 3);
    await page.locator('.nb-toolbar .nb-btn[data-control=tasklist]').click();
    expect(await html(page)).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">koupit mléko</li></ul>',
    );
  });

  test('klik do zaškrtávátka přepne stav a Ctrl+Z ho vrátí', async ({ page }) => {
    await mount(page, TASKS);
    // Fokus do editoru — klik do zaškrtávátka ho schválně nebere a Ctrl+Z
    // by jinak šlo mimo.
    await caret(page, 0, 1);
    const li = page.locator(`${CONTENT} li`).first();
    const box = (await li.boundingBox())!;
    await page.mouse.click(box.x + 6, box.y + box.height / 2);
    expect(await html(page)).toContain('data-checked="false"');

    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toContain('data-checked="true"');
  });

  test('Enter na zaškrtnutém úkolu dá nezaškrtnutý', async ({ page }) => {
    await mount(page, TASKS);
    await caret(page, 0, 1);
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');
    expect(await html(page)).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">a</li>'
      + '<li data-type="taskItem" data-checked="false">b</li></ul>',
    );
  });

  test('Enter na prázdném úkolu ze seznamu vyskočí', async ({ page }) => {
    await mount(page, TASKS);
    await caret(page, 0, 1);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('x');
    expect(await html(page)).toMatch(/<\/ul><p>x<\/p>$/);
  });

  test('[x] při psaní a Ctrl+Z', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('[x] ');
    expect(await html(page)).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><br></li></ul>',
    );
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe('<p>[x] </p>');
  });

  test('[ ] založí nezaškrtnutý úkol', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('[ ] koupit');
    expect(await html(page)).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">koupit</li></ul>',
    );
  });

  test('úkoly z TipTapu projdou vložením', async ({ page }) => {
    await mount(page, '<p>x</p>');
    await caret(page, 0, 1);
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/html', '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>z TipTapu</p></li></ul>');
      (window as any).ed.root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    expect(await html(page)).toContain('data-checked="true"');
  });
});
```

Run: `npm run build && npx playwright test e2e/tasks.spec.ts e2e/lists.spec.ts` → PASS.

Prázdná položka po `[x] ` se serializuje s výplní `<br>`, stejně jako prázdné odstavce jinde v Nibble. Kdyby serializer výplň u `<li>` vynechával, srovnat očekávání s tím, co pro prázdnou položku dávají testy v `e2e/lists.spec.ts`.

- [ ] **Step 9: README, CHANGELOG, commit**

README: nová sekce `## Úkoly` s ukázkou formátu a s CSS útržkem pro web:

```css
/* Úkoly z Nibble na webu */
li[data-type="taskItem"] { list-style: none; }
li[data-type="taskItem"]::before { content: '☐ '; }
li[data-type="taskItem"][data-checked="true"]::before { content: '☑ '; }
```

CHANGELOG / Přidáno:

```markdown
- Plugin `tasks` — seznam úkolů se zaškrtávátky (`<ul data-type="taskList">`,
  `<li data-type="taskItem" data-checked>`, formát jako TipTap). Klik do
  zaškrtávátka přepne stav, Enter dá nový nezaškrtnutý úkol, `[ ] ` a `[x] `
  při psaní úkol založí. CSS pro veřejný web je v README.
- Událost `itemsplit` `{ from, to }` při dělení položky seznamu Enterem.

### Změněno

- `History.transact` jde vnořit.
```

```bash
git add packages tools/build-icons.mjs e2e demo/e2e.html README.md CHANGELOG.md
git commit -m "Seznam úkolů"
```

---

### Task 6: Rozbalovací blok

**Files:**
- Modify: `packages/core/src/dom/blocks.ts:1-7` (`summary` do `BLOCKS`)
- Modify: `packages/core/src/input/Paste.ts:29-34` (`details`, `summary` do `PASTE_ALLOWED_TAGS`)
- Create: `packages/plugins/src/details.ts`
- Modify: `tools/build-icons.mjs` + `npm run icons`, `packages/ui/src/nibble.css`, `packages/ui/src/Menubar.ts`, `packages/plugins/src/index.ts`, `demo/e2e.html`
- Test: `packages/core/test/details.test.ts` (nový), `e2e/details.spec.ts` (nový)

**Interfaces:**
- Consumes: `textBeforeCaret`, `closestBlock`, `fillIfEmpty` z `@nibble/core`.
- Produces: `closestDetails(node: Node | null, root: Element): HTMLDetailsElement | null`, `wrapInDetails(doc: Document, blocks: Element[], title: string): HTMLDetailsElement`, `unwrapDetails(details: Element): Node | null` (vrátí první vybalený uzel), plugin `details` (name `'details'`), příkazy `details`, `detailsopen`, `undetails`, tlačítka stejných jmen.

- [ ] **Step 1: Padající unit test**

`packages/core/test/details.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { unwrapDetails, wrapInDetails } from '../../plugins/src/details.js';
import { closestBlock } from '../src/dom/blocks.js';

describe('rozbalovací blok', () => {
  it('obalí bloky a přidá nadpis', () => {
    const { document } = parseWindow();
    const root = document.createElement('div');
    root.innerHTML = '<p>a</p><p>b</p>';
    const d = wrapInDetails(document, Array.from(root.children), 'Nadpis');
    expect(root.innerHTML).toBe('<details><summary>Nadpis</summary><p>a</p><p>b</p></details>');
    expect(d.tagName.toLowerCase()).toBe('details');
  });

  it('zrušení vrátí nadpis jako odstavec a obsah za něj', () => {
    const { document } = parseWindow();
    const root = document.createElement('div');
    root.innerHTML = '<details open><summary>N</summary><p>a</p></details>';
    unwrapDetails(root.firstElementChild!);
    expect(root.innerHTML).toBe('<p>N</p><p>a</p>');
  });

  it('summary je blok, do kterého se píše', () => {
    const { document } = parseWindow();
    const root = document.createElement('div');
    root.innerHTML = '<details><summary>N</summary></details>';
    const text = root.querySelector('summary')!.firstChild!;
    expect(closestBlock(text, root)?.tagName.toLowerCase()).toBe('summary');
  });
});
```

Run → FAIL.

- [ ] **Step 2: Jádro**

`dom/blocks.ts`, `BLOCKS`: přidat `'summary'` s komentářem:

```ts
  // `summary` je řádek, do kterého se píše; `details` je obal jako citace.
  'summary',
```

`Paste.ts`, `PASTE_ALLOWED_TAGS`: přidat `'details', 'summary'`.

- [ ] **Step 3: `details.ts`**

```ts
import type { Editor, Plugin } from '@nibble/core';
import { blocksInRange, closestBlock, fillIfEmpty, textBeforeCaret } from '@nibble/core';

/**
 * Rozbalovací blok `<details>`.
 *
 * V editoru je obsah vidět vždycky (CSS `::details-content`) a klik na nadpis
 * blok nesbaluje. Sbalení by měnilo atribut `open`, tedy HTML, a to jen
 * proto, že si uživatel klikl. Jestli bude blok na webu rozbalený, se
 * rozhoduje vědomě, tlačítkem v kontextové liště.
 */

export function closestDetails(node: Node | null, root: Element): HTMLDetailsElement | null {
  for (let cur = node; cur && cur !== root; cur = cur.parentNode) {
    if (cur.nodeType === 1 && (cur as Element).tagName.toLowerCase() === 'details') return cur as HTMLDetailsElement;
  }
  return null;
}

function closestSummary(node: Node | null, root: Element): Element | null {
  for (let cur = node; cur && cur !== root; cur = cur.parentNode) {
    if (cur.nodeType === 1 && (cur as Element).tagName.toLowerCase() === 'summary') return cur as Element;
  }
  return null;
}

export function wrapInDetails(doc: Document, blocks: Element[], title: string): HTMLDetailsElement {
  const details = doc.createElement('details');
  const summary = doc.createElement('summary');
  summary.textContent = title;
  details.appendChild(summary);

  const first = blocks[0];
  first?.parentNode?.insertBefore(details, first);
  for (const block of blocks) details.appendChild(block);
  return details;
}

export function unwrapDetails(details: Element): Node | null {
  const doc = details.ownerDocument;
  const parent = details.parentNode;
  if (!parent) return null;

  let first: Node | null = null;
  for (const child of Array.from(details.childNodes)) {
    let node: Node = child;
    if (child.nodeType === 1 && (child as Element).tagName.toLowerCase() === 'summary') {
      const p = doc.createElement('p');
      while (child.firstChild) p.appendChild(child.firstChild);
      fillIfEmpty(p, doc);
      node = p;
    }
    parent.insertBefore(node, details);
    first ??= node;
  }
  details.remove();
  return first;
}

/** Bloky nejvyšší úrovně v rámci rodiče, kterých se výběr dotýká. */
function topLevelBlocks(editor: Editor, range: Range): Element[] {
  const blocks = blocksInRange(range, editor.root);
  const start = blocks[0] ?? closestBlock(range.startContainer, editor.root);
  if (!start) return [];
  const parent = start.parentNode;
  return (blocks.length ? blocks : [start]).filter((b) => b.parentNode === parent);
}

export const details: Plugin = {
  name: 'details',

  setup(editor) {
    editor.commands.add('details', (ed) => {
      const range = ed.selection.getRange();
      if (!range) return false;

      const doc = ed.document;
      let blocks = range.collapsed ? [] : topLevelBlocks(ed, range);
      if (blocks.length === 0) {
        // Bez výběru vznikne nový blok za odstavcem pod kurzorem.
        const p = doc.createElement('p');
        fillIfEmpty(p, doc);
        const current = closestBlock(range.startContainer, ed.root);
        if (current?.parentNode) current.parentNode.insertBefore(p, current.nextSibling);
        else ed.root.appendChild(p);
        blocks = [p];
      }

      const d = wrapInDetails(doc, blocks, 'Nadpis');
      const title = d.querySelector('summary')!;
      const select = doc.createRange();
      select.selectNodeContents(title);
      ed.selection.setRange(select);
      ed.commit('details');
      return true;
    });

    editor.commands.add('detailsopen', (ed) => {
      const d = closestDetails(ed.selection.getRange()?.startContainer ?? null, ed.root);
      if (!d) return false;
      d.toggleAttribute('open');
      ed.commit('details');
      return true;
    }, (ed) => closestDetails(ed.selection.getRange()?.startContainer ?? null, ed.root) !== null);

    editor.commands.add('undetails', (ed) => {
      const d = closestDetails(ed.selection.getRange()?.startContainer ?? null, ed.root);
      if (!d) return false;
      const first = unwrapDetails(d);
      if (first) ed.selection.collapseTo(first, 0);
      ed.commit('details');
      return true;
    }, (ed) => closestDetails(ed.selection.getRange()?.startContainer ?? null, ed.root) !== null);

    editor.ui.addButton('details', {
      icon: 'details', tooltip: 'Rozbalovací blok',
      onAction: (ed) => { ed.focus(); ed.exec('details'); },
    });
    editor.ui.addButton('detailsopen', {
      icon: 'detailsopen', tooltip: 'Rozbalený na webu',
      active: (ed) => !!closestDetails(ed.selection.getRange()?.startContainer ?? null, ed.root)?.hasAttribute('open'),
      onAction: (ed) => { ed.focus(); ed.exec('detailsopen'); },
    });
    editor.ui.addButton('undetails', {
      icon: 'trash', tooltip: 'Zrušit blok',
      onAction: (ed) => { ed.focus(); ed.exec('undetails'); },
    });

    editor.ui.addContextToolbar('details', {
      match: (node, ed) => closestDetails(node, ed.root),
      items: ['detailsopen', 'undetails'],
      priority: 5,
    });

    // Klik na nadpis blok v editoru nesbalí — viz komentář nahoře.
    const onClick = (event: Event): void => {
      if (closestSummary(event.target as Node, editor.root)) event.preventDefault();
    };

    const onKeyDown = (event: Event): void => {
      const e = event as KeyboardEvent;
      if (editor.mode !== 'design' || e.isComposing) return;
      const range = editor.selection.getRange();
      if (!range || !range.collapsed) return;

      const summary = closestSummary(range.startContainer, editor.root);

      // Enter v nadpisu skočí do obsahu, nový nadpis nevzniká.
      if (e.key === 'Enter' && summary) {
        e.preventDefault();
        let body = summary.nextElementSibling;
        if (!body) {
          body = editor.document.createElement('p');
          fillIfEmpty(body, editor.document);
          summary.parentNode!.appendChild(body);
          editor.selection.collapseTo(body, 0);
          editor.commit('details');
          return;
        }
        editor.selection.collapseTo(body, 0);
        return;
      }

      if (e.key !== 'Backspace') return;

      // Backspace na začátku nadpisu by ho slil s blokem nad ním a na začátku
      // obsahu by obsah vlil do nadpisu. Ani jedno uživatel nečeká.
      if (summary && textBeforeCaret(summary, range) === '') { e.preventDefault(); return; }

      const block = closestBlock(range.startContainer, editor.root);
      const prev = block?.previousElementSibling;
      if (block && prev?.tagName.toLowerCase() === 'summary' && textBeforeCaret(block, range) === '') {
        e.preventDefault();
      }
    };

    editor.root.addEventListener('click', onClick);
    editor.root.addEventListener('keydown', onKeyDown);
    return () => {
      editor.root.removeEventListener('click', onClick);
      editor.root.removeEventListener('keydown', onKeyDown);
    };
  },
};
```

Run: `npx vitest run packages/core/test/details.test.ts` → PASS.

- [ ] **Step 4: Ikony, nabídka, CSS, exporty**

`build-icons.mjs`:
- `LABELS`: `details: 'Rozbalovací blok', detailsopen: 'Rozbalený na webu',`
- lucide `details: 'list-collapse', detailsopen: 'chevrons-down-up'`
- tabler `details: 'layout-bottombar-expand', detailsopen: 'layout-navbar-expand'`
- ph `details: 'caret-circle-down', detailsopen: 'rows-plus-bottom'`

Pak `npm run icons` a `npx vitest run packages/core/test/icons.test.ts`.

`Menubar.ts` → Vložit: za `{ ...S(), control: 'table' }, { control: 'hr' },` přidat `{ control: 'details' },`.

CSS:

```css
/* Rozbalovací blok: v editoru vždy rozbalený, sbalení je věc webu. */
.nb-content details {
  border: 1px solid var(--nb-border, #d0d4da);
  border-radius: 6px;
  padding: .3em .8em;
  margin: .6em 0;
}
.nb-content details::details-content { content-visibility: visible; display: block; }
.nb-content summary { font-weight: 600; cursor: text; }
.nb-content details:not([open]) > summary::after {
  content: ' · na webu sbalený';
  font-weight: 400;
  color: var(--nb-muted, #8a8f98);
  user-select: none;
}
```

`packages/plugins/src/index.ts`: `export { details, closestDetails, wrapInDetails, unwrapDetails } from './details.js';`
`demo/e2e.html`: `details` do importu a do výchozího seznamu.

- [ ] **Step 5: e2e**

`e2e/details.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { CONTENT, caret, html, mount } from './helpers.js';

const BLOCK = '<details><summary>Otázka</summary><p>Odpověď</p></details>';

test.describe('rozbalovací blok', () => {
  test('obsah sbaleného bloku je v editoru vidět', async ({ page }) => {
    await mount(page, BLOCK);
    await expect(page.locator(`${CONTENT} details p`)).toBeVisible();
  });

  test('klik na nadpis nezmění HTML', async ({ page }) => {
    await mount(page, BLOCK);
    await page.locator(`${CONTENT} summary`).click();
    expect(await html(page)).toBe(BLOCK);
  });

  test('vložení z nabídky Vložit, psaní nadpisu, Enter do obsahu', async ({ page }) => {
    await mount(page, '<p>x</p>');
    await caret(page, 0, 1);
    await page.locator('.nb-menubar-item', { hasText: 'Vložit' }).click();
    await page.locator('.nb-menu-item, [role=menuitem]', { hasText: 'Rozbalovací blok' }).click();
    await page.keyboard.type('Q');
    await page.keyboard.press('Enter');
    await page.keyboard.type('A');
    expect(await html(page)).toBe('<p>x</p><details><summary>Q</summary><p>A</p></details>');
  });

  test('přepínač Rozbalený na webu', async ({ page }) => {
    await mount(page, BLOCK);
    await caret(page, 0, 1);
    await page.locator('.nb-context .nb-btn[data-control=detailsopen]').click();
    expect(await html(page)).toBe('<details open=""><summary>Otázka</summary><p>Odpověď</p></details>');
  });

  test('Backspace na začátku obsahu nevlije obsah do nadpisu', async ({ page }) => {
    await mount(page, BLOCK);
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.selection.collapseTo(ed.root.querySelector('details p').firstChild, 0);
      ed.root.focus();
    });
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe(BLOCK);
  });

  test('Zrušit blok', async ({ page }) => {
    await mount(page, BLOCK);
    await caret(page, 0, 1);
    await page.locator('.nb-context .nb-btn[data-control=undetails]').click();
    expect(await html(page)).toBe('<p>Otázka</p><p>Odpověď</p>');
  });
});
```

Selektor položky nabídkového pruhu ověřit podle `e2e/menubar.spec.ts` a použít ten, který tam už funguje. Serializace atributu `open` (`open=""` nebo `open`) se řídí `Serializer.ts`: očekávání sladit s tím, jak serializer zapisuje booleovské atributy (`grep -n "boolean\|=\"\"" packages/core/src/model/Serializer.ts`).

Run: `npm run build && npx playwright test e2e/details.spec.ts e2e/blocks.spec.ts` → PASS.

- [ ] **Step 6: CHANGELOG a commit**

```markdown
- Plugin `details` — rozbalovací blok `<details><summary>`. V editoru je obsah
  vždy vidět a klik na nadpis nic nesbaluje; jestli bude blok na webu
  rozbalený, se přepíná v kontextové liště. `details` a `summary` projdou
  vložením ze schránky.
```

```bash
git add packages tools/build-icons.mjs e2e demo/e2e.html CHANGELOG.md
git commit -m "Rozbalovací blok details"
```

---

### Task 7: Lomítkové příkazy

**Files:**
- Create: `packages/core/src/ui/suggest.ts`
- Modify: `packages/core/src/ui/Registry.ts` (`addSuggestion`, `suggestions`)
- Modify: `packages/core/src/index.ts`
- Create: `packages/ui/src/CaretMenu.ts`
- Modify: `packages/ui/src/index.ts` (připojení v `attachToolbar`, úklid v `destroy`)
- Modify: `packages/ui/src/nibble.css`
- Create: `packages/plugins/src/slash.ts`
- Modify: `packages/plugins/src/index.ts`, `demo/e2e.html`
- Test: `packages/core/test/suggest.test.ts` (nový), `e2e/slash.spec.ts` (nový)

**Interfaces:**
- Consumes: `textBeforeCaret`, `closestBlock`, `fillIfEmpty`, `foldText` z `@nibble/core`. Příkazy `formatBlock`, `bullist`, `numlist`, `tasklist`, `blockquote`, `hr`, `inserttable`, `details` a tlačítka `image`, `media`.
- Produces (`suggest.ts`):
  ```ts
  export interface SuggestionItem { id: string; label: string; icon?: string; keywords?: readonly string[] }
  export interface SuggestionSpec {
    trigger: string;
    startOfBlock?: boolean;
    items(editor: Editor, query: string): readonly SuggestionItem[];
    /** `true`, když výběr otevřel dialog. Tehdy se smazání `/dotaz` zapíše jako vlastní krok. */
    onPick(editor: Editor, item: SuggestionItem): void;
    opensDialog?(item: SuggestionItem): boolean;
  }
  export function suggestionQuery(textBefore: string, trigger: string, startOfBlock: boolean): string | null;
  export function filterSuggestions<T extends SuggestionItem>(items: readonly T[], query: string): T[];
  ```
- Produces: `UIRegistry.addSuggestion(name: string, spec: SuggestionSpec): this`, `UIRegistry.suggestions(): ReadonlyMap<string, SuggestionSpec>`.
- Produces: `bindCaretMenu(editor: Editor): () => void` v `@nibble/ui`.
- Produces: plugin `slash` (name `'slash'`), `SLASH_ITEMS`.

- [ ] **Step 1: Padající unit test**

`packages/core/test/suggest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterSuggestions, suggestionQuery } from '../src/ui/suggest.js';

describe('dotaz nabídky', () => {
  it.each([
    ['/', ''],
    ['/nad', 'nad'],
    ['/nadpis2', 'nadpis2'],
  ])('na začátku bloku %j → %j', (text, q) => {
    expect(suggestionQuery(text, '/', true)).toBe(q);
  });

  it.each(['', 'a/', 'text /nad', '/nad pis', '//'])('na začátku bloku %j nic', (text) => {
    expect(suggestionQuery(text, '/', true)).toBeNull();
  });

  it('mimo začátek bloku stačí mezera před spouštěčem', () => {
    expect(suggestionQuery('text /nad', '/', false)).toBe('nad');
    expect(suggestionQuery('a/b', '/', false)).toBeNull();
  });
});

describe('filtr nabídky', () => {
  const items = [
    { id: 'h1', label: 'Nadpis 1', keywords: ['h1'] },
    { id: 'ul', label: 'Odrážky', keywords: ['seznam'] },
    { id: 'quote', label: 'Citace' },
  ];

  it('prázdný dotaz vrátí vše', () => expect(filterSuggestions(items, '')).toHaveLength(3));
  it('bez diakritiky a velikosti', () => expect(filterSuggestions(items, 'ODRAZ').map((i) => i.id)).toEqual(['ul']));
  it('podle klíčových slov', () => expect(filterSuggestions(items, 'seznam').map((i) => i.id)).toEqual(['ul']));
  it('začátek popisku má přednost', () => {
    const list = [{ id: 'a', label: 'Vložit citaci' }, { id: 'b', label: 'Citace' }];
    expect(filterSuggestions(list, 'cit').map((i) => i.id)).toEqual(['b', 'a']);
  });
});
```

Run → FAIL.

- [ ] **Step 2: `suggest.ts` a registr**

`packages/core/src/ui/suggest.ts`:

```ts
import type { Editor } from '../Editor.js';
import { foldText } from './glyphs.js';

/**
 * Nabídka u kurzoru — data a čisté funkce. Vykreslení je v `@nibble/ui`
 * (`CaretMenu`), stejně jako u ostatních ovládacích prvků.
 */

export interface SuggestionItem {
  id: string;
  label: string;
  icon?: string;
  keywords?: readonly string[];
}

export interface SuggestionSpec {
  trigger: string;
  /** Spouštět jen na začátku bloku (lomítko). Jinak stačí mezera před spouštěčem. */
  startOfBlock?: boolean;
  items(editor: Editor, query: string): readonly SuggestionItem[];
  onPick(editor: Editor, item: SuggestionItem): void;
  /** Otevírá položka dialog? Pak se smazání dotazu zapíše jako samostatný krok. */
  opensDialog?(item: SuggestionItem): boolean;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Dotaz za spouštěčem, nebo null, když nabídka otevřená být nemá. */
export function suggestionQuery(textBefore: string, trigger: string, startOfBlock: boolean): string | null {
  const t = escape(trigger);
  const pattern = startOfBlock
    ? new RegExp('^' + t + '([^\\s' + t + ']*)$')
    : new RegExp('(?:^|\\s)' + t + '([^\\s' + t + ']*)$');
  const m = pattern.exec(textBefore);
  return m ? m[1]! : null;
}

/** Položky odpovídající dotazu; ty, jejichž popisek dotazem začíná, jdou první. */
export function filterSuggestions<T extends SuggestionItem>(items: readonly T[], query: string): T[] {
  const q = foldText(query.trim());
  if (q === '') return [...items];

  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const label = foldText(item.label);
    const hay = label + ' ' + foldText((item.keywords ?? []).join(' '));
    if (label.startsWith(q)) starts.push(item);
    else if (hay.includes(q)) contains.push(item);
  }
  return [...starts, ...contains];
}
```

`Registry.ts`: `import type { SuggestionSpec } from './suggest.js';`. Do třídy:

```ts
  private readonly suggestionSpecs = new Map<string, SuggestionSpec>();

  /** Nabídka u kurzoru vyvolaná znakem — např. lomítkové příkazy. */
  addSuggestion(name: string, spec: SuggestionSpec): this {
    this.suggestionSpecs.set(name, spec);
    return this;
  }

  suggestions(): ReadonlyMap<string, SuggestionSpec> {
    return this.suggestionSpecs;
  }
```

`index.ts`:

```ts
export { suggestionQuery, filterSuggestions } from './ui/suggest.js';
export type { SuggestionItem, SuggestionSpec } from './ui/suggest.js';
```

Run: `npx vitest run packages/core/test/suggest.test.ts && npm run typecheck` → PASS.

- [ ] **Step 3: `CaretMenu.ts`**

```ts
import type { Editor, SuggestionItem, SuggestionSpec } from '@nibble/core';
import { closestBlock, fillIfEmpty, suggestionQuery, textBeforeCaret } from '@nibble/core';
import { iconSvg } from './icons.js';

/**
 * Nabídka u kurzoru.
 *
 * Na rozdíl od `Menu` si fokus nebere: uživatel píše dál do editoru a psaním
 * nabídku filtruje. Šipky, Enter, Tab a Escape se proto zachytávají na
 * kořeni editoru — a jen tehdy, když je nabídka otevřená.
 */

interface Open {
  spec: SuggestionSpec;
  items: readonly SuggestionItem[];
  active: number;
  text: Text;
  /** Kde v textovém uzlu začíná spouštěč. */
  from: number;
}

export function bindCaretMenu(editor: Editor): () => void {
  const doc = editor.root.ownerDocument;
  const menu = doc.createElement('div');
  menu.className = 'nb-menu nb-caret-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  doc.body.appendChild(menu);

  let open: Open | null = null;
  /** Escape zavře nabídku pro tenhle spouštěč, dokud se neodmaže. */
  let dismissed: { text: Text; from: number } | null = null;

  const close = (): void => { open = null; menu.hidden = true; menu.replaceChildren(); };

  const render = (): void => {
    if (!open) return;
    menu.replaceChildren();
    open.items.forEach((item, index) => {
      const option = doc.createElement('button');
      option.type = 'button';
      option.className = 'nb-menu-item';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === open!.active));
      option.tabIndex = -1;
      option.dataset.value = item.id;
      if (item.icon) {
        const icon = doc.createElement('span');
        icon.className = 'nb-caret-menu-icon';
        icon.innerHTML = iconSvg(item.icon);
        option.appendChild(icon);
      }
      const label = doc.createElement('span');
      label.className = 'nb-menu-label';
      label.textContent = item.label;
      option.appendChild(label);
      // `mousedown`, ne `click`: kliknutí by editoru vzalo fokus i kurzor.
      option.addEventListener('mousedown', (e) => { e.preventDefault(); pick(index); });
      menu.appendChild(option);
    });
  };

  const position = (range: Range): void => {
    let rect = range.getBoundingClientRect();
    // Prázdný řádek nemá obdélník kurzoru — vezme se blok.
    if (rect.width === 0 && rect.height === 0) {
      const block = closestBlock(range.startContainer, editor.root);
      if (block) rect = block.getBoundingClientRect();
    }
    const win = doc.defaultView!;
    menu.style.left = Math.round(rect.left + win.scrollX) + 'px';
    menu.style.top = Math.round(rect.bottom + win.scrollY + 4) + 'px';
  };

  const sync = (): void => {
    if (editor.mode !== 'design' || editor.composing) return close();
    const range = editor.selection.getRange();
    if (!range || !range.collapsed || range.startContainer.nodeType !== 3) return close();

    const text = range.startContainer as Text;
    const block = closestBlock(text, editor.root);
    if (!block) return close();

    for (const spec of editor.ui.suggestions().values()) {
      const before = spec.startOfBlock
        ? textBeforeCaret(block, range)
        : text.data.slice(0, range.startOffset);
      const query = suggestionQuery(before, spec.trigger, spec.startOfBlock ?? false);
      if (query === null) continue;

      const from = range.startOffset - query.length - spec.trigger.length;
      if (from < 0) continue;
      if (dismissed && dismissed.text === text && dismissed.from === from) return close();

      const items = spec.items(editor, query);
      if (items.length === 0) return close();

      const sameAnchor = open && open.text === text && open.from === from;
      open = { spec, items, active: sameAnchor ? Math.min(open!.active, items.length - 1) : 0, text, from };
      menu.hidden = false;
      render();
      position(range);
      return;
    }
    dismissed = null;
    close();
  };

  const pick = (index: number): void => {
    if (!open) return;
    const { spec, text, from } = open;
    const item = open.items[index];
    close();
    if (!item) return;

    const range = editor.selection.getRange();
    if (!range) return;

    // Smazat `/dotaz`. U příkazu bez dialogu se smazání nezapisuje zvlášť:
    // zapíše ho až příkaz a Ctrl+Z pak vrátí rovnou `/dotaz`.
    const remove = doc.createRange();
    remove.setStart(text, from);
    remove.setEnd(range.startContainer, range.startOffset);
    remove.deleteContents();
    const block = closestBlock(text, editor.root);
    if (block) {
      fillIfEmpty(block, doc);
      if (text.parentNode) editor.selection.collapseTo(text, from);
      else editor.selection.collapseTo(block, 0);
    }

    if (spec.opensDialog?.(item)) editor.commit('slash');
    spec.onPick(editor, item);
  };

  const onKeyDown = (event: Event): void => {
    if (!open) return;
    const e = event as KeyboardEvent;
    const count = open.items.length;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      open.active = (open.active + (e.key === 'ArrowDown' ? 1 : count - 1)) % count;
      render();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      pick(open.active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      dismissed = { text: open.text, from: open.from };
      close();
    }
  };

  const onFocusOut = (): void => close();

  // Až po zpracování úhozu jádrem: `input` přijde uprostřed příkazu, kdy je
  // výběr ještě v pohybu.
  const offInput = editor.on('input', () => queueMicrotask(sync));
  const offChange = editor.on('change', () => queueMicrotask(sync));
  const offSelection = editor.on('selectionchange', () => { if (open) sync(); });

  // Capture: nabídka musí Enter dostat dřív než pluginy a jádro.
  editor.root.addEventListener('keydown', onKeyDown, true);
  editor.root.addEventListener('focusout', onFocusOut);

  return () => {
    offInput(); offChange(); offSelection();
    editor.root.removeEventListener('keydown', onKeyDown, true);
    editor.root.removeEventListener('focusout', onFocusOut);
    menu.remove();
  };
}
```

V `packages/ui/src/index.ts`:
- import `{ bindCaretMenu } from './CaretMenu.js'`, export `export { bindCaretMenu } from './CaretMenu.js';`,
- v `attachToolbar` za `const contextToolbar = …` přidat `const releaseCaretMenu = bindCaretMenu(editor);`,
- v `destroy()` vráceného objektu zavolat `releaseCaretMenu();`. Najít `destroy()` v `attachToolbar` a přidat k ostatním úklidům.

CSS:

```css
/* Nabídka u kurzoru vychází z `.nb-menu`; navíc ikona vlevo. */
.nb-caret-menu { position: absolute; z-index: 1000; min-width: 200px; max-height: 280px; overflow-y: auto; }
.nb-caret-menu .nb-menu-item { display: flex; align-items: center; gap: .6em; }
.nb-caret-menu-icon { display: inline-flex; width: 18px; height: 18px; opacity: .8; }
.nb-caret-menu-icon svg { width: 18px; height: 18px; }
```

(Ověřit v `nibble.css:887`, jestli `.nb-menu` už nemá `position: fixed`. Menu se staví s `getBoundingClientRect` bez scrollu, takže `fixed` je pravděpodobné. Pokud ano, v `position()` vynechat `scrollX`/`scrollY` a v CSS nepřepisovat `position`.)

- [ ] **Step 4: Plugin `slash.ts`**

```ts
import type { Editor, Plugin, SuggestionItem } from '@nibble/core';
import { filterSuggestions } from '@nibble/core';

/**
 * Lomítkové příkazy: `/` na začátku řádku nabídne, co vložit.
 *
 * Nabídka ukazuje jen to, co v editoru opravdu je — bez pluginu tabulek
 * žádná „Tabulka“.
 */

interface SlashItem extends SuggestionItem {
  /** Příkaz a jeho argument, nebo tlačítko, které otevře dialog. */
  run: { command: string; args?: unknown } | { button: string };
}

export const SLASH_ITEMS: readonly SlashItem[] = [
  { id: 'h1', label: 'Nadpis 1', icon: 'header', keywords: ['h1', 'titulek'], run: { command: 'formatBlock', args: 'h1' } },
  { id: 'h2', label: 'Nadpis 2', icon: 'header', keywords: ['h2'], run: { command: 'formatBlock', args: 'h2' } },
  { id: 'h3', label: 'Nadpis 3', icon: 'header', keywords: ['h3'], run: { command: 'formatBlock', args: 'h3' } },
  { id: 'bullist', label: 'Odrážky', icon: 'bullist', keywords: ['seznam', 'ul'], run: { command: 'bullist' } },
  { id: 'numlist', label: 'Číslovaný seznam', icon: 'numlist', keywords: ['seznam', 'ol', 'cislovani'], run: { command: 'numlist' } },
  { id: 'tasklist', label: 'Úkoly', icon: 'tasklist', keywords: ['todo', 'checkbox', 'zaskrtavatko'], run: { command: 'tasklist' } },
  { id: 'quote', label: 'Citace', icon: 'blockquote', keywords: ['quote'], run: { command: 'blockquote' } },
  { id: 'pre', label: 'Blok kódu', icon: 'code', keywords: ['kod', 'pre'], run: { command: 'formatBlock', args: 'pre' } },
  { id: 'hr', label: 'Vodorovná čára', icon: 'hr', keywords: ['oddelovac', 'hr'], run: { command: 'hr' } },
  { id: 'table', label: 'Tabulka', icon: 'table', keywords: ['tabulka'], run: { command: 'inserttable', args: { rows: 3, cols: 3 } } },
  { id: 'image', label: 'Obrázek', icon: 'image', keywords: ['foto', 'img'], run: { button: 'image' } },
  { id: 'media', label: 'Video', icon: 'media', keywords: ['youtube', 'vimeo'], run: { button: 'media' } },
  { id: 'details', label: 'Rozbalovací blok', icon: 'details', keywords: ['faq', 'details'], run: { command: 'details' } },
];

function available(editor: Editor, item: SlashItem): boolean {
  return 'command' in item.run ? editor.can(item.run.command) : editor.ui.get(item.run.button) !== undefined;
}

export const slash: Plugin = {
  name: 'slash',

  setup(editor) {
    editor.ui.addSuggestion('slash', {
      trigger: '/',
      startOfBlock: true,
      items: (ed, query) => filterSuggestions(SLASH_ITEMS.filter((i) => available(ed, i)), query),
      opensDialog: (item) => 'button' in (item as SlashItem).run,
      onPick: (ed, item) => {
        const { run } = item as SlashItem;
        if ('command' in run) { ed.exec(run.command, run.args); return; }
        const spec = ed.ui.get(run.button);
        if (spec?.kind === 'button') spec.onAction(ed);
      },
    });
  },
};
```

`packages/plugins/src/index.ts`: `export { slash, SLASH_ITEMS } from './slash.js';`
`demo/e2e.html`: `slash` do importu a výchozího seznamu.

Run: `npm run typecheck && npx vitest run` → PASS.

- [ ] **Step 5: e2e**

`e2e/slash.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { caret, html, mount } from './helpers.js';

const MENU = '.nb-caret-menu:not([hidden])';

test.describe('lomítkové příkazy', () => {
  test('/ na prázdném řádku otevře nabídku a fokus zůstane v editoru', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/');
    await expect(page.locator(MENU)).toBeVisible();
    expect(await page.evaluate(() => document.activeElement === (window as any).ed.root)).toBe(true);
  });

  test('psaní filtruje, Enter vybere', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/nad');
    await expect(page.locator(`${MENU} .nb-menu-item`)).toHaveCount(3);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Titulek');
    expect(await html(page)).toBe('<h2>Titulek</h2>');
  });

  test('Ctrl+Z po výběru vrátí /dotaz jedním krokem', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/cit');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe('<p>/cit</p>');
  });

  test('Escape zavře nabídku a text nechá', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/nad');
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toHaveCount(0);
    await page.keyboard.type('x');
    await expect(page.locator(MENU)).toHaveCount(0);
    expect(await html(page)).toBe('<p>/nadx</p>');
  });

  test('mezera bez shody nabídku zavře', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/a b');
    await expect(page.locator(MENU)).toHaveCount(0);
  });

  test('lomítko uprostřed textu nic neotevře', async ({ page }) => {
    await mount(page, '<p>a</p>');
    await caret(page, 0, 1);
    await page.keyboard.type('/');
    await expect(page.locator(MENU)).toHaveCount(0);
  });

  test('klik myší vybere položku', async ({ page }) => {
    await mount(page, '<p><br></p>');
    await caret(page, 0, 0);
    await page.keyboard.type('/');
    await page.locator(`${MENU} .nb-menu-item`, { hasText: 'Odrážky' }).click();
    await page.keyboard.type('a');
    expect(await html(page)).toBe('<ul><li>a</li></ul>');
  });

  test('bez pluginu tabulek není v nabídce Tabulka', async ({ page }) => {
    await page.goto('/e2e.html');
    await page.waitForFunction(() => (window as any).ready === true);
    await page.evaluate(async () => {
      const { slash } = await import('/dist/plugins/src/index.js' as any);
      await (window as any).mount('<p><br></p>', { plugins: [slash] });
    });
    await caret(page, 0, 0);
    await page.keyboard.type('/tab');
    await expect(page.locator(MENU)).toHaveCount(0);
  });
});
```

Run: `npm run build && npx playwright test e2e/slash.spec.ts` → PASS, pak celé `npm run e2e`.

- [ ] **Step 6: README, CHANGELOG, commit**

README: sekce `## Lomítkové příkazy` (co nabídka umí, že ukazuje jen dostupné položky a že `ui.addSuggestion` je obecné API).

CHANGELOG / Přidáno:

```markdown
- Plugin `slash` — `/` na začátku řádku otevře nabídku (nadpisy, seznamy,
  úkoly, citace, kód, čára, tabulka, obrázek, video, rozbalovací blok).
  Psaní filtruje i bez diakritiky, Enter vybere, Escape zavře. Ukazuje jen
  to, co je v editoru zapnuté.
- `ui.addSuggestion(name, spec)` — obecná nabídka u kurzoru vyvolaná znakem.
  Vykresluje ji `@nibble/ui` (`bindCaretMenu`), fokus zůstává v editoru.
```

```bash
git add packages e2e demo/e2e.html README.md CHANGELOG.md
git commit -m "Lomítkové příkazy a nabídka u kurzoru"
```

---

### Task 8: Úchyt pro přetažení bloku

**Files:**
- Create: `packages/plugins/src/dragHandle.ts`
- Modify: `packages/ui/src/nibble.css`, `packages/plugins/src/index.ts`, `demo/e2e.html`
- Test: `packages/core/test/dragHandle.test.ts` (nový), `e2e/dragHandle.spec.ts` (nový)

**Interfaces:**
- Produces: `dropIndex(edges: readonly { top: number; bottom: number }[], y: number): number` (index mezery 0…n, do které blok dopadne), `isNoopMove(from: number, to: number): boolean`, plugin `dragHandle` (name `'dragHandle'`).

Úchyt není v `@nibble/ui`, protože patří pluginu a ten ho sám i uklidí. Kreslí se do rodiče kořene (`.nb-surface`, `position: relative`), nikdy dovnitř `contenteditable`.

- [ ] **Step 1: Padající unit test**

`packages/core/test/dragHandle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dropIndex, isNoopMove } from '../../plugins/src/dragHandle.js';

const edges = [
  { top: 0, bottom: 20 },
  { top: 30, bottom: 50 },
  { top: 60, bottom: 100 },
];

describe('kam blok dopadne', () => {
  it.each([
    [-5, 0], [5, 0], [11, 1], [39, 1], [41, 2], [79, 2], [81, 3], [200, 3],
  ])('y=%s → %s', (y, idx) => {
    expect(dropIndex(edges, y)).toBe(idx);
  });

  it('přesun na stejné místo nic nedělá', () => {
    expect(isNoopMove(1, 1)).toBe(true);
    expect(isNoopMove(1, 2)).toBe(true);
    expect(isNoopMove(1, 0)).toBe(false);
    expect(isNoopMove(1, 3)).toBe(false);
  });
});
```

Run → FAIL.

- [ ] **Step 2: `dragHandle.ts`**

```ts
import type { Plugin } from '@nibble/core';

/**
 * Úchyt pro přesun bloku.
 *
 * Pointer events, ne nativní drag & drop: tažení textu už obsluhuje
 * `Paste.ts` a dva systémy přes sebe by si braly události. Blok se přesouvá
 * celý a beze změny — jen `insertBefore` — takže nedotčený obsah v něm zůstane
 * znak po znaku stejný.
 */

/** Mezera 0…n, do které dopadne blok puštěný ve výšce `y` (polovina bloku rozhoduje). */
export function dropIndex(edges: readonly { top: number; bottom: number }[], y: number): number {
  for (let i = 0; i < edges.length; i++) {
    const { top, bottom } = edges[i]!;
    if (y < (top + bottom) / 2) return i;
  }
  return edges.length;
}

/** Puštění těsně nad nebo pod sebou je návrat na původní místo. */
export function isNoopMove(from: number, to: number): boolean {
  return to === from || to === from + 1;
}

export const dragHandle: Plugin = {
  name: 'dragHandle',

  setup(editor) {
    const doc = editor.document;
    const win = doc.defaultView;
    // Na dotyku není „najetí myší“ a úchyt by jen překážel prstu.
    if (!win || win.matchMedia?.('(pointer: coarse)').matches) return;

    const root = editor.root;
    const host = (): HTMLElement | null => root.parentElement;

    const handle = doc.createElement('button');
    handle.type = 'button';
    handle.className = 'nb-drag-handle';
    handle.title = 'Přetáhnout blok';
    handle.setAttribute('aria-label', 'Přetáhnout blok');
    handle.tabIndex = -1;
    handle.hidden = true;
    handle.textContent = '⠿';

    const line = doc.createElement('div');
    line.className = 'nb-drop-line';
    line.hidden = true;

    let current: Element | null = null;
    let drag: { block: Element; from: number; to: number; moved: boolean; startY: number } | null = null;

    const blocks = (): Element[] => Array.from(root.children);

    const place = (block: Element): void => {
      const parent = host();
      if (!parent) return;
      if (!handle.isConnected) parent.append(handle, line);
      const base = parent.getBoundingClientRect();
      const box = block.getBoundingClientRect();
      const rootBox = root.getBoundingClientRect();
      handle.style.top = Math.round(box.top - base.top + parent.scrollTop) + 'px';
      handle.style.left = Math.round(rootBox.left - base.left) + 'px';
      handle.hidden = false;
      current = block;
    };

    const onMouseMove = (event: Event): void => {
      if (drag || editor.mode !== 'design') return;
      let node = event.target as Node | null;
      while (node && node.parentNode !== root) node = node.parentNode;
      if (node && node.nodeType === 1 && node !== current) place(node as Element);
    };

    const onLeave = (event: Event): void => {
      if (drag) return;
      const to = (event as MouseEvent).relatedTarget as Node | null;
      if (to && (to === handle || root.contains(to))) return;
      handle.hidden = true;
      current = null;
    };

    const onKeyDown = (event: Event): void => {
      if ((event as KeyboardEvent).key === 'Escape' && drag) { finish(false); return; }
      if (!drag) { handle.hidden = true; current = null; }
    };

    const showLine = (to: number): void => {
      const parent = host();
      if (!parent) return;
      const list = blocks();
      const base = parent.getBoundingClientRect();
      const y = to < list.length
        ? list[to]!.getBoundingClientRect().top
        : list[list.length - 1]!.getBoundingClientRect().bottom;
      const rootBox = root.getBoundingClientRect();
      line.style.top = Math.round(y - base.top + parent.scrollTop - 1) + 'px';
      line.style.left = Math.round(rootBox.left - base.left) + 'px';
      line.style.width = Math.round(rootBox.width) + 'px';
      line.hidden = false;
    };

    const finish = (commit: boolean): void => {
      const state = drag;
      drag = null;
      line.hidden = true;
      handle.classList.remove('nb-dragging');
      if (!state) return;

      if (!state.moved) {
        // Klik bez tažení označí celý blok — rychlá cesta ke smazání nebo kopii.
        const range = doc.createRange();
        range.selectNode(state.block);
        editor.focus();
        editor.selection.setRange(range);
        return;
      }
      if (!commit || isNoopMove(state.from, state.to)) return;

      const list = blocks();
      root.insertBefore(state.block, list[state.to] ?? null);
      const range = doc.createRange();
      range.selectNodeContents(state.block);
      range.collapse(true);
      editor.focus();
      editor.selection.setRange(range);
      editor.commit('move');
      place(state.block);
    };

    const onPointerDown = (event: Event): void => {
      const e = event as PointerEvent;
      if (!current || e.button !== 0 || editor.mode !== 'design') return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const from = blocks().indexOf(current);
      drag = { block: current, from, to: from, moved: false, startY: e.clientY };
      handle.classList.add('nb-dragging');
    };

    const onPointerMove = (event: Event): void => {
      if (!drag) return;
      const e = event as PointerEvent;
      if (!drag.moved && Math.abs(e.clientY - drag.startY) < 4) return;
      drag.moved = true;
      const edges = blocks().map((b) => {
        const r = b.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
      drag.to = dropIndex(edges, e.clientY);
      showLine(drag.to);
    };

    const onPointerUp = (): void => finish(true);

    root.addEventListener('mousemove', onMouseMove);
    root.addEventListener('mouseleave', onLeave);
    root.addEventListener('keydown', onKeyDown);
    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', () => finish(false));
    handle.addEventListener('mouseleave', onLeave);

    return () => {
      root.removeEventListener('mousemove', onMouseMove);
      root.removeEventListener('mouseleave', onLeave);
      root.removeEventListener('keydown', onKeyDown);
      handle.remove();
      line.remove();
    };
  },
};
```

`blocks()` vrací jen prvky (`root.children`), takže bílé textové uzly mezi bloky zůstávají, kde jsou. Úchyt i čára jsou v `.nb-surface`, ne v kořeni.

Run: `npx vitest run packages/core/test/dragHandle.test.ts && npm run typecheck` → PASS.

- [ ] **Step 3: CSS, export, testovací stránka**

```css
/* Úchyt bloku v levém okraji obsahu. */
.nb-drag-handle {
  position: absolute;
  width: 14px;
  height: 22px;
  margin-top: 2px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--nb-muted, #8a8f98);
  font-size: 14px;
  line-height: 22px;
  cursor: grab;
  user-select: none;
  z-index: 5;
}
.nb-drag-handle:hover { background: var(--nb-hover); }
.nb-drag-handle.nb-dragging { cursor: grabbing; }
.nb-drop-line {
  position: absolute;
  height: 2px;
  background: var(--nb-accent);
  pointer-events: none;
  z-index: 5;
}
```

Úchyt je znak `⠿`, ne ikona ze sady. Nemusí se přidávat do tří sad ikon a v 14 px je čitelný.

`packages/plugins/src/index.ts`: `export { dragHandle, dropIndex, isNoopMove } from './dragHandle.js';`
`demo/e2e.html`: `dragHandle` do importu a výchozího seznamu.

- [ ] **Step 4: e2e**

`e2e/dragHandle.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { CONTENT, html, mount, mountFixture, original } from './helpers.js';

async function drag(page: Page, fromIndex: number, toY: (boxes: { y: number; height: number }[]) => number) {
  const blocks = page.locator(`${CONTENT} > *`);
  const box = (await blocks.nth(fromIndex).boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  const handle = page.locator('.nb-drag-handle:not([hidden])');
  await expect(handle).toBeVisible();
  const h = (await handle.boundingBox())!;
  const boxes = await Promise.all(Array.from({ length: await blocks.count() }, (_, i) => blocks.nth(i).boundingBox()));
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, toY(boxes as { y: number; height: number }[]), { steps: 6 });
  await page.mouse.up();
}

test.describe('úchyt bloku', () => {
  test('přesun prvního bloku na konec', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p><p>c</p>');
    await drag(page, 0, (b) => b[2]!.y + b[2]!.height + 5);
    expect(await html(page)).toBe('<p>b</p><p>c</p><p>a</p>');
  });

  test('přesun posledního bloku na začátek a Ctrl+Z', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p><p>c</p>');
    await drag(page, 2, (b) => b[0]!.y + 2);
    expect(await html(page)).toBe('<p>c</p><p>a</p><p>b</p>');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await html(page)).toBe('<p>a</p><p>b</p><p>c</p>');
  });

  test('puštění na stejné místo nic nezapíše', async ({ page }) => {
    await mount(page, '<p>a</p><p>b</p>');
    await drag(page, 0, (b) => b[0]!.y + 3);
    expect(await page.evaluate(() => (window as any).ed.history.canUndo)).toBe(false);
  });

  test('úchyt ani čára nejsou v HTML', async ({ page }) => {
    await mount(page, '<p>a</p>');
    const box = (await page.locator(`${CONTENT} p`).boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 5);
    expect(await html(page)).toBe('<p>a</p>');
  });

  test('na reálném dokumentu změní přesun jen pořadí', async ({ page }) => {
    await mountFixture(page, '001.html');
    const before = await original(page);
    await drag(page, 1, (b) => b[0]!.y + 2);
    const after = await html(page);
    // Stejné znaky, jiné pořadí: setříděné znaky se musí shodovat.
    expect([...after].sort().join('')).toBe([...before].sort().join(''));
    expect(after).not.toBe(before);
  });
});
```

Pokud má `001.html` v prvních dvou blocích stejný obsah nebo jen jeden prvek, použít jinou fixture s alespoň třemi bloky nejvyšší úrovně (`grep -c "<p" demo/fixtures/*.html | head`). Poslední test je sice hrubý, ale přesně odhalí, kdyby přesun přidal nebo ubral znak (třeba bílé místo mezi bloky). Pokud selže kvůli tomu, že se blok serializuje jinak než ve zdroji, je to skutečná chyba v zachování obsahu a test se neupravuje.

Run: `npm run build && npx playwright test e2e/dragHandle.spec.ts e2e/dragdrop.spec.ts` → PASS, pak `npm run e2e`.

- [ ] **Step 5: CHANGELOG a commit**

```markdown
- Plugin `dragHandle` — při najetí myší na blok se vlevo ukáže úchyt ⠿;
  tažením se blok přesune, klikem se označí celý. Blok se přesouvá beze
  změny a přesun je jeden krok historie. Na dotykových zařízeních se úchyt
  neukazuje.
```

```bash
git add packages e2e demo/e2e.html CHANGELOG.md
git commit -m "Úchyt pro přetažení bloku"
```

---

## Závěrečná kontrola (po Úkolu 8)

- [ ] `npm test && npm run typecheck && npm run e2e`: všechno zelené.
- [ ] `npx vitest run packages/core/test/roundtrip.test.ts` a `npx playwright test e2e/roundtrip.spec.ts`: fixtures beze změny, testovací stránka má zapnuté všechny nové pluginy.
- [ ] `npm run build` a ruční kontrola v `demo/index.html` (`npm run demo`): nové pluginy přidat i do demo konfigurace, ať jsou vidět.
- [ ] V `CHANGELOG.md` je pod `[Unreleased]` osm zápisů.
