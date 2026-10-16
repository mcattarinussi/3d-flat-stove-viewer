import { describe, expect, it } from 'vitest';
import { clampCrop, fitAspect, MIN_CROP, rectFromPoints } from '../src/ui/cropMath';

describe('cropMath', () => {
  it('builds a rect from any two corners, clamped to the image', () => {
    expect(rectFromPoints(0.8, 0.9, 0.2, 0.1)).toEqual({ x: 0.2, y: 0.1, w: expect.closeTo(0.6), h: expect.closeTo(0.8) });
    const r = rectFromPoints(-0.5, 0.5, 1.5, 0.6);
    expect(r.x).toBe(0);
    expect(r.w).toBe(1);
  });

  it('keeps a minimum size and stays inside the image', () => {
    expect(clampCrop({ x: 0.5, y: 0.5, w: 0, h: -1 })).toEqual({ x: 0.5, y: 0.5, w: MIN_CROP, h: MIN_CROP });
    const c = clampCrop({ x: 0.9, y: -0.2, w: 0.4, h: 0.5 });
    expect(c.x + c.w).toBeCloseTo(1);
    expect(c.y).toBe(0);
  });

  it('fits a target aspect in image pixels without leaving the image', () => {
    const c = fitAspect({ x: 0.1, y: 0.1, w: 0.4, h: 0.9 }, 0.5, 1000, 800);
    expect((c.w * 1000) / (c.h * 800)).toBeCloseTo(0.5);
    expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
    const wide = fitAspect({ x: 0.7, y: 0, w: 0.3, h: 0.1 }, 3, 1000, 1000);
    expect((wide.w * 1000) / (wide.h * 1000)).toBeCloseTo(3);
    expect(wide.x + wide.w).toBeLessThanOrEqual(1 + 1e-9);
  });
});
