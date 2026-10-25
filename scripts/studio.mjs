#!/usr/bin/env node
// Cross-platform launcher for the Remotion CLI (Linux, Windows, macOS). Studio is bound to loopback only.
//   node scripts/studio.mjs                      -> Remotion Studio on http://localhost:3000 (override with --port=N)
//   node scripts/studio.mjs render <args...>     -> `remotion render <args>`
// Any other first argument is passed to the Remotion CLI unchanged.
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT, browserExecutable} from './lib/platform.mjs';

const cli = join(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const args = process.argv.slice(2);
const studio = args.length === 0 || args[0].startsWith('--');
mkdirSync(join(ROOT, '.cache', 'npm'), {recursive: true});
mkdirSync(join(ROOT, '.cache', 'remotion'), {recursive: true});
mkdirSync(join(ROOT, 'out'), {recursive: true});

const command = studio ? ['studio', 'src/index.ts', ...(args.some((a) => a.startsWith('--port')) ? [] : ['--port=3000']), '--no-open', '--ipv4', ...args] : args;
const browser = browserExecutable();
if (browser && !command.some((a) => a.startsWith('--browser-executable'))) command.push(`--browser-executable=${browser}`);
if (studio) console.log(`Starting Remotion Studio at http://localhost:${(command.find((a) => a.startsWith('--port=')) ?? '--port=3000').slice(7)} (loopback only)`);

const child = spawn(process.execPath, [cli, ...command], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {...process.env, NPM_CONFIG_CACHE: join(ROOT, '.cache', 'npm'), NODE_OPTIONS: `--require=${JSON.stringify(join(ROOT, 'scripts', 'force-loopback.cjs'))}${process.env.NODE_OPTIONS ? ` ${process.env.NODE_OPTIONS}` : ''}`},
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
