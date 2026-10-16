import { el } from './dom';

export function renderSharePanel(container: HTMLElement, getUrl: () => string, notify: (msg: string) => void): void {
  const copy = async () => {
    const url = getUrl();
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copiato negli appunti');
    } catch {
      window.prompt('Copia questo link:', url);
    }
  };
  container.append(
    el('button', { class: 'primary', onclick: copy }, 'Copia link'),
    el('p', { class: 'muted' }, 'Il link include stufa, posizione, porte aperte e preferiti.'),
  );
}
