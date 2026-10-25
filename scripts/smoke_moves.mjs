#!/usr/bin/env node
// Renders every move of the Majed motion bank at several sample times through Remotion's own browser and records, per move,
// whether it drew without error and how much of the frame it covered. Stills only (no video). Cross-platform (Node + Remotion).
//   node scripts/smoke_moves.mjs [--only id1,id2] [--out production/reports/moves-smoke.json] [--keep DIR]
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const only = option('only', '')?.split(',').filter(Boolean);
const outFile = resolve(ROOT, option('out', 'production/reports/moves-smoke.json'));
const keep = option('keep', '');

const catalog = JSON.parse(readFileSync(join(ROOT, 'third_party/majed-video/motion/moves/catalog.json'), 'utf8')).moves;
const TIMES = [0.5, 1.2, 2.4];

const serveUrl = await bundle({entryPoint: join(ROOT, 'src/index.ts'), onProgress: () => undefined});
const browser = await openBrowser('chrome', {chromeMode: 'headless-shell'});
const results = [];
const scratch = keep ? resolve(keep) : join(tmpdir(), 'haska-moves-smoke');
mkdirSync(scratch, {recursive: true});

for (const move of catalog.filter((m) => !only?.length || only.includes(m.id))) {
  const row = {n: move.n, id: move.id, cat: move.cat, samples: []};
  if (move.cat === 'rule') {
    // Timing rules (J-cut, match cut, speed ramp) are guidance or helpers, not drawing functions.
    row.status = 'rule';
    results.push(row);
    process.stdout.write('r');
    continue;
  }
  for (const time of TIMES) {
    const logs = [];
    try {
      const composition = await selectComposition({serveUrl, id: 'MoveShowcase', inputProps: {move: move.id, time, report: true}, puppeteerInstance: browser});
      await renderStill({
        composition, serveUrl, puppeteerInstance: browser, frame: 0, imageFormat: 'png', output: join(scratch, `${String(move.n).padStart(3, '0')}-${move.id}-${time}.png`),
        inputProps: {move: move.id, time, report: true}, onBrowserLog: (log) => logs.push(log.text), timeoutInMilliseconds: 60000,
      });
    } catch (error) {
      logs.push(`[render-error] ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
    const hit = logs.map((l) => l.match(/\[move-result\] (\{.*\})/)).find(Boolean);
    row.samples.push(hit ? JSON.parse(hit[1]) : {t: time, ok: false, error: logs.find((l) => /error/i.test(l)) ?? 'no result reported', coverage: 0});
  }
  const failed = row.samples.filter((s) => !s.ok);
  row.status = failed.length === 0 ? (row.samples.some((s) => s.coverage > 0.002) ? 'draws' : 'blank') : 'error';
  row.error = failed[0]?.error;
  results.push(row);
  process.stdout.write(`${row.status === 'draws' ? '.' : row.status === 'blank' ? 'b' : 'E'}`);
}
await browser.close({silent: true});
process.stdout.write('\n');

const summary = results.reduce((acc, r) => ({...acc, [r.status]: (acc[r.status] ?? 0) + 1}), {});
mkdirSync(dirname(outFile), {recursive: true});
writeFileSync(outFile, `${JSON.stringify({generatedBy: 'scripts/smoke_moves.mjs', times: TIMES, total: results.length, summary, moves: results}, null, 2)}\n`);
console.log(JSON.stringify(summary), `-> ${outFile}`);
for (const r of results.filter((x) => x.status !== 'draws')) console.log(` ${r.n} ${r.id}: ${r.status}${r.error ? ' — ' + r.error : ''}`);
