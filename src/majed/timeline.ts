/** Edited-timeline helpers shared by TalkingHeadReel, the cut-plan tools (scripts/cutplan.py) and tests. Pure, frame-exact. */
export type KeepSpan = {start: number; end: number};

export type PlacedSpan = {from: number; durationInFrames: number; trimBefore: number};

/** Lay keep-spans (source seconds) back to back on the edited timeline, in frames. Never drops or doubles a frame. */
export const placeSpans = (keep: KeepSpan[], fps: number): PlacedSpan[] => {
  let cursor = 0;
  return keep
    .map((span) => ({trimBefore: Math.round(span.start * fps), length: Math.max(1, Math.round(span.end * fps) - Math.round(span.start * fps))}))
    .map(({trimBefore, length}) => {
      const placed = {from: cursor, durationInFrames: length, trimBefore};
      cursor += length;
      return placed;
    });
};

export const totalFrames = (keep: KeepSpan[], fps: number) => placeSpans(keep, fps).reduce((sum, span) => sum + span.durationInFrames, 0);

/** Source time (s) -> edited frame, or undefined when it falls inside a removed span. */
export const sourceToEditedFrame = (keep: KeepSpan[], fps: number, seconds: number): number | undefined => {
  const placed = placeSpans(keep, fps);
  const frame = Math.round(seconds * fps);
  const hit = placed.find((span) => frame >= span.trimBefore && frame < span.trimBefore + span.durationInFrames);
  return hit ? hit.from + (frame - hit.trimBefore) : undefined;
};
