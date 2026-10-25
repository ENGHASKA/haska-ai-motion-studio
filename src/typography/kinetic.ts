import {hasArabic, tokenizePhrases, tokenizeWords} from './script.ts';

export type KineticMode = 'word' | 'phrase' | 'line' | 'char';

export type KineticPlan = {
  /** Mode actually used; 'char' is downgraded to 'word' for Arabic. */
  mode: KineticMode;
  downgraded: boolean;
  units: string[];
  /** Start frame of each unit, relative to the plan's own start. */
  starts: number[];
};

/**
 * Splits text into animation units. Arabic is never split below the word, because
 * isolating letters removes the contextual joining forms and breaks shaping.
 */
export const planKinetic = (text: string, requested: KineticMode, staggerFrames: number): KineticPlan => {
  const arabic = hasArabic(text);
  const mode: KineticMode = requested === 'char' && arabic ? 'word' : requested;
  const units =
    mode === 'char' ? [...text].filter((char) => char !== ' ')
    : mode === 'word' ? tokenizeWords(text)
    : mode === 'phrase' ? tokenizePhrases(text)
    : [text.trim()];
  return {
    mode,
    downgraded: mode !== requested,
    units,
    starts: units.map((_, index) => Math.round(index * staggerFrames)),
  };
};

/** Progress 0..1 of one unit; a pure function of the frame. */
export const unitProgress = (frame: number, start: number, duration: number, easing: (t: number) => number) => {
  const t = Math.min(1, Math.max(0, (frame - start) / Math.max(1, duration)));
  return easing(t);
};

/** Total frames until the last unit has fully arrived. */
export const planDuration = (plan: KineticPlan, unitDuration: number) =>
  (plan.starts.length ? plan.starts[plan.starts.length - 1] : 0) + unitDuration;
