import * as THREE from 'three';

const raycaster = new THREE.Raycaster();

export function pointerNdc(ev: { clientX: number; clientY: number }, dom: HTMLElement): THREE.Vector2 {
  const r = dom.getBoundingClientRect();
  return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
}

export function pickAt(
  ev: { clientX: number; clientY: number },
  dom: HTMLElement,
  camera: THREE.Camera,
  objects: THREE.Object3D[],
): THREE.Intersection | null {
  raycaster.setFromCamera(pointerNdc(ev, dom), camera);
  return raycaster.intersectObjects(objects, true)[0] ?? null;
}

/** Calls `cb` for a click that did not move (so orbit drags don't count as clicks). */
export function onTap(dom: HTMLElement, cb: (ev: PointerEvent) => void): void {
  let start: { x: number; y: number; t: number } | null = null;
  dom.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  dom.addEventListener('pointerup', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5 && performance.now() - start.t < 400) cb(e);
    start = null;
  });
}
