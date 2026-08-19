/**
 * Tabulka pojmenovaných entit HTML4 — tu používá TinyMCE při entity_encoding:'named'.
 *
 * Nejde o úplnou sadu HTML5 schválně. V cílovém projektu je uložené `&scaron;` pro š, ale
 * č, ř, ž a ů jsou tam jako UTF-8, protože pro ně HTML4 název nemá. Kdyby Nibble
 * použil bohatší tabulku, přepsal by při editaci znaky, které tam dosud byly
 * doslova — a diff by ukázal změnu na řádcích, kterých se nikdo nedotkl.
 */

const TABLE: Record<string, string> = {
  ' ': 'nbsp',   '¡': 'iexcl',  '¢': 'cent',   '£': 'pound',
  '¤': 'curren', '¥': 'yen',    '¦': 'brvbar', '§': 'sect',
  '¨': 'uml',    '©': 'copy',   'ª': 'ordf',   '«': 'laquo',
  '¬': 'not',    '®': 'reg',    '¯': 'macr',   '°': 'deg',
  '±': 'plusmn', '²': 'sup2',   '³': 'sup3',   '´': 'acute',
  'µ': 'micro',  '¶': 'para',   '·': 'middot', '¸': 'cedil',
  '¹': 'sup1',   'º': 'ordm',   '»': 'raquo',  '¼': 'frac14',
  '½': 'frac12', '¾': 'frac34', '¿': 'iquest', 'À': 'Agrave',
  'Á': 'Aacute', 'Â': 'Acirc',  'Ã': 'Atilde', 'Ä': 'Auml',
  'Å': 'Aring',  'Æ': 'AElig',  'Ç': 'Ccedil', 'È': 'Egrave',
  'É': 'Eacute', 'Ê': 'Ecirc',  'Ë': 'Euml',   'Ì': 'Igrave',
  'Í': 'Iacute', 'Î': 'Icirc',  'Ï': 'Iuml',   'Ð': 'ETH',
  'Ñ': 'Ntilde', 'Ò': 'Ograve', 'Ó': 'Oacute', 'Ô': 'Ocirc',
  'Õ': 'Otilde', 'Ö': 'Ouml',   '×': 'times',  'Ø': 'Oslash',
  'Ù': 'Ugrave', 'Ú': 'Uacute', 'Û': 'Ucirc',  'Ü': 'Uuml',
  'Ý': 'Yacute', 'Þ': 'THORN',  'ß': 'szlig',  'à': 'agrave',
  'á': 'aacute', 'â': 'acirc',  'ã': 'atilde', 'ä': 'auml',
  'å': 'aring',  'æ': 'aelig',  'ç': 'ccedil', 'è': 'egrave',
  'é': 'eacute', 'ê': 'ecirc',  'ë': 'euml',   'ì': 'igrave',
  'í': 'iacute', 'î': 'icirc',  'ï': 'iuml',   'ð': 'eth',
  'ñ': 'ntilde', 'ò': 'ograve', 'ó': 'oacute', 'ô': 'ocirc',
  'õ': 'otilde', 'ö': 'ouml',   '÷': 'divide', 'ø': 'oslash',
  'ù': 'ugrave', 'ú': 'uacute', 'û': 'ucirc',  'ü': 'uuml',
  'ý': 'yacute', 'þ': 'thorn',  'ÿ': 'yuml',
  'Œ': 'OElig',  'œ': 'oelig',  'Š': 'Scaron', 'š': 'scaron',
  'Ÿ': 'Yuml',   'ƒ': 'fnof',   'ˆ': 'circ',   '˜': 'tilde',
  ' ': 'ensp',   ' ': 'emsp',   ' ': 'thinsp',
  '–': 'ndash',  '—': 'mdash',  '‘': 'lsquo',  '’': 'rsquo',
  '‚': 'sbquo',  '“': 'ldquo',  '”': 'rdquo',  '„': 'bdquo',
  '†': 'dagger', '‡': 'Dagger', '•': 'bull',   '…': 'hellip',
  '‰': 'permil', '‹': 'lsaquo', '›': 'rsaquo', '€': 'euro',
  '™': 'trade',  '←': 'larr',   '↑': 'uarr',   '→': 'rarr',
  '↓': 'darr',   '↔': 'harr',   '≠': 'ne',     '≤': 'le',
  '≥': 'ge',
};

/** Vrátí název entity pro znak, nebo undefined. */
export function namedEntity(ch: string): string | undefined {
  return TABLE[ch];
}

/** Obsahuje vstup pojmenované entity nad rámec těch nutných? */
export function usesNamedEntities(html: string): boolean {
  const found = html.match(/&([a-zA-Z][a-zA-Z0-9]+);/g);
  if (!found) return false;
  const core = ['&amp;', '&lt;', '&gt;', '&quot;'];
  return found.some((e) => !core.includes(e));
}
