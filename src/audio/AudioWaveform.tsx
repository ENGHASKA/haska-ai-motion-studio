import {useWindowedAudioData, visualizeAudioWaveform} from '@remotion/media-utils';
import {staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

export const AudioWaveform: React.FC<{src: string}> = ({src}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {audioData, dataOffsetInSeconds} = useWindowedAudioData({
    src: staticFile(src),
    frame,
    fps,
    windowInSeconds: 12,
  });

  if (!audioData) return null;

  const values = visualizeAudioWaveform({
    fps,
    frame,
    audioData,
    numberOfSamples: 64,
    windowInSeconds: 0.7,
    dataOffsetInSeconds,
  });

  return (
    <div className="audio-waveform" aria-hidden="true">
      {values.map((value, index) => (
        <i key={index} style={{height: `${Math.max(8, Math.abs(value) * 100)}%`}} />
      ))}
    </div>
  );
};
