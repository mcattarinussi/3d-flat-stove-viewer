import type { FlueOutlet, Stove } from '../data/types';
import { el } from './dom';
import { fmtCm, fmtDims, fmtKw, fmtPct, fmtPrice, fmtStars, sourceHref } from './format';

const OUTLET_IT: Record<FlueOutlet, string> = { top: 'superiore', rear: 'posteriore', side: 'laterale' };

export interface CardContext {
  categories: Record<string, string>;
  bufferOn: boolean;
  onBufferToggle(on: boolean): void;
  starred: boolean;
  onToggleStar(): void;
}

function flueText(s: Stove): string {
  if (s.flueDiameter === null && !s.flueOutlets.length) return '—';
  const diameter = s.flueDiameter === null ? '' : `Ø ${Math.round(s.flueDiameter * 1000)} mm `;
  return `${diameter}${s.flueOutlets.map((o) => OUTLET_IT[o]).join(', ')}`.trim();
}

export function renderStoveCard(container: HTMLElement, s: Stove | null, ctx: CardContext): void {
  const card = container.querySelector<HTMLElement>('.card') ?? container.appendChild(el('div', { class: 'card' }));
  if (!s) {
    card.replaceChildren(el('p', { class: 'muted' }, 'Scegli una stufa dai risultati.'));
    return;
  }
  const row = (k: string, v: string) => [el('dt', {}, k), el('dd', {}, v)];
  const sd = s.safety;
  const power = s.kwMin !== null && s.kwMax !== null ? `${fmtKw(s.kw)} (${fmtKw(s.kwMin)}–${fmtKw(s.kwMax)})` : fmtKw(s.kw);
  const parts: (Node | null)[] = [
    el(
      'div',
      { class: 'row', style: 'justify-content: space-between' },
      el('h3', {}, `${s.brand} ${s.model}`),
      el('button', { class: ctx.starred ? 'star on' : 'star', title: ctx.starred ? 'Togli dai preferiti' : 'Aggiungi ai preferiti', onclick: () => ctx.onToggleStar() }, '★'),
    ),
    el('div', { class: 'muted' }, ctx.categories[s.category] ?? s.category),
    el(
      'dl',
      {},
      ...row('Potenza', power),
      ...row('Prezzo indicativo', fmtPrice(s.price)),
      ...row('L × P × A', fmtDims(s.dims)),
      ...row('Peso', s.weightKg === null ? '—' : `${s.weightKg} kg`),
      ...row('Rendimento', fmtPct(s.efficiency)),
      ...row('Stelle', fmtStars(s.stars)),
      ...row('Classe', s.energyClass ?? '—'),
      ...row('Canna fumaria', flueText(s)),
    ),
    sd
      ? el(
          'dl',
          {},
          ...row('Dist. posteriore', fmtCm(sd.rear)),
          ...row('Dist. laterale', fmtCm(sd.side)),
          ...row('Dist. frontale', fmtCm(sd.front)),
          ...row('Dist. soffitto', fmtCm(sd.ceiling)),
          ...row('Pavimento davanti', fmtCm(sd.floorFront)),
        )
      : el('p', { class: 'warn' }, 'Distanze di sicurezza non dichiarate'),
    sd?.notes ? el('details', {}, el('summary', {}, 'Note del produttore'), el('p', {}, sd.notes)) : null,
    el(
      'label',
      {},
      el('input', { type: 'checkbox', checked: ctx.bufferOn, disabled: !sd, onchange: (e: Event) => ctx.onBufferToggle((e.target as HTMLInputElement).checked) }),
      ' Mostra distanze di sicurezza',
    ),
    s.sources.length
      ? el(
          'div',
          { class: 'muted' },
          'Fonti: ',
          ...s.sources.flatMap((src, i) => [
            i ? ' · ' : '',
            el('a', { href: sourceHref(src.file, src.page), target: '_blank', rel: 'noopener' }, `${src.file.split('/').pop()}${src.page ? ` p. ${src.page}` : ''}`),
          ]),
        )
      : null,
  ];
  card.replaceChildren(...parts.filter((p): p is Node => p !== null));
}
