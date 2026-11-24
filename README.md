# Art QR

Turn any link or photo into a beautiful, fully scannable QR code — right in
your browser. No accounts, no watermark, no analytics, no server.

**Live app:** https://pranaymendhe.github.io/art-qr/

## Features

- **Landing gallery** — an animated showcase of procedurally generated art QR
  codes, switchable between "Spiral" and "Orbit" layouts. Every example image
  is drawn at runtime on `<canvas>` (gradients, blobs, stripes, sunsets,
  circles, noise) — nothing is a static asset.
- **Editor** — upload any image (file picker or drag-and-drop), or generate a
  random sample image, then paste a link or any text to encode.
- **Live halftone preview** — your photo fills each QR module as a small
  dot sized and colored by that module's bit, with the finder, timing,
  alignment, and format/version-info patterns always kept solid so the code
  stays reliably scannable at error-correction level **H**.
- **Full control** — zoom, position, brightness, contrast, saturation,
  grayscale, dot size, dot shape (circle/square), and image strength/blend,
  each with its own reset, plus a global reset.
- **Style presets** — Plain, Clean card (rounded white card with shadow), and
  Stamp (perforated postage-stamp border on warm paper).
- **QR info & guidance** — shows the code's version and module size, warns
  when a link is getting long enough to produce a dense code, and gives a
  clear error if the text is too long to fit at error-correction level H.
- **Export** — download a PNG at 1×, 2×, 4×, 6×, or 8×, rendered at full
  resolution offscreen, with the final pixel dimensions shown before you
  download.

## Privacy

Everything — image processing, QR generation, and rendering — happens
entirely in your browser. No image, link, or text you enter is ever sent
anywhere. There's no backend, no account system, and no analytics.

## Local development

```bash
npm install
npm run dev       # start the dev server
npm test          # run the renderer/decode test suite (vitest + jsQR)
npm run build     # type-check and produce a production build in dist/
```

## How it works

The QR matrix comes from the [`qrcode`](https://www.npmjs.com/package/qrcode)
package at error-correction level H. The renderer (`src/render.ts`) is a pure,
environment-agnostic function that draws onto any Canvas2D-like surface —
which is what lets the test suite render real art QR codes in Node (via
`@napi-rs/canvas`) and decode the exported pixels with
[`jsQR`](https://www.npmjs.com/package/jsqr) to assert they still scan
correctly across presets, scales, slider settings, and input lengths.

## License

MIT — see [LICENSE](LICENSE).
