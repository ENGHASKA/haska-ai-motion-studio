import type {Storyboard, StoryboardScene, VisualKind} from '../audio/types.ts';
import {APPROVAL_STATES} from './approval.ts';
import type {ApprovalState} from './approval.ts';
import type {AssetIndex} from './asset-catalog.ts';
import {TRANSITION_TYPES} from './style-profile.ts';
import {durationFramesFor, frameToMs, msToFrame} from './timing.ts';
import type {StyleRegistry, TransitionType} from './style-profile.ts';
import {
  ID_PATTERN,
  checkEnum,
  checkNumber,
  checkObject,
  checkSchemaVersion,
  checkString,
  checkTimestamp,
  finish,
  isRecord,
} from './validation.ts';
import type {Issue, Validated} from './validation.ts';

export const ENGINES = ['remotion', 'three', 'blender'] as const;
export type Engine = (typeof ENGINES)[number];

// Must match schemas/storyboard.schema.json and src/audio/types.ts (covered by a test).
export const VISUAL_KINDS = ['editorial', 'network', 'signal', 'shield', 'process', 'reciprocity', 'metric'] as const satisfies readonly VisualKind[];

export type ShotTransition = {
  type: TransitionType;
  /** Frames the transition overlaps the previous shot on the same track; 0 for a cut. */
  durationFrames: number;
  /** Key into the style profile's motion.easings. */
  easing?: string;
};

export type Shot = {
  id: string;
  title?: string;
  /** Shots on the same track may not overlap; use higher tracks for overlays. */
  track: number;
  /** Half-open interval [startFrame, startFrame + durationFrames). */
  startFrame: number;
  durationFrames: number;
  /** Semantic description: what the viewer sees and why it fits the content. */
  description: string;
  narration?: string;
  onScreenText?: string;
  engine: Engine;
  /** Remotion composition id when engine is "remotion". */
  composition?: string;
  /** Existing visualKind vocabulary from Audio-to-Motion storyboards. */
  visualKind?: VisualKind;
  animation?: string;
  assets: Array<{assetId: string; role: string}>;
  transitionIn?: ShotTransition;
  styleProfileId?: string;
  approval: ApprovalState;
  /** Engine-specific settings, passed through uninterpreted. */
  engineOptions?: Record<string, unknown>;
  /** Original v1 scene values kept so conversion back is lossless. */
  legacy?: {
    startMs: number;
    endMs: number;
    semanticRationale: string;
    visualAssetRequirements: string[];
    status: StoryboardScene['status'];
  };
};

export type ShotGraph = {
  schemaVersion: 2;
  id: string;
  title: string;
  language?: string;
  fps: number;
  width: number;
  height: number;
  durationFrames: number;
  styleProfileId?: string;
  /** Content revision, starting at 1. */
  version: number;
  createdAt: string;
  updatedAt: string;
  source?: {kind: 'storyboard-v1'; durationMs: number};
  /** Audio assets (narration, music) placed on the master timeline. */
  audio?: Array<{assetId: string; startFrame: number; volume: number}>;
  shots: Shot[];
};

const GRAPH_KEYS = ['schemaVersion', 'id', 'title', 'language', 'fps', 'width', 'height', 'durationFrames', 'styleProfileId', 'version', 'createdAt', 'updatedAt', 'source', 'audio', 'shots'];
const SHOT_KEYS = ['id', 'title', 'track', 'startFrame', 'durationFrames', 'description', 'narration', 'onScreenText', 'engine', 'composition', 'visualKind', 'animation', 'assets', 'transitionIn', 'styleProfileId', 'approval', 'engineOptions', 'legacy'];

/**
 * The part of a graph that reviewers approve. Approval flags, version counters and timestamps are
 * excluded, so marking a shot approved (or bumping the version) never invalidates the document approval,
 * while any change to timing, text, assets, engines, or transitions does.
 */
export const reviewableContent = (graph: ShotGraph) => {
  const {version: _version, createdAt: _created, updatedAt: _updated, ...rest} = graph;
  return {...rest, shots: graph.shots.map(({approval: _approval, ...shot}) => shot)};
};

