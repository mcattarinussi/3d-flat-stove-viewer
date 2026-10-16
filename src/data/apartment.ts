import type { Apartment, DoorSpec, Finishes, Fixture, FixtureType, Opening, Room, Wall } from './types';

/**
 * Free east-wall segment between the soggiorno door and the north corner. A stove there sticks out
 * towards the night-area door (`door`), whose frame limits how deep it can be.
 */
export const FREE_WALL: { wall: Wall; from: number; to: number; door: string } = {
  wall: 'east',
  from: 1.52,
  to: 3.4,
  door: 'disimpegno',
};

const DEFAULT_CASING = 0.07;

const WALLS: Wall[] = ['north', 'south', 'east', 'west'];
const FIXTURE_TYPES: FixtureType[] = ['radiator', 'switch', 'socket', 'thermostat'];

function parseFinishes(v: unknown): Finishes {
  if (v === undefined || v === null) return { skirting: null, sills: false, casing: DEFAULT_CASING };
  const f = obj(v, 'room.finishes');
  let skirting: Finishes['skirting'] = null;
  if (f.skirting !== undefined && f.skirting !== null) {
    const s = obj(f.skirting, 'room.finishes.skirting');
    const height = reqNum(s, 'height', 'room.finishes.skirting.');
    const thickness = reqNum(s, 'thickness', 'room.finishes.skirting.');
    if (height <= 0 || thickness <= 0) fail('room.finishes.skirting: height e thickness devono essere positivi');
    skirting = { height, thickness };
  }
  const casing = f.casing === undefined ? DEFAULT_CASING : reqNum(f, 'casing', 'room.finishes.');
  if (casing <= 0) fail('room.finishes.casing deve essere positivo');
  return { skirting, sills: f.sills === true, casing };
}

/** Vertical extent of an item on its wall: openings from the floor to the top of door + transom. */
function verticalRange(it: Opening | Fixture): [number, number] {
  return 'elevation' in it ? [it.elevation, it.elevation + it.height] : [0, it.height + it.transom];
}
const EPS = 1e-9;

export function wallLength(room: Pick<Room, 'width' | 'depth'>, wall: Wall): number {
  return wall === 'north' || wall === 'south' ? room.width : room.depth;
}

function fail(msg: string): never {
  throw new Error(`apartment.json: ${msg}`);
}

type Obj = Record<string, unknown>;

function obj(v: unknown, where: string): Obj {
  if (typeof v !== 'object' || v === null) fail(`${where} deve essere un oggetto`);
  return v as Obj;
}

