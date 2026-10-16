import { el } from './dom';

export function renderDoorsPanel(
  container: HTMLElement,
  doors: { id: string; name: string }[],
  h: { toggle(id: string): void; setAll(open: boolean): void },
): { update(openIds: string[]): void } {
  const buttons = new Map<string, HTMLButtonElement>();
  const list = el(
    'div',
    { class: 'doors' },
    ...doors.map((d) => {
      const b = el('button', { onclick: () => h.toggle(d.id) }, d.name);
      buttons.set(d.id, b);
      return b;
    }),
  );
  container.append(
    list,
    el('div', { class: 'row' }, el('button', { onclick: () => h.setAll(true) }, 'Apri tutte'), el('button', { onclick: () => h.setAll(false) }, 'Chiudi tutte')),
    el('p', { class: 'muted' }, 'Clicca una porta nella scena per aprirla o chiuderla.'),
  );
  return {
    update(openIds) {
      for (const [id, b] of buttons) {
        const open = openIds.includes(id);
        b.classList.toggle('active', open);
        b.title = open ? 'Aperta — clic per chiudere' : 'Chiusa — clic per aprire';
      }
    },
  };
}
