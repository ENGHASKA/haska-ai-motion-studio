/**
 * Cover / thumbnail layout rules (numbers adapted from the audited upstream thumbnail references, majedphotos/video-ad-editor, MIT).
 * Pure checks over a declared layout, so a still can be validated without rendering it.
 */
export type CoverKind = 'reel-cover' | 'youtube';

export type CoverBox = {role: 'title' | 'text' | 'logo' | 'line'; x: number; y: number; width: number; height: number; /** font size in px (text/title) */ size?: number};

export type CoverSpec = {kind: CoverKind; width: number; height: number};

export const COVER_SPECS: Record<CoverKind, CoverSpec> = {
  'reel-cover': {kind: 'reel-cover', width: 1080, height: 1920},
  youtube: {kind: 'youtube', width: 1280, height: 720},
};

/** Grid crop on the profile page is a centred 1080x1080 square; its vertical band in a 1080x1920 cover. */
export const REEL_SAFE_SQUARE = {x: 0, y: 420, width: 1080, height: 1080};
/** YouTube draws the duration badge bottom-right: keep this area empty. */
export const YOUTUBE_BADGE_ZONE = {width: 310, height: 145};

const MIN = {title: 170, text: 110, logo: 200, line: 10};
const inside = (box: CoverBox, area: {x: number; y: number; width: number; height: number}) =>
  box.x >= area.x && box.y >= area.y && box.x + box.width <= area.x + area.width && box.y + box.height <= area.y + area.height;
const overlaps = (a: CoverBox, b: {x: number; y: number; width: number; height: number}) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export type CoverIssue = {severity: 'error' | 'warning'; rule: string; message: string};

export const checkCover = (spec: CoverSpec, boxes: CoverBox[]): CoverIssue[] => {
  const issues: CoverIssue[] = [];
  const error = (rule: string, message: string) => issues.push({severity: 'error', rule, message});
  boxes.forEach((box, i) => {
    const label = `${box.role}#${i}`;
    if (box.role === 'title' && (box.size ?? 0) < MIN.title) error('title-size', `${label}: title must be at least ${MIN.title}px (is ${box.size ?? 'unset'})`);
    if (box.role === 'text' && (box.size ?? 0) < MIN.text) error('text-size', `${label}: text must be at least ${MIN.text}px (is ${box.size ?? 'unset'})`);
    if (box.role === 'logo' && Math.min(box.width, box.height) < MIN.logo) error('logo-size', `${label}: logo must be at least ${MIN.logo}px`);
    if (box.role === 'line' && Math.min(box.width, box.height) < MIN.line) error('line-weight', `${label}: lines must be at least ${MIN.line}px thick`);
    if (box.x < 0 || box.y < 0 || box.x + box.width > spec.width || box.y + box.height > spec.height) error('bounds', `${label}: leaves the canvas`);
    if (spec.kind === 'reel-cover' && box.role !== 'line' && !inside(box, REEL_SAFE_SQUARE)) error('safe-square', `${label}: outside the 1080x1080 grid-crop square (y ${REEL_SAFE_SQUARE.y}-${REEL_SAFE_SQUARE.y + REEL_SAFE_SQUARE.height})`);
    if (spec.kind === 'youtube' && overlaps(box, {x: spec.width - YOUTUBE_BADGE_ZONE.width, y: spec.height - YOUTUBE_BADGE_ZONE.height, ...YOUTUBE_BADGE_ZONE})) error('badge-zone', `${label}: covers the bottom-right duration badge area`);
  });
  if (!boxes.some((box) => box.role === 'title')) error('title-missing', 'a cover needs a title');
  return issues;
};
