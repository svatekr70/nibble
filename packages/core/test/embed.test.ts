import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { DEFAULT_EMBED_HOSTS, isAllowedEmbed, sanitize } from '../src/model/Sanitizer.js';
import { toEmbedUrl } from '../../plugins/src/media.js';

/**
 * `<iframe>` je jinak jednoznačně nebezpečný a padá. Cílový projekt ale konfiguruje
 * plugin `media` třicetkrát, takže plošné zahazování by rozbilo něco, co lidé
 * používají — proto seznam povolených hostitelů.
 */
describe('povolení rámce', () => {
  it.each([
    ['https://www.youtube-nocookie.com/embed/abc', true],
    ['https://player.vimeo.com/video/123', true],
    ['https://docs.google.com/document/d/x/preview', true],
    ['https://zlo.example/utok', false],
    ['https://youtube.com.zlo.example/x', false],   // podvržená doména
    ['https://notyoutube.com/x', false],
  ])('%s → %s', (src, expected) => {
    expect(isAllowedEmbed(src, DEFAULT_EMBED_HOSTS)).toBe(expected);
  });

  it('prázdný seznam nepovolí nic', () => {
    expect(isAllowedEmbed('https://www.youtube.com/embed/x', [])).toBe(false);
  });

  it('poddoména povoleného hostitele projde', () => {
    expect(isAllowedEmbed('https://media.example.com/x', ['example.com'])).toBe(true);
  });
});

describe('sanitizace rámců', () => {
  function clean(html: string, hosts?: readonly string[]) {
    const { document } = parseWindow();
    const box = document.createElement('div');
    box.innerHTML = html;
    const result = sanitize(box, hosts ? { allowedEmbedHosts: hosts } : {});
    return { html: box.innerHTML, ...result };
  }

  it('bez nastavení padá každý rámec', () => {
    expect(clean('<iframe src="https://www.youtube.com/embed/x"></iframe>').html).toBe('');
  });

  it('rámec z povoleného zdroje projde', () => {
    const html = '<iframe src="https://www.youtube-nocookie.com/embed/x"></iframe>';
    expect(clean(html, DEFAULT_EMBED_HOSTS).html).toBe(html);
  });

  it('rámec odjinud padá i se zapnutým seznamem', () => {
    const out = clean('<iframe src="https://zlo.example/x"></iframe>', DEFAULT_EMBED_HOSTS);
    expect(out.html).toBe('');
    expect(out.removed[0]).toContain('iframe');
  });

  it('rámec bez https padá — i z povolené domény', () => {
    expect(clean('<iframe src="http://www.youtube.com/embed/x"></iframe>',
      DEFAULT_EMBED_HOSTS).html).toBe('');
  });

  it('srcdoc bez src neprojde', () => {
    expect(clean('<iframe srcdoc="<script>x</script>"></iframe>',
      DEFAULT_EMBED_HOSTS).html).toBe('');
  });
});

describe('převod adresy na vkládací', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc123', 'https://www.youtube-nocookie.com/embed/abc123'],
    ['https://youtu.be/abc123', 'https://www.youtube-nocookie.com/embed/abc123'],
    ['https://vimeo.com/987654', 'https://player.vimeo.com/video/987654'],
    ['https://www.loom.com/share/xyz', 'https://www.loom.com/embed/xyz'],
  ])('%s → %s', (input, expected) => {
    expect(toEmbedUrl(input)?.src).toBe(expected);
  });

  it('YouTube bez identifikátoru nedá nic', () => {
    expect(toEmbedUrl('https://www.youtube.com/')).toBeNull();
  });

  it('neznámý zdroj nedá nic', () => {
    expect(toEmbedUrl('https://zlo.example/video')).toBeNull();
  });

  it('http se odmítne', () => {
    expect(toEmbedUrl('http://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('nesmysl se odmítne bez výjimky', () => {
    expect(toEmbedUrl('tohle není adresa')).toBeNull();
  });
});
