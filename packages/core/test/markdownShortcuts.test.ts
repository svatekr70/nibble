import { describe, expect, it } from 'vitest';
import {
  matchBlockShortcut, matchEnterShortcut, matchInlineShortcut,
} from '../../plugins/src/markdown.js';

/**
 * Jen čisté funkce. `textBeforeCaret` potřebuje `Range.setStart`, který
 * linkedom nemá — testuje se v Playwrightu (`e2e/markdownShortcuts.spec.ts`).
 */

describe('blokové zkratky', () => {
  it.each([
    ['# ', { kind: 'heading', level: 1 }],
    ['### ', { kind: 'heading', level: 3 }],
    ['###### ', { kind: 'heading', level: 6 }],
    ['- ', { kind: 'bullist' }],
    ['* ', { kind: 'bullist' }],
    ['1. ', { kind: 'numlist', start: 1 }],
    ['5. ', { kind: 'numlist', start: 5 }],
    ['> ', { kind: 'quote' }],
    ['[ ] ', { kind: 'task', checked: false }],
    ['[x] ', { kind: 'task', checked: true }],
    ['[X] ', { kind: 'task', checked: true }],
  ])('%j', (text, expected) => {
    expect(matchBlockShortcut(text)).toEqual(expected);
  });

  it.each(['#', '####### ', 'a# ', 'Text - ', '1.', '1) ', ' - ', '# '])('%j nic', (text) => {
    expect(matchBlockShortcut(text)).toBeNull();
  });
});

describe('zkratky na Enter', () => {
  it('---', () => expect(matchEnterShortcut('---')).toBe('hr'));
  it('```', () => expect(matchEnterShortcut('```')).toBe('pre'));
  it.each(['--', '----', 'a---', '``` js'])('%j nic', (t) => expect(matchEnterShortcut(t)).toBeNull());
});

describe('řádkové zkratky', () => {
  it.each([
    ['ahoj **tučně**', { tag: 'strong', start: 5, inner: 'tučně' }],
    ['**a**', { tag: 'strong', start: 0, inner: 'a' }],
    ['x *kurzíva*', { tag: 'em', start: 2, inner: 'kurzíva' }],
    ['x _kurzíva_', { tag: 'em', start: 2, inner: 'kurzíva' }],
    ['kód `a+b`', { tag: 'code', start: 4, inner: 'a+b' }],
    ['~~pryč~~', { tag: 's', start: 0, inner: 'pryč' }],
    ['a **dvě slova**', { tag: 'strong', start: 2, inner: 'dvě slova' }],
    ['ž _kurzíva_', { tag: 'em', start: 2, inner: 'kurzíva' }],
    ['(*šikmo*', { tag: 'em', start: 1, inner: 'šikmo' }],
  ])('%j', (text, expected) => {
    expect(matchInlineShortcut(text)).toEqual(expected);
  });

  it.each([
    'snake_case_',
    '** mezera**',
    '**mezera **',
    '**x*',
    '2 * 3 * 4',
    '****',
    'a*b*',
    // Uprostřed slova s diakritikou taky ne — `\w` české znaky nezná.
    'proměnná_délka_',
    'č*a*',
    'délka2_x_',
  ])('%j nic', (text) => {
    expect(matchInlineShortcut(text)).toBeNull();
  });
});
