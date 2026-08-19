#!/usr/bin/env python3
"""
Vytáhne z ostrého provozu vzorek reálného HTML a udělá z něj testovací sadu pro Nibble.

Bere strukturu, ne obsah: každé slovo v textovém uzlu se nahradí náhradou stejné
délky, entity (&nbsp;), interpunkce a bílé znaky zůstávají znak po znaku stejné.
Značky, atributy a jejich pořadí se nemění vůbec — na tom round-trip testy stojí.

    NIBBLE_FIXTURES_DB=databaze \\
    NIBBLE_FIXTURES_CONF=/cesta/ke/konfiguraci.neon \\
    python3 tools/extract-fixtures.py <out_dir>

Konfigurace je soubor, ze kterého se přečte heslo k MySQL (hledá se `password:`
v bloku `doctrine:`). Nástroj běží lokálně proti vlastní databázi — do repozitáře
se dostávají jen hotové vzorky.
"""
import base64, hashlib, json, os, re, subprocess, sys, collections

# Databáze a konfigurace s heslem se předávají zvenčí — jsou to údaje
# konkrétního nasazení, ne součást nástroje.
DB = os.environ.get('NIBBLE_FIXTURES_DB', '')
CONF = os.environ.get('NIBBLE_FIXTURES_CONF', '')
PER_COLUMN = 400          # kolik řádků načíst z jednoho sloupce
SKIP_COLUMNS = {'payload', 'old_value', 'new_value'}
TARGET = 160              # kolik vzorků vybrat rozmanitostí
BIG    = 40               # kolik navíc vzít jako celé velké dokumenty

TAG_RE   = re.compile(r'<\s*(/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)/?\s*>', re.S)
ATTR_RE  = re.compile(r'([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'>]+))')
STYLEP_RE= re.compile(r'([a-zA-Z-]+)\s*:')


def db_password():
    txt = open(CONF, encoding='utf-8').read()
    block = txt.split('doctrine:', 1)[1]
    m = re.search(r'password:\s*[\'"]?([^\'"\n]+)', block)
    return m.group(1).strip()


def query(sql, pw):
    out = subprocess.run(
        ['mysql', '-h', 'localhost', '-u', 'root', '-N', '--raw', '-e', sql, DB],
        capture_output=True, text=True, env={**os.environ, 'MYSQL_PWD': pw})
    if out.returncode:
        return []
    return [l for l in out.stdout.splitlines() if l.strip()]


# ---------------------------------------------------------------- scrubbing

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module
scrub_leftovers = import_module('scrub-leftovers').scrub

# ---------------------------------------------------------------- scrubbing

FILLER = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod '
          'tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam '
          'quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo').split()


def scrub_word(word, counter):
    """Náhrada stejné délky. Zachová velikost prvního písmene a číslice jako číslice."""
    if word.isdigit():
        return '0' * len(word)
    src = FILLER[counter[0] % len(FILLER)]
    counter[0] += 1
    while len(src) < len(word):
        src += FILLER[counter[0] % len(FILLER)]
        counter[0] += 1
    out = src[:len(word)]
    return out.capitalize() if word[:1].isupper() else out


def scrub_text(text, counter):
    """Nahradí jen slovní znaky. Entity, mezery a interpunkce zůstávají doslova."""
    parts = re.split(r'(&[a-zA-Z#0-9]+;)', text)
    for i, part in enumerate(parts):
        if part.startswith('&') and part.endswith(';'):
            continue                                  # entita — nesahat
        parts[i] = re.sub(r'[A-Za-zÀ-ž0-9]+',
                          lambda m: scrub_word(m.group(0), counter), part)
    return ''.join(parts)


SAFE_ATTRS = {'style', 'class', 'width', 'height', 'align', 'valign', 'border',
              'cellpadding', 'cellspacing', 'colspan', 'rowspan', 'span', 'target',
              'rel', 'type', 'start', 'dir', 'color', 'face', 'size', 'id', 'name',
              'contenteditable'}


def scrub_attr_value(name, value, counter):
    """Atributy nesoucí strukturu se nechávají. href/src/alt/title mohou nést data."""
    n = name.lower()
    if n in SAFE_ATTRS or n.startswith('data-'):
        # `data-*` nese strukturu, ale ne vždycky jen ji: Google Docs si do
        # `data-hovercard-id` ukládá e-mail autora komentáře.
        return scrub_leftovers(value)
    if n in ('href', 'src'):
        if value.startswith('data:'):
            head, _, rest = value.partition(',')
            return head + ',' + ('A' * min(len(rest), 64))   # data: URL zkrátit
        if value.startswith('#') or value.startswith('mailto:'):
            return '#anchor' if value.startswith('#') else 'mailto:someone@example.com'
        return 'https://example.com/' + hashlib.sha1(value.encode()).hexdigest()[:8]
    return scrub_text(value, counter)


def scrub_html(html):
    counter = [0]
    out, pos = [], 0
    for m in TAG_RE.finditer(html):
        out.append(scrub_text(html[pos:m.start()], counter))
        closing, tag, attrs = m.group(1), m.group(2), m.group(3) or ''

        def repl(am):
            name = am.group(1)
            raw  = am.group(0)
            val  = next((g for g in am.groups()[1:] if g is not None), '')
            new  = scrub_attr_value(name, val, counter)
            return raw.replace(val, new, 1) if val else raw

        out.append('<' + closing + tag + ATTR_RE.sub(repl, attrs) +
                   ('/' if m.group(0).rstrip('>').rstrip().endswith('/') else '') + '>')
        pos = m.end()
    out.append(scrub_text(html[pos:], counter))
    return ''.join(out)


