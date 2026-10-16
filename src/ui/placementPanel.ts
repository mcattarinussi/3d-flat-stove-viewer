import type { NudgeDir, WallDistances } from '../scene/placement';
import { el } from './dom';
import { fmtCm } from './format';

export interface PlacementHandlers {
  nudge(dir: NudgeDir, step: number): void;
  rotate(delta: number): void;
  snap(): void;
}

export function renderPlacementPanel(container: HTMLElement, h: PlacementHandlers): { setDistances(d: WallDistances | null): void } {
  const step = el('select', {}, ...[1, 5, 10].map((cm) => el('option', { value: String(cm), selected: cm === 5 }, `${cm} cm`)));
  const s = () => Number(step.value) / 100;
  const btn = (label: string, title: string, fn: () => void) => el('button', { title, onclick: fn }, label);
  const dpad = el(
    'div',
    { class: 'dpad' },
    el('span'),
    btn('↑ Avanti', 'Sposta in avanti', () => h.nudge('forward', s())),
    el('span'),
    btn('← Sinistra', 'Sposta a sinistra (guardando la stufa)', () => h.nudge('left', s())),
    btn('Attacca al muro', 'Appoggia il retro alla parete più vicina', () => h.snap()),
    btn('Destra →', 'Sposta a destra (guardando la stufa)', () => h.nudge('right', s())),
    el('span'),
    btn('↓ Indietro', 'Sposta indietro', () => h.nudge('back', s())),
    el('span'),
  );
  const rotate = el(
    'div',
    { class: 'row' },
    el('span', { class: 'muted' }, 'Ruota'),
    btn('↺ 15°', 'Ruota in senso antiorario', () => h.rotate(-15)),
    btn('15° ↻', 'Ruota in senso orario', () => h.rotate(15)),
    btn('90° ↻', 'Ruota di 90°', () => h.rotate(90)),
  );
  const distances = el('div', { class: 'distances' });
  const body = el(
    'div',
    {},
    el('div', { class: 'row' }, el('span', { class: 'muted' }, 'Passo'), step),
    dpad,
    rotate,
    distances,
    el('p', { class: 'muted' }, "Trascina la stufa per spostarla, l'anello blu per ruotarla (Maiusc = scatti di 15°)."),
  );
  container.append(body);

  const setDistances = (d: WallDistances | null) => {
    body.querySelectorAll('button').forEach((b) => (b.disabled = d === null));
    distances.textContent = d
      ? `Distanza dalle pareti — Nord ${fmtCm(d.north)} · Est ${fmtCm(d.east)} · Sud ${fmtCm(d.south)} · Ovest ${fmtCm(d.west)}`
      : 'Seleziona una stufa per posizionarla.';
  };
  setDistances(null);
  return { setDistances };
}
