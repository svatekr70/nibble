import type { Editor, Plugin } from '@nibble/core';

/**
 * Obrázky.
 *
 * Nahrávání je adaptér, ne pevná implementace: každý projekt má vlastní backend
 * a editor nemá důvod o něm cokoli vědět. Výchozí chování je `data:` URL —
 * přesně to, co dnes dělá cílová aplikace (`automatic_uploads: false` a `FileReader`
 * ve `file_picker_callback`), takže se dá přejít bez zásahu do serveru.
 */

export type UploadAdapter = (
  file: File,
  onProgress?: (percent: number) => void,
) => Promise<string>;

export interface ImageOptions {
  /** Nahrání souboru. Bez něj se obrázek vloží jako data: URL. */
  upload?: UploadAdapter;
  /** Strop pro data: URL v bajtech. Větší soubor bez adaptéru odmítneme. */
  maxInlineBytes?: number;
}

const DEFAULT_MAX_INLINE = 512 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Soubor se nepodařilo přečíst.'));
    reader.readAsDataURL(file);
  });
}

function closestImage(node: Node | null, root: Element): HTMLImageElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur.nodeType === 1 && (cur as Element).tagName.toLowerCase() === 'img') {
      return cur as HTMLImageElement;
    }
    cur = cur.parentNode;
  }
  return null;
}

/** Obrázek, na kterém stojí kurzor — i když je vybraný jako celý uzel. */
function selectedImage(editor: Editor): HTMLImageElement | null {
  const range = editor.selection.getRange();
  if (!range) return null;

  const direct = closestImage(range.startContainer, editor.root);
  if (direct) return direct;

  const node = range.startContainer.childNodes[range.startOffset];
  return node ? closestImage(node, editor.root) : null;
}

interface ImageData {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

function insertImage(editor: Editor, data: ImageData): boolean {
  const src = String(data.src ?? '').trim();
  if (!src) return false;

  const existing = selectedImage(editor);
  const img = existing ?? editor.document.createElement('img');

  img.setAttribute('src', src);
  img.setAttribute('alt', String(data.alt ?? ''));
  if (data.width) img.setAttribute('width', String(data.width));
  else img.removeAttribute('width');
  if (data.height) img.setAttribute('height', String(data.height));
  else img.removeAttribute('height');

  if (!existing) {
    const range = editor.selection.getRange();
    if (!range) return false;
    range.deleteContents();
    range.insertNode(img);
    editor.selection.collapseTo(img.parentNode ?? editor.root, 0);
  }

  editor.commit('image');
  return true;
}

async function resolveSource(
  editor: Editor,
  file: File | null,
  typed: string,
  options: ImageOptions,
): Promise<string | null> {
  if (!file) return typed.trim() || null;

  if (options.upload) {
    try {
      return await options.upload(file);
    } catch (error) {
      editor.ui.notify('Nahrání selhalo: ' + (error as Error).message, 'error');
      return null;
    }
  }

  const limit = options.maxInlineBytes ?? DEFAULT_MAX_INLINE;
  if (file.size > limit) {
    editor.ui.notify(
      'Soubor je větší než ' + Math.round(limit / 1024) + ' kB. '
      + 'Bez nastaveného nahrávání se vkládá přímo do obsahu, což by dokument nafouklo.',
      'error',
    );
    return null;
  }

  return readAsDataUrl(file);
}

async function openImageDialog(editor: Editor, options: ImageOptions): Promise<void> {
  const existing = selectedImage(editor);

  const data = await editor.ui.dialog({
    title: existing ? 'Upravit obrázek' : 'Vložit obrázek',
    fields: [
      { type: 'file', name: 'file', label: 'Soubor', accept: 'image/*' },
      { type: 'text', name: 'src', label: 'nebo adresa obrázku', placeholder: 'https://' },
      { type: 'text', name: 'alt', label: 'Popis pro čtečky a náhradní text' },
      { type: 'number', name: 'width', label: 'Šířka (px)' },
      { type: 'number', name: 'height', label: 'Výška (px)' },
    ],
    initial: {
      src: existing?.getAttribute('src')?.startsWith('data:') ? '' : existing?.getAttribute('src') ?? '',
      alt: existing?.getAttribute('alt') ?? '',
      width: existing?.getAttribute('width') ?? '',
      height: existing?.getAttribute('height') ?? '',
    },
    submitLabel: existing ? 'Uložit' : 'Vložit',
  });

  if (!data) return;

  const src = await resolveSource(
    editor, (data.file as File | null) ?? null, String(data.src ?? ''), options,
  );
  if (!src) return;

  editor.exec('image', { src, alt: data.alt, width: data.width, height: data.height });
}

export function createImagePlugin(options: ImageOptions = {}): Plugin {
  return {
    name: 'image',

    setup(editor) {
      editor.commands.add('image', (ed, args) => insertImage(ed, (args ?? {}) as ImageData));

      editor.commands.add('removeimage', (ed) => {
        const img = selectedImage(ed);
        if (!img) return false;
        img.parentNode?.removeChild(img);
        ed.commit('image');
        return true;
      }, (ed) => selectedImage(ed) !== null);

      editor.ui.addButton('image', {
        icon: 'image', tooltip: 'Obrázek',
        onAction: (ed) => { void openImageDialog(ed, options); },
      });

      editor.ui.addButton('removeimage', {
        icon: 'trash', tooltip: 'Odebrat obrázek',
        enabled: (ed) => ed.can('removeimage'),
        onAction: (ed) => { ed.focus(); ed.exec('removeimage'); },
      });

      editor.ui.addContextToolbar('image', {
        match: (node, ed) => {
          const direct = closestImage(node, ed.root);
          if (direct) return direct;
          const range = ed.selection.getRange();
          const child = range?.startContainer.childNodes[range.startOffset];
          return child ? closestImage(child, ed.root) : null;
        },
        items: ['image', 'removeimage'],
        priority: 20,
      });

      /** Vložení obrázku ze schránky nebo přetažením. */
      const handleFiles = async (files: readonly File[]): Promise<void> => {
        const images = files.filter((f) => f.type.startsWith('image/'));
        if (images.length === 0) return;

        for (const file of images) {
          const src = await resolveSource(editor, file, '', options);
          if (src) editor.exec('image', { src, alt: '' });
        }
      };

      const onPaste = (event: Event): void => {
        const e = event as ClipboardEvent;
        const files = Array.from(e.clipboardData?.files ?? []);
        if (files.length === 0) return;
        e.preventDefault();
        void handleFiles(files);
      };

      const onDrop = (event: Event): void => {
        const e = event as DragEvent;
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length === 0) return;
        e.preventDefault();
        void handleFiles(files);
      };

      const onDragOver = (event: Event): void => {
        const e = event as DragEvent;
        if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
      };

      editor.root.addEventListener('paste', onPaste);
      editor.root.addEventListener('drop', onDrop);
      editor.root.addEventListener('dragover', onDragOver);

      return () => {
        editor.root.removeEventListener('paste', onPaste);
        editor.root.removeEventListener('drop', onDrop);
        editor.root.removeEventListener('dragover', onDragOver);
      };
    },
  };
}

/** Obrázky s výchozím nastavením — data: URL, bez nahrávání na server. */
export const image: Plugin = createImagePlugin();

export { closestImage, selectedImage };
