import movesCatalog from '../../third_party/majed-video/motion/moves/catalog.json';
import stylesCatalog from '../../third_party/majed-video/motion/styles/catalog.json';

export type MoveEntry = {
  n: number;
  id: string;
  cat: 'text' | 'transition' | 'camera' | 'card' | 'rule';
  name: string;
  sub: string;
  desc: string;
  role: string;
  energy: number;
  /** "required" means the move needs a person matte; "optional" means it has a fallback. */
  mask?: 'required' | 'optional';
  mac?: boolean;
  face?: boolean;
  hand?: boolean;
  manual?: boolean;
  fallback?: boolean;
  bonus?: boolean;
  source?: {label: string; url: string};
};

export type StyleEntry = {id: string; name: string; desc: string; families: string[]; cues: string[]; blend?: string[]; moment?: boolean; needsCut?: boolean};

export const MOVES = movesCatalog.moves as unknown as MoveEntry[];
export const MOVE_FAMILIES = movesCatalog.families as Record<string, string>;
export const UPSTREAM_STYLES = stylesCatalog.styles as unknown as StyleEntry[];

export const moveById = (id: string) => MOVES.find((move) => move.id === id);
