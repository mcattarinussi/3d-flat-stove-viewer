import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { baseHeight, buildChimney, buildStove, collarOf, cropUv, frontAspect, frontLayout, frontPhotoRect } from '../src/scene/stoveModel';
import { stove } from './fixtures';

function expectBox(obj: THREE.Object3D, w: number, h: number, d: number) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(w, 6);
  expect(size.y).toBeCloseTo(h, 6);
  expect(size.z).toBeCloseTo(d, 6);
  expect(box.min.y).toBeCloseTo(0, 6);
  expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 6);
  expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 6);
}

const dims = { w: 0.504, d: 0.433, h: 1.282 };

describe('buildStove bounding box', () => {
  it('box stove with top outlet', () => expectBox(buildStove(stove({ dims })), 0.504, 1.282, 0.433));
  it('round stove', () => expectBox(buildStove(stove({ dims: { w: 0.5, d: 0.5, h: 1.1 }, round: true })), 0.5, 1.1, 0.5));
  it('rear-only outlet', () => expectBox(buildStove(stove({ dims, flueOutlets: ['rear'] })), 0.504, 1.282, 0.433));
  it('cookstove with oven', () =>
    expectBox(buildStove(stove({ dims: { w: 0.9, d: 0.6, h: 0.85 }, category: 'cookstove', hasOven: true })), 0.9, 0.85, 0.6));
  it('storage stove on a plinth', () =>
    expectBox(buildStove(stove({ dims: { w: 0.7, d: 0.5, h: 1.6 }, category: 'storage_stove' })), 0.7, 1.6, 0.5));
  it('stove with oven', () => expectBox(buildStove(stove({ dims, hasOven: true })), 0.504, 1.282, 0.433));
  it('throws without dims', () => expect(() => buildStove(stove({ dims: null }))).toThrow(/dimensioni/));
});

describe('frontLayout', () => {
  const cases = [
    stove({ dims }),
    stove({ dims, hasOven: true }),
    stove({ dims: { w: 0.9, d: 0.6, h: 0.85 }, category: 'cookstove', hasOven: true }),
    stove({ dims: { w: 0.9, d: 0.6, h: 0.85 }, category: 'thermo_cookstove', hasOven: false }),
    stove({ dims: { w: 0.7, d: 0.5, h: 1.6 }, category: 'storage_stove' }),
  ];

  it('keeps every panel inside the front face, above the base', () => {
    for (const s of cases) {
      const { w, h } = s.dims!;
      for (const p of frontLayout(s)) {
        expect(p.x0).toBeGreaterThanOrEqual(-w / 2);
        expect(p.x1).toBeLessThanOrEqual(w / 2);
        expect(p.y0).toBeGreaterThanOrEqual(baseHeight(s));
        expect(p.y1).toBeLessThanOrEqual(h);
        expect(p.x1).toBeGreaterThan(p.x0);
        expect(p.y1).toBeGreaterThan(p.y0);
      }
    }
  });

  it('has exactly one fire glass, and an oven door when has_oven', () => {
    for (const s of cases) {
      const kinds = frontLayout(s).map((p) => p.kind);
      expect(kinds.filter((k) => k === 'glass')).toHaveLength(1);
      expect(kinds.includes('oven')).toBe(s.hasOven);
    }
  });
});

describe('collar and flue hint', () => {
  it('defaults to 150 mm on top when the outlet is unknown', () => {
    const c = collarOf(stove({ dims, flueDiameter: null, flueOutlets: [] }));
    expect(c.position).toBe('top');
    expect(c.diameter).toBeCloseTo(0.15);
    expect(c.center.y).toBeCloseTo(1.282 - c.height / 2);
  });

  it('uses the rear when only rear is listed', () => {
    const c = collarOf(stove({ dims, flueOutlets: ['rear'] }));
    expect(c.position).toBe('rear');
    expect(c.center.z).toBeCloseTo(-0.433 / 2 + c.height / 2);
  });

  it('caps the collar to the stove footprint', () => {
    expect(collarOf(stove({ dims: { w: 0.2, d: 0.2, h: 1 }, flueDiameter: 0.25 })).diameter).toBeCloseTo(0.16);
  });

  const boxOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

  it('top outlet: pipe from the stove top to the ceiling, with a ceiling collar', () => {
    const s = stove({ dims, flueOutlets: ['top'], flueDiameter: 0.15 });
    const g = buildChimney(s, 2.7);
    const pipe = boxOf(g.getObjectByName('chimney-vertical')!);
    expect(pipe.min.y).toBeCloseTo(1.282);
    expect(pipe.max.y).toBeCloseTo(2.7);
    expect(pipe.max.x - pipe.min.x).toBeCloseTo(0.15);
    expect((pipe.min.z + pipe.max.z) / 2).toBeCloseTo(collarOf(s).center.z);
    expect(boxOf(g.getObjectByName('chimney-ceiling')!).max.y).toBeCloseTo(2.7);
    expect(g.getObjectByName('chimney-run')).toBeUndefined();
  });

  it('rear outlet: 25 cm run backwards, elbow, then up to the ceiling', () => {
    const s = stove({ dims, flueOutlets: ['rear'] });
    const c = collarOf(s);
    const g = buildChimney(s, 2.7);
    const run = boxOf(g.getObjectByName('chimney-run')!);
    expect(run.max.z).toBeCloseTo(-0.433 / 2);
    expect(run.min.z).toBeCloseTo(-0.433 / 2 - 0.25);
    const up = boxOf(g.getObjectByName('chimney-vertical')!);
    expect(up.min.y).toBeCloseTo(c.center.y);
    expect(up.max.y).toBeCloseTo(2.7);
    expect((up.min.z + up.max.z) / 2).toBeCloseTo(-0.433 / 2 - 0.25);
    expect(g.getObjectByName('chimney-elbow')).toBeDefined();
  });
});

describe('front photo', () => {
  const s = stove({ dims });
  const front = { texture: new THREE.Texture(), crop: { x: 0.2, y: 0.1, w: 0.5, h: 0.8 } };

  it('maps a top-left crop to flipped UVs', () => {
    const uv = cropUv(front.crop);
    expect(uv.u0).toBeCloseTo(0.2);
    expect(uv.u1).toBeCloseTo(0.7);
    expect(uv.v0).toBeCloseTo(0.1);
    expect(uv.v1).toBeCloseTo(0.9);
  });

  it('covers the front between the base and the collar', () => {
    const r = frontPhotoRect(s);
    expect(r.x1 - r.x0).toBeCloseTo(0.504);
    expect(r.y0).toBeCloseTo(baseHeight(s));
    expect(r.y1).toBeCloseTo(1.282 - collarOf(s).height);
    expect(frontAspect(s)).toBeCloseTo(0.504 / (r.y1 - r.y0));
  });

  it('replaces the door panels and keeps the exact bounding box', () => {
    expect(buildStove(s).getObjectByName('panels')).toBeDefined();
    const g = buildStove(s, front);
    expect(g.getObjectByName('panels')).toBeUndefined();
    const photo = g.getObjectByName('front-photo') as THREE.Mesh;
    const uv = photo.geometry.getAttribute('uv');
    expect([uv.getX(0), uv.getY(0)]).toEqual([expect.closeTo(0.2), expect.closeTo(0.9)]);
    expect([uv.getX(3), uv.getY(3)]).toEqual([expect.closeTo(0.7), expect.closeTo(0.1)]);
    expect((photo.material as THREE.Material).userData.disposable).toBe(true);
    expectBox(g, 0.504, 1.282, 0.433);
  });
});
