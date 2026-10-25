#!/usr/bin/env node
// Cross-platform environment check (Linux, Windows, macOS). Read-only: installs nothing, changes nothing.
//   node scripts/doctor.mjs [--json]
import {existsSync, lstatSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT, browserExecutable, ffmpegPath, ffprobePath, findTool, isLinux, isMac, isWindows, nvidia, pythonCommand, run, which} from './lib/platform.mjs';

const rows = [];
const add = (level, name, detail) => rows.push({level, name, detail});
const pass = (n, d = '') => add('PASS', n, d);
const warn = (n, d = '') => add('WARN', n, d);
const fail = (n, d = '') => add('FAIL', n, d);

const major = Number(process.versions.node.split('.')[0]);
(major >= 22 ? pass : fail)('Node.js >= 22', process.version);
const npm = which('npm');
(npm ? pass : fail)('npm', npm ?? 'not found');

const py = pythonCommand();
if (!py) fail('Python >= 3.10', isWindows ? 'not found: install Python 3 (winget install Python.Python.3.12) and tick "py launcher"' : 'not found: install python3');
else {
  pass('Python >= 3.10', py.join(' '));
  const venv = join(ROOT, '.venv', isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python');
  const interpreter = existsSync(venv) ? [venv] : py;
  const probe = run(interpreter[0], [...interpreter.slice(1), '-c', 'import numpy, scipy, PIL; print(numpy.__version__, scipy.__version__, PIL.__version__)']);
  if (probe.status === 0) pass('Python packages numpy / scipy / Pillow', `${probe.stdout.trim()}${interpreter === py ? '' : ' (.venv)'}`);
  else warn('Python packages numpy / scipy / Pillow', 'missing: needed by media_tools.py and sound_design.py. Run the setup script with the python-deps option.');
}

const ffmpeg = ffmpegPath();
const ffprobe = ffprobePath();
if (!ffmpeg || !ffprobe) fail('FFmpeg + FFprobe', 'not found: install FFmpeg or set HASKA_FFMPEG / HASKA_FFPROBE');
else {
  pass('FFmpeg + FFprobe', ffmpeg);
  const enc = run(ffmpeg, ['-hide_banner', '-encoders']).stdout ?? '';
  for (const e of ['libx264', 'aac']) (enc.includes(e) ? pass : fail)(`FFmpeg encoder ${e}`);
}

const pkg = join(ROOT, 'node_modules');
if (!existsSync(join(pkg, '@remotion', 'cli', 'remotion-cli.js'))) fail('npm dependencies', 'not installed: run "npm ci"');
else {
  pass('npm dependencies', 'node_modules present');
  const compositor = `@remotion/compositor-${isWindows ? 'win32' : isMac ? 'darwin' : 'linux'}-${process.arch}${isWindows ? '-msvc' : isLinux ? '-gnu' : ''}`;
  (existsSync(join(pkg, ...compositor.split('/'))) ? pass : fail)('Remotion compositor for this OS', compositor);
}
const browser = browserExecutable();
const shellDir = join(pkg, '.remotion');
(browser || existsSync(shellDir) ? pass : warn)('Chromium', browser ?? (existsSync(shellDir) ? 'Remotion headless shell downloaded' : 'Remotion will download its own headless shell on first render (needs internet once)'));
const gpu = nvidia();
(gpu ? pass : warn)('NVIDIA GPU', gpu ?? 'not detected (CPU rendering is used; optional)');

const whisper = findTool('whisper-cli', {envVar: 'HASKA_WHISPER'});
(whisper ? pass : warn)('whisper.cpp (optional, for transcription)', whisper ?? 'not installed');
const modelDir = join(ROOT, 'tools', 'whisper-models');
(existsSync(modelDir) && readdirSync(modelDir).some((f) => f.endsWith('.bin')) ? pass : warn)('whisper model (optional)', existsSync(modelDir) ? modelDir : 'not downloaded');
const blender = findTool('blender', {envVar: 'HASKA_BLENDER'});
(blender ? pass : warn)('Blender (optional, cinematic shots only)', blender ?? 'not found');

const fonts = join(ROOT, 'public', 'fonts');
(existsSync(join(fonts, 'majed')) && existsSync(join(fonts, 'ibm-plex-sans-arabic')) ? pass : fail)('Bundled Arabic fonts', fonts);
const skills = join(ROOT, '.claude', 'skills');
try {
  lstatSync(skills);
  pass('.claude/skills link', existsSync(join(skills, 'haska-video', 'SKILL.md')) ? 'resolves to .agents/skills' : 'present but does not resolve');
} catch {
  warn('.claude/skills link', 'missing: the setup script creates it (symlink on Linux, junction on Windows)');
}
(which('git') ? pass : warn)('git (needed only for packaging)', which('git') ?? 'not found');

if (process.argv.includes('--json')) console.log(JSON.stringify({platform: process.platform, arch: process.arch, rows}, null, 2));
else {
  console.log(`HASKA doctor  (${process.platform}/${process.arch}, root ${ROOT})\n`);
  for (const r of rows) console.log(`${r.level.padEnd(5)} ${r.name}${r.detail ? `: ${r.detail}` : ''}`);
  const bad = rows.filter((r) => r.level === 'FAIL').length;
  console.log(`\n${bad ? `${bad} required check(s) failed.` : 'All required checks passed.'} ${rows.filter((r) => r.level === 'WARN').length} optional warning(s).`);
}
process.exitCode = rows.some((r) => r.level === 'FAIL') ? 1 : 0;
