import { el } from './dom';

export function toast(message: string, ms = 3000): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = el('div', { class: 'toast', role: 'status' }, message);
  host.append(t);
  window.setTimeout(() => t.remove(), ms);
}
