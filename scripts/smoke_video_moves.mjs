#!/usr/bin/env node
// Verifies that footage-compositing moves really draw video pixels (not the placeholder) through Remotion's render path.
// Generates a small synthetic test pattern (no real footage) into public/_smoke/, renders stills, then removes it.
//   node scripts/smoke_video_moves.mjs [--moves a,b,c]
import {spawnSync} from 'node:child_process';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const moves = (args.includes('--moves') ? args[args.indexOf('--moves') + 1] : 'craneUp,glassType,phoneMockup,videoText,tilt3D,dynamicIsland,craneUp,swishSettle,motionEcho,pushIn').split(',');
const ffmpeg = process.env.HASKA_FFMPEG || 'ffmpeg';
const clip = join(ROOT, 'public', '_smoke', 'clip.mp4');
mkdirSync(dirname(clip), {recursive: true});
const made = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', clip]);
if (made.status !== 0) throw new Error(`ffmpeg could not create the test pattern: ${made.stderr}`);

const results = [];
try {
  const serveUrl = await bundle({entryPoint: join(ROOT, 'src/index.ts'), onProgress: () => undefined});
  const browser = await openBrowser('chrome', {chromeMode: 'headless-shell'});
  for (const move of moves) {
    const inputProps = {src: '_smoke/clip.mp4', move, time: 1.2, report: true};
    const logs = [];
    try {
      const composition = await selectComposition({serveUrl, id: 'MoveVideoShowcase', inputProps, puppeteerInstance: browser});
      await renderStill({composition, serveUrl, puppeteerInstance: browser, frame: 0, imageFormat: 'png', output: join(tmpdir(), `haska-video-move-${move}.png`), inputProps, onBrowserLog: (l) => logs.push(l.text), timeoutInMilliseconds: 60000});
    } catch (error) {
      logs.push(`[render-error] ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    }
    const hit = logs.map((l) => l.match(/\[move-result\] (\{.*\})/)).find(Boolean);
    const info = hit ? JSON.parse(hit[1]) : {ok: false, error: logs.find((l) => /error/i.test(l)) ?? 'no result'};
    results.push({move, ok: Boolean(info.ok), usedVideo: Boolean(info.usedVideo), coverage: info.coverage ?? 0, error: info.error});
    console.log(`${info.ok && info.usedVideo ? 'OK  ' : info.ok ? 'ok* ' : 'FAIL'} ${move} usedVideo=${Boolean(info.usedVideo)} ${info.error ?? ''}`);
  }
  await browser.close({silent: true});
} finally {
  rmSync(join(ROOT, 'public', '_smoke'), {recursive: true, force: true});
}
const out = join(ROOT, 'production', 'reports', 'video-moves-smoke.json');
writeFileSync(out, `${JSON.stringify({generatedBy: 'scripts/smoke_video_moves.mjs', input: 'synthetic ffmpeg testsrc2 pattern (not real footage)', results}, null, 2)}\n`);
console.log(`-> ${out}`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
