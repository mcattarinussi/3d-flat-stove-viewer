import * as THREE from 'three';
import './style.css';
import { loadApartment } from './data/apartment';
import { loadCatalogue } from './data/stoves';
import type { Stove } from './data/types';
import { buildBuffer } from './scene/buffer';
import { PlacementController } from './scene/placement';
import { buildFlueHint, buildStove } from './scene/stoveModel';
import { renderPlacementPanel } from './ui/placementPanel';
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

  const catalogue = await loadCatalogue('./data/stoves.json');
  const byId = new Map(catalogue.stoves.map((s) => [s.id, s]));
  const placement = new PlacementController({
    dom: canvas,
    root: viewer.root,
    room: { width: apartment.room.width, depth: apartment.room.depth },
    getCamera: () => rig.camera,
    getControls: () => rig.controls,
  });
  const placementPanel = renderPlacementPanel(section('placement'), {
    nudge: (dir, step) => placement.nudge(dir, step),
    rotate: (delta) => placement.rotateBy(delta),
    snap: () => placement.snap(),
  });
  placement.onChange(() => placementPanel.setDistances(placement.distances()));

  let current: Stove | null = null;
  let bufferOn = true;
  let bufferGroup: THREE.Object3D | null = null;

  function showStove(s: Stove | null): void {
    current = s?.dims ? s : null;
    bufferGroup = null;
    if (!current?.dims) {
      placement.setStove(null);
      return;
    }
    bufferGroup = buildBuffer(current.dims, current.safety);
    if (bufferGroup) bufferGroup.visible = bufferOn;
    const extras: THREE.Object3D[] = [buildFlueHint(current, apartment.ceilingHeight)];
    if (bufferGroup) extras.push(bufferGroup);
    placement.setStove({ object: buildStove(current), dims: current.dims, safety: current.safety }, extras);
  }

  function setBuffer(on: boolean): void {
    bufferOn = on;
    if (bufferGroup) bufferGroup.visible = on;
  }

  // [sidebar]

  // [url]
  showStove(byId.get(new URLSearchParams(location.search).get('stove') ?? '') ?? null);

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
