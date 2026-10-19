// src/engine/sourcePosition.ts
import { SourcePos } from '../types';

/** Precomputed line-start offsets for a source string, so translating an offset
 *  to a line/column is a binary search rather than repeatedly slicing and
 *  splitting the whole prefix (which made per-character scanning O(n²)). */
export interface SourcePositionIndex {
  readonly lineStarts: readonly number[];
  readonly length: number;
}

/** Build a line index for `source`. Lines are separated by `\n` (optionally
 *  preceded by `\r`); a lone `\r` is treated as ordinary content, matching the
 *  historical `/\r?\n/` splitting behavior. */
export function buildSourcePositionIndex(source: string): SourcePositionIndex {
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) lineStarts.push(i + 1);
  }
  return { lineStarts, length: source.length };
}

/** Map an absolute offset to a zero-based {line, column, offset}, clamped to the
 *  valid range. */
export function offsetToSourcePos(index: SourcePositionIndex, offset: number): SourcePos {
  const clamped = offset < 0 ? 0 : offset > index.length ? index.length : offset;
  const starts = index.lineStarts;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= clamped) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, column: clamped - starts[lo], offset: clamped };
}
