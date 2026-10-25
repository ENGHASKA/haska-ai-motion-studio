import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, test} from 'node:test';
import {validateApprovalRecord} from '../../src/production/approval.ts';
import {assetIdFor, validateAssetCatalog} from '../../src/production/asset-catalog.ts';
import type {Asset, AssetCatalog} from '../../src/production/asset-catalog.ts';
import {describeLocalAsset} from '../../src/production/asset-files.ts';
import {scanProjectAssets} from '../../src/production/asset-scan.ts';
import {blenderCacheKey, blenderRenderCommand, checkBlenderOutputs} from '../../src/production/blender-files.ts';
import {blenderFramePath, describeRanges, expectedBlenderFrames, validateBlenderManifest} from '../../src/production/blender-shot.ts';
import type {BlenderShotManifest} from '../../src/production/blender-shot.ts';
import {activateProject, graphFile, loadStyleRegistry, readJsonFile, resolveProject, scaffoldProject, writeJsonAtomic} from '../../src/production/project.ts';
import {qaAudioProject, qaProject, verifyOutput} from '../../src/production/qa.ts';
import type {Finding} from '../../src/production/qa.ts';
import {reviewableContent} from '../../src/production/shot-graph.ts';
import type {ShotGraph} from '../../src/production/shot-graph.ts';
import {currentContentHash, decide, findProjectRoot, gateRender, initApproval, loadApproval, subjectFile} from '../../src/production/store.ts';

const REAL_ROOT = findProjectRoot(import.meta.dirname);
const NOW = '2026-10-25T10:00:00Z';
const cleanups: string[] = [];
after(() => cleanups.forEach((path) => rmSync(path, {recursive: true, force: true})));

const tempRoot = (withFonts = true) => {
  const root = mkdtempSync(join(tmpdir(), 'haska-workflow-'));
  cleanups.push(root);
  writeFileSync(join(root, 'remotion.config.ts'), '');
  if (withFonts) {
    mkdirSync(join(root, 'public', 'fonts'), {recursive: true});
    cpSync(join(REAL_ROOT, 'public', 'fonts', 'ibm-plex-sans-arabic'), join(root, 'public', 'fonts', 'ibm-plex-sans-arabic'), {recursive: true});
  }
  return root;
};
const create = (root: string, id: string, extra: {platform?: 'youtube' | 'reel' | 'tiktok'; language?: 'en' | 'ar'; styleId?: string} = {}) =>
  scaffoldProject(root, {id, title: 'Test', platform: extra.platform ?? 'youtube', styleId: extra.styleId ?? 'haska-cyber', language: extra.language ?? 'en', now: NOW}, loadStyleRegistry(root).registry);
const edit = (root: string, id: string, change: (graph: ShotGraph) => void) => {
  const graph = readJsonFile(graphFile(root, id)) as ShotGraph;
  change(graph);
  writeJsonAtomic(graphFile(root, id), graph);
};
const errors = (findings: Finding[]) => findings.filter((finding) => finding.level === 'error');
const has = (findings: Finding[], check: string, text?: RegExp) => findings.some((finding) => finding.check === check && (!text || text.test(finding.message)));

test('scaffolded projects are valid in every platform and language, and refuse to overwrite', () => {
  const root = tempRoot();
  for (const [id, platform, language] of [['yt', 'youtube', 'en'], ['rl', 'reel', 'ar'], ['tt', 'tiktok', 'en']] as const) {
    create(root, id, {platform, language});
    const project = resolveProject(root, id);
    assert.deepEqual(project.issues, [], id);
    assert.equal(project.graph.shots.length, 3);
    assert.equal(project.graph.durationFrames, 270);
  }
  assert.equal(resolveProject(root, 'rl').graph.width, 1080);
  assert.equal(resolveProject(root, 'rl').graph.language, 'ar');
  assert.throws(() => create(root, 'yt'), /already exists/);
  assert.throws(() => scaffoldProject(root, {id: 'x', title: 'x', platform: 'youtube', styleId: 'nope', language: 'en', now: NOW}, loadStyleRegistry(root).registry), /Unknown style profile/);
  assert.throws(() => resolveProject(root, 'missing'), /not found/);
  assert.throws(() => resolveProject(root, '../escape'), /Invalid project id/);
});

