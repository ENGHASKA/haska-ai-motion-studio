#!/usr/bin/env node
// Capture a web page as a still for website / product explainers, with the machine's own Chromium/Chrome/Edge.
//   node scripts/web_capture.mjs URL OUT.png [--width 1280] [--height 800]
// Runs only when you ask for it and opens only the URL you give (http, https or file). Use pages you own or have
// permission to capture: the captured pixels, and any third-party logos in them, are NOT licensed by this tool.
import {existsSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {browserExecutable, run} from './lib/platform.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const [url, out] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!url || !out) {
  console.error('usage: web_capture.mjs URL OUT.png [--width N] [--height N]');
  process.exit(2);
}
if (!/^(https?|file):/i.test(url)) {
  console.error('only http(s) and file URLs are supported');
  process.exit(2);
}
const browser = browserExecutable();
if (!browser) {
  console.error('No Chromium/Chrome/Edge found. Install one or set HASKA_BROWSER (see config/env.example).');
  process.exit(1);
}
const target = resolve(out);
mkdirSync(dirname(target), {recursive: true});
const profile = mkdtempSync(join(tmpdir(), 'haska-capture-'));
try {
  const result = run(browser, ['--headless', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`, `--window-size=${flag('width', 1280)},${flag('height', 800)}`, '--virtual-time-budget=4000', `--screenshot=${target}`, url], {timeout: 60000});
  if (!existsSync(target)) {
    console.error(`capture failed: ${(result.stderr || '').split('\n').slice(-3).join(' ')}`);
    process.exit(1);
  }
  console.log(`captured ${url} -> ${target}`);
} finally {
  rmSync(profile, {recursive: true, force: true});
}
