// Indexes assets that already exist in the project, in place: nothing is copied, moved, or downloaded.
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {extensionOf} from './asset-catalog.ts';
import type {Asset, AssetCatalog, AssetLicense, AssetSource, AssetType} from './asset-catalog.ts';
import {describeLocalAsset, hashFile} from './asset-files.ts';

const SCAN_ROOTS = ['public', 'fixtures'];
// Derived or machine-generated files are not source assets.
const EXCLUDED = [/\/sound\/mix-preview\.wav$/, /^public\/renders\//, /^public\/audio-projects\/[^/]+\/(narration\.|whisper-raw)/, /^public\/audio-projects\/[^/]+\/source\.json$/];
const SENSITIVE = /(^|\/)\.|secret|token|credential|passw|\.env|\.pem$|\.key$|id_rsa/i;

const TYPE_BY_EXTENSION: Array<[AssetType, readonly string[]]> = [
  ['audio', ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg']],
  ['video', ['mp4', 'mov', 'webm', 'mkv']],
  ['font', ['ttf', 'otf', 'woff', 'woff2']],
  ['model3d', ['glb', 'gltf', 'blend', 'obj', 'fbx']],
  ['image', ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'avif']],
  ['texture', ['exr', 'hdr', 'ktx2']],
];

export const assetTypeForPath = (path: string): AssetType | undefined => TYPE_BY_EXTENSION.find(([, extensions]) => extensions.includes(extensionOf(path)))?.[0];

const walk = (root: string, directory: string, found: string[]) => {
  for (const name of readdirSync(join(root, directory)).sort()) {
    const path = `${directory}/${name}`;
    const stats = statSync(join(root, path));
    if (stats.isSymbolicLink?.()) continue;
    if (stats.isDirectory()) walk(root, path, found);
    else if (stats.isFile()) found.push(path);
  }
};

export type ScanReport = {
  added: Asset[];
  /** Same content as an already catalogued asset; recorded as an alias, not a second asset. */
  aliased: Array<{path: string; assetId: string}>;
  /** Catalogued paths whose content changed on disk; never auto-updated. */
  changed: Array<{assetId: string; path: string}>;
  skippedSensitive: string[];
  catalog: AssetCatalog;
};

/**
 * Provenance defaults are deliberately conservative: unless the repository itself records where a file came
 * from, source is "unknown" and the license stays "unknown" until a person verifies it.
 */
type Sidecar = {title?: string; source: AssetSource; license: AssetLicense};

/** A provenance.json next to the files records where they came from and under which license. */
const sidecarFor = (root: string, path: string): Sidecar | undefined => {
  const file = join(root, dirname(path), 'provenance.json');
  if (!existsSync(file)) return undefined;
  const data = JSON.parse(readFileSync(file, 'utf8')) as Sidecar;
  return data.source && data.license ? data : undefined;
};

const provenanceFor = (root: string, path: string, now: string) => {
  const sidecar = sidecarFor(root, path);
  if (sidecar) return {source: {...sidecar.source, recordedAt: sidecar.source.recordedAt ?? now}, license: sidecar.license, title: sidecar.title ? `${sidecar.title} (${path.split('/').pop()})` : undefined};
  const license = {id: 'unknown', commercialUse: 'unknown' as const, attributionRequired: false};
  if (path === 'fixtures/cybersecurity-voice.wav') {
    return {source: {kind: 'generated' as const, origin: 'ffmpeg flite filter, voice "slt" (scripts/audio_motion.py sample)', recordedAt: now}, license, title: 'Cybersecurity sample voice'};
  }
  const narration = path.match(/^public\/audio-projects\/([^/]+)\/source\./);
  if (narration) return {source: {kind: 'unknown' as const, origin: `narration supplied for audio project "${narration[1]}"`, recordedAt: now}, license, title: `Narration: ${narration[1]}`};
  return {source: {kind: 'unknown' as const, recordedAt: now}, license, title: undefined};
};

export const scanProjectAssets = async (root: string, catalog: AssetCatalog, now: string): Promise<ScanReport> => {
  const files: string[] = [];
  for (const scanRoot of SCAN_ROOTS) {
    try {
      walk(root, scanRoot, files);
    } catch {
      /* directory absent */
    }
  }
  // Servable public/ copies are preferred as the primary location.
  files.sort((a, b) => Number(b.startsWith('public/')) - Number(a.startsWith('public/')) || a.localeCompare(b));

  const assets = catalog.assets.map((asset) => ({...asset}));
  const report: ScanReport = {added: [], aliased: [], changed: [], skippedSensitive: [], catalog};
  const known = new Map<string, Asset>();
  for (const asset of assets) for (const path of [asset.path, ...(asset.alsoAt ?? [])]) known.set(path, asset);

  for (const path of files) {
    const type = assetTypeForPath(path);
    if (!type || EXCLUDED.some((pattern) => pattern.test(path))) continue;
    if (SENSITIVE.test(path)) {
      report.skippedSensitive.push(path);
      continue;
    }
    const existing = known.get(path);
    if (existing) {
      if ((await hashFile(join(root, path))) !== existing.sha256) report.changed.push({assetId: existing.id, path});
      continue;
    }
    const details = provenanceFor(root, path, now);
    const entry = await describeLocalAsset(root, path, {type, source: details.source, license: details.license, title: details.title});
    const twin = assets.find((asset) => asset.id === entry.id || asset.sha256 === entry.sha256);
    if (twin) {
      twin.alsoAt = [...(twin.alsoAt ?? []), path];
      // A copy with recorded provenance explains where the identical bytes came from; the license stays untouched.
      if (twin.source.kind === 'unknown' && details.source.kind !== 'unknown') {
        twin.source = details.source;
        twin.title = details.title ?? twin.title;
      }
      known.set(path, twin);
      report.aliased.push({path, assetId: twin.id});
    } else {
      assets.push(entry);
      known.set(path, entry);
      report.added.push(entry);
    }
  }
  report.catalog = {schemaVersion: 1, assets};
  return report;
};