export const shotEndFrame = (shot: Pick<Shot, 'startFrame' | 'durationFrames'>) => shot.startFrame + shot.durationFrames;
export const framesToMs = frameToMs;

export type ShotGraphContext = {
  assets?: AssetIndex;
  styles?: StyleRegistry;
};

export const validateShotGraph = (raw: unknown, context: ShotGraphContext = {}): Validated<ShotGraph> => {
  const issues: Issue[] = [];
  const warnings: Issue[] = [];

  if (!checkObject(issues, '$', raw, GRAPH_KEYS)) return finish(issues, warnings, raw);
  checkSchemaVersion(issues, raw, 2);
  checkString(issues, 'id', raw.id, {pattern: ID_PATTERN});
  checkString(issues, 'title', raw.title, {max: 200});
  if (raw.language !== undefined) checkString(issues, 'language', raw.language, {max: 16});
  checkNumber(issues, 'fps', raw.fps, {min: 1, max: 120});
  checkNumber(issues, 'width', raw.width, {min: 16, max: 8192, integer: true});
  checkNumber(issues, 'height', raw.height, {min: 16, max: 8192, integer: true});
  const durationOk = checkNumber(issues, 'durationFrames', raw.durationFrames, {min: 1, integer: true});
  checkNumber(issues, 'version', raw.version, {min: 1, integer: true});
  checkTimestamp(issues, 'createdAt', raw.createdAt);
  checkTimestamp(issues, 'updatedAt', raw.updatedAt);
  if (raw.source !== undefined && checkObject(issues, 'source', raw.source, ['kind', 'durationMs'])) {
    checkEnum(issues, 'source.kind', raw.source.kind, ['storyboard-v1'] as const);
    checkNumber(issues, 'source.durationMs', raw.source.durationMs, {min: 1, integer: true});
  }
  if (raw.audio !== undefined) {
    if (!Array.isArray(raw.audio)) issues.push({path: 'audio', message: 'must be an array'});
    else {
      raw.audio.forEach((item: unknown, index: number) => {
        const at = `audio[${index}]`;
        if (!checkObject(issues, at, item, ['assetId', 'startFrame', 'volume'])) return;
        const idOk = checkString(issues, `${at}.assetId`, item.assetId, {pattern: ID_PATTERN});
        checkNumber(issues, `${at}.startFrame`, item.startFrame, {min: 0, integer: true});
        checkNumber(issues, `${at}.volume`, item.volume, {min: 0, max: 1});
        const entry = idOk && context.assets ? context.assets.get(item.assetId as string) : undefined;
        if (idOk && context.assets && !entry) issues.push({path: `${at}.assetId`, message: `asset "${item.assetId}" is not in the catalog`});
        else if (entry && entry.type !== 'audio') issues.push({path: `${at}.assetId`, message: `asset "${item.assetId}" is ${entry.type}, not audio`});
      });
    }
  }
  if (raw.styleProfileId !== undefined) {
    if (checkString(issues, 'styleProfileId', raw.styleProfileId, {pattern: ID_PATTERN}) && context.styles && !context.styles.has(raw.styleProfileId)) {
      issues.push({path: 'styleProfileId', message: `unknown style profile "${raw.styleProfileId}"`});
    }
  }

  if (!Array.isArray(raw.shots) || raw.shots.length === 0) {
    issues.push({path: 'shots', message: 'must be a non-empty array'});
    return finish(issues, warnings, raw);
  }

  const ids = new Set<string>();
  const valid: Array<{index: number; shot: Record<string, unknown>}> = [];

  raw.shots.forEach((entry: unknown, index: number) => {
    const at = `shots[${index}]`;
    if (!checkObject(issues, at, entry, SHOT_KEYS)) return;
    const before = issues.length;

    if (checkString(issues, `${at}.id`, entry.id, {pattern: ID_PATTERN})) {
      if (ids.has(entry.id as string)) issues.push({path: `${at}.id`, message: `duplicate shot id "${entry.id}"`});
      ids.add(entry.id as string);
    }
    if (entry.title !== undefined) checkString(issues, `${at}.title`, entry.title, {max: 200});
    checkNumber(issues, `${at}.track`, entry.track, {min: 0, max: 15, integer: true});
    checkNumber(issues, `${at}.startFrame`, entry.startFrame, {min: 0, integer: true});
    checkNumber(issues, `${at}.durationFrames`, entry.durationFrames, {min: 1, integer: true});
    checkString(issues, `${at}.description`, entry.description, {max: 2000});
    for (const key of ['narration', 'onScreenText', 'animation'] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== 'string') issues.push({path: `${at}.${key}`, message: 'must be a string'});
    }
    checkEnum(issues, `${at}.engine`, entry.engine, ENGINES);
    if (entry.composition !== undefined) checkString(issues, `${at}.composition`, entry.composition, {pattern: /^[A-Za-z0-9-]{1,80}$/});
    if (entry.visualKind !== undefined) checkEnum(issues, `${at}.visualKind`, entry.visualKind, VISUAL_KINDS);
    checkEnum(issues, `${at}.approval`, entry.approval, APPROVAL_STATES);

    if (!Array.isArray(entry.assets)) {
      issues.push({path: `${at}.assets`, message: 'must be an array (use [] when the shot needs no catalogued assets)'});
    } else {
      entry.assets.forEach((ref: unknown, refIndex: number) => {
        const refAt = `${at}.assets[${refIndex}]`;
        if (!checkObject(issues, refAt, ref, ['assetId', 'role'])) return;
        const idOk = checkString(issues, `${refAt}.assetId`, ref.assetId, {pattern: ID_PATTERN});
        checkString(issues, `${refAt}.role`, ref.role, {max: 60});
        if (idOk && context.assets && !context.assets.has(ref.assetId as string)) {
          issues.push({path: `${refAt}.assetId`, message: `asset "${ref.assetId}" is not in the catalog`});
        }
      });
    }

    if (entry.styleProfileId !== undefined && checkString(issues, `${at}.styleProfileId`, entry.styleProfileId, {pattern: ID_PATTERN}) && context.styles && !context.styles.has(entry.styleProfileId as string)) {
      issues.push({path: `${at}.styleProfileId`, message: `unknown style profile "${entry.styleProfileId}"`});
    }
    if (entry.engineOptions !== undefined && !isRecord(entry.engineOptions)) issues.push({path: `${at}.engineOptions`, message: 'must be an object'});

    if (entry.transitionIn !== undefined && checkObject(issues, `${at}.transitionIn`, entry.transitionIn, ['type', 'durationFrames', 'easing'])) {
      const transition = entry.transitionIn;
      const typeOk = checkEnum(issues, `${at}.transitionIn.type`, transition.type, TRANSITION_TYPES);
      const durationOk = checkNumber(issues, `${at}.transitionIn.durationFrames`, transition.durationFrames, {min: 0, integer: true});
      if (typeOk && durationOk) {
        if (transition.type === 'cut' && transition.durationFrames !== 0) issues.push({path: `${at}.transitionIn.durationFrames`, message: 'a cut must have 0 frames'});
        if (transition.type !== 'cut' && transition.durationFrames === 0) issues.push({path: `${at}.transitionIn.durationFrames`, message: 'must be at least 1 frame'});
      }
      if (transition.easing !== undefined) checkString(issues, `${at}.transitionIn.easing`, transition.easing, {max: 60});
    }

    if (entry.legacy !== undefined && checkObject(issues, `${at}.legacy`, entry.legacy, ['startMs', 'endMs', 'semanticRationale', 'visualAssetRequirements', 'status'])) {
      checkNumber(issues, `${at}.legacy.startMs`, entry.legacy.startMs, {min: 0, integer: true});
      checkNumber(issues, `${at}.legacy.endMs`, entry.legacy.endMs, {min: 1, integer: true});
      checkEnum(issues, `${at}.legacy.status`, entry.legacy.status, ['draft', 'reviewed'] as const);
    }

    if (issues.length === before) valid.push({index, shot: entry});
  });

  // Timeline checks only on shots whose own fields are sound.
  const byTrack = new Map<number, Array<{index: number; shot: Record<string, unknown>}>>();
  for (const item of valid) {
    const track = item.shot.track as number;
    byTrack.set(track, [...(byTrack.get(track) ?? []), item]);
  }

  for (const [track, items] of byTrack) {
    items.sort((a, b) => (a.shot.startFrame as number) - (b.shot.startFrame as number));
    items.forEach(({index, shot}, position) => {
      const start = shot.startFrame as number;
      const end = start + (shot.durationFrames as number);
      const at = `shots[${index}]`;
      if (durationOk && end > (raw.durationFrames as number)) {
        issues.push({path: `${at}.durationFrames`, message: `ends at frame ${end}, past the graph duration ${raw.durationFrames}`});
      }
      const previous = items[position - 1];
      if (previous) {
        const previousEnd = (previous.shot.startFrame as number) + (previous.shot.durationFrames as number);
        if (start < previousEnd) {
          issues.push({path: `${at}.startFrame`, message: `overlaps shot "${previous.shot.id}" on track ${track} (starts ${start}, previous ends ${previousEnd})`});
        } else if (start > previousEnd && track === 0) {
          warnings.push({path: `${at}.startFrame`, message: `${start - previousEnd} frame gap before this shot on track 0`});
        }
      } else if (track === 0 && start > 0) {
        warnings.push({path: `${at}.startFrame`, message: `track 0 begins at frame ${start}, not 0`});
      }
      const transition = shot.transitionIn as ShotTransition | undefined;
      if (transition) {
        if (!previous) {
          issues.push({path: `${at}.transitionIn`, message: 'needs a preceding shot on the same track'});
        } else {
          const limit = Math.min(previous.shot.durationFrames as number, shot.durationFrames as number);
          if (transition.durationFrames > limit) {
            issues.push({path: `${at}.transitionIn.durationFrames`, message: `${transition.durationFrames} frames exceeds the shorter adjoining shot (${limit})`});
          }
        }
      }
    });
  }

  const track0 = byTrack.get(0);
  if (durationOk && track0 && track0.length > 0) {
    const last = track0[track0.length - 1].shot;
    const lastEnd = (last.startFrame as number) + (last.durationFrames as number);
    if (lastEnd < (raw.durationFrames as number)) {
      warnings.push({path: 'durationFrames', message: `track 0 ends at frame ${lastEnd}, ${(raw.durationFrames as number) - lastEnd} frames before the graph ends`});
    }
  }

  return finish<ShotGraph>(issues, warnings, raw);
};

