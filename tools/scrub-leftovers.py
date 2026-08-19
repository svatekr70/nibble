#!/usr/bin/env python3
"""
Poslední síť před zveřejněním vzorků.

`extract-fixtures.py` nahrazuje text a hodnoty odkazů, ale strukturní atributy
nechává být — a to je díra: Google Docs si do `data-hovercard-id` ukládá
e-mailovou adresu autora komentáře a odkaz zapsaný s escapovanými uvozovkami se
do rozboru značky vůbec nedostane. Ve 142 vzorcích to znamenalo tři skutečné
adresy a dva interní hostitele.

Tenhle průchod jde po celém souboru a nedívá se na značky: co vypadá jako
e-mail nebo absolutní adresa a není na example.com, přepíše. Markup zůstává
nedotčený, protože náhrady neobsahují nic, co by HTML znamenalo.

Spouští se sám z extract-fixtures.py; ručně nad hotovými soubory:

    python3 tools/scrub-leftovers.py packages/core/test/fixtures
"""

import hashlib
import re
import sys
from pathlib import Path

EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
URL = re.compile(r'https?://[^\s"\'<>\\)]+')

SAFE_EMAIL = 'someone@example.com'
SAFE_HOST = 'example.com'


def replace_url(match):
    """Adresa mimo example.com se nahradí stabilním, ale bezobsažným odkazem."""
    url = match.group(0)
    host = url.split('//', 1)[1].split('/', 1)[0].lower()
    if host == SAFE_HOST or host.endswith('.' + SAFE_HOST):
        return url
    return 'https://example.com/' + hashlib.sha1(url.encode()).hexdigest()[:8]


def replace_email(match):
    address = match.group(0)
    return address if address.endswith('@' + SAFE_HOST) else SAFE_EMAIL


def scrub(html):
    # Nejdřív adresy: e-mail může být součástí URL a druhé kolo by ji rozbilo.
    return EMAIL.sub(replace_email, URL.sub(replace_url, html))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    changed = 0
    for path in sorted(Path(sys.argv[1]).glob('*.html')):
        before = path.read_text(encoding='utf-8')
        after = scrub(before)
        if after != before:
            path.write_text(after, encoding='utf-8')
            changed += 1
            print('upraveno:', path.name)

    print(f'\n  hotovo, {changed} souborů upraveno')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
