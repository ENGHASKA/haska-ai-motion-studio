import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COVER_SPECS, checkCover} from '../../src/majed/cover-rules.ts';
import {beatEnvelope, planMontage} from '../../src/majed/montage.ts';
import {placeSpans, sourceToEditedFrame, totalFrames} from '../../src/majed/timeline.ts';

test('placeSpans tiles keep-spans back to back with no gaps or overlaps', () => {
  const keep = [{start: 0, end: 2}, {start: 3.9, end: 5.9}, {start: 8, end: 9.5}];
  const placed = placeSpans(keep, 30);
  placed.reduce((cursor, span) => {
    assert.equal(span.from, cursor);
    return cursor + span.durationInFrames;
  }, 0);
  assert.equal(totalFrames(keep, 30), 60 + 60 + 45);
  assert.equal(placed[1].trimBefore, Math.round(3.9 * 30));
});

test('sourceToEditedFrame maps kept time and rejects cut time', () => {
  const keep = [{start: 0, end: 2}, {start: 4, end: 6}];
  assert.equal(sourceToEditedFrame(keep, 30, 1), 30);
  assert.equal(sourceToEditedFrame(keep, 30, 4.5), 60 + 15);
  assert.equal(sourceToEditedFrame(keep, 30, 3), undefined);
});

test('planMontage cuts exactly on beat frames, covers the whole duration, and stays inside the sources', () => {
  const beats = Array.from({length: 16}, (_, i) => 0.5 * (i + 1));
  const cuts = planMontage([{src: 'a.mp4', available: 4}, {src: 'b.mp4', available: 3}], {fps: 30, beats, everyBeats: 2, durationInFrames: 240});
  assert.equal(cuts[0].from, 0);
  assert.equal(cuts.reduce((sum, cut) => sum + cut.durationInFrames, 0), 240);
  for (const cut of cuts) {
    assert.ok(cut.from === 0 || beats.some((b) => Math.round(b * 30) === cut.beatFrame));
    const limit = (cut.src === 'a.mp4' ? 4 : 3) * 30;
    assert.ok(cut.trimBefore + cut.durationInFrames <= limit, `cut ${cut.index} reads past its source`);
  }
  assert.deepEqual(planMontage([{src: 'a.mp4', available: 4}], {fps: 30, beats, durationInFrames: 240}), planMontage([{src: 'a.mp4', available: 4}], {fps: 30, beats, durationInFrames: 240}));
  assert.throws(() => planMontage([], {fps: 30, beats, durationInFrames: 60}));
});

test('beatEnvelope peaks on the beat and decays to zero', () => {
  assert.equal(beatEnvelope(30, [30, 60], 10), 1);
  assert.ok(beatEnvelope(35, [30, 60], 10) < 1);
  assert.equal(beatEnvelope(45, [30, 60], 10), 0);
  assert.equal(beatEnvelope(5, [30], 10), 0);
});

test('cover rules enforce size, safe-square and badge-zone limits', () => {
  const reel = COVER_SPECS['reel-cover'];
  const good = checkCover(reel, [{role: 'title', x: 90, y: 600, width: 900, height: 300, size: 190}]);
  assert.deepEqual(good, []);
  const bad = checkCover(reel, [{role: 'title', x: 90, y: 100, width: 900, height: 200, size: 120}, {role: 'text', x: 90, y: 700, width: 800, height: 100, size: 80}]);
  assert.deepEqual(bad.map((i) => i.rule).sort(), ['safe-square', 'text-size', 'title-size']);
  const yt = checkCover(COVER_SPECS.youtube, [{role: 'title', x: 80, y: 200, width: 700, height: 250, size: 200}, {role: 'logo', x: 1000, y: 440, width: 220, height: 220}]);
  assert.deepEqual(yt.map((i) => i.rule), ['badge-zone']);
  assert.equal(checkCover(reel, []).some((i) => i.rule === 'title-missing'), true);
});
