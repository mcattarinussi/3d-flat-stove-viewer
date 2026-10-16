import type { ViewMode } from '../scene/camera';
import { el } from './dom';

export function renderViewPanel(container: HTMLElement, h: { setMode(mode: ViewMode): void; reset(): void }): void {
  const b3d = el('button', { class: 'active' }, 'Vista 3D');
  const bPlan = el('button', {}, 'Pianta');
  const select = (mode: ViewMode) => {
    b3d.classList.toggle('active', mode === '3d');
    bPlan.classList.toggle('active', mode === 'plan');
    h.setMode(mode);
  };
  b3d.addEventListener('click', () => select('3d'));
  bPlan.addEventListener('click', () => select('plan'));
  container.append(el('div', { class: 'row' }, b3d, bPlan, el('button', { onclick: () => h.reset() }, 'Reset')));
}