function reqNum(o: Obj, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where}${key} deve essere un numero`);
  return v;
}

function reqStr(o: Obj, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') fail(`${where}${key} deve essere una stringa`);
  return v;
}

function reqWall(o: Obj, where: string): Wall {
  const v = o.wall;
  if (!WALLS.includes(v as Wall)) fail(`${where}wall deve essere north|south|east|west`);
  return v as Wall;
}

function parseDoor(v: unknown, where: string): DoorSpec | null {
  if (v === undefined || v === null) return null;
  const d = obj(v, `${where}door`);
  if (d.hinge !== 'from' && d.hinge !== 'to') fail(`${where}door.hinge deve essere from|to`);
  if (d.swing !== 'in' && d.swing !== 'out') fail(`${where}door.swing deve essere in|out`);
  return { hinge: d.hinge, swing: d.swing, glazed: d.glazed === true };
}

function parseOpening(v: unknown, i: number): Opening {
  const o = obj(v, `room.openings[${i}]`);
  const where = `room.openings[${i}].`;
  return {
    id: reqStr(o, 'id', where),
    name: reqStr(o, 'name', where),
    wall: reqWall(o, where),
    from: reqNum(o, 'from', where),
    to: reqNum(o, 'to', where),
    height: reqNum(o, 'height', where),
    transom: o.transom === undefined ? 0 : reqNum(o, 'transom', where),
    door: parseDoor(o.door, where),
  };
}

function parseFixture(v: unknown, i: number): Fixture {
  const o = obj(v, `room.fixtures[${i}]`);
  const where = `room.fixtures[${i}].`;
  if (!FIXTURE_TYPES.includes(o.type as FixtureType)) fail(`${where}type deve essere ${FIXTURE_TYPES.join('|')}`);
  if (o.gangs !== undefined && o.gangs !== 1 && o.gangs !== 2) fail(`${where}gangs deve essere 1 o 2`);
  return {
    id: reqStr(o, 'id', where),
    type: o.type as FixtureType,
    gangs: o.type === 'switch' && o.gangs === 2 ? 2 : 1,
    wall: reqWall(o, where),
    from: reqNum(o, 'from', where),
    to: reqNum(o, 'to', where),
    height: reqNum(o, 'height', where),
    depth: reqNum(o, 'depth', where),
    elevation: reqNum(o, 'elevation', where),
  };
}

function validate(apt: Apartment): void {
  const { room, ceilingHeight } = apt;
  const items = [...room.openings, ...room.fixtures];
  const ids = new Set<string>();
  for (const it of items) {
    if (ids.has(it.id)) fail(`id duplicato "${it.id}"`);
    ids.add(it.id);
    const len = wallLength(room, it.wall);
    if (it.from < -EPS || it.to > len + EPS || it.from >= it.to) {
      fail(`"${it.id}" è fuori dalla parete ${it.wall} (lunga ${len} m)`);
    }
  }
  for (const o of room.openings) {
    if (o.height + o.transom > ceilingHeight + EPS) fail(`"${o.id}" supera l'altezza del soffitto`);
  }
  for (const f of room.fixtures) {
    if (f.elevation + f.height > ceilingHeight + EPS) fail(`"${f.id}" supera l'altezza del soffitto`);
  }
  for (const wall of WALLS) {
    const onWall = items.filter((it) => it.wall === wall);
    for (let i = 0; i < onWall.length; i++) {
      for (let j = i + 1; j < onWall.length; j++) {
        const a = onWall[i];
        const b = onWall[j];
        const [ay0, ay1] = verticalRange(a);
        const [by0, by1] = verticalRange(b);
        const along = a.from < b.to - EPS && b.from < a.to - EPS;
        const vertical = ay0 < by1 - EPS && by0 < ay1 - EPS;
        if (along && vertical) fail(`"${a.id}" e "${b.id}" si sovrappongono sulla parete ${wall}`);
      }
    }
  }
}

export function parseApartment(raw: unknown): Apartment {
  const r = obj(raw, 'radice');
  const room = obj(r.room, 'room');
  const openings = room.openings;
  const fixtures = room.fixtures ?? [];
  if (!Array.isArray(openings)) fail('room.openings deve essere una lista');
  if (!Array.isArray(fixtures)) fail('room.fixtures deve essere una lista');
  const floor = room.floor === undefined ? {} : obj(room.floor, 'room.floor');
  const apt: Apartment = {
    ceilingHeight: reqNum(r, 'ceiling_height', ''),
    wallThickness: reqNum(r, 'wall_thickness', ''),
    room: {
      id: reqStr(room, 'id', 'room.'),
      name: reqStr(room, 'name', 'room.'),
      width: reqNum(room, 'width', 'room.'),
      depth: reqNum(room, 'depth', 'room.'),
      floorMaterial: typeof floor.material === 'string' ? floor.material : 'marble',
      openings: openings.map(parseOpening),
      fixtures: fixtures.map(parseFixture),
      finishes: parseFinishes(room.finishes),
    },
  };
  validate(apt);
  return apt;
}

export async function loadApartment(url: string): Promise<Apartment> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossibile caricare ${url} (HTTP ${res.status})`);
  return parseApartment(await res.json());
}

/**
 * Deepest stove that fits on the free wall, measured from the skirting (the stove's back rests on it):
 * `door` = up to the inner edge of the night-area door frame, so the doorway stays clear;
 * `wall` = up to the outer edge of that frame, i.e. plain wall only.
 */
export function freeWallLimits(apt: Apartment): { door: number; wall: number } {
  const { room } = apt;
  const door = room.openings.find((o) => o.id === FREE_WALL.door);
  if (!door) throw new Error(`apartment.json: manca la porta "${FREE_WALL.door}"`);
  const skirting = room.finishes.skirting?.thickness ?? 0;
  const mm = (m: number) => Math.round(m * 1000) / 1000;
  const toDoor = room.width - door.to - skirting;
  return { door: mm(toDoor), wall: mm(toDoor - room.finishes.casing) };
}
