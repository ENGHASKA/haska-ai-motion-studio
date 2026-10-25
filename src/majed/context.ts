// Builds the `ctx` object the Majed motion moves (FX.<id>(ctx, t, o)) expect, on top of Remotion's frame clock.
// The helpers come from the generated engine-core.js; media helpers (video frame, person matte, loudness) are supplied by the caller.
import '../../third_party/majed-video/motion/moves.js';
import {createEngineCore} from './engine-core.js';

export type MovePalette = {bg: string; ink: string; acc: string; clay: string; hi: string; mut: string};
export type MoveLine = {text: string; start: number; end: number; words: Array<{w: string; s: number; e: number}>};
export type MoveMedia = {
  /** Current frame of the speaker video (drawn cover-fit, face-anchored like upstream MV.video). */
  video?: CanvasImageSource | null;
  /** Current frame of the person matte (RGBA cut-out). Absent -> moves use their fallback. */
  person?: CanvasImageSource | null;
  /** Voice loudness 0..1 by time in seconds. */
  env?: (t: number) => number;
  face?: (t: number) => {x: number; y: number; w: number; h: number; mx: number; my: number} | null;
  palm?: (t: number) => {x: number; y: number; c?: number} | null;
};

export type MoveContextInput = {
  palette: MovePalette;
  fps: number;
  bpm?: number;
  beats?: number[];
  lines?: Record<string, MoveLine>;
  fonts?: Record<string, string>;
  media?: MoveMedia;
};

type AnyRecord = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const sourceSize = (image: CanvasImageSource) => {
  const any = image as AnyRecord;
  return {w: any.videoWidth || any.naturalWidth || any.displayWidth || any.width || 1, h: any.videoHeight || any.naturalHeight || any.displayHeight || any.height || 1};
};

/** Cover-fit `image` into rect R, vertically anchored toward the top (upstream FACE_ANCH = 0.3). */
const drawCover = (Y: CanvasRenderingContext2D, image: CanvasImageSource, R: {x: number; y: number; w: number; h: number}, anchor = 0.3) => {
  const {w: sw, h: sh} = sourceSize(image);
  const scale = Math.max(R.w / sw, R.h / sh);
  const cw = R.w / scale;
  const ch = R.h / scale;
  Y.drawImage(image, (sw - cw) / 2, (sh - ch) * anchor, cw, ch, R.x, R.y, R.w, R.h);
};

export const createMoveContext = (input: MoveContextInput) => {
  const bpm = input.bpm ?? 120;
  const state = {P: input.palette, fps: input.fps, spb: 60 / bpm, bpb: 4, bpm, beats: input.beats ?? Array.from({length: 600}, (_, i) => i * (60 / bpm)), bars: [] as number[], tl: {sections: []}, vo: {} as AnyRecord, voList: [] as AnyRecord[]};
  for (const [id, line] of Object.entries(input.lines ?? {})) state.vo[id] = line;
  state.voList = Object.values(state.vo);
  const core = createEngineCore(state);
  if (input.fonts) core.setFamilies(input.fonts);

  let canvas: CanvasRenderingContext2D | null = null;
  const media = input.media ?? {};
  const usage = {video: false, person: false};
  const full = {x: 0, y: 0, w: 1080, h: 1920};

  const video = (Y: CanvasRenderingContext2D, R = full) => {
    if (!media.video) {
      // No footage supplied: a recognisable placeholder so transitions and cards still read in previews.
      const gradient = Y.createLinearGradient(R.x, R.y, R.x + R.w, R.y + R.h);
      gradient.addColorStop(0, '#2b3a55');
      gradient.addColorStop(1, '#0f1626');
      Y.fillStyle = gradient;
      Y.fillRect(R.x, R.y, R.w, R.h);
      return false;
    }
    drawCover(Y, media.video, R);
    usage.video = true;
    return true;
  };
  const person = Object.assign(
    (Y: CanvasRenderingContext2D, R = full) => {
      if (!media.person) return false;
      drawCover(Y, media.person, R);
      usage.person = true;
      return true;
    },
    {ok: () => Boolean(media.person)},
  );
  const fonts = (typeof document !== 'undefined' && document.fonts) || null;
  const needFont = (family: string) => Boolean(fonts && [...(fonts as unknown as Iterable<FontFace>)].some((face) => face.family.replace(/["']/g, '') === family && face.status === 'loaded'));

  const ctx: AnyRecord = {
    get X() {
      return canvas;
    },
    W: 1080,
    H: 1920,
    fps: input.fps,
    get P() {
      return state.P;
    },
    get palette() {
      return state.P;
    },
    ...core,
    ease: core.E,
    at: (lt: number, a: number, b: number, ez: string | ((k: number) => number) = 'cubicOut') => (typeof ez === 'function' ? ez : core.E[ez])(core.prog(lt, a, b)),
    resetTransform: (Y?: CanvasRenderingContext2D) => (Y ?? canvas)?.setTransform(1, 0, 0, 1, 0, 0),
    bpm: state.bpm,
    spb: state.spb,
    beats: state.beats,
    vo: state.vo,
    font: core.fontStr,
    F: core.fontStr,
    text: Object.assign((Y: CanvasRenderingContext2D, s: string, x: number, y: number, o?: AnyRecord) => core.text(Y, s, x, y, o), {
      draw: core.text,
      layout: core.layout,
      drawLayout: core.drawLayout,
      kashida: core.kashida,
      drawKashida: core.drawKashida,
      fit: core.fit,
      typeSub: core.typeSub,
      westernDigits: core.westernDigits,
      visualOrder: core.visualOrder,
    }),
    num: (v: number, d = 0) => core.westernDigits(Number(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d})),
    video,
    person,
    needFont,
    env: (t: number) => media.env?.(t) ?? 0,
    faceAt: (t: number) => media.face?.(t) ?? null,
    palmAt: (t: number) => media.palm?.(t) ?? null,
    get FX() {
      return (globalThis as AnyRecord).FX;
    },
    get STYLES() {
      return (globalThis as AnyRecord).STYLES;
    },
    S: null,
  };

  return {
    ctx,
    core,
    usage,
    setCanvas: (context: CanvasRenderingContext2D | null) => {
      canvas = context;
    },
  };
};

export const hasMove = (id: string) => typeof (globalThis as AnyRecord).FX?.[id] === 'function';
export const runMove = (ctx: AnyRecord, id: string, t: number, options: AnyRecord) => (globalThis as AnyRecord).FX[id](ctx, t, options);
