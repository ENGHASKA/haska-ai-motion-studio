import type {Asset} from '../asset-catalog';
import type {Shot, ShotGraph} from '../shot-graph';
import type {StyleProfile} from '../style-profile';

/** Everything the ProductionVideo composition needs; plain JSON so `remotion render --props` can carry it. */
export type ProductionVideoProps = {
  graph: ShotGraph;
  style: StyleProfile;
  /** Catalog entries the graph uses (audio, blender scenes, textures). */
  assets: Asset[];
};

export type ShotProps = {
  shot: Shot;
  graph: ShotGraph;
  /** Index among the graph's track-0 shots. */
  index: number;
  assets: ReadonlyMap<string, Asset>;
};