// ---------------------------------------------------------------------------
// Storyboard v1 compatibility
// ---------------------------------------------------------------------------

/** Validates the existing Audio-to-Motion storyboard (mirrors schemas/storyboard.schema.json). */
export const validateLegacyStoryboard = (raw: unknown): Validated<Storyboard> => {
  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  if (!checkObject(issues, '$', raw, ['schemaVersion', 'title', 'language', 'durationMs', 'scenes'])) return finish(issues, warnings, raw);
  checkSchemaVersion(issues, raw, 1);
  checkString(issues, 'title', raw.title, {max: 200});
  checkString(issues, 'language', raw.language, {max: 16});
  const durationOk = checkNumber(issues, 'durationMs', raw.durationMs, {min: 1, integer: true});

  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) {
    issues.push({path: 'scenes', message: 'must be a non-empty array'});
    return finish(issues, warnings, raw);
  }

  let previousEnd = 0;
  const ids = new Set<string>();
  raw.scenes.forEach((scene: unknown, index: number) => {
    const at = `scenes[${index}]`;
    const keys = ['id', 'startMs', 'endMs', 'narration', 'onScreenText', 'visualKind', 'animation', 'visualAssetRequirements', 'semanticRationale', 'status', 'composition', 'engine', 'options', 'transitionIn'];
    if (!checkObject(issues, at, scene, keys)) return;
    if (checkString(issues, `${at}.id`, scene.id)) {
      if (ids.has(scene.id as string)) issues.push({path: `${at}.id`, message: `duplicate scene id "${scene.id}"`});
      ids.add(scene.id as string);
    }
    const startOk = checkNumber(issues, `${at}.startMs`, scene.startMs, {min: 0, integer: true});
    const endOk = checkNumber(issues, `${at}.endMs`, scene.endMs, {min: 1, integer: true});
    for (const key of ['narration', 'onScreenText', 'animation', 'semanticRationale'] as const) {
      if (typeof scene[key] !== 'string') issues.push({path: `${at}.${key}`, message: 'must be a string'});
    }
    checkEnum(issues, `${at}.visualKind`, scene.visualKind, VISUAL_KINDS);
    checkEnum(issues, `${at}.status`, scene.status, ['draft', 'reviewed'] as const);
    if (!Array.isArray(scene.visualAssetRequirements) || scene.visualAssetRequirements.some((item: unknown) => typeof item !== 'string')) {
      issues.push({path: `${at}.visualAssetRequirements`, message: 'must be an array of strings'});
    }
    if (scene.composition !== undefined) checkString(issues, `${at}.composition`, scene.composition, {pattern: /^[A-Za-z0-9-]{1,80}$/});
    if (scene.engine !== undefined) checkEnum(issues, `${at}.engine`, scene.engine, ['remotion', 'three'] as const);
    if (scene.options !== undefined && !isRecord(scene.options)) issues.push({path: `${at}.options`, message: 'must be an object'});
    if (scene.transitionIn !== undefined && checkObject(issues, `${at}.transitionIn`, scene.transitionIn, ['type', 'durationMs', 'easing'])) {
      checkEnum(issues, `${at}.transitionIn.type`, scene.transitionIn.type, TRANSITION_TYPES);
      checkNumber(issues, `${at}.transitionIn.durationMs`, scene.transitionIn.durationMs, {min: 0, integer: true});
    }
    if (startOk && endOk) {
      if ((scene.endMs as number) <= (scene.startMs as number)) issues.push({path: `${at}.endMs`, message: 'must be after startMs'});
      if ((scene.startMs as number) < previousEnd) issues.push({path: `${at}.startMs`, message: 'overlaps the previous scene'});
      previousEnd = Math.max(previousEnd, scene.endMs as number);
      if (durationOk && (scene.endMs as number) > (raw.durationMs as number)) issues.push({path: `${at}.endMs`, message: 'exceeds durationMs'});
    }
  });
  return finish<Storyboard>(issues, warnings, raw);
};

