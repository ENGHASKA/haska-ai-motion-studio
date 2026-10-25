// Contract between Blender-rendered shots and the Remotion master timeline.
// A shot with engine "blender" carries a manifest (in engineOptions.blender) describing what was rendered,
// where the frames are, and which inputs produced them. Nothing here runs Blender.
import {ID_PATTERN, checkEnum, checkNumber, checkObject, checkSchemaVersion, checkString, checkTimestamp, finish} from './validation.ts';
import type {Issue, Validated} from './validation.ts';
import type {AssetIndex} from './asset-catalog.ts';

export const BLENDER_DEVICES = ['OPTIX', 'CUDA', 'CPU'] as const;
export const VIEW_TRANSFORMS = ['standard', 'agx', 'filmic'] as const;
export const WORKING_SPACES = ['linear-srgb', 'acescg'] as const;
export const OUTPUT_SPACES = ['srgb', 'bt709'] as const;

export type BlenderShotManifest = {
  schemaVersion: 1;
  shotId: string;
  /** Catalog id of the .blend file. */
  sceneAssetId: string;
  /** Catalog ids of textures/HDRIs the scene reads. */
  textureAssetIds: string[];
  fps: number;
  width: number;
  height: number;
  /** First Blender frame to render and how many. */
  startFrame: number;
  frameCount: number;
  colorSpace: {working: (typeof WORKING_SPACES)[number]; view: (typeof VIEW_TRANSFORMS)[number]; output: (typeof OUTPUT_SPACES)[number]};
  device: (typeof BLENDER_DEVICES)[number];
  samples: number;
  output: {
    kind: 'png-sequence';
    /** Project-relative directory, under public/ so Remotion can serve it. */
    directory: string;
    /** printf-style, e.g. frame_%05d.png */
    filePattern: string;
  };
  cache: {
    /** Hash of the scene file, textures, and render settings that produced the frames. */
    key: string;
    renderedAt?: string;
  };
};

const KEYS = ['schemaVersion', 'shotId', 'sceneAssetId', 'textureAssetIds', 'fps', 'width', 'height', 'startFrame', 'frameCount', 'colorSpace', 'device', 'samples', 'output', 'cache'];

