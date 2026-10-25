import {estimateMeasurer} from './measure.ts';
import type {TextMeasurer} from './measure.ts';
import {tokenizeWords, wordScript} from './script.ts';

export type FitFonts = {
  /** Family stack for Latin text. */
  latin: string;
  /** Family stack for Arabic text. */
  arabic: string;
  weight: number;
  tracking?: number;
};

export type FitInput = {
  text: string;
  maxWidth: number;
  maxHeight: number;
  maxLines?: number;
  /** Preferred (largest) size in px. */
  fontSize: number;
  minFontSize: number;
  /** Line height as a multiple of font size. */
  lineHeight: number;
  fonts: FitFonts;
  measure?: TextMeasurer;
};

export type FitResult = {
  fontSize: number;
  lines: string[];
  width: number;
  height: number;
  /** False when even the minimum size overflows; callers must not rely on the layout. */
  fits: boolean;
  /** True when the preferred size had to be reduced. */
  shrunk: boolean;
};

const wrap = (words: string[], limit: number, widthOf: (text: string) => number, spaceWidth: number) => {
  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;
  let widest = 0;
  let wordTooWide = false;
  for (const word of words) {
    const width = widthOf(word);
    if (width > limit) wordTooWide = true;
    if (current && currentWidth + spaceWidth + width > limit) {
      lines.push(current);
      widest = Math.max(widest, currentWidth);
      current = word;
      currentWidth = width;
    } else {
      current = current ? `${current} ${word}` : word;
      currentWidth = current === word ? width : currentWidth + spaceWidth + width;
    }
  }
  if (current) {
    lines.push(current);
    widest = Math.max(widest, currentWidth);
  }
  return {lines, widest, wordTooWide};
};

/** Largest font size (down to minFontSize) at which the text fits the box without overflow. */
export const fitText = (input: FitInput): FitResult => {
  const measure = input.measure ?? estimateMeasurer;
  const words = tokenizeWords(input.text);
  const maxLines = input.maxLines ?? Number.POSITIVE_INFINITY;

  const attempt = (fontSize: number): FitResult & {ok: boolean} => {
    const widthOf = (text: string) =>
      measure(text, {
        family: wordScript(text) === 'arabic' ? input.fonts.arabic : input.fonts.latin,
        weight: input.fonts.weight,
        sizePx: fontSize,
        tracking: input.fonts.tracking,
      });
    // Words are laid out with a fixed 0.3em gap (see KineticText / CaptionOverlay), independent of letter spacing.
    const {lines, widest, wordTooWide} = wrap(words, input.maxWidth, widthOf, fontSize * 0.3);
    const height = lines.length * fontSize * input.lineHeight;
    const ok = !wordTooWide && lines.length <= maxLines && height <= input.maxHeight && widest <= input.maxWidth + 0.5;
    return {fontSize, lines, width: widest, height, fits: ok, shrunk: fontSize < input.fontSize, ok};
  };

  let size = input.fontSize;
  let result = attempt(size);
  while (!result.ok && size > input.minFontSize) {
    size = Math.max(input.minFontSize, Math.floor(size * 0.96));
    result = attempt(size);
  }
  const {ok: _ok, ...fit} = result;
  return fit;
};
