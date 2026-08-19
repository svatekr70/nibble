# Vzorek reálného obsahu

Vytaženo z produkční kopie databáze (43 sloupců typu TEXT, 6 314 dokumentů)
skriptem `tools/extract-fixtures.py`. Výběr je greedy set cover přes strukturní
rysy, doplněný o čtyřicet největších dokumentů — jde o pokrytí tvarů markupu,
ne o náhodný vzorek.

## Text je nahrazený, značky ne

Obsah pochází z ostrého provozu, takže **každé slovo v textových uzlech je
nahrazené** náhradou stejné délky. Nedotčené zůstalo všechno, na čem round-trip
stojí:

- značky, jejich pořadí a zanoření,
- atributy včetně pořadí, uvozovek a hodnot `style`, `class`, `width`, …,
- entity (`&nbsp;`, `&iacute;`, `&bull;`), interpunkce a bílé znaky,
- `data:` URL zkrácené na prvních 64 znaků (jinak by sada měla desítky MB).

Adresy v `href` a `src` jsou nahrazené otiskem, `mailto:` obecnou adresou.
Přes to všechno běží ještě `tools/scrub-leftovers.py`: prochází hotový soubor
bez ohledu na značky a přepíše cokoli, co vypadá jako e-mail nebo absolutní
adresa mimo `example.com`. Je to poslední síť pro to, co se do rozboru značek
vůbec nedostane — escapované uvozovky, adresy v komentářích, `data-*` atributy,
do kterých si Google Docs ukládá e-mail autora komentáře.

Soubory se jmenují jen pořadovým číslem. Tabulka a sloupec, ze kterých vzorek
pochází, se ukládají do `provenance.json`, který zůstává lokálně — schéma cizí
databáze do veřejného repozitáře nepatří.

## Aktualizace

    NIBBLE_FIXTURES_DB=databaze \
    NIBBLE_FIXTURES_CONF=/cesta/ke/konfiguraci.neon \
    npm run fixtures

Skript potřebuje běžící lokální MySQL a soubor, ze kterého přečte heslo
(hledá `password:` v bloku `doctrine:`).
