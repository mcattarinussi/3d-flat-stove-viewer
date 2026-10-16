import type { FlueOutlet, Stove } from '../data/types';
import { el } from './dom';
import { fmtCm, fmtDims, fmtKw, fmtPct, fmtPrice, fmtStars, sourceHref } from './format';
import { openLightbox } from './lightbox';

const OUTLET_IT: Record<FlueOutlet, string> = { top: 'superiore', rear: 'posteriore', side: 'laterale' };
const POS_KEY = 'stufa3d.detailsPos';
const NARROW = '(max-width: 800px)';

export interface DetailsContext {
  categories: Record<string, string>;
  /** Front photo first. */
  pictures: { path: string; url: string }[];
  bufferOn: boolean;
  onBufferToggle(on: boolean): void;
  starred: boolean;
  onToggleStar(): void;
  front?: { available: boolean; on: boolean; onToggle(on: boolean): void };
  /** Dev only: open the cropper on this picture. */
  onUseAsFront?: (path: string) => void;
}

function readPos(): { left: number; top: number } | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
    if (v && typeof v === 'object' && 'left' in v && 'top' in v && typeof v.left === 'number' && typeof v.top === 'number') {
      return { left: v.left, top: v.top };
    }
  } catch {
    /* storage unavailable or corrupt: use the default position */
  }
  return null;
}

function writePos(pos: { left: number; top: number }): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

const num = (v: number | null, unit: string) => (v === null ? '—' : `${String(v).replace('.', ',')} ${unit}`);

/** Floating, draggable panel over the 3D view with pictures and the full specs of the selected stove. */
export class DetailsWindow {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private stoveId: string | null = null;
  private picIndex = 0;
  private last: { s: Stove; ctx: DetailsContext } | null = null;

  constructor(private readonly stage: HTMLElement) {
    this.title = el('h3', {}, '');
    const header = el('div', { class: 'details-head' }, this.title, el('button', { class: 'details-close', title: 'Chiudi', onclick: () => this.close() }, '✕'));
    this.body = el('div', { class: 'details-body' });
    this.root = el('aside', { class: 'details', hidden: true }, header, this.body);
    stage.append(this.root);
    this.enableDrag(header);
    window.addEventListener('resize', () => this.isOpen && this.place(this.root.offsetLeft, this.root.offsetTop));
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (!this.last) return;
    this.root.hidden = false;
    const saved = readPos();
    if (saved) this.place(saved.left, saved.top);
  }

  close(): void {
    this.root.hidden = true;
  }

  render(s: Stove | null, ctx: DetailsContext): void {
    if (!s) {
      this.last = null;
      this.stoveId = null;
      this.close();
      return;
    }
    if (s.id !== this.stoveId) {
      this.stoveId = s.id;
      this.picIndex = 0;
    }
    this.picIndex = Math.min(this.picIndex, Math.max(ctx.pictures.length - 1, 0));
    this.last = { s, ctx };
    this.title.textContent = `${s.brand} ${s.model}`;
    this.body.replaceChildren(...this.content(s, ctx));
  }

  /** Keeps the panel fully inside the stage. */
  private place(left: number, top: number): void {
    if (window.matchMedia(NARROW).matches) return;
    const maxLeft = Math.max(this.stage.clientWidth - this.root.offsetWidth, 0);
    const maxTop = Math.max(this.stage.clientHeight - this.root.offsetHeight, 0);
    const l = Math.min(Math.max(left, 0), maxLeft);
    const t = Math.min(Math.max(top, 0), maxTop);
    Object.assign(this.root.style, { left: `${l}px`, top: `${t}px`, right: 'auto' });
  }

