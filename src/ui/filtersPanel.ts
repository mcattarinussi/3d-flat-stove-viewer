import { defaultFilters, type FilterState, type FreeWallMode, type Range, type RangeKey } from '../data/filters';
import type { Catalogue, EnergyClass } from '../data/types';
import { el } from './dom';

interface RangeSpec {
  key: RangeKey;
  label: string;
  unit: string;
  scale: number;
  step: number;
}

const RANGES: RangeSpec[] = [
  { key: 'kw', label: 'Potenza nominale', unit: 'kW', scale: 1, step: 0.5 },
  { key: 'price', label: 'Prezzo', unit: '€', scale: 1, step: 50 },
  { key: 'width', label: 'Larghezza', unit: 'cm', scale: 100, step: 1 },
  { key: 'depth', label: 'Profondità', unit: 'cm', scale: 100, step: 1 },
  { key: 'height', label: 'Altezza', unit: 'cm', scale: 100, step: 1 },
];

export interface FiltersContext {
  catalogue: Catalogue;
  brandCounts: Map<string, number>;
  extents: Record<RangeKey, Range>;
  /** Depth limits for the free wall, from the apartment measurements. */
  freeWallLimits: Record<FreeWallMode, number>;
}

export function renderFilters(container: HTMLElement, ctx: FiltersContext, initial: FilterState, onChange: (s: FilterState) => void): void {
  const body = el('div');
  container.append(body);

  const draw = (state: FilterState) => {
    const emit = () => onChange(state);
    const stars = el(
      'select',
      {
        onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          state.minStars = v ? Number(v) : null;
          emit();
        },
      },
      el('option', { value: '', selected: state.minStars === null }, 'Qualsiasi'),
      ...[3, 4, 5].map((n) => el('option', { value: String(n), selected: state.minStars === n }, `${'★'.repeat(n)} o più`)),
    );
    body.replaceChildren(
      el('input', {
        type: 'search',
        placeholder: 'Cerca marca o modello…',
        value: state.text,
        oninput: (e: Event) => {
          state.text = (e.target as HTMLInputElement).value;
          emit();
        },
      }),
      group(
        'Marca',
        checks(ctx.catalogue.brands.map((b) => ({ value: b, label: `${b} (${ctx.brandCounts.get(b) ?? 0})` })), state.brands, emit, true),
        'Nessuna selezione = tutte',
      ),
      ...RANGES.map((spec) =>
        rangeControl(spec, ctx.extents[spec.key], state.ranges[spec.key], (r) => {
          state.ranges[spec.key] = r;
          emit();
        }),
      ),
      group('Stelle minime', stars),
      group(
        'Classe energetica',
        checks((['A+', 'A'] as EnergyClass[]).map((c) => ({ value: c, label: c })), state.energyClasses as Set<string>, emit),
        'Nessuna selezione = tutte',
      ),
      group(
        'Altro',
        el(
          'div',
          { class: 'checks' },
          toggle('Solo con distanze di sicurezza', state.onlyWithSafety, (v) => ((state.onlyWithSafety = v), emit())),
          toggle('Solo con prezzo', state.onlyWithPrice, (v) => ((state.onlyWithPrice = v), emit())),
          toggle('Con forno', state.onlyWithOven, (v) => ((state.onlyWithOven = v), emit())),
        ),
      ),
      group('Parete libera', freeWallControl(state, ctx.freeWallLimits, () => draw(state), emit)),
      el(
        'button',
        {
          onclick: () => {
            const fresh = defaultFilters();
            draw(fresh);
            onChange(fresh);
          },
        },
        'Ripristina filtri',
      ),
    );
  };
  draw(initial);
}

function group(label: string, control: Node, hint?: string): HTMLElement {
  return el('div', { class: 'filter-group' }, el('span', { class: 'label' }, label), control, hint ? el('div', { class: 'muted' }, hint) : null);
}

