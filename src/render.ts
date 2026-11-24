/**
 * Pure, environment-agnostic Art QR renderer.
 *
 * Draws a halftone "art QR code": the function patterns (finder, separator,
 * timing, alignment, format/version info) are always rendered as solid,
 * intact modules so the symbol stays reliably scannable; every other module
 * shows a crop of the source image (optionally pushed toward dark/light)
 * with a small solid dot at its center encoding the actual bit.
 *
 * Only relies on a minimal Canvas2D-shaped surface so it works identically
 * against a browser `CanvasRenderingContext2D` and a node canvas
 * implementation (e.g. `@napi-rs/canvas`), which is what makes it testable
 * from Node with real pixel decoding.
 */

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Context2DLike {
  // Typed loosely: both the browser's CanvasRenderingContext2D (which also
  // accepts CanvasGradient/CanvasPattern) and node canvas implementations
  // must satisfy this interface structurally.
  fillStyle: any;
  strokeStyle: any;
  lineWidth: number;
  globalAlpha: number;
  globalCompositeOperation: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, ccw?: boolean): void;
  fill(): void;
  stroke(): void;
  drawImage(
    image: unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  getImageData(x: number, y: number, w: number, h: number): ImageDataLike;
  // `data` is typed loosely because the real ImageData class (browser and
  // node canvas alike) carries extra fields (colorSpace, pixelFormat) that
  // this minimal interface intentionally omits.
  putImageData(data: any, x: number, y: number): void;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): Context2DLike | null;
}

/** The minimal shape of a QR module grid that the renderer needs. */
export interface QRModuleMatrix {
  size: number;
  isDark(row: number, col: number): boolean;
  isFunctionModule(row: number, col: number): boolean;
}

export interface ImageTransform {
  /** 1 = tightly covers the code area; larger values zoom in further. */
  zoom: number;
  /** -1..1, fraction of the available crop slack to shift horizontally. */
  offsetX: number;
  /** -1..1, fraction of the available crop slack to shift vertically. */
  offsetY: number;
}

export interface ImageAdjustments {
  /** 100 = neutral. */
  brightness: number;
  /** 100 = neutral. */
  contrast: number;
  /** 100 = neutral, 0 = fully desaturated. */
  saturation: number;
  grayscale: boolean;
}

export interface RenderImageOptions {
  source: unknown;
  width: number;
  height: number;
  transform: ImageTransform;
  adjustments: ImageAdjustments;
}

export type DotShape = 'circle' | 'square';
export type StylePreset = 'none' | 'card' | 'stamp';

export interface RenderOptions {
  image?: RenderImageOptions | null;
  /** Fraction of a module's size used for the center bit-dot, ~0.2-0.6. */
  dotSizeRatio: number;
  /** How strongly the image is pushed toward dark/light per bit, 0-1. */
  blendStrength: number;
  dotShape: DotShape;
  preset: StylePreset;
  darkColor?: string;
  lightColor?: string;
  /** Quiet-zone width, in modules. */
  quietZoneModules?: number;
  /** Export multiplier: 1, 2, 4, 6, 8... */
  scale: number;
  /** Pixels per module at scale 1. */
  basePixelsPerModule?: number;
}

export interface RenderResult {
  width: number;
  height: number;
  pixelsPerModule: number;
}

const DEFAULT_DARK = '#171321';
const DEFAULT_LIGHT = '#ffffff';
const MIN_DOT_RATIO = 0.24;
const MAX_DOT_RATIO = 0.62;
const MIN_BLEND = 0.12;

function parseColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  const value = parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

/** Mutates image data in place: brightness, contrast, saturation, grayscale. */
export function applyImageAdjustments(image: ImageDataLike, adjustments: ImageAdjustments): void {
  const data = image.data;
  const bFactor = adjustments.brightness / 100;
  const cFactor = adjustments.contrast / 100;
  const sFactor = adjustments.saturation / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * bFactor;
    let g = data[i + 1] * bFactor;
    let b = data[i + 2] * bFactor;

    r = (r - 128) * cFactor + 128;
    g = (g - 128) * cFactor + 128;
    b = (b - 128) * cFactor + 128;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = lum + (r - lum) * sFactor;
    g = lum + (g - lum) * sFactor;
    b = lum + (b - lum) * sFactor;

    if (adjustments.grayscale) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray;
      g = gray;
      b = gray;
    }

    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }
}