  private enableDrag(handle: HTMLElement): void {
    let start: { x: number; y: number; left: number; top: number } | null = null;
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button') || window.matchMedia(NARROW).matches) return;
      start = { x: e.clientX, y: e.clientY, left: this.root.offsetLeft, top: this.root.offsetTop };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (start) this.place(start.left + e.clientX - start.x, start.top + e.clientY - start.y);
    });
    handle.addEventListener('pointerup', () => {
      if (!start) return;
      start = null;
      writePos({ left: this.root.offsetLeft, top: this.root.offsetTop });
    });
  }

  private rerender(): void {
    if (this.last) this.render(this.last.s, this.last.ctx);
  }

  private gallery(ctx: DetailsContext): Node[] {
    const pics = ctx.pictures;
    if (!pics.length) return [el('p', { class: 'muted gallery-empty' }, 'Nessuna immagine disponibile')];
    const current = pics[this.picIndex];
    const main = el('img', {
      class: 'gallery-main',
      src: current.url,
      alt: '',
      title: 'Clicca per ingrandire',
      onclick: () => openLightbox(pics.map((p) => p.url), this.picIndex),
    });
    const thumbs = el(
      'div',
      { class: 'thumbs' },
      ...pics.map((p, i) =>
        el('img', {
          class: i === this.picIndex ? 'active' : '',
          src: p.url,
          alt: '',
          loading: 'lazy',
          onclick: () => {
            this.picIndex = i;
            this.rerender();
          },
        }),
      ),
    );
    const useAsFront = ctx.onUseAsFront;
    const parts: (HTMLElement | null)[] = [
      main,
      pics.length > 1 ? thumbs : null,
      useAsFront ? el('button', { onclick: () => useAsFront(current.path) }, 'Usa come frontale…') : null,
    ];
    return parts.filter((n): n is HTMLElement => n !== null);
  }

  private content(s: Stove, ctx: DetailsContext): Node[] {
    const row = (k: string, v: string) => [el('dt', {}, k), el('dd', {}, v)];
    const sd = s.safety;
    const e = s.emissions;
    const power = s.kwMin !== null && s.kwMax !== null ? `${fmtKw(s.kw)} (${fmtKw(s.kwMin)}–${fmtKw(s.kwMax)})` : fmtKw(s.kw);
    const flue =
      s.flueDiameter === null && !s.flueOutlets.length
        ? '—'
        : `${s.flueDiameter === null ? '' : `Ø ${Math.round(s.flueDiameter * 1000)} mm `}${s.flueOutlets.map((o) => OUTLET_IT[o]).join(', ')}`.trim();
    const parts: (Node | null)[] = [
      el(
        'div',
        { class: 'row details-meta' },
        el('span', { class: 'muted' }, ctx.categories[s.category] ?? s.category),
        el('button', { class: ctx.starred ? 'star on' : 'star', title: ctx.starred ? 'Togli dai preferiti' : 'Aggiungi ai preferiti', onclick: () => ctx.onToggleStar() }, '★'),
      ),
      ...this.gallery(ctx),
      ctx.front
        ? el(
            'label',
            { class: 'front-toggle', title: ctx.front.available ? '' : 'Nessuna foto frontale salvata per questa stufa' },
            el('input', { type: 'checkbox', checked: ctx.front.on, disabled: !ctx.front.available, onchange: (ev: Event) => ctx.front!.onToggle((ev.target as HTMLInputElement).checked) }),
            ' Foto frontale sulla stufa 3D',
          )
        : null,
      el(
        'dl',
        {},
        ...row('Potenza', power),
        ...row('Prezzo indicativo', fmtPrice(s.price)),
        ...row('L × P × A', fmtDims(s.dims)),
        ...row('Peso', num(s.weightKg, 'kg')),
        ...row('Rendimento', fmtPct(s.efficiency)),
        ...row('Rendimento stagionale', fmtPct(s.seasonalEfficiency)),
        ...row('Volume riscaldabile', num(s.heatingVolume, 'm³')),
        ...row('Stelle', fmtStars(s.stars)),
        ...row('Classe energetica', s.energyClass ?? '—'),
        ...row('Canna fumaria', flue),
        ...row('Forno', s.hasOven ? 'Sì' : 'No'),
        ...row('Emissioni CO', num(e?.co ?? null, 'mg/Nm³')),
        ...row('Polveri (PM)', num(e?.pm ?? null, 'mg/Nm³')),
        ...row('NOx', num(e?.nox ?? null, 'mg/Nm³')),
        ...row('OGC', num(e?.ogc ?? null, 'mg/Nm³')),
        ...row('Finiture', s.finishes.length ? s.finishes.join(', ') : '—'),
        ...row('Certificazioni', s.certifications.length ? s.certifications.join(', ') : '—'),
      ),
      el('h4', {}, 'Distanze di sicurezza'),
      sd
        ? el(
            'dl',
            {},
            ...row('Posteriore', fmtCm(sd.rear)),
            ...row('Laterale', fmtCm(sd.side)),
            ...row('Frontale', fmtCm(sd.front)),
            ...row('Soffitto', fmtCm(sd.ceiling)),
            ...row('Pavimento davanti', fmtCm(sd.floorFront)),
          )
        : el('p', { class: 'warn' }, 'Distanze di sicurezza non dichiarate'),
      sd?.notes ? el('details', {}, el('summary', {}, 'Note del produttore'), el('p', {}, sd.notes)) : null,
      el(
        'label',
        {},
        el('input', { type: 'checkbox', checked: ctx.bufferOn, disabled: !sd, onchange: (ev: Event) => ctx.onBufferToggle((ev.target as HTMLInputElement).checked) }),
        ' Mostra distanze di sicurezza',
      ),
      s.sources.length
        ? el(
            'div',
            { class: 'muted details-sources' },
            'Fonti: ',
            ...s.sources.flatMap((src, i) => [
              i ? ' · ' : '',
              el('a', { href: sourceHref(src.file, src.page), target: '_blank', rel: 'noopener' }, `${src.file.split('/').pop()}${src.page ? ` p. ${src.page}` : ''}`),
            ]),
          )
        : null,
    ];
    return parts.filter((p): p is Node => p !== null);
  }
}
