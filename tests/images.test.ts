import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageUrl, loadImages, parseFronts, parseImageIndex, picturesFor, validCrop } from '../src/data/images';

afterEach(() => vi.unstubAllGlobals());

const index = parseImageIndex({ a: ['img/1.jpg', 'img/2.jpg', 'img/3.jpg'], b: ['img/9.jpg'] });

describe('parseImageIndex', () => {
  it('keeps string lists and drops garbage', () => {
    const m = parseImageIndex({ a: ['img/1.jpg', 3, 'img/2.jpg'], b: 'nope', c: [], d: ['img/4.jpg'] });
    expect([...m.entries()]).toEqual([
      ['a', ['img/1.jpg', 'img/2.jpg']],
      ['d', ['img/4.jpg']],
    ]);
    expect(parseImageIndex(null).size).toBe(0);
    expect(parseImageIndex([1, 2]).size).toBe(0);
  });
});

describe('validCrop', () => {
  it('accepts crops inside the image only', () => {
    expect(validCrop({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(validCrop({ x: 0.2, y: 0.1, w: 0.5, h: 0.8 })).toBe(true);
    expect(validCrop({ x: 0.6, y: 0, w: 0.5, h: 1 })).toBe(false);
    expect(validCrop({ x: -0.1, y: 0, w: 0.5, h: 0.5 })).toBe(false);
    expect(validCrop({ x: 0, y: 0, w: 0, h: 0.5 })).toBe(false);
    expect(validCrop({ x: 0, y: 0, w: '1', h: 1 })).toBe(false);
    expect(validCrop(null)).toBe(false);
  });
});

describe('parseFronts', () => {
  it('keeps entries whose image belongs to the stove and whose crop is valid', () => {
    const fronts = parseFronts(
      {
        a: { image: 'img/2.jpg', crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } },
        b: { image: 'img/1.jpg', crop: { x: 0, y: 0, w: 1, h: 1 } },
        c: { image: 'img/1.jpg', crop: { x: 0, y: 0, w: 1, h: 1 } },
        bad: 'x',
      },
      index,
    );
    expect([...fronts.keys()]).toEqual(['a']);
    expect(fronts.get('a')).toEqual({ image: 'img/2.jpg', crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } });
  });
});

describe('picturesFor', () => {
  it('puts the front image first without duplicating it', () => {
    const fronts = parseFronts({ a: { image: 'img/2.jpg', crop: { x: 0, y: 0, w: 1, h: 1 } } }, index);
    expect(picturesFor('a', { index, fronts })).toEqual(['img/2.jpg', 'img/1.jpg', 'img/3.jpg']);
    expect(picturesFor('b', { index, fronts })).toEqual(['img/9.jpg']);
    expect(picturesFor('zzz', { index, fronts })).toEqual([]);
  });

  it('builds relative URLs', () => {
    expect(imageUrl('img/1.jpg')).toBe('./stove-images/img/1.jpg');
  });
});

describe('loadImages', () => {
  it('loads index and fronts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('index.json')
          ? new Response(JSON.stringify({ a: ['img/1.jpg'] }))
          : new Response(JSON.stringify({ a: { image: 'img/1.jpg', crop: { x: 0, y: 0, w: 1, h: 1 } } })),
      ),
    );
    const imgs = await loadImages();
    expect(imgs.index.get('a')).toEqual(['img/1.jpg']);
    expect(imgs.fronts.get('a')?.image).toBe('img/1.jpg');
  });

  it('works without pictures when files are missing or corrupt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 200 })));
    const imgs = await loadImages();
    expect(imgs.index.size).toBe(0);
    expect(imgs.fronts.size).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await loadImages()).index.size).toBe(0);
  });
});
