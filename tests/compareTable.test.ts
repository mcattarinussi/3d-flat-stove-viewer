import { describe, expect, it } from 'vitest';
import { buildCompareRows, footprintSvg, toCsv } from '../src/compare/table';
import { stove } from './fixtures';

const a = stove({ id: 'a', brand: 'Alfa', model: 'Uno', price: 2000, stars: 5, efficiency: 80 });
const b = stove({ id: 'b', brand: 'Beta', model: 'Due; bis', price: 3000, stars: 4, efficiency: 88 });
const c = stove({ id: 'c', brand: 'Gamma', model: 'Tre', price: null, stars: null, efficiency: null, safety: null });
const rowOf = (label: string, group?: string) =>
  buildCompareRows([a, b, c]).find((r) => r.label === label && (!group || r.group === group))!;

describe('buildCompareRows', () => {
  it('formats values and uses — for missing data', () => {
    expect(rowOf('Prezzo indicativo').values).toEqual(['2.000 €', '3.000 €', '—']);
  });

  it('highlights the lowest price and the highest efficiency and stars', () => {
    expect(rowOf('Prezzo indicativo').best).toEqual([0]);
    expect(rowOf('Nominale', 'Rendimento').best).toEqual([1]);
    expect(rowOf('Stelle').best).toEqual([0]);
  });

  it('does not highlight rows without a direction, ties of everyone, or a single value', () => {
    expect(rowOf('Nominale', 'Potenza').best).toEqual([]);
    expect(buildCompareRows([a, stove({ id: 'x', price: 2000 })]).find((r) => r.label === 'Prezzo indicativo')!.best).toEqual([]);
    expect(buildCompareRows([a, c]).find((r) => r.label === 'Prezzo indicativo')!.best).toEqual([]);
  });

  it('shows safety distances in cm and ends with the sources group', () => {
    expect(rowOf('Posteriore').values).toEqual(['20 cm', '20 cm', '—']);
    const rows = buildCompareRows([a]);
    expect(rows[rows.length - 1].group).toBe('Fonti');
  });
});

describe('toCsv', () => {
  it('writes a header and quotes cells containing separators', () => {
    const csv = toCsv([a, b], buildCompareRows([a, b]));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Gruppo;Voce;Alfa Uno;"Beta Due; bis"');
    expect(lines).toContain('Prezzo;Prezzo indicativo;2.000 €;3.000 €');
  });
});

describe('footprintSvg', () => {
  const width = (svg: string, cls: string) => Number(new RegExp(`class="${cls}"[^>]*width="([\\d.]+)"`).exec(svg)![1]);

  it('draws body, buffer and the 1.88 m wall to scale', () => {
    const svg = footprintSvg(stove({ dims: { w: 0.5, d: 0.4, h: 1 } }));
    expect(width(svg, 'body')).toBe(50);
    expect(width(svg, 'buffer')).toBe(130);
    const m = /class="wall" x1="([\d.]+)"[^>]*x2="([\d.]+)"/.exec(svg)!;
    expect(Number(m[2]) - Number(m[1])).toBeCloseTo(188);
  });

  it('omits the buffer without safety data', () => {
    expect(footprintSvg(stove({ safety: null }))).not.toContain('class="buffer"');
  });
});
