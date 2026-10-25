import {AbsoluteFill, Html5Video, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {CaptionOverlay} from '../audio/CaptionOverlay';
import type {Transcript} from '../audio/types';
import {ProductionProvider} from '../motion';
import {paletteVariables} from '../motion/style';
import {BUILTIN_STYLE_PROFILES, HASKA_ORANGE_TECH} from '../production/style-profile';
import {FontGate} from '../typography/FontGate';
import {placeSpans, totalFrames} from './timeline';
import type {KeepSpan} from './timeline';

export type TalkingHeadReelProps = {
  /** Footage under public/ (e.g. "my-project/take1.mp4"). Empty shows a labelled placeholder instead of failing. */
  src: string;
  /** Source-time spans to keep (scripts/media_tools.py silence / textcut). Back to back on the edited timeline. */
  keep: KeepSpan[];
  /** Captions already retimed to the edited timeline (media_tools.py captions). */
  transcript?: Transcript;
  styleId?: string;
  language?: string;
  showProgress?: boolean;
};

export const calculateTalkingHead: CalculateMetadataFunction<TalkingHeadReelProps> = ({props}) => ({
  durationInFrames: Math.max(1, totalFrames(props.keep, 30)),
  fps: 30,
  width: 1080,
  height: 1920,
  defaultOutName: 'talking-head-reel.mp4',
});

const Progress: React.FC<{color: string}> = ({color}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, width} = useVideoConfig();
  return <div style={{position: 'absolute', left: 0, bottom: 0, height: 8, width: (width * frame) / Math.max(1, durationInFrames - 1), background: color}} />;
};

/** Talking-head Reel: cut footage (silence / text cuts) with synchronized word captions, on the shared frame clock. */
export const TalkingHeadReel: React.FC<TalkingHeadReelProps> = ({src, keep, transcript, styleId = 'haska-orange-tech', language = 'ar', showProgress = true}) => {
  const {fps} = useVideoConfig();
  const style = BUILTIN_STYLE_PROFILES.find((profile) => profile.id === styleId) ?? HASKA_ORANGE_TECH;
  const placed = placeSpans(keep, fps);
  return (
    <ProductionProvider style={style} platformId="reel" language={language}>
      <FontGate>
        <AbsoluteFill style={{...(paletteVariables(style) as React.CSSProperties), background: style.palette.background}}>
          {placed.map((span, index) => (
            <Sequence key={index} from={span.from} durationInFrames={span.durationInFrames} premountFor={fps}>
              {src ? (
                <Html5Video src={staticFile(src)} trimBefore={span.trimBefore} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
              ) : (
                <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', color: style.palette.mutedText, fontSize: 44, fontFamily: 'sans-serif'}}>
                  <span dir="auto">put the footage under public/ and set props.src</span>
                </AbsoluteFill>
              )}
            </Sequence>
          ))}
          {transcript ? <CaptionOverlay transcript={transcript} /> : null}
          {showProgress ? <Progress color={style.palette.primary} /> : null}
        </AbsoluteFill>
      </FontGate>
    </ProductionProvider>
  );
};
