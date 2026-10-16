import { describe, expect, it } from 'vitest';
import { fmtCm, fmtDims, fmtKw, fmtPct, fmtPrice, fmtStars, sourceHref } from '../src/ui/format';

describe('format', () => {
  it('formats lengths', () => {
    expect(fmtCm(0.456)).toBe('46 cm');
    expect(fmtCm(-0.004)).toBe('0 cm');
    expect(fmtCm(null)).toBe('—');
    expect(fmtDims({ w: 0.504, d: 0.433, h: 1.282 })).toBe('50 × 43 × 128 cm');
    expect(fmtDims(null)).toBe('—');
  });

  it('formats prices with Italian thousands separators', () => {
    expect(fmtPrice(2106)).toBe('2.106 €');
    expect(fmtPrice(710.4)).toBe('710 €');
    expect(fmtPrice(null)).toBe('—');
  });

  it('formats power, percentages and stars with Italian decimals', () => {
    expect(fmtKw(7.5)).toBe('7,5 kW');
    expect(fmtPct(86)).toBe('86 %');
    expect(fmtStars(4)).toBe('★★★★');
    expect(fmtStars(null)).toBe('—');
  });

  it('builds PDF links with page anchors', () => {
    expect(sourceHref('assets/catalogues/Eva Calor/x.pdf', 3)).toBe('./assets/catalogues/Eva%20Calor/x.pdf#page=3');
    expect(sourceHref('assets/catalogues/A/b.pdf', null)).toBe('./assets/catalogues/A/b.pdf');
  });
});
