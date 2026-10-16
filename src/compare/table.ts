import { FREE_WALL } from '../data/apartment';
import type { FlueOutlet, Stove } from '../data/types';
import { bufferExtents } from '../scene/buffer';
import { fmtCm, fmtDims, fmtKw, fmtPct, fmtPrice, fmtStars } from '../ui/format';

export interface CompareRow {
  group: string;
  label: string;
  values: string[];
  best: number[];
}

type Value = number | string | null;

interface RowDef {
  group: string;
  label: string;
  get(s: Stove): Value;
  fmt?(v: number): string;
  better?: 'low' | 'high';
}

const OUTLET_IT: Record<FlueOutlet, string> = { top: 'superiore', rear: 'posteriore', side: 'laterale' };
const fileName = (f: string) => f.split('/').pop() ?? f;

const ROWS: RowDef[] = [
  { group: 'Prezzo', label: 'Prezzo indicativo', get: (s) => s.price, fmt: fmtPrice, better: 'low' },
  { group: 'Potenza', label: 'Nominale', get: (s) => s.kw, fmt: fmtKw },
  { group: 'Potenza', label: 'Min–max', get: (s) => (s.kwMin === null && s.kwMax === null ? null : `${fmtKw(s.kwMin)} – ${fmtKw(s.kwMax)}`) },
  { group: 'Potenza', label: "All'acqua", get: (s) => s.kwWater, fmt: fmtKw },
  { group: 'Dimensioni e peso', label: 'L × P × A', get: (s) => (s.dims ? fmtDims(s.dims) : null) },
  { group: 'Dimensioni e peso', label: 'Peso', get: (s) => s.weightKg, fmt: (v) => `${v} kg` },
  { group: 'Distanze di sicurezza', label: 'Posteriore', get: (s) => s.safety?.rear ?? null, fmt: fmtCm, better: 'low' },
  { group: 'Distanze di sicurezza', label: 'Laterale', get: (s) => s.safety?.side ?? null, fmt: fmtCm, better: 'low' },
  { group: 'Distanze di sicurezza', label: 'Frontale', get: (s) => s.safety?.front ?? null, fmt: fmtCm, better: 'low' },
  { group: 'Distanze di sicurezza', label: 'Soffitto', get: (s) => s.safety?.ceiling ?? null, fmt: fmtCm, better: 'low' },
  { group: 'Distanze di sicurezza', label: 'Pavimento davanti', get: (s) => s.safety?.floorFront ?? null, fmt: fmtCm, better: 'low' },
  { group: 'Rendimento', label: 'Nominale', get: (s) => s.efficiency, fmt: fmtPct, better: 'high' },
  { group: 'Rendimento', label: 'Stagionale', get: (s) => s.seasonalEfficiency, fmt: fmtPct, better: 'high' },
  { group: 'Classificazione', label: 'Stelle', get: (s) => s.stars, fmt: fmtStars, better: 'high' },
  { group: 'Classificazione', label: 'Classe energetica', get: (s) => s.energyClass },
  { group: 'Emissioni (mg/Nm³ al 13% O₂)', label: 'CO', get: (s) => s.emissions?.co ?? null, fmt: String, better: 'low' },
  { group: 'Emissioni (mg/Nm³ al 13% O₂)', label: 'Polveri (PM)', get: (s) => s.emissions?.pm ?? null, fmt: String, better: 'low' },
  { group: 'Emissioni (mg/Nm³ al 13% O₂)', label: 'NOx', get: (s) => s.emissions?.nox ?? null, fmt: String, better: 'low' },
  { group: 'Emissioni (mg/Nm³ al 13% O₂)', label: 'OGC', get: (s) => s.emissions?.ogc ?? null, fmt: String, better: 'low' },
  { group: 'Canna fumaria', label: 'Diametro', get: (s) => s.flueDiameter, fmt: (v) => `Ø ${Math.round(v * 1000)} mm` },
  { group: 'Canna fumaria', label: 'Uscite', get: (s) => (s.flueOutlets.length ? s.flueOutlets.map((o) => OUTLET_IT[o]).join(', ') : null) },
  { group: 'Altro', label: 'Volume riscaldabile', get: (s) => s.heatingVolume, fmt: (v) => `${v} m³` },
  { group: 'Altro', label: 'Forno', get: (s) => (s.hasOven ? 'Sì' : 'No') },
  { group: 'Altro', label: 'Finiture', get: (s) => (s.finishes.length ? s.finishes.join(', ') : null) },
  { group: 'Fonti', label: 'Schede tecniche', get: (s) => (s.sources.length ? s.sources.map((x) => fileName(x.file)).join(', ') : null) },
];

