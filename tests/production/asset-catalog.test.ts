import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, test} from 'node:test';
import {assetIdFor, collectAttributions, createAssetIndex, emptyCatalog, unsafePathReason, validateAssetCatalog} from '../../src/production/asset-catalog.ts';
import type {Asset} from '../../src/production/asset-catalog.ts';
import {checkCatalogFiles, describeLocalAsset} from '../../src/production/asset-files.ts';

const root = mkdtempSync(join(tmpdir(), 'haska-assets-'));
after(() => rmSync(root, {recursive: true, force: true}));

const HASH = 'a'.repeat(64);
const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: assetIdFor('image', HASH),
  type: 'image',
  path: 'public/logo.png',
  sha256: HASH,
  bytes: 10,
  source: {kind: 'original'},
  license: {id: 'proprietary', commercialUse: 'yes', attributionRequired: false},
  ...overrides,
});
const catalog = (...assets: Asset[]) => ({schemaVersion: 1, assets});

test('the shipped empty catalog is valid', () => {
  assert.ok(validateAssetCatalog(emptyCatalog()).ok);
});

test('ids are deterministic and must match type + hash', () => {
  assert.equal(assetIdFor('image', HASH), 'image-aaaaaaaaaaaa');
  assert.ok(validateAssetCatalog(catalog(asset())).ok);
  const wrong = validateAssetCatalog(catalog(asset({id: 'image-bbbbbbbbbbbb'})));
  assert.ok(!wrong.ok && wrong.issues.some((issue) => issue.path === 'assets[0].id'));
});

test('rejects unsafe paths, wrong extensions, and duplicates', () => {
  for (const path of ['/etc/passwd', '../outside.png', 'a/../b.png', 'C:/x.png', 'a\\b.png']) {
    assert.ok(unsafePathReason(path), path);
    assert.ok(!validateAssetCatalog(catalog(asset({path}))).ok, path);
  }
  assert.ok(!validateAssetCatalog(catalog(asset({path: 'public/logo.ttf'}))).ok);
  assert.ok(!validateAssetCatalog(catalog(asset(), asset())).ok);
});

test('license rules: attribution text required, third-party needs an origin, unknowns warn', () => {
  const needsText = asset({license: {id: 'CC-BY-4.0', commercialUse: 'yes', attributionRequired: true}});
  assert.ok(!validateAssetCatalog(catalog(needsText)).ok);
  const thirdParty = asset({source: {kind: 'third-party'}});
  assert.ok(!validateAssetCatalog(catalog(thirdParty)).ok);
  const unknown = validateAssetCatalog(catalog(asset({source: {kind: 'unknown'}, license: {id: 'unknown', commercialUse: 'unknown', attributionRequired: false}})));
  assert.ok(unknown.ok);
  assert.equal(unknown.warnings.length, 2);
});

test('index lookups and attribution collection', () => {
  const credited = asset({license: {id: 'CC-BY-4.0', commercialUse: 'yes', attributionRequired: true, attribution: 'Photo by Someone'}});
  const data = {schemaVersion: 1 as const, assets: [credited]};
  const index = createAssetIndex(data);
  assert.ok(index.has(credited.id));
  assert.equal(index.byType('image').length, 1);
  assert.equal(index.byType('audio').length, 0);
  assert.equal(collectAttributions(data)[0].text, 'Photo by Someone');
  assert.equal(collectAttributions(data, []).length, 0);
});

test('describeLocalAsset hashes a real file and checkCatalogFiles verifies it', async () => {
  mkdirSync(join(root, 'public'));
  writeFileSync(join(root, 'public', 'clip.wav'), 'RIFF-fake-audio-bytes');
  const entry = await describeLocalAsset(root, 'public/clip.wav', {type: 'audio', source: {kind: 'original'}, license: {id: 'proprietary', commercialUse: 'yes', attributionRequired: false}});
  assert.equal(entry.id, assetIdFor('audio', entry.sha256));
  const data = catalog(entry) as {schemaVersion: 1; assets: Asset[]};
  assert.ok(validateAssetCatalog(data).ok);
  assert.deepEqual(await checkCatalogFiles(data, root), []);

  writeFileSync(join(root, 'public', 'clip.wav'), 'RIFF-fake-audio-bytez');
  const tampered = await checkCatalogFiles(data, root);
  assert.ok(tampered.some((issue) => issue.path.endsWith('.sha256')));
});

test('missing files and symlinks that escape the root are reported', async () => {
  const outside = mkdtempSync(join(tmpdir(), 'haska-outside-'));
  try {
    writeFileSync(join(outside, 'secret.png'), 'x');
    symlinkSync(join(outside, 'secret.png'), join(root, 'public', 'link.png'));
    const escaping = await checkCatalogFiles({schemaVersion: 1, assets: [asset({path: 'public/link.png'}), asset({id: assetIdFor('image', 'b'.repeat(64)), sha256: 'b'.repeat(64), path: 'public/missing.png'})]}, root);
    assert.ok(escaping.some((issue) => issue.message.includes('outside the project root')));
    assert.ok(escaping.some((issue) => issue.message.includes('does not exist')));
    await assert.rejects(describeLocalAsset(root, '../escape.png', {type: 'image', source: {kind: 'original'}, license: {id: 'proprietary', commercialUse: 'yes', attributionRequired: false}}));
  } finally {
    rmSync(outside, {recursive: true, force: true});
  }
});
