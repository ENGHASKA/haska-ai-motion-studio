import type {REEL_SCENES} from '../../routing';
import type {ShotProps} from '../types';
import {ReelCyber3D} from './Cyber3D';
import {ReelFinale} from './Finale';
import {ReelGlitch} from './Glitch';
import {ReelHuman} from './Human';
import {ReelIntro} from './Intro';
import {ReelNeural} from './Neural';
import {ReelQuestion} from './Question';
import {ReelSpread} from './Spread';
import {ReelTeam} from './Team';

/** The nine scenes of the personal Reel, keyed by the names in routing.ts (REEL_SCENES). */
export const REEL_COMPONENTS: Record<(typeof REEL_SCENES)[number], React.FC<ShotProps>> = {
  'reel-intro': ReelIntro,
  'reel-neural': ReelNeural,
  'reel-team': ReelTeam,
  'reel-cyber3d': ReelCyber3D,
  'reel-spread': ReelSpread,
  'reel-question': ReelQuestion,
  'reel-human': ReelHuman,
  'reel-glitch': ReelGlitch,
  'reel-finale': ReelFinale,
};
