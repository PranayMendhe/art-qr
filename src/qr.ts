import { create as createQRCode } from 'qrcode';
import { buildFunctionMask } from './qrGeometry.ts';

export interface QRMatrix {
  size: number;
  version: number;
  isDark(row: number, col: number): boolean;
  isFunctionModule(row: number, col: number): boolean;
}

export type QRGenerateResult =
  | { ok: true; matrix: QRMatrix; version: number; size: number }
  | { ok: false; error: string };

const LONG_LINK_VERSION_THRESHOLD = 6;
const LONG_LINK_LENGTH_THRESHOLD = 80;

export function generateQRMatrix(text: string): QRGenerateResult {
  if (text.trim().length === 0) {
    return { ok: false, error: 'Enter a link or some text to turn into a code.' };
  }

  let data: ReturnType<typeof createQRCode>;
  try {
    data = createQRCode(text, { errorCorrectionLevel: 'H' });
  } catch {
    return {
      ok: false,
      error: 'That text is too long to fit a scannable code at this quality. Try a shorter link or text.',
    };
  }

  const size = data.modules.size;
  const version = data.version;
  const functionMask = buildFunctionMask(version, size);

  const matrix: QRMatrix = {
    size,
    version,
    isDark: (row, col) => Boolean(data.modules.get(row, col)),
    isFunctionModule: (row, col) => functionMask[row][col],
  };

  return { ok: true, matrix, version, size };
}

/** A gentle nudge to shorten the input once the code starts getting dense. */
export function longLinkHint(text: string, version: number): string | null {
  if (version > LONG_LINK_VERSION_THRESHOLD || text.length > LONG_LINK_LENGTH_THRESHOLD) {
    return 'Long link — shorten it for a cleaner code.';
  }
  return null;
}
