/** Beat-synchronised montage planning. Pure and deterministic: the same beats and clips always give the same edit. */
export type MontageClip = {src: string; /** seconds available in the source file */ available: number; startFrom?: number};
export type MontageCut = {index: number; src: string; from: number; durationInFrames: number; trimBefore: number; /** frame of the beat the cut lands on */ beatFrame: number};

export type MontageOptions = {
  fps: number;
  /** Beat times in seconds (scripts/media_tools.py beats). */
  beats: number[];
  /** Cut every N beats (1 = fastest). */
  everyBeats?: number;
  durationInFrames: number;
};

/** Cuts land exactly on beat frames; clips rotate round-robin and each cut continues where that clip stopped. */
export const planMontage = (clips: MontageClip[], {fps, beats, everyBeats = 2, durationInFrames}: MontageOptions): MontageCut[] => {
  if (!clips.length) throw new Error('planMontage needs at least one clip');
  const marks = beats.filter((_, i) => i % Math.max(1, everyBeats) === 0).map((t) => Math.round(t * fps)).filter((f) => f > 0 && f < durationInFrames);
  const edges = [0, ...marks, durationInFrames];
  const used = clips.map((clip) => Math.round((clip.startFrom ?? 0) * fps));
  const cuts: MontageCut[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const length = edges[i + 1] - edges[i];
    if (length <= 0) continue;
    const slot = i % clips.length;
    const limit = Math.floor(clips[slot].available * fps);
    let trimBefore = used[slot];
    if (trimBefore + length > limit) trimBefore = Math.max(0, limit - length); // wrap back inside the source rather than run past its end
    cuts.push({index: i, src: clips[slot].src, from: edges[i], durationInFrames: length, trimBefore, beatFrame: edges[i]});
    used[slot] = trimBefore + length;
  }
  return cuts;
};

/** 0..1 pulse that peaks on each beat and decays: drives the punch-in / flash on a cut. */
export const beatEnvelope = (frame: number, beatFrames: number[], decayFrames: number): number => {
  let last = -Infinity;
  for (const beat of beatFrames) if (beat <= frame) last = beat;
  return last === -Infinity ? 0 : Math.max(0, 1 - (frame - last) / Math.max(1, decayFrames)) ** 2;
};
