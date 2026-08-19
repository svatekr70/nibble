import { DEFAULT_EMBED_HOSTS, isAllowedEmbed, type Editor, type Plugin } from '@nibble/core';

/**
 * Vkládání videa a zvuku.
 *
 * V cílovém projektu je plugin `media` nakonfigurovaný třicetkrát — po seznamech,
 * odkazech a tabulkách je to nejpoužívanější věc vůbec. Naráží ale na
 * sanitizaci, která `<iframe>` zahazuje, a to právem: cizí rámec na stránce je
 * jednoznačně nebezpečný.
 *
 * Řešením je seznam povolených hostitelů. Uživatel vloží adresu videa, plugin
 * z ní udělá vkládací odkaz a jádro pak při každém načtení ověří, že rámec
 * opravdu míří tam, kam má. Adresa mimo seznam se odmítne s vysvětlením, ne
 * potichu — jinak by uživatel jen viděl, že se nic nestalo.
 */

export interface MediaOptions {
  /** Hostitelé, ze kterých se pouští rámce. Musí sedět s nastavením editoru. */
  allowedHosts?: readonly string[];
  defaultWidth?: number;
  defaultHeight?: number;
}

interface Embed {
  src: string;
  provider: string;
}

/** Převede běžnou adresu videa na tu, která jde vložit do rámce. */
export function toEmbedUrl(input: string): Embed | null {
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return id ? { src: 'https://www.youtube-nocookie.com/embed/' + id, provider: 'YouTube' } : null;
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
    if (url.pathname.startsWith('/embed/')) return { src: url.href, provider: 'YouTube' };
    const id = url.searchParams.get('v');
    return id ? { src: 'https://www.youtube-nocookie.com/embed/' + id, provider: 'YouTube' } : null;
  }

  if (host === 'vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && /^\d+$/.test(id)
      ? { src: 'https://player.vimeo.com/video/' + id, provider: 'Vimeo' }
      : null;
  }
  if (host === 'player.vimeo.com') return { src: url.href, provider: 'Vimeo' };

  if (host === 'loom.com') {
    const id = url.pathname.split('/').filter(Boolean).pop();
    return id ? { src: 'https://www.loom.com/embed/' + id, provider: 'Loom' } : null;
  }

  if (host === 'drive.google.com' || host === 'docs.google.com') {
    return { src: url.href.replace('/view', '/preview'), provider: 'Google' };
  }

  if (host === 'open.spotify.com') {
    return { src: url.href.replace('/track/', '/embed/track/'), provider: 'Spotify' };
  }

  return null;
}

/** Je to přímý odkaz na soubor, který zvládne <video> nebo <audio>? */
function directMedia(src: string): 'video' | 'audio' | null {
  if (/\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(src)) return 'video';
  if (/\.(mp3|ogg|wav|m4a)(\?|#|$)/i.test(src)) return 'audio';
  return null;
}

function closestMedia(node: Node | null, root: Element): Element | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur.nodeType === 1) {
      const tag = (cur as Element).tagName.toLowerCase();
      if (tag === 'iframe' || tag === 'video' || tag === 'audio') return cur as Element;
    }
    cur = cur.parentNode;
  }
  return null;
}

function selectedMedia(editor: Editor): Element | null {
  const range = editor.selection.getRange();
  if (!range) return null;

  const direct = closestMedia(range.startContainer, editor.root);
  if (direct) return direct;

  const child = range.startContainer.childNodes[range.startOffset];
  return child ? closestMedia(child, editor.root) : null;
}

interface MediaData {
  src: string;
  width?: number;
  height?: number;
}