/** Computes a cover-fit source rectangle for drawing into a square destination. */
function coverFitSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  destSize: number,
  transform: ImageTransform,
): { sx: number; sy: number; s: number } {
  const zoom = Math.max(1, transform.zoom);
  const baseScale = Math.max(destSize / sourceWidth, destSize / sourceHeight);
  const scale = baseScale * zoom;
  const cropSize = Math.min(sourceWidth, sourceHeight, destSize / scale);

  const overflowX = Math.max(0, sourceWidth - cropSize);
  const overflowY = Math.max(0, sourceHeight - cropSize);
  const offsetX = clamp(transform.offsetX, -1, 1);
  const offsetY = clamp(transform.offsetY, -1, 1);

  const sx = (overflowX / 2) * (1 + offsetX);
  const sy = (overflowY / 2) * (1 + offsetY);

  return { sx, sy, s: cropSize };
}

function fillRoundedSquare(
  ctx: Context2DLike,
  x: number,
  y: number,
  size: number,
  radius: number,
  color: string,
): void {
  ctx.fillStyle = color;
  if (radius <= 0) {
    ctx.fillRect(x, y, size, size);
    return;
  }
  const r = Math.min(radius, size / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + size - r, y);
  ctx.arc(x + size - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + size, y + size - r);
  ctx.arc(x + size - r, y + size - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + size);
  ctx.arc(x + r, y + size - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
  ctx.fill();
}

function drawPerforation(ctx: Context2DLike, x: number, y: number, size: number, biteRadius: number): void {
  const spacing = biteRadius * 2.2;
  const perSide = Math.max(3, Math.round(size / spacing));
  const step = size / perSide;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000000';
  for (let i = 0; i <= perSide; i++) {
    const px = x + i * step;
    cutCircle(ctx, px, y, biteRadius);
    cutCircle(ctx, px, y + size, biteRadius);
  }
  for (let i = 0; i <= perSide; i++) {
    const py = y + i * step;
    cutCircle(ctx, x, py, biteRadius);
    cutCircle(ctx, x + size, py, biteRadius);
  }
  ctx.restore();
}

function cutCircle(ctx: Context2DLike, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Renders an art QR code onto `canvas`, sizing it to fit. Returns the final
 * pixel dimensions.
 */
export function renderArtQR(canvas: CanvasLike, matrix: QRModuleMatrix, options: RenderOptions): RenderResult {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable');

  const darkColor = options.darkColor ?? DEFAULT_DARK;
  const lightColor = options.lightColor ?? DEFAULT_LIGHT;
  const quietZoneModules = options.quietZoneModules ?? 4;
  const basePixelsPerModule = options.basePixelsPerModule ?? 10;
  const modulePx = basePixelsPerModule * options.scale;
  const dotSizeRatio = clamp(options.dotSizeRatio, MIN_DOT_RATIO, MAX_DOT_RATIO);
  const blendStrength = clamp(options.blendStrength, MIN_BLEND, 1);

  const codeAreaPx = matrix.size * modulePx;
  const quietZonePx = quietZoneModules * modulePx;
  const qrBlockPx = codeAreaPx + quietZonePx * 2;

  let outerPadding = 0;
  let margin = 0;
  let backgroundColor = lightColor;
  if (options.preset === 'card') {
    outerPadding = quietZonePx * 1.4;
    margin = modulePx * 2;
    backgroundColor = '#ffffff';
  } else if (options.preset === 'stamp') {
    outerPadding = quietZonePx * 1.2;
    margin = modulePx * 1.3;
    backgroundColor = '#f7ead3';
  }

  const totalSize = Math.round(qrBlockPx + outerPadding * 2 + margin * 2);
  canvas.width = totalSize;
  canvas.height = totalSize;
  ctx.clearRect(0, 0, totalSize, totalSize);

  const blockOrigin = margin;
  const blockSize = qrBlockPx + outerPadding * 2;

  if (options.preset === 'card') {
    ctx.save();
    ctx.shadowColor = 'rgba(80, 65, 120, 0.28)';
    ctx.shadowBlur = modulePx * 1.1;
    ctx.shadowOffsetY = modulePx * 0.45;
    fillRoundedSquare(ctx, blockOrigin, blockOrigin, blockSize, outerPadding * 0.5, backgroundColor);
    ctx.restore();
  } else if (options.preset === 'stamp') {
    fillRoundedSquare(ctx, blockOrigin, blockOrigin, blockSize, modulePx * 0.3, backgroundColor);
    drawPerforation(ctx, blockOrigin, blockOrigin, blockSize, modulePx * 0.42);
  } else {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(blockOrigin, blockOrigin, blockSize, blockSize);
  }

  const quietOrigin = blockOrigin + outerPadding;
  ctx.fillStyle = lightColor;
  ctx.fillRect(quietOrigin, quietOrigin, qrBlockPx, qrBlockPx);

  const codeOrigin = quietOrigin + quietZonePx;
  // Function-pattern modules are always drawn perfectly sharp and flush
  // against their neighbors — rounding individual module corners would leave
  // gaps between adjacent same-color modules and break finder/timing/
  // alignment pattern detection.
  const cornerRadius = 0;

  if (options.image) {
    const { sx, sy, s } = coverFitSourceRect(options.image.width, options.image.height, codeAreaPx, options.image.transform);
    ctx.drawImage(options.image.source, sx, sy, s, s, codeOrigin, codeOrigin, codeAreaPx, codeAreaPx);

    const imageData = ctx.getImageData(codeOrigin, codeOrigin, codeAreaPx, codeAreaPx);
    applyImageAdjustments(imageData, options.image.adjustments);
    blendDataModules(imageData, matrix, modulePx, blendStrength, darkColor, lightColor);
    ctx.putImageData(imageData, codeOrigin, codeOrigin);
  } else {
    ctx.fillStyle = lightColor;
    ctx.fillRect(codeOrigin, codeOrigin, codeAreaPx, codeAreaPx);
  }

  drawModuleOverlay(ctx, matrix, codeOrigin, modulePx, dotSizeRatio, options.dotShape, cornerRadius, darkColor, lightColor);

  return { width: totalSize, height: totalSize, pixelsPerModule: modulePx };
}

/** Pushes each data module's pixels toward its bit color by `blendStrength`. */
function blendDataModules(
  imageData: ImageDataLike,
  matrix: QRModuleMatrix,
  modulePx: number,
  blendStrength: number,
  darkColor: string,
  lightColor: string,
): void {
  const [dr, dg, db] = parseColor(darkColor);
  const [lr, lg, lb] = parseColor(lightColor);
  const { width, data } = imageData;
  const size = matrix.size;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix.isFunctionModule(row, col)) continue;
      const isDark = matrix.isDark(row, col);
      const [tr, tg, tb] = isDark ? [dr, dg, db] : [lr, lg, lb];

      const x0 = Math.round(col * modulePx);
      const y0 = Math.round(row * modulePx);
      const x1 = Math.round((col + 1) * modulePx);
      const y1 = Math.round((row + 1) * modulePx);

      for (let y = y0; y < y1; y++) {
        let idx = (y * width + x0) * 4;
        for (let x = x0; x < x1; x++, idx += 4) {
          data[idx] = data[idx] + (tr - data[idx]) * blendStrength;
          data[idx + 1] = data[idx + 1] + (tg - data[idx + 1]) * blendStrength;
          data[idx + 2] = data[idx + 2] + (tb - data[idx + 2]) * blendStrength;
        }
      }
    }
  }
}

/** Draws solid function-pattern modules and the bit-encoding center dots. */
function drawModuleOverlay(
  ctx: Context2DLike,
  matrix: QRModuleMatrix,
  codeOrigin: number,
  modulePx: number,
  dotSizeRatio: number,
  dotShape: DotShape,
  cornerRadius: number,
  darkColor: string,
  lightColor: string,
): void {
  const size = matrix.size;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const isDark = matrix.isDark(row, col);
      const color = isDark ? darkColor : lightColor;
      const x = codeOrigin + col * modulePx;
      const y = codeOrigin + row * modulePx;

      if (matrix.isFunctionModule(row, col)) {
        fillRoundedSquare(ctx, x, y, modulePx, cornerRadius, color);
        continue;
      }

      const dotSize = modulePx * dotSizeRatio;
      const cx = x + modulePx / 2;
      const cy = y + modulePx / 2;

      ctx.fillStyle = color;
      if (dotShape === 'circle') {
        ctx.beginPath();
        ctx.arc(cx, cy, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(cx - dotSize / 2, cy - dotSize / 2, dotSize, dotSize);
      }
    }
  }
}
