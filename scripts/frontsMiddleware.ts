import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { parseImageIndex, validCrop, type FrontCrop } from '../src/data/images';

export interface FrontsResult {
  status: number;
  body: unknown;
}

type FrontsFile = Record<string, FrontCrop>;

function readJson(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

function writeFronts(dir: string, data: FrontsFile): void {
  const sorted = Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
  const tmp = join(dir, `fronts.json.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`);
  renameSync(tmp, join(dir, 'fronts.json'));
}

const error = (status: number, message: string): FrontsResult => ({ status, body: { error: message } });

/** Saves one stove's front crop into `<dir>/fronts.json` after checking it against `<dir>/index.json`. */
export function saveFront(dir: string, body: unknown): FrontsResult {
  if (typeof body !== 'object' || body === null) return error(400, 'Richiesta non valida');
  const { id, image, crop } = body as Record<string, unknown>;
  if (typeof id !== 'string' || typeof image !== 'string') return error(400, 'id e image sono obbligatori');
  const index = parseImageIndex(readJson(join(dir, 'index.json')));
  const pictures = index.get(id);
  if (!pictures) return error(400, `Stufa senza immagini o sconosciuta: ${id}`);
  if (!pictures.includes(image)) return error(400, `Immagine non associata a ${id}: ${image}`);
  if (!validCrop(crop)) return error(400, 'Ritaglio fuori dai limiti dell’immagine');
  const fronts = readJson(join(dir, 'fronts.json')) as FrontsFile;
  fronts[id] = { image, crop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h } };
  writeFronts(dir, fronts);
  return { status: 200, body: fronts[id] };
}

export function deleteFront(dir: string, id: string): FrontsResult {
  const fronts = readJson(join(dir, 'fronts.json')) as FrontsFile;
  if (!(id in fronts)) return error(404, `Nessuna foto frontale per ${id}`);
  delete fronts[id];
  writeFronts(dir, fronts);
  return { status: 200, body: { ok: true } };
}

/** Dev-server only: POST /__fronts {id, image, crop} and DELETE /__fronts/<id>. */
export function frontsMiddleware(dir: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = req.url ?? '';
    if (!url.startsWith('/__fronts')) return next();
    const send = (r: FrontsResult) => {
      res.statusCode = r.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(r.body));
    };
    if (req.method === 'DELETE') return send(deleteFront(dir, decodeURIComponent(url.slice('/__fronts/'.length))));
    if (req.method !== 'POST') return send(error(405, 'Metodo non permesso'));
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        send(saveFront(dir, JSON.parse(raw)));
      } catch {
        send(error(400, 'JSON non valido'));
      }
    });
  };
}
