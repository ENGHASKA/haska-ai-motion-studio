import {execFileSync} from 'node:child_process';
import {fileHasCodePoint} from './ttf.ts';

/** Coverage test for an installed font family via fontconfig (Linux/macOS; undefined elsewhere). Node only; used by QA, never by renders. */
export type Coverage = {family: string; has: (codePoint: number) => boolean};

export const parseCharset = (charset: string): Array<[number, number]> =>
  charset
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const [from, to] = part.split('-');
      const start = parseInt(from, 16);
      return [start, to ? parseInt(to, 16) : start] as [number, number];
    });

export const fontCoverage = (family: string, weight = 400): Coverage | undefined => {
  let output = '';
  try {
    // fc-match picks the face the browser would pick for this weight. It substitutes a default font when the
    // family is missing, so the returned family name must be checked against the one requested.
    output = execFileSync('fc-match', ['-f', '%{family}|%{charset}\n', `${family}:weight=${weight >= 600 ? 'bold' : 'regular'}`], {encoding: 'utf8', timeout: 10000});
  } catch {
    return undefined;
  }
  const [families, charset] = output.split('\n')[0].split('|');
  const installed = (families ?? '').split(',').some((name) => name.trim().toLowerCase() === family.toLowerCase());
  if (!installed || !charset) return undefined;
  const ranges = parseCharset(charset);
  return {family, has: (codePoint) => ranges.some(([from, to]) => codePoint >= from && codePoint <= to)};
};

/** Code points in `text` the font cannot draw (ignores whitespace and bidi controls). */
export const missingGlyphs = (text: string, coverage: Coverage): string[] => {
  const missing = new Set<string>();
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    if (/\s/u.test(char) || (codePoint >= 0x200e && codePoint <= 0x200f) || (codePoint >= 0x2066 && codePoint <= 0x2069)) continue;
    if (!coverage.has(codePoint)) missing.add(char);
  }
  return [...missing];
};

/** Coverage of a font file that is not installed system-wide (e.g. public/fonts/*.ttf). Pure TypeScript: no fontconfig, so it works on Windows too. */
export const fontFileCoverage = (family: string, file: string): Coverage | undefined => {
  try {
    return {family, has: fileHasCodePoint(file)};
  } catch {
    return undefined;
  }
};
