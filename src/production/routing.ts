// Engine routing, shared by the Remotion renderer and the QA checks (which cannot import React).
import type {Shot} from './shot-graph.ts';

export const REEL_SCENES = ['reel-intro', 'reel-neural', 'reel-team', 'reel-cyber3d', 'reel-spread', 'reel-question', 'reel-human', 'reel-glitch', 'reel-finale'] as const;

export const BUILTIN_SHOT_COMPONENTS = ['title', 'network', 'semantic', 'CybersecurityIntro', 'CyberGrid3D', ...REEL_SCENES] as const;
export type BuiltinShotComponent = (typeof BUILTIN_SHOT_COMPONENTS)[number];

/** Built-ins that follow the master timeline themselves (shot-local frame 0 is timeline frame 0). */
export const TIME_ALIGNED: readonly string[] = ['CybersecurityIntro', 'CyberGrid3D'];

export type RouteName = BuiltinShotComponent | 'blender';
export type RouteResult = {name: RouteName; error?: undefined} | {name?: undefined; error: string};

/**
 * blender -> BlenderShot; a named composition -> that component; visualKind -> semantic (legacy Audio-to-Motion
 * scene); otherwise any text -> title. `extra` lists project-registered component names.
 */
export const routeName = (shot: Shot, extra: readonly string[] = []): RouteResult => {
  if (shot.engine === 'blender') return {name: 'blender'};
  if (shot.composition) {
    if ((BUILTIN_SHOT_COMPONENTS as readonly string[]).includes(shot.composition)) return {name: shot.composition as BuiltinShotComponent};
    if (extra.includes(shot.composition)) return {name: shot.composition as BuiltinShotComponent};
    return {error: `No shot component named "${shot.composition}". Known: ${[...BUILTIN_SHOT_COMPONENTS, ...extra].join(', ')}.`};
  }
  if (shot.engine === 'three') return {error: 'A three.js shot must name a registered composition (for example "CyberGrid3D").'};
  if (shot.visualKind) return {name: 'semantic'};
  if (shot.onScreenText || shot.title) return {name: 'title'};
  return {error: 'Shot has no composition, visualKind, or text to render.'};
};

export const isTimeAlignedName = (shot: Shot) => Boolean(shot.composition && TIME_ALIGNED.includes(shot.composition));
