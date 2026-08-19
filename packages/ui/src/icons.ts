/** Ikony jako cesty SVG. Žádný sprite ani font — jde to zabalit i vyhodit. */
export const ICONS: Record<string, string> = {
  undo: 'M9 14 4 9l5-5M4 9h10a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a5 5 0 0 0 0 10h3',
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M15 5h-5M14 19H9M13 5l-3 14',
  underline: 'M7 4v6a5 5 0 0 0 10 0V4M5 20h14',
  strike: 'M5 12h14M8 8a3.2 3.2 0 0 1 3.4-3h1.4A3.2 3.2 0 0 1 16 8M8 16a3.2 3.2 0 0 0 3.4 3h1.4a3.2 3.2 0 0 0 3.2-3',
  alignleft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  aligncenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignright: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  alignjustify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  // Jedna čára přes celou šířku. Tři čáry vypadaly jako zarovnání na střed,
  // se kterým ikona sousedí v liště.
  hr: 'M3 12h18',
  removeformat: 'M6 5h12M9 19h6M11 5 9 19M17 13l4 4M21 13l-4 4',
  bullist: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  numlist: 'M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4 13.5h2v2H4v2h2',
  indent: 'M4 6h16M10 12h10M4 18h16M4 10l3 2-3 2',
  outdent: 'M4 6h16M10 12h10M4 18h16M7 10l-3 2 3 2',
  link: 'M10 13a5 5 0 0 0 7.1.1l3-3a5 5 0 0 0-7.1-7.1L11.3 4.7M14 11a5 5 0 0 0-7.1-.1l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7',
  unlink: 'M9 12H5.5a4 4 0 0 1 0-8H9M15 12h3.5a4 4 0 0 1 0 8H15M3 3l18 18',
  openlink: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  image: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4L16 11l4 4M9 9h.01',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M15 5v14',
  rowplus: 'M4 5h16v5H4zM4 14h16v5H4zM12 10v4M10 12h4',
  rowminus: 'M4 5h16v5H4zM4 14h16v5H4zM10 12h4',
  colplus: 'M5 4v16h5V4zM14 4v16h5V4zM12 10v4M10 12h4',
  colminus: 'M5 4v16h5V4zM14 4v16h5V4zM10 12h4',
  merge: 'M4 5h16v14H4zM9 12h6M12 9l3 3-3 3',
  split: 'M4 5h16v14H4zM12 5v14M9 9l-3 3 3 3M15 9l3 3-3 3',
  header: 'M4 5h16v5H4zM4 10v9h16v-9M9 10v9M15 10v9',
  media: 'M4 5h16v14H4zM10 9.5l5 2.5-5 2.5z',
  code: 'M9 7l-5 5 5 5M15 7l5 5-5 5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M16 16l4 4',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  forecolor: 'M5 17 10 5h1.6L16.6 17M7.4 13h7.6',
  backcolor: 'M8 4l8 8-6 6-8-8zM4 12l6-6M17 15s2 2.2 2 3.4A2 2 0 0 1 15 18.4c0-1.2 2-3.4 2-3.4z',
  // Svislý pruh a odsazené řádky — tak citace vypadá na stránce. Uvozovky
  // vykreslené tahem se v 18 px slijí do klikyháku.
  blockquote: 'M4 6v12M9 8h11M9 12h11M9 16h7',
  superscript: 'M4 7l8 10M12 7l-8 10M17 9a2 2 0 1 1 4 0c0 1.3-4 2-4 4h4',
  subscript: 'M4 5l8 10M12 5l-8 10M17 15a2 2 0 1 1 4 0c0 1.3-4 2-4 4h4',
  inlinecode: 'M9 8l-4 4 4 4M15 8l4 4-4 4',
  cut: 'M6 4l12 12M18 4L6 16M7 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M17 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  copy: 'M9 4h9v13H9zM6 8v11h9',
  paste: 'M9 4h6v3H9zM7 5H5v15h14V5h-2',
  pastetext: 'M9 4h6v3H9zM7 5H5v15h14V5h-2M9 12h6M12 12v5',
  selectall: 'M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3M9 9h6v6H9z',
  lineheight: 'M4 5v14M2 7l2-2 2 2M2 17l2 2 2-2M9 6h11M9 12h11M9 18h11',
  tableprops: 'M4 5h16v14H4zM4 10h16M10 10v9M16 14.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  rowprops: 'M4 8h16v8H4zM4 12h16M15 12.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 0 0-3.2 0',
  // Ozubené kolo. Předchozí kroužek s paprsky byl k nerozeznání od jasu.
  settings: 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6'
    + 'M19.1 14.4a1.5 1.5 0 0 0 .3 1.65l.05.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.05'
    + 'a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37V20a1.8 1.8 0 1 1-3.6 0v-.08'
    + 'a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.06.05a1.8 1.8 0 1 1-2.55-2.55'
    + 'l.05-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9H4a1.8 1.8 0 1 1 0-3.6h.08'
    + 'a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.05-.06a1.8 1.8 0 1 1 2.55-2.55'
    + 'l.06.05a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37V4a1.8 1.8 0 1 1 3.6 0v.08'
    + 'a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.05a1.8 1.8 0 1 1 2.55 2.55'
    + 'l-.05.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9H20a1.8 1.8 0 1 1 0 3.6h-.08'
    + 'a1.5 1.5 0 0 0-1.37.9z',
};

export function iconSvg(name: string): string {
  const path = ICONS[name] ?? '';
  return (
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" ' +
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="' + path + '"/></svg>'
  );
}
