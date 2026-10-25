import type {CalculateMetadataFunction} from 'remotion';
import {durationFramesFor} from '../production/timing';
import type {AudioExplainerProps} from './types';

const dimensions = {
  youtube: {width: 1920, height: 1080},
  reel: {width: 1080, height: 1920},
  tiktok: {width: 1080, height: 1920},
} as const;

export const calculateAudioMetadata: CalculateMetadataFunction<AudioExplainerProps> = ({props}) => {
  const size = dimensions[props.preset];
  const fps = props.project.fps || 30;

  return {
    ...size,
    fps,
    durationInFrames: durationFramesFor(props.project.durationMs, fps),
    defaultOutName: `${props.project.id}-${props.preset}.mp4`,
    defaultCodec: 'h264',
  };
};