test('activation writes the exact props the ProductionVideo composition previews', () => {
  const root = tempRoot();
  mkdirSync(join(root, 'src', 'data'), {recursive: true});
  create(root, 'p');
  const project = activateProject(root, 'p');
  const written = readJsonFile(join(root, 'src', 'data', 'active-production.json')) as {graph: ShotGraph; style: {id: string}; assets: Asset[]};
  assert.equal(written.graph.id, 'p');
  assert.equal(written.style.id, 'haska-cyber');
  assert.deepEqual(written.graph, project.graph);
  edit(root, 'p', (graph) => (graph.shots[0].durationFrames = 0));
  assert.throws(() => activateProject(root, 'p'), /is invalid/);
});

test('approval is bound to reviewable content: flags/version never invalidate, edits always do', () => {
  const root = tempRoot();
  create(root, 'a');
  assert.equal(subjectFile(root, 'storyboard', 'a'), graphFile(root, 'a'), 'production projects resolve before audio storyboards');
  initApproval(root, 'storyboard', 'a', NOW, 'system');
  assert.equal(gateRender(root, 'storyboard', 'a', {}).allowed, false, 'a new project is draft and cannot render');
  decide(root, 'storyboard', 'a', {to: 'review', actor: 'sara', at: NOW});
  decide(root, 'storyboard', 'a', {to: 'approved', actor: 'omar', at: NOW});
  assert.equal(gateRender(root, 'storyboard', 'a', {}).allowed, true);

  const before = currentContentHash(root, 'storyboard', 'a');
  edit(root, 'a', (graph) => {
    graph.version += 1;
    graph.updatedAt = '2030-01-01T00:00:00Z';
    graph.shots.forEach((shot) => (shot.approval = 'approved'));
  });
  assert.equal(currentContentHash(root, 'storyboard', 'a'), before, 'version, timestamps and shot flags are not content');
  assert.equal(gateRender(root, 'storyboard', 'a', {}).allowed, true);

  for (const change of [
    (g: ShotGraph) => (g.shots[0].onScreenText = 'Different'),
    (g: ShotGraph) => (g.shots[1].startFrame += 1),
    (g: ShotGraph) => (g.shots[2].engineOptions = {layout: 'left'}),
    (g: ShotGraph) => (g.styleProfileId = 'haska-signal'),
  ]) {
    const snapshot = readFileSync(graphFile(root, 'a'), 'utf8');
    edit(root, 'a', change);
    assert.equal(gateRender(root, 'storyboard', 'a', {}).allowed, false, 'any content edit blocks the render until re-approved');
    writeFileSync(graphFile(root, 'a'), snapshot);
    assert.equal(gateRender(root, 'storyboard', 'a', {}).allowed, true, 'reverting restores the exact approved content');
  }
  assert.deepEqual(Object.keys(reviewableContent(resolveProject(root, 'a').graph)).includes('version'), false);
});

test('approval history that skips review or rewrites content cannot be loaded', () => {
  const root = tempRoot();
  create(root, 'h');
  const record = initApproval(root, 'storyboard', 'h', NOW, 'system');
  const jump = {...record, state: 'approved', history: [...record.history, {at: NOW, actor: 'x', from: 'draft', to: 'approved', version: 1, contentHash: record.contentHash}]};
  const jumpResult = validateApprovalRecord(jump);
  assert.ok(!jumpResult.ok && jumpResult.issues.some((issue) => /illegal transition draft -> approved/.test(issue.message)));

  const gap = {...record, state: 'review', history: [...record.history, {at: NOW, actor: 'x', from: 'review', to: 'review', version: 1, contentHash: record.contentHash}]};
  assert.ok(!validateApprovalRecord(gap).ok, 'entries must continue from the previous state');

  const swapped = {...record, history: [...record.history, {at: NOW, actor: 'x', from: 'draft', to: 'draft', version: 1, contentHash: 'f'.repeat(64)}], contentHash: 'f'.repeat(64)};
  assert.ok(!validateApprovalRecord(swapped).ok, 'content cannot change inside one version');
  writeFileSync(join(root, 'production', 'approvals', 'storyboard--h.json'), JSON.stringify(jump));
  assert.throws(() => loadApproval(root, 'storyboard', 'h'), /Invalid approval record/);
});

