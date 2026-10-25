import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {findProjectRoot} from '../../src/production/store.ts';
import {createAssetIndex} from '../../src/production/asset-catalog.ts';
import {VISUAL_KINDS, loadStoryboardDocument, shotGraphToStoryboard, storyboardToShotGraph, validateLegacyStoryboard, validateShotGraph} from '../../src/production/shot-graph.ts';
import type {ShotGraph} from '../../src/production/shot-graph.ts';
import {HASKA_CYBER, createStyleRegistry} from '../../src/production/style-profile.ts';

const ROOT = findProjectRoot(import.meta.dirname);
const readJson = (path: string) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const options = {id: 'audio-motion-sample', timestamp: '2026-10-25T00:00:00Z'};

test('VISUAL_KINDS matches the v1 JSON schema and the TypeScript type list', () => {
  const schema = readJson('schemas/storyboard.schema.json');
  assert.deepEqual([...VISUAL_KINDS], schema.properties.scenes.items.properties.visualKind.enum);
});

test('the real v1 sample storyboard validates and adapts without gaps or overlaps', () => {
  const raw = readJson('public/audio-projects/audio-motion-sample/storyboard.json');
  assert.ok(validateLegacyStoryboard(raw).ok);
  const loaded = loadStoryboardDocument(raw, options);
  assert.ok(loaded.ok, loaded.ok ? '' : JSON.stringify(loaded.issues));
  assert.equal(loaded.value.origin, 'storyboard-v1');
  const {graph} = loaded.value;
  assert.equal(graph.shots.length, raw.scenes.length);
  assert.equal(graph.durationFrames, Math.ceil((raw.durationMs / 1000) * 30));
  graph.shots.forEach((shot, index) => {
    assert.equal(shot.visualKind, raw.scenes[index].visualKind);
    if (index > 0) assert.equal(shot.startFrame, graph.shots[index - 1].startFrame + graph.shots[index - 1].durationFrames);
  });
  assert.deepEqual(loaded.value.warnings.filter((w) => w.message.includes('overlaps')), []);
});

test('v1 -> v2 -> v1 round trip is lossless, and the v1 input is not mutated', () => {
  const raw = readJson('public/audio-projects/audio-motion-sample/storyboard.json');
  const before = structuredClone(raw);
  const graph = storyboardToShotGraph(raw, options);
  assert.deepEqual(raw, before);
  assert.deepEqual(shotGraphToStoryboard(graph), raw);
});

test('v1 "reviewed" never auto-promotes to approved', () => {
  const raw = readJson('public/audio-projects/audio-motion-sample/storyboard.json');
  const states = new Set(storyboardToShotGraph(raw, options).shots.map((shot) => shot.approval));
  assert.ok(!states.has('approved'));
});

test('legacy validation catches overlap, reversed time, and unknown visualKind', () => {
  const raw = readJson('public/audio-projects/audio-motion-sample/storyboard.json');
  const broken = structuredClone(raw);
  broken.scenes[1].startMs = 500;
  broken.scenes[2].endMs = broken.scenes[2].startMs;
  broken.scenes[0].visualKind = 'hologram';
  const result = validateLegacyStoryboard(broken);
  assert.ok(!result.ok);
  const messages = result.issues.map((issue) => issue.message).join('|');
  assert.match(messages, /overlaps/);
  assert.match(messages, /after startMs/);
  assert.match(messages, /must be one of/);
});

test('rejects documents with an unknown schemaVersion', () => {
  const result = loadStoryboardDocument({schemaVersion: 3}, options);
  assert.ok(!result.ok);
});

const example = () => readJson('production/examples/starter.shot-graph.json') as ShotGraph;

test('the shipped starter example graph is valid against the built-in style profile', () => {
  const {registry} = createStyleRegistry([HASKA_CYBER]);
  const result = validateShotGraph(example(), {styles: registry});
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.issues));
  assert.deepEqual(result.warnings, []);
  assert.equal(loadStoryboardDocument(example(), {...options, styles: registry}).ok, true);
});

test('timeline rules: overlap, out-of-range, gaps, and transition limits', () => {
  const graph = example();
  graph.shots[1].startFrame = 70; // overlaps "establish" (ends 78)
  graph.shots[3].durationFrames = 100; // runs past 300
  graph.shots[2].transitionIn!.durationFrames = 80; // longer than its neighbours allow
  const result = validateShotGraph(graph);
  assert.ok(!result.ok);
  const messages = result.issues.map((issue) => issue.message).join('|');
  assert.match(messages, /overlaps shot "establish"/);
  assert.match(messages, /past the graph duration/);
  assert.match(messages, /exceeds the shorter adjoining shot/);

  const gap = example();
  gap.shots[2].startFrame = 160;
  gap.shots[2].durationFrames = 76;
  const gapResult = validateShotGraph(gap);
  assert.ok(gapResult.ok);
  assert.ok(gapResult.warnings.some((warning) => warning.message.includes('gap')));
});

test('overlays on a higher track may overlap track 0; a first shot cannot have a transition in', () => {
  const graph = example();
  graph.shots.push({id: 'lower-third', track: 1, startFrame: 20, durationFrames: 60, description: 'Overlay caption', engine: 'remotion', assets: [], approval: 'draft'});
  assert.ok(validateShotGraph(graph).ok);
  graph.shots[0].transitionIn = {type: 'crossfade', durationFrames: 10};
  const result = validateShotGraph(graph);
  assert.ok(!result.ok && result.issues.some((issue) => issue.message.includes('preceding shot')));
});

test('asset and style references are checked when a catalog/registry is supplied', () => {
  const graph = example();
  graph.shots[0].assets = [{assetId: 'image-aaaaaaaaaaaa', role: 'logo'}];
  graph.styleProfileId = 'no-such-style';
  const {registry} = createStyleRegistry([HASKA_CYBER]);
  const index = createAssetIndex({schemaVersion: 1, assets: []});
  const result = validateShotGraph(graph, {assets: index, styles: registry});
  assert.ok(!result.ok);
  const messages = result.issues.map((issue) => issue.message).join('|');
  assert.match(messages, /not in the catalog/);
  assert.match(messages, /unknown style profile/);
  // Without a catalog or registry, references are accepted as opaque ids.
  assert.ok(validateShotGraph(graph).ok);
});

test('engines are restricted to remotion, three, and blender; cuts must be zero-length', () => {
  const graph = example();
  (graph.shots[0] as any).engine = 'unity';
  graph.shots[1].transitionIn = {type: 'cut', durationFrames: 5};
  const result = validateShotGraph(graph);
  assert.ok(!result.ok);
  assert.ok(result.issues.some((issue) => issue.path === 'shots[0].engine'));
  assert.ok(result.issues.some((issue) => issue.message.includes('cut must have 0 frames')));
  for (const engine of ['remotion', 'three', 'blender'] as const) {
    const ok = example();
    ok.shots[0].engine = engine;
    assert.ok(validateShotGraph(ok).ok, engine);
  }
  assert.ok(existsSync(join(ROOT, 'production/examples/starter.shot-graph.json')));
});
