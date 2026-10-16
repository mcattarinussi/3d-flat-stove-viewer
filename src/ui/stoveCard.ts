import type { Stove } from '../data/types';
import { el } from './dom';
import { fmtDims, fmtKw, fmtPrice } from './format';

export interface CardContext {
  bufferOn: boolean;
  onBufferToggle(on: boolean): void;
  onOpenDetails(): void;
}

/** Compact summary in the sidebar; the full specs and pictures live in the details window. */
export function renderStoveCard(container: HTMLElement, s: Stove | null, ctx: CardContext): void {
  const card = container.querySelector<HTMLElement>('.card') ?? container.appendChild(el('div', { class: 'card' }));
  if (!s) {
    card.replaceChildren(el('p', { class: 'muted' }, 'Scegli una stufa dai risultati.'));
    return;
  }
  card.replaceChildren(
    el('h3', {}, `${s.brand} ${s.model}`),
    el('div', { class: 'muted' }, [fmtPrice(s.price), fmtKw(s.kw), fmtDims(s.dims)].join(' · ')),
    s.safety
      ? el(
          'label',
          {},
          el('input', { type: 'checkbox', checked: ctx.bufferOn, onchange: (e: Event) => ctx.onBufferToggle((e.target as HTMLInputElement).checked) }),
          ' Mostra distanze di sicurezza',
        )
      : el('p', { class: 'warn' }, 'Distanze di sicurezza non dichiarate'),
    el('div', { class: 'row' }, el('button', { onclick: () => ctx.onOpenDetails() }, 'Apri dettagli')),
  );
}