test('QA: a fresh project is clean; overflow, safe-area, glyph, routing, and render-compat problems are found', async () => {
  const root = tempRoot();
  create(root, 'q', {language: 'ar', platform: 'reel'});
  assert.deepEqual(errors(await qaProject(root, 'q')), []);

  edit(root, 'q', (graph) => (graph.shots[0].onScreenText = 'مرحبا'.repeat(80)));
  assert.ok(has(await qaProject(root, 'q'), 'text-overflow', /does not fit/), 'one enormous Arabic word cannot fit');

  edit(root, 'q', (graph) => {
    graph.shots[0].onScreenText = 'أمن المعلومات';
    graph.shots[1].composition = 'DoesNotExist';
  });
  assert.ok(has(await qaProject(root, 'q'), 'routing', /No shot component named "DoesNotExist"/));

  edit(root, 'q', (graph) => {
    graph.shots[1].composition = 'network';
    graph.shots[0].onScreenText = 'Emoji 😀 漢字';
  });
  assert.ok(has(await qaProject(root, 'q'), 'glyph-coverage', /漢/), 'glyphs no installed font in the stack can draw are reported');

  edit(root, 'q', (graph) => {
    graph.shots[0].onScreenText = 'عنوان';
    graph.width = 1081;
  });
  assert.ok(has(await qaProject(root, 'q'), 'render-compat', /even dimensions/));
});

test('QA: profiles control the checks (fonts not installed, safe-area margins)', async () => {
  const root = tempRoot();
  mkdirSync(join(root, 'production', 'style-profiles'), {recursive: true});
  writeFileSync(join(root, 'production', 'style-profiles', 'no-arabic.json'), JSON.stringify({id: 'no-arabic', name: 'No Arabic font', extends: 'haska-cyber', typography: {arabic: {family: 'Definitely Not Installed', fallbacks: ['sans-serif'], weight: 700}}}));
  writeFileSync(join(root, 'production', 'style-profiles', 'wide-margins.json'), JSON.stringify({id: 'wide-margins', name: 'Wide margins', extends: 'haska-cyber', platforms: {youtube: {safeArea: {left: 400}}}}));
  assert.deepEqual(loadStyleRegistry(root).issues, []);

  create(root, 'f', {language: 'ar', styleId: 'no-arabic'});
  assert.ok(has(await qaProject(root, 'f'), 'glyph-coverage', /none of the fonts \[Definitely Not Installed, sans-serif\] is installed/));

  create(root, 'm', {styleId: 'wide-margins'});
  edit(root, 'm', (graph) => {
    graph.shots[0].composition = undefined;
    graph.shots[0].visualKind = 'shield';
  });
  assert.ok(has(await qaProject(root, 'm'), 'safe-area', /outside the .* platform safe area/), 'the semantic scene starts at x=130, inside a 400px margin');
});

test('QA: assets must exist, be hash-correct, be servable, and unknown licenses are flagged', async () => {
  const root = tempRoot();
  mkdirSync(join(root, 'public'), {recursive: true});
  mkdirSync(join(root, 'production'), {recursive: true});
  writeFileSync(join(root, 'public', 'music.wav'), 'RIFFfake');
  const asset = await describeLocalAsset(root, 'public/music.wav', {type: 'audio', source: {kind: 'unknown'}, license: {id: 'unknown', commercialUse: 'unknown', attributionRequired: false}});
  writeJsonAtomic(join(root, 'production', 'asset-catalog.json'), {schemaVersion: 1, assets: [asset]});
  create(root, 'as');
  edit(root, 'as', (graph) => (graph.audio = [{assetId: asset.id, startFrame: 0, volume: 0.8}]));

  const findings = await qaProject(root, 'as');
  assert.ok(has(findings, 'license', /license \/ commercial use is unknown/));
  assert.ok(has(findings, 'audio-timing'), 'the fake file is not real audio, so probing it is reported');

  writeFileSync(join(root, 'public', 'music.wav'), 'tampered');
  assert.ok(has(await qaProject(root, 'as'), 'assets', /no longer matches the recorded hash|recorded .* bytes/));

  edit(root, 'as', (graph) => (graph.audio = [{assetId: 'audio-000000000000', startFrame: 0, volume: 1}]));
  assert.ok(errors(await qaProject(root, 'as')).some((finding) => finding.check === 'storyboard' && /not in the catalog/.test(finding.message)));
});

