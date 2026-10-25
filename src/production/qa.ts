// Practical, automatable production checks. Passing them does NOT prove cinematic quality: see HUMAN_REVIEW.
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {resolvePlatform, safeBox, platformForSize} from '../motion/style.ts';
import {fitText} from '../typography/fit.ts';
import {estimateMeasurer} from '../typography/measure.ts';
import {fontCoverage, fontFileCoverage, missingGlyphs} from '../typography/fontconfig.ts';
import {fontFilesFor} from '../typography/fonts.ts';
import type {Coverage} from '../typography/fontconfig.ts';
import {hasArabic, stripBidiControls, tokenizeWords, wordScript} from '../typography/script.ts';
import {checkCatalogFiles} from './asset-files.ts';
import {checkBlenderOutputs} from './blender-files.ts';
import {validateBlenderManifest} from './blender-shot.ts';
import {blocksForShot} from './layout.ts';
import type {TextBlock} from './layout.ts';
import {loadCatalog, loadStyleRegistry, resolveProject, readJsonFile} from './project.ts';
import {routeName} from './routing.ts';
import {loadStoryboardDocument} from './shot-graph.ts';
import type {ShotGraph} from './shot-graph.ts';
import {HASKA_SIGNAL} from './style-profile.ts';
import type {PlatformId, StyleProfile} from './style-profile.ts';
import {msToFrame} from './timing.ts';

const run = promisify(execFile);
// Project root for font files; QA entry points set it before checking text.
let PROJECT_ROOT = process.cwd();
export const setQaRoot = (root: string) => {
  PROJECT_ROOT = root;
};

export type Finding = {level: 'error' | 'warning' | 'info'; check: string; message: string};

/** What automation cannot judge. Printed with every QA run so a pass is never mistaken for approval. */
export const HUMAN_REVIEW = [
  'Pacing, rhythm and whether motion feels intentional (easing choices, hold times).',
  'Visual hierarchy, composition and taste: automated fitting only prevents overflow.',
  'Arabic typographic quality (joining, diacritics, line breaks, kerning) in the final render, by a fluent reader.',
  'Color, glow and contrast on real displays; text legibility over busy backgrounds.',
  'Narration/visual meaning match and factual accuracy of every on-screen claim.',
  'Licensing and attribution of every asset (unknown licenses stay unknown until verified).',
  'Transition feel, and any Blender shot: noise, banding, color-management look.',
];

const add = (findings: Finding[], level: Finding['level'], check: string, message: string) => findings.push({level, check, message});

export const probeMedia = async (path: string) => {
  const {stdout} = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=index,codec_type,codec_name,pix_fmt,width,height,r_frame_rate,color_space', '-of', 'json', path], {timeout: 60000});
  return JSON.parse(stdout) as {format?: {duration?: string; size?: string}; streams?: Array<Record<string, string | number>>};
};

const GENERIC_FAMILIES = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'system-ui']);

/** Characters of `text` that no installed family in the stack can draw. */
const uncovered = (text: string, families: string[], cache: Map<string, Coverage | undefined>) => {
  const covers = families
    .filter((family) => !GENERIC_FAMILIES.has(family))
    .map((family) => {
      if (!cache.has(family)) {
        // Fonts shipped in public/fonts are checked from their files; others through fontconfig.
        const file = fontFilesFor(family, 700).find((candidate) => existsSync(join(PROJECT_ROOT, candidate)));
        cache.set(family, (file ? fontFileCoverage(family, join(PROJECT_ROOT, file)) : undefined) ?? fontCoverage(family));
      }
      return cache.get(family);
    })
    .filter((coverage): coverage is Coverage => Boolean(coverage));
  if (covers.length === 0) return {installed: false, missing: [] as string[]};
  const clean = stripBidiControls(text);
  const missing = new Set<string>();
  for (const char of clean) if (covers.every((coverage) => missingGlyphs(char, coverage).length > 0)) missing.add(char);
  return {installed: true, missing: [...missing].filter((char) => char.trim() !== '')};
};

const stackFor = (style: StyleProfile, role: 'display' | 'body' | 'mono', arabic: boolean) => {
  const font = arabic ? (style.typography.arabic ?? style.typography[role] ?? style.typography.body) : (style.typography[role] ?? style.typography.body);
  return [font.family, ...font.fallbacks];
};

