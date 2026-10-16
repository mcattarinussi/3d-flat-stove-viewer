import { describe, expect, it } from 'vitest';
import { decodeState, EMPTY_STATE, encodeState } from '../src/data/urlState';

describe('urlState', () => {
  it('round-trips a full state', () => {
    const s = { stove: 'eva-calor-alberta', x: 1.234, z: 2.5, r: 90, doors: ['entrata', 'cucina'], shortlist: ['a', 'b'], buffer: false, front: true };
    expect(decodeState(encodeState(s))).toEqual(s);
  });

  it('encodes the empty state as an empty string', () => {
    expect(encodeState(EMPTY_STATE)).toBe('');
    expect(decodeState('')).toEqual(EMPTY_STATE);
  });

  it('rounds numbers', () => {
    expect(encodeState({ ...EMPTY_STATE, x: 1.23456, r: 12.345 })).toBe('?x=1.235&r=12.3');
  });

  it('ignores garbage values', () => {
    const s = decodeState('?x=abc&z=&r=Infinity&doors=,,entrata,&buffer=maybe&stove=');
    expect(s).toEqual({ ...EMPTY_STATE, doors: ['entrata'] });
  });

  it('encodes the front photo flag only when on', () => {
    expect(encodeState({ ...EMPTY_STATE, front: true })).toBe('?front=1');
    expect(decodeState('?front=yes').front).toBe(false);
  });
});