export const validateBlenderManifest = (
  raw: unknown,
  context: {assets?: AssetIndex; graph?: {fps: number; width: number; height: number}} = {},
): Validated<BlenderShotManifest> => {
  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  if (!checkObject(issues, '$', raw, KEYS)) return finish(issues, warnings, raw);
  checkSchemaVersion(issues, raw, 1);
  checkString(issues, 'shotId', raw.shotId, {pattern: ID_PATTERN});
  const sceneOk = checkString(issues, 'sceneAssetId', raw.sceneAssetId, {pattern: ID_PATTERN});
  if (!Array.isArray(raw.textureAssetIds)) issues.push({path: 'textureAssetIds', message: 'must be an array'});
  checkNumber(issues, 'fps', raw.fps, {min: 1, max: 120});
  checkNumber(issues, 'width', raw.width, {min: 16, max: 8192, integer: true});
  checkNumber(issues, 'height', raw.height, {min: 16, max: 8192, integer: true});
  checkNumber(issues, 'startFrame', raw.startFrame, {min: 0, integer: true});
  checkNumber(issues, 'frameCount', raw.frameCount, {min: 1, integer: true});
  checkNumber(issues, 'samples', raw.samples, {min: 1, max: 20000, integer: true});
  checkEnum(issues, 'device', raw.device, BLENDER_DEVICES);
  if (checkObject(issues, 'colorSpace', raw.colorSpace, ['working', 'view', 'output'])) {
    checkEnum(issues, 'colorSpace.working', raw.colorSpace.working, WORKING_SPACES);
    checkEnum(issues, 'colorSpace.view', raw.colorSpace.view, VIEW_TRANSFORMS);
    checkEnum(issues, 'colorSpace.output', raw.colorSpace.output, OUTPUT_SPACES);
  }
  if (checkObject(issues, 'output', raw.output, ['kind', 'directory', 'filePattern'])) {
    checkEnum(issues, 'output.kind', raw.output.kind, ['png-sequence'] as const);
    if (checkString(issues, 'output.directory', raw.output.directory, {max: 300})) {
      const directory = raw.output.directory as string;
      if (!directory.startsWith('public/') || directory.includes('..')) {
        issues.push({path: 'output.directory', message: 'must be inside public/ (Remotion only serves public/) and contain no ".."'});
      }
    }
    if (checkString(issues, 'output.filePattern', raw.output.filePattern, {pattern: /^[A-Za-z0-9_-]*%0\dd\.png$/})) {
      /* ok */
    }
  }
  if (checkObject(issues, 'cache', raw.cache, ['key', 'renderedAt'])) {
    checkString(issues, 'cache.key', raw.cache.key, {pattern: /^[0-9a-f]{64}$/});
    if (raw.cache.renderedAt !== undefined) checkTimestamp(issues, 'cache.renderedAt', raw.cache.renderedAt);
  }

  if (context.graph) {
    if (raw.fps !== context.graph.fps) issues.push({path: 'fps', message: `render is ${String(raw.fps)} fps but the master timeline is ${context.graph.fps}; frames would drift`});
    if (raw.width !== context.graph.width || raw.height !== context.graph.height) {
      warnings.push({path: 'width', message: `render is ${String(raw.width)}x${String(raw.height)}, timeline is ${context.graph.width}x${context.graph.height}; it will be scaled`});
    }
  }
  if (context.assets) {
    const scene = sceneOk ? context.assets.get(raw.sceneAssetId as string) : undefined;
    if (sceneOk && !scene) issues.push({path: 'sceneAssetId', message: `asset "${raw.sceneAssetId}" is not in the catalog`});
    else if (scene && scene.type !== 'model3d') issues.push({path: 'sceneAssetId', message: `asset is ${scene.type}, expected a 3D scene`});
    (Array.isArray(raw.textureAssetIds) ? raw.textureAssetIds : []).forEach((id: unknown, index: number) => {
      const asset = typeof id === 'string' ? context.assets!.get(id) : undefined;
      if (!asset) issues.push({path: `textureAssetIds[${index}]`, message: `texture "${String(id)}" is not in the catalog`});
      else if (asset.type !== 'texture' && asset.type !== 'image') issues.push({path: `textureAssetIds[${index}]`, message: `asset is ${asset.type}, expected a texture`});
    });
  }
  return finish<BlenderShotManifest>(issues, warnings, raw);
};

/** Path (project-relative) of the rendered frame for a shot-local frame number. */
export const blenderFramePath = (manifest: BlenderShotManifest, localFrame: number): string => {
  const index = manifest.startFrame + Math.min(Math.max(0, localFrame), manifest.frameCount - 1);
  const pattern = manifest.output.filePattern;
  const name = pattern.replace(/%0(\d)d/, (_, width: string) => String(index).padStart(Number(width), '0'));
  return `${manifest.output.directory}/${name}`;
};

/** All frame paths the manifest promises, in order. */
export const expectedBlenderFrames = (manifest: BlenderShotManifest) =>
  Array.from({length: manifest.frameCount}, (_, index) => blenderFramePath(manifest, index));

/** Collapses a sorted list of missing frame numbers into ranges like "3-9, 12". */
export const describeRanges = (frames: number[]) => {
  const ranges: string[] = [];
  for (let i = 0; i < frames.length; ) {
    let j = i;
    while (j + 1 < frames.length && frames[j + 1] === frames[j] + 1) j += 1;
    ranges.push(i === j ? `${frames[i]}` : `${frames[i]}-${frames[j]}`);
    i = j + 1;
  }
  return ranges.join(', ');
};
