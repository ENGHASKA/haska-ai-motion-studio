// Text layout rules for the built-in shot components. The renderer and the QA checks both read this,
// so QA measures the same boxes the video actually uses.
import type {SafeBox} from '../motion/style.ts';
import type {TextRole} from '../motion/style.ts';
import type {Shot} from './shot-graph.ts';
import {REEL_SCENES, routeName} from './routing.ts';

export type TextBlock = {
  key: string;
  text: string;
  role: TextRole;
  fontSize: number;
  minFontSize: number;
  maxLines: number;
  rect: {left: number; top: number; width: number; height: number};
  /** False for blocks drawn by fixed-size CSS scenes that do not shrink to fit. */
  fitted: boolean;
};

const option = (shot: Shot, key: string) => {
  const value = shot.engineOptions?.[key];
  return typeof value === 'string' ? value : undefined;
};

const shotText = (shot: Shot) => shot.onScreenText ?? shot.title ?? '';

export const titleBlocks = (shot: Shot, box: SafeBox, titleScale: number): TextBlock[] => {
  const blocks: TextBlock[] = [];
  const eyebrow = option(shot, 'eyebrow');
  const subtitle = option(shot, 'subtitle');
  const rect = (share: number, offset: number) => ({left: box.left, top: box.top + box.height * offset, width: box.width, height: box.height * share});
  if (eyebrow) blocks.push({key: 'eyebrow', text: eyebrow.toUpperCase(), role: 'mono', fontSize: 30 * titleScale, minFontSize: 18, maxLines: 1, rect: {...rect(0.1, 0.1), height: 64 * titleScale}, fitted: true});
  blocks.push({key: 'headline', text: shotText(shot), role: 'display', fontSize: 120 * titleScale, minFontSize: 36, maxLines: 3, rect: rect(0.6, 0.2), fitted: true});
  if (subtitle) blocks.push({key: 'subtitle', text: subtitle, role: 'body', fontSize: 44 * titleScale, minFontSize: 22, maxLines: 3, rect: rect(0.25, 0.7), fitted: true});
  return blocks;
};

export const networkBlocks = (shot: Shot, box: SafeBox): TextBlock[] => [
  {key: 'caption', text: shotText(shot), role: 'display', fontSize: 84, minFontSize: 28, maxLines: 2, rect: {left: box.left, top: box.top + box.height * 0.64, width: box.width, height: box.height * 0.34}, fitted: true},
];

/** SemanticScene is CSS-sized (92px landscape / 82px vertical) inside fixed padding; it does not auto-fit. */
export const semanticBlocks = (shot: Shot, canvas: {width: number; height: number}, platformId?: string): TextBlock[] => {
  const vertical = canvas.height > canvas.width;
  // Must match audio-motion.css: TikTok reserves extra room on the right for its action buttons.
  const inset = platformId === 'tiktok' ? 120 : 74;
  const rect = vertical
    ? {left: inset, top: canvas.height / 2, width: canvas.width - inset * 2, height: canvas.height / 2 - 390}
    : {left: 130, top: 110, width: (canvas.width - 260) * 0.52, height: canvas.height - 300};
  return [{key: 'headline', text: shotText(shot), role: 'display', fontSize: vertical ? 82 : 92, minFontSize: vertical ? 82 : 92, maxLines: 3, rect, fitted: false}];
};

export const blocksForShot = (shot: Shot, box: SafeBox, titleScale: number, canvas: {width: number; height: number}, platformId?: string): TextBlock[] => {
  const route = routeName(shot);
  if (route.name === 'title') return titleBlocks(shot, box, titleScale);
  if (route.name === 'network') return networkBlocks(shot, box);
  if (route.name === 'semantic') return semanticBlocks(shot, canvas, platformId);
  if (isReelScene(route.name)) return reelBlocks(shot);
  return [];
};

