import {AbsoluteFill} from 'remotion';
import {FontGate} from '../typography/FontGate';
import {MOVE_FONT_FAMILIES} from '../typography/fonts';
import {HASKA_ORANGE_TECH} from '../production/style-profile';
import {moveById} from './catalog';
import {MoveCanvas} from './MoveCanvas';
import type {MoveDrawInfo} from './MoveCanvas';
import {demoOptions} from './demo-options';
import {movePaletteFor} from './palette';

export type MoveShowcaseProps = {move: string; /** Fixed sample time in seconds; omit to follow the clock. */ time?: number | null; report?: boolean};

const palette = movePaletteFor(HASKA_ORANGE_TECH);

/** Plays one catalog move on the HASKA palette. With `report`, logs a machine-readable result line for test harnesses. */
export const MoveShowcase: React.FC<MoveShowcaseProps> = ({move, time, report}) => {
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
        <MoveCanvas move={move} palette={palette} background time={time ?? undefined} options={entry ? demoOptions(entry) : {}} onDrawn={onDrawn} />
      </AbsoluteFill>
    </FontGate>
  );
};