const blenderFixture = async () => {
  const root = tempRoot();
  mkdirSync(join(root, 'public', 'scenes'), {recursive: true});
  mkdirSync(join(root, 'production'), {recursive: true});
  writeFileSync(join(root, 'public', 'scenes', 'hero.blend'), 'BLENDER-fake');
  writeFileSync(join(root, 'public', 'scenes', 'wood.png'), 'png-fake');
  const license = {id: 'unknown', commercialUse: 'unknown' as const, attributionRequired: false};
  const scene = await describeLocalAsset(root, 'public/scenes/hero.blend', {type: 'model3d', source: {kind: 'original'}, license});
  const texture = await describeLocalAsset(root, 'public/scenes/wood.png', {type: 'texture', source: {kind: 'original'}, license});
  const catalog: AssetCatalog = {schemaVersion: 1, assets: [scene, texture]};
  writeJsonAtomic(join(root, 'production', 'asset-catalog.json'), catalog);
  const manifest: BlenderShotManifest = {
    schemaVersion: 1, shotId: 'hero', sceneAssetId: scene.id, textureAssetIds: [texture.id], fps: 30, width: 1920, height: 1080,
    startFrame: 1, frameCount: 5, colorSpace: {working: 'linear-srgb', view: 'agx', output: 'bt709'}, device: 'OPTIX', samples: 64,
    output: {kind: 'png-sequence', directory: 'public/renders/hero', filePattern: 'frame_%05d.png'}, cache: {key: '0'.repeat(64)},
  };
  manifest.cache.key = blenderCacheKey(manifest, catalog);
  return {root, catalog, manifest, scene, texture};
};

test('Blender contract: validation, frame paths, missing frames, stale caches', async () => {
  const {root, catalog, manifest} = await blenderFixture();
  const assets = {has: (id: string) => catalog.assets.some((a) => a.id === id), get: (id: string) => catalog.assets.find((a) => a.id === id), byType: () => [], list: () => catalog.assets};
  assert.ok(validateBlenderManifest(manifest, {assets, graph: {fps: 30, width: 1920, height: 1080}}).ok);
  assert.equal(blenderFramePath(manifest, 0), 'public/renders/hero/frame_00001.png');
  assert.equal(blenderFramePath(manifest, 4), 'public/renders/hero/frame_00005.png');
  assert.equal(blenderFramePath(manifest, 99), 'public/renders/hero/frame_00005.png', 'frames past the end hold the last frame');
  assert.equal(expectedBlenderFrames(manifest).length, 5);
  assert.equal(describeRanges([0, 1, 2, 4, 7, 8]), '0-2, 4, 7-8');

  const wrongFps = validateBlenderManifest({...manifest, fps: 24}, {graph: {fps: 30, width: 1920, height: 1080}});
  assert.ok(!wrongFps.ok && wrongFps.issues.some((issue) => /drift/.test(issue.message)));
  const scaled = validateBlenderManifest({...manifest, width: 1280, height: 720}, {graph: {fps: 30, width: 1920, height: 1080}});
  assert.ok(scaled.ok && scaled.warnings.length === 1, 'a size mismatch is allowed but flagged');
  assert.ok(!validateBlenderManifest({...manifest, output: {...manifest.output, directory: '../outside'}}).ok, 'frames must live under public/');
  assert.ok(!validateBlenderManifest({...manifest, output: {...manifest.output, directory: 'renders/hero'}}).ok, 'and under public/ specifically');
  assert.ok(!validateBlenderManifest({...manifest, textureAssetIds: ['texture-ffffffffffff']}, {assets}).ok, 'unknown texture asset');
  assert.ok(!validateBlenderManifest({...manifest, sceneAssetId: manifest.textureAssetIds[0]}, {assets}).ok, 'a texture is not a scene');

  assert.match(checkBlenderOutputs(manifest, root, catalog)[0].message, /no rendered frames/);
  mkdirSync(join(root, 'public', 'renders', 'hero'), {recursive: true});
  for (const frame of [1, 2, 5]) writeFileSync(join(root, 'public', 'renders', 'hero', `frame_${String(frame).padStart(5, '0')}.png`), 'x');
  assert.match(checkBlenderOutputs(manifest, root, catalog)[0].message, /missing 2 of 5 frames \(shot-local 2-3\)/);
  for (const frame of [3, 4]) writeFileSync(join(root, 'public', 'renders', 'hero', `frame_${String(frame).padStart(5, '0')}.png`), 'x');
  assert.deepEqual(checkBlenderOutputs(manifest, root, catalog), []);

  writeFileSync(join(root, 'public', 'scenes', 'wood.png'), 'edited');
  const edited = await describeLocalAsset(root, 'public/scenes/wood.png', {type: 'texture', source: {kind: 'original'}, license: {id: 'unknown', commercialUse: 'unknown', attributionRequired: false}});
  const changedCatalog: AssetCatalog = {schemaVersion: 1, assets: [catalog.assets[0], edited]};
  assert.notEqual(blenderCacheKey({...manifest, textureAssetIds: [edited.id]}, changedCatalog), manifest.cache.key, 'a changed texture changes the cache key');
  assert.ok(checkBlenderOutputs({...manifest, textureAssetIds: [edited.id]}, root, changedCatalog).some((issue) => /cache key is stale/.test(issue.message)));
  assert.notEqual(blenderCacheKey({...manifest, samples: 128}, catalog), manifest.cache.key, 'render settings are part of the key');
  assert.deepEqual(blenderRenderCommand('m.json', 'public/scenes/hero.blend').slice(0, 3), ['./blender-studio.sh', '--background', 'public/scenes/hero.blend']);
});

