import {forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {createMoveContext, hasMove, runMove} from './context';
import type {MoveLine, MoveMedia, MovePalette} from './context';

export type MoveDrawInfo = {move: string; t: number; ok: boolean; error?: string; coverage: number; usedVideo?: boolean; usedPerson?: boolean};
export type MoveCanvasHandle = {draw: () => void};

type MoveCanvasProps = {
  /** FX id from the move catalog, e.g. "caption" or "inkFade". */
  move: string;
  /** Parameters passed to the move (`o` in upstream). `s` is the move's start time in seconds. */
  options?: Record<string, unknown>;
  palette: MovePalette;
  lines?: Record<string, MoveLine>;
  media?: MoveMedia;
  fonts?: Record<string, string>;
  /** Paint the palette background first (galleries); leave off to overlay on video. */
  background?: boolean;
  /** Fixed time in seconds instead of the Remotion clock (smoke tests). */
  time?: number;
  /** Receives a drawing report (used by tests; computing coverage costs a little). */
  onDrawn?: (info: MoveDrawInfo) => void;
  style?: React.CSSProperties;
  /** Do not draw automatically; the owner calls the handle's draw() when its media is ready. */
  manual?: boolean;
};

const coverageOf = (X: CanvasRenderingContext2D, background: boolean, bg: string) => {
  const {width, height} = X.canvas;
  const image = X.getImageData(0, 0, width, height).data;
  const [br, bgc, bb] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  let changed = 0;
  let sampled = 0;
  for (let i = 0; i < image.length; i += 4 * 97) {
    sampled += 1;
    const differs = background ? Math.abs(image[i] - br) + Math.abs(image[i + 1] - bgc) + Math.abs(image[i + 2] - bb) > 24 : image[i + 3] > 8;
    if (differs) changed += 1;
  }
  return changed / Math.max(1, sampled);
};

/**
 * Runs one of the 100 Majed motion moves as a deterministic layer. Each frame the canvas is cleared and the move is drawn
 * from time alone (the same contract the upstream engine documents), so preview and render are identical.
 */
export const MoveCanvas = forwardRef<MoveCanvasHandle, MoveCanvasProps>(({move, options, palette, lines, media, fonts, background = false, time, onDrawn, style, manual = false}, handle) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const kit = useMemo(() => createMoveContext({palette, fps, lines, media, fonts}), [palette, fps, lines, media, fonts]);
  const t = time ?? frame / fps;

  const draw = useCallback(() => {
    const element = canvas.current;
    const X = element?.getContext('2d', {willReadFrequently: Boolean(onDrawn)});
    if (!element || !X) return;
    X.setTransform(1, 0, 0, 1, 0, 0);
    X.clearRect(0, 0, element.width, element.height);
    if (background) {
      X.fillStyle = palette.bg;
      X.fillRect(0, 0, element.width, element.height);
    }
    kit.setCanvas(X);
    let error: string | undefined;
    X.save();
    try {
      if (!hasMove(move)) throw new Error(`no drawing function for "${move}" (rule entries are guidance, not renderable)`);
      runMove(kit.ctx, move, t, {s: 0, video: kit.ctx.video, draw: kit.ctx.video, A: kit.ctx.video, person: kit.ctx.person, ...options});
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      X.restore();
      X.save();
      X.fillStyle = 'rgba(180,20,40,0.9)';
      X.fillRect(40, 760, 1000, 160);
      X.fillStyle = '#fff';
      X.font = '700 34px sans-serif';
      X.fillText(`${move}: ${error}`.slice(0, 60), 60, 830);
    }
    X.restore();
    kit.setCanvas(null);
    const coverage = onDrawn ? coverageOf(X, background, palette.bg) : 0;
    onDrawn?.({move, t, ok: !error, error, coverage, usedVideo: kit.usage.video, usedPerson: kit.usage.person});
    kit.usage.video = false;
    kit.usage.person = false;
  }, [move, options, palette, background, kit, t, onDrawn]);

  useImperativeHandle(handle, () => ({draw}), [draw]);
  useLayoutEffect(() => {
    if (!manual) draw();
  });

  return <canvas ref={canvas} width={1080} height={1920} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', ...style}} />;
});
MoveCanvas.displayName = 'MoveCanvas';
