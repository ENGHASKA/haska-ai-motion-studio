#!/usr/bin/env node
// Compiles the production-foundation TypeScript with the project's own tsc, then runs it with plain Node.
// Usage: node scripts/ts-run.mjs cli [args...] | node scripts/ts-run.mjs test
import {spawnSync} from 'node:child_process';
import {mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.cache', 'production-build');
const [mode, ...args] = process.argv.slice(2);

if (mode !== 'cli' && mode !== 'test') {
  console.error('usage: ts-run.mjs cli [args...] | test');
  process.exit(2);
}

const compile = spawnSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(root, 'tsconfig.production.json')], {cwd: root, stdio: 'inherit'});
if (compile.status !== 0) process.exit(compile.status ?? 1);

mkdirSync(out, {recursive: true});
writeFileSync(join(out, 'package.json'), '{"type":"module"}\n');

const testDir = join(out, 'tests', 'production');
const nodeArgs = mode === 'cli'
  ? [join(out, 'scripts', 'production.js'), ...args]
  : ['--test', ...readdirSync(testDir).filter((name) => name.endsWith('.test.js')).map((name) => join(testDir, name))];

process.exit(spawnSync(process.execPath, nodeArgs, {cwd: root, stdio: 'inherit'}).status ?? 1);