/** Typography checks for one block of text in a style: fit, minimum size, safe area, glyph coverage. */
export const checkTextBlock = (
  findings: Finding[],
  where: string,
  block: TextBlock,
  style: StyleProfile,
  safe: ReturnType<typeof safeBox>,
  cache: Map<string, Coverage | undefined>,
) => {
  const arabic = hasArabic(block.text);
  const fit = fitText({
    text: block.text,
    maxWidth: block.rect.width,
    maxHeight: block.rect.height,
    maxLines: block.maxLines,
    fontSize: block.fontSize,
    minFontSize: block.fitted ? block.minFontSize : block.fontSize,
    lineHeight: 1.18,
    fonts: {
      latin: stackFor(style, block.role, false).join(','),
      arabic: stackFor(style, block.role, true).join(','),
      weight: style.typography[block.role]?.weight ?? 400,
      tracking: style.typography[block.role]?.tracking,
    },
    measure: estimateMeasurer,
  });
  const label = `${where} "${block.key}" (${arabic ? 'Arabic' : 'English'})`;
  if (!fit.fits) add(findings, 'error', 'text-overflow', `${label}: "${block.text.slice(0, 40)}" does not fit ${Math.round(block.rect.width)}×${Math.round(block.rect.height)}px even at ${fit.fontSize}px${block.fitted ? '' : ' (this scene does not auto-fit)'}; shorten the text.`);
  else if (fit.shrunk) add(findings, 'info', 'text-fit', `${label}: shrinks from ${block.fontSize}px to ${fit.fontSize}px to fit.`);
  if (fit.fits && fit.fontSize < 24) add(findings, 'warning', 'legibility', `${label}: fitted size ${fit.fontSize}px is small for video.`);

  const outside = block.rect.left < safe.left - 1 || block.rect.top < safe.top - 1 || block.rect.left + block.rect.width > safe.left + safe.width + 1 || block.rect.top + block.rect.height > safe.top + safe.height + 1;
  if (outside) add(findings, 'error', 'safe-area', `${label}: text box extends outside the ${safe.width}×${safe.height} platform safe area.`);

  for (const isArabic of [true, false]) {
    const part = tokenizeWords(block.text).filter((word) => (wordScript(word) === 'arabic') === isArabic).join(' ');
    if (!part) continue;
    const result = uncovered(part, stackFor(style, block.role, isArabic), cache);
    if (!result.installed) add(findings, 'error', 'glyph-coverage', `${label}: none of the fonts [${stackFor(style, block.role, isArabic).join(', ')}] is installed.`);
    else if (result.missing.length) add(findings, 'error', 'glyph-coverage', `${label}: no installed font in [${stackFor(style, block.role, isArabic).join(', ')}] has glyphs for ${result.missing.join(' ')}`);
  }
};

const checkRenderCompat = (findings: Finding[], graph: ShotGraph) => {
  if (graph.width % 2 || graph.height % 2) add(findings, 'error', 'render-compat', `${graph.width}×${graph.height} must have even dimensions for H.264 yuv420p.`);
  if (!Number.isInteger(graph.fps)) add(findings, 'warning', 'render-compat', `fps ${graph.fps} is not an integer; durations and audio sync may round.`);
  for (const shot of graph.shots) {
    const route = routeName(shot);
    if (route.error) add(findings, 'error', 'routing', `shot "${shot.id}": ${route.error}`);
  }
};

