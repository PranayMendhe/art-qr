/**
 * Wires up the "Make yours" editor: image input (upload / drag-drop /
 * sample), text input, sliders, style + dot-shape toggles, live preview, and
 * PNG export.
 */
import { generateQRMatrix, longLinkHint } from './qr.ts';
import { renderArtQR, type DotShape, type ImageAdjustments, type ImageTransform, type RenderOptions, type StylePreset } from './render.ts';
import { drawProceduralImage, type ProceduralContext, type ProceduralVariant } from './procedural.ts';

interface SliderState {
  zoom: number;
  offsetX: number;
  offsetY: number;
  brightness: number;
  contrast: number;
  saturation: number;
  dotSize: number;
  blend: number;
}

interface SliderConfig {
  key: keyof SliderState;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  toRenderValue: (raw: number) => number;
}

const SLIDER_CONFIGS: SliderConfig[] = [
  { key: 'zoom', label: 'Zoom', min: 100, max: 260, step: 1, default: 100, toRenderValue: (v) => v / 100 },
  { key: 'offsetX', label: 'Position X', min: -100, max: 100, step: 1, default: 0, toRenderValue: (v) => v / 100 },
  { key: 'offsetY', label: 'Position Y', min: -100, max: 100, step: 1, default: 0, toRenderValue: (v) => v / 100 },
  { key: 'brightness', label: 'Brightness', min: 50, max: 150, step: 1, default: 100, toRenderValue: (v) => v },
  { key: 'contrast', label: 'Contrast', min: 50, max: 150, step: 1, default: 100, toRenderValue: (v) => v },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200, step: 1, default: 100, toRenderValue: (v) => v },
  { key: 'dotSize', label: 'Dot size', min: 20, max: 60, step: 1, default: 46, toRenderValue: (v) => v / 100 },
  { key: 'blend', label: 'Image strength', min: 10, max: 90, step: 1, default: 18, toRenderValue: (v) => v / 100 },
];

const DEFAULT_SLIDERS: SliderState = SLIDER_CONFIGS.reduce((acc, cfg) => {
  acc[cfg.key] = cfg.default;
  return acc;
}, {} as SliderState);

const PREVIEW_BASE_PIXELS_PER_MODULE = 9;
const EXPORT_BASE_PIXELS_PER_MODULE = 10;

interface ImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
}

function loadImageFile(file: File): Promise<ImageSource> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('That file does not look like an image.'));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Curated for the "Try a sample image" button: colorful, full-tone variants
// only — the flat/dark/noisy ones in PROCEDURAL_VARIANTS read as a bad photo
// pick, not a stylistic choice.
const SAMPLE_VARIANTS: ProceduralVariant[] = ['gradient', 'blobs', 'sunset', 'circles', 'stripes'];

function makeSampleImage(): ImageSource {
  const variant = SAMPLE_VARIANTS[Math.floor(Math.random() * SAMPLE_VARIANTS.length)];
  const size = 480;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) drawProceduralImage(ctx as unknown as ProceduralContext, size, size, variant, Math.floor(Math.random() * 1_000_000));
  return { source: canvas, width: size, height: size };
}

