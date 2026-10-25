import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HASKA_CYBER, PLATFORM_DEFAULTS, contrastRatio, createStyleRegistry, msToFrames, platformParams, validateStyleProfile} from '../../src/production/style-profile.ts';

const clone = () => structuredClone(HASKA_CYBER) as Record<string, any>;

test('built-in haska-cyber profile is valid with no warnings', () => {
  const result = validateStyleProfile(HASKA_CYBER);
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.issues));
  assert.deepEqual(result.warnings, []);
});

test('rejects bad colors, unknown fields, and missing required easings', () => {
  const profile = clone();
  profile.palette.primary = 'cyan';
  profile.surprise = true;
  delete profile.motion.easings.exit;
  const result = validateStyleProfile(profile);
  assert.ok(!result.ok);
  const paths = result.issues.map((issue) => issue.path);
  assert.ok(paths.includes('palette.primary'));
  assert.ok(paths.includes('$.surprise'));
  assert.ok(paths.includes('motion.easings.exit'));
});

test('transitions must reference a defined easing and durations must be ordered', () => {
  const profile = clone();
  profile.motion.transitions.scene.easing = 'missing';
  profile.motion.durationsMs = {quick: 600, standard: 300, slow: 1200};
  const result = validateStyleProfile(profile);
  assert.ok(!result.ok);
  const paths = result.issues.map((issue) => issue.path);
  assert.ok(paths.includes('motion.transitions.scene.easing'));
  assert.ok(paths.includes('motion.durationsMs'));
});

test('fonts require fallbacks so renders never depend on a missing font', () => {
  const profile = clone();
  profile.typography.display.fallbacks = [];
  const result = validateStyleProfile(profile);
  assert.ok(!result.ok);
  assert.ok(result.issues.some((issue) => issue.path === 'typography.display.fallbacks'));
});

test('contrast: unreadable text is an error, borderline is a warning', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01);
  const unreadable = clone();
  unreadable.palette.text = '#0a1a28';
  assert.ok(!validateStyleProfile(unreadable).ok);
  const borderline = clone();
  borderline.palette.text = '#5a7a85';
  const result = validateStyleProfile(borderline);
  assert.ok(result.ok);
  assert.equal(result.warnings.length, 1);
});

test('extends merges over a registered base and validates the merged result', () => {
  const child = {id: 'haska-reel', name: 'HASKA Reel', extends: 'haska-cyber', platforms: {reel: {titleScale: 0.7}}, palette: {accent: '#ffcc00'}};
  const {registry, issues} = createStyleRegistry([HASKA_CYBER, child]);
  assert.deepEqual(issues, []);
  const resolved = registry.get('haska-reel');
  assert.equal(resolved?.palette.accent, '#ffcc00');
  assert.equal(resolved?.palette.background, HASKA_CYBER.palette.background);
  assert.equal(resolved?.extends, 'haska-cyber');
  assert.equal(platformParams(resolved!, 'reel').titleScale, 0.7);
});

test('extends fails clearly for an unknown base, and duplicate ids are rejected', () => {
  const orphan = validateStyleProfile({id: 'x', name: 'X', extends: 'nope'});
  assert.ok(!orphan.ok && orphan.issues.some((issue) => issue.path === 'extends'));
  const {issues} = createStyleRegistry([HASKA_CYBER, HASKA_CYBER]);
  assert.equal(issues.length, 1);
});

test('platform params fall back to defaults and merge safe-area overrides', () => {
  assert.deepEqual(platformParams(HASKA_CYBER, 'youtube'), PLATFORM_DEFAULTS.youtube);
  const custom = {...HASKA_CYBER, platforms: {tiktok: {safeArea: {bottom: 500}}}};
  const params = platformParams(custom, 'tiktok');
  assert.equal(params.safeArea.bottom, 500);
  assert.equal(params.safeArea.top, PLATFORM_DEFAULTS.tiktok.safeArea.top);
  assert.equal(params.height, 1920);
});

test('msToFrames rounds to the nearest frame', () => {
  assert.equal(msToFrames(1500, 30), 45);
  assert.equal(msToFrames(1234, 30), 37);
});
