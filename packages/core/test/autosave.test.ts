import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosave, draftKey } from '../src/storage/Autosave.js';

/** Úložiště pro testy. `localStorage` v linkedomu není. */
function fakeStorage(): Storage & { failNext?: boolean } {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem(this: { failNext?: boolean }, k: string, v: string) {
      if (this.failNext) { this.failNext = false; throw new Error('QuotaExceededError'); }
      data.set(k, v);
    },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as Storage & { failNext?: boolean };
}

function makeWindow(store: Storage | null, pathname = '/clanek') {
  return { localStorage: store, location: { pathname } } as unknown as Window;
}

let store: ReturnType<typeof fakeStorage>;
beforeEach(() => { store = fakeStorage(); });

describe('ukládání', () => {
  it('uloží až po pauze v psaní, ne po každém znaku', () => {
    vi.useFakeTimers();
    const save = new Autosave(makeWindow(store), 'a', '<p>puvodni</p>', { delay: 500 });

    save.schedule('<p>r</p>');
    save.schedule('<p>ro</p>');
    save.schedule('<p>rozepsane</p>');
    expect(store.getItem('nibble:draft:a')).toBe(null);

    vi.advanceTimersByTime(500);
    expect(JSON.parse(store.getItem('nibble:draft:a')!).html).toBe('<p>rozepsane</p>');
    vi.useRealTimers();
  });

  it('flush uloží hned', () => {
    const save = new Autosave(makeWindow(store), 'a', '<p>puvodni</p>');
    save.flush('<p>nove</p>');
    expect(JSON.parse(store.getItem('nibble:draft:a')!).html).toBe('<p>nove</p>');
  });

  it('shodu s výchozím obsahem nezálohuje', () => {
    // Kdo si stránku jen otevřel a nic nenapsal, nemá co zálohovat.
    const save = new Autosave(makeWindow(store), 'a', '<p>puvodni</p>');
    save.flush('<p>puvodni</p>');
    expect(store.getItem('nibble:draft:a')).toBe(null);
  });

  it('návrat k výchozímu obsahu zálohu zase smaže', () => {
    const save = new Autosave(makeWindow(store), 'a', '<p>puvodni</p>');
    save.flush('<p>zmena</p>');
    save.flush('<p>puvodni</p>');
    expect(store.getItem('nibble:draft:a')).toBe(null);
  });

  it('plné úložiště editor nepoloží', () => {
    const save = new Autosave(makeWindow(store), 'a', '<p>puvodni</p>');
    store.failNext = true;
    expect(() => save.flush('<p>nove</p>')).not.toThrow();
  });
});

describe('nabídka po načtení', () => {
  it('najde zálohu, která se liší od načteného obsahu', () => {
    store.setItem('nibble:draft:a', JSON.stringify({ html: '<p>rozepsane</p>', savedAt: Date.now() }));
    const save = new Autosave(makeWindow(store), 'a', '<p>puvodni</p>');

    expect(save.pending?.html).toBe('<p>rozepsane</p>');
  });

  it('zálohu shodnou s obsahem nenabízí a rovnou ji uklidí', () => {
    store.setItem('nibble:draft:a', JSON.stringify({ html: '<p>stejne</p>', savedAt: Date.now() }));
    const save = new Autosave(makeWindow(store), 'a', '<p>stejne</p>');

    expect(save.pending).toBe(null);
    expect(store.getItem('nibble:draft:a')).toBe(null);
  });

  it('poškozený záznam se přejde mlčky', () => {
    store.setItem('nibble:draft:a', 'tohle není JSON');
    expect(new Autosave(makeWindow(store), 'a', '<p>x</p>').pending).toBe(null);
  });

  it('záznam bez potřebných polí se ignoruje', () => {
    store.setItem('nibble:draft:a', JSON.stringify({ neco: 'jineho' }));
    expect(new Autosave(makeWindow(store), 'a', '<p>x</p>').pending).toBe(null);
  });
});

describe('zahození a úklid', () => {
  it('discard zálohu smaže', () => {
    const save = new Autosave(makeWindow(store), 'a', '<p>puvodni</p>');
    save.flush('<p>nove</p>');
    save.discard();
    expect(store.getItem('nibble:draft:a')).toBe(null);
  });

  it('rebase posune to, co se považuje za rozepsané', () => {
    const save = new Autosave(makeWindow(store), 'a', '<p>puvodni</p>');
    save.rebase('<p>nove</p>');
    save.flush('<p>nove</p>');
    expect(store.getItem('nibble:draft:a')).toBe(null);
  });

  it('staré cizí zálohy se při startu uklidí', () => {
    const stary = Date.now() - 30 * 24 * 60 * 60 * 1000;
    store.setItem('nibble:draft:jiny', JSON.stringify({ html: '<p>x</p>', savedAt: stary }));
    store.setItem('nibble:draft:cerstvy', JSON.stringify({ html: '<p>y</p>', savedAt: Date.now() }));

    new Autosave(makeWindow(store), 'a', '<p>puvodni</p>');

    expect(store.getItem('nibble:draft:jiny')).toBe(null);
    expect(store.getItem('nibble:draft:cerstvy')).not.toBe(null);
  });

  it('cizích klíčů se úklid nedotkne', () => {
    store.setItem('neco-jineho', 'data aplikace');
    new Autosave(makeWindow(store), 'a', '<p>puvodni</p>');
    expect(store.getItem('neco-jineho')).toBe('data aplikace');
  });
});

describe('bez úložiště', () => {
  it('nedostupný localStorage editor nepoloží', () => {
    const save = new Autosave(makeWindow(null), 'a', '<p>x</p>');
    expect(save.available).toBe(false);
    expect(save.pending).toBe(null);
    expect(() => { save.flush('<p>y</p>'); save.discard(); }).not.toThrow();
  });

  it('úložiště, které při sáhnutí hází, se bere jako nedostupné', () => {
    const win = { get localStorage(): Storage { throw new Error('zakázáno'); } } as unknown as Window;
    expect(new Autosave(win, 'a', '<p>x</p>').available).toBe(false);
  });
});

describe('draftKey', () => {
  it('spojí adresu stránky se jménem pole', () => {
    expect(draftKey(makeWindow(store, '/clanek/12'), 'perex', 0)).toBe('/clanek/12#perex');
  });

  it('bez jména rozlišuje editory pořadím', () => {
    const win = makeWindow(store, '/clanek');
    expect(draftKey(win, '', 0)).not.toBe(draftKey(win, '', 1));
  });
});
