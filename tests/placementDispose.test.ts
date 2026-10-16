import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildBuffer } from '../src/scene/buffer';
import { PlacementController } from '../src/scene/placement';
import { buildStove } from '../src/scene/stoveModel';
import { stove } from './fixtures';

const fakeDom = { addEventListener() {} } as unknown as HTMLElement;

function controller() {
  return new PlacementController({
    dom: fakeDom,
    root: new THREE.Group(),
    room: { width: 2, depth: 3.4 },
    getCamera: () => new THREE.PerspectiveCamera(),
    getControls: () => ({ enabled: true }),
  });
}

function collect(obj: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geometries.add(m.geometry);
    if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => materials.add(x));
  });
  return { geometries, materials };
}

describe('PlacementController disposal', () => {
  it('frees the previous stove, buffer and ring geometry but keeps shared stove materials', () => {
    const s = stove();
    const pc = controller();
    const object = buildStove(s);
    const buffer = buildBuffer(s.dims!, s.safety)!;
    pc.setStove({ object, dims: s.dims!, safety: s.safety }, [buffer]);
    const before = collect(pc.holder);
    const shared = collect(object).materials;
    const geoSpies = [...before.geometries].map((g) => vi.spyOn(g, 'dispose'));
    const matSpies = new Map([...before.materials].map((m) => [m, vi.spyOn(m, 'dispose')]));

    pc.setStove({ object: buildStove(s), dims: s.dims!, safety: s.safety });

    expect(geoSpies.every((sp) => sp.mock.calls.length === 1)).toBe(true);
    for (const [m, sp] of matSpies) expect(sp.mock.calls.length).toBe(shared.has(m) ? 0 : 1);
  });
});
