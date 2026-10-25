import {hasArabic, wordScript} from './script.ts';

export type MeasureFont = {family: string; weight: number; sizePx: number; tracking?: number};
export type TextMeasurer = (text: string, font: MeasureFont) => number;

const UPPER = /[A-Z]/;
const NARROW = /[ilI.,:;'|!()\[\]]/;
const DIGIT = /[0-9٠-٩]/;

/**
 * Conservative width estimate (errs wide) for environments without a DOM, such as unit tests and QA.
 * Letter spacing is ignored for Arabic because it would break letter joining and is never applied.
 */
export const estimateMeasurer: TextMeasurer = (text, font) => {
  const bold = font.weight >= 600 ? 1.06 : 1;
  let em = 0;
  for (const char of text) {
    if (char === ' ') em += 0.3;
    else if (hasArabic(char)) em += 0.56;
    else if (UPPER.test(char)) em += 0.7;
    else if (NARROW.test(char)) em += 0.3;
    else if (DIGIT.test(char)) em += 0.58;
    else em += 0.56;
  }
  const spacing = hasArabic(text) ? 0 : (font.tracking ?? 0) * [...text].length;
  return (em * bold + spacing) * font.sizePx;
};

/** Measures with the browser's own font engine when a canvas is available (Remotion Studio / render). */
export const canvasMeasurer = (): TextMeasurer | undefined => {
  if (typeof document === 'undefined') return undefined;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return undefined;
  return (text, font) => {
    context.font = `${font.weight} ${font.sizePx}px ${font.family}`;
    const spacing = hasArabic(text) ? 0 : (font.tracking ?? 0) * font.sizePx * [...text].length;
    return context.measureText(text).width + spacing;
  };
};

export const defaultMeasurer = (): TextMeasurer => canvasMeasurer() ?? estimateMeasurer;

export {wordScript};
