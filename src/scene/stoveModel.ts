import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Dims, Stove } from '../data/types';

export interface Panel {
  kind: 'glass' | 'oven' | 'ash';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Collar {
  diameter: number;
  height: number;
  position: 'top' | 'rear';
  center: { x: number; y: number; z: number };
}

/** Depth of the door/frame layer on the front face. */
const FRONT = 0.012;
const COLLAR_H = 0.06;

const isCook = (s: Stove) => s.category === 'cookstove' || s.category === 'thermo_cookstove';

function dimsOf(s: Stove) {
  if (!s.dims) throw new Error(`La stufa ${s.id} non ha dimensioni`);
  return s.dims;
}

export function baseHeight(s: Stove): number {
  return s.category === 'stove' ? 0.08 : 0.06;
}

export function collarOf(s: Stove): Collar {
  const { w, d, h } = dimsOf(s);
  const diameter = Math.min(s.flueDiameter ?? 0.15, 0.8 * Math.min(w, d));
  const position = s.flueOutlets.length === 0 || s.flueOutlets.includes('top') ? 'top' : 'rear';
  const base = baseHeight(s);
  const bodyBack = position === 'rear' ? -d / 2 + COLLAR_H : -d / 2;
  const bodyZ = (bodyBack + d / 2 - FRONT) / 2;
  const center =
    position === 'top'
      ? { x: 0, y: h - COLLAR_H / 2, z: bodyZ }
      : { x: 0, y: base + (h - base) * 0.8, z: -d / 2 + COLLAR_H / 2 };
  return { diameter, height: COLLAR_H, position, center };
}

function bodyTop(s: Stove): number {
  return collarOf(s).position === 'top' ? dimsOf(s).h - COLLAR_H : dimsOf(s).h;
}

export function frontLayout(s: Stove): Panel[] {
  const { w } = dimsOf(s);
  const base = baseHeight(s);
  const H = bodyTop(s) - base;
  const at = (f: number) => base + f * H;
  if (isCook(s)) {
    const fx0 = -w / 2 + 0.06;
    const fx1 = fx0 + 0.36 * w;
    const panels: Panel[] = [
      { kind: 'glass', x0: fx0, x1: fx1, y0: at(0.45), y1: at(0.8) },
      { kind: 'ash', x0: fx0, x1: fx1, y0: at(0.08), y1: at(0.35) },
    ];
    if (s.hasOven) panels.push({ kind: 'oven', x0: fx1 + 0.05, x1: w / 2 - 0.06, y0: at(0.3), y1: at(0.8) });
    return panels;
  }
  if (s.category === 'storage_stove') return [{ kind: 'glass', x0: -0.2 * w, x1: 0.2 * w, y0: at(0.25), y1: at(0.55) }];
  if (s.hasOven) {
    return [
      { kind: 'glass', x0: -0.35 * w, x1: 0.35 * w, y0: at(0.55), y1: at(0.92) },
      { kind: 'oven', x0: -0.35 * w, x1: 0.35 * w, y0: at(0.1), y1: at(0.48) },
    ];
  }
  return [{ kind: 'glass', x0: -0.35 * w, x1: 0.35 * w, y0: at(0.4), y1: at(0.85) }];
}

let shared: ReturnType<typeof makeMaterials> | null = null;
function makeMaterials() {
  return {
    metal: new THREE.MeshStandardMaterial({ color: '#2a2a2c', metalness: 0.55, roughness: 0.6 }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#e6dfd2', metalness: 0, roughness: 0.45 }),
    dark: new THREE.MeshStandardMaterial({ color: '#121213', metalness: 0.6, roughness: 0.4 }),
    fireGlass: new THREE.MeshPhysicalMaterial({ color: '#1a120c', emissive: '#ff6a1a', emissiveIntensity: 0.35, roughness: 0.05, clearcoat: 1 }),
    ovenGlass: new THREE.MeshPhysicalMaterial({ color: '#0d0d0e', roughness: 0.05, clearcoat: 1 }),
    hob: new THREE.MeshStandardMaterial({ color: '#3a3a3c', metalness: 0.7, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -1 }),
    handle: new THREE.MeshStandardMaterial({ color: '#9a9a9a', metalness: 0.9, roughness: 0.25 }),
    pipe: new THREE.MeshStandardMaterial({ color: '#1b1b1c', metalness: 0.6, roughness: 0.5 }),
  };
}
const mats = () => (shared ??= makeMaterials());

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildStove(s: Stove): THREE.Group {
  const { w, d } = dimsOf(s);
  const m = mats();
  const g = new THREE.Group();
  g.name = `stove-${s.id}`;
  g.userData.stoveId = s.id;

  const base = baseHeight(s);
  const collar = collarOf(s);
  const top = bodyTop(s);
  const bodyBack = collar.position === 'rear' ? -d / 2 + COLLAR_H : -d / 2;
  const bodyFront = d / 2 - FRONT;
  const bodyD = bodyFront - bodyBack;
  const bodyZ = (bodyFront + bodyBack) / 2;
  const bodyH = top - base;
  const bodyMat = s.category === 'storage_stove' ? m.ceramic : m.metal;

  if (s.category === 'stove') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, base, 12), m.dark, sx * (w / 2 - 0.05), base / 2, bodyZ + sz * (bodyD / 2 - 0.05)));
      }
    }
  } else {
    g.add(mesh(new THREE.BoxGeometry(w - 0.02, base, bodyD - 0.02), m.dark, 0, base / 2, bodyZ));
  }

  if (s.round) {
    const body = mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 48), bodyMat, 0, base + bodyH / 2, bodyZ);
    body.scale.set(w, bodyH, bodyD);
    g.add(body);
  } else {
    g.add(mesh(new RoundedBoxGeometry(w, bodyH, bodyD, 2, 0.015), bodyMat, 0, base + bodyH / 2, bodyZ));
  }

  if (isCook(s)) g.add(mesh(new THREE.BoxGeometry(w - 0.04, 0.006, bodyD - 0.04), m.hob, 0, top - 0.003, bodyZ));

  const collarMesh = mesh(new THREE.CylinderGeometry(collar.diameter / 2, collar.diameter / 2, COLLAR_H, 32), m.dark, collar.center.x, collar.center.y, collar.center.z);
  if (collar.position === 'rear') collarMesh.rotation.x = Math.PI / 2;
  g.add(collarMesh);

  for (const p of frontLayout(s)) {
    const pw = p.x1 - p.x0;
    const ph = p.y1 - p.y0;
    const cx = (p.x0 + p.x1) / 2;
    const cy = (p.y0 + p.y1) / 2;
    // Frame stops short of the front plane; glass and handle reach it.
    g.add(mesh(new THREE.BoxGeometry(pw, ph, FRONT * 0.7), m.dark, cx, cy, d / 2 - FRONT + (FRONT * 0.7) / 2));
    if (p.kind !== 'ash') {
      const glass = p.kind === 'glass' ? m.fireGlass : m.ovenGlass;
      g.add(mesh(new THREE.BoxGeometry(pw - 0.04, ph - 0.04, FRONT * 0.5), glass, cx, cy, d / 2 - FRONT * 0.25));
    }
    g.add(mesh(new THREE.BoxGeometry(0.02, Math.min(0.1, ph * 0.5), FRONT * 0.3), m.handle, p.x1 - 0.03, cy, d / 2 - FRONT * 0.15));
  }
  return g;
}

