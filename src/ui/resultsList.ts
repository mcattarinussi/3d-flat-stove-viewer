import type { SortKey } from '../data/filters';
import type { Stove } from '../data/types';
import { el } from './dom';
import { fmtDims, fmtKw, fmtPrice, fmtStars } from './format';

const ROW = 56;
const SORTS: [SortKey, string][] = [
  ['price', 'prezzo'],
  ['kw', 'potenza'],
  ['width', 'larghezza'],
  ['name', 'nome'],
];

export interface ResultsOptions {
  sort: SortKey;
  onSort(k: SortKey): void;
  onSelect(id: string): void;
  onToggleStar(id: string): void;
  isStarred(id: string): boolean;
}

/** Virtualised list: only the rows in view (plus a margin) are in the DOM. */
export class ResultsList {
  private items: Stove[] = [];
  private selected: string | null = null;
  private count = el('span', { class: 'muted' });
  private viewport = el('div', { class: 'results-viewport' });
  private spacer = el('div', { class: 'results-spacer' });
  private notes = el('div', { class: 'muted' });

  constructor(container: HTMLElement, private opts: ResultsOptions) {
    const sort = el(
      'select',
      { onchange: (e: Event) => opts.onSort((e.target as HTMLSelectElement).value as SortKey) },
      ...SORTS.map(([k, label]) => el('option', { value: k, selected: k === opts.sort }, `Ordina per ${label}`)),
    );
    this.viewport.append(this.spacer);
    this.viewport.addEventListener('scroll', () => this.render());
    container.append(el('div', { class: 'results-head' }, this.count, sort), this.viewport, this.notes);
  }

  setItems(items: Stove[], notes: string[]): void {
    this.items = items;
    this.count.textContent = `${items.length} stufe`;
    this.notes.textContent = notes.join(' · ');
    this.spacer.style.height = `${items.length * ROW}px`;
    this.viewport.scrollTop = 0;
    this.render();
  }

  setSelected(id: string | null): void {
    this.selected = id;
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    const top = this.viewport.scrollTop;
    const height = this.viewport.clientHeight || 320;
    const first = Math.max(0, Math.floor(top / ROW) - 5);
    const last = Math.min(this.items.length, Math.ceil((top + height) / ROW) + 5);
    this.spacer.replaceChildren(...this.items.slice(first, last).map((s, i) => this.row(s, first + i)));
  }

  private row(s: Stove, index: number): HTMLElement {
    const starred = this.opts.isStarred(s.id);
    const star = el(
      'button',
      {
        class: starred ? 'star on' : 'star',
        title: starred ? 'Togli dai preferiti' : 'Aggiungi ai preferiti',
        onclick: (e: Event) => {
          e.stopPropagation();
          this.opts.onToggleStar(s.id);
        },
      },
      '★',
    );
    const meta = [fmtKw(s.kw), fmtPrice(s.price), fmtDims(s.dims), s.stars ? fmtStars(s.stars) : ''].filter(Boolean).join(' · ');
    const row = el(
      'div',
      { class: s.id === this.selected ? 'result selected' : 'result', onclick: () => this.opts.onSelect(s.id) },
      el('div', { class: 'title' }, `${s.brand} ${s.model}`),
      star,
      el('div', { class: 'meta' }, meta),
    );
    row.style.top = `${index * ROW}px`;
    return row;
  }
}
