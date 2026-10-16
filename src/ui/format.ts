import type { Dims } from '../data/types';

const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const comma = (n: number) => String(n).replace('.', ',');
const cm = (m: number) => Math.round(m * 100) + 0;

export const fmtCm = (m: number | null): string => (m === null ? '—' : `${cm(m)} cm`);
export const fmtDims = (d: Dims | null): string => (d ? `${cm(d.w)} × ${cm(d.d)} × ${cm(d.h)} cm` : '—');
export const fmtPrice = (p: number | null): string => (p === null ? '—' : `${thousands(Math.round(p))} €`);
export const fmtKw = (k: number | null): string => (k === null ? '—' : `${comma(k)} kW`);
export const fmtPct = (n: number | null): string => (n === null ? '—' : `${comma(n)} %`);
export const fmtStars = (n: number | null): string => (n === null ? '—' : '★'.repeat(n));

export function sourceHref(file: string, page: number | null): string {
  return `./${encodeURI(file)}${page ? `#page=${page}` : ''}`;
}
