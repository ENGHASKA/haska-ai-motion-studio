import {readFileSync} from 'node:fs';

/** Pure-JS code point coverage of a TrueType/OpenType file (cmap formats 4 and 12). Works on every OS, no fontconfig. */
export const readCmapRanges = (buffer: Buffer): Array<[number, number]> => {
  let base = 0;
  if (buffer.toString('latin1', 0, 4) === 'ttcf') base = buffer.readUInt32BE(12); // first face of a collection
  const tables = buffer.readUInt16BE(base + 4);
  let cmap = -1;
  for (let i = 0; i < tables; i++) {
    const entry = base + 12 + i * 16;
    if (buffer.toString('latin1', entry, entry + 4) === 'cmap') cmap = buffer.readUInt32BE(entry + 8);
  }
  if (cmap < 0) return [];
  const subtables = buffer.readUInt16BE(cmap + 2);
  const ranges: Array<[number, number]> = [];
  const seen = new Set<number>();
  for (let i = 0; i < subtables; i++) {
    const platform = buffer.readUInt16BE(cmap + 4 + i * 8);
    const encoding = buffer.readUInt16BE(cmap + 6 + i * 8);
    const offset = cmap + buffer.readUInt32BE(cmap + 8 + i * 8);
    if (seen.has(offset)) continue;
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    seen.add(offset);
    const format = buffer.readUInt16BE(offset);
    if (format === 4) {
      const segments = buffer.readUInt16BE(offset + 6) / 2;
      const endCodes = offset + 14;
      const startCodes = endCodes + segments * 2 + 2;
      const deltas = startCodes + segments * 2;
      const offsets = deltas + segments * 2;
      for (let s = 0; s < segments; s++) {
        const end = buffer.readUInt16BE(endCodes + s * 2);
        const start = buffer.readUInt16BE(startCodes + s * 2);
        if (start === 0xffff) continue;
        const rangeOffset = buffer.readUInt16BE(offsets + s * 2);
        if (rangeOffset === 0) {
          const delta = buffer.readUInt16BE(deltas + s * 2);
          for (let code = start; code <= end; code++) if (((code + delta) & 0xffff) !== 0) ranges.push([code, code]);
        } else {
          for (let code = start; code <= end; code++) {
            const at = offsets + s * 2 + rangeOffset + (code - start) * 2;
            if (at + 1 < buffer.length && buffer.readUInt16BE(at) !== 0) ranges.push([code, code]);
          }
        }
      }
    } else if (format === 12) {
      const groups = buffer.readUInt32BE(offset + 12);
      for (let g = 0; g < groups; g++) {
        const at = offset + 16 + g * 12;
        ranges.push([buffer.readUInt32BE(at), buffer.readUInt32BE(at + 4)]);
      }
    }
  }
  return ranges;
};

export const fileHasCodePoint = (file: string) => {
  const ranges = readCmapRanges(readFileSync(file));
  const set = new Set<number>();
  for (const [from, to] of ranges) for (let c = from; c <= to && c - from < 70000; c++) set.add(c);
  return (codePoint: number) => set.has(codePoint);
};