export type LegacyAdapterOptions = {
  id: string;
  /** ISO timestamp supplied by the caller so conversion stays deterministic. */
  timestamp: string;
  fps?: number;
  width?: number;
  height?: number;
  styleProfileId?: string;
  version?: number;
};

const LEGACY_TO_APPROVAL: Record<StoryboardScene['status'], ApprovalState> = {
  draft: 'draft',
  // "reviewed" in v1 means a person looked at the scene, not that it was signed off.
  reviewed: 'review',
};

/** Non-destructive v1 -> v2 conversion. The v1 file is never modified. */
export const storyboardToShotGraph = (storyboard: Storyboard, options: LegacyAdapterOptions): ShotGraph => {
  const fps = options.fps ?? 30;
  const toFrame = (ms: number) => msToFrame(ms, fps);

  return {
    schemaVersion: 2,
    id: options.id,
    title: storyboard.title,
    language: storyboard.language,
    fps,
    width: options.width ?? 1920,
    height: options.height ?? 1080,
    // Same rounding as calculateAudioMetadata so the graph matches the composition length.
    durationFrames: durationFramesFor(storyboard.durationMs, fps),
    ...(options.styleProfileId ? {styleProfileId: options.styleProfileId} : {}),
    version: options.version ?? 1,
    createdAt: options.timestamp,
    updatedAt: options.timestamp,
    source: {kind: 'storyboard-v1', durationMs: storyboard.durationMs},
    shots: storyboard.scenes.map((scene) => {
      const startFrame = toFrame(scene.startMs);
      return {
        id: scene.id,
        track: 0,
        startFrame,
        // Shared boundaries round identically, so adjacent scenes stay contiguous.
        durationFrames: Math.max(1, toFrame(scene.endMs) - startFrame),
        description: scene.animation,
        narration: scene.narration,
        onScreenText: scene.onScreenText,
        engine: scene.engine ?? 'remotion',
        ...(scene.composition ? {composition: scene.composition} : {}),
        ...(scene.options ? {engineOptions: scene.options} : {}),
        ...(scene.transitionIn
          ? {transitionIn: {type: scene.transitionIn.type, durationFrames: scene.transitionIn.type === 'cut' ? 0 : Math.max(1, toFrame(scene.transitionIn.durationMs)), ...(scene.transitionIn.easing ? {easing: scene.transitionIn.easing} : {})}}
          : {}),
        visualKind: scene.visualKind,
        animation: scene.animation,
        assets: [],
        approval: LEGACY_TO_APPROVAL[scene.status],
        legacy: {
          startMs: scene.startMs,
          endMs: scene.endMs,
          semanticRationale: scene.semanticRationale,
          visualAssetRequirements: scene.visualAssetRequirements,
          status: scene.status,
        },
      };
    }),
  };
};