export function buildCompareRows(stoves: Stove[]): CompareRow[] {
  return ROWS.map((def) => {
    const raw = stoves.map((s) => def.get(s));
    const values = raw.map((v) => (v === null ? '—' : typeof v === 'number' && def.fmt ? def.fmt(v) : String(v)));
    const nums = raw.map((v) => (typeof v === 'number' ? v : null));
    const valid = nums.filter((v): v is number => v !== null);
    let best: number[] = [];
    if (def.better && valid.length >= 2) {
      const target = def.better === 'low' ? Math.min(...valid) : Math.max(...valid);
      if (valid.some((v) => v !== target)) best = nums.flatMap((v, i) => (v === target ? [i] : []));
    }
    return { group: def.group, label: def.label, values, best };
  });
}

const csvCell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Semicolon-separated so Excel with Italian locale opens it in columns. */
export function toCsv(stoves: Stove[], rows: CompareRow[]): string {
  const lines = [['Gruppo', 'Voce', ...stoves.map((s) => `${s.brand} ${s.model}`)], ...rows.map((r) => [r.group, r.label, ...r.values])];
  return lines.map((l) => l.map(csvCell).join(';')).join('\n');
}

const PX = 100;
const n1 = (v: number) => v.toFixed(1);

/** Top-down footprint: the free wall at the top, the stove's rear `safety.rear` away from it, front facing down. */
export function footprintSvg(s: Stove): string {
  if (!s.dims) return '';
  const { w, d } = s.dims;
  const wallLen = FREE_WALL.to - FREE_WALL.from;
  const ext = bufferExtents(s.dims, s.safety);
  const rear = s.safety?.rear ?? 0;
  const margin = 0.1;
  const halfSpan = Math.max(wallLen / 2, w / 2, ext ? ext.x1 : 0);
  const depth = rear + d / 2 + (ext ? ext.z1 : d / 2);
  const W = (2 * halfSpan + 2 * margin) * PX;
  const H = (depth + 2 * margin) * PX;
  const cx = W / 2;
  const wallY = margin * PX;
  // Stove-local z (front +z) → SVG y.
  const yOf = (z: number) => wallY + (rear + d / 2 + z) * PX;
  const rect = (x: number, y: number, rw: number, rh: number, cls: string) =>
    `<rect class="${cls}" x="${n1(x)}" y="${n1(y)}" width="${n1(rw)}" height="${n1(rh)}"/>`;
  const parts = [`<line class="wall" x1="${n1(cx - (wallLen / 2) * PX)}" y1="${n1(wallY - 3)}" x2="${n1(cx + (wallLen / 2) * PX)}" y2="${n1(wallY - 3)}"/>`];
  if (ext) parts.push(rect(cx + ext.x0 * PX, yOf(ext.z0), (ext.x1 - ext.x0) * PX, (ext.z1 - ext.z0) * PX, 'buffer'));
  parts.push(rect(cx - (w / 2) * PX, yOf(-d / 2), w * PX, d * PX, 'body'));
  return `<svg class="footprint" xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${n1(W)} ${n1(H)}">${parts.join('')}</svg>`;
}
