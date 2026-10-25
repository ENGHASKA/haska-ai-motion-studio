import {useEffect, useRef} from 'react';
import {AbsoluteFill, Html5Video, cancelRender, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ProductionProvider} from '../motion';
import {HASKA_ORANGE_TECH} from '../production/style-profile';
import {FontGate} from '../typography/FontGate';
import {KineticText} from '../motion/KineticText';

export type TextBehindSubjectProps = {
  /** Footage under public/. */
  src: string;
  /** Subject matte under public/ (white = subject, black = background), same framing/length as `src`.
   * Make one with `scripts/media_tools.py matte` (green screen) or supply a matte from any rotoscoping/segmentation tool. */
  matte: string;
  text: string;
  /** Frame at which the text starts arriving. */
  textStart?: number;
  /** Seconds into the footage at which this composition starts. */
  startFromSeconds?: number;
  language?: string;
};

const cover = (el: HTMLVideoElement, target: CanvasRenderingContext2D, w: number, h: number) => {
  const scale = Math.max(w / el.videoWidth, h / el.videoHeight);
  target.drawImage(el, (w - el.videoWidth * scale) / 2, (h - el.videoHeight * scale) / 2, el.videoWidth * scale, el.videoHeight * scale);
};

/**
 * Text between the background and the subject: footage, then the headline, then the subject cut out again on top.
 * Cut-out = footage pixels with alpha from the matte's luminance. Deterministic: the frame waits (delayRender) until both videos seek.
 */
const Stage: React.FC<TextBehindSubjectProps> = ({src, matte, text, textStart = 6, startFromSeconds = 0}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const base = useRef<HTMLVideoElement>(null);
  const mask = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = startFromSeconds + frame / fps;
  const configured = Boolean(src && matte);

  useEffect(() => {
    if (!configured) return undefined;
    const a = base.current;
    const b = mask.current;
    const c = canvas.current;
    if (!a || !b || !c) return undefined;
    const handle = delayRender(`subject cut-out @${frame}`, {timeoutInMilliseconds: 30000});
    let cancelled = false;
    let spins = 0;
    const ok = (el: HTMLVideoElement) => el.readyState >= 2 && !el.seeking && Math.abs(el.currentTime - target) < 0.5 / fps + 0.001;
    const settle = () => {
      if (cancelled) return;
      if (ok(a) && ok(b)) {
        const x = c.getContext('2d', {willReadFrequently: true});
        const scratch = document.createElement('canvas');
        scratch.width = width;
        scratch.height = height;
        const y = scratch.getContext('2d', {willReadFrequently: true});
        if (x && y) {
          x.clearRect(0, 0, width, height);
          cover(a, x, width, height);
          const pixels = x.getImageData(0, 0, width, height);
          y.clearRect(0, 0, width, height);
          cover(b, y, width, height);
          const alpha = y.getImageData(0, 0, width, height).data;
          for (let i = 0; i < pixels.data.length; i += 4) pixels.data[i + 3] = (alpha[i] * 0.2126 + alpha[i + 1] * 0.7152 + alpha[i + 2] * 0.0722) | 0;
          x.putImageData(pixels, 0, 0);
        }
        continueRender(handle);
        return;
      }
      if (++spins > 600) {
        cancelRender(new Error(`videos never reached ${target.toFixed(3)}s`));
        return;
      }
      requestAnimationFrame(settle);
    };
    settle();
    return () => {
      cancelled = true;
      continueRender(handle);
    };
  }, [configured, frame, target, fps, width, height]);

  if (!configured) {
    return (
      <AbsoluteFill style={{background: HASKA_ORANGE_TECH.palette.background, color: HASKA_ORANGE_TECH.palette.mutedText, alignItems: 'center', justifyContent: 'center', fontSize: 40, fontFamily: 'sans-serif'}}>
        set props.src (footage) and props.matte (subject matte) from public/
      </AbsoluteFill>
    );
  }
  const hidden = {position: 'absolute', width: 2, height: 2, opacity: 0, pointerEvents: 'none'} as const;
  const start = Math.round(startFromSeconds * fps);
  return (
    <AbsoluteFill style={{background: HASKA_ORANGE_TECH.palette.background}}>
          <Html5Video src={staticFile(src)} muted trimBefore={start} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
          <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: interpolate(frame, [textStart, textStart + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
            <KineticText text={text} role="display" start={textStart} maxWidth={width - 160} maxHeight={height * 0.45} fontSize={260} minFontSize={120} align="center" />
          </AbsoluteFill>
          <canvas ref={canvas} width={width} height={height} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
          <Html5Video ref={base} src={staticFile(src)} muted trimBefore={start} style={hidden} />
          <Html5Video ref={mask} src={staticFile(matte)} muted trimBefore={start} style={hidden} />
    </AbsoluteFill>
  );
};

/** FontGate mounts its children only once fonts are ready, so the stage (and its effect/refs) lives inside it. */
export const TextBehindSubject: React.FC<TextBehindSubjectProps> = (props) => (
  <ProductionProvider style={HASKA_ORANGE_TECH} platformId="reel" language={props.language ?? 'ar'}>
    <FontGate>
      <Stage {...props} />
    </FontGate>
  </ProductionProvider>
);
