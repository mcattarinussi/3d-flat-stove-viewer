import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { fitToDims, loadModelIndex, loadStoveObject } from '../src/scene/stoveModel';
import { stove } from './fixtures';

const dims = { w: 0.5, d: 0.4, h: 1.2 };

function fakeModel(): THREE.Object3D {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3));
  m.position.set(5, 5, 5);
  return m;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fitToDims', () => {
  it('scales and recentres any model to the catalogue box', () => {
    const wrapper = fitToDims(fakeModel(), dims);
    const box = new THREE.Box3().setFromObject(wrapper);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.5);
    expect(size.y).toBeCloseTo(1.2);
    expect(size.z).toBeCloseTo(0.4);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.min.x + box.max.x).toBeCloseTo(0);
    expect(box.min.z + box.max.z).toBeCloseTo(0);
    expect(wrapper.scale.x).toBe(-1);
  });
});

describe('loadStoveObject', () => {
  const s = stove({ id: 'eva-calor-alberta', dims });

  it('uses the GLB when listed', async () => {
    const loader = vi.fn(async () => fakeModel());
    const obj = await loadStoveObject(s, new Set(['eva-calor-alberta']), loader);
    expect(loader).toHaveBeenCalledWith('./models/eva-calor-alberta.glb');
    expect(obj.scale.x).toBe(-1);
  });

  it('falls back to the parametric model when loading fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const obj = await loadStoveObject(s, new Set(['eva-calor-alberta']), async () => {
      throw new Error('404');
    });
    expect(obj.name).toBe('stove-eva-calor-alberta');
    expect(warn).toHaveBeenCalled();
  });

  it('does not load anything for unlisted stoves', async () => {
    const loader = vi.fn(async () => fakeModel());
    const obj = await loadStoveObject(s, new Set(), loader);
    expect(loader).not.toHaveBeenCalled();
    expect(obj.name).toBe('stove-eva-calor-alberta');
  });
});

describe('loadModelIndex', () => {
  it('returns the listed ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(['a', 3, 'b']))));
    expect([...(await loadModelIndex('./models/index.json'))]).toEqual(['a', 'b']);
  });

  it('returns an empty set on HTTP errors or bad JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    expect((await loadModelIndex('x')).size).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{bad')));
    expect((await loadModelIndex('x')).size).toBe(0);
  });
});
