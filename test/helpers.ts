import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import { drawProceduralImage, type ProceduralVariant } from '../src/procedural.ts';
import type { CanvasLike } from '../src/render.ts';

const MAX_DECODE_DIMENSION = 1400;

/** Draws a procedurally generated source image onto a fresh node canvas. */
export function makeProceduralImage(variant: ProceduralVariant, seed: number, size = 480): Canvas {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawProceduralImage(ctx, size, size, variant, seed);
  return canvas;
}

export function createNodeCanvas(size: number): { canvas: Canvas; ctx: SKRSContext2D } {
  const canvas = createCanvas(size, size);
  return { canvas, ctx: canvas.getContext('2d') };
}

/** Decodes a rendered art QR canvas back to text, downscaling first if it's large. */
export function decodeCanvas(canvas: CanvasLike): string | null {
  let target = canvas as unknown as Canvas;

  if (target.width > MAX_DECODE_DIMENSION) {
    const scale = MAX_DECODE_DIMENSION / target.width;
    const small = createCanvas(Math.round(target.width * scale), Math.round(target.height * scale));
    const smallCtx = small.getContext('2d');
    smallCtx.drawImage(target as unknown as Canvas, 0, 0, target.width, target.height, 0, 0, small.width, small.height);
    target = small;
  }

  const ctx = target.getContext('2d');
  const imageData = ctx.getImageData(0, 0, target.width, target.height);
  const result = jsQR(imageData.data as unknown as Uint8ClampedArray, target.width, target.height, {
    inversionAttempts: 'dontInvert',
  });
  return result ? result.data : null;
}