export function initEditor(): void {
  const textInput = document.querySelector<HTMLInputElement>('#text-input')!;
  const qrInfo = document.querySelector<HTMLParagraphElement>('#qr-info')!;
  const qrHint = document.querySelector<HTMLParagraphElement>('#qr-hint')!;
  const qrError = document.querySelector<HTMLParagraphElement>('#qr-error')!;
  const dropzone = document.querySelector<HTMLDivElement>('#dropzone')!;
  const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
  const sampleBtn = document.querySelector<HTMLButtonElement>('#sample-btn')!;
  const presetGroup = document.querySelector<HTMLDivElement>('#preset-group')!;
  const dotShapeGroup = document.querySelector<HTMLDivElement>('#dot-shape-group')!;
  const slidersContainer = document.querySelector<HTMLDivElement>('#sliders')!;
  const grayscaleCheckbox = document.querySelector<HTMLInputElement>('#grayscale-checkbox')!;
  const resetAllBtn = document.querySelector<HTMLButtonElement>('#reset-all-btn')!;
  const previewCanvas = document.querySelector<HTMLCanvasElement>('#preview-canvas')!;
  const scaleSelect = document.querySelector<HTMLSelectElement>('#scale-select')!;
  const exportDims = document.querySelector<HTMLSpanElement>('#export-dims')!;
  const downloadBtn = document.querySelector<HTMLButtonElement>('#download-btn')!;

  const state = {
    text: textInput.value,
    image: null as ImageSource | null,
    preset: 'none' as StylePreset,
    dotShape: 'circle' as DotShape,
    grayscale: false,
    sliders: { ...DEFAULT_SLIDERS },
  };

  const sliderInputs = new Map<keyof SliderState, HTMLInputElement>();

  function buildSliderRow(config: SliderConfig): void {
    const row = document.createElement('div');
    row.className = 'slider-row';

    const label = document.createElement('label');
    const inputId = `slider-${config.key}`;
    label.htmlFor = inputId;
    label.textContent = config.label;

    const input = document.createElement('input');
    input.type = 'range';
    input.id = inputId;
    input.min = String(config.min);
    input.max = String(config.max);
    input.step = String(config.step);
    input.value = String(state.sliders[config.key]);
    input.addEventListener('input', () => {
      state.sliders[config.key] = Number(input.value);
      scheduleRender();
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'slider-reset';
    resetBtn.textContent = '↺';
    resetBtn.setAttribute('aria-label', `Reset ${config.label}`);
    resetBtn.addEventListener('click', () => {
      state.sliders[config.key] = config.default;
      input.value = String(config.default);
      scheduleRender();
    });

    row.append(label, input, resetBtn);
    slidersContainer.appendChild(row);
    sliderInputs.set(config.key, input);
  }

  for (const config of SLIDER_CONFIGS) buildSliderRow(config);

  function currentImageOptions(): { transform: ImageTransform; adjustments: ImageAdjustments } {
    const s = state.sliders;
    return {
      transform: {
        zoom: SLIDER_CONFIGS[0].toRenderValue(s.zoom),
        offsetX: SLIDER_CONFIGS[1].toRenderValue(s.offsetX),
        offsetY: SLIDER_CONFIGS[2].toRenderValue(s.offsetY),
      },
      adjustments: {
        brightness: s.brightness,
        contrast: s.contrast,
        saturation: s.saturation,
        grayscale: state.grayscale,
      },
    };
  }

  function buildRenderOptions(scale: number, basePixelsPerModule: number): RenderOptions {
    const { transform, adjustments } = currentImageOptions();
    return {
      image: state.image
        ? { source: state.image.source, width: state.image.width, height: state.image.height, transform, adjustments }
        : null,
      dotSizeRatio: SLIDER_CONFIGS[6].toRenderValue(state.sliders.dotSize),
      blendStrength: SLIDER_CONFIGS[7].toRenderValue(state.sliders.blend),
      dotShape: state.dotShape,
      preset: state.preset,
      scale,
      basePixelsPerModule,
    };
  }

  function updateExportDims(): void {
    const scale = Number(scaleSelect.value);
    const result = generateQRMatrix(state.text);
    if (!result.ok) {
      exportDims.textContent = '';
      return;
    }
    const modulePx = EXPORT_BASE_PIXELS_PER_MODULE * scale;
    const dim = Math.round((result.size + 8) * modulePx);
    exportDims.textContent = `${dim.toLocaleString()} × ${dim.toLocaleString()} px`;
  }

  let renderScheduled = false;
  function scheduleRender(): void {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      render();
    });
  }

  function render(): void {
    const text = state.text.trim();
    const result = generateQRMatrix(text);

    if (!result.ok) {
      qrError.textContent = result.error;
      qrError.hidden = false;
      qrInfo.textContent = '';
      qrHint.hidden = true;
      const ctx = previewCanvas.getContext('2d');
      if (ctx) {
        previewCanvas.width = 400;
        previewCanvas.height = 400;
        ctx.clearRect(0, 0, 400, 400);
      }
      updateExportDims();
      return;
    }

    qrError.hidden = true;
    qrInfo.textContent = `Version ${result.version} · ${result.size}×${result.size}`;
    const hint = longLinkHint(text, result.version);
    qrHint.textContent = hint ?? '';
    qrHint.hidden = !hint;

    renderArtQR(previewCanvas, result.matrix, buildRenderOptions(1, PREVIEW_BASE_PIXELS_PER_MODULE));
    updateExportDims();
  }

  textInput.addEventListener('input', () => {
    state.text = textInput.value;
    scheduleRender();
  });

  async function handleFiles(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      qrError.textContent = 'Please choose an image file.';
      qrError.hidden = false;
      return;
    }
    try {
      state.image = await loadImageFile(file);
      scheduleRender();
    } catch (err) {
      qrError.textContent = err instanceof Error ? err.message : 'Could not load that image.';
      qrError.hidden = false;
    }
  }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    void handleFiles(event.dataTransfer?.files ?? null);
  });
  fileInput.addEventListener('change', () => void handleFiles(fileInput.files));

  sampleBtn.addEventListener('click', () => {
    state.image = makeSampleImage();
    scheduleRender();
  });

  function wireToggleGroup(group: HTMLElement, attr: string, onSelect: (value: string) => void): void {
    group.querySelectorAll<HTMLButtonElement>('.toggle-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.dataset[attr];
        if (!value) return;
        group.querySelectorAll<HTMLButtonElement>('.toggle-option').forEach((other) => {
          const active = other === btn;
          other.classList.toggle('is-active', active);
          other.setAttribute('aria-pressed', String(active));
        });
        onSelect(value);
      });
    });
  }

  wireToggleGroup(presetGroup, 'preset', (value) => {
    state.preset = value as StylePreset;
    scheduleRender();
  });

  wireToggleGroup(dotShapeGroup, 'dotShape', (value) => {
    state.dotShape = value as DotShape;
    scheduleRender();
  });

  grayscaleCheckbox.addEventListener('change', () => {
    state.grayscale = grayscaleCheckbox.checked;
    scheduleRender();
  });

  resetAllBtn.addEventListener('click', () => {
    state.sliders = { ...DEFAULT_SLIDERS };
    for (const config of SLIDER_CONFIGS) {
      const input = sliderInputs.get(config.key);
      if (input) input.value = String(config.default);
    }
    scheduleRender();
  });

  scaleSelect.addEventListener('change', updateExportDims);

  downloadBtn.addEventListener('click', () => {
    const text = state.text.trim();
    const result = generateQRMatrix(text);
    if (!result.ok) return;

    const scale = Number(scaleSelect.value);
    const exportCanvas = document.createElement('canvas');
    renderArtQR(exportCanvas, result.matrix, buildRenderOptions(scale, EXPORT_BASE_PIXELS_PER_MODULE));

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `art-qr-${scale}x.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  });

  // Seed the preview with a generated sample image so the editor never
  // starts out blank.
  if (!textInput.value) {
    textInput.value = 'https://example.com';
    state.text = textInput.value;
  }
  state.image = makeSampleImage();
  render();
}
