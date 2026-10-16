export interface ViewerState {
  stove: string | null;
  x: number | null;
  z: number | null;
  r: number | null;
  doors: string[];
  shortlist: string[];
  buffer: boolean;
  front: boolean;
}

export const EMPTY_STATE: ViewerState = { stove: null, x: null, z: null, r: null, doors: [], shortlist: [], buffer: true, front: false };

function numParam(p: URLSearchParams, key: string): number | null {
  const v = p.get(key);
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function listParam(p: URLSearchParams, key: string): string[] {
  return (p.get(key) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function decodeState(search: string): ViewerState {
  const p = new URLSearchParams(search);
  const stove = p.get('stove')?.trim() || null;
  return {
    stove,
    x: numParam(p, 'x'),
    z: numParam(p, 'z'),
    r: numParam(p, 'r'),
    doors: listParam(p, 'doors'),
    shortlist: listParam(p, 'shortlist'),
    buffer: p.get('buffer') !== '0',
    front: p.get('front') === '1',
  };
}

export function encodeState(s: ViewerState): string {
  const p = new URLSearchParams();
  if (s.stove) p.set('stove', s.stove);
  if (s.x !== null) p.set('x', String(Number(s.x.toFixed(3))));
  if (s.z !== null) p.set('z', String(Number(s.z.toFixed(3))));
  if (s.r !== null) p.set('r', String(Number(s.r.toFixed(1))));
  if (s.doors.length) p.set('doors', s.doors.join(','));
  if (s.shortlist.length) p.set('shortlist', s.shortlist.join(','));
  if (!s.buffer) p.set('buffer', '0');
  if (s.front) p.set('front', '1');
  const q = p.toString().replace(/%2C/g, ',');
  return q ? `?${q}` : '';
}
