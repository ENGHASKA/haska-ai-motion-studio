#!/usr/bin/env node
// Converts the 17 upstream visual styles (vendored styles.js, MIT) into HASKA StyleProfiles:
// production/style-profiles/majed-<id>.json, each `extends` haska-cyber for motion/platform defaults.
//   node scripts/derive_majed_styles.mjs [--check]
// The TOK literal is evaluated in an empty vm context (no globals, no I/O); nothing else from styles.js runs.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const source = readFileSync(join(ROOT, 'third_party/majed-video/motion/styles.js'), 'utf8');
const start = source.indexOf('const TOK = {') + 'const TOK = '.length;
let depth = 0;
let end = start;
for (let i = start; i < source.length; i++) {
  if (source[i] === '{') depth++;
  if (source[i] === '}' && --depth === 0) {
    end = i + 1;
    break;
  }
}
const TOK = vm.runInNewContext(`(${source.slice(start, end)})`, {MONO: 'ui-monospace, Menlo, Consolas, monospace'}, {timeout: 1000});

const parse = (color) => {
  const m = String(color).match(/^#([0-9a-f]{6})/i);
  if (m) return [0, 2, 4].map((o) => parseInt(m[1].slice(o, o + 2), 16));
  const r = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  return r ? [Number(r[1]), Number(r[2]), Number(r[3])] : [128, 128, 128];
};
const hex = (rgb) => `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => a.map((c, i) => c * (1 - t) + b[i] * t);
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const PERSONALITY = {clean: 'premium', calm: 'premium', organic: 'playful', bouncy: 'playful', snappy: 'energetic', mechanical: 'corporate'};
const FALLBACK = ['IBM Plex Sans Arabic', 'DejaVu Sans', 'sans-serif'];

const slug = (id) => id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const profiles = {};
for (const [id, t] of Object.entries(TOK)) {
  const bg = parse(t.palette.bg);
  let ink = parse(t.palette.ink);
  // Some upstream styles put dark ink on a dark base because their text sits on paper cards; the profile needs readable base text.
  if (ratio(ink, bg) < 4.5) ink = lum(bg) < 0.4 ? [244, 239, 230] : [20, 20, 20];
  const dark = luma(bg) < luma(ink);
  const surface = mix(bg, ink, dark ? 0.1 : 0.06);
  const muted = mix(ink, bg, 0.35);
  const accent = parse(t.palette.hi ?? t.palette.acc);
  const font = (family, weight) => ({family: family ?? 'IBM Plex Sans Arabic', fallbacks: FALLBACK.filter((f) => f !== family), weight});
  profiles[id] = {
    schemaVersion: 1,
    id: `majed-${slug(id)}`,
    name: `Majed · ${id}`,
    description: `${t.desc} (adapted from majedphotos/video-ad-editor style "${id}", MIT; colours and fonts only, HASKA motion defaults).`,
    extends: 'haska-cyber',
    palette: {background: hex(bg), surface: hex(surface), primary: hex(parse(t.palette.acc)), accent: hex(accent), text: hex(ink), mutedText: hex(muted)},
    typography: {display: font(t.fonts.display, 800), body: font(t.fonts.body, 500), arabic: font(t.fonts.display, 700)},
    motion: {personality: PERSONALITY[t.personality] ?? 'premium'},
    extensions: {'majed-video': {upstreamStyle: id, families: t.families, cues: t.cues, blend: t.blend, surface: t.surface, card: t.card, label: t.label, post: t.post, needsCut: Boolean(t.needsCut)}},
  };
}

const directory = join(ROOT, 'production', 'style-profiles');
mkdirSync(directory, {recursive: true});
let stale = 0;
for (const profile of Object.values(profiles)) {
  const file = join(directory, `${profile.id}.json`);
  const text = `${JSON.stringify(profile, null, 2)}\n`;
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) stale++;
  } else writeFileSync(file, text);
}
if (check) {
  console.log(stale ? `${stale} Majed style profiles are stale; run: node scripts/derive_majed_styles.mjs` : `${Object.keys(profiles).length} Majed style profiles are up to date`);
  process.exit(stale ? 1 : 0);
}
console.log(`wrote ${Object.keys(profiles).length} profiles to production/style-profiles/`);