/** v2 -> v1, for tools that still read the legacy format. Uses preserved `legacy` values when present. */
export const shotGraphToStoryboard = (graph: ShotGraph): Storyboard => ({
  schemaVersion: 1,
  title: graph.title,
  language: graph.language ?? 'en',
  durationMs: graph.source?.durationMs ?? framesToMs(graph.durationFrames, graph.fps),
  scenes: graph.shots
    .filter((shot) => shot.track === 0)
    .sort((a, b) => a.startFrame - b.startFrame)
    .map((shot) => ({
      id: shot.id,
      startMs: shot.legacy?.startMs ?? framesToMs(shot.startFrame, graph.fps),
      endMs: shot.legacy?.endMs ?? framesToMs(shotEndFrame(shot), graph.fps),
      narration: shot.narration ?? '',
      onScreenText: shot.onScreenText ?? '',
      visualKind: shot.visualKind ?? 'editorial',
      animation: shot.animation ?? shot.description,
      visualAssetRequirements: shot.legacy?.visualAssetRequirements ?? [],
      semanticRationale: shot.legacy?.semanticRationale ?? shot.description,
      status: shot.approval === 'draft' || shot.approval === 'rejected' ? 'draft' : 'reviewed',
      ...(shot.transitionIn ? {transitionIn: {type: shot.transitionIn.type, durationMs: framesToMs(shot.transitionIn.durationFrames, graph.fps), ...(shot.transitionIn.easing ? {easing: shot.transitionIn.easing} : {})}} : {}),
      ...(shot.composition ? {composition: shot.composition} : {}),
      ...(shot.engine === 'three' ? {engine: 'three' as const} : {}),
      ...(shot.engineOptions ? {options: shot.engineOptions} : {}),
    })),
});

