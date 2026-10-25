#!/usr/bin/env node
// Frame-level check of the Majed-derived compositions with SYNTHETIC media (no real footage, no full render):
// TalkingHeadReel (cut plan from the silence tool), MontageReel (beats from the beat tool), CoverReel/CoverYouTube (rules).
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {ffmpegPath, pythonCommand} from './lib/platform.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'haska-majed-'));
const fixtures = join(ROOT, 'public', '_smoke');
mkdirSync(fixtures, {recursive: true});
const [python, ...pyPrefix] = pythonCommand();
const tool = (...args) => {
  const run = spawnSync(python, [...pyPrefix, '-I', join(ROOT, 'scripts', 'media_tools.py'), ...args], {encoding: 'utf8'});
  if (run.status !== 0) throw new Error(`media_tools ${args[0]}: ${run.stderr || run.stdout}`);
};
const ff = (...args) => {
  const run = spawnSync(ffmpegPath(), ['-v', 'error', '-y', ...args], {encoding: 'utf8'});
  if (run.status !== 0) throw new Error(run.stderr);
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({name, ok, detail});
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${detail}`);
};
const spread = (png) => {
  const run = spawnSync(python, [...pyPrefix, '-I', '-c', 'import sys;from PIL import Image,ImageStat;s=ImageStat.Stat(Image.open(sys.argv[1]).convert("L"));print(round(s.stddev[0],1))', png], {encoding: 'utf8'});
  return Number(run.stdout.trim());
};

try {
  // 4 s portrait clip: tone 1 s, silence 1.5 s, tone 1.5 s; plus a 120 BPM click track.
  ff('-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=f=300:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=1.5', '-f', 'lavfi', '-i', 'sine=f=300:d=1.5', '-filter_complex', '[1][2][3]concat=n=3:v=0:a=1[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-shortest', join(fixtures, 'clip.mp4'));
  ff('-f', 'lavfi', '-i', 'aevalsrc=sin(2*PI*1000*t)*exp(-30*mod(t\\,0.5)):s=22050:d=8', join(work, 'clicks.wav'));
  tool('silence', join(fixtures, 'clip.mp4'), join(work, 'plan.json'));
  tool('beats', join(work, 'clicks.wav'), join(work, 'beats.json'));
  const plan = JSON.parse(readFileSync(join(work, 'plan.json'), 'utf8'));
  const beats = JSON.parse(readFileSync(join(work, 'beats.json'), 'utf8'));
  check('silence tool removed the gap', plan.keep.length === 2 && plan.silences.length === 1, `keep=${JSON.stringify(plan.keep)}`);
  check('beat tool found ~120 BPM', Math.abs(beats.bpm - 120) < 3, `bpm=${beats.bpm}`);

  ff('-f', 'lavfi', '-i', 'color=c=0x00ff00:s=1080x1920:r=30:d=2,drawbox=x=240:y=660:w=600:h=600:color=red:t=fill', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', join(fixtures, 'green.mp4'));
  tool('matte', join(fixtures, 'green.mp4'), join(fixtures, 'matte.mp4'));
  const serveUrl = await bundle({entryPoint: join(ROOT, 'src/index.ts'), onProgress: () => undefined});
  const browser = await openBrowser('chrome', {chromeMode: 'headless-shell'});
  const still = async (id, inputProps, frame, label) => {
    const logs = [];
    const output = join(work, `${label}.png`);
    const composition = await selectComposition({serveUrl, id, inputProps, puppeteerInstance: browser});
    await renderStill({composition, serveUrl, puppeteerInstance: browser, frame, imageFormat: 'png', output, inputProps, onBrowserLog: (l) => logs.push(l.text), timeoutInMilliseconds: 60000});
    return {composition, output, logs};
  };

  const talk = await still('TalkingHeadReel', {src: '_smoke/clip.mp4', keep: plan.keep}, 40, 'talk');
  check('TalkingHeadReel duration equals the edited length', talk.composition.durationInFrames === plan.keep.reduce((s, k) => s + Math.round(k.end * 30) - Math.round(k.start * 30), 0), `frames=${talk.composition.durationInFrames}`);
  check('TalkingHeadReel draws footage', spread(talk.output) > 20, `stddev=${spread(talk.output)}`);

  const montage = await still('MontageReel', {clips: [{src: '_smoke/clip.mp4', available: 4}], beats: beats.beats}, 20, 'montage');
  check('MontageReel draws footage', spread(montage.output) > 20, `stddev=${spread(montage.output)}`);

  for (const [id, props] of [['CoverReel', {kind: 'reel-cover', title: 'عنوان الغلاف', subtitle: 'عنوان فرعي', report: true}], ['CoverYouTube', {kind: 'youtube', title: 'Cover title', report: true}]]) {
    const cover = await still(id, props, 0, id);
    const hit = cover.logs.map((l) => l.match(/\[cover-result\] (\{.*\})/)).find(Boolean);
    const info = hit ? JSON.parse(hit[1]) : undefined;
    check(`${id} follows the cover rules`, Boolean(info) && info.issues.length === 0 && info.fits, info ? `title ${info.fontSize}px issues=${JSON.stringify(info.issues)}` : 'no result');
  }
  // Text behind subject: green screen with a red "subject" box in the middle; the matte tool makes the matte; the headline must be hidden behind the box.
  const tbs = await still('TextBehindSubject', {src: '_smoke/green.mp4', matte: '_smoke/matte.mp4', text: 'HASKA', textStart: 0}, 12, 'tbs');
  const probe = spawnSync(python, [...pyPrefix, '-I', '-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");print(*im.getpixel((540,960)),*im.getpixel((540,300)))', tbs.output], {encoding: 'utf8'}).stdout.trim().split(' ').map(Number);
  const [cr, cg, cb] = probe;
  check('TextBehindSubject keeps the subject in front of the text', cr > 200 && cg < 60 && cb < 60, `centre pixel=${cr},${cg},${cb}`);
  check('TextBehindSubject shows the background elsewhere', probe[4] > 200 && probe[3] < 80, `background pixel=${probe.slice(3).join(',')}`);
  await browser.close({silent: true});
} finally {
  rmSync(fixtures, {recursive: true, force: true});
  rmSync(work, {recursive: true, force: true});
}
writeFileSync(join(ROOT, 'production', 'reports', 'majed-features-smoke.json'), `${JSON.stringify({generatedBy: 'scripts/smoke_majed_features.mjs', input: 'synthetic ffmpeg media', results}, null, 2)}\n`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
