import {useEffect, useMemo, useRef} from 'react';
import {Html5Video, cancelRender, continueRender, delayRender, useCurrentFrame, useVideoConfig} from 'remotion';
import {MoveCanvas} from './MoveCanvas';
import type {MoveCanvasHandle, MoveDrawInfo} from './MoveCanvas';
import type {MoveLine, MovePalette} from './context';

type Props = {
  /** Video URL (staticFile(...)). The element plays muted: audio is handled by the composition. */
  src: string;
  move: string;
  options?: Record<string, unknown>;
  palette: MovePalette;
  lines?: Record<string, MoveLine>;
  fonts?: Record<string, string>;
  /** Seconds into the file at which this layer's frame 0 sits (trim). */
  startFromSeconds?: number;
  background?: boolean;
  /** Fixed move time in seconds (smoke tests); otherwise the Remotion clock. */
  time?: number;
  onDrawn?: (info: MoveDrawInfo) => void;
};

/**
 * A move that composites real footage (`o.video`). In a render the layer holds the frame (delayRender) until the
 * <video> element has actually seeked to this frame, then draws the canvas once, so preview and render match.
 */
export const VideoMoveLayer: React.FC<Props> = ({src, move, options, palette, lines, fonts, startFromSeconds = 0, background = false, time, onDrawn}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<MoveCanvasHandle>(null);
  const ready = useRef(false);
  // Read lazily at draw time so the canvas never sees a stale element.
  const media = useMemo(
    () => ({
      get video() {
        return ready.current ? video.current : null;
      },
    }),
    [],
  );
  const target = startFromSeconds + frame / fps;

  useEffect(() => {
    const el = video.current;
    if (!el) return undefined;
    const handle = delayRender(`video frame for ${move} @${frame}`, {timeoutInMilliseconds: 30000});
    let cancelled = false;
    let spins = 0;
    ready.current = false;
    const settle = () => {
      if (cancelled) return;
      const near = Math.abs(el.currentTime - target) < 0.5 / fps + 0.001;
      if (el.readyState >= 2 && !el.seeking && near) {
        ready.current = true;
        canvas.current?.draw();
        continueRender(handle);
        return;
      }
      if (++spins > 600) {
        cancelRender(new Error(`video never reached ${target.toFixed(3)}s for move ${move}`));
        return;
      }
      requestAnimationFrame(settle);
    };
    settle();
    return () => {
      cancelled = true;
      continueRender(handle);
    };
  }, [frame, target, fps, move]);

  return (
    <>
      <Html5Video ref={video} src={src} muted startFrom={Math.round(startFromSeconds * fps)} style={{position: 'absolute', width: 2, height: 2, opacity: 0, pointerEvents: 'none'}} />
      <MoveCanvas ref={canvas} manual move={move} options={options} palette={palette} lines={lines} fonts={fonts} media={media} background={background} time={time} onDrawn={onDrawn} />
    </>
  );
};
