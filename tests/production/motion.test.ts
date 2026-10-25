import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cameraTransform, glowFilter, parallaxCorrection, parallaxTransform} from '../../src/motion/camera.ts';
import {cubicBezier, durationFrames, easingOf, familyFor, fontStack, paletteVariables, platformForSize, resolvePlatform, safeBox, textStyle, trackingFor, weightFor, withAlpha} from '../../src/motion/style.ts';
import {planTimeline, transitionStyles, windowProgress} from '../../src/motion/transitions.ts';
import {titleBlocks, networkBlocks, blocksForShot} from '../../src/production/layout.ts';
import {routeName, isTimeAlignedName, BUILTIN_SHOT_COMPONENTS} from '../../src/production/routing.ts';
import type {Shot, ShotGraph} from '../../src/production/shot-graph.ts';
import {HASKA_CYBER, HASKA_SIGNAL, createStyleRegistry, platformParams} from '../../src/production/style-profile.ts';
import {frameToMs, msRangeToFrames, msToFrame, durationFramesFor} from '../../src/production/timing.ts';

const shot = (id: string, startFrame: number, durationFrames: number, extra: Partial<Shot> = {}): Shot => ({
  id, track: 0, startFrame, durationFrames, description: id, engine: 'remotion', assets: [], approval: 'draft', onScreenText: id, ...extra,
});
const graph = (shots: Shot[]): ShotGraph => ({schemaVersion: 2, id: 'g', title: 'g', fps: 30, width: 1920, height: 1080, durationFrames: 300, version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', shots});

test('cubic-bezier easing: endpoints, monotonic for ease curves, identity for the diagonal', () => {
  const ease = cubicBezier([0.65, 0, 0.35, 1]);
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  let previous = 0;
  for (let t = 0.05; t < 1; t += 0.05) {
    const y = ease(t);
    assert.ok(y >= previous, `monotonic at ${t}`);
    previous = y;
  }
  assert.ok(Math.abs(cubicBezier([0.25, 0.25, 0.75, 0.75])(0.4) - 0.4) < 1e-3);
  assert.ok(ease(0.5) > 0.49 && ease(0.5) < 0.51, 'symmetric curve passes through the middle');
  assert.ok(cubicBezier([0.16, 1, 0.3, 1])(0.2) > 0.5, 'ease-out is front-loaded');
});

test('shared frame model: one rounding rule everywhere', () => {
  assert.equal(msToFrame(2180, 30), 65);
  assert.equal(frameToMs(65, 30), 2167);
  assert.deepEqual(msRangeToFrames(1200, 2180, 30), {from: 36, to: 65});
  assert.equal(msRangeToFrames(100, 101, 30).to, msRangeToFrames(100, 101, 30).from + 1, 'never zero-length');
  assert.equal(durationFramesFor(3865, 30), 116);
  // adjacent ranges share a boundary, so scenes can never overlap or leave a gap
  const a = msRangeToFrames(1200, 2180, 30);
  const b = msRangeToFrames(2180, 3865, 30);
  assert.equal(a.to, b.from);
});

test('style profiles drive real values: fonts, tracking, palette variables, durations, easing', () => {
  assert.equal(familyFor(HASKA_CYBER, 'display', 'latin'), '"IBM Plex Sans Arabic", Arial, sans-serif');
  assert.equal(familyFor(HASKA_CYBER, 'display', 'arabic'), '"IBM Plex Sans Arabic", Arial, sans-serif');
  assert.equal(familyFor(HASKA_CYBER, 'mono', 'latin'), '"IBM Plex Sans Arabic", monospace');
  assert.equal(trackingFor(HASKA_CYBER, 'mono', 'latin'), 0.18);
  assert.equal(trackingFor(HASKA_CYBER, 'mono', 'arabic'), 0, 'letter spacing would break Arabic joining');
  assert.equal(weightFor(HASKA_CYBER, 'body', 'arabic'), 700);
  assert.equal(textStyle(HASKA_CYBER, 'display', 'arabic', 80).letterSpacing, '0em');
  assert.equal(textStyle(HASKA_CYBER, 'display', 'latin', 80).letterSpacing, '-0.02em');
  assert.equal(fontStack({family: 'My Font', fallbacks: ['serif'], weight: 400}), '"My Font", serif');

  assert.equal(paletteVariables(HASKA_CYBER)['--hk-primary'], '#53f6ff');
  assert.equal(paletteVariables(HASKA_SIGNAL)['--hk-primary'], '#7fffe3');
  assert.notEqual(paletteVariables(HASKA_CYBER)['--hk-background'], paletteVariables(HASKA_SIGNAL)['--hk-background']);

  assert.equal(durationFrames(HASKA_CYBER, 'standard', 30), 18);
  assert.equal(durationFrames(HASKA_CYBER, 'quick', 60), 15, 'durations follow the composition fps');
  assert.equal(easingOf(HASKA_CYBER, 'enter')(0.2) > easingOf(HASKA_CYBER, 'standard')(0.2), true);
  assert.equal(easingOf(HASKA_CYBER, 'missing-name')(0.5), easingOf(HASKA_CYBER, 'standard')(0.5), 'unknown names fall back to standard');
  assert.equal(withAlpha('#53f6ff', 0.5), '#53f6ff80');
});

test('an extending profile changes the rendered values without touching the base', () => {
  const {registry, issues} = createStyleRegistry([HASKA_CYBER, {id: 'warm', name: 'Warm', extends: 'haska-cyber', palette: {primary: '#ffb347', accent: '#ff6b6b'}, typography: {display: {family: 'DejaVu Sans', fallbacks: ['sans-serif'], weight: 800, tracking: 0.02}}, motion: {durationsMs: {quick: 100, standard: 300, slow: 900}}}]);
  assert.deepEqual(issues, []);
  const warm = registry.get('warm')!;
  assert.equal(paletteVariables(warm)['--hk-primary'], '#ffb347');
  assert.equal(paletteVariables(warm)['--hk-text'], HASKA_CYBER.palette.text);
  assert.equal(familyFor(warm, 'display', 'latin'), '"DejaVu Sans", sans-serif');
  assert.equal(trackingFor(warm, 'display', 'latin'), 0.02);
  assert.equal(durationFrames(warm, 'standard', 30), 9);
  assert.equal(durationFrames(HASKA_CYBER, 'standard', 30), 18);
});

test('platforms: safe boxes, sizes, and per-platform title scale reach the layout', () => {
  assert.equal(platformForSize(1920, 1080), 'youtube');
  assert.equal(platformForSize(1080, 1920), 'reel');
  assert.equal(platformForSize(1080, 1080), 'square');
  const youtube = resolvePlatform(HASKA_CYBER, 'youtube', 1920, 1080);
  assert.deepEqual(safeBox(youtube), {left: 96, top: 64, width: 1728, height: 952});
  const reel = resolvePlatform(HASKA_CYBER, 'reel', 1080, 1920);
  assert.deepEqual(safeBox(reel), {left: 64, top: 200, width: 952, height: 1400});

  const wide = shot('s', 0, 30, {composition: 'title', engineOptions: {eyebrow: 'Intro', subtitle: 'Sub'}});
  const landscape = titleBlocks(wide, safeBox(youtube), platformParams(HASKA_CYBER, 'youtube').titleScale);
  const vertical = titleBlocks(wide, safeBox(reel), platformParams(HASKA_CYBER, 'reel').titleScale);
  assert.deepEqual(landscape.map((block) => block.key), ['eyebrow', 'headline', 'subtitle']);
  assert.ok(vertical[1].fontSize < landscape[1].fontSize, 'vertical platforms use smaller display type');
  assert.ok(vertical.every((block) => block.rect.left >= 64 && block.rect.left + block.rect.width <= 1080 - 64), 'text boxes are inside the reel safe area');
  assert.equal(networkBlocks(wide, safeBox(youtube)).length, 1);
});

test('routing: engines, named compositions, legacy visualKind, text fallback, and errors', () => {
  assert.equal(routeName(shot('a', 0, 30, {engine: 'blender'})).name, 'blender');
  assert.equal(routeName(shot('a', 0, 30, {composition: 'network'})).name, 'network');
  assert.equal(routeName(shot('a', 0, 30, {composition: 'CybersecurityIntro'})).name, 'CybersecurityIntro');
  assert.equal(routeName(shot('a', 0, 30, {visualKind: 'shield'})).name, 'semantic');
  assert.equal(routeName(shot('a', 0, 30)).name, 'title');
  assert.match(routeName(shot('a', 0, 30, {composition: 'Nope'})).error ?? '', /No shot component named "Nope"/);
  assert.match(routeName(shot('a', 0, 30, {engine: 'three'})).error ?? '', /must name a registered composition/);
  assert.match(routeName(shot('a', 0, 30, {onScreenText: undefined, title: undefined})).error ?? '', /nothing|no composition/i);
  assert.equal(routeName(shot('a', 0, 30, {composition: 'Custom'}), ['Custom']).name, 'Custom');
  assert.ok(isTimeAlignedName(shot('a', 0, 30, {composition: 'CyberGrid3D'})));
  assert.ok(!isTimeAlignedName(shot('a', 0, 30, {composition: 'title'})));
  assert.deepEqual(blocksForShot(shot('a', 0, 30, {engine: 'blender'}), safeBox(resolvePlatform(HASKA_CYBER, 'youtube')), 1, {width: 1920, height: 1080}), []);
});

test('registry in shots.tsx covers every routed built-in', async () => {
  const {readFileSync} = await import('node:fs');
  const {findProjectRoot} = await import('../../src/production/store.ts');
  const source = readFileSync(`${findProjectRoot(import.meta.dirname)}/src/production/render/shots.tsx`, 'utf8');
  for (const name of BUILTIN_SHOT_COMPONENTS) assert.match(source, new RegExp(`['"]?${name}['"]?: \\{component:`), name);
});

test('transition styles: endpoints are exact and the types behave as named', () => {
  for (const type of ['crossfade', 'push', 'wipe', 'camera-pull', 'zoom-through', 'match-cut'] as const) {
    const start = transitionStyles(type, 0);
    const end = transitionStyles(type, 1);
    // At p=1 the incoming shot is fully visible and untransformed.
    assert.ok(end.incoming.opacity === undefined || end.incoming.opacity === 1, `${type} incoming opacity at 1`);
    assert.ok(start.incoming.opacity === 0 || start.incoming.clipPath !== undefined || start.incoming.transform !== undefined, `${type} incoming starts hidden/offset`);
  }
  assert.deepEqual(transitionStyles('cut', 0.5), {outgoing: {}, incoming: {}});
  assert.equal(transitionStyles('crossfade', 0.25).incoming.opacity, 0.25);
  assert.equal(transitionStyles('crossfade', 7).incoming.opacity, 1, 'progress is clamped');
  assert.equal(transitionStyles('push', 0).incoming.transform, 'translateX(100%)');
  assert.equal(transitionStyles('wipe', 0.5).incoming.clipPath, 'inset(0 50% 0 0)');
  assert.equal(windowProgress(15, 10, 10), 0.5);
  assert.equal(windowProgress(0, 10, 10), 0);
});

test('timeline planning: outgoing tails, cuts, easing default, clamping, layers, time-aligned suppression', () => {
  const planned = planTimeline(graph([
    shot('a', 0, 60),
    shot('b', 60, 60, {transitionIn: {type: 'camera-pull', durationFrames: 12}}),
    shot('c', 120, 60, {transitionIn: {type: 'cut', durationFrames: 0}}),
    shot('d', 180, 10, {transitionIn: {type: 'crossfade', durationFrames: 30, easing: 'enter'}}),
    shot('overlay', 20, 40, {track: 1}),
  ]));
  const by = Object.fromEntries(planned.map((item) => [item.shot.id, item]));
  assert.equal(by.a.mountFrames, 72, 'outgoing shot stays mounted for the transition');
  assert.deepEqual(by.a.transitionOut, {type: 'camera-pull', startLocal: 60, durationFrames: 12, easing: 'standard'});
  assert.equal(by.b.transitionIn?.durationFrames, 12);
  assert.equal(by.b.mountFrames, 60, 'a cut adds no tail');
  assert.equal(by.c.transitionIn, undefined);
  assert.equal(by.d.transitionIn?.durationFrames, 10, 'duration is clamped to the shorter shot');
  assert.equal(by.d.transitionIn?.easing, 'enter');
  assert.equal(planned[planned.length - 1].shot.id, 'overlay', 'higher tracks render on top');

  const aligned = planTimeline(graph([shot('x', 0, 60, {composition: 'CybersecurityIntro'}), shot('y', 60, 60, {composition: 'CybersecurityIntro', transitionIn: {type: 'crossfade', durationFrames: 12}})]), {isTimeAligned: (s) => isTimeAlignedName(s)});
  assert.equal(aligned.find((item) => item.shot.id === 'y')?.transitionIn, undefined, 'identical time-aligned scenes would double-draw; transition skipped');
});

test('camera and parallax math: depth 1 is neutral, depth 0 pins to the screen, layers stay consistent', () => {
  const canvas = {width: 1920, height: 1080};
  const camera = {x: 1200, y: 400, scale: 1.8};
  const neutral = parallaxCorrection(camera, 1, canvas);
  assert.ok(Math.abs(neutral.k - 1) < 1e-9 && Math.abs(neutral.tx) < 1e-9 && Math.abs(neutral.ty) < 1e-9);

  // Apply rig R then the layer correction T, compare with the layer's own desired matrix O.
  const rig = (x: number, y: number) => ({x: 960 + camera.scale * (x - camera.x), y: 540 + camera.scale * (y - camera.y)});
  for (const depth of [0, 0.3, 0.7, 1]) {
    const {k, tx, ty} = parallaxCorrection(camera, depth, canvas);
    const sl = 1 + (camera.scale - 1) * depth;
    const lx = 960 + (camera.x - 960) * depth;
    const ly = 540 + (camera.y - 540) * depth;
    for (const [px, py] of [[100, 100], [960, 540], [1700, 900]]) {
      const final = rig(k * px + tx, k * py + ty);
      const desired = {x: 960 + sl * (px - lx), y: 540 + sl * (py - ly)};
      assert.ok(Math.abs(final.x - desired.x) < 1e-6 && Math.abs(final.y - desired.y) < 1e-6, `depth ${depth}`);
    }
  }
  const pinned = parallaxCorrection(camera, 0, canvas);
  const screen = rig(pinned.k * 300 + pinned.tx, pinned.k * 200 + pinned.ty);
  assert.ok(Math.abs(screen.x - 300) < 1e-6 && Math.abs(screen.y - 200) < 1e-6, 'depth 0 does not move with the camera');
  assert.match(parallaxTransform(camera, 0.5, canvas), /^translate\(.+px, .+px\) scale\(.+\)$/);
  assert.match(cameraTransform({x: 960, y: 540, scale: 1}, canvas), /translate\(960px, 540px\) rotate\(0deg\) scale\(1\)/);
});

test('glow is restrained: clamped intensity and radius, off at zero', () => {
  assert.equal(glowFilter('#53f6ff', 0), 'none');
  assert.equal(glowFilter('#53f6ff', 1, 0), 'none');
  assert.equal(glowFilter('#53f6ff', 9, 999), glowFilter('#53f6ff', 1, 40));
  assert.match(glowFilter('#53f6ffaa', 0.5), /drop-shadow\(0 0 .+px #53f6ff/);
});
