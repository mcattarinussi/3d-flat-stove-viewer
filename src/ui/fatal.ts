import { el } from './dom';

export function showFatal(message: string, retry: () => void): void {
  document.body.replaceChildren(
    el('div', { class: 'fatal' }, el('h1', {}, 'Qualcosa è andato storto'), el('p', {}, message), el('button', { class: 'primary', onclick: retry }, 'Riprova')),
  );
}