function checks(items: { value: string; label: string }[], set: Set<string>, emit: () => void, scroll = false): HTMLElement {
  return el(
    'div',
    { class: scroll ? 'checks scroll' : 'checks' },
    ...items.map((it) =>
      el(
        'label',
        {},
        el('input', {
          type: 'checkbox',
          checked: set.has(it.value),
          onchange: (e: Event) => {
            if ((e.target as HTMLInputElement).checked) set.add(it.value);
            else set.delete(it.value);
            emit();
          },
        }),
        ' ',
        it.label,
      ),
    ),
  );
}

function toggle(label: string, value: boolean, set: (v: boolean) => void): HTMLElement {
  return el('label', {}, el('input', { type: 'checkbox', checked: value, onchange: (e: Event) => set((e.target as HTMLInputElement).checked) }), ' ', label);
}

/** Two sliders (min, max). Both at the extremes = untouched = null, so stoves with missing data stay visible. */
function rangeControl(spec: RangeSpec, ext: Range, value: Range | null, onChange: (r: Range | null) => void): HTMLElement {
  const lo = Math.floor((ext.min * spec.scale) / spec.step) * spec.step;
  const hi = Math.ceil((ext.max * spec.scale) / spec.step) * spec.step;
  const attrs = { type: 'range', min: lo, max: hi, step: spec.step };
  const minIn = el('input', { ...attrs, value: value ? value.min * spec.scale : lo });
  const maxIn = el('input', { ...attrs, value: value ? value.max * spec.scale : hi });
  const out = el('span', { class: 'range-out' });
  const sync = (emit: boolean) => {
    const a = Number(minIn.value);
    const b = Number(maxIn.value);
    const untouched = a <= lo && b >= hi;
    out.textContent = untouched ? 'tutti' : `${a}–${b} ${spec.unit}`;
    if (emit) onChange(untouched ? null : { min: a / spec.scale, max: b / spec.scale });
  };
  minIn.addEventListener('input', () => {
    if (Number(minIn.value) > Number(maxIn.value)) minIn.value = maxIn.value;
    sync(true);
  });
  maxIn.addEventListener('input', () => {
    if (Number(maxIn.value) < Number(minIn.value)) maxIn.value = minIn.value;
    sync(true);
  });
  sync(false);
  return el('div', { class: 'filter-group' }, el('span', { class: 'label' }, spec.label, out), el('div', { class: 'range-inputs' }, minIn, maxIn));
}

const cm = (m: number) => `${String(Math.round(m * 1000) / 10).replace('.', ',')} cm`;

/** On/off plus a two-position choice: stay clear of the night-area doorway, or stay in front of plain wall. */
function freeWallControl(state: FilterState, limits: Record<FreeWallMode, number>, redraw: () => void, emit: () => void): HTMLElement {
  const enable = toggle('Ci sta lungo la parete libera', state.freeWall !== null, (on) => {
    state.freeWall = on ? { mode: 'door', maxDepth: limits.door } : null;
    redraw();
    emit();
  });
  if (!state.freeWall) return el('div', { class: 'checks' }, enable);
  const option = (mode: FreeWallMode, label: string, hint: string) =>
    el(
      'label',
      { title: hint },
      el('input', {
        type: 'radio',
        name: 'free-wall',
        checked: state.freeWall?.mode === mode,
        onchange: () => {
          state.freeWall = { mode, maxDepth: limits[mode] };
          emit();
        },
      }),
      ` ${label}`,
    );
  return el(
    'div',
    {},
    el('div', { class: 'checks' }, enable),
    el(
      'div',
      { class: 'fit-options' },
      option('door', `Senza ostruire la porta (≤ ${cm(limits.door)})`, 'Profondità dal battiscopa al bordo interno della cornice della porta della zona notte: il passaggio resta libero'),
      option('wall', `Solo muro, senza coprire lo stipite (≤ ${cm(limits.wall)})`, 'Profondità dal battiscopa al bordo esterno della cornice: la stufa sta davanti al solo muro'),
    ),
  );
}
