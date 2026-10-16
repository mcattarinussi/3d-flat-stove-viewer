import { describe, expect, it, vi } from 'vitest';
import { Shortlist, SHORTLIST_KEY, type KeyValueStore } from '../src/data/shortlist';

function memStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('Shortlist', () => {
  it('adds, removes, toggles and persists', () => {
    const store = memStore();
    const s = new Shortlist(store);
    s.add('a');
    s.add('b');
    s.add('a');
    expect(s.ids()).toEqual(['a', 'b']);
    s.toggle('a');
    expect(s.ids()).toEqual(['b']);
    s.toggle('c');
    expect(JSON.parse(store.data[SHORTLIST_KEY])).toEqual(['b', 'c']);
    s.remove('b');
    expect(s.has('b')).toBe(false);
  });

  it('reads existing data and ignores garbage', () => {
    expect(new Shortlist(memStore({ [SHORTLIST_KEY]: '["x",1,"y"]' })).ids()).toEqual(['x', 'y']);
    expect(new Shortlist(memStore({ [SHORTLIST_KEY]: '{not json' })).ids()).toEqual([]);
  });

  it('moves items within bounds', () => {
    const s = new Shortlist(memStore());
    s.merge(['a', 'b', 'c']);
    s.move('c', -1);
    expect(s.ids()).toEqual(['a', 'c', 'b']);
    s.move('a', -1);
    expect(s.ids()).toEqual(['a', 'c', 'b']);
    s.move('b', 1);
    expect(s.ids()).toEqual(['a', 'c', 'b']);
  });

  it('merges without duplicates and notifies once', () => {
    const s = new Shortlist(memStore());
    s.add('a');
    const cb = vi.fn();
    s.onChange(cb);
    s.merge(['b', 'a', 'c']);
    expect(s.ids()).toEqual(['a', 'b', 'c']);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('works in memory when storage throws', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const s = new Shortlist(broken);
    s.add('a');
    s.add('b');
    expect(s.ids()).toEqual(['a', 'b']);
  });

  it('works with no storage at all', () => {
    const s = new Shortlist(null);
    s.add('a');
    expect(s.ids()).toEqual(['a']);
  });

  it('reload picks up changes written by another page and notifies', () => {
    const store = memStore();
    const viewer = new Shortlist(store);
    viewer.merge(['a', 'b']);
    const compare = new Shortlist(store);
    compare.remove('b');
    const cb = vi.fn();
    viewer.onChange(cb);
    viewer.reload();
    expect(viewer.ids()).toEqual(['a']);
    expect(cb).toHaveBeenCalledTimes(1);
    viewer.add('c');
    expect(JSON.parse(store.data[SHORTLIST_KEY])).toEqual(['a', 'c']);
  });

  it('reports whether it persists', () => {
    expect(new Shortlist(memStore()).persistent).toBe(true);
    expect(new Shortlist(null).persistent).toBe(false);
  });
});

