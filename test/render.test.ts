import { describe, expect, it } from 'vitest';
import type { Canvas } from '@napi-rs/canvas';
import { generateQRMatrix, longLinkHint } from '../src/qr.ts';
import { renderArtQR, type ImageAdjustments, type ImageTransform, type RenderOptions, type StylePreset } from '../src/render.ts';
import { createNodeCanvas, decodeCanvas, makeProceduralImage } from './helpers.ts';

const SHORT_URL = 'https://a.io/x7q';
const MEDIUM_URL = 'https://example.com/products/category/item?ref=newsletter&utm_source=card';
const LONG_URL = `https://example.com/campaigns/${'summer-sale-'.repeat(10)}2026`;

const DEFAULT_TRANSFORM: ImageTransform = { zoom: 1, offsetX: 0, offsetY: 0 };
const DEFAULT_ADJUSTMENTS: ImageAdjustments = { brightness: 100, contrast: 100, saturation: 100, grayscale: false };

const busyImage = makeProceduralImage('busy', 1);
const darkImage = makeProceduralImage('dark', 2);
const gradientImage = makeProceduralImage('gradient', 3);
const plainImage = makeProceduralImage('plain', 4);

interface Combo {
  label: string;
  text: string;
  preset: StylePreset;
  scale: number;
  dotSizeRatio: number;
  blendStrength: number;
  transform: ImageTransform;
  image: Canvas | null;
}

function renderAndDecode(combo: Combo): string | null {
  const result = generateQRMatrix(combo.text);
  if (!result.ok) throw new Error(`expected a valid QR matrix for: ${combo.text}`);

  const { canvas } = createNodeCanvas(10);
  const options: RenderOptions = {
    image: combo.image
      ? {
          source: combo.image,
          width: combo.image.width,
          height: combo.image.height,
          transform: combo.transform,
          adjustments: DEFAULT_ADJUSTMENTS,
        }
      : null,
    dotSizeRatio: combo.dotSizeRatio,
    blendStrength: combo.blendStrength,
    dotShape: 'circle',
    preset: combo.preset,
    scale: combo.scale,
    basePixelsPerModule: 10,
  };

  renderArtQR(canvas, result.matrix, options);
  return decodeCanvas(canvas);
}

function expectDecodes(combo: Combo): void {
  const decoded = renderAndDecode(combo);
  expect(decoded, `combo "${combo.label}" should decode back to the original text`).toBe(combo.text);
}

const DEFAULT_SLIDERS = { dotSizeRatio: 0.38, blendStrength: 0.55, transform: DEFAULT_TRANSFORM };
const SMALL_DOT_SLIDERS = { dotSizeRatio: 0.2, blendStrength: 0.55, transform: DEFAULT_TRANSFORM };
const HIGH_ZOOM_SLIDERS = { dotSizeRatio: 0.38, blendStrength: 0.55, transform: { zoom: 2.4, offsetX: 0.3, offsetY: -0.25 } };

describe('renderArtQR -> scan round trip', () => {
  const images: Array<{ name: string; canvas: Canvas }> = [
    { name: 'busy (high contrast)', canvas: busyImage },
    { name: 'dark', canvas: darkImage },
    { name: 'gradient', canvas: gradientImage },
    { name: 'plain', canvas: plainImage },
  ];

  it.each(images)('decodes for the $name source image', ({ canvas }) => {
    expectDecodes({
      label: 'image-sweep',
      text: SHORT_URL,
      preset: 'none',
      scale: 2,
      ...DEFAULT_SLIDERS,
      image: canvas,
    });
  });

  const presets: StylePreset[] = ['none', 'card', 'stamp'];
  it.each(presets)('decodes for the "%s" style preset', (preset) => {
    expectDecodes({
      label: `preset-${preset}`,
      text: SHORT_URL,
      preset,
      scale: 2,
      ...DEFAULT_SLIDERS,
      image: busyImage,
    });
  });

  const scales = [1, 2, 4];
  it.each(scales)('decodes at %dx scale', (scale) => {
    expectDecodes({
      label: `scale-${scale}`,
      text: MEDIUM_URL,
      preset: 'card',
      scale,
      ...DEFAULT_SLIDERS,
      image: darkImage,
    });
  });

  it('decodes at 8x export scale', () => {
    expectDecodes({
      label: 'scale-8',
      text: SHORT_URL,
      preset: 'stamp',
      scale: 8,
      ...DEFAULT_SLIDERS,
      image: gradientImage,
    });
  });

  const sliderCases: Array<{ name: string; sliders: typeof DEFAULT_SLIDERS }> = [
    { name: 'default sliders', sliders: DEFAULT_SLIDERS },
    { name: 'small dot size', sliders: SMALL_DOT_SLIDERS },
    { name: 'high zoom', sliders: HIGH_ZOOM_SLIDERS },
  ];
  it.each(sliderCases)('decodes with $name against a busy image', ({ sliders }) => {
    expectDecodes({
      label: 'sliders',
      text: SHORT_URL,
      preset: 'none',
      scale: 2,
      ...sliders,
      image: busyImage,
    });
  });

  const texts = [
    { name: 'short url', value: SHORT_URL },
    { name: 'medium url', value: MEDIUM_URL },
    { name: 'long url (~150 chars)', value: LONG_URL },
  ];
  it.each(texts)('decodes the $name', ({ value }) => {
    expect(value.length).toBeGreaterThan(0);
    expectDecodes({
      label: 'text-length',
      text: value,
      preset: 'none',
      scale: 2,
      ...DEFAULT_SLIDERS,
      image: plainImage,
    });
  });

  it('decodes a plain code with no image at all', () => {
    expectDecodes({
      label: 'no-image',
      text: SHORT_URL,
      preset: 'none',
      scale: 2,
      ...DEFAULT_SLIDERS,
      image: null,
    });
  });
});

describe('generateQRMatrix', () => {
  it('reports version and size for a short url', () => {
    const result = generateQRMatrix(SHORT_URL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.version).toBe(3);
    expect(result.size).toBe(29);
    expect(result.matrix.size).toBe(29);
  });

  it('reports a higher version for a longer url', () => {
    const result = generateQRMatrix(MEDIUM_URL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.size).toBe(result.version * 4 + 17);
  });

  it('flags a clear error when the text is too long for level H', () => {
    const result = generateQRMatrix('x'.repeat(3000));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('rejects empty input with a clear error', () => {
    const result = generateQRMatrix('   ');
    expect(result.ok).toBe(false);
  });
});

describe('longLinkHint', () => {
  it('stays quiet for small, low-version codes', () => {
    expect(longLinkHint(SHORT_URL, 3)).toBeNull();
  });

  it('warns once the version climbs past the threshold', () => {
    expect(longLinkHint(SHORT_URL, 10)).toMatch(/shorten/i);
  });

  it('warns once the text itself is long, regardless of version', () => {
    expect(longLinkHint('a'.repeat(90), 2)).toMatch(/shorten/i);
  });
});
