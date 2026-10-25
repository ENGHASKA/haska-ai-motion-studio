import {
  HEX_COLOR,
  ID_PATTERN,
  checkEnum,
  checkNumber,
  checkObject,
  checkSchemaVersion,
  checkString,
  finish,
  isRecord,
} from './validation.ts';
import type {Issue, Validated} from './validation.ts';

export const PLATFORM_IDS = ['youtube', 'reel', 'tiktok', 'square', 'web-hero'] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export const TRANSITION_TYPES = ['cut', 'crossfade', 'push', 'wipe', 'camera-pull', 'zoom-through', 'match-cut'] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];

export const MOTION_PERSONALITIES = ['premium', 'corporate', 'energetic', 'playful'] as const;
export type MotionPersonality = (typeof MOTION_PERSONALITIES)[number];

export type CubicBezier = readonly [x1: number, y1: number, x2: number, y2: number];

export type FontRef = {
  family: string;
  fallbacks: string[];
  weight: number;
  /** Letter spacing in em. */
  tracking?: number;
  /** Optional AssetCatalog id when the font file is tracked locally. Nothing is downloaded. */
  assetId?: string;
};

export type TransitionSpec = {
  type: TransitionType;
  durationMs: number;
  /** Key into `motion.easings`. */
  easing: string;
};

export type SafeArea = {top: number; right: number; bottom: number; left: number};

export type PlatformParams = {
  width: number;
  height: number;
  fps: number;
  safeArea: SafeArea;
  /** Multiplier applied to display type sizes. */
  titleScale: number;
  captionMaxChars?: number;
};

/** Per-platform override: any parameter, with safe-area sides overridable individually. */
export type PlatformOverride = Partial<Omit<PlatformParams, 'safeArea'>> & {safeArea?: Partial<SafeArea>};

export type StyleProfile = {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  /** Id of a profile already in the registry; this profile overrides it field by field. */
  extends?: string;
  palette: {
    background: string;
    surface: string;
    primary: string;
    accent: string;
    text: string;
    mutedText: string;
    secondary?: string;
    danger?: string;
    extra?: Record<string, string>;
  };
  /** `arabic` is used for Arabic runs in any role; letter spacing is never applied to it. */
  typography: {display: FontRef; body: FontRef; mono?: FontRef; arabic?: FontRef};
  motion: {
    personality: MotionPersonality;
    easings: Record<string, CubicBezier>;
    durationsMs: {quick: number; standard: number; slow: number};
    transitions: {scene: TransitionSpec; section?: TransitionSpec; reveal?: TransitionSpec};
  };
  camera?: {
    movement: 'static' | 'drift' | 'push' | 'orbit';
    lensMm?: number;
    /** 0 = locked off, 1 = handheld. */
    shake: number;
    depthOfField: boolean;
  };
  lighting?: {
    mood: 'dark' | 'neutral' | 'bright';
    keyColor: string;
    fillColor?: string;
    intensity: number;
  };
  platforms?: Partial<Record<PlatformId, PlatformOverride>>;
  /** Free-form, namespaced data for future engines. Never interpreted here. */
  extensions?: Record<string, unknown>;
};

// Defaults match the sizes already used by the AudioExplainer compositions.
export const PLATFORM_DEFAULTS: Record<PlatformId, PlatformParams> = {
  youtube: {width: 1920, height: 1080, fps: 30, safeArea: {top: 64, right: 96, bottom: 64, left: 96}, titleScale: 1},
  reel: {width: 1080, height: 1920, fps: 30, safeArea: {top: 200, right: 64, bottom: 320, left: 64}, titleScale: 0.8, captionMaxChars: 32},
  tiktok: {width: 1080, height: 1920, fps: 30, safeArea: {top: 200, right: 120, bottom: 360, left: 64}, titleScale: 0.8, captionMaxChars: 32},
  square: {width: 1080, height: 1080, fps: 30, safeArea: {top: 72, right: 72, bottom: 72, left: 72}, titleScale: 0.85},
  'web-hero': {width: 1920, height: 1080, fps: 30, safeArea: {top: 72, right: 120, bottom: 72, left: 120}, titleScale: 1},
};

const TOP_LEVEL_KEYS = ['schemaVersion', 'id', 'name', 'description', 'extends', 'palette', 'typography', 'motion', 'camera', 'lighting', 'platforms', 'extensions'];
const REQUIRED_PALETTE = ['background', 'surface', 'primary', 'accent', 'text', 'mutedText'] as const;
const OPTIONAL_PALETTE = ['secondary', 'danger', 'extra'] as const;
const REQUIRED_EASINGS = ['enter', 'exit', 'standard'] as const;

