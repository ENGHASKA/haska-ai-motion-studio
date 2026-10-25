import {
  ID_PATTERN,
  SHA256_PATTERN,
  checkEnum,
  checkNumber,
  checkObject,
  checkSchemaVersion,
  checkString,
  checkTimestamp,
  finish,
} from './validation.ts';
import type {Issue, Validated} from './validation.ts';

export const ASSET_TYPES = ['audio', 'image', 'font', 'video', 'model3d', 'texture'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const SOURCE_KINDS = ['original', 'generated', 'third-party', 'unknown'] as const;
export const COMMERCIAL_USE = ['yes', 'no', 'unknown'] as const;

export type AssetSource = {
  kind: (typeof SOURCE_KINDS)[number];
  /** Creator, URL, or tool that produced the file. Informational only; never fetched. */
  origin?: string;
  recordedAt?: string;
};

export type AssetLicense = {
  /** SPDX id (e.g. "CC-BY-4.0"), "proprietary", or "unknown". */
  id: string;
  name?: string;
  url?: string;
  commercialUse: (typeof COMMERCIAL_USE)[number];
  attributionRequired: boolean;
  attribution?: string;
};

export type Asset = {
  id: string;
  type: AssetType;
  /** Project-root-relative POSIX path. Absolute paths and ".." are rejected. */
  path: string;
  sha256: string;
  bytes: number;
  /** Other project paths holding byte-identical copies (one asset, several locations). */
  alsoAt?: string[];
  title?: string;
  tags?: string[];
  source: AssetSource;
  license: AssetLicense;
  /** Probed media facts, when known. */
  durationMs?: number;
  width?: number;
  height?: number;
};

export type AssetCatalog = {
  schemaVersion: 1;
  assets: Asset[];
};

const EXTENSIONS: Record<AssetType, readonly string[]> = {
  audio: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg'],
  image: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'avif'],
  font: ['ttf', 'otf', 'woff', 'woff2'],
  video: ['mp4', 'mov', 'webm', 'mkv'],
  model3d: ['glb', 'gltf', 'blend', 'obj', 'fbx'],
  texture: ['png', 'jpg', 'jpeg', 'webp', 'exr', 'hdr', 'ktx2'],
};

const ASSET_KEYS = ['id', 'type', 'path', 'sha256', 'bytes', 'alsoAt', 'title', 'tags', 'source', 'license', 'durationMs', 'width', 'height'];

/** Content-addressed id: the same bytes and type always produce the same id. */
export const assetIdFor = (type: AssetType, sha256: string) => `${type}-${sha256.slice(0, 12)}`;

export const extensionOf = (path: string) => path.slice(path.lastIndexOf('.') + 1).toLowerCase();

/** Returns a problem description when `path` is not a safe project-relative path. */
export const unsafePathReason = (path: string): string | undefined => {
  if (path.includes('\0')) return 'contains a NUL byte';
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path) || path.startsWith('\\')) return 'must be relative to the project root';
  if (path.includes('\\')) return 'must use forward slashes';
  if (path.split('/').some((part) => part === '..' || part === '')) return 'must not contain ".." or empty segments';
  return undefined;
};

