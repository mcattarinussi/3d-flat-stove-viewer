import * as THREE from 'three';
import './style.css';
import { loadApartment } from './data/apartment';
import { loadCatalogue } from './data/stoves';
import { applyFilters, defaultFilters, extents, sortStoves, type SortKey } from './data/filters';
import { safeLocalStorage, Shortlist, SHORTLIST_KEY } from './data/shortlist';
import { decodeState, EMPTY_STATE, encodeState } from './data/urlState';
import { renderSharePanel } from './ui/sharePanel';
import { toast } from './ui/toast';
import { renderFilters } from './ui/filtersPanel';
import { ResultsList } from './ui/resultsList';
import { renderStoveCard } from './ui/stoveCard';
import type { Stove } from './data/types';
import { imageUrl, loadImages, picturesFor } from './data/images';
import { DetailsWindow } from './ui/detailsWindow';
import { buildBuffer } from './scene/buffer';
import { PlacementController } from './scene/placement';
import { buildChimney, buildStove, loadModelIndex, loadStoveObject } from './scene/stoveModel';
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
  const images = await loadImages();
  const details = new DetailsWindow(document.querySelector<HTMLElement>('.stage')!);
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
    toggleFront: (on) => setFront(on),
  });
  placement.onChange(() => placementPanel.setDistances(placement.distances()));

  const overrides = await loadModelIndex('./models/index.json');
  let showToken = 0;
  let current: Stove | null = null;
  let bufferOn = true;
  let bufferGroup: THREE.Object3D | null = null;
  let frontOn = false;
  const textures = new Map<string, Promise<THREE.Texture>>();

  function frontTexture(path: string): Promise<THREE.Texture> {
    let p = textures.get(path);
    if (!p) {
      p = new THREE.TextureLoader().loadAsync(imageUrl(path)).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      });
      p.catch(() => textures.delete(path));
      textures.set(path, p);
    }
    return p;
  }

  /** A saved crop exists and no GLB model overrides the parametric stove. */
  const frontAvailable = (s: Stove | null): boolean => !!s && images.fronts.has(s.id) && !overrides.has(s.id);

  function showStove(s: Stove | null): void {
    // Every call invalidates a GLB still loading for a previously selected stove.
    const token = ++showToken;
    current = s?.dims ? s : null;
    bufferGroup = null;
    if (!current?.dims) {
      placement.setStove(null);
      placementPanel.setFront({ available: false, on: frontOn });
      return;
    }
    bufferGroup = buildBuffer(current.dims, current.safety);
    if (bufferGroup) bufferGroup.visible = bufferOn;
    const extras: THREE.Object3D[] = [buildChimney(current, apartment.ceilingHeight)];
    if (bufferGroup) extras.push(bufferGroup);
    placement.setStove({ object: buildStove(current), dims: current.dims, safety: current.safety }, extras);
    if (overrides.has(current.id)) {
      // Show the parametric stove at once, swap in the GLB when (and if) it arrives.
      void loadStoveObject(current, overrides).then((obj) => {
        if (token === showToken) placement.replaceObject(obj);
      });
    } else if (frontOn && frontAvailable(current)) {
      // Same idea for the front photo: swap the textured stove in once the image has loaded.
      const shown = current;
      const front = images.fronts.get(shown.id)!;
      frontTexture(front.image)
        .then((texture) => {
          if (token === showToken) placement.replaceObject(buildStove(shown, { texture, crop: front.crop }));
        })
        .catch(() => toast('Foto frontale non caricata'));
    }
    placementPanel.setFront({ available: frontAvailable(current), on: frontOn });
  }

  function setFront(on: boolean): void {
    frontOn = on;
    showStove(current);
    renderCard();
    syncUrl();
  }

  function setBuffer(on: boolean): void {
    bufferOn = on;
    if (bufferGroup) bufferGroup.visible = on;
  }

  const shortlist = new Shortlist(safeLocalStorage());
  // Keep in step with the compare page (other tab, or back/forward cache).
  window.addEventListener('storage', (e) => e.key === SHORTLIST_KEY && shortlist.reload());
  window.addEventListener('pageshow', (e) => e.persisted && shortlist.reload());
  const brandCounts = new Map<string, number>();
  for (const s of catalogue.stoves) brandCounts.set(s.brand, (brandCounts.get(s.brand) ?? 0) + 1);
  let filters = defaultFilters();
  let sortKey: SortKey = 'price';

  const results = new ResultsList(section('results'), {
    sort: sortKey,
    onSort: (k) => {
      sortKey = k;
      refreshResults();
    },
    onSelect: (id) => select(byId.get(id) ?? null),
    onToggleStar: (id) => shortlist.toggle(id),
    isStarred: (id) => shortlist.has(id),
  });
  renderFilters(section('filters'), { catalogue, brandCounts, extents: extents(catalogue.stoves.filter((s) => s.dims)) }, filters, (f) => {
    filters = f;
    refreshResults();
  });

  function refreshResults(): void {
    const r = applyFilters(catalogue.stoves, filters);
    const notes = [r.hiddenMissingData ? `${r.hiddenMissingData} nascoste per dati mancanti` : '', `${r.noDims} senza dimensioni non mostrate`];
    results.setItems(sortStoves(r.visible, sortKey), notes.filter(Boolean));
  }

  function toggleBuffer(on: boolean): void {
    setBuffer(on);
    syncUrl();
    renderCard();
  }

  /** Renders the sidebar card and the details window for the current stove. */
  function renderCard(): void {
    renderStoveCard(section('stove-card'), current, { bufferOn, onBufferToggle: toggleBuffer, onOpenDetails: () => details.open() });
    details.render(current, {
      categories: catalogue.categories,
      pictures: current ? picturesFor(current.id, images).map((path) => ({ path, url: imageUrl(path) })) : [],
      bufferOn,
      onBufferToggle: toggleBuffer,
      starred: current ? shortlist.has(current.id) : false,
      onToggleStar: () => {
        if (current) shortlist.toggle(current.id);
      },
      front: { available: frontAvailable(current), on: frontOn, onToggle: (on) => setFront(on) },
    });
  }

  function select(s: Stove | null): void {
    showStove(s);
    results.setSelected(current?.id ?? null);
    renderCard();
    if (current) details.open();
    syncUrl();
  }

  const compareLink = document.getElementById('compare-link')!;
  const updateCompareLink = () => {
    compareLink.textContent = `Confronta (${shortlist.ids().length})`;
    // Carry the shortlist in the link too, in case localStorage is unavailable.
    compareLink.setAttribute('href', `./compare.html${encodeState({ ...EMPTY_STATE, shortlist: shortlist.ids() })}`);
  };
  shortlist.onChange(() => {
    results.refresh();
    renderCard();
    updateCompareLink();
  });
  updateCompareLink();
  refreshResults();

  let urlTimer: number | undefined;
  /** The shortlist goes in the URL only when it cannot persist, or for links shared with others. */
  function currentQuery(withShortlist = !shortlist.persistent): string {
    const pose = placement.getPose();
    return encodeState({
      stove: current?.id ?? null,
      x: pose?.x ?? null,
      z: pose?.z ?? null,
      r: pose?.r ?? null,
      doors: doors.openIds(),
      shortlist: withShortlist ? shortlist.ids() : [],
      buffer: bufferOn,
      front: frontOn,
    });
  }
  function syncUrl(): void {
    window.clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => history.replaceState(null, '', `${location.pathname}${currentQuery()}`), 200);
  }

  const initial = decodeState(location.search);
  shortlist.merge(initial.shortlist);
  setBuffer(initial.buffer);
  frontOn = initial.front;
  for (const id of initial.doors) doors.setOpen(id, true, false);
  const requested = initial.stove ? byId.get(initial.stove) : undefined;
  if (initial.stove && !requested) toast(`Stufa "${initial.stove}" non trovata nel catalogo`);
  else if (requested && !requested.dims) toast(`${requested.brand} ${requested.model} non ha dimensioni: non posizionabile`);
  select(requested?.dims ? requested : null);
  const start = placement.getPose();
  if (start) placement.setPose({ x: initial.x ?? start.x, z: initial.z ?? start.z, r: initial.r ?? start.r });

  placement.onChange(syncUrl);
  doors.onChange(syncUrl);
  shortlist.onChange(syncUrl);
  renderSharePanel(section('share'), () => `${location.origin}${location.pathname}${currentQuery(true)}`, toast);

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