const REAR_RUN = 0.25;
const CEILING_COLLAR_H = 0.02;

/** Black steel flue pipe from the stove collar to the ceiling (stove-local frame, front +z). */
export function buildChimney(s: Stove, ceiling: number): THREE.Group {
  const c = collarOf(s);
  const { h, d } = dimsOf(s);
  const r = c.diameter / 2;
  const pipe = mats().pipe;
  const g = new THREE.Group();
  g.name = 'chimney';

  const named = (m: THREE.Mesh, name: string) => {
    m.name = name;
    g.add(m);
    return m;
  };
  const vertical = (z: number, y0: number) => {
    const len = Math.max(ceiling - y0, 0.01);
    named(mesh(new THREE.CylinderGeometry(r, r, len, 24), pipe, c.center.x, y0 + len / 2, z), 'chimney-vertical');
  };

  let topZ = c.center.z;
  if (c.position === 'top') {
    vertical(c.center.z, h);
  } else {
    topZ = -d / 2 - REAR_RUN;
    const run = named(mesh(new THREE.CylinderGeometry(r, r, REAR_RUN, 24), pipe, c.center.x, c.center.y, -d / 2 - REAR_RUN / 2), 'chimney-run');
    run.rotation.x = Math.PI / 2;
    named(mesh(new THREE.SphereGeometry(r * 1.05, 16, 12), pipe, c.center.x, c.center.y, topZ), 'chimney-elbow');
    vertical(topZ, c.center.y);
  }
  named(mesh(new THREE.CylinderGeometry(r + 0.03, r + 0.03, CEILING_COLLAR_H, 32), pipe, c.center.x, ceiling - CEILING_COLLAR_H / 2, topZ), 'chimney-ceiling');
  return g;
}

export async function loadModelIndex(url: string): Promise<Set<string>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return new Set();
    const ids: unknown = await res.json();
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Fits any model into the catalogue box (front assumed +z, glTF convention). */
export function fitToDims(obj: THREE.Object3D, dims: Dims): THREE.Group {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));
  const inner = new THREE.Group();
  inner.add(obj);
  inner.scale.set(dims.w / size.x, dims.h / size.y, dims.d / size.z);
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  // The room root mirrors z; mirroring x as well turns that into a rotation, keeping the model's handedness.
  wrapper.scale.x = -1;
  return wrapper;
}

async function gltfLoad(url: string): Promise<THREE.Object3D> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return gltf.scene;
}

export async function loadStoveObject(
  s: Stove,
  overrides: Set<string>,
  loadGlb: (url: string) => Promise<THREE.Object3D> = gltfLoad,
): Promise<THREE.Object3D> {
  const dims = dimsOf(s);
  if (overrides.has(s.id)) {
    try {
      return fitToDims(await loadGlb(`./models/${s.id}.glb`), dims);
    } catch (err) {
      console.warn(`Modello 3D per ${s.id} non caricato, uso quello parametrico`, err);
    }
  }
  return buildStove(s);
}
