import { describe, expect, it } from 'vitest';
import { dropIndex, isNoopMove } from '../../plugins/src/dragHandle.js';

const edges = [
  { top: 0, bottom: 20 },
  { top: 30, bottom: 50 },
  { top: 60, bottom: 100 },
];

describe('kam blok dopadne', () => {
  it.each([
    [-5, 0], [5, 0], [11, 1], [39, 1], [41, 2], [79, 2], [81, 3], [200, 3],
  ])('y=%s → %s', (y, idx) => {
    expect(dropIndex(edges, y)).toBe(idx);
  });

  it('přesun na stejné místo nic nedělá', () => {
    expect(isNoopMove(1, 1)).toBe(true);
    expect(isNoopMove(1, 2)).toBe(true);
    expect(isNoopMove(1, 0)).toBe(false);
    expect(isNoopMove(1, 3)).toBe(false);
  });
});