# ---------------------------------------------------------------- signature

def signature(html):
    """Otisk struktury — podle něj se vybírá rozmanitost, ne podle textu."""
    feats = set()
    for m in TAG_RE.finditer(html):
        tag = m.group(2).lower()
        feats.add('t:' + tag)
        for am in ATTR_RE.finditer(m.group(3) or ''):
            name = am.group(1).lower()
            val  = next((g for g in am.groups()[1:] if g is not None), '')
            feats.add('a:%s@%s' % (tag, name))
            if name == 'style':
                for p in STYLEP_RE.findall(val):
                    feats.add('s:' + p.lower())
            if name in ('href', 'src') and val.startswith('data:'):
                feats.add('x:datauri')
    for ent in set(re.findall(r'&[a-zA-Z#0-9]+;', html)):
        feats.add('e:' + ent)
    if re.search(r'<!--', html):     feats.add('x:comment')
    if re.search(r'<!\[if', html):   feats.add('x:mso')
    if 'mso-' in html:               feats.add('x:mso-style')
    if re.search(r'\son[a-z]+\s*=', html, re.I): feats.add('x:onattr')
    if re.search(r'<script', html, re.I):        feats.add('x:script')
    return feats


def main():
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    pw = db_password()

    cols = query("""SELECT CONCAT(table_name,'|',column_name)
                    FROM information_schema.columns
                    WHERE table_schema='%s' AND data_type IN ('text','longtext','mediumtext')""" % DB, pw)

    rows = []
    for spec in cols:
        table, col = spec.split('|')
        # Auditní log není obsah editoru — jsou to JSON payloady, ve kterých
        # HTML jen náhodou je. Kdyby se sem dostaly, testovalo by se něco jiného.
        if col in SKIP_COLUMNS or table.endswith('activity_log'):
            continue
        # TO_BASE64 láme řádek po 76 znacích — bez odstranění zalomení by se
        # každý záznam rozpadl na kusy a načetly by se fragmenty, ne dokumenty
        sql = ("SELECT REPLACE(REPLACE(TO_BASE64(`%s`),CHAR(10),''),CHAR(13),'') "
               "FROM `%s` WHERE `%s` REGEXP "
               "'<(p|div|span|table|ul|ol|h[1-6]|br|strong|b|em|font|a|img)[ >/]' "
               "AND CHAR_LENGTH(`%s`) < 200000 LIMIT %d"
               % (col, table, col, col, PER_COLUMN))
        for b64 in query(sql, pw):
            try:
                html = base64.b64decode(b64).decode('utf-8', 'replace')
            except Exception:
                continue
            if len(html) < 12:
                continue
            rows.append({'src': '%s.%s' % (table, col), 'html': html, 'sig': signature(html)})

    print('načteno záznamů: %d' % len(rows))

    # výběr: greedy set cover — každý další vzorek přinese co nejvíc nových rysů
    seen, picked = set(), []
    pool = sorted(rows, key=lambda r: -len(r['sig']))
    while pool and len(picked) < TARGET:
        # při shodném přínosu ber ten obsáhlejší — chceme reálné dokumenty,
        # ne nejkratší možný fragment, který daný rys shodou okolností obsahuje
        best = max(pool, key=lambda r: (len(r['sig'] - seen), len(r['html'])))
        gain = best['sig'] - seen
        if not gain and len(picked) >= 40:
            break
        seen |= best['sig']
        picked.append(best)
        pool.remove(best)

    # doplnit typickými (nejčastější signatury), ať sada není jen samá exotika
    common = collections.Counter(frozenset(r['sig']) for r in rows)
    for sig, _ in common.most_common(60):
        if len(picked) >= TARGET:
            break
        cand = next((r for r in pool if frozenset(r['sig']) == sig), None)
        if cand:
            picked.append(cand)
            pool.remove(cand)

    # tranše velkých dokumentů — na nich se round-trip láme nejspíš
    for r in sorted(pool, key=lambda r: -len(r['html']))[:BIG]:
        picked.append(r)

    index, provenance = [], []
    for i, r in enumerate(picked, 1):
        # Poslední síť: co se do rozboru značek vůbec nedostalo (escapované
        # uvozovky, adresy v komentářích), padne až tady.
        clean = scrub_leftovers(scrub_html(r['html']))
        # Jméno je jen pořadové číslo. Tabulka a sloupec, ze kterých vzorek
        # pochází, patří do provenance.json — ten zůstává lokálně, protože
        # schéma cizí databáze nemá co dělat ve veřejném repozitáři.
        name = '%03d.html' % i
        with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as fh:
            fh.write(clean)
        index.append({'file': name, 'bytes': len(clean), 'features': sorted(r['sig'])})
        provenance.append({'file': name, 'source': r['src']})

    with open(os.path.join(out_dir, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump({'count': len(index), 'features': len(seen), 'samples': index},
                  fh, ensure_ascii=False, indent=2)

    with open(os.path.join(out_dir, 'provenance.json'), 'w', encoding='utf-8') as fh:
        json.dump(provenance, fh, ensure_ascii=False, indent=2)

    sizes = sorted(s['bytes'] for s in index)
    print('vybráno vzorků: %d' % len(index))
    print('velikost:       medián %d B, největší %d B, celkem %d kB'
          % (sizes[len(sizes)//2], sizes[-1], sum(sizes)//1024))
    print('pokryto rysů:   %d' % len(seen))
    feats = collections.Counter(f for r in picked for f in r['sig'])
    print('\nnejčastější rysy:')
    for f, c in feats.most_common(30):
        print('  %-24s %d' % (f, c))


if __name__ == '__main__':
    main()
