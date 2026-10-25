import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import type {AssetCatalog} from './asset-catalog.ts';
import {blenderFramePath, describeRanges} from './blender-shot.ts';
import type {BlenderShotManifest} from './blender-shot.ts';
import {hashJson} from './hash.ts';
import type {Issue} from './validation.ts';

/** Cache key over everything that changes the pixels: scene + texture hashes and render settings. */
export const blenderCacheKey = (manifest: BlenderShotManifest, catalog: AssetCatalog): string => {
  const hashOf = (id: string) => catalog.assets.find((asset) => asset.id === id)?.sha256 ?? `missing:${id}`;
  return hashJson({
    scene: hashOf(manifest.sceneAssetId),
    textures: [...manifest.textureAssetIds].sort().map(hashOf),
    settings: {
      fps: manifest.fps,
      width: manifest.width,
      height: manifest.height,
      startFrame: manifest.startFrame,
      frameCount: manifest.frameCount,
      colorSpace: manifest.colorSpace,
      device: manifest.device === 'CPU' ? 'CPU' : 'GPU',
      samples: manifest.samples,
      filePattern: manifest.output.filePattern,
    },
  });
};

/** Checks rendered frames and cache freshness without running Blender. */
export const checkBlenderOutputs = (manifest: BlenderShotManifest, root: string, catalog: AssetCatalog): Issue[] => {
  const issues: Issue[] = [];
  const at = `blender shot "${manifest.shotId}"`;
  const directory = join(root, manifest.output.directory);

  if (!existsSync(directory)) {
    issues.push({path: at, message: `no rendered frames at ${manifest.output.directory}; render them first`});
  } else {
    const present = new Set(readdirSync(directory));
    const missing: number[] = [];
    for (let frame = 0; frame < manifest.frameCount; frame++) {
      const name = blenderFramePath(manifest, frame).split('/').pop()!;
      if (!present.has(name)) missing.push(frame);
    }
    if (missing.length) issues.push({path: at, message: `missing ${missing.length} of ${manifest.frameCount} frames (shot-local ${describeRanges(missing)})`});
  }

  for (const id of [manifest.sceneAssetId, ...manifest.textureAssetIds]) {
    const asset = catalog.assets.find((entry) => entry.id === id);
    if (!asset) issues.push({path: at, message: `asset "${id}" is not in the catalog`});
    else if (!existsSync(join(root, asset.path))) issues.push({path: at, message: `asset file missing: ${asset.path}`});
  }

  if (blenderCacheKey(manifest, catalog) !== manifest.cache.key) {
    issues.push({path: at, message: 'cache key is stale: the scene, a texture, or a render setting changed since these frames were rendered'});
  }
  return issues;
};

/** The command that would render this shot with the project's verified portable Blender. Never executed here. */
export const blenderRenderCommand = (manifestPath: string, sceneFile: string) => [
  './blender-studio.sh', '--background', sceneFile, '--python', 'scripts/blender_render_shot.py', '--', '--manifest', manifestPath,
];
