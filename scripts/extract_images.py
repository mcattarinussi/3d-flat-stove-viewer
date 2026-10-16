#!/usr/bin/env python3
"""Extract stove pictures from the catalogue PDFs into public/stove-images/.

Usage:  python3 scripts/extract_images.py [--only STOVE_ID]

Needs assets/catalogues/ locally (it is not in git) and the packages in
scripts/requirements.txt. Never touches public/stove-images/fronts.json.
"""
import argparse
import hashlib
import io
import json
import re
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'stove-images'
IMG_DIR = OUT / 'img'
INDEX = OUT / 'index.json'
EXCLUDED = {'cookstove', 'thermo_stove', 'thermo_cookstove', 'insert'}
MIN_SIDE = 200
MAX_ASPECT = 3.0
MAX_SIDE = 900
QUALITY = 80


def page_numbers(spec):
    """55 → [55]; "1-3" → [1, 2, 3]; "40-41,77" → [40, 41, 77]."""
    if isinstance(spec, int):
        return [spec]
    out = []
    for part in str(spec).split(','):
        m = re.fullmatch(r'\s*(\d+)\s*(?:-\s*(\d+))?\s*', part)
        if m:
            a = int(m[1])
            out.extend(range(a, int(m[2] or a) + 1))
    return out


def load_image(doc, xref, smask):
    pix = pymupdf.Pixmap(doc, xref)
    if smask:
        mask = pymupdf.Pixmap(doc, smask)
        # Some catalogues ship masks at a different resolution; then keep the image without transparency.
        if (mask.width, mask.height) == (pix.width, pix.height):
            pix = pymupdf.Pixmap(pix, mask)
    if pix.colorspace is None or pix.colorspace.name not in (pymupdf.csRGB.name, pymupdf.csGRAY.name):
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)  # CMYK, Lab, ICC-based, indexed…
    im = Image.open(io.BytesIO(pix.tobytes('png')))
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        bg = Image.new('RGB', im.size, 'white')
        bg.paste(im, mask=im.split()[3])
        return bg
    return im.convert('RGB')


def page_images(doc, page_no):
    page = doc[page_no - 1]
    for xref, smask, w, h, _bpc, colorspace, *_ in page.get_images(full=True):
        if not colorspace or min(w, h) < MIN_SIDE or max(w, h) / min(w, h) > MAX_ASPECT:
            continue
        try:
            yield load_image(doc, xref, smask)
        except Exception as err:  # broken or exotic image streams
            print(f'    skip xref {xref}: {err}')


def save(im):
    digest = hashlib.sha1(im.tobytes()).hexdigest()[:16]
    rel = f'img/{digest}.jpg'
    path = OUT / rel
    if not path.exists():
        im = im.copy()
        im.thumbnail((MAX_SIDE, MAX_SIDE))
        im.save(path, 'JPEG', quality=QUALITY, optimize=True)
    return rel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', help='re-extract a single stove id and merge into the index')
    args = parser.parse_args()

    stoves = [s for s in json.loads((ROOT / 'data' / 'stoves.json').read_text())['stoves'] if s['category'] not in EXCLUDED]
    if args.only:
        stoves = [s for s in stoves if s['id'] == args.only]
        if not stoves:
            raise SystemExit(f'unknown or excluded stove id: {args.only}')
    if not any((ROOT / 'assets' / 'catalogues').rglob('*.pdf')):
        raise SystemExit('assets/catalogues/ has no PDFs: nothing to extract (existing pictures left untouched)')
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    old_index = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    index = dict(old_index) if args.only else {}
    docs = {}
    incomplete = False

    for s in stoves:
        pictures = []
        missing = False
        for src in s['sources']:
            path = ROOT / src['file'].replace('assets/catalogues/catalogues/', 'assets/catalogues/', 1)
            if not path.exists():
                print(f'  {s["id"]}: missing {path.relative_to(ROOT)}')
                missing = True
                continue
            doc = docs.get(path) or docs.setdefault(path, pymupdf.open(path))
            for page_no in page_numbers(src['pages']):
                if 1 <= page_no <= doc.page_count:
                    for im in page_images(doc, page_no):
                        rel = save(im)
                        if rel not in pictures:
                            pictures.append(rel)
        if missing and s['id'] in old_index:
            # A source PDF is not here: keep what was extracted before rather than losing it.
            index[s['id']] = old_index[s['id']]
            incomplete = True
        elif pictures:
            index[s['id']] = pictures
        else:
            index.pop(s['id'], None)

    INDEX.write_text(json.dumps(dict(sorted(index.items())), indent=1) + '\n')

    used = {p for paths in index.values() for p in paths}
    if not args.only and not incomplete:
        for f in IMG_DIR.glob('*.jpg'):
            if f'img/{f.name}' not in used:
                f.unlink()
    size = sum((OUT / p).stat().st_size for p in used)
    print(f'{len(index)} stoves with pictures, {len(used)} images, {size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
