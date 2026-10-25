// Resolves a StyleProfile into concrete render values. Pure: no React runtime, no DOM.
import type {CSSProperties} from 'react';
import type {CubicBezier, FontRef, PlatformId, PlatformParams, StyleProfile} from '../production/style-profile.ts';
import {platformParams} from '../production/style-profile.ts';
import type {Script} from '../typography/script.ts';

/** Solves a CSS-style cubic-bezier for y at progress x. */
export const cubicBezier = ([x1, y1, x2, y2]: CubicBezier) => (x: number): number => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const sample = (t: number, a: number, b: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  const slope = (t: number, a: number, b: number) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t ** 2;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const error = sample(t, x1, x2) - x;
    const derivative = slope(t, x1, x2);
    if (Math.abs(error) < 1e-6 || Math.abs(derivative) < 1e-6) break;
    t -= error / derivative;
  }
  // Newton can leave [0,1] on flat curves; bisect as a safe fallback.
  if (t < 0 || t > 1 || Math.abs(sample(t, x1, x2) - x) > 1e-4) {
    let low = 0;
    let high = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      if (sample(t, x1, x2) < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }
  }
  return sample(t, y1, y2);
};

export const easingOf = (profile: StyleProfile, name: string): ((t: number) => number) => {
  const curve = profile.motion.easings[name] ?? profile.motion.easings.standard;
  return cubicBezier(curve);
};

export type DurationName = keyof StyleProfile['motion']['durationsMs'];

export const durationFrames = (profile: StyleProfile, name: DurationName, fps: number) =>
  Math.max(1, Math.round((profile.motion.durationsMs[name] * fps) / 1000));

const quote = (family: string) => (/^[\w-]+$/.test(family) || family === 'sans-serif' || family === 'serif' || family === 'monospace' ? family : `"${family}"`);
export const fontStack = (font: FontRef) => [font.family, ...font.fallbacks].map(quote).join(', ');

export type TextRole = 'display' | 'body' | 'mono';

/** Font family stack for a role and script; Arabic uses the profile's Arabic font when it has one. */
export const familyFor = (profile: StyleProfile, role: TextRole, script: Script) => {
  const arabic = profile.typography.arabic;
  if (script === 'arabic' && arabic) return fontStack(arabic);
  return fontStack(profile.typography[role] ?? profile.typography.body);
};

export const weightFor = (profile: StyleProfile, role: TextRole, script: Script) =>
  script === 'arabic' && profile.typography.arabic ? profile.typography.arabic.weight : (profile.typography[role] ?? profile.typography.body).weight;

/** Letter spacing in em. Always 0 for Arabic: spacing would pull apart joined letters. */
export const trackingFor = (profile: StyleProfile, role: TextRole, script: Script) =>
  script === 'arabic' ? 0 : ((profile.typography[role] ?? profile.typography.body).tracking ?? 0);

export const textStyle = (profile: StyleProfile, role: TextRole, script: Script, sizePx: number): CSSProperties => ({
  fontFamily: familyFor(profile, role, script),
  fontWeight: weightFor(profile, role, script),
  letterSpacing: `${trackingFor(profile, role, script)}em`,
  fontSize: sizePx,
  fontKerning: 'normal',
  fontFeatureSettings: script === 'arabic' ? '"calt" 1, "liga" 1, "rlig" 1' : undefined,
});

/** CSS custom properties for stylesheets (e.g. audio-motion.css) that cannot read the profile directly. */
export const paletteVariables = (profile: StyleProfile): Record<string, string> => {
  const p = profile.palette;
  return {
    '--hk-background': p.background,
    '--hk-surface': p.surface,
    '--hk-primary': p.primary,
    '--hk-accent': p.accent,
    '--hk-text': p.text,
    '--hk-muted': p.mutedText,
    '--hk-display-font': fontStack(profile.typography.display),
    '--hk-arabic-font': fontStack(profile.typography.arabic ?? profile.typography.body),
    '--hk-mono-font': fontStack(profile.typography.mono ?? profile.typography.body),
  };
};

export const platformForSize = (width: number, height: number): PlatformId =>
  width === height ? 'square' : height > width ? 'reel' : 'youtube';

export type SafeBox = {left: number; top: number; width: number; height: number};

/** The rectangle text may occupy: the canvas minus the platform's safe-area insets. */
export const safeBox = (platform: PlatformParams, width = platform.width, height = platform.height): SafeBox => {
  const {top, right, bottom, left} = platform.safeArea;
  return {left, top, width: Math.max(1, width - left - right), height: Math.max(1, height - top - bottom)};
};

export const resolvePlatform = (profile: StyleProfile, id: PlatformId, width?: number, height?: number): PlatformParams => {
  const params = platformParams(profile, id);
  return {...params, width: width ?? params.width, height: height ?? params.height};
};

/** #rrggbb + alpha 0..1 -> #rrggbbaa. */
export const withAlpha = (hex: string, alpha: number) =>
  `${hex.slice(0, 7)}${Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0')}`;
