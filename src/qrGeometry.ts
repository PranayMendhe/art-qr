/**
 * Geometry helpers for locating the "function patterns" of a QR code symbol
 * (finder patterns, separators, timing patterns, alignment patterns, and the
 * format/version info strips). These must stay solid, untouched modules for
 * the code to remain reliably scannable — everything else is free to carry
 * the artistic halftone treatment.
 */

/** Alignment pattern center coordinates for a given QR version (1-40). */
export function getAlignmentPatternCenters(version: number): number[] {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result: number[] = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

/** Builds a size x size boolean grid marking modules that must render solid. */
export function buildFunctionMask(version: number, size: number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const mark = (r0: number, c0: number, r1: number, c1: number) => {
    const rowStart = Math.max(0, r0);
    const rowEnd = Math.min(size - 1, r1);
    const colStart = Math.max(0, c0);
    const colEnd = Math.min(size - 1, c1);
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        mask[r][c] = true;
      }
    }
  };

  // Finder patterns + their white separators, as 8x8 blocks in three corners.
  mark(0, 0, 7, 7);
  mark(0, size - 8, 7, size - 1);
  mark(size - 8, 0, size - 1, 7);

  // Timing patterns (row/column 6).
  mark(6, 0, 6, size - 1);
  mark(0, 6, size - 1, 6);

  // Format info strips (and the single fixed dark module), approximated by
  // protecting the full row/column 8 — a small, deliberate over-protection.
  mark(8, 0, 8, size - 1);
  mark(0, 8, size - 1, 8);

  // Alignment patterns (5x5 blocks), skipping the three that coincide with
  // the finder patterns.
  const centers = getAlignmentPatternCenters(version);
  if (centers.length > 0) {
    const last = centers[centers.length - 1];
    for (const i of centers) {
      for (const j of centers) {
        const overlapsFinder = (i === 6 && j === 6) || (i === 6 && j === last) || (i === last && j === 6);
        if (overlapsFinder) continue;
        mark(i - 2, j - 2, i + 2, j + 2);
      }
    }
  }

  // Version info blocks, present for version 7 and up.
  if (version >= 7) {
    mark(0, size - 11, 5, size - 9);
    mark(size - 11, 0, size - 9, 5);
  }

  return mask;
}
