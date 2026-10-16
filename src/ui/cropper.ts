import type { Crop } from '../data/images';
import { clampCrop, fitAspect, rectFromPoints } from './cropMath';
import { el } from './dom';

export interface CropperOptions {
  imageUrl: string;
  /** Target width / height of the stove front. */
  aspect: number;
  initial?: Crop;
  onSave(crop: Crop): Promise<void>;
  onRemove?: () => Promise<void>;
}

/** Modal to draw the stove's front on a catalogue picture. Dev only. */
export function openCropper(opts: CropperOptions): void {
  const img = el('img', { src: opts.imageUrl, alt: '', draggable: false });
  const handle = el('div', { class: 'crop-handle' });
  const rect = el('div', { class: 'crop-rect' }, handle);
  const stage = el('div', { class: 'crop-stage' }, img, rect);
  const lock = el('input', { type: 'checkbox', checked: true });
  const status = el('span', { class: 'muted' });
  let crop: Crop = opts.initial ?? { x: 0.25, y: 0.1, w: 0.5, h: 0.8 };

  const constrain = (c: Crop) =>
    lock.checked ? clampCrop(fitAspect(c, opts.aspect, img.naturalWidth || 1, img.naturalHeight || 1)) : clampCrop(c);
  const draw = () =>
    Object.assign(rect.style, { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` });
  const point = (e: PointerEvent) => {
    const r = img.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  let drag: { mode: 'new' | 'move' | 'resize'; x0: number; y0: number; start: Crop } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = point(e);
    const mode = e.target === handle ? 'resize' : e.target === rect ? 'move' : 'new';
    drag = { mode, x0: p.x, y0: p.y, start: { ...crop } };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = point(e);
    const s = drag.start;
    if (drag.mode === 'move') crop = clampCrop({ ...s, x: s.x + p.x - drag.x0, y: s.y + p.y - drag.y0 });
    else if (drag.mode === 'resize') crop = constrain({ ...s, w: p.x - s.x, h: p.y - s.y });
    else crop = constrain(rectFromPoints(drag.x0, drag.y0, p.x, p.y));
    draw();
  });
  stage.addEventListener('pointerup', () => (drag = null));
  lock.addEventListener('change', () => {
    crop = constrain(crop);
    draw();
  });
  img.addEventListener('load', () => {
    if (!opts.initial) crop = constrain(crop);
    draw();
  });

  const close = () => overlay.remove();
  const run = async (action: () => Promise<void>) => {
    status.textContent = 'Salvataggio…';
    try {
      await action();
      close();
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
    }
  };
  const remove = opts.onRemove;
  const overlay = el(
    'div',
    { class: 'cropper' },
    el(
      'div',
      { class: 'cropper-panel' },
      el('h3', {}, 'Ritaglia la foto frontale'),
      el('p', { class: 'muted' }, 'Disegna il riquadro sul fronte della stufa; trascinalo per spostarlo, usa l’angolo per ridimensionarlo.'),
      stage,
      el('div', { class: 'row' }, el('label', {}, lock, ' Proporzioni della stufa'), status),
      el(
        'div',
        { class: 'row' },
        el('button', { class: 'primary', onclick: () => run(() => opts.onSave(crop)) }, 'Salva'),
        remove ? el('button', { onclick: () => run(remove) }, 'Rimuovi') : null,
        el('button', { onclick: close }, 'Annulla'),
      ),
    ),
  );
  document.body.append(overlay);
  draw();
}
