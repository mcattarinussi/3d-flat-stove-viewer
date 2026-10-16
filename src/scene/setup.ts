import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Viewer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** Room-coordinate root (x east, z north, y up), mirrored on z so the plan reads north-up, east-right. */
  root: THREE.Group;
  onFrame(cb: (dt: number) => void): void;
  onResize(cb: (w: number, h: number) => void): void;
  start(getCamera: () => THREE.Camera): void;
}

export function createViewer(canvas: HTMLCanvasElement): Viewer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#202124');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a8580', 0.5));

  const root = new THREE.Group();
  root.scale.z = -1;
  scene.add(root);

  const frameCbs: ((dt: number) => void)[] = [];
  const resizeCbs: ((w: number, h: number) => void)[] = [];
  let size = { w: 0, h: 0 };
  let last = performance.now();

  function checkResize(): void {
    const w = canvas.clientWidth;
    const h = Math.max(canvas.clientHeight, 1);
    if (w === size.w && h === size.h) return;
    size = { w, h };
    renderer.setSize(w, h, false);
    resizeCbs.forEach((cb) => cb(w, h));
  }

  return {
    renderer,
    scene,
    root,
    onFrame: (cb) => void frameCbs.push(cb),
    onResize: (cb) => void resizeCbs.push(cb),
    start(getCamera) {
      renderer.setAnimationLoop(() => {
        checkResize();
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        frameCbs.forEach((cb) => cb(dt));
        renderer.render(scene, getCamera());
      });
    },
  };
}
