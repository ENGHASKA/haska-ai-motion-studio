// Script/direction utilities for Arabic + Latin text. Pure functions, no DOM.

export type Script = 'arabic' | 'latin' | 'other';
export type Direction = 'rtl' | 'ltr';

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-zÀ-ɏ]/;
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_INDIC = '۰۱۲۳۴۵۶۷۸۹';
// Unicode bidi isolates: First-Strong Isolate / Pop Directional Isolate.
const FSI = '⁨';
const PDI = '⁩';

export const hasArabic = (text: string) => ARABIC.test(text);

/** Script of a single letter; digits, spaces and punctuation are neutral and return undefined. */
export const letterScript = (char: string): Script | undefined => {
  // Letters and combining marks only: Arabic punctuation and digits are neutral.
  if (ARABIC.test(char)) return /[\p{L}\p{M}]/u.test(char) ? 'arabic' : undefined;
  if (LATIN.test(char)) return 'latin';
  if (/[\p{L}]/u.test(char)) return 'other';
  return undefined;
};

/** Paragraph direction by the first strong letter (Unicode bidi rule P2), like a browser with dir="auto". */
export const detectDirection = (text: string, fallback: Direction = 'ltr'): Direction => {
  for (const char of text) {
    const script = letterScript(char);
    if (script === 'arabic') return 'rtl';
    if (script) return 'ltr';
  }
  return fallback;
};

const RTL_LANGUAGES = ['ar', 'fa', 'ur', 'he', 'ps', 'ckb'];
export const isRtlLanguage = (language?: string) => Boolean(language && RTL_LANGUAGES.includes(language.toLowerCase().split('-')[0]));

/**
 * Paragraph direction for display text. The language of the video wins for any text that contains Arabic
 * letters, so "LABAK: منصة التعلم" in an Arabic video stays right-to-left even though it starts with Latin.
 * Pure Latin text stays LTR. Without a language, the majority script decides, then the first strong letter.
 */
export const textDirection = (text: string, language?: string): Direction => {
  let arabic = 0;
  let latin = 0;
  for (const char of text) {
    const script = letterScript(char);
    if (script === 'arabic') arabic += 1;
    else if (script) latin += 1;
  }
  if (arabic === 0) return 'ltr';
  if (isRtlLanguage(language) || arabic >= latin) return 'rtl';
  return detectDirection(text);
};

/** Dominant script of a word. Words with only neutral characters count as "other". */
export const wordScript = (word: string): Script => {
  let arabic = 0;
  let latin = 0;
  for (const char of word) {
    const script = letterScript(char);
    if (script === 'arabic') arabic += 1;
    else if (script === 'latin') latin += 1;
  }
  if (arabic === 0 && latin === 0) return 'other';
  return arabic >= latin ? 'arabic' : 'latin';
};

/** Whitespace tokens. Words are never split, so Arabic letters keep their joining context. */
export const tokenizeWords = (text: string): string[] => text.split(/\s+/u).filter(Boolean);

const PHRASE_BREAK = /(?<=[.!?؟،,;؛:—–])\s+/u;

/** Splits at sentence/clause punctuation, keeping the punctuation with its phrase. */
export const tokenizePhrases = (text: string): string[] => text.split(PHRASE_BREAK).map((part) => part.trim()).filter(Boolean);

export type DigitStyle = 'keep' | 'western' | 'arabic-indic';

export const normalizeDigits = (text: string, style: DigitStyle): string => {
  if (style === 'keep') return text;
  const toWestern = (char: string) => {
    const index = ARABIC_INDIC.indexOf(char);
    return index >= 0 ? String(index) : String(EXTENDED_INDIC.indexOf(char));
  };
  if (style === 'western') return text.replace(/[٠-٩۰-۹]/g, toWestern);
  return text.replace(/[0-9]/g, (digit) => ARABIC_INDIC[Number(digit)]);
};

/**
 * Latin punctuation that directly follows an Arabic letter becomes its Arabic form
 * (, ? ; -> ، ؟ ؛). Periods and colons are shared between the scripts and stay as-is.
 */
export const localizePunctuation = (text: string): string =>
  text.replace(/(?<=[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿])([,?;])/gu, (mark) => ({',': '،', '?': '؟', ';': '؛'})[mark] ?? mark);

export type Run = {text: string; script: 'arabic' | 'latin' | 'neutral'};

/** Splits text into maximal Arabic / Latin runs; neutral characters join the run before them. */
export const splitScriptRuns = (text: string): Run[] => {
  const runs: Run[] = [];
  for (const char of text) {
    const script = letterScript(char);
    const kind: Run['script'] = script === 'arabic' ? 'arabic' : script ? 'latin' : 'neutral';
    const last = runs[runs.length - 1];
    if (last && (kind === 'neutral' || last.script === 'neutral' || last.script === kind)) {
      last.text += char;
      if (last.script === 'neutral' && kind !== 'neutral') last.script = kind;
    } else {
      runs.push({text: char, script: kind});
    }
  }
  return runs;
};

/**
 * Wraps each Latin run in an Arabic paragraph (or each Arabic run in a Latin one) in bidi isolates,
 * so neighbouring punctuation and digits cannot be pulled into the embedded run.
 */
export const isolateForeignRuns = (text: string, base: Direction): string => {
  const foreign = base === 'rtl' ? 'latin' : 'arabic';
  return splitScriptRuns(text)
    .map((run) => {
      if (run.script !== foreign) return run.text;
      // Leading/trailing spaces and punctuation stay outside the isolate so they take the paragraph direction:
      // a sentence-final period after "Python" belongs at the end of the RTL line, not glued to the word.
      const match = run.text.match(/^([\s('"“‘[{]*)(.*?)([\s.,;:!?،؟؛'"”’)\]}…-]*)$/su);
      if (!match || !match[2]) return run.text;
      return `${match[1]}${FSI}${match[2]}${PDI}${match[3]}`;
    })
    .join('');
};

/** Removes the invisible isolate characters again, e.g. before glyph-coverage checks. */
export const stripBidiControls = (text: string) => text.replace(/[⁦-⁩‎‏‪-‮]/g, '');
