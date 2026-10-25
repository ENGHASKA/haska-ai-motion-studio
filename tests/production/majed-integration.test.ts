import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {test} from 'node:test';
import {BUILTIN_STYLE_PROFILES, createStyleRegistry} from '../../src/production/style-profile.ts';

const ROOT = process.env.HASKA_PROJECT_ROOT ?? process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const json = (path: string) => JSON.parse(read(path));
const python = (args: string[]) => spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-I', ...args], {cwd: ROOT, encoding: 'utf8'});
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = `${dir}/${name}`;
    if (statSync(join(ROOT, path)).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
};

test('parity matrix: valid statuses, real evidence paths, and generated files are fresh', () => {
  const matrix = json('docs/majed/parity-matrix.json');
  assert.deepEqual(matrix.statuses, ['integrated', 'adapted', 'platform-optional', 'blocked', 'unavailable']);
  const requested = ['arabic-ad-editing', 'motion-video-generation', 'motion-preset-library', 'visual-style-library', 'arabic-kinetic-typography', 'text-behind-subject', 'podcast-to-reels', 'montage-rhythm', 'silence-and-text-cuts', 'narration-driven-motion', 'one-shot-transitions', 'cover-thumbnail', 'editable-timeline', 'website-product-explainer', 'reference-styling', 'sound-finishing', 'editor-interop'];
  const ids = matrix.rows.map((row: {id: string}) => row.id);
  for (const id of requested) assert.ok(ids.includes(id), `missing capability ${id}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const row of matrix.rows) {
    assert.ok(matrix.statuses.includes(row.status), `${row.id}: status ${row.status}`);
    assert.ok(row.reason.length > 20, `${row.id}: needs an exact reason`);
    for (const evidence of row.evidence) assert.ok(existsSync(join(ROOT, evidence)), `${row.id}: evidence ${evidence} does not exist`);
    if (row.status === 'blocked' || row.status === 'platform-optional') assert.match(row.verified, /not run|synthetic|pixel|no real/i, `${row.id}: do not claim verification for ${row.status}`);
  }
  const counts = Object.fromEntries(matrix.statuses.map((s: string) => [s, matrix.rows.filter((r: {status: string}) => r.status === s).length]));
  assert.deepEqual(matrix.counts, counts);
  const fresh = python(['scripts/gen_parity_matrix.py', '--check']);
  assert.equal(fresh.status, 0, fresh.stdout + fresh.stderr);
});

test('vendored upstream files match their recorded SHA-256 and exclude promotion, installers, and auto-update', () => {
  const manifest = json('third_party/majed-video/UPSTREAM.json');
  assert.equal(manifest.upstream.commit, '886cae69add821367f6c7bb9d9115a34e2427b21');
  assert.match(manifest.autoUpdate, /disabled/);
  for (const file of manifest.files) {
    const bytes = readFileSync(join(ROOT, file.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `${file.path} was modified`);
  }
  const vendored = walk('third_party/majed-video');
  assert.equal(vendored.filter((p) => /SKILL\.md$|00_setup|keyword-automation|studio\.py/.test(p)).length, 0);
  for (const path of vendored.filter((p) => /\.(md|js|json)$/.test(p))) assert.doesNotMatch(read(path), /zorcha|rsync -a --delete/i, `${path} carries promotion or an updater`);
});

test('no machine-specific absolute paths or credentials in portable code', () => {
  const files = [...walk('src'), ...walk('scripts'), ...walk('config'), ...walk('.agents/skills/haska-video'), 'package.json', 'run-studio.sh'].filter((p) => /\.(ts|tsx|mjs|cjs|js|py|sh|ps1|json|md)$/.test(p) && !p.endsWith('package-lock.json'));
  const offenders = files.filter((path) => /\/(home|mnt|Users)\/[a-z]|[A-Z]:\\Users\\/i.test(read(path)) && !path.startsWith('scripts/package_lib.py') && !path.startsWith('scripts/gen_parity') && !path.endsWith('derive_majed_engine.py'));
  assert.deepEqual(offenders.map((p) => relative('.', p)), []);
  for (const path of files) assert.doesNotMatch(read(path), /sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY/, path);
});

test('skills: the router exists, every mode file exists, create-video routes to it and still cannot approve or render', () => {
  const router = read('.agents/skills/haska-video/SKILL.md');
  assert.match(router, /^---\nname: haska-video\n/);
  const modes = [...router.matchAll(/`(modes\/[a-z-]+\.md)`/g)].map((m) => m[1]);
  assert.ok(modes.length >= 9);
  for (const mode of new Set(modes)) assert.ok(existsSync(join(ROOT, '.agents/skills/haska-video', mode)), mode);
  assert.doesNotMatch(router + modes.map((m) => read(`.agents/skills/haska-video/${m}`)).join('\n'), /discount|affiliate code|follow me|instagram\.com/i);
  const command = read('.claude/commands/create-video.md');
  assert.match(command, /haska-video\/SKILL\.md/);
  const tools = command.split('\n').find((line) => line.startsWith('allowed-tools:')) ?? '';
  assert.doesNotMatch(tools, /approval approve|production -- render|blender-studio|Bash\(\*\)/);
  assert.ok(existsSync(join(ROOT, '.claude/commands/audio-to-motion.md')));
});

test('the 17 upstream styles are valid StyleProfiles and stay in sync with the vendored source', () => {
  const files = readdirSync(join(ROOT, 'production/style-profiles')).filter((f) => f.startsWith('majed-'));
  assert.equal(files.length, 17);
  const {issues} = createStyleRegistry([...BUILTIN_STYLE_PROFILES, ...files.map((f) => json(`production/style-profiles/${f}`))]);
  assert.deepEqual(issues, []);
  const run = spawnSync(process.execPath, ['scripts/derive_majed_styles.mjs', '--check'], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stdout);
  const engine = python(['scripts/derive_majed_engine.py', '--check']);
  assert.equal(engine.status, 0, engine.stdout);
});

test('move smoke reports (when present) show every drawable move rendered and no errors', () => {
  const path = 'production/reports/moves-smoke.json';
  if (!existsSync(join(ROOT, path))) return;
  const report = json(path);
  const results = report.moves;
  assert.equal(results.length, 100);
  assert.equal(results.filter((r: {status: string}) => r.status === 'error').length, 0);
  assert.equal(results.filter((r: {status: string}) => r.status === 'draws').length, 97);
});

test('Python media-tool unit tests pass', () => {
  const run = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'unittest', 'discover', '-s', 'tests/python'], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
});
