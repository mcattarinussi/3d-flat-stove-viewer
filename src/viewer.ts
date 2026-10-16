import * as THREE from 'three';
import './style.css';
import { loadApartment } from './data/apartment';
import { CameraRig } from './scene/camera';
import { buildRoom } from './scene/room';
import { createViewer } from './scene/setup';
import { showFatal } from './ui/fatal';
import { renderViewPanel } from './ui/viewPanel';

const section = (id: string) => document.getElementById(id)!;

async function main(): Promise<void> {
  const apartment = await loadApartment('./data/apartment.json');
  const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
  const viewer = createViewer(canvas);
  const roomView = buildRoom(apartment);
  viewer.root.add(roomView.group);

  const rig = new CameraRig(canvas, { width: apartment.room.width, depth: apartment.room.depth, ceiling: apartment.ceilingHeight });
  viewer.onResize((w, h) => rig.resize(w, h));
  renderViewPanel(section('view'), {
    setMode: (mode) => {
      rig.setMode(mode);
      roomView.setCeilingVisible(mode === '3d');
    },
    reset: () => rig.reset(),
  });

  // [doors]

  // [stove]

  const camPos = new THREE.Vector3();
  viewer.onFrame(() => {
    rig.controls.update();
    rig.camera.getWorldPosition(camPos);
    const local = viewer.root.worldToLocal(camPos);
    roomView.updateCutaway({ x: local.x, z: local.z });
  });
  viewer.start(() => rig.camera);
}

main().catch((err: unknown) => showFatal(err instanceof Error ? err.message : String(err), () => location.reload()));
