import type { Crop } from '../data/images';

export const MIN_CROP = 0.02;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** At least MIN_CROP in each direction, entirely inside the image. */
export function clampCrop(c: Crop): Crop {
  const w = Math.min(Math.max(c.w, MIN_CROP), 1);
  const h = Math.min(Math.max(c.h, MIN_CROP), 1);
  return { x: Math.min(Math.max(c.x, 0), 1 - w), y: Math.min(Math.max(c.y, 0), 1 - h), w, h };
}

export function rectFromPoints(x0: number, y0: number, x1: number, y1: number): Crop {
  const [ax, bx] = [clamp01(x0), clamp01(x1)].sort((a, b) => a - b);
  const [ay, by] = [clamp01(y0), clamp01(y1)].sort((a, b) => a - b);
  return clampCrop({ x: ax, y: ay, w: bx - ax, h: by - ay });
}

/** Adjusts the crop so that (w·imgW)/(h·imgH) = aspect, shrinking it rather than leaving the image. */
export function fitAspect(c: Crop, aspect: number, imgW: number, imgH: number): Crop {
  let w = c.w;
  let h = (w * imgW) / (aspect * imgH);
  if (c.y + h > 1) {
    h = 1 - c.y;
    w = (h * aspect * imgH) / imgW;
  }
  if (c.x + w > 1) {
    w = 1 - c.x;
    h = (w * imgW) / (aspect * imgH);
  }
  return { x: c.x, y: c.y, w, h };
}
