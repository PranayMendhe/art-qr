/**
 * Procedurally generated source images, used both for the landing-page
 * gallery and the "Try a sample" button in the editor. Everything is drawn
 * at runtime with plain canvas primitives (gradients, arcs, noise) — no
 * external art or photos are used anywhere in this project.
 */

export interface ProceduralImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface ProceduralContext {
  // Typed loosely so both the browser's CanvasRenderingContext2D and node
  // canvas implementations satisfy this interface structurally.
  fillStyle: any;
  strokeStyle: any;
  lineWidth: number;
  globalAlpha: number;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, ccw?: boolean): void;
  fill(): void;
  createImageData(w: number, h: number): ProceduralImageData;
  putImageData(data: any, x: number, y: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): ProceduralGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): ProceduralGradient;
}

export interface ProceduralGradient {
  addColorStop(offset: number, color: string): void;
}

export type ProceduralVariant =
  | 'gradient'
  | 'blobs'
  | 'stripes'
  | 'sunset'
  | 'circles'
  | 'noise'
  | 'plain'
  | 'dark'
  | 'busy';

export const PROCEDURAL_VARIANTS: ProceduralVariant[] = [
  'gradient',
  'blobs',
  'stripes',
  'sunset',
  'circles',
  'noise',
  'plain',
  'dark',
  'busy',
];

/** Deterministic, dependency-free PRNG (mulberry32) so a seed always reproduces the same image. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES: [string, string, string][] = [
  ['#8b7cf0', '#5a4bbf', '#2f2560'],
  ['#ff9f6e', '#ef6a7c', '#8e4fa3'],
  ['#5ed1c4', '#3f8ec9', '#2a4d8f'],
  ['#ffd36e', '#ff8a5c', '#d14e8a'],
  ['#9be39d', '#4fb0a1', '#2a6f77'],
];

function pickPalette(rng: () => number): [string, string, string] {
  return PALETTES[Math.floor(rng() * PALETTES.length) % PALETTES.length];
}

export function drawProceduralImage(
  ctx: ProceduralContext,
  width: number,
  height: number,
  variant: ProceduralVariant,
  seed: number,
): void {
  const rng = createRng(seed);
  switch (variant) {
    case 'gradient':
      drawGradient(ctx, width, height, rng);
      break;
    case 'blobs':
      drawBlobs(ctx, width, height, rng);
      break;
    case 'stripes':
      drawStripes(ctx, width, height, rng);
      break;
    case 'sunset':
      drawSunset(ctx, width, height, rng);
      break;
    case 'circles':
      drawCircles(ctx, width, height, rng);
      break;
    case 'noise':
      drawNoise(ctx, width, height, rng);
      break;
    case 'plain':
      drawPlain(ctx, width, height, rng);
      break;
    case 'dark':
      drawDark(ctx, width, height, rng);
      break;
    case 'busy':
      drawBusy(ctx, width, height, rng);
      break;
  }
}

function drawGradient(ctx: ProceduralContext, width: number, height: number, rng: () => number): void {
  const [a, b, c] = pickPalette(rng);
  const angle = rng() * Math.PI * 2;
  const x1 = width / 2 + Math.cos(angle) * width;
  const y1 = height / 2 + Math.sin(angle) * height;
  const x0 = width / 2 - Math.cos(angle) * width;
  const y0 = height / 2 - Math.sin(angle) * height;
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, a);
  grad.addColorStop(0.55, b);
  grad.addColorStop(1, c);
  ctx.fillStyle = grad as unknown as string;
  ctx.fillRect(0, 0, width, height);
}

function drawBlobs(ctx: ProceduralContext, width: number, height: number, rng: () => number): void {
  const [a, b, c] = pickPalette(rng);
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, width, height);
  const colors = [b, c, a];
  const blobCount = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < blobCount; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.55 + rng() * 0.35;
    const r = (0.18 + rng() * 0.28) * Math.max(width, height);
    const cx = rng() * width;
    const cy = rng() * height;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawStripes(ctx: ProceduralContext, width: number, height: number, rng: () => number): void {
  const [a, b] = pickPalette(rng);
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = b;
  const stripeCount = 8 + Math.floor(rng() * 10);
  const stripeWidth = (width * 1.6) / stripeCount;
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((rng() - 0.5) * Math.PI);
  for (let i = 0; i < stripeCount; i += 2) {
    ctx.fillRect(-width, -height + i * stripeWidth, width * 2, stripeWidth);
  }
  ctx.restore();
}

function drawSunset(ctx: ProceduralContext, width: number, height: number, rng: () => number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#2b2255');
  grad.addColorStop(0.45, '#aa4f7c');
  grad.addColorStop(0.7, '#ff8a5c');
  grad.addColorStop(1, '#ffd36e');
  ctx.fillStyle = grad as unknown as string;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#fff2cf';
  ctx.beginPath();
  ctx.arc(width * (0.35 + rng() * 0.3), height * 0.62, Math.min(width, height) * 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(20, 15, 40, 0.75)';
  const baseY = height * (0.72 + rng() * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, baseY);
  for (let x = 0; x <= width; x += width / 12) {
    ctx.lineTo(x, baseY - rng() * height * 0.08);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

function drawCircles(ctx: ProceduralContext, width: number, height: number, rng: () => number): void {
  const [a, b, c] = pickPalette(rng);
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, width, height);
  const colors = [a, b];
  const rings = 6 + Math.floor(rng() * 5);
  const cx = width * (0.3 + rng() * 0.4);
  const cy = height * (0.3 + rng() * 0.4);
  const maxR = Math.max(width, height) * 0.8;
  for (let i = rings; i > 0; i--) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.arc(cx, cy, (maxR * i) / rings, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawNoise(ctx: ProceduralContext, width: number, height: number, rng: () => number): void {
  const [a, b] = pickPalette(rng);
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  const colorA = hexToRgb(a);
  const colorB = hexToRgb(b);
  for (let i = 0; i < data.length; i += 4) {
    const t = rng();
    data[i] = colorA[0] + (colorB[0] - colorA[0]) * t;
    data[i + 1] = colorA[1] + (colorB[1] - colorA[1]) * t;
    data[i + 2] = colorA[2] + (colorB[2] - colorA[2]) * t;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

function drawPlain(ctx: ProceduralContext, width: number, height: number, rng: () => number): void {
  const [a] = pickPalette(rng);
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, width, height);
}

function drawDark(ctx: ProceduralContext, width: number, height: number, rng: () => number): void {
  ctx.fillStyle = '#0b0a14';
  ctx.fillRect(0, 0, width, height);
  const grad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.6);
  grad.addColorStop(0, 'rgba(70, 50, 120, 0.55)');
  grad.addColorStop(1, 'rgba(10, 8, 20, 0)');
  ctx.fillStyle = grad as unknown as string;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 40; i++) {
    const r = 1 + rng() * 2;
    ctx.beginPath();
    ctx.arc(rng() * width, rng() * height, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBusy(ctx: ProceduralContext, width: number, height: number, rng: () => number): void {
  const cell = Math.max(4, Math.round(Math.min(width, height) / 24));
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const dark = rng() > 0.5;
      ctx.fillStyle = dark ? '#05040a' : '#f4f1ff';
      ctx.fillRect(x, y, cell, cell);
    }
  }
  ctx.fillStyle = 'rgba(255, 60, 90, 0.6)';
  for (let i = 0; i < 10; i++) {
    const r = Math.min(width, height) * (0.05 + rng() * 0.12);
    ctx.beginPath();
    ctx.arc(rng() * width, rng() * height, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const value = parseInt(h, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