export type LoadedStoryboard = {
  origin: 'storyboard-v1' | 'shot-graph-v2';
  graph: ShotGraph;
  warnings: Issue[];
};

/** Accepts either storyboard format and always returns a validated shot graph. */
export const loadStoryboardDocument = (
  raw: unknown,
  options: LegacyAdapterOptions & ShotGraphContext,
): {ok: true; value: LoadedStoryboard} | {ok: false; issues: Issue[]} => {
  if (isRecord(raw) && raw.schemaVersion === 2) {
    const result = validateShotGraph(raw, options);
    return result.ok ? {ok: true, value: {origin: 'shot-graph-v2', graph: result.value, warnings: result.warnings}} : {ok: false, issues: result.issues};
  }
  if (isRecord(raw) && raw.schemaVersion === 1) {
    const legacy = validateLegacyStoryboard(raw);
    if (!legacy.ok) return {ok: false, issues: legacy.issues};
    const graph = validateShotGraph(storyboardToShotGraph(legacy.value, options), options);
    return graph.ok
      ? {ok: true, value: {origin: 'storyboard-v1', graph: graph.value, warnings: [...legacy.warnings, ...graph.warnings]}}
      : {ok: false, issues: graph.issues};
  }
  return {ok: false, issues: [{path: 'schemaVersion', message: 'must be 1 (Audio-to-Motion storyboard) or 2 (shot graph)'}]};
};
