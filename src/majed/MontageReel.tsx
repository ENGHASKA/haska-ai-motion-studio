import {AbsoluteFill, Html5Audio, Html5Video, Sequence, staticFile, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {HASKA_ORANGE_TECH} from '../production/style-profile';
import {beatEnvelope, planMontage} from './montage';
import type {MontageClip} from './montage';

export type MontageReelProps = {
  clips: MontageClip[];
  /** Beat times in seconds (scripts/media_tools.py beats). */
  beats: number[];
  audioSrc?: string;
  everyBeats?: number;
  durationInFrames?: number;
};

export const calculateMontage: CalculateMetadataFunction<MontageReelProps> = ({props}) => ({
  durationInFrames: props.durationInFrames ?? Math.max(30, Math.round(((props.beats.at(-1) ?? 4) + 0.5) * 30)),
  fps: 30,
  width: 1080,
  height: 1920,
  defaultOutName: 'montage-reel.mp4',
});

const Cut: React.FC<{src: string; trimBefore: number; beatFrames: number[]; offset: number}> = ({src, trimBefore, beatFrames, offset}) => {
  const frame = useCurrentFrame();
  const pulse = beatEnvelope(frame + offset, beatFrames, 8);
  const scale = interpolate(pulse, [0, 1], [1, 1.07]);
  return (
    <AbsoluteFill style={{transform: `scale(${scale})`}}>
      <Html5Video src={staticFile(src)} trimBefore={trimBefore} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      <AbsoluteFill style={{background: HASKA_ORANGE_TECH.palette.primary, opacity: pulse * 0.12}} />
    </AbsoluteFill>
  );
};

/** Rhythm montage: cuts land on beat frames and a decaying punch-in marks each beat. All motion derives from the frame. */
export const MontageReel: React.FC<MontageReelProps> = ({clips, beats, audioSrc, everyBeats = 2}) => {
  const {fps, durationInFrames} = useVideoConfig();
  const cuts = clips.length ? planMontage(clips, {fps, beats, everyBeats, durationInFrames}) : [];
  const beatFrames = beats.map((t) => Math.round(t * fps));
  return (
    <AbsoluteFill style={{background: HASKA_ORANGE_TECH.palette.background}}>
      {cuts.map((cut) => (
        <Sequence key={cut.index} from={cut.from} durationInFrames={cut.durationInFrames} premountFor={fps}>
          <Cut src={cut.src} trimBefore={cut.trimBefore} beatFrames={beatFrames} offset={cut.from} />
        </Sequence>
      ))}
      {audioSrc ? <Html5Audio src={staticFile(audioSrc)} /> : null}
    </AbsoluteFill>
  );
};
