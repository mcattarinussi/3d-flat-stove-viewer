import { describe, expect, it } from 'vitest';
import { bufferExtents, buildBuffer } from '../src/scene/buffer';
import type { Safety } from '../src/data/types';

const dims = { w: 0.5, d: 0.4, h: 1.2 };
const full: Safety = { rear: 0.2, side: 0.4, front: 1.5, ceiling: 0.75, floorFront: 1, notes: null };
const names = (g: { children: { name: string }[] } | null) => (g ? g.children.map((c) => c.name).sort() : null);
const expectExtents = (got: ReturnType<typeof bufferExtents>, want: { x0: number; x1: number; z0: number; z1: number }) => {
  expect(got).not.toBeNull();
  for (const k of ['x0', 'x1', 'z0', 'z1'] as const) expect(got![k]).toBeCloseTo(want[k]);
};

describe('bufferExtents', () => {
  it('extends the footprint by each distance', () => {
    expectExtents(bufferExtents(dims, full), { x0: -0.65, x1: 0.65, z0: -0.4, z1: 1.7 });
  });

  it('treats null sides as zero, without defaults', () => {
    expectExtents(bufferExtents(dims, { ...full, rear: null, front: null }), { x0: -0.65, x1: 0.65, z0: -0.2, z1: 0.2 });
  });

  it('returns null when nothing horizontal is declared', () => {
    expect(bufferExtents(dims, null)).toBeNull();
    expect(bufferExtents(dims, { ...full, rear: null, side: null, front: null })).toBeNull();
  });
});

describe('buildBuffer', () => {
  it('builds every part for full data', () => {
    expect(names(buildBuffer(dims, full))).toEqual(['buffer-box', 'buffer-ceiling', 'buffer-edges', 'buffer-floor']);
  });

  it('draws nothing without safety data', () => {
    expect(buildBuffer(dims, null)).toBeNull();
    expect(buildBuffer(dims, { rear: null, side: null, front: null, ceiling: null, floorFront: null, notes: 'x' })).toBeNull();
  });

  it('keeps floor and ceiling parts when only those are declared', () => {
    expect(names(buildBuffer(dims, { rear: null, side: null, front: null, ceiling: 0.5, floorFront: 0.3, notes: null }))).toEqual([
      'buffer-ceiling',
      'buffer-floor',
    ]);
  });
});
