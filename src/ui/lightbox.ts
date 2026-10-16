import { el } from './dom';

/** Full-screen image viewer: click or Esc closes, arrows navigate. */
export function openLightbox(urls: string[], start = 0): void {
  if (!urls.length) return;
  let i = Math.min(Math.max(start, 0), urls.length - 1);
  const img = el('img', { class: 'lightbox-img', alt: '' });
  const counter = el('div', { class: 'lightbox-count' });
  const show = () => {
    img.src = urls[i];
    counter.textContent = `${i + 1} / ${urls.length}`;
  };
  const step = (d: number) => {
    i = (i + d + urls.length) % urls.length;
    show();
  };
  const close = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  };
  const nav = (label: string, cls: string, d: number) =>
    el('button', { class: cls, title: label, onclick: (e: Event) => (e.stopPropagation(), step(d)) }, d < 0 ? '‹' : '›');
  const overlay = el(
    'div',
    { class: 'lightbox', onclick: (e: Event) => e.target === overlay && close() },
    img,
    counter,
    urls.length > 1 ? nav('Precedente', 'lightbox-prev', -1) : null,
    urls.length > 1 ? nav('Successiva', 'lightbox-next', 1) : null,
    el('button', { class: 'lightbox-close', title: 'Chiudi', onclick: close }, '✕'),
  );
  window.addEventListener('keydown', onKey);
  document.body.append(overlay);
  show();
}