export const qaProject = async (root: string, id: string): Promise<Finding[]> => {
  setQaRoot(root);
  const findings: Finding[] = [];
  const project = resolveProject(root, id);
  for (const issue of project.issues) add(findings, 'error', 'storyboard', `${issue.path}: ${issue.message}`);
  for (const warning of project.warnings) add(findings, 'warning', 'storyboard', `${warning.path}: ${warning.message}`);
  if (project.issues.length) return findings;

  const {graph, style} = project;
  const platformId: PlatformId = platformForSize(graph.width, graph.height);
  const platform = resolvePlatform(style, platformId, graph.width, graph.height);
  const safe = safeBox(platform);
  const cache = new Map<string, Coverage | undefined>();

  checkRenderCompat(findings, graph);
  for (const shot of graph.shots) {
    for (const block of blocksForShot(shot, safe, platform.titleScale, {width: graph.width, height: graph.height}, platformId)) checkTextBlock(findings, `shot "${shot.id}"`, block, style, safe, cache);
  }

  const {catalog, index} = loadCatalog(root);
  const used = project.assets;
  const fileIssues = await checkCatalogFiles({schemaVersion: 1, assets: used}, root);
  for (const issue of fileIssues) add(findings, 'error', 'assets', `${issue.path}: ${issue.message}`);
  for (const asset of used) {
    if (!asset.path.startsWith('public/')) add(findings, 'error', 'assets', `${asset.id}: ${asset.path} is outside public/, so Remotion cannot serve it.`);
    if (asset.license.id === 'unknown' || asset.license.commercialUse === 'unknown') add(findings, 'warning', 'license', `${asset.id} (${asset.path}): license / commercial use is unknown; verify before publishing.`);
    if (asset.license.attributionRequired) add(findings, 'info', 'attribution', `${asset.id}: credit required: ${asset.license.attribution}`);
  }

  for (const track of graph.audio ?? []) {
    const asset = index.get(track.assetId);
    if (!asset || !existsSync(join(root, asset.path))) continue;
    try {
      const media = await probeMedia(join(root, asset.path));
      const seconds = Number(media.format?.duration ?? 0);
      const endFrame = track.startFrame + Math.ceil(seconds * graph.fps);
      if (!media.streams?.some((stream) => stream.codec_type === 'audio')) add(findings, 'error', 'audio-timing', `${asset.id} has no audio stream.`);
      else if (endFrame > graph.durationFrames + 1) add(findings, 'warning', 'audio-timing', `${asset.id} runs ${endFrame - graph.durationFrames} frames past the end of the video and will be cut.`);
      else if (endFrame < graph.durationFrames - graph.fps) add(findings, 'info', 'audio-timing', `${asset.id} ends ${((graph.durationFrames - endFrame) / graph.fps).toFixed(1)}s before the video ends.`);
    } catch (error) {
      add(findings, 'error', 'audio-timing', `could not probe ${asset.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const shot of graph.shots.filter((entry) => entry.engine === 'blender')) {
    const manifest = validateBlenderManifest(shot.engineOptions?.blender, {assets: index, graph});
    if (manifest.ok) for (const issue of checkBlenderOutputs(manifest.value, root, catalog)) add(findings, 'error', 'blender', issue.message);
  }
  return findings;
};

/** Soundtrack stems declared in settings.json: present, the right length, catalogued, and mixed safely. */
const checkSoundtrack = async (findings: Finding[], root: string, directory: string, id: string, durationFrames: number, fps: number) => {
  const settingsFile = join(directory, 'settings.json');
  const settings = existsSync(settingsFile) ? (readJsonFile(settingsFile) as {narrationVolume?: number; soundtrack?: Array<{file: string; name?: string}>}) : {};
  const tracks = settings.soundtrack ?? [];
  if (!tracks.length) return;
  if (settings.narrationVolume !== undefined && (settings.narrationVolume > 1 || settings.narrationVolume < 0.5)) add(findings, 'warning', 'sound-mix', `narrationVolume ${settings.narrationVolume} is unusual (expected 0.5 to 1).`);
  const catalog = loadCatalog(root).catalog;
  for (const track of tracks) {
    const path = join(directory, track.file);
    if (!existsSync(path)) {
      add(findings, 'error', 'sound', `${track.file} is missing; run: python3 scripts/sound_design.py ${id}`);
      continue;
    }
    const media = await probeMedia(path);
    const frames = Math.ceil(Number(media.format?.duration ?? 0) * fps);
    if (Math.abs(frames - durationFrames) > 2) add(findings, 'error', 'sound', `${track.file} is ${frames} frames but the video is ${durationFrames}; regenerate the soundtrack.`);
    const relative = `public/audio-projects/${id}/${track.file}`;
    if (!catalog.assets.some((asset) => asset.path === relative || asset.alsoAt?.includes(relative))) add(findings, 'warning', 'license', `${relative} is not in the asset catalog; run: npm run production -- assets scan --write`);
  }
  const reportFile = join(directory, 'sound', 'mix-report.json');
  if (!existsSync(reportFile)) return void add(findings, 'error', 'sound-mix', 'no mix-report.json; run: python3 scripts/sound_design.py ' + id);
  const report = readJsonFile(reportFile) as {files?: Record<string, string>; samplePeakOfMix: number; samplesAboveCeiling: number; voiceToMusicMarginDb: number | null; mix: {integratedLUFS: number | null; truePeakdBTP: number | null}; narrationVolume: number};
  for (const [name, hash] of Object.entries(report.files ?? {})) {
    const file = join(directory, 'sound', name);
    if (existsSync(file) && createHash('sha256').update(readFileSync(file)).digest('hex') !== hash) add(findings, 'error', 'sound-mix', `${name} changed after the mix report was written; re-run the sound design to re-measure.`);
  }
  if (report.narrationVolume !== (settings.narrationVolume ?? 1)) add(findings, 'error', 'sound-mix', `settings narrationVolume (${settings.narrationVolume ?? 1}) differs from the measured mix (${report.narrationVolume}).`);
  if (report.samplesAboveCeiling > 0 || report.samplePeakOfMix > 0.95) add(findings, 'error', 'sound-mix', `the mix peaks at ${report.samplePeakOfMix} (${report.samplesAboveCeiling} samples over the ceiling): it will clip.`);
  if (report.mix.truePeakdBTP !== null && report.mix.truePeakdBTP > -0.3) add(findings, 'warning', 'sound-mix', `true peak ${report.mix.truePeakdBTP} dBTP leaves little room for AAC encoding.`);
  if (report.voiceToMusicMarginDb !== null && report.voiceToMusicMarginDb < 10) add(findings, 'error', 'sound-mix', `music is only ${report.voiceToMusicMarginDb} dB below the voice while speaking; the voice may not stay clear.`);
  if (report.mix.integratedLUFS !== null && (report.mix.integratedLUFS < -18 || report.mix.integratedLUFS > -12)) add(findings, 'warning', 'sound-mix', `integrated loudness ${report.mix.integratedLUFS} LUFS is outside the usual -18..-12 range for social video.`);
  add(findings, 'info', 'sound-mix', `mix ${report.mix.integratedLUFS} LUFS, peak ${report.samplePeakOfMix}, true peak ${report.mix.truePeakdBTP} dBTP, voice ${report.voiceToMusicMarginDb} dB above music while speaking.`);
};

const PRESETS: Array<{id: PlatformId; width: number; height: number}> = [
  {id: 'youtube', width: 1920, height: 1080},
  {id: 'reel', width: 1080, height: 1920},
  {id: 'tiktok', width: 1080, height: 1920},
];

/** Frame-sync, caption and typography checks for an Audio-to-Motion project, across all three presets. */
export const qaAudioProject = async (root: string, id: string): Promise<Finding[]> => {
  setQaRoot(root);
  const findings: Finding[] = [];
  const directory = join(root, 'public', 'audio-projects', id);
  if (!existsSync(join(directory, 'storyboard.json'))) throw new Error(`Audio project "${id}" not found.`);
  const fps = 30;

  const storyboard = readJsonFile(join(directory, 'storyboard.json'));
  const loaded = loadStoryboardDocument(storyboard, {id, timestamp: new Date(0).toISOString(), fps});
  if (!loaded.ok) {
    for (const issue of loaded.issues) add(findings, 'error', 'storyboard', `${issue.path}: ${issue.message}`);
    return findings;
  }
  for (const warning of loaded.value.warnings) add(findings, 'warning', 'storyboard', `${warning.path}: ${warning.message}`);
  const graph = loaded.value.graph;

  // A project may restrict itself to the presets it is designed for (settings.json: {"presets": ["reel"]}).
  const settingsFile = join(directory, 'settings.json');
  const declared = existsSync(settingsFile) ? ((readJsonFile(settingsFile) as {presets?: string[]}).presets ?? []) : [];
  const presets = declared.length ? PRESETS.filter((preset) => declared.includes(preset.id)) : PRESETS;

  const projectFile = join(directory, 'project.json');
  const styleId = existsSync(projectFile) ? ((readJsonFile(projectFile) as {styleProfileId?: string}).styleProfileId ?? 'haska-signal') : 'haska-signal';
  const style = loadStyleRegistry(root).registry.get(styleId) ?? HASKA_SIGNAL;

  const source = readdirSync(directory).find((name) => /^source\.(wav|mp3|m4a)$/.test(name));
  if (!source) add(findings, 'error', 'audio-timing', 'original narration (source.wav/mp3/m4a) is missing.');
  else {
    const media = await probeMedia(join(directory, source));
    const seconds = Number(media.format?.duration ?? 0);
    const sourceFrames = Math.ceil(seconds * fps);
    if (Math.abs(sourceFrames - graph.durationFrames) > 2) add(findings, 'error', 'audio-timing', `narration is ${sourceFrames} frames but the storyboard covers ${graph.durationFrames}; visuals and audio will drift.`);
    else add(findings, 'info', 'audio-timing', `narration ${seconds.toFixed(2)}s = ${sourceFrames} frames; storyboard ${graph.durationFrames} frames.`);
  }

  await checkSoundtrack(findings, root, directory, id, graph.durationFrames, fps);

  const transcriptFile = join(directory, 'transcript.json');
  if (existsSync(transcriptFile)) {
    const transcript = readJsonFile(transcriptFile) as {corrected?: boolean; durationMs: number; segments: Array<{startMs: number; endMs: number; text: string; words: Array<{text: string; startMs: number; endMs: number}>}>; direction?: string};
    if (!transcript.corrected) add(findings, 'warning', 'transcript', 'transcript is not marked corrected; review wording before final delivery.');
    const totalFrames = graph.durationFrames;
    const cache = new Map<string, Coverage | undefined>();
    for (const segment of transcript.segments) {
      const from = msToFrame(segment.startMs, fps);
      const to = msToFrame(segment.endMs, fps);
      if (to > totalFrames) add(findings, 'error', 'frame-sync', `caption "${segment.text.slice(0, 30)}" ends at frame ${to}, after the video ends (${totalFrames}).`);
      for (const word of segment.words) {
        if (msToFrame(word.startMs, fps) < from || msToFrame(word.endMs, fps) > to) add(findings, 'error', 'frame-sync', `word "${word.text}" falls outside its caption segment in frames.`);
      }
      for (const preset of presets) {
        const platform = resolvePlatform(style, preset.id, preset.width, preset.height);
        const vertical = preset.height > preset.width;
        const width = Math.min(vertical ? preset.width - platform.safeArea.left - platform.safeArea.right : 1260, preset.width - platform.safeArea.left - platform.safeArea.right) - 64;
        const block: TextBlock = {key: 'caption', text: segment.text, role: 'body', fontSize: vertical ? 54 : 48, minFontSize: 28, maxLines: 3, rect: {left: platform.safeArea.left, top: preset.height - platform.safeArea.bottom - 280, width, height: 280}, fitted: true};
        const local: Finding[] = [];
        checkTextBlock(local, `${preset.id} caption`, block, style, safeBox(platform, preset.width, preset.height), cache);
        findings.push(...local.filter((finding) => finding.level !== 'info'));
      }
    }
  } else add(findings, 'warning', 'transcript', 'no transcript.json; captions will not render.');

  const cache = new Map<string, Coverage | undefined>();
  for (const preset of presets) {
    const platform = resolvePlatform(style, preset.id, preset.width, preset.height);
    for (const shot of graph.shots) {
      for (const block of blocksForShot(shot, safeBox(platform, preset.width, preset.height), platform.titleScale, preset, preset.id)) checkTextBlock(findings, `${preset.id} shot "${shot.id}"`, block, style, safeBox(platform, preset.width, preset.height), cache);
    }
  }
  // The same overflow often appears in several presets; keep one line per distinct message.
  const seen = new Set<string>();
  return findings.filter((finding) => (seen.has(finding.message) ? false : (seen.add(finding.message), true)));
};

/** Verifies a rendered MP4 against what the project promised. */
export const verifyOutput = async (path: string, expectation: {width: number; height: number; fps: number; durationFrames: number; audio: boolean}): Promise<Finding[]> => {
  const findings: Finding[] = [];
  if (!existsSync(path)) return [{level: 'error', check: 'output', message: `${path} does not exist.`}];
  const media = await probeMedia(path);
  const video = media.streams?.find((stream) => stream.codec_type === 'video');
  const audio = media.streams?.find((stream) => stream.codec_type === 'audio');
  if (!video) return [{level: 'error', check: 'output', message: 'no video stream.'}];
  if (video.codec_name !== 'h264') add(findings, 'error', 'output', `codec is ${video.codec_name}, expected h264.`);
  if (video.width !== expectation.width || video.height !== expectation.height) add(findings, 'error', 'output', `size is ${video.width}×${video.height}, expected ${expectation.width}×${expectation.height}.`);
  const [num, den] = String(video.r_frame_rate).split('/').map(Number);
  if (Math.abs(num / (den || 1) - expectation.fps) > 0.01) add(findings, 'error', 'output', `frame rate is ${video.r_frame_rate}, expected ${expectation.fps}.`);
  const seconds = Number(media.format?.duration ?? 0);
  const expected = expectation.durationFrames / expectation.fps;
  if (Math.abs(seconds - expected) > 1.5 / expectation.fps) add(findings, 'error', 'output', `duration is ${seconds.toFixed(3)}s, expected ${expected.toFixed(3)}s.`);
  if (video.pix_fmt !== 'yuv420p') add(findings, 'warning', 'output', `pixel format ${video.pix_fmt}; yuv420p is the most compatible.`);
  if (video.color_space && video.color_space !== 'bt709') add(findings, 'warning', 'output', `color space ${video.color_space}, expected bt709.`);
  if (expectation.audio && !audio) add(findings, 'error', 'output', 'expected an audio stream but the file has none.');
  if (!expectation.audio && audio) add(findings, 'info', 'output', 'file contains an audio stream.');
  if (!findings.some((finding) => finding.level === 'error')) add(findings, 'info', 'output', `OK: h264 ${video.width}×${video.height} @ ${video.r_frame_rate}, ${seconds.toFixed(3)}s${audio ? ', audio present' : ''}.`);
  return findings;
};