const channel = (hex: string, offset: number) => {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);

/** WCAG 2.x contrast ratio between two #rrggbb colors. */
export const contrastRatio = (foreground: string, background: string) => {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

const checkColor = (issues: Issue[], path: string, value: unknown): value is string => {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    issues.push({path, message: 'must be a #rrggbb or #rrggbbaa color'});
    return false;
  }
  return true;
};

const checkFont = (issues: Issue[], path: string, value: unknown) => {
  if (!checkObject(issues, path, value, ['family', 'fallbacks', 'weight', 'tracking', 'assetId'])) return;
  checkString(issues, `${path}.family`, value.family, {max: 120});
  if (!Array.isArray(value.fallbacks) || value.fallbacks.length === 0) {
    issues.push({path: `${path}.fallbacks`, message: 'must list at least one fallback family so rendering never depends on a missing font'});
  } else {
    value.fallbacks.forEach((fallback, index) => checkString(issues, `${path}.fallbacks[${index}]`, fallback, {max: 120}));
  }
  if (checkNumber(issues, `${path}.weight`, value.weight, {min: 100, max: 900, integer: true}) && value.weight % 100 !== 0) {
    issues.push({path: `${path}.weight`, message: 'must be a multiple of 100'});
  }
  if (value.tracking !== undefined) checkNumber(issues, `${path}.tracking`, value.tracking, {min: -0.2, max: 1});
  if (value.assetId !== undefined) checkString(issues, `${path}.assetId`, value.assetId, {pattern: ID_PATTERN});
};

const checkTransition = (issues: Issue[], path: string, value: unknown, easings: Record<string, unknown>) => {
  if (!checkObject(issues, path, value, ['type', 'durationMs', 'easing'])) return;
  checkEnum(issues, `${path}.type`, value.type, TRANSITION_TYPES);
  checkNumber(issues, `${path}.durationMs`, value.durationMs, {min: 0, max: 5000});
  if (checkString(issues, `${path}.easing`, value.easing) && !(value.easing in easings)) {
    issues.push({path: `${path}.easing`, message: `references unknown easing "${value.easing}"`});
  }
};

const checkPlatformOverride = (issues: Issue[], path: string, value: unknown) => {
  if (!checkObject(issues, path, value, ['width', 'height', 'fps', 'safeArea', 'titleScale', 'captionMaxChars'])) return;
  for (const key of ['width', 'height'] as const) {
    if (value[key] !== undefined) checkNumber(issues, `${path}.${key}`, value[key], {min: 16, max: 8192, integer: true});
  }
  if (value.fps !== undefined) checkNumber(issues, `${path}.fps`, value.fps, {min: 1, max: 120});
  if (value.titleScale !== undefined) checkNumber(issues, `${path}.titleScale`, value.titleScale, {min: 0.25, max: 3});
  if (value.captionMaxChars !== undefined) checkNumber(issues, `${path}.captionMaxChars`, value.captionMaxChars, {min: 8, max: 200, integer: true});
  if (value.safeArea !== undefined && checkObject(issues, `${path}.safeArea`, value.safeArea, ['top', 'right', 'bottom', 'left'])) {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      // Sides are individually overridable; absent sides inherit the platform default.
      if (value.safeArea[side] !== undefined) checkNumber(issues, `${path}.safeArea.${side}`, value.safeArea[side], {min: 0, max: 2000});
    }
  }
};

