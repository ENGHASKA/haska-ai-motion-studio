// Dependency-free platform adapter (Linux, Windows, macOS). Everything that differs between operating systems lives here:
// executable names, tool discovery, Python launcher, font folders, Chromium, NVIDIA, links. No machine-specific paths.
import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, readFileSync, symlinkSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {delimiter, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = process.env.HASKA_PROJECT_ROOT ? resolve(process.env.HASKA_PROJECT_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const platform = process.platform;
export const isWindows = platform === 'win32';
export const isMac = platform === 'darwin';
export const isLinux = platform === 'linux';

/** Optional machine-local overrides: haska.config.json (git-ignored) then HASKA_* environment variables. */
export const readLocalConfig = (root = ROOT) => {
  const file = join(root, 'haska.config.json');
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  } catch {
    return {};
  }
};

/** Name of an executable as the OS spells it ("ffmpeg" -> "ffmpeg.exe" on Windows). */
export const exeName = (name) => (isWindows && !/\.(exe|cmd|bat)$/i.test(name) ? `${name}.exe` : name);

/** Find an executable on PATH without spawning a shell. Returns an absolute path or undefined. */
export const which = (name, env = process.env) => {
  const extensions = isWindows ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';') : [''];
  for (const folder of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(folder, name + (name.toLowerCase().endsWith(extension.toLowerCase()) ? '' : extension));
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // keep looking
      }
    }
  }
  return undefined;
};

/** Run a command without a shell. On Windows `.cmd`/`.bat` shims need a shell, so those are run through cmd.exe explicitly. */
export const run = (command, args = [], options = {}) => {
  const needsShell = isWindows && /\.(cmd|bat)$/i.test(command);
  return spawnSync(command, args, {encoding: 'utf8', shell: needsShell, windowsHide: true, ...options});
};

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/** Resolve a tool: config/env override -> project-local folder -> PATH. */
export const findTool = (name, {root = ROOT, localDirs = ['tools', join('tools', name)], envVar} = {}) => {
  const override = (envVar && process.env[envVar]) || readLocalConfig(root).tools?.[name];
  if (override && isFile(override)) return resolve(override);
  for (const folder of localDirs) {
    const candidate = join(root, folder, exeName(name));
    if (isFile(candidate)) return candidate;
  }
  return which(name);
};

export const ffmpegPath = (root = ROOT) => findTool('ffmpeg', {root, envVar: 'HASKA_FFMPEG'});
export const ffprobePath = (root = ROOT) => findTool('ffprobe', {root, envVar: 'HASKA_FFPROBE'});
export const whisperPath = (root = ROOT) => findTool('whisper-cli', {root, envVar: 'HASKA_WHISPER'});

/** Python launcher: `python3` on Linux/macOS, the `py -3` launcher or `python` on Windows. Returns [command, ...prefixArgs]. */
export const pythonCommand = (root = ROOT) => {
  const override = process.env.HASKA_PYTHON || readLocalConfig(root).python;
  if (override) return [override];
  // Prefer the PATH interpreter on Windows so actions/setup-python and project tooling resolve the same environment.
  // Fall back to the Python launcher for normal desktop installations.
  const candidates = isWindows ? [['python'], ['py', '-3'], ['python3']] : [['python3'], ['python']];
  for (const [command, ...prefix] of candidates) {
    const found = which(command);
    if (!found) continue;
    const probe = spawnSync(found, [...prefix, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'], {windowsHide: true});
    if (probe.status === 0) return [found, ...prefix];
  }
  return undefined;
};

/** Where installed fonts live (used only to report; rendering uses the fonts bundled in public/fonts). */
export const systemFontDirs = () => {
  if (isWindows) return [join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts')];
  if (isMac) return ['/System/Library/Fonts', '/Library/Fonts', join(homedir(), 'Library', 'Fonts')];
  return ['/usr/share/fonts', '/usr/local/share/fonts', join(homedir(), '.fonts'), join(homedir(), '.local', 'share', 'fonts')];
};

/** Chromium for Remotion: explicit override, else the copy Remotion downloads itself (reported as undefined). */
export const browserExecutable = (root = ROOT) => {
  const override = process.env.HASKA_BROWSER || readLocalConfig(root).browserExecutable;
  if (override && existsSync(override)) return override;
  const known = isWindows
    ? [join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'), join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe')]
    : isMac ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  return known.find((p) => existsSync(p));
};

/** NVIDIA GPU summary via nvidia-smi (works the same on Windows and Linux); undefined when unavailable. */
export const nvidia = () => {
  const smi = which('nvidia-smi');
  if (!smi) return undefined;
  const out = spawnSync(smi, ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'], {encoding: 'utf8', windowsHide: true, timeout: 15000});
  return out.status === 0 ? out.stdout.trim().split('\n')[0] : undefined;
};

/** Symlink where the OS allows it (Windows needs developer mode/admin); otherwise copy. Returns which was used. */
export const linkOrCopy = (target, linkPath) => {
  try {
    symlinkSync(target, linkPath, isWindows ? 'junction' : undefined);
    return 'link';
  } catch {
    copyFileSync(target, linkPath);
    return 'copy';
  }
};

/** Node entry of a locally installed package binary, bypassing .cmd shims (e.g. typescript/bin/tsc, @remotion/cli/remotion-cli.js). */
export const nodeBin = (relative, root = ROOT) => join(root, 'node_modules', relative);

export const describe = (root = ROOT) => ({
  platform, arch: process.arch, node: process.version, root,
  python: pythonCommand(root)?.join(' '), ffmpeg: ffmpegPath(root), ffprobe: ffprobePath(root), whisper: whisperPath(root),
  browser: browserExecutable(root) ?? '(Remotion downloads its own headless shell on first use)', nvidia: nvidia() ?? '(none detected)',
});
