/**
 * The landing page's animated gallery: a handful of procedurally generated
 * art QR codes, arranged in either a "spiral" or "orbit" layout and drifting
 * gently. Everything shown is generated at runtime — nothing is a static
 * asset.
 */
import { renderArtQR, type RenderOptions } from './render.ts';
import { generateQRMatrix } from './qr.ts';
import { drawProceduralImage, PROCEDURAL_VARIANTS, type ProceduralContext, type ProceduralVariant } from './procedural.ts';

type Layout = 'spiral' | 'orbit';

interface GalleryItem {
  el: HTMLDivElement;
  angle: number;
  radiusBase: number;
  speed: number;
  ring: number;
}

const ITEM_COUNT = 8;
const SAMPLE_TEXTS = ['https://artqr.app/a', 'https://artqr.app/b', 'https://artqr.app/c'];

function buildSourceImage(variant: ProceduralVariant, seed: number, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) drawProceduralImage(ctx as unknown as ProceduralContext, size, size, variant, seed);
  return canvas;
}

function buildArtQRCanvas(variant: ProceduralVariant, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const text = SAMPLE_TEXTS[seed % SAMPLE_TEXTS.length];
  const result = generateQRMatrix(text);
  if (!result.ok) return canvas;

  const image = buildSourceImage(variant, seed, 300);
  const options: RenderOptions = {
    image: {
      source: image,
      width: image.width,
      height: image.height,
      transform: { zoom: 1.15, offsetX: 0, offsetY: 0 },
      adjustments: { brightness: 100, contrast: 108, saturation: 114, grayscale: false },
    },
    dotSizeRatio: 0.4,
    blendStrength: 0.5,
    dotShape: 'circle',
    preset: 'none',
    scale: 1,
    basePixelsPerModule: 4,
  };
  renderArtQR(canvas, result.matrix, options);
  return canvas;
}

export function initGallery(stage: HTMLElement, toggleButtons: HTMLButtonElement[]): void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let layout: Layout = 'spiral';

  const variants = PROCEDURAL_VARIANTS.slice(0, ITEM_COUNT);
  const items: GalleryItem[] = variants.map((variant, i) => {
    const el = document.createElement('div');
    el.className = 'gallery-item';
    el.appendChild(buildArtQRCanvas(variant, i));
    stage.appendChild(el);
    return {
      el,
      angle: (i / ITEM_COUNT) * Math.PI * 2,
      radiusBase: 55 + (i % 3) * 52,
      speed: 0.12 + (i % 3) * 0.07,
      ring: i % 3,
    };
  });

  function paint(time: number): void {
    // Each .gallery-item is already centered on the stage via its own
    // `top: 50%; left: 50%` CSS — the transform below only needs to add the
    // relative orbit/spiral offset, not the stage's center point again.
    const t = time / 1000;

    for (const item of items) {
      let x: number;
      let y: number;
      let rotation = 0;
      const ringScale = item.ring === 0 ? 1.08 : item.ring === 1 ? 0.92 : 0.78;

      if (layout === 'spiral') {
        const angle = item.angle + (reduceMotion ? 0 : t * item.speed);
        const radius = item.radiusBase + Math.sin(t * 0.35 + item.angle) * 12;
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius * 0.7;
        rotation = (angle * 180) / Math.PI;
      } else {
        const direction = item.ring % 2 === 0 ? 1 : -1;
        const angle = item.angle + (reduceMotion ? 0 : t * item.speed * direction);
        x = Math.cos(angle) * item.radiusBase;
        y = Math.sin(angle) * item.radiusBase;
      }

      item.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${ringScale})`;
    }
  }

  if (reduceMotion) {
    paint(0);
    window.addEventListener('resize', () => paint(0));
  } else {
    const loop = (time: number): void => {
      paint(time);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  for (const btn of toggleButtons) {
    btn.addEventListener('click', () => {
      const next = btn.dataset.layout as Layout | undefined;
      if (!next || next === layout) return;
      layout = next;
      for (const other of toggleButtons) {
        const active = other === btn;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-pressed', String(active));
      }
      if (reduceMotion) paint(0);
    });
  }
}
