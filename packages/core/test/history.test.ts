import { describe, expect, it } from 'vitest';
import { History } from '../src/history/History.js';

const snap = (html: string) => ({ html, mark: null, kind: 'x', at: 0 });

describe('transact', () => {
  it('vnořený transact neodemkne vnější', () => {
    const h = new History(snap('a'));
    h.transact(() => {
      h.transact(() => h.push(snap('b')));
      h.push(snap('c'));
    });
    h.push(snap('d'));
    expect(h.undo()?.html).toBe('a');
  });
});