// ---------------------------------------------------------------------------
// Reel scenes (fixed 1080x1920 canvas). Components and QA read the same specs,
// so what QA measures is what the scene renders. Captions occupy y > ~1340.
// ---------------------------------------------------------------------------
export type Rect = {left: number; top: number; width: number; height: number};
export type ReelSpec = {key: string; source: string; role: TextRole; fontSize: number; minFontSize: number; maxLines: number; rect: Rect};

const R = (left: number, top: number, width: number, height: number): Rect => ({left, top, width, height});
const spec = (key: string, source: string, role: TextRole, fontSize: number, minFontSize: number, maxLines: number, rect: Rect): ReelSpec => ({key, source, role, fontSize, minFontSize, maxLines, rect});
const HEAD = R(100, 230, 880, 170);

export const REEL_TEXT: Record<string, ReelSpec[]> = {
  'reel-intro': [
    spec('hello', 'option:hello', 'display', 200, 90, 1, R(90, 600, 900, 300)),
    spec('eyebrow', 'option:eyebrow', 'body', 44, 28, 1, R(100, 305, 880, 60)),
    spec('name', 'onScreenText', 'display', 132, 60, 3, R(100, 375, 880, 340)),
    spec('role', 'option:role', 'display', 60, 36, 1, R(100, 775, 880, 90)),
    spec('place', 'option:place', 'body', 50, 30, 1, R(100, 880, 880, 80)),
    spec('badge', 'option:badge', 'display', 60, 36, 1, R(100, 1135, 880, 90)),
  ],
  'reel-neural': [spec('head', 'onScreenText', 'display', 84, 44, 2, R(100, 290, 880, 150)), spec('curve', 'option:curve', 'display', 52, 30, 1, R(100, 1190, 880, 70))],
  'reel-team': [spec('head', 'onScreenText', 'display', 92, 44, 2, R(100, 290, 880, 150)), spec('designers', 'option:designers', 'body', 48, 28, 1, R(90, 940, 430, 80)), spec('devs', 'option:devs', 'body', 48, 28, 1, R(560, 940, 430, 80))],
  'reel-cyber3d': [spec('head', 'onScreenText', 'display', 112, 56, 1, R(100, 290, 880, 130))],
  'reel-spread': [spec('head', 'onScreenText', 'display', 92, 44, 2, R(100, 290, 880, 150))],
  'reel-question': [spec('head', 'onScreenText', 'display', 104, 48, 2, R(100, 290, 880, 250))],
  'reel-human': [spec('head', 'onScreenText', 'display', 96, 44, 2, R(100, 290, 880, 150)), spec('ok', 'option:ok', 'display', 56, 36, 1, R(100, 1205, 880, 70))],
  'reel-glitch': [spec('head', 'onScreenText', 'display', 112, 56, 1, R(100, 290, 880, 150)), spec('sub', 'option:sub', 'body', 52, 30, 1, R(100, 1195, 880, 70))],
  'reel-finale': [spec('end', 'onScreenText', 'display', 104, 50, 2, R(100, 520, 880, 300)), spec('stamp', 'option:stamp', 'display', 72, 40, 2, R(140, 580, 800, 240)), spec('job', 'option:job', 'display', 46, 28, 1, R(560, 990, 320, 70))],
};

const textFor = (shot: Shot, source: string): string => {
  if (source === 'onScreenText') return shot.onScreenText ?? shot.title ?? '';
  const value = shot.engineOptions?.[source.slice('option:'.length)];
  return typeof value === 'string' ? value : '';
};

/** Text blocks of a reel scene that actually have text in this shot. */
export const reelBlocks = (shot: Shot): TextBlock[] =>
  (REEL_TEXT[shot.composition ?? ''] ?? [])
    .map((entry) => ({key: entry.key, text: textFor(shot, entry.source), role: entry.role, fontSize: entry.fontSize, minFontSize: entry.minFontSize, maxLines: entry.maxLines, rect: entry.rect, fitted: true}))
    .filter((block) => block.text);

export const reelBlock = (shot: Shot, key: string): TextBlock | undefined => reelBlocks(shot).find((block) => block.key === key);

export const isReelScene = (name: string | undefined) => Boolean(name && (REEL_SCENES as readonly string[]).includes(name));