test('Blender shots flow through project resolution and QA', async () => {
  const {root, manifest, scene, texture} = await blenderFixture();
  create(root, 'bl');
  edit(root, 'bl', (graph) => {
    graph.shots[1] = {...graph.shots[1], engine: 'blender', composition: undefined, onScreenText: undefined, assets: [{assetId: scene.id, role: 'scene'}], engineOptions: {blender: manifest}};
  });
  const project = resolveProject(root, 'bl');
  assert.deepEqual(project.issues, []);
  assert.deepEqual(project.assets.map((asset) => asset.id).sort(), [scene.id, texture.id].sort(), 'scene and texture travel with the props');
  const findings = await qaProject(root, 'bl');
  assert.ok(has(findings, 'blender', /no rendered frames/), 'unrendered shots are reported before any render starts');
});

test('asset scan indexes in place, aliases identical files, skips sensitive names, and keeps licenses unknown', async () => {
  const root = tempRoot(false);
  mkdirSync(join(root, 'public', 'audio-projects', 'demo'), {recursive: true});
  mkdirSync(join(root, 'fixtures'), {recursive: true});
  writeFileSync(join(root, 'fixtures', 'cybersecurity-voice.wav'), 'same-bytes');
  writeFileSync(join(root, 'public', 'audio-projects', 'demo', 'source.wav'), 'same-bytes');
  writeFileSync(join(root, 'public', 'audio-projects', 'demo', 'narration.wav'), 'derived');
  writeFileSync(join(root, 'public', 'audio-projects', 'demo', 'storyboard.json'), '{}');
  writeFileSync(join(root, 'public', 'logo.png'), 'png');
  writeFileSync(join(root, 'public', 'token-image.png'), 'secret-looking');
  mkdirSync(join(root, 'public', '.hidden'));
  writeFileSync(join(root, 'public', '.hidden', 'a.png'), 'x');

  const first = await scanProjectAssets(root, {schemaVersion: 1, assets: []}, NOW);
  assert.deepEqual(first.added.map((asset) => asset.path).sort(), ['public/audio-projects/demo/source.wav', 'public/logo.png']);
  assert.deepEqual(first.aliased, [{path: 'fixtures/cybersecurity-voice.wav', assetId: first.added.find((a) => a.type === 'audio')!.id}]);
  assert.ok(first.skippedSensitive.includes('public/token-image.png'));
  assert.ok(first.skippedSensitive.some((path) => path.includes('.hidden')));
  const narration = first.added.find((asset) => asset.type === 'audio')!;
  assert.deepEqual(narration.source.kind, 'generated', 'provenance recorded in the repo is adopted from the identical copy');
  for (const asset of first.added) assert.deepEqual([asset.license.id, asset.license.commercialUse], ['unknown', 'unknown'], 'never assume a license');
  assert.ok(validateAssetCatalog(first.catalog).ok);
  assert.equal(narration.id, assetIdFor('audio', narration.sha256));

  const second = await scanProjectAssets(root, first.catalog, NOW);
  assert.deepEqual([second.added.length, second.aliased.length, second.changed.length], [0, 0, 0], 'rescanning is idempotent');
  writeFileSync(join(root, 'public', 'logo.png'), 'changed');
  const third = await scanProjectAssets(root, first.catalog, NOW);
  assert.deepEqual(third.changed.map((entry) => entry.path), ['public/logo.png'], 'changed files are reported, never silently re-licensed');
});