function insertMedia(editor: Editor, data: MediaData, options: MediaOptions): boolean {
  const src = String(data.src ?? '').trim();
  if (!src) return false;

  const doc = editor.document;
  const kind = directMedia(src);
  let element: Element;

  if (kind) {
    element = doc.createElement(kind);
    element.setAttribute('src', src);
    element.setAttribute('controls', 'controls');
  } else {
    const embed = toEmbedUrl(src);
    const hosts = options.allowedHosts ?? DEFAULT_EMBED_HOSTS;

    if (!embed) {
      editor.ui.notify(
        'Tuhle adresu neumím vložit. Zkuste odkaz z YouTube, Vimea, Loomu, '
        + 'Google Disku nebo Spotify, případně přímý odkaz na soubor.', 'error');
      return false;
    }
    if (!isAllowedEmbed(embed.src, hosts)) {
      editor.ui.notify(
        embed.provider + ' není mezi povolenými zdroji. Doplňte ho do '
        + 'nastavení `allowedEmbedHosts`.', 'error');
      return false;
    }

    element = doc.createElement('iframe');
    element.setAttribute('src', embed.src);
    element.setAttribute('width', String(data.width ?? options.defaultWidth ?? 560));
    element.setAttribute('height', String(data.height ?? options.defaultHeight ?? 315));
    element.setAttribute('allowfullscreen', 'allowfullscreen');
    element.setAttribute('frameborder', '0');
    element.setAttribute('title', embed.provider);
  }

  const existing = selectedMedia(editor);
  if (existing) {
    existing.replaceWith(element);
    editor.commit('media');
    return true;
  }

  return editor.insertHTML('<p>' + element.outerHTML + '</p>');
}

async function openMediaDialog(editor: Editor, options: MediaOptions): Promise<void> {
  const existing = selectedMedia(editor);

  const data = await editor.ui.dialog({
    title: existing ? 'Upravit vložené médium' : 'Vložit video nebo zvuk',
    fields: [
      { type: 'url', name: 'src', label: 'Adresa', required: true, placeholder: 'https://' },
      { type: 'number', name: 'width', label: 'Šířka (px)' },
      { type: 'number', name: 'height', label: 'Výška (px)' },
      { type: 'html', name: 'napoveda', html:
        '<p class="nb-hint">YouTube, Vimeo, Loom, Google Disk, Spotify — '
        + 'nebo přímý odkaz na soubor .mp4, .webm či .mp3.</p>' },
    ],
    initial: {
      src: existing?.getAttribute('src') ?? '',
      width: existing?.getAttribute('width') ?? '',
      height: existing?.getAttribute('height') ?? '',
    },
    submitLabel: existing ? 'Uložit' : 'Vložit',
  });

  if (data) editor.exec('media', data);
}

export function createMediaPlugin(options: MediaOptions = {}): Plugin {
  return {
    name: 'media',

    setup(editor) {
      editor.commands.add('media', (ed, args) =>
        insertMedia(ed, (args ?? {}) as MediaData, options));

      editor.commands.add('removemedia', (ed) => {
        const element = selectedMedia(ed);
        if (!element) return false;
        element.remove();
        ed.commit('media');
        return true;
      }, (ed) => selectedMedia(ed) !== null);

      editor.ui.addButton('media', {
        icon: 'media', tooltip: 'Video nebo zvuk',
        onAction: (ed) => { void openMediaDialog(ed, options); },
      });

      editor.ui.addButton('removemedia', {
        icon: 'trash', tooltip: 'Odebrat médium',
        enabled: (ed) => ed.can('removemedia'),
        onAction: (ed) => { ed.focus(); ed.exec('removemedia'); },
      });

      editor.ui.addContextToolbar('media', {
        match: (node, ed) => {
          const direct = closestMedia(node, ed.root);
          if (direct) return direct;
          const range = ed.selection.getRange();
          const child = range?.startContainer.childNodes[range.startOffset];
          return child ? closestMedia(child, ed.root) : null;
        },
        items: ['media', 'removemedia'],
        priority: 20,
      });
    },
  };
}

export const media: Plugin = createMediaPlugin();
export { closestMedia, selectedMedia };
