import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteFront, saveFront } from '../scripts/frontsMiddleware';

function setup(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fronts-'));
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ b: ['img/2.jpg'], a: ['img/1.jpg', 'img/3.jpg'] }));
  return dir;
}
const crop = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
const read = (dir: string) => JSON.parse(readFileSync(join(dir, 'fronts.json'), 'utf8'));

describe('saveFront', () => {
  it('writes sorted JSON and creates the file if missing', () => {
    const dir = setup();
    expect(saveFront(dir, { id: 'b', image: 'img/2.jpg', crop }).status).toBe(200);
    expect(saveFront(dir, { id: 'a', image: 'img/3.jpg', crop }).status).toBe(200);
    expect(Object.keys(read(dir))).toEqual(['a', 'b']);
    expect(read(dir).a).toEqual({ image: 'img/3.jpg', crop });
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects unknown stoves, foreign images, bad crops and bad bodies', () => {
    const dir = setup();
    expect(saveFront(dir, { id: 'zzz', image: 'img/1.jpg', crop }).status).toBe(400);
    expect(saveFront(dir, { id: 'a', image: 'img/2.jpg', crop }).status).toBe(400);
    expect(saveFront(dir, { id: 'a', image: 'img/1.jpg', crop: { x: 0.8, y: 0, w: 0.5, h: 1 } }).status).toBe(400);
    expect(saveFront(dir, 'nope').status).toBe(400);
    expect(existsSync(join(dir, 'fronts.json'))).toBe(false);
  });
});

describe('deleteFront', () => {
  it('removes an entry', () => {
    const dir = setup();
    saveFront(dir, { id: 'a', image: 'img/1.jpg', crop });
    expect(deleteFront(dir, 'a').status).toBe(200);
    expect(read(dir)).toEqual({});
    expect(deleteFront(dir, 'a').status).toBe(404);
  });
});
