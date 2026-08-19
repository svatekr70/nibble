import type { Page } from '@playwright/test';

export const CONTENT = '.nb-content';

/** Načte do editoru zadané HTML. */
export async function mount(page: Page, html: string): Promise<void> {
  await page.goto('/e2e.html');
  await page.waitForFunction(() => (window as any).ready === true);
  await page.evaluate((h) => (window as any).mount(h), html);
}

/** Načte do editoru reálný dokument z ostrého provozu. */
export async function mountFixture(page: Page, name: string): Promise<void> {
  await page.goto('/e2e.html');
  await page.waitForFunction(() => (window as any).ready === true);
  await page.evaluate((n) => (window as any).mountFixture(n), name);
}

export function html(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).ed.getHTML());
}

export function original(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).original);
}

/** Postaví kurzor na zadaný offset uvnitř n-tého bloku nejvyšší úrovně. */
export async function caret(page: Page, blockIndex: number, offset: number): Promise<void> {
  await page.evaluate(([i, o]) => {
    const ed = (window as any).ed;
    const block = ed.root.children[i as number];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode() ?? block;
    ed.selection.collapseTo(first, o as number);
    ed.root.focus();
  }, [blockIndex, offset] as const);
}

/** Vybere text v n-tém bloku od `from` do `to`. */
export async function select(page: Page, blockIndex: number, from: number, to: number): Promise<void> {
  await page.evaluate(([i, a, b]) => {
    const ed = (window as any).ed;
    const block = ed.root.children[i as number];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode();
    if (!text) return;
    const range = document.createRange();
    range.setStart(text, a as number);
    range.setEnd(text, b as number);
    ed.selection.setRange(range);
    ed.root.focus();
  }, [blockIndex, from, to] as const);
}
