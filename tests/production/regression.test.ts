import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {findProjectRoot} from '../../src/production/store.ts';

// Non-rendering guards that the foundation work left existing entry points intact.
const ROOT = findProjectRoot(import.meta.dirname);
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

test('all existing compositions are still registered in root.tsx', () => {
  const root = read('src/root.tsx');
  for (const id of ['CybersecurityIntro', 'CyberGrid3D', 'AudioExplainerYouTube', 'AudioExplainerReel', 'AudioExplainerTikTok']) {
    assert.match(root, new RegExp(`id="${id}"`), id);
  }
});

test('existing render scripts and npm commands are unchanged in behavior', () => {
  assert.match(read('render-sample.sh'), /CybersecurityIntro/);
  assert.match(read('render-audio.sh'), /audio_motion\.py/);
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const name of ['typecheck', 'compositions', 'render', 'render:3d', 'audio', 'audio:sample', 'audio:check']) {
    assert.ok(scripts[name], name);
  }
});

test('the audio render path is gated before any render work starts', () => {
  const python = read('scripts/audio_motion.py');
  const renderBody = python.slice(python.indexOf('def render('));
  assert.ok(renderBody.indexOf('gate_approval(project_id)') > 0);
  assert.ok(renderBody.indexOf('gate_approval(project_id)') < renderBody.indexOf('activate(project_id)'));
  assert.ok(renderBody.indexOf('gate_approval(project_id)') < renderBody.indexOf('"render"'));
});

test('the /create-video workflow only references skills, files and CLI commands that exist', () => {
  const command = read('.claude/commands/create-video.md');
  assert.match(command, /^---\ndescription: .+\nargument-hint: .+\nallowed-tools: .+\n---/);
  for (const path of command.match(/\.agents\/skills\/[\w\-./]+\.md/g) ?? []) assert.ok(existsSync(join(ROOT, path)), `${path} exists`);
  for (const path of ['docs/production-workflow.md', 'src/production/routing.ts', 'src/production/render/shots.tsx']) assert.ok(existsSync(join(ROOT, path)), path);

  // Every `npm run production -- <command>` the workflow mentions must be a real CLI command.
  const cliSource = read('scripts/production.ts');
  const mentioned = new Set([...command.matchAll(/npm run production -- ([a-z-]+)/g)].map((match) => match[1]));
  assert.ok(mentioned.size >= 10);
  for (const name of mentioned) assert.match(cliSource, new RegExp(`case '${name}'|\\n  ${name}[ \\n]|approval init`), name);

  // Expensive or human-only actions must not be pre-approved for the model.
  const tools = command.match(/^allowed-tools: (.+)$/m)![1];
  assert.doesNotMatch(tools, /production -- render/);
  assert.doesNotMatch(tools, /approval approve|approval reject|approval reopen/);
  assert.doesNotMatch(tools, /blender-studio|Bash\(\*\)/);
  assert.match(command, /Do not approve it yourself/);
});

test('ProductionVideo and the shared motion library are wired into the bundle entry', () => {
  const root = read('src/root.tsx');
  assert.match(root, /id="ProductionVideo"/);
  assert.match(root, /calculateMetadata=\{calculateProductionMetadata\}/);
  const active = JSON.parse(read('src/data/active-production.json'));
  assert.ok(active.graph && active.style && Array.isArray(active.assets), 'active-production.json carries graph, style and assets');
  assert.equal(active.style.id, 'haska-cyber');
});

test('previews stay local and the preview server exposes no private files', () => {
  assert.match(read('scripts/studio.mjs'), /force-loopback\.cjs/);
  assert.match(read('scripts/studio.mjs'), /--ipv4/);
  assert.match(read('run-studio.sh'), /scripts\/studio\.mjs/);
  const ignore = read('.gitignore');
  for (const entry of ['node_modules/', '.cache/', 'out/', 'tools/', '.env', 'public/renders/', '*.mp4', 'public/audio-projects/*/*.wav']) assert.ok(ignore.includes(entry), entry);
  // Only public/ is served; nothing there may look like a credential.
  const served: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const path = `${dir}/${name}`;
      if (statSync(join(ROOT, path)).isDirectory()) walk(path);
      else served.push(path);
    }
  };
  walk('public');
  const sensitive = served.filter((path) => /(^|\/)\.|secret|token|credential|passw|\.env|\.pem$|\.key$|id_rsa/i.test(path) && !path.endsWith('.gitkeep'));
  assert.deepEqual(sensitive, []);
});
