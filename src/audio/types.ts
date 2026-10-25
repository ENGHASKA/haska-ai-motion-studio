import type {Caption} from '@remotion/captions';

export type AudioPreset = 'youtube' | 'reel' | 'tiktok';
export type LanguageCode = 'ar' | 'en' | 'auto';

export type TimedWord = Caption;

export type TranscriptSegment = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words: TimedWord[];
  confidence: number | null;
};

export type Transcript = {
  schemaVersion: 1;
  language: string;
  direction: 'rtl' | 'ltr';
  durationMs: number;
  corrected: boolean;
  segments: TranscriptSegment[];
};

export type VisualKind =
  | 'editorial'
  | 'network'
  | 'signal'
  | 'shield'
  | 'process'
  | 'reciprocity'
  | 'metric';

export type StoryboardScene = {
  id: string;
  startMs: number;
  endMs: number;
  narration: string;
  onScreenText: string;
  visualKind: VisualKind;
  animation: string;
  visualAssetRequirements: string[];
  semanticRationale: string;
  status: 'draft' | 'reviewed';
  /** Optional: name of a registered shot component (e.g. "reel-intro"); omitted = built-in visualKind scene. */
  composition?: string;
  engine?: 'remotion' | 'three';
  /** Scene-specific settings handed to the component (cues in seconds, labels, modes). */
  options?: Record<string, unknown>;
  /** Optional blend with the previous scene. */
  transitionIn?: {type: 'cut' | 'crossfade' | 'push' | 'wipe' | 'camera-pull' | 'zoom-through' | 'match-cut'; durationMs: number; easing?: string};
};

export type Storyboard = {
  schemaVersion: 1;
  title: string;
  language: string;
  durationMs: number;
  scenes: StoryboardScene[];
};

export type AudioProject = {
  schemaVersion: 1;
  id: string;
  title: string;
  language: string;
  direction: 'rtl' | 'ltr';
  audioFile: string;
  durationMs: number;
  fps: number;
  displayWaveform: boolean;
  /** Show the small project label in the corner (default true). */
  showLabel?: boolean;
  /** Gain applied to the original narration (headroom only; the recording itself is never altered). */
  narrationVolume?: number;
  /** Extra audio stems (music, effects) played alongside the narration, paths relative to public/. */
  soundtrack?: Array<{name: string; file: string; volume: number}>;
  /** Optional id of a built-in Style Profile; defaults to haska-signal (the original look). */
  styleProfileId?: string;
  transcript: Transcript;
  storyboard: Storyboard;
};

export type AudioExplainerProps = {
  project: AudioProject;
  preset: AudioPreset;
};