test('verifyOutput checks codec, size, fps, duration, and audio with ffprobe', async (t) => {
  if (spawnSync('ffmpeg', ['-version']).status !== 0) return t.skip('ffmpeg not installed');
  const dir = tempRoot();
  const file = join(dir, 'tiny.mp4');
  // A 1-second 64x64 test pattern used only as an ffprobe fixture; it is never shown or exported.
  const made = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', file]);
  assert.equal(made.status, 0, String(made.stderr));
  const good = await verifyOutput(file, {width: 64, height: 64, fps: 30, durationFrames: 30, audio: false});
  assert.deepEqual(errors(good), []);
  const bad = await verifyOutput(file, {width: 1920, height: 1080, fps: 24, durationFrames: 60, audio: true});
  const messages = errors(bad).map((finding) => finding.message).join('|');
  assert.match(messages, /size is 64×64/);
  assert.match(messages, /frame rate/);
  assert.match(messages, /duration/);
  assert.match(messages, /audio stream/);
  assert.ok(errors(await verifyOutput(join(dir, 'missing.mp4'), {width: 1, height: 1, fps: 1, durationFrames: 1, audio: false})).length === 1);
});

// The narration of the sample is generated locally (npm run audio:sample) and not shipped, so a fresh package skips this.
const sampleNarration = existsSync(join(REAL_ROOT, 'public', 'audio-projects', 'audio-motion-sample', 'narration.wav'));
test('real audio project: v1 storyboard passes QA across YouTube, Reel and TikTok with narration in frame sync', {skip: !sampleNarration}, async () => {
  const findings = await qaAudioProject(REAL_ROOT, 'audio-motion-sample');
  assert.deepEqual(errors(findings), []);
  assert.ok(has(findings, 'audio-timing', /116 frames/), 'narration frames equal storyboard frames');
});

const CLI = join(REAL_ROOT, '.cache', 'production-build', 'scripts', 'production.js');
const cli = (root: string, ...args: string[]) => {
  // Node 24 marks test-runner children with NODE_TEST_CONTEXT; do not leak that protocol marker into the CLI subprocess.
  const {NODE_TEST_CONTEXT: _testContext, ...childEnv} = process.env;
  const result = spawnSync(process.execPath, [CLI, ...args], {env: {...childEnv, HASKA_PROJECT_ROOT: root}, encoding: 'utf8'});
  return {code: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\nspawn error: ${result.error.message}` : ''}`};
};

