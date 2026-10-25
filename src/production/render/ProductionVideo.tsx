import {Audio} from '@remotion/media';
import {useMemo} from 'react';
import type {CalculateMetadataFunction} from 'remotion';
import {AbsoluteFill, Sequence, staticFile} from 'remotion';
import {ProductionProvider} from '../../motion';
import {FontGate} from '../../typography/FontGate';
import {ShotTimeline} from './ShotTimeline';
import type {ProductionVideoProps} from './types';

/** Served files live under public/; anything else cannot be previewed or rendered. */
export const publicUrl = (path: string) => {
  if (!path.startsWith('public/')) throw new Error(`Asset path "${path}" is outside public/, which is the only folder Remotion serves.`);
  return staticFile(path.slice('public/'.length));
};

export const calculateProductionMetadata: CalculateMetadataFunction<ProductionVideoProps> = ({props}) => ({
  width: props.graph.width,
  height: props.graph.height,
  fps: props.graph.fps,
  durationInFrames: props.graph.durationFrames,
  defaultOutName: `${props.graph.id}.mp4`,
  defaultCodec: 'h264',
});

/** Master composition: a ShotGraph + Style Profile rendered on one Remotion timeline. */
export const ProductionVideo: React.FC<ProductionVideoProps> = ({graph, style, assets}) => {
  const byId = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  return (
    <ProductionProvider style={style} language={graph.language}>
      <FontGate>
      <AbsoluteFill style={{background: style.palette.background}}>
        {(graph.audio ?? []).map((track, index) => {
          const asset = byId.get(track.assetId);
          if (!asset) throw new Error(`Audio asset "${track.assetId}" is not in the supplied catalog entries.`);
          return (
            <Sequence key={`${track.assetId}-${index}`} from={track.startFrame} layout="none">
              <Audio name={asset.title ?? asset.id} src={publicUrl(asset.path)} volume={track.volume} />
            </Sequence>
          );
        })}
        <ShotTimeline graph={graph} assets={byId} />
      </AbsoluteFill>
      </FontGate>
    </ProductionProvider>
  );
};
