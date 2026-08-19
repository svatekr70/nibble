import { describe, expect, it, vi } from 'vitest';
import { UIRegistry } from '../src/ui/Registry.js';
import type { Editor } from '../src/Editor.js';

/**
 * Registr je čistá data — testuje se bez DOM. Vykreslení tlačítek, dialogy
 * a plovoucí lišta jsou v `e2e/`.
 */
function fakeEditor(): Editor {
  const saved = { start: [0], startOffset: 0, end: [0], endOffset: 0 };
  return {
    focus: vi.fn(),
    selection: { save: () => saved, restore: vi.fn() },
  } as unknown as Editor;
}

describe('UIRegistry', () => {
  it('vrátí, co do něj někdo přihlásil', () => {
    const ui = new UIRegistry(fakeEditor());
    ui.addButton('bold', { icon: 'bold', tooltip: 'Tučně', onAction: () => {} });

    expect(ui.get('bold')?.kind).toBe('button');
    expect(ui.names()).toEqual(['bold']);
  });

  it('rozliší výběr od tlačítka', () => {
    const ui = new UIRegistry(fakeEditor());
    ui.addSelect('blocks', {
      tooltip: 'Blok', options: [], value: () => 'p', onAction: () => {},
    });
    expect(ui.get('blocks')?.kind).toBe('select');
  });

  it('neznámý prvek je undefined, ne výjimka', () => {
    expect(new UIRegistry(fakeEditor()).get('neexistuje')).toBeUndefined();
  });
});

describe('kontextové lišty', () => {
  const el = { tagName: 'A' } as Element;

  it('vrací jen ty, které na uzel sedí', () => {
    const ui = new UIRegistry(fakeEditor());
    ui.addContextToolbar('link', { match: () => el, items: ['unlink'] });
    ui.addContextToolbar('image', { match: () => null, items: ['removeimage'] });

    const found = ui.contextToolbarsFor({} as Node, fakeEditor());
    expect(found).toHaveLength(1);
    expect(found[0]!.items).toEqual(['unlink']);
  });

  it('řadí podle priority, nejvyšší první', () => {
    const ui = new UIRegistry(fakeEditor());
    ui.addContextToolbar('a', { match: () => el, items: ['a'], priority: 1 });
    ui.addContextToolbar('b', { match: () => el, items: ['b'], priority: 20 });
    ui.addContextToolbar('c', { match: () => el, items: ['c'], priority: 10 });

    expect(ui.contextToolbarsFor({} as Node, fakeEditor()).map((t) => t.items[0]))
      .toEqual(['b', 'c', 'a']);
  });
});

describe('dialogy', () => {
  it('bez obsluhy selžou s vysvětlením, ne tiše', async () => {
    const ui = new UIRegistry(fakeEditor());
    await expect(ui.dialog({ title: 'x', fields: [] })).rejects.toThrow(/@nibble\/ui/);
  });

  it('obnoví výběr i po zrušení', async () => {
    const editor = fakeEditor();
    const ui = new UIRegistry(editor);
    ui.setDialogHandler(async () => null);

    expect(await ui.dialog({ title: 'x', fields: [] })).toBeNull();
    expect(editor.selection.restore).toHaveBeenCalledOnce();
    expect(editor.focus).toHaveBeenCalledOnce();
  });

  it('obnoví výběr, i když obsluha spadne', async () => {
    const editor = fakeEditor();
    const ui = new UIRegistry(editor);
    ui.setDialogHandler(async () => { throw new Error('rozbito'); });

    await expect(ui.dialog({ title: 'x', fields: [] })).rejects.toThrow('rozbito');
    expect(editor.selection.restore).toHaveBeenCalledOnce();
  });

  it('vrátí data, která obsluha nasbírala', async () => {
    const ui = new UIRegistry(fakeEditor());
    ui.setDialogHandler(async () => ({ href: 'https://example.com' }));
    expect(await ui.dialog({ title: 'x', fields: [] })).toEqual({ href: 'https://example.com' });
  });
});

describe('poznámky', () => {
  it('bez obsluhy se jen zahodí', () => {
    expect(() => new UIRegistry(fakeEditor()).notify('cokoli')).not.toThrow();
  });

  it('doručí text i úroveň', () => {
    const ui = new UIRegistry(fakeEditor());
    const handler = vi.fn();
    ui.setNotifyHandler(handler);
    ui.notify('nepovedlo se', 'error');
    expect(handler).toHaveBeenCalledWith('nepovedlo se', 'error');
  });
});