/** Recursively merges plain objects; arrays and scalars from `override` replace `base`. */
const deepMerge = (base: unknown, override: unknown): unknown => {
  if (!isRecord(base) || !isRecord(override)) return override;
  const merged: Record<string, unknown> = {...base};
  for (const [key, value] of Object.entries(override)) {
    merged[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return merged;
};

export type StyleRegistry = ReadonlyMap<string, StyleProfile>;

/**
 * Validates a profile. When it declares `extends`, the base is taken from
 * `registry` and the merged result is what gets validated and returned.
 */
export const validateStyleProfile = (raw: unknown, registry: StyleRegistry = new Map()): Validated<StyleProfile> => {
  const issues: Issue[] = [];
  const warnings: Issue[] = [];

  if (!isRecord(raw)) return finish(issues.concat({path: '$', message: 'must be an object'}), warnings, raw);

  let input: Record<string, unknown> = raw;
  if (raw.extends !== undefined) {
    const base = typeof raw.extends === 'string' ? registry.get(raw.extends) : undefined;
    if (!base) {
      issues.push({path: 'extends', message: `base profile "${String(raw.extends)}" is not in the registry`});
    } else {
      const {extends: parentId, ...rest} = raw;
      input = {...(deepMerge(base, rest) as Record<string, unknown>), extends: parentId};
    }
  }

  if (!checkObject(issues, '$', input, TOP_LEVEL_KEYS)) return finish(issues, warnings, input);
  checkSchemaVersion(issues, input, 1);
  checkString(issues, 'id', input.id, {pattern: ID_PATTERN});
  checkString(issues, 'name', input.name, {max: 120});
  if (input.description !== undefined) checkString(issues, 'description', input.description, {max: 500});

  if (checkObject(issues, 'palette', input.palette, [...REQUIRED_PALETTE, ...OPTIONAL_PALETTE])) {
    for (const key of REQUIRED_PALETTE) checkColor(issues, `palette.${key}`, input.palette[key]);
    for (const key of ['secondary', 'danger'] as const) {
      if (input.palette[key] !== undefined) checkColor(issues, `palette.${key}`, input.palette[key]);
    }
    if (input.palette.extra !== undefined && checkObject(issues, 'palette.extra', input.palette.extra, Object.keys(input.palette.extra as object))) {
      for (const [key, value] of Object.entries(input.palette.extra as Record<string, unknown>)) {
        checkColor(issues, `palette.extra.${key}`, value);
      }
    }
    const {text, mutedText, background} = input.palette as Record<string, unknown>;
    if (typeof text === 'string' && typeof background === 'string' && HEX_COLOR.test(text) && HEX_COLOR.test(background)) {
      const ratio = contrastRatio(text, background);
      if (ratio < 3) issues.push({path: 'palette.text', message: `contrast ${ratio.toFixed(2)}:1 against background is unreadable (minimum 3:1)`});
      else if (ratio < 4.5) warnings.push({path: 'palette.text', message: `contrast ${ratio.toFixed(2)}:1 is below the 4.5:1 body-text target`});
    }
    if (typeof mutedText === 'string' && typeof background === 'string' && HEX_COLOR.test(mutedText) && HEX_COLOR.test(background)) {
      const ratio = contrastRatio(mutedText, background);
      if (ratio < 3) warnings.push({path: 'palette.mutedText', message: `contrast ${ratio.toFixed(2)}:1 is below 3:1`});
    }
  }

  if (checkObject(issues, 'typography', input.typography, ['display', 'body', 'mono', 'arabic'])) {
    checkFont(issues, 'typography.display', input.typography.display);
    checkFont(issues, 'typography.body', input.typography.body);
    if (input.typography.mono !== undefined) checkFont(issues, 'typography.mono', input.typography.mono);
    if (input.typography.arabic !== undefined) checkFont(issues, 'typography.arabic', input.typography.arabic);
  }

  if (checkObject(issues, 'motion', input.motion, ['personality', 'easings', 'durationsMs', 'transitions'])) {
    const {motion} = input as {motion: Record<string, unknown>};
    checkEnum(issues, 'motion.personality', motion.personality, MOTION_PERSONALITIES);

    let easings: Record<string, unknown> = {};
    if (isRecord(motion.easings)) {
      easings = motion.easings;
      for (const required of REQUIRED_EASINGS) {
        if (!(required in easings)) issues.push({path: `motion.easings.${required}`, message: 'is required'});
      }
      for (const [name, curve] of Object.entries(easings)) {
        const path = `motion.easings.${name}`;
        if (!Array.isArray(curve) || curve.length !== 4) {
          issues.push({path, message: 'must be a cubic-bezier [x1, y1, x2, y2]'});
          continue;
        }
        checkNumber(issues, `${path}[0]`, curve[0], {min: 0, max: 1});
        checkNumber(issues, `${path}[1]`, curve[1], {min: -2, max: 3});
        checkNumber(issues, `${path}[2]`, curve[2], {min: 0, max: 1});
        checkNumber(issues, `${path}[3]`, curve[3], {min: -2, max: 3});
      }
    } else {
      issues.push({path: 'motion.easings', message: 'must be an object of named cubic-beziers'});
    }

    if (checkObject(issues, 'motion.durationsMs', motion.durationsMs, ['quick', 'standard', 'slow'])) {
      const d = motion.durationsMs;
      const ok = (['quick', 'standard', 'slow'] as const).map((key) => checkNumber(issues, `motion.durationsMs.${key}`, d[key], {min: 1, max: 10000}));
      if (ok.every(Boolean) && !((d.quick as number) < (d.standard as number) && (d.standard as number) < (d.slow as number))) {
        issues.push({path: 'motion.durationsMs', message: 'must satisfy quick < standard < slow'});
      }
    }

    if (checkObject(issues, 'motion.transitions', motion.transitions, ['scene', 'section', 'reveal'])) {
      checkTransition(issues, 'motion.transitions.scene', motion.transitions.scene, easings);
      for (const role of ['section', 'reveal'] as const) {
        if (motion.transitions[role] !== undefined) checkTransition(issues, `motion.transitions.${role}`, motion.transitions[role], easings);
      }
    }
  }

  if (input.camera !== undefined && checkObject(issues, 'camera', input.camera, ['movement', 'lensMm', 'shake', 'depthOfField'])) {
    checkEnum(issues, 'camera.movement', input.camera.movement, ['static', 'drift', 'push', 'orbit'] as const);
    if (input.camera.lensMm !== undefined) checkNumber(issues, 'camera.lensMm', input.camera.lensMm, {min: 8, max: 400});
    checkNumber(issues, 'camera.shake', input.camera.shake, {min: 0, max: 1});
    if (typeof input.camera.depthOfField !== 'boolean') issues.push({path: 'camera.depthOfField', message: 'must be a boolean'});
  }

  if (input.lighting !== undefined && checkObject(issues, 'lighting', input.lighting, ['mood', 'keyColor', 'fillColor', 'intensity'])) {
    checkEnum(issues, 'lighting.mood', input.lighting.mood, ['dark', 'neutral', 'bright'] as const);
    checkColor(issues, 'lighting.keyColor', input.lighting.keyColor);
    if (input.lighting.fillColor !== undefined) checkColor(issues, 'lighting.fillColor', input.lighting.fillColor);
    checkNumber(issues, 'lighting.intensity', input.lighting.intensity, {min: 0, max: 10});
  }

  if (input.platforms !== undefined && checkObject(issues, 'platforms', input.platforms, PLATFORM_IDS)) {
    for (const [platform, override] of Object.entries(input.platforms)) {
      checkPlatformOverride(issues, `platforms.${platform}`, override);
    }
  }

  if (input.extensions !== undefined && !isRecord(input.extensions)) {
    issues.push({path: 'extensions', message: 'must be an object'});
  }

  return finish<StyleProfile>(issues, warnings, input);
};

/** Builds a registry in order, so later profiles may extend earlier ones. */
export const createStyleRegistry = (profiles: readonly unknown[]) => {
  const registry = new Map<string, StyleProfile>();
  const issues: Issue[] = [];
  profiles.forEach((raw, index) => {
    const result = validateStyleProfile(raw, registry);
    if (!result.ok) {
      issues.push(...result.issues.map((issue) => ({path: `profiles[${index}].${issue.path}`, message: issue.message})));
    } else if (registry.has(result.value.id)) {
      issues.push({path: `profiles[${index}].id`, message: `duplicate profile id "${result.value.id}"`});
    } else {
      registry.set(result.value.id, result.value);
    }
  });
  return {registry: registry as StyleRegistry, issues};
};

/** Platform parameters for a profile: built-in defaults, then profile overrides. */
export const platformParams = (profile: StyleProfile, platform: PlatformId): PlatformParams => {
  const override = profile.platforms?.[platform] ?? {};
  const base = PLATFORM_DEFAULTS[platform];
  return {...base, ...override, safeArea: {...base.safeArea, ...override.safeArea}};
};

export const msToFrames = (ms: number, fps: number) => Math.round((ms * fps) / 1000);

// Mirrors the look of the existing public cybersecurity sample scenes.
export const HASKA_CYBER: StyleProfile = {
  schemaVersion: 1,
  id: 'haska-cyber',
  name: 'HASKA Cyber',
  description: 'Dark cybersecurity look used by the existing sample scenes: cyan/mint on near-black, restrained glow.',
  palette: {
    background: '#02060d',
    surface: '#082536',
    primary: '#53f6ff',
    accent: '#00ffc7',
    text: '#e9ffff',
    mutedText: '#8dbec7',
  },
  typography: {
    display: {family: 'IBM Plex Sans Arabic', fallbacks: ['Arial', 'sans-serif'], weight: 700, tracking: -0.02},
    body: {family: 'IBM Plex Sans Arabic', fallbacks: ['Arial', 'sans-serif'], weight: 400},
    mono: {family: 'IBM Plex Sans Arabic', fallbacks: ['monospace'], weight: 500, tracking: 0.18},
    // Bundled OFL font: identical, deterministic Arabic/Latin coverage on Linux and Windows.
    arabic: {family: 'IBM Plex Sans Arabic', fallbacks: ['Arial', 'sans-serif'], weight: 700},
  },
  motion: {
    personality: 'premium',
    easings: {
      enter: [0.16, 1, 0.3, 1],
      exit: [0.7, 0, 0.84, 0],
      standard: [0.65, 0, 0.35, 1],
    },
    durationsMs: {quick: 250, standard: 600, slow: 1200},
    transitions: {
      scene: {type: 'camera-pull', durationMs: 1500, easing: 'standard'},
      section: {type: 'crossfade', durationMs: 500, easing: 'standard'},
      reveal: {type: 'wipe', durationMs: 800, easing: 'enter'},
    },
  },
  camera: {movement: 'push', shake: 0, depthOfField: false},
  lighting: {mood: 'dark', keyColor: '#53f6ff', intensity: 1},
};

/** Matches the original Audio-to-Motion explainer colors, so existing audio projects look unchanged. */
export const HASKA_SIGNAL: StyleProfile = {
  ...HASKA_CYBER,
  id: 'haska-signal',
  name: 'HASKA Signal',
  description: 'Original Audio-to-Motion explainer look: mint on near-black. Default for audio projects.',
  palette: {background: '#03070c', surface: '#071920', primary: '#7fffe3', accent: '#63ffe0', text: '#efffff', mutedText: '#8ca4aa'},
  motion: {...HASKA_CYBER.motion, personality: 'corporate'},
};

/** Dark navy with cyan structure and orange emphasis for high-contrast technical stories. */
export const HASKA_ORANGE_TECH: StyleProfile = {
  ...HASKA_CYBER,
  id: 'haska-orange-tech',
  name: 'HASKA Orange Tech',
  description: 'Deep navy background, cyan structure, orange emphasis. Cinematic dark-tech look for vertical social video.',
  palette: {background: '#040a18', surface: '#0a1f44', primary: '#22d3ee', accent: '#ff7a1a', text: '#f4f8ff', mutedText: '#8fa8cc', secondary: '#1d4ed8', danger: '#ff3b5c'},
  // IBM Plex Sans Arabic (OFL, public/fonts): one family for Arabic and Latin keeps mixed lines visually even.
  typography: {
    display: {family: 'IBM Plex Sans Arabic', fallbacks: ['DejaVu Sans', 'Arial', 'sans-serif'], weight: 700, tracking: -0.01},
    body: {family: 'IBM Plex Sans Arabic', fallbacks: ['DejaVu Sans', 'Arial', 'sans-serif'], weight: 500},
    mono: {family: 'IBM Plex Sans Arabic', fallbacks: ['DejaVu Sans', 'sans-serif'], weight: 600, tracking: 0.04},
    arabic: {family: 'IBM Plex Sans Arabic', fallbacks: ['DejaVu Sans', 'sans-serif'], weight: 700},
  },
  motion: {
    personality: 'premium',
    easings: {enter: [0.22, 1, 0.36, 1], exit: [0.7, 0, 0.84, 0], standard: [0.65, 0, 0.35, 1]},
    durationsMs: {quick: 280, standard: 650, slow: 1300},
    transitions: {
      scene: {type: 'camera-pull', durationMs: 520, easing: 'standard'},
      section: {type: 'crossfade', durationMs: 400, easing: 'standard'},
      reveal: {type: 'wipe', durationMs: 700, easing: 'enter'},
    },
  },
  lighting: {mood: 'dark', keyColor: '#ff7a1a', fillColor: '#22d3ee', intensity: 1.2},
  // Instagram Reels: profile/title bar on top, caption + audio row at the bottom, action column on the right.
  platforms: {reel: {safeArea: {top: 250, right: 80, bottom: 400, left: 80}, titleScale: 0.85}},
};

export const BUILTIN_STYLE_PROFILES: readonly StyleProfile[] = [HASKA_CYBER, HASKA_SIGNAL, HASKA_ORANGE_TECH];
