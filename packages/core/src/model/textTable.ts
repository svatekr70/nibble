/**
 * Text oddělený tabulátory → tabulka.
 *
 * Excel a Sheets dávají do schránky i `text/html`, takže mřížku nesou s sebou
 * a stará se o ně `pasteTable.ts`. Bez HTML se ale chodí častěji, než by se
 * čekalo: výpis z terminálu, uložené `.tsv`, sloupce z textového editoru nebo
 * Ctrl+Shift+V ze sešitu. Ve všech těch případech je mřížka ve vstupu zapsaná
 * — tabulátory ji drží — a přesto z ní dosud vznikl jeden odstavec.
 *
 * Na rozdíl od textu vytaženého z PDF se tu nic nedomýšlí. Buď mají všechny
 * řádky stejný počet tabulátorů, a pak je to tabulka, nebo nemají, a pak je to
 * text s tabulátory. Nic mezi tím se neodhaduje: špatně uhodnutá mřížka tiše
 * přehází data a nikdo si toho nevšimne, kdežto odstavec je vidět na první
 * pohled a opraví se ručně.
 */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (ch) => ESCAPES[ch]!);
}

/** Míň řádků už není mřížka — jeden řádek s tabulátory je odsazená věta. */
const MIN_ROWS = 2;

/**
 * Rozpadne text na buňky, nebo vrátí null, když to mřížka není.
 *
 * Rozhodování i převod čtou stejnou funkci schválně — kdyby to byly dvě, dá se
 * jedna změnit a druhá ne a rozpozná se pak něco jiného, než se převede.
 */
function tableRows(text: string): string[][] | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  // Prázdné řádky na krajích jsou zbytek po výběru, ne součást mřížky.
  while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();

  if (lines.length < MIN_ROWS) return null;

  const rows = lines.map((line) => line.split('\t'));
  const cols = rows[0]!.length;

  // Jeden sloupec není mřížka. Rozdílný počet buněk znamená, že tabulátory
  // v textu jen odsazují — a prázdný řádek uprostřed spadne sem taky, protože
  // se rozpadne na jedinou buňku. Obojí patří do odstavce.
  if (cols < 2) return null;
  if (rows.some((row) => row.length !== cols)) return null;

  return rows;
}

function cell(value: string): string {
  const text = value.trim();
  // Do prázdné buňky bez `<br>` nejde kliknout. Stejně to řeší `emptyCell`
  // v dom/tables.ts, jen tam se staví přes DOM a tady se skládá zápis.
  return '<td>' + (text === '' ? '<br>' : escapeHtml(text)) + '</td>';
}

/**
 * Vrátí tabulku, nebo null, když vstup mřížku nenese.
 *
 * Záhlaví se nedělá. Že je první řádek popisek sloupců, bývá pravda, ale ne
 * vždycky — a je to dohad o významu, ne o zápisu. Označit řádek jako záhlaví
 * umí lišta jedním klepnutím; uhodnout ho špatně už uživatel neopraví, protože
 * si toho nevšimne.
 */
export function textTableToHtml(text: string): string | null {
  const rows = tableRows(text);
  if (!rows) return null;

  return '<table><tbody>'
    + rows.map((row) => '<tr>' + row.map(cell).join('') + '</tr>').join('')
    + '</tbody></table>';
}
