import {AbsoluteFill, staticFile} from 'remotion';
import {HASKA_ORANGE_TECH} from '../production/style-profile';
import {FontGate} from '../typography/FontGate';
import {MOVE_FONT_FAMILIES} from '../typography/fonts';
import {moveById} from './catalog';
import type {MoveDrawInfo} from './MoveCanvas';
import {demoOptions} from './demo-options';
import {movePaletteFor} from './palette';
import {VideoMoveLayer} from './VideoMoveLayer';

const palette = movePaletteFor(HASKA_ORANGE_TECH);
// In footage mode the scene behind a move is the footage itself, not the stand-in drawing.
const withoutScene = ({draw: _draw, back: _back, front: _front, ...rest}: Record<string, unknown>) => rest;

export type MoveVideoShowcaseProps = {src: string; move: string; time?: number | null; report?: boolean};

/** A move that composites real footage (public/<src>), e.g. transitions between the video and a panel. */
export const MoveVideoShowcase: React.FC<MoveVideoShowcaseProps> = ({src, move, time, report}) => {
  const entry = moveById(move);
  const onDrawn = report
    ? (info: MoveDrawInfo) => {
        // eslint-disable-next-line no-console
        console.log(`[move-result] ${JSON.stringify(info)}`);
      }
    : undefined;
  return (
    <FontGate families={MOVE_FONT_FAMILIES}>
      <AbsoluteFill style={{background: palette.bg}}>
        <VideoMoveLayer src={staticFile(src)} move={move} palette={palette} background startFromSeconds={time ?? 0} time={time ?? undefined} options={entry ? withoutScene(demoOptions(entry)) : {}} onDrawn={onDrawn} />
      </AbsoluteFill>
    </FontGate>
  );
};
