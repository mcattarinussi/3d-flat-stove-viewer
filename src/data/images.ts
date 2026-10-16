/** A rectangle in fractions (0–1) of an image, origin top-left. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrontCrop {
  image: string;
  crop: Crop;
}

export interface StoveImages {
  /** Stove id → image paths relative to IMAGES_BASE, in catalogue order. */
  index: Map<string, string[]>;
  fronts: Map<string, FrontCrop>;
}

export const IMAGES_BASE = './stove-images/';
const EPS = 1e-9;

export const imageUrl = (path: string): string => IMAGES_BASE + path;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validCrop(c: unknown): c is Crop {
  if (!isRecord(c)) return false;
  const vals = [c.x, c.y, c.w, c.h];
  if (!vals.every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
  const [x, y, w, h] = vals as number[];
  return x >= -EPS && y >= -EPS && w > 0 && h > 0 && x + w <= 1 + EPS && y + h <= 1 + EPS;
}

export function parseImageIndex(raw: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!isRecord(raw)) return out;
  for (const [id, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const paths = list.filter((p): p is string => typeof p === 'string');
    if (paths.length) out.set(id, paths);
  }
  return out;
}

/** Keeps only entries whose image is listed for that stove (a re-extraction may have renamed it). */
export function parseFronts(raw: unknown, index: Map<string, string[]>): Map<string, FrontCrop> {
  const out = new Map<string, FrontCrop>();
  if (!isRecord(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    if (!isRecord(v)) continue;
    const { image, crop } = v;
    if (typeof image !== 'string' || !index.get(id)?.includes(image) || !validCrop(crop)) continue;
    out.set(id, { image, crop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h } });
  }
  return out;
}

export function picturesFor(id: string, imgs: StoveImages): string[] {
  const all = imgs.index.get(id) ?? [];
  const front = imgs.fronts.get(id)?.image;
  return front ? [front, ...all.filter((p) => p !== front)] : [...all];
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Never fails: without index/fronts the app simply shows no pictures. */
export async function loadImages(base = IMAGES_BASE): Promise<StoveImages> {
  const [rawIndex, rawFronts] = await Promise.all([fetchJson(`${base}index.json`), fetchJson(`${base}fronts.json`)]);
  const index = parseImageIndex(rawIndex);
  return { index, fronts: parseFronts(rawFronts, index) };
}
