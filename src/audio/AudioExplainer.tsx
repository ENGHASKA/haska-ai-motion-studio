import {Audio} from '@remotion/media';
import {useMemo} from 'react';
import {AbsoluteFill, staticFile, useVideoConfig} from 'remotion';
import {ProductionProvider} from '../motion';
import {FontGate} from '../typography/FontGate';
import {paletteVariables} from '../motion/style';
import {ShotTimeline} from '../production/render/ShotTimeline';
import {storyboardToShotGraph} from '../production/shot-graph';
import {BUILTIN_STYLE_PROFILES, HASKA_SIGNAL} from '../production/style-profile';
import {AudioWaveform} from './AudioWaveform';
import {CaptionOverlay} from './CaptionOverlay';
import type {AudioExplainerProps} from './types';

const EPOCH = '1970-01-01T00:00:00Z';
const NO_ASSETS = new Map();

/**
 * Narrated explainer. Scene timing comes from the same ShotGraph + frame model as every other production,
 * so visuals, captions and narration share one clock (scenes are now contiguous: no 1-frame overlaps).
 */
export const AudioExplainer: React.FC<AudioExplainerProps> = ({project, preset}) => {
  const {fps, width, height} = useVideoConfig();
  const style = useMemo(() => BUILTIN_STYLE_PROFILES.find((profile) => profile.id === project.styleProfileId) ?? HASKA_SIGNAL, [project.styleProfileId]);
  const graph = useMemo(
    () => storyboardToShotGraph(project.storyboard, {id: project.id, timestamp: EPOCH, fps, width, height, styleProfileId: style.id}),
    [project.storyboard, project.id, fps, width, height, style.id],
  );

  return (
    <ProductionProvider style={style} platformId={preset} language={project.language}>
      <FontGate>
      <AbsoluteFill className={`audio-explainer audio-explainer--${preset}`} style={paletteVariables(style) as React.CSSProperties}>
        <Audio name="Original narration" src={staticFile(project.audioFile)} volume={project.narrationVolume ?? 1} />
        {(project.soundtrack ?? []).map((track) => (
          <Audio key={track.file} name={track.name} src={staticFile(track.file)} volume={track.volume} />
        ))}
        <div className="audio-grid" />
        <div className="audio-vignette" />
        <ShotTimeline graph={graph} assets={NO_ASSETS} />
        {project.displayWaveform ? <AudioWaveform src={project.audioFile} /> : null}
        <CaptionOverlay transcript={project.transcript} />
        {project.showLabel === false ? null : <div className="audio-project-label">{project.title} / {preset.toUpperCase()}</div>}
      </AbsoluteFill>
      </FontGate>
    </ProductionProvider>
  );
};
