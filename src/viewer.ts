import * as THREE from 'three';
import './style.css';
import { loadApartment } from './data/apartment';
import { CameraRig } from './scene/camera';
import { Doors } from './scene/doors';
import { onTap, pickAt } from './scene/pick';
import { renderDoorsPanel } from './ui/doorsPanel';
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

  const doors = new Doors(apartment);
  viewer.root.add(doors.group);
  const doorsPanel = renderDoorsPanel(section('doors'), doors.list(), {
    toggle: (id) => doors.toggle(id),
    setAll: (open) => doors.setAll(open),
  });
  doors.onChange(() => doorsPanel.update(doors.openIds()));
  viewer.onFrame((dt) => doors.update(dt));
  onTap(canvas, (ev) => {
    const hit = pickAt(ev, canvas, rig.camera, doors.pickables());
    const id = doors.idFromObject(hit?.object ?? null);
    if (id) doors.toggle(id);
  });

  // [stove]

  const camPos = new THREE.Vector3();
  viewer.onFrame(() => {
    rig.controls.update();
    rig.camera.getWorldPosition(camPos);
    const local = viewer.root.worldToLocal(camPos);
    roomView.updateCutaway({ x: local.x, z: local.z });
    doors.setHiddenWalls(new Set([...roomView.walls].filter(([, g]) => !g.visible).map(([w]) => w)));
  });
  viewer.start(() => rig.camera);
}

main().catch((err: unknown) => showFatal(err instanceof Error ? err.message : String(err), () => location.reload()));