export const validateAssetCatalog = (raw: unknown): Validated<AssetCatalog> => {
  const issues: Issue[] = [];
  const warnings: Issue[] = [];

  if (!checkObject(issues, '$', raw, ['schemaVersion', 'assets'])) return finish(issues, warnings, raw);
  checkSchemaVersion(issues, raw, 1);

  if (!Array.isArray(raw.assets)) {
    issues.push({path: 'assets', message: 'must be an array'});
    return finish(issues, warnings, raw);
  }

  const ids = new Set<string>();
  const paths = new Set<string>();

  raw.assets.forEach((entry: unknown, index: number) => {
    const at = `assets[${index}]`;
    if (!checkObject(issues, at, entry, ASSET_KEYS)) return;

    const validId = checkString(issues, `${at}.id`, entry.id, {pattern: ID_PATTERN});
    const validType = checkEnum(issues, `${at}.type`, entry.type, ASSET_TYPES);
    const validPath = checkString(issues, `${at}.path`, entry.path, {max: 512});
    const validHash = checkString(issues, `${at}.sha256`, entry.sha256, {pattern: SHA256_PATTERN});
    checkNumber(issues, `${at}.bytes`, entry.bytes, {min: 0, integer: true});

    if (validId) {
      if (ids.has(entry.id as string)) issues.push({path: `${at}.id`, message: `duplicate id "${entry.id}"`});
      ids.add(entry.id as string);
    }
    if (validId && validType && validHash && entry.id !== assetIdFor(entry.type as AssetType, entry.sha256 as string)) {
      issues.push({path: `${at}.id`, message: `must equal ${assetIdFor(entry.type as AssetType, entry.sha256 as string)} (type + first 12 hash chars)`});
    }

    if (validPath) {
      const reason = unsafePathReason(entry.path as string);
      if (reason) issues.push({path: `${at}.path`, message: reason});
      else if (paths.has(entry.path as string)) issues.push({path: `${at}.path`, message: `path "${entry.path}" is catalogued twice`});
      paths.add(entry.path as string);
      if (!reason && validType && !EXTENSIONS[entry.type as AssetType].includes(extensionOf(entry.path as string))) {
        issues.push({path: `${at}.path`, message: `extension is not valid for a ${entry.type} asset (${EXTENSIONS[entry.type as AssetType].join(', ')})`});
      }
    }

    if (entry.alsoAt !== undefined) {
      if (!Array.isArray(entry.alsoAt)) issues.push({path: `${at}.alsoAt`, message: 'must be an array of paths'});
      else {
        entry.alsoAt.forEach((alias: unknown, aliasIndex: number) => {
          const aliasAt = `${at}.alsoAt[${aliasIndex}]`;
          if (!checkString(issues, aliasAt, alias, {max: 512})) return;
          const reason = unsafePathReason(alias as string);
          if (reason) issues.push({path: aliasAt, message: reason});
          else if (alias === entry.path || paths.has(alias as string)) issues.push({path: aliasAt, message: `path "${alias}" is catalogued twice`});
          paths.add(alias as string);
        });
      }
    }
    if (entry.title !== undefined) checkString(issues, `${at}.title`, entry.title, {max: 200});
    if (entry.tags !== undefined) {
      if (!Array.isArray(entry.tags)) issues.push({path: `${at}.tags`, message: 'must be an array of strings'});
      else entry.tags.forEach((tag: unknown, tagIndex: number) => checkString(issues, `${at}.tags[${tagIndex}]`, tag, {max: 64}));
    }
    for (const key of ['durationMs', 'width', 'height'] as const) {
      if (entry[key] !== undefined) checkNumber(issues, `${at}.${key}`, entry[key], {min: 1});
    }

    if (checkObject(issues, `${at}.source`, entry.source, ['kind', 'origin', 'recordedAt'])) {
      checkEnum(issues, `${at}.source.kind`, entry.source.kind, SOURCE_KINDS);
      if (entry.source.origin !== undefined) checkString(issues, `${at}.source.origin`, entry.source.origin, {max: 500});
      if (entry.source.recordedAt !== undefined) checkTimestamp(issues, `${at}.source.recordedAt`, entry.source.recordedAt);
      if (entry.source.kind === 'third-party' && !entry.source.origin) {
        issues.push({path: `${at}.source.origin`, message: 'is required for third-party assets'});
      }
      if (entry.source.kind === 'unknown') warnings.push({path: `${at}.source.kind`, message: 'provenance is unknown'});
    }

    if (checkObject(issues, `${at}.license`, entry.license, ['id', 'name', 'url', 'commercialUse', 'attributionRequired', 'attribution'])) {
      const license = entry.license;
      checkString(issues, `${at}.license.id`, license.id, {max: 80});
      checkEnum(issues, `${at}.license.commercialUse`, license.commercialUse, COMMERCIAL_USE);
      if (license.name !== undefined) checkString(issues, `${at}.license.name`, license.name, {max: 200});
      if (license.url !== undefined) checkString(issues, `${at}.license.url`, license.url, {pattern: /^https?:\/\//, max: 500});
      if (typeof license.attributionRequired !== 'boolean') {
        issues.push({path: `${at}.license.attributionRequired`, message: 'must be a boolean'});
      } else if (license.attributionRequired && !license.attribution) {
        issues.push({path: `${at}.license.attribution`, message: 'is required when attributionRequired is true'});
      }
      if (license.attribution !== undefined) checkString(issues, `${at}.license.attribution`, license.attribution, {max: 500});
      if (license.id === 'unknown' || license.commercialUse === 'unknown') {
        warnings.push({path: `${at}.license`, message: 'license or commercial-use status is unknown'});
      }
    }
  });

  return finish<AssetCatalog>(issues, warnings, raw);
};

/** Read-only lookup interface over a validated catalog. */
export type AssetIndex = {
  has(id: string): boolean;
  get(id: string): Asset | undefined;
  byType(type: AssetType): Asset[];
  list(): Asset[];
};

export const createAssetIndex = (catalog: AssetCatalog): AssetIndex => {
  const byId = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  return {
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    byType: (type) => catalog.assets.filter((asset) => asset.type === type),
    list: () => [...catalog.assets],
  };
};

export type Attribution = {assetId: string; title?: string; text: string};

/** Attribution lines the final credits must carry. */
export const collectAttributions = (catalog: AssetCatalog, usedIds?: Iterable<string>): Attribution[] => {
  const used = usedIds ? new Set(usedIds) : undefined;
  return catalog.assets
    .filter((asset) => asset.license.attributionRequired && (!used || used.has(asset.id)))
    .map((asset) => ({assetId: asset.id, title: asset.title, text: asset.license.attribution ?? ''}));
};

export const emptyCatalog = (): AssetCatalog => ({schemaVersion: 1, assets: []});
