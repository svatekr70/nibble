/**
 * Bezpečnostní vrstva. Platí vždy a na všechno, i v režimu 'legacy'.
 *
 * Záměrně nedělá nic jiného — o tom, jestli je `<font>` hezký markup, rozhoduje
 * Schema, ne tenhle soubor. Kdyby sanitizace zároveň uklízela tvar dokumentu,
 * nešlo by ji zapnout naplno nad starým obsahem.
 *
 * Proto tu není `contenteditable`, i když ho 8,7 % uloženého obsahu nese. Jsou
 * to zbytky po Quillu (`<span class="ql-ui" contenteditable="false">`) a hodnota
 * je vždy "false", takže mimo editor nic nedělá. Odstranit ho tady by znamenalo,
 * že se každý takový dokument při načtení změní a nelze ho uložit beze změny —
 * a to je horší nemoc než ta, kterou by to léčilo. Přísné schema ho ohlásí.
 */

const EVENT_ATTR = /^on[a-z]+$/i;
const DANGEROUS_URL = /^\s*(javascript|vbscript|data:text\/html)/i;
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);
const DROP_TAGS = new Set(['script', 'object', 'embed', 'base', 'form']);

/**
 * Hostitelé, ze kterých se pouští `<iframe>`.
 *
 * `<iframe>` je jinak jednoznačně nebezpečný a padá. Jenže cílový projekt konfiguruje
 * plugin `media` třicetkrát, takže plošné zahazování by rozbilo něco, co lidé
 * používají. Seznam je proto kompromis: povolené je vkládání odjinud, ale jen
 * z míst, která někdo vybral — ne cokoli, co přijde v HTML.
 *
 * Dnešní stav v cílovém projektu je `valid_elements: '*[*]'`, tedy žádná kontrola.
 * Tohle je i s výchozím seznamem přísnější než to, co běží teď.
 */
export const DEFAULT_EMBED_HOSTS: readonly string[] = [
  'youtube.com', 'youtube-nocookie.com', 'youtu.be',
  'vimeo.com', 'player.vimeo.com',
  'loom.com', 'www.loom.com',
  'drive.google.com', 'docs.google.com',
  'spotify.com', 'open.spotify.com',
];

export interface SanitizeOptions {
  /** Hostitelé, jejichž `<iframe>` projde. Prázdné pole zahodí všechny. */
  allowedEmbedHosts?: readonly string[];
}

export interface SanitizeResult {
  /** Muselo se něco odstranit? Pak už dokument nelze uložit beze změny. */
  changed: boolean;
  removed: string[];
}

/** Patří adresa některému z povolených hostitelů? */
export function isAllowedEmbed(src: string, hosts: readonly string[]): boolean {
  if (hosts.length === 0) return false;

  let host: string;
  try {
    host = new URL(src, 'https://example.invalid').hostname.toLowerCase();
  } catch {
    return false;
  }

  return hosts.some((allowed) => {
    const a = allowed.toLowerCase();
    return host === a || host.endsWith('.' + a);
  });
}

export function sanitize(root: Element, options: SanitizeOptions = {}): SanitizeResult {
  const removed: string[] = [];
  const hosts = options.allowedEmbedHosts ?? [];

  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();

    if (tag === 'iframe') {
      const src = el.getAttribute('src') ?? '';
      if (!/^https:\/\//i.test(src) || !isAllowedEmbed(src, hosts)) {
        removed.push('<iframe src="' + src.slice(0, 40) + '">');
        el.remove();
      }
      continue;
    }

    if (DROP_TAGS.has(tag)) {
      removed.push('<' + tag + '>');
      el.remove();
      continue;
    }

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();

      if (EVENT_ATTR.test(name)) {
        removed.push(tag + '@' + name);
        el.removeAttribute(attr.name);
        continue;
      }

      if (URL_ATTRS.has(name) && DANGEROUS_URL.test(attr.value)) {
        removed.push(tag + '@' + name + ' (' + attr.value.slice(0, 24) + ')');
        el.removeAttribute(attr.name);
        continue;
      }
    }
  }

  return { changed: removed.length > 0, removed };
}
