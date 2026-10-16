import './style.css';
import { buildCompareRows, footprintSvg, toCsv } from './compare/table';
import { safeLocalStorage, Shortlist, SHORTLIST_KEY } from './data/shortlist';
import { loadCatalogue } from './data/stoves';
import type { Stove } from './data/types';
import { decodeState, EMPTY_STATE, encodeState } from './data/urlState';
import { imageUrl, loadImages, picturesFor } from './data/images';
import { openLightbox } from './ui/lightbox';
import { el } from './ui/dom';
import { showFatal } from './ui/fatal';
import { sourceHref } from './ui/format';

function download(text: string, filename: string): void {
  // BOM so Excel reads the file as UTF-8.
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

async function main(): Promise<void> {
  const catalogue = await loadCatalogue('./data/stoves.json');
  const byId = new Map(catalogue.stoves.map((s) => [s.id, s]));
  const images = await loadImages();
  const shortlist = new Shortlist(safeLocalStorage());
  window.addEventListener('storage', (e) => e.key === SHORTLIST_KEY && shortlist.reload());
  window.addEventListener('pageshow', (e) => e.persisted && shortlist.reload());
  shortlist.merge(decodeState(location.search).shortlist);
  const app = document.getElementById('app')!;

  const viewerLink = (stove: string | null, ids: string[]) => `./index.html${encodeState({ ...EMPTY_STATE, stove, shortlist: ids })}`;

  function table(stoves: Stove[]): HTMLTableElement {
    const ids = stoves.map((s) => s.id);
    const head = el(
      'tr',
      {},
      el('th', {}, ''),
      ...stoves.map((s, i) =>
        el(
          'th',
          {},
          el('div', {}, el('strong', {}, `${s.brand} ${s.model}`)),
          el('div', { class: 'muted' }, catalogue.categories[s.category] ?? s.category),
          el(
            'div',
            { class: 'col-actions' },
            el('button', { title: 'Sposta a sinistra', disabled: i === 0, onclick: () => shortlist.move(s.id, -1) }, '◀'),
            el('button', { title: 'Sposta a destra', disabled: i === stoves.length - 1, onclick: () => shortlist.move(s.id, 1) }, '▶'),
            el('button', { title: 'Rimuovi dal confronto', onclick: () => shortlist.remove(s.id) }, '✕'),
          ),
          el('a', { href: viewerLink(s.id, ids) }, 'Apri nel visualizzatore'),
        ),
      ),
    );
    const body: HTMLElement[] = [];
    body.push(el('tr', { class: 'group' }, el('td', { colspan: stoves.length + 1 }, 'Immagine')));
    body.push(
      el(
        'tr',
        {},
        el('td', {}, 'Foto'),
        ...stoves.map((s) => {
          const urls = picturesFor(s.id, images).map(imageUrl);
          return el(
            'td',
            {},
            urls.length
              ? el('img', { class: 'cmp-thumb', src: urls[0], alt: `${s.brand} ${s.model}`, loading: 'lazy', title: 'Clicca per vedere tutte le foto', onclick: () => openLightbox(urls) })
              : '—',
          );
        }),
      ),
    );
    let group = '';
    for (const row of buildCompareRows(stoves)) {
      if (row.group !== group) {
        group = row.group;
        body.push(el('tr', { class: 'group' }, el('td', { colspan: stoves.length + 1 }, group)));
      }
      const cells =
        row.group === 'Fonti'
          ? stoves.map((s) =>
              el(
                'td',
                {},
                ...s.sources.flatMap((src, i) => [
                  i ? el('br') : null,
                  el('a', { href: sourceHref(src.file, src.page), target: '_blank', rel: 'noopener' }, `${src.file.split('/').pop()}${src.page ? ` p. ${src.page}` : ''}`),
                ]),
              ),
            )
          : row.values.map((v, i) => el('td', { class: row.best.includes(i) ? 'best' : '' }, v));
      body.push(el('tr', {}, el('td', {}, row.label), ...cells));
    }
    return el('table', { class: 'cmp' }, el('thead', {}, head), el('tbody', {}, ...body));
  }

  function figure(s: Stove): HTMLElement {
    const fig = el('figure');
    // Safe: the SVG is built only from numbers.
    fig.innerHTML = footprintSvg(s);
    fig.append(el('figcaption', {}, `${s.brand} ${s.model}${s.safety ? '' : ' — distanze non dichiarate'}`));
    return fig;
  }

  function render(): void {
    const stoves = shortlist.ids().map((id) => byId.get(id)).filter((s): s is Stove => !!s);
    const ids = stoves.map((s) => s.id);
    history.replaceState(null, '', `${location.pathname}${encodeState({ ...EMPTY_STATE, shortlist: ids })}`);
    const header = el(
      'header',
      {},
      el('h1', {}, `Confronto stufe (${stoves.length})`),
      el(
        'div',
        { class: 'row' },
        el('a', { href: viewerLink(null, ids) }, '← Torna al visualizzatore'),
        el('button', { disabled: !stoves.length, onclick: () => download(toCsv(stoves, buildCompareRows(stoves)), 'confronto-stufe.csv') }, 'Esporta CSV'),
      ),
    );
    if (!stoves.length) {
      app.replaceChildren(header, el('p', {}, 'Nessuna stufa nei preferiti. Aggiungile con ★ nel visualizzatore.'));
      return;
    }
    const withDims = stoves.filter((s) => s.dims);
    app.replaceChildren(
      header,
      el('div', { class: 'table-wrap' }, table(stoves)),
      el('h2', {}, 'Ingombro sulla parete libera (1,88 m)'),
      el('p', { class: 'muted' }, 'Vista dall’alto: parete in alto, stufa (grigio) con le distanze di sicurezza dichiarate (arancione).'),
      el('div', { class: 'footprints' }, ...withDims.map(figure)),
    );
  }

  shortlist.onChange(render);
  render();
}

main().catch((err: unknown) => showFatal(err instanceof Error ? err.message : String(err), () => location.reload()));