test('CLI end-to-end: new -> blocked render -> approval -> dry-run render -> edit invalidates approval', () => {
  const root = tempRoot();
  mkdirSync(join(root, 'src', 'data'), {recursive: true});
  assert.equal(cli(root, 'new', 'demo', '--title', 'Demo', '--platform', 'reel', '--language', 'ar').code, 0);
  assert.ok(existsSync(join(root, 'production', 'projects', 'demo', 'brief.md')));

  const blocked = cli(root, 'render', 'demo', '--dry-run');
  assert.equal(blocked.code, 1);
  assert.match(blocked.out, /RENDER BLOCKED: Approval state is "draft"/);
  assert.match(blocked.out, /approval approve storyboard demo/);

  assert.equal(cli(root, 'approval', 'approve', 'storyboard', 'demo').code, 2, 'approving requires --actor');
  assert.equal(cli(root, 'approval', 'approve', 'storyboard', 'demo', '--actor', 'omar').code, 2, 'and a prior review');
  assert.equal(cli(root, 'approval', 'submit', 'storyboard', 'demo', '--actor', 'sara').code, 0);
  assert.equal(cli(root, 'approval', 'approve', 'storyboard', 'demo', '--actor', 'omar', '--note', 'ok').code, 0);

  const dryRun = cli(root, 'render', 'demo', '--dry-run', '--out', 'out/demo.mp4');
  assert.equal(dryRun.code, 0, dryRun.out);
  assert.match(dryRun.out, /APPROVAL OK: Approved v1/);
  assert.match(dryRun.out, /remotion render src\/index\.ts ProductionVideo .*out\/demo\.mp4 --props=.*demo\.json --codec=h264 --audio-codec=aac --color-space=bt709/);
  assert.match(dryRun.out, /dry run: nothing was rendered/);
  assert.ok(!existsSync(join(root, 'out', 'demo.mp4')), 'a dry run renders nothing');
  const props = readJsonFile(join(root, '.cache', 'production-props', 'demo.json')) as {graph: ShotGraph};
  assert.equal(props.graph.width, 1080);

  edit(root, 'demo', (graph) => (graph.shots[0].onScreenText = 'نص جديد'));
  const stale = cli(root, 'render', 'demo', '--dry-run');
  assert.equal(stale.code, 1);
  assert.match(stale.out, /Content changed after approval/);
  assert.match(cli(root, 'approval', 'status', 'storyboard', 'demo').out, /content changed since last decision/);

  assert.equal(cli(root, 'activate', 'demo').code, 0);
  assert.match(cli(root, 'list').out, /Production projects: demo/);
  assert.equal(cli(root, 'bump', 'demo').code, 0);
  assert.equal((readJsonFile(graphFile(root, 'demo')) as ShotGraph).version, 2);
});

test('CLI: QA errors stop the render before the approval gate; unknown commands fail clearly', () => {
  const root = tempRoot();
  assert.equal(cli(root, 'new', 'bad').code, 0);
  edit(root, 'bad', (graph) => (graph.shots[0].onScreenText = 'x'.repeat(400)));
  const result = cli(root, 'render', 'bad', '--dry-run');
  assert.equal(result.code, 2);
  assert.match(result.out, /QA found errors/);
  assert.doesNotMatch(result.out, /Approval/);
  assert.equal(cli(root, 'definitely-not-a-command').code, 2);
  assert.equal(cli(root, 'new', 'Bad Id').code, 2);
});

test('the real repository validates (style profiles, catalog files + hashes, projects, audio storyboards)', () => {
  const result = spawnSync(process.execPath, [CLI, 'validate'], {env: {...process.env, HASKA_PROJECT_ROOT: REAL_ROOT}, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PASS {2}style profiles/);
  assert.match(result.stdout, /PASS {2}audio storyboard audio-motion-sample/);
});

test('copying a repo storyboard into a temp root keeps legacy audio gating working', () => {
  const root = tempRoot();
  mkdirSync(join(root, 'public', 'audio-projects', 'legacy'), {recursive: true});
  cpSync(join(REAL_ROOT, 'public', 'audio-projects', 'audio-motion-sample', 'storyboard.json'), join(root, 'public', 'audio-projects', 'legacy', 'storyboard.json'));
  assert.equal(cli(root, 'gate', 'storyboard', 'legacy').code, 0, 'untracked legacy projects still pass');
  assert.equal(spawnSync(process.execPath, [CLI, 'gate', 'storyboard', 'legacy'], {env: {...process.env, HASKA_PROJECT_ROOT: root, HASKA_REQUIRE_APPROVAL: '1'}}).status, 1);
});
