// Transition math and timeline planning. Pure functions of frame numbers.
import type {CSSProperties} from 'react';
import type {Shot, ShotGraph, ShotTransition} from '../production/shot-graph.ts';
import type {TransitionType} from '../production/style-profile.ts';

export type TransitionStyles = {outgoing: CSSProperties; incoming: CSSProperties};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Styles for the outgoing and incoming shot at eased progress `p` (0 = old shot only, 1 = new shot only). */
export const transitionStyles = (type: TransitionType, rawProgress: number): TransitionStyles => {
  const p = clamp01(rawProgress);
  switch (type) {
    case 'cut':
      return {outgoing: {}, incoming: {}};
    case 'crossfade':
    case 'match-cut':
      return {outgoing: {}, incoming: {opacity: p}};
    case 'push':
      return {
        outgoing: {transform: `translateX(${-p * 30}%)`},
        incoming: {transform: `translateX(${(1 - p) * 100}%)`},
      };
    case 'wipe':
      return {outgoing: {}, incoming: {clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`}};
    case 'camera-pull':
      return {
        outgoing: {transform: `scale(${1 + 0.18 * p})`, opacity: 1 - p},
        incoming: {transform: `scale(${1.18 - 0.18 * p})`, opacity: p},
      };
    case 'zoom-through':
      return {
        outgoing: {transform: `scale(${1 + 1.2 * p * p})`, opacity: 1 - p},
        incoming: {transform: `scale(${0.8 + 0.2 * p})`, opacity: p},
      };
  }
};

export type PlannedShot = {
  shot: Shot;
  from: number;
  /** Frames the shot is mounted: own duration plus the tail the next shot's transition needs. */
  mountFrames: number;
  /** Transition into this shot (undefined = cut). */
  transitionIn?: ShotTransition & {easing: string};
  /** Transition out of this shot, expressed relative to this shot's own start frame. */
  transitionOut?: {type: TransitionType; startLocal: number; durationFrames: number; easing: string};
  layer: number;
};

export type PlanOptions = {
  /** Shots whose component follows the master timeline itself; transitions between two of them are skipped. */
  isTimeAligned?: (shot: Shot) => boolean;
  defaultEasing?: string;
};

/**
 * Turns shots into mount windows. The incoming shot starts at its own startFrame and the outgoing
 * shot stays mounted for the transition's duration (its animation simply keeps running).
 */
export const planTimeline = (graph: ShotGraph, options: PlanOptions = {}): PlannedShot[] => {
  const easing = options.defaultEasing ?? 'standard';
  const planned: PlannedShot[] = graph.shots.map((shot) => ({shot, from: shot.startFrame, mountFrames: shot.durationFrames, layer: shot.track}));
  const byTrack = new Map<number, PlannedShot[]>();
  for (const item of planned) byTrack.set(item.shot.track, [...(byTrack.get(item.shot.track) ?? []), item]);

  for (const items of byTrack.values()) {
    items.sort((a, b) => a.from - b.from);
    items.forEach((item, index) => {
      const previous = items[index - 1];
      const spec = item.shot.transitionIn;
      if (!previous || !spec || spec.type === 'cut' || spec.durationFrames <= 0) return;
      const sameAligned =
        options.isTimeAligned?.(previous.shot) && options.isTimeAligned?.(item.shot) && previous.shot.composition === item.shot.composition;
      if (sameAligned) return;
      const durationFrames = Math.min(spec.durationFrames, previous.shot.durationFrames, item.shot.durationFrames);
      const resolvedEasing = spec.easing ?? easing;
      item.transitionIn = {type: spec.type, durationFrames, easing: resolvedEasing};
      previous.mountFrames = Math.max(previous.mountFrames, previous.shot.durationFrames + durationFrames);
      previous.transitionOut = {type: spec.type, startLocal: item.from - previous.from, durationFrames, easing: resolvedEasing};
    });
  }
  return planned.sort((a, b) => a.layer - b.layer || a.from - b.from);
};

/** Raw 0..1 progress of a transition window at a local frame. */
export const windowProgress = (localFrame: number, start: number, duration: number) => clamp01((localFrame - start) / Math.max(1, duration));
