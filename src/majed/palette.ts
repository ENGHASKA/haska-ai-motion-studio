import type {StyleProfile} from '../production/style-profile';
import type {MovePalette} from './context';

const mix = (hex: string, target: number, amount: number) => {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(1 + offset, 3 + offset), 16);
    return Math.round(value + (target - value) * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
};

/** Maps a HASKA Style Profile onto the six colors the upstream moves read (bg, ink, acc, clay, hi, mut). */
export const movePaletteFor = (profile: StyleProfile): MovePalette => {
  const p = profile.palette;
  return {bg: p.background, ink: p.text, acc: p.accent, clay: mix(p.accent, 0, 0.28), hi: mix(p.accent, 255, 0.38), mut: p.mutedText};
};
