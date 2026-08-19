/**
 * Markdown → HTML pro vkládání z čistého textu.
 *
 * Podmnožina schválně: jde o to, aby text zkopírovaný z ChatGPT, z README nebo
 * z terminálu neskončil jako jeden slepenec odstavců. Není to plnohodnotný
 * parser a nemá být — na to je celý balík navíc a Nibble má zůstat lehký.
 *
 * Převod se spouští jen tehdy, když je v textu **výrazný** znak Markdownu.
 * Samotné odrážky nestačí: kdo vloží seznam psaný pomlčkami, nemusí chtít
 * seznam — chce svůj text. Nadpis, blok kódu nebo odkaz je naopak zápis, který
 * v běžném textu nikdo nenapíše omylem.
 */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (ch) => ESCAPES[ch]!);
}

/** Má text natolik výrazný znak Markdownu, že se vyplatí ho převádět? */
export function looksLikeMarkdown(text: string): boolean {
  if (/^#{1,6}\s+\S/m.test(text)) return true;                       // nadpis
  if (/^```/m.test(text)) return true;                                // blok kódu
  if (/\[[^\]]+\]\((https?:\/\/|\/)[^)]+\)/.test(text)) return true;  // odkaz

  // Seznam se počítá až od dvou řádků po sobě — jeden řádek s pomlčkou
  // je běžná věta, ne struktura.
  const bullets = text.match(/^[ \t]*[-*+][ \t]+\S/gm);
  if (bullets && bullets.length >= 2) return true;

  const numbered = text.match(/^[ \t]*\d+[.)][ \t]+\S/gm);
  if (numbered && numbered.length >= 2) return true;

  return false;
}

/** Zástupný token pro obsah backticků. Uvnitř kódu se nic dalšího nepřevádí. */
const CODE_SLOT = (index: number): string => '%%NBCODE' + index + '%%';

function inline(text: string): string {
  let out = escapeHtml(text);

  const codes: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(code);
    return CODE_SLOT(codes.length - 1);
  });

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, label: string, href: string) =>
      /^(https?:|\/|mailto:|#)/i.test(href)
        ? '<a href="' + href.replace(/"/g, '&quot;') + '">' + label + '</a>'
        : label);

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  return out.replace(/%%NBCODE(\d+)%%/g,
    (_, index: string) => '<code>' + escapeHtml(codes[Number(index)] ?? '') + '</code>');
}

export function markdownToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];

  let paragraph: string[] = [];
  let listTag: 'ul' | 'ol' | null = null;
  let inCode = false;
  let code: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    out.push('<p>' + inline(paragraph.join(' ')) + '</p>');
    paragraph = [];
  };

  const flushList = (): void => {
    if (!listTag) return;
    out.push('</' + listTag + '>');
    listTag = null;
  };

  const flushAll = (): void => { flushParagraph(); flushList(); };

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inCode) {
        out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        code = [];
        inCode = false;
      } else {
        flushAll();
        inCode = true;
      }
      continue;
    }

    if (inCode) { code.push(line); continue; }
    if (line.trim() === '') { flushAll(); continue; }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1]!.length;
      out.push('<h' + level + '>' + inline(heading[2]!.trim()) + '</h' + level + '>');
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flushAll();
      out.push('<hr>');
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushAll();
      out.push('<blockquote><p>' + inline(quote[1]!) + '</p></blockquote>');
      continue;
    }

    const bullet = /^[ \t]*[-*+][ \t]+(.*)$/.exec(line);
    const numbered = /^[ \t]*\d+[.)][ \t]+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (listTag !== tag) { flushList(); out.push('<' + tag + '>'); listTag = tag; }
      out.push('<li>' + inline((bullet ?? numbered)![1]!) + '</li>');
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (inCode && code.length) {
    out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
  }
  flushAll();

  return out.join('');
}

/** Čistý text na odstavce. Prázdný řádek dělí, jednoduché zalomení je <br>. */
export function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map((block) => '<p>' + escapeHtml(block).replace(/\n/g, '<br>') + '</p>')
    .join('');
}
