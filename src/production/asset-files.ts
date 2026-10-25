import {createReadStream} from 'node:fs';
import {lstat, realpath} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {assetIdFor, unsafePathReason} from './asset-catalog.ts';
import type {Asset, AssetCatalog, AssetLicense, AssetSource, AssetType} from './asset-catalog.ts';
import type {Issue} from './validation.ts';

export const hashFile = (path: string) =>
  new Promise<string>((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolveHash(hash.digest('hex')));
  });

/** Resolves a catalog path under `root`, refusing anything that escapes it (including via symlinks). */
export const resolveInside = async (root: string, relativePath: string): Promise<{path: string} | {error: string}> => {
  const reason = unsafePathReason(relativePath);
  if (reason) return {error: reason};
  const rootReal = await realpath(root);
  const candidate = resolve(rootReal, relativePath);
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    return {error: 'file does not exist'};
  }
  if (real !== rootReal && !real.startsWith(rootReal + sep)) return {error: 'resolves outside the project root'};
  return {path: real};
};

/**
 * Verifies that every catalogued file exists inside `root`, is a regular file,
 * and (unless `verifyHash` is false) still matches its recorded size and SHA-256.
 */
export const checkCatalogFiles = async (
  catalog: AssetCatalog,
  root: string,
  options: {verifyHash?: boolean} = {},
): Promise<Issue[]> => {
  const issues: Issue[] = [];
  for (const [index, asset] of catalog.assets.entries()) {
    const at = `assets[${index}] (${asset.id})`;
    for (const alias of asset.alsoAt ?? []) {
      const aliasLocated = await resolveInside(root, alias);
      if ('error' in aliasLocated) issues.push({path: `${at}.alsoAt`, message: `${alias}: ${aliasLocated.error}`});
      else if (options.verifyHash !== false && (await hashFile(aliasLocated.path)) !== asset.sha256) issues.push({path: `${at}.alsoAt`, message: `${alias} no longer matches the recorded hash`});
    }
    const located = await resolveInside(root, asset.path);
    if ('error' in located) {
      issues.push({path: `${at}.path`, message: located.error});
      continue;
    }
    const stats = await lstat(located.path);
    if (!stats.isFile()) {
      issues.push({path: `${at}.path`, message: 'is not a regular file'});
      continue;
    }
    if (stats.size !== asset.bytes) {
      issues.push({path: `${at}.bytes`, message: `recorded ${asset.bytes} bytes but file has ${stats.size}`});
    }
    if (options.verifyHash !== false) {
      const actual = await hashFile(located.path);
      if (actual !== asset.sha256) issues.push({path: `${at}.sha256`, message: 'file content no longer matches the recorded hash'});
    }
  }
  return issues;
};

/** Hashes a local file and returns a ready-to-catalog entry. Never touches the network. */
export const describeLocalAsset = async (
  root: string,
  relativePath: string,
  details: {type: AssetType; source: AssetSource; license: AssetLicense; title?: string; tags?: string[]},
): Promise<Asset> => {
  const located = await resolveInside(root, relativePath);
  if ('error' in located) throw new Error(`${relativePath}: ${located.error}`);
  const stats = await lstat(located.path);
  if (!stats.isFile()) throw new Error(`${relativePath}: not a regular file`);
  const sha256 = await hashFile(located.path);
  return {
    id: assetIdFor(details.type, sha256),
    type: details.type,
    path: relativePath,
    sha256,
    bytes: stats.size,
    ...(details.title ? {title: details.title} : {}),
    ...(details.tags ? {tags: details.tags} : {}),
    source: details.source,
    license: details.license,
  };
};
