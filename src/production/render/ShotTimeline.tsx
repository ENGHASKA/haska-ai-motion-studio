import {useMemo} from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {useProduction} from '../../motion';
import {easingOf} from '../../motion/style';
import {planTimeline, transitionStyles, windowProgress} from '../../motion/transitions';
import type {PlannedShot} from '../../motion/transitions';
import type {Asset} from '../asset-catalog';
import type {ShotGraph} from '../shot-graph';
import {ErrorShot, isTimeAlignedShot, routeShot} from './shots';
import type {ShotProps} from './types';

const ShotFrame: React.FC<{item: PlannedShot; props: ShotProps}> = ({item, props}) => {
  const frame = useCurrentFrame();
  const {style} = useProduction();
  const route = routeShot(item.shot);

  let transition: React.CSSProperties = {};
  if (item.transitionOut) {
    const {type, startLocal, durationFrames, easing} = item.transitionOut;
    if (frame >= startLocal) transition = transitionStyles(type, easingOf(style, easing)(windowProgress(frame, startLocal, durationFrames))).outgoing;
  }
  if (item.transitionIn && frame < item.transitionIn.durationFrames) {
    const {type, durationFrames, easing} = item.transitionIn;
    transition = transitionStyles(type, easingOf(style, easing)(windowProgress(frame, 0, durationFrames))).incoming;
  }

  const Component = route.entry?.component;
  return (
    <AbsoluteFill style={transition}>
      {Component ? <Component {...props} /> : <ErrorShot shot={item.shot} message={route.error ?? 'Unroutable shot.'} />}
    </AbsoluteFill>
  );
};

/** Renders every shot of a graph on the master timeline, layered by track, with planned transitions. */
export const ShotTimeline: React.FC<{graph: ShotGraph; assets: ReadonlyMap<string, Asset>}> = ({graph, assets}) => {
  const plan = useMemo(() => planTimeline(graph, {isTimeAligned: isTimeAlignedShot}), [graph]);
  const order = useMemo(() => graph.shots.filter((shot) => shot.track === 0).sort((a, b) => a.startFrame - b.startFrame).map((shot) => shot.id), [graph]);
  return (
    <>
      {plan.map((item) => (
        <Sequence key={item.shot.id} name={`${item.shot.id}${item.shot.title ? `: ${item.shot.title}` : ''}`} from={item.from} durationInFrames={item.mountFrames} layout="none">
          <ShotFrame item={item} props={{shot: item.shot, graph, index: Math.max(0, order.indexOf(item.shot.id)), assets}} />
        </Sequence>
      ))}
    </>
  );
};
